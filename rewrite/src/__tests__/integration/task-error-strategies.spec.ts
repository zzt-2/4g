/**
 * T017: Task error strategies (retry / skip-step / stop / pause).
 * T024b: onTimeout vs errorPolicy two-layer interaction.
 *
 * Verifies that TaskErrorPolicy.onFailure drives correct lifecycle outcomes
 * and that WaitConditionConfig.onTimeout interacts with errorPolicy as a
 * first-layer gate before errorPolicy is consulted.
 *
 * Verification points:
 * 1. stop policy: send failure → task stopped
 * 2. pause policy: send failure → task paused
 * 3. skip-step policy: failed step skipped, remaining steps still execute
 * 4. retry exhausted: all retries fail → task failed
 * 5. retry succeeds: first call fails, retry succeeds → task completed
 * 6. onTimeout=continue: timeout does not trigger errorPolicy, task completes
 * 7. onTimeout=skip: step skipped with appliedPolicy, task completes
 * 8. onTimeout=fail: timeout triggers errorPolicy (stop)
 */
import { describe, it, expect } from 'vitest';
import { createTaskService } from '@/features/task';
import type { TaskDefinition } from '@/features/task';
import type { SendResult } from '@/features/send';
import { createFakeSendService, createFakeReceiveEventSource } from '@/features/task/adapters/test-exports';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSentResult(): SendResult {
  return {
    kind: 'sent',
    requestRef: { frameId: 'frame-1', targetId: 'target-1', context: { source: 'task' } },
    bytesBuilt: 10,
    bytesSent: 10,
    timestamp: '2026-05-20T12:00:00.000Z',
    buildIssues: [],
  };
}

function makeErrorResult(
  kind: SendResult['kind'] = 'transport-error',
): SendResult {
  return {
    kind,
    requestRef: { frameId: 'frame-1', targetId: 'target-1', context: { source: 'task' } },
    bytesBuilt: 0,
    bytesSent: 0,
    timestamp: '2026-05-20T12:00:00.000Z',
    error: { kind: 'mock-error', message: 'mock failure' },
    buildIssues: [],
  };
}

function isTerminal(lifecycle: string): boolean {
  return ['completed', 'stopped', 'failed'].includes(lifecycle);
}

async function settle(
  getInstance: (id: string) => { lifecycle: string } | undefined,
  instanceId: string,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inst = getInstance(instanceId);
    if (!inst || isTerminal(inst.lifecycle) || inst.lifecycle === 'paused') {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ---------------------------------------------------------------------------
// T017: error strategies
// ---------------------------------------------------------------------------

describe('T017: task error strategies', () => {
  it('stop policy: send fails → task stopped', async () => {
    const fakeSend = createFakeSendService({ results: [makeErrorResult()] });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't017-stop',
      name: 'T017 Stop',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 's1',
          name: 'Send',
          config: { frameId: 'f1', targetId: 'target-1', userFieldValues: {} },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('stopped');
  });

  it('pause policy: send fails → task paused', async () => {
    const fakeSend = createFakeSendService({ results: [makeErrorResult()] });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't017-pause',
      name: 'T017 Pause',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 's1',
          name: 'Send',
          config: { frameId: 'f1', targetId: 'target-1', userFieldValues: {} },
        },
      ],
      errorPolicy: { onFailure: 'pause' },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('paused');
  });

  it('skip-step policy: failed step skipped, remaining steps execute', async () => {
    // First send fails, second send succeeds
    const fakeSend = createFakeSendService({
      results: [makeErrorResult(), makeSentResult()],
    });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't017-skip',
      name: 'T017 Skip',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 's1',
          name: 'Bad Send',
          config: { frameId: 'f1', targetId: 'target-1', userFieldValues: {} },
        },
        {
          kind: 'delay',
          id: 's2',
          name: 'Delay',
          config: { durationMs: 10 },
        },
      ],
      errorPolicy: { onFailure: 'skip-step' },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');

    // First step should have appliedPolicy: 'skip-step'
    const failedStep = final!.stepResults.find((r) => r.stepIndex === 0);
    expect(failedStep?.appliedPolicy).toBe('skip-step');

    // Second step (delay) should have completed
    const delayStep = final!.stepResults.find(
      (r) => r.stepIndex === 1 && r.kind === 'delay',
    );
    expect(delayStep).toBeDefined();
  });

  it('retry policy: all retries exhausted → task failed', async () => {
    // All calls return errors (1 original + 2 retries = 3 calls needed)
    const fakeSend = createFakeSendService({
      results: Array.from({ length: 5 }, () => makeErrorResult()),
    });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't017-retry-fail',
      name: 'T017 Retry Fail',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 's1',
          name: 'Send',
          config: { frameId: 'f1', targetId: 'target-1', userFieldValues: {} },
        },
      ],
      errorPolicy: { onFailure: 'retry', retryCount: 2, retryDelayMs: 10 },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('failed');
    // 1 original + 2 retries = 3 total calls
    expect(fakeSend.calls.length).toBe(3);
  });

  it('retry policy: retry succeeds after initial failure', async () => {
    // First call fails, second (retry) succeeds
    const fakeSend = createFakeSendService({
      results: [makeErrorResult(), makeSentResult()],
    });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't017-retry-ok',
      name: 'T017 Retry OK',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 's1',
          name: 'Send',
          config: { frameId: 'f1', targetId: 'target-1', userFieldValues: {} },
        },
      ],
      errorPolicy: { onFailure: 'retry', retryCount: 2, retryDelayMs: 10 },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    // 1 original failure + 1 retry success = 2 calls
    expect(fakeSend.calls.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// T024b: onTimeout vs errorPolicy interaction
// ---------------------------------------------------------------------------

describe('T024b: onTimeout vs errorPolicy interaction', () => {
  it('onTimeout=continue: timeout does not trigger errorPolicy, task completes', async () => {
    const fakeSend = createFakeSendService({ results: [makeSentResult()] });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't024b-continue',
      name: 'T024b Continue',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'wait-condition',
          id: 'wc1',
          name: 'Wait',
          config: {
            conditions: [
              { frameId: 'f1', fieldId: 'x', operator: 'gt', threshold: 100 },
            ],
            timeoutMs: 50,
            onTimeout: 'continue',
          },
        },
        {
          kind: 'delay',
          id: 'd1',
          name: 'Delay',
          config: { durationMs: 10 },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    // onTimeout=continue: step completes normally, errorPolicy NOT invoked
    expect(final?.lifecycle).toBe('completed');

    // The wait-condition step should have timedOut: true but no appliedPolicy
    const wcResult = final!.stepResults.find((r) => r.kind === 'wait-condition');
    expect(wcResult).toBeDefined();
    if (wcResult && wcResult.kind === 'wait-condition') {
      expect(wcResult.timedOut).toBe(true);
      expect(wcResult.matched).toBe(false);
      expect(wcResult.appliedPolicy).toBeUndefined();
    }
  });

  it('onTimeout=skip: step skipped, no errorPolicy, task completes', async () => {
    const fakeSend = createFakeSendService({ results: [makeSentResult()] });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't024b-skip',
      name: 'T024b Skip',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'wait-condition',
          id: 'wc1',
          name: 'Wait',
          config: {
            conditions: [
              { frameId: 'f1', fieldId: 'x', operator: 'gt', threshold: 100 },
            ],
            timeoutMs: 50,
            onTimeout: 'skip',
          },
        },
        {
          kind: 'delay',
          id: 'd1',
          name: 'Delay',
          config: { durationMs: 10 },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');

    // The wait-condition step should have appliedPolicy: 'skip-step'
    const wcResult = final!.stepResults.find((r) => r.kind === 'wait-condition');
    expect(wcResult).toBeDefined();
    expect(wcResult?.appliedPolicy).toBe('skip-step');

    // The delay step after it should have executed
    const delayResult = final!.stepResults.find((r) => r.kind === 'delay');
    expect(delayResult).toBeDefined();
  });

  it('onTimeout=fail triggers errorPolicy (stop)', async () => {
    const fakeSend = createFakeSendService({ results: [makeSentResult()] });
    const fakeReceive = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeReceive,
    });

    const def: TaskDefinition = {
      id: 't024b-fail',
      name: 'T024b Fail',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'wait-condition',
          id: 'wc1',
          name: 'Wait',
          config: {
            conditions: [
              { frameId: 'f1', fieldId: 'x', operator: 'gt', threshold: 100 },
            ],
            timeoutMs: 50,
            onTimeout: 'fail',
          },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const instance = service.createTask(def);
    service.startTask(instance.instanceId);
    await settle((id) => service.getInstance(id), instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    // onTimeout=fail triggers errorPolicy.applyErrorPolicy → stop
    expect(final?.lifecycle).toBe('stopped');
  });
});
