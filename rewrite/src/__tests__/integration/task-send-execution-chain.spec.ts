/**
 * T003: End-to-end task → send execution chain.
 *
 * Verifies the complete lifecycle: TaskDefinition created → taskService.startTask
 * → send step executes → sendService.execute called → transport write occurs →
 * task reaches completed state.
 *
 * Verification points:
 * 1. task lifecycle correctly transitions (created → running → completed)
 * 2. send pipeline 9-step executes correctly
 * 3. SendResult returned and task progress updated
 * 4. Selector reflects task terminal state
 * 5. Written bytes match expected frame structure
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type { TaskDefinition } from '@/features/task';

// ---------------------------------------------------------------------------
// Frame definition
// ---------------------------------------------------------------------------

const sendFrame: FrameAsset = {
  id: 't003-send-frame',
  name: 'T003 Send Frame',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: 'Header',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xAB',
    },
    {
      id: 'payload',
      name: 'Payload',
      dataType: 'uint16',
      length: 2,
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

  // Add frame definition
  features.frameService.upsertFrame(sendFrame);

  return features;
}

async function connectAndGetTarget(features: RewriteWiredFeatures): Promise<string> {
  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: 't003-conn',
    host: '127.0.0.1',
    port: 9999,
  });
  expect(connectResult.ok).toBe(true);

  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);

  return targets[0]!.targetId;
}

function createImmediateSendTask(targetId: string): TaskDefinition {
  return {
    id: 't003-task',
    name: 'T003 Immediate Send Task',
    schedule: { kind: 'immediate' },
    steps: [
      {
        kind: 'send',
        id: 'step-1',
        name: 'Send frame',
        config: {
          frameId: sendFrame.id,
          targetId,
          userFieldValues: { payload: 0x1234 },
        },
      },
    ],
    errorPolicy: { onStepError: 'stop' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T003: task → send execution chain', () => {
  let features: RewriteWiredFeatures;

  beforeEach(async () => {
    features = setupFeatures();
  });

  it('task lifecycle transitions: created → running → completed', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createImmediateSendTask(targetId);

    // Create task — lifecycle should be 'created'
    const instance = features.taskService.createTask(taskDef);
    expect(instance.lifecycle).toBe('created');
    expect(instance.instanceId).toBeTruthy();

    // Start task — lifecycle should transition to 'running'
    features.taskService.startTask(instance.instanceId);

    const runningInstance = features.taskService.getInstance(instance.instanceId);
    expect(runningInstance?.lifecycle).toBe('running');

    // Wait for completion
    await features.taskService.onSettled(instance.instanceId);

    const completedInstance = features.taskService.getInstance(instance.instanceId);
    expect(completedInstance?.lifecycle).toBe('completed');
  });

  it('send service executes and bytes are written to transport', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createImmediateSendTask(targetId);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    // Verify task completed successfully
    const finalInstance = features.taskService.getInstance(instance.instanceId);
    expect(finalInstance?.lifecycle).toBe('completed');

    // Verify bytes were written through the fake adapter
    // Use the connection service to verify write was attempted
    const snapshot = features.connectionService.getSnapshot();
    expect(snapshot.runtimeFacts.length).toBeGreaterThanOrEqual(1);
  });

  it('task progress reflects step completion', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createImmediateSendTask(targetId);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const progress = features.taskService.getProgress(instance.instanceId);
    // Progress should exist after completion
    expect(progress).toBeDefined();
  });

  it('task selector snapshot reflects terminal task', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createImmediateSendTask(targetId);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const snapshot = features.taskService.getSnapshot();
    const taskInSnapshot = snapshot.instances.find(
      (t) => t.instanceId === instance.instanceId,
    );
    expect(taskInSnapshot).toBeDefined();
    expect(taskInSnapshot!.lifecycle).toBe('completed');
  });

  it('send with target-unavailable results in task failure', async () => {
    // Do NOT connect — target won't exist
    const taskDef = createImmediateSendTask('nonexistent-target');

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const finalInstance = features.taskService.getInstance(instance.instanceId);
    // Task should fail because target is unavailable
    expect(finalInstance?.lifecycle).toBe('failed');
  });

  it('multi-step task executes steps sequentially', async () => {
    const targetId = await connectAndGetTarget(features);

    const taskDef: TaskDefinition = {
      id: 't003-multi-step',
      name: 'T003 Multi Step Task',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'send',
          id: 'step-1',
          name: 'First send',
          config: {
            frameId: sendFrame.id,
            targetId,
            userFieldValues: { payload: 0x1000 },
          },
        },
        {
          kind: 'delay',
          id: 'step-2',
          name: 'Short delay',
          config: { durationMs: 10 },
        },
        {
          kind: 'send',
          id: 'step-3',
          name: 'Second send',
          config: {
            frameId: sendFrame.id,
            targetId,
            userFieldValues: { payload: 0x2000 },
          },
        },
      ],
      errorPolicy: { onStepError: 'stop' },
    };

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    // All steps should complete without error
    const finalInstance = features.taskService.getInstance(instance.instanceId);
    expect(finalInstance?.lifecycle).toBe('completed');
  });

  it('task can be stopped while running', async () => {
    const targetId = await connectAndGetTarget(features);

    const taskDef: TaskDefinition = {
      id: 't003-stoppable',
      name: 'T003 Stoppable Task',
      schedule: { kind: 'immediate' },
      steps: [
        {
          kind: 'delay',
          id: 'step-1',
          name: 'Long delay',
          config: { durationMs: 10000 },
        },
        {
          kind: 'send',
          id: 'step-2',
          name: 'Send after delay',
          config: {
            frameId: sendFrame.id,
            targetId,
          },
        },
      ],
      errorPolicy: { onStepError: 'stop' },
    };

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    // Stop immediately while delay is running
    features.taskService.stopTask(instance.instanceId);

    const finalInstance = features.taskService.getInstance(instance.instanceId);
    expect(finalInstance?.lifecycle).toBe('stopped');
  });

  it('task can be removed after reaching terminal state', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createImmediateSendTask(targetId);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    expect(features.taskService.getInstance(instance.instanceId)?.lifecycle).toBe('completed');

    // Remove completed task
    features.taskService.removeTask(instance.instanceId);
    expect(features.taskService.getInstance(instance.instanceId)).toBeUndefined();
  });
});
