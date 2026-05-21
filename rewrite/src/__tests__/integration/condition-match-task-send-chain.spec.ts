/**
 * T004: End-to-end condition matching → task → send chain.
 *
 * Verifies the complete lifecycle: receive outcome emitted through
 * ReceiveEventSourceBridge → task event driver condition registry processes
 * input → condition matches → waitForNext resolves → send step executes →
 * task reaches completed state.
 *
 * Verification points:
 * 1. Event-driven task triggers on condition match, send step executes
 * 2. Condition NOT matching keeps task running with no step results
 * 3. Multiple condition terms with AND logic must all match
 * 4. Task can be stopped while waiting for condition
 * 5. Task step results reflect send success after condition match
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type { TaskDefinition, ConditionTerm } from '@/features/task';

const receiveFrame: FrameAsset = {
  id: 't004-receive-frame',
  name: 'T004 Receive Frame',
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
      id: 'value',
      name: 'Value',
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

const sendFrame: FrameAsset = {
  id: 't004-send-frame',
  name: 'T004 Send Frame',
  direction: 'send',
  fields: [
    {
      id: 'command',
      name: 'Command',
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

function setupFeatures(): RewriteWiredFeatures {
  const adapter = createFakeConnectionTransportAdapter();
  const features = wireFeatures({ connectionAdapter: adapter });
  features.frameService.upsertFrame(receiveFrame);
  features.frameService.upsertFrame(sendFrame);
  return features;
}

async function connectAndGetTarget(features: RewriteWiredFeatures): Promise<string> {
  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: 't004-conn',
    host: '127.0.0.1',
    port: 9999,
  });
  expect(connectResult.ok).toBe(true);

  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);

  return targets[0]!.targetId;
}

function createEventDriverTask(
  targetId: string,
  conditions: readonly ConditionTerm[],
): TaskDefinition {
  return {
    id: 't004-condition-task',
    name: 'T004 Condition Task',
    schedule: { kind: 'event', conditions },
    steps: [
      {
        kind: 'send',
        id: 'send-response',
        name: 'Send response',
        config: {
          frameId: sendFrame.id,
          targetId,
          userFieldValues: { command: 0xaa },
        },
      },
    ],
    stopCondition: { maxIterations: 1 },
    errorPolicy: { onFailure: 'stop' },
  };
}

describe('T004: condition match → task → send chain', () => {
  let features: RewriteWiredFeatures;

  beforeEach(() => {
    features = setupFeatures();
  });

  it('condition match triggers send and task completes', async () => {
    const targetId = await connectAndGetTarget(features);

    const conditions: ConditionTerm[] = [
      { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 1 },
    ];
    const taskDef = createEventDriverTask(targetId, conditions);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    const runningInstance = features.taskService.getInstance(instance.instanceId);
    expect(runningInstance?.lifecycle).toBe('running');

    await new Promise((r) => setTimeout(r, 10));

    features.receiveEventSourceBridge.emit([{
      frameId: receiveFrame.id,
      fieldValues: { status: 1, value: 100 },
    }]);

    await features.taskService.onSettled(instance.instanceId);

    const completedInstance = features.taskService.getInstance(instance.instanceId);
    expect(completedInstance?.lifecycle).toBe('completed');

    const progress = features.taskService.getProgress(instance.instanceId);
    expect(progress).toBeDefined();
    expect(progress!.stepsCompleted).toBe(1);
  });

  it('condition NOT matching does NOT trigger send', async () => {
    const targetId = await connectAndGetTarget(features);

    const conditions: ConditionTerm[] = [
      { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 1 },
    ];
    const taskDef = createEventDriverTask(targetId, conditions);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    features.receiveEventSourceBridge.emit([{
      frameId: receiveFrame.id,
      fieldValues: { status: 0, value: 50 },
    }]);

    await new Promise((r) => setTimeout(r, 50));

    const stillRunning = features.taskService.getInstance(instance.instanceId);
    expect(stillRunning?.lifecycle).toBe('running');
    expect(stillRunning?.stepResults.length).toBe(0);

    features.taskService.stopTask(instance.instanceId);
  });

  it('multiple AND conditions must all match', async () => {
    const targetId = await connectAndGetTarget(features);

    const conditions: ConditionTerm[] = [
      { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 1 },
      { frameId: receiveFrame.id, fieldId: 'value', operator: 'gt', threshold: 50, logicOperator: 'and' },
    ];
    const taskDef = createEventDriverTask(targetId, conditions);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    features.receiveEventSourceBridge.emit([{
      frameId: receiveFrame.id,
      fieldValues: { status: 1, value: 30 },
    }]);

    await new Promise((r) => setTimeout(r, 50));

    const notMatched = features.taskService.getInstance(instance.instanceId);
    expect(notMatched?.lifecycle).toBe('running');
    expect(notMatched?.stepResults.length).toBe(0);

    features.receiveEventSourceBridge.emit([{
      frameId: receiveFrame.id,
      fieldValues: { status: 1, value: 100 },
    }]);

    await features.taskService.onSettled(instance.instanceId);

    const completed = features.taskService.getInstance(instance.instanceId);
    expect(completed?.lifecycle).toBe('completed');
    expect(completed?.stepResults.length).toBe(1);
  });

  it('stop task while waiting for condition', async () => {
    const targetId = await connectAndGetTarget(features);

    const conditions: ConditionTerm[] = [
      { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 1 },
    ];
    const taskDef = createEventDriverTask(targetId, conditions);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    const running = features.taskService.getInstance(instance.instanceId);
    expect(running?.lifecycle).toBe('running');

    features.taskService.stopTask(instance.instanceId);

    const stopped = features.taskService.getInstance(instance.instanceId);
    expect(stopped?.lifecycle).toBe('stopped');
    expect(stopped?.stepResults.length).toBe(0);
  });

  it('task step results show send succeeded after condition match', async () => {
    const targetId = await connectAndGetTarget(features);

    const conditions: ConditionTerm[] = [
      { frameId: receiveFrame.id, fieldId: 'value', operator: 'gte', threshold: 200 },
    ];
    const taskDef = createEventDriverTask(targetId, conditions);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    features.receiveEventSourceBridge.emit([{
      frameId: receiveFrame.id,
      fieldValues: { status: 0, value: 250 },
    }]);

    await features.taskService.onSettled(instance.instanceId);

    const completed = features.taskService.getInstance(instance.instanceId);
    expect(completed?.lifecycle).toBe('completed');

    const stepResults = completed?.stepResults ?? [];
    expect(stepResults.length).toBe(1);
    expect(stepResults[0]!.kind).toBe('send');
    expect(stepResults[0]!.stepIndex).toBe(0);
    expect(stepResults[0]!.iteration).toBe(0);
  });

  it('snapshot reflects terminal event-driven task', async () => {
    const targetId = await connectAndGetTarget(features);

    const conditions: ConditionTerm[] = [
      { frameId: receiveFrame.id, fieldId: 'status', operator: 'eq', threshold: 2 },
    ];
    const taskDef = createEventDriverTask(targetId, conditions);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    features.receiveEventSourceBridge.emit([{
      frameId: receiveFrame.id,
      fieldValues: { status: 2, value: 0 },
    }]);

    await features.taskService.onSettled(instance.instanceId);

    const snapshot = features.taskService.getSnapshot();
    const taskInSnapshot = snapshot.instances.find(
      (t) => t.instanceId === instance.instanceId,
    );
    expect(taskInSnapshot).toBeDefined();
    expect(taskInSnapshot!.lifecycle).toBe('completed');
  });
});
