/**
 * T012: Timer driver loop execution.
 *
 * Verifies that ScheduleDriver { kind: 'timer', intervalMs } correctly drives
 * task iteration timing, stop condition enforcement, and user-initiated stop.
 *
 * Verification points:
 * 1. Timer task executes exactly maxIterations times then completes
 * 2. First iteration fires immediately (no initial delay)
 * 3. After maxIterations-1 iterations, task is still running
 * 4. User stop results in 'stopped' lifecycle, not 'completed'
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type { TaskDefinition } from '@/features/task';

// ---------------------------------------------------------------------------
// Frame definitions
// ---------------------------------------------------------------------------

const sendFrame: FrameAsset = {
  id: 't012-send-frame',
  name: 'T012 Send Frame',
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupFeatures(): RewriteWiredFeatures {
  const adapter = createFakeConnectionTransportAdapter();
  const features = wireFeatures({ connectionAdapter: adapter });
  features.frameService.upsertFrame(sendFrame);
  return features;
}

async function connectAndGetTarget(features: RewriteWiredFeatures): Promise<string> {
  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: 't012-conn',
    host: '127.0.0.1',
    port: 9999,
  });
  expect(connectResult.ok).toBe(true);
  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);
  return targets[0]!.targetId;
}

function createTimerTask(
  targetId: string,
  intervalMs: number,
  maxIterations: number,
): TaskDefinition {
  return {
    id: `t012-timer-${intervalMs}-${maxIterations}`,
    name: `T012 Timer ${intervalMs}ms x${maxIterations}`,
    schedule: { kind: 'timer', intervalMs },
    steps: [
      {
        kind: 'send',
        id: 'step-1',
        name: 'Send frame',
        config: { frameId: sendFrame.id, targetId },
      },
    ],
    stopCondition: { maxIterations },
    errorPolicy: { onStepError: 'stop' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T012: timer driver loop execution', () => {
  let features: RewriteWiredFeatures;

  beforeEach(async () => {
    features = setupFeatures();
  });

  it('executes exactly maxIterations times then completes', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createTimerTask(targetId, 10, 3);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');

    const progress = features.taskService.getProgress(instance.instanceId);
    expect(progress).toBeDefined();
    expect(progress!.iterationsCompleted).toBe(3);
  });

  it('first iteration fires immediately without initial delay', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createTimerTask(targetId, 10, 1);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final?.stepResults.length).toBeGreaterThanOrEqual(1);

    const firstResult = final!.stepResults[0]!;
    expect(firstResult.iteration).toBe(0);
  });

  it('task is still running after maxIterations minus 1 iterations', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createTimerTask(targetId, 50, 3);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 10));

    const runningInstance = features.taskService.getInstance(instance.instanceId);
    expect(runningInstance?.lifecycle).toBe('running');

    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(3);
  });

  it('user stop results in stopped lifecycle, not completed', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef: TaskDefinition = {
      id: 't012-stop-test',
      name: 'T012 Stop Test',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [
        {
          kind: 'send',
          id: 'step-1',
          name: 'Send frame',
          config: { frameId: sendFrame.id, targetId },
        },
      ],
      errorPolicy: { onStepError: 'stop' },
    };

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);

    await new Promise((r) => setTimeout(r, 5));

    features.taskService.stopTask(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('stopped');
  });

  it('single iteration timer completes after one send', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createTimerTask(targetId, 10, 1);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(1);
    expect(final!.stepResults[0]!.kind).toBe('send');
  });

  it('timer task with short interval respects maxIterations boundary', async () => {
    const targetId = await connectAndGetTarget(features);
    const taskDef = createTimerTask(targetId, 5, 5);

    const instance = features.taskService.createTask(taskDef);
    features.taskService.startTask(instance.instanceId);
    await features.taskService.onSettled(instance.instanceId);

    const final = features.taskService.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(final!.stepResults.length).toBe(5);

    const progress = features.taskService.getProgress(instance.instanceId);
    expect(progress!.iterationsCompleted).toBe(5);
  });
});
