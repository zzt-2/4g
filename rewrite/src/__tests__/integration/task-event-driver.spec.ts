/**
 * T013: Event driver condition trigger.
 *
 * Verifies that ScheduleDriver { kind: 'event', conditions } correctly drives
 * task execution on condition match, with cooldown and maxIterations enforcement.
 *
 * Verification points:
 * 1. First matching condition triggers task execution
 * 2. Non-matching condition does not trigger execution
 * 3. Cooldown suppresses rapid re-triggers within cooldownMs
 * 4. maxIterations limits total trigger count
 * 5. User can manually stop while waiting for condition
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type { TaskDefinition, ConditionMatchInput } from '@/features/task';

// ---------------------------------------------------------------------------
// Frame definitions
// ---------------------------------------------------------------------------

const sendFrame: FrameAsset = {
  id: 't013-send-frame',
  name: 'T013 Send Frame',
  direction: 'send',
  fields: [
    {
      id: 'cmd',
      name: 'Command',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x01',
    },
  ],
  identifierRules: [],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
};

const receiveFrame: FrameAsset = {
  id: 't013-recv-frame',
  name: 'T013 Receive Frame',
  direction: 'receive',
  fields: [
    {
      id: 'status',
      name: 'Status',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
    {
      id: 'counter',
      name: 'Counter',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
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
  features.frameService.upsertFrame(receiveFrame);
  return features;
}

async function connectAndGetTarget(features: RewriteWiredFeatures): Promise<string> {
  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: 't013-conn',
    host: '127.0.0.1',
    port: 9999,
  });
  expect(connectResult.ok).toBe(true);
  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);
  return targets[0]!.targetId;
}

function emitConditionMatch(
  features: RewriteWiredFeatures,
  frameId: string,
  fieldValues: Record<string, number | string | null>,
  sourceId?: string,
): void {
  const input: ConditionMatchInput = { frameId, fieldValues, sourceId };
  features.receiveEventSourceBridge.emit([input]);
}

function createEventTask(
  targetId: string,
  maxIterations?: number,
  cooldownMs?: number,
): TaskDefinition {
  return {
    id: 't013-event-task',
    name: 'T013 Event Task',
    schedule: {
      kind: 'event',
      conditions: [
        { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 1 },
      ],
      ...(cooldownMs !== undefined ? { cooldownMs } : {}),
    },
    steps: [
      {
        kind: 'send',
        id: 'step-1',
        name: 'Send on event',
        config: { frameId: sendFrame.id, targetId },
      },
    ],
    ...(maxIterations !== undefined
      ? { stopCondition: { maxIterations } }
      : {}),
    errorPolicy: { onStepError: 'stop' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T013: event driver condition trigger', () => {
  let features: RewriteWiredFeatures;

  beforeEach(async () => {
    features = setupFeatures();
  });

  it('first matching condition triggers execution and task completes', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createEventTask(targetId, 1);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 0 });

    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(1);
    expect(final!.stepResults[0]!.kind).toBe('send');
  });

  it('non-matching condition does not trigger execution', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createEventTask(targetId, 1);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    emitConditionMatch(features, receiveFrame.id, { status: 0, counter: 0 });

    await new Promise((r) => setTimeout(r, 20));

    const stillRunning = features.taskService.getInstance(instance.instanceId);
    expect(stillRunning?.lifecycle).toBe('running');
    expect(stillRunning!.stepResults.length).toBe(0);

    features.taskService.stopTask(instance.instanceId);
  });

  it('cooldown suppresses rapid re-triggers within cooldownMs', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createEventTask(targetId, 2, 200);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 0 });

    await new Promise((r) => setTimeout(r, 10));

    const afterFirst = features.taskService.getInstance(instance.instanceId);
    expect(afterFirst?.lifecycle).toBe('running');
    expect(afterFirst!.stepResults.length).toBe(1);

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 1 });

    await new Promise((r) => setTimeout(r, 10));

    const afterSecond = features.taskService.getInstance(instance.instanceId);
    expect(afterSecond!.stepResults.length).toBe(1);

    await new Promise((r) => setTimeout(r, 200));

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 2 });

    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(2);
  });

  it('maxIterations limits total trigger count', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createEventTask(targetId, 1);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 0 });

    await features.taskService.onSettled(instance.instanceId);

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 1 });
    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 2 });

    await new Promise((r) => setTimeout(r, 20));

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(1);
  });

  it('user can manually stop while waiting for condition', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createEventTask(targetId);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    const running = features.taskService.getInstance(instance.instanceId);
    expect(running?.lifecycle).toBe('running');
    expect(running!.stepResults.length).toBe(0);

    features.taskService.stopTask(instance.instanceId);

    const stopped = features.taskService.getInstance(instance.instanceId);
    expect(stopped?.lifecycle).toBe('stopped');
  });

  it('event task with multiple matching conditions uses AND logic by default', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef: TaskDefinition = {
      id: 't013-multi-cond',
      name: 'T013 Multi Condition',
      schedule: {
        kind: 'event',
        conditions: [
          { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 1 },
          { frameId: receiveFrame.id, fieldId: 'counter', operator: 'gt', threshold: 5 },
        ],
      },
      steps: [
        {
          kind: 'send',
          id: 'step-1',
          name: 'Send on event',
          config: { frameId: sendFrame.id, targetId },
        },
      ],
      stopCondition: { maxIterations: 1 },
      errorPolicy: { onStepError: 'stop' },
    };

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 3 });

    await new Promise((r) => setTimeout(r, 20));

    const partial = features.taskService.getInstance(instance.instanceId);
    expect(partial?.lifecycle).toBe('running');
    expect(partial!.stepResults.length).toBe(0);

    emitConditionMatch(features, receiveFrame.id, { status: 1, counter: 10 });

    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(1);
  });
});
