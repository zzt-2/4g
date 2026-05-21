/**
 * T024: Connection lifecycle state transition boundaries.
 * T024d: Connection disconnect -> active task auto-pause (known gap).
 *
 * T024 verifies connection service lifecycle state transitions,
 * duplicate connect handling, and disconnect edge cases.
 *
 * T024d documents a known gap: connection disconnect does NOT automatically
 * pause active tasks. The task only fails when it next tries to send.
 *
 * Verification points:
 * T024:
 * 1. Duplicate connect doesn't create duplicate runtime facts
 * 2. Disconnect on already disconnected doesn't throw
 * 3. Connection snapshot reflects correct lifecycle after connect/disconnect
 *
 * T024d:
 * 4. Known gap: disconnect does NOT auto-pause running tasks
 * 5. Task send fails after disconnect (target unavailable)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type { TaskDefinition, TaskLifecycleStatus } from '@/features/task';

const TERMINAL_STATES: TaskLifecycleStatus[] = ['completed', 'stopped', 'failed'];

async function pollUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 10));
  }
  if (!predicate()) throw new Error('pollUntil timeout');
}

// ---------------------------------------------------------------------------
// Frame definition
// ---------------------------------------------------------------------------

const sendFrame: FrameAsset = {
  id: 't024-send-frame',
  name: 'T024 Send Frame',
  direction: 'send',
  fields: [
    {
      id: 'payload',
      name: 'Payload',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
  ],
  identifierRules: [],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupFeatures(): RewriteWiredFeatures {
  const adapter = createFakeConnectionTransportAdapter();
  const features = wireFeatures({ connectionAdapter: adapter });
  features.frameService.upsertFrame(sendFrame);
  return features;
}

async function connectAndGetTarget(
  features: RewriteWiredFeatures,
  connectionId = 't024-conn',
): Promise<string> {
  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: connectionId,
    host: '127.0.0.1',
    port: 9999,
  });
  expect(connectResult.ok).toBe(true);

  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);
  return targets[0]!.targetId;
}

// ---------------------------------------------------------------------------
// T024: connection lifecycle state transition boundaries
// ---------------------------------------------------------------------------

describe('T024: connection lifecycle state transition boundaries', () => {
  let features: RewriteWiredFeatures;

  beforeEach(async () => {
    features = setupFeatures();
  });

  it('duplicate connect does not create duplicate runtime facts', async () => {
    const config = {
      kind: 'tcp-client' as const,
      id: 't024-dup-conn',
      host: '127.0.0.1',
      port: 9999,
    };

    // Connect first time
    const first = await features.connectionService.connect(config);
    expect(first.ok).toBe(true);

    const snapshotAfterFirst = features.connectionService.getSnapshot();
    const factsForConn = snapshotAfterFirst.runtimeFacts.filter(
      (f) => f.connectionId === config.id,
    );
    expect(factsForConn.length).toBe(1);

    // Connect again with same config
    const second = await features.connectionService.connect(config);
    expect(second.ok).toBe(true);

    const snapshotAfterSecond = features.connectionService.getSnapshot();
    const factsAfterDup = snapshotAfterSecond.runtimeFacts.filter(
      (f) => f.connectionId === config.id,
    );

    // Should still be exactly 1 runtime fact for this connectionId
    expect(factsAfterDup.length).toBe(1);
    expect(factsAfterDup[0]!.lifecycle).toBe('connected');

    // Snapshot configs should also have exactly 1 entry
    const configsForId = snapshotAfterSecond.configs.filter((c) => c.id === config.id);
    expect(configsForId.length).toBe(1);
  });

  it('disconnect on already disconnected does not throw', async () => {
    const connectionId = 't024-disconn';

    // Connect then disconnect
    await features.connectionService.connect({
      kind: 'tcp-client',
      id: connectionId,
      host: '127.0.0.1',
      port: 9999,
    });

    const disconnectResult = await features.connectionService.disconnect(connectionId);
    // Fake adapter should succeed
    expect(disconnectResult.ok).toBe(true);

    // Disconnect again on already disconnected connection — should not throw
    const secondDisconnect = await features.connectionService.disconnect(connectionId);
    // The service processes the disconnect-requested event but adapter may return
    // error for non-existent connection. Either way, no exception thrown.
    expect(secondDisconnect).toBeDefined();
  });

  it('connection snapshot reflects correct lifecycle after connect and disconnect', async () => {
    const connectionId = 't024-lifecycle';

    // Before connect: no runtime facts
    const beforeConnect = features.connectionService.getSnapshot();
    expect(beforeConnect.runtimeFacts.length).toBe(0);

    // Connect
    await features.connectionService.connect({
      kind: 'tcp-client',
      id: connectionId,
      host: '127.0.0.1',
      port: 9999,
    });

    const afterConnect = features.connectionService.getSnapshot();
    const connectedFact = afterConnect.runtimeFacts.find(
      (f) => f.connectionId === connectionId,
    );
    expect(connectedFact).toBeDefined();
    expect(connectedFact!.lifecycle).toBe('connected');

    // Disconnect
    await features.connectionService.disconnect(connectionId);

    const afterDisconnect = features.connectionService.getSnapshot();
    const disconnectedFact = afterDisconnect.runtimeFacts.find(
      (f) => f.connectionId === connectionId,
    );
    expect(disconnectedFact).toBeDefined();
    expect(disconnectedFact!.lifecycle).toBe('disconnected');
  });
});

// ---------------------------------------------------------------------------
// T024d: connection disconnect -> active task (known gap)
// ---------------------------------------------------------------------------

describe('T024d: disconnect does NOT auto-pause active tasks (known gap)', () => {
  let features: RewriteWiredFeatures;

  beforeEach(async () => {
    features = setupFeatures();
  });

  it('known gap: disconnect does NOT auto-pause running task', async () => {
    const connectionId = 't024d-gap';
    const targetId = await connectAndGetTarget(features, connectionId);

    // Task with delay (long) + send step
    const taskDef: TaskDefinition = {
      id: 't024d-gap-task',
      name: 'T024d Gap Task',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'delay',
          id: 'delay-1',
          name: 'Long delay',
          config: { durationMs: 200 },
        },
        {
          kind: 'send',
          id: 'send-1',
          name: 'Send after delay',
          config: {
            frameId: sendFrame.id,
            targetId,
          },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    // Verify task is running
    const runningInstance = features.taskService.getInstance(instance.instanceId);
    expect(runningInstance?.lifecycle).toBe('running');

    // Disconnect the connection while task is in its delay step
    await features.connectionService.disconnect(connectionId);

    // Check task state shortly after disconnect:
    // The task is NOT auto-paused (this is the known gap).
    // It continues running during its delay step because the delay
    // does not require the connection.
    await new Promise(r => setTimeout(r, 50));
    const instanceAfterDisconnect = features.taskService.getInstance(instance.instanceId);
    // Task should still be running (not paused, not stopped)
    expect(instanceAfterDisconnect?.lifecycle).toBe('running');

    // Wait for the task to finish: delay completes, then send fails
    // because target is no longer available.
    // Use pollUntil instead of onSettled because errorPolicy 'stop'
    // does not resolve the settle promise (known gap from T005).
    await pollUntil(() => {
      const i = features.taskService.getInstance(instance.instanceId);
      return !!i && TERMINAL_STATES.includes(i.lifecycle);
    });

    const finalInstance = features.taskService.getInstance(instance.instanceId);
    // The send step fails (target unavailable), errorPolicy 'stop' triggers
    expect(finalInstance?.lifecycle).toBe('stopped');
  });

  it('task send fails after disconnect', async () => {
    const connectionId = 't024d-fail';
    const targetId = await connectAndGetTarget(features, connectionId);

    // Task with immediate send step
    const taskDef: TaskDefinition = {
      id: 't024d-fail-task',
      name: 'T024d Fail Task',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 'send-1',
          name: 'Send frame',
          config: {
            frameId: sendFrame.id,
            targetId,
          },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    // Immediately disconnect before send can complete
    await features.connectionService.disconnect(connectionId);

    // Wait for task to reach terminal state.
    // Use pollUntil instead of onSettled because errorPolicy 'stop'
    // does not resolve the settle promise (known gap from T005).
    await pollUntil(() => {
      const i = features.taskService.getInstance(instance.instanceId);
      return !!i && TERMINAL_STATES.includes(i.lifecycle);
    });

    const finalInstance = features.taskService.getInstance(instance.instanceId);
    // Send fails because target is unavailable, errorPolicy triggers stop
    expect(finalInstance?.lifecycle).toBe('stopped');
  });
});
