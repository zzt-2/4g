/**
 * T020: Task concurrent execution + shared send service.
 * T023: Connection-backed-writer event dependency.
 *
 * T020 verifies that multiple tasks can run concurrently without interference
 * when sharing a single send service backed by a fake connection.
 *
 * T023 verifies that ConnectionBackedSendWriter correctly interprets
 * ConnectionService.write() outcomes, including edge cases around
 * missing write-accepted events and failed writes.
 *
 * Verification points:
 * T020:
 * 1. Two tasks with same target run concurrently and both complete
 * 2. Stopping one task does not affect the other
 * 3. Each task's step results contain only its own context
 *
 * T023:
 * 4. write-accepted event present -> correct bytesWritten
 * 5. write-accepted event missing -> bytesWritten = 0 (not hanging)
 * 6. Write fails -> ok: false, bytesWritten: 0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import { ConnectionBackedSendWriter } from '@/runtime/bridges/connection-backed-writer';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type { TaskDefinition } from '@/features/task';
import type { ConnectionService } from '@/features/connection';

// ---------------------------------------------------------------------------
// Frame definition
// ---------------------------------------------------------------------------

const sendFrame: FrameAsset = {
  id: 't020-send-frame',
  name: 'T020 Send Frame',
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

async function connectAndGetTarget(features: RewriteWiredFeatures): Promise<string> {
  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: 't020-conn',
    host: '127.0.0.1',
    port: 9999,
  });
  expect(connectResult.ok).toBe(true);

  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);
  return targets[0]!.targetId;
}

function createSendTask(
  taskId: string,
  targetId: string,
  payloadValue: number,
): TaskDefinition {
  return {
    id: taskId,
    name: `T020 Task ${taskId}`,
    schedule: { kind: 'immediate' },
    steps: [
      {
        kind: 'send',
        id: `${taskId}-send-1`,
        name: 'Send frame',
        config: {
          frameId: sendFrame.id,
          targetId,
          userFieldValues: { payload: payloadValue },
        },
      },
    ],
    errorPolicy: { onFailure: 'stop' },
  };
}

function createDelayedSendTask(
  taskId: string,
  targetId: string,
  delayMs: number,
): TaskDefinition {
  return {
    id: taskId,
    name: `T020 Delayed Task ${taskId}`,
    schedule: { kind: 'immediate' },
    steps: [
      {
        kind: 'delay',
        id: `${taskId}-delay-1`,
        name: 'Delay before send',
        config: { durationMs: delayMs },
      },
      {
        kind: 'send',
        id: `${taskId}-send-1`,
        name: 'Send after delay',
        config: {
          frameId: sendFrame.id,
          targetId,
        },
      },
    ],
    errorPolicy: { onFailure: 'stop' },
  };
}

// ---------------------------------------------------------------------------
// T020: concurrent task execution
// ---------------------------------------------------------------------------

describe('T020: task concurrent execution + shared send service', () => {
  let features: RewriteWiredFeatures;

  beforeEach(async () => {
    features = setupFeatures();
  });

  it('two tasks run concurrently without interference', async () => {
    const targetId = await connectAndGetTarget(features);

    const taskA = createSendTask('task-a', targetId, 0x10);
    const taskB = createSendTask('task-b', targetId, 0x20);

    const instanceA = features.taskService.createTask(taskA);
    const instanceB = features.taskService.createTask(taskB);

    // Start both simultaneously
    features.taskService.startTask(instanceA.instanceId);
    features.taskService.startTask(instanceB.instanceId);

    // Wait for both to settle
    await Promise.all([
      features.taskService.onSettled(instanceA.instanceId),
      features.taskService.onSettled(instanceB.instanceId),
    ]);

    const finalA = features.taskService.getInstance(instanceA.instanceId);
    const finalB = features.taskService.getInstance(instanceB.instanceId);

    expect(finalA?.lifecycle).toBe('completed');
    expect(finalB?.lifecycle).toBe('completed');
  });

  it('stop one task does not affect the other', async () => {
    const targetId = await connectAndGetTarget(features);

    // Task A: long delay + send (so it stays running and can be stopped)
    const taskADef = createDelayedSendTask('task-a', targetId, 5000);
    // Task B: immediate send (should complete quickly)
    const taskBDef = createSendTask('task-b', targetId, 0x20);

    const instanceA = features.taskService.createTask(taskADef);
    const instanceB = features.taskService.createTask(taskBDef);

    features.taskService.startTask(instanceA.instanceId);
    features.taskService.startTask(instanceB.instanceId);

    // Stop task A while task B is running
    features.taskService.stopTask(instanceA.instanceId);

    const finalA = features.taskService.getInstance(instanceA.instanceId);
    expect(finalA?.lifecycle).toBe('stopped');

    // Wait for task B to complete
    await features.taskService.onSettled(instanceB.instanceId);
    const finalB = features.taskService.getInstance(instanceB.instanceId);
    expect(finalB?.lifecycle).toBe('completed');
  });

  it('each task gets its own step results with correct context', async () => {
    const targetId = await connectAndGetTarget(features);

    const taskA = createSendTask('task-a', targetId, 0x11);
    const taskB = createSendTask('task-b', targetId, 0x22);

    const instanceA = features.taskService.createTask(taskA);
    const instanceB = features.taskService.createTask(taskB);

    features.taskService.startTask(instanceA.instanceId);
    features.taskService.startTask(instanceB.instanceId);

    await Promise.all([
      features.taskService.onSettled(instanceA.instanceId),
      features.taskService.onSettled(instanceB.instanceId),
    ]);

    const finalA = features.taskService.getInstance(instanceA.instanceId);
    const finalB = features.taskService.getInstance(instanceB.instanceId);

    // Each task should have exactly 1 step result (its own)
    expect(finalA?.stepResults.length).toBe(1);
    expect(finalB?.stepResults.length).toBe(1);

    // Each task's result references its own definition
    expect(finalA?.definitionRef.id).toBe('task-a');
    expect(finalB?.definitionRef.id).toBe('task-b');
  });
});

// ---------------------------------------------------------------------------
// T023: connection-backed-writer event dependency
// ---------------------------------------------------------------------------

describe('T023: connection-backed-writer event dependency', () => {
  it('write-accepted event present -> returns correct bytesWritten', async () => {
    const mockConnectionService: ConnectionService = {
      write: async () => ({
        ok: true,
        validation: { issues: [] },
        snapshot: {
          schemaVersion: 1 as const,
          configs: [],
          runtimeFacts: [],
          events: [],
        },
        events: [{ kind: 'write-accepted', byteLength: 10, connectionId: 'c1', occurredAt: '' }],
      }),
    } as unknown as ConnectionService;

    const writer = new ConnectionBackedSendWriter(mockConnectionService);
    const outcome = await writer.writeBytes('c1', [1, 2, 3]);

    expect(outcome.ok).toBe(true);
    expect(outcome.bytesWritten).toBe(10);
  });

  it('write-accepted event missing -> returns bytesWritten 0', async () => {
    const mockConnectionService: ConnectionService = {
      write: async () => ({
        ok: true,
        validation: { issues: [] },
        snapshot: {
          schemaVersion: 1 as const,
          configs: [],
          runtimeFacts: [],
          events: [],
        },
        events: [],
      }),
    } as unknown as ConnectionService;

    const writer = new ConnectionBackedSendWriter(mockConnectionService);
    const outcome = await writer.writeBytes('c1', [1, 2, 3]);

    expect(outcome.ok).toBe(true);
    expect(outcome.bytesWritten).toBe(0);
  });

  it('write fails -> returns ok false with bytesWritten 0', async () => {
    const mockConnectionService: ConnectionService = {
      write: async () => ({
        ok: false,
        validation: { issues: [] },
        snapshot: {
          schemaVersion: 1 as const,
          configs: [],
          runtimeFacts: [],
          events: [],
        },
        events: [],
        error: { kind: 'write-failed', message: 'Connection lost', occurredAt: '', connectionId: 'c1' },
      }),
    } as unknown as ConnectionService;

    const writer = new ConnectionBackedSendWriter(mockConnectionService);
    const outcome = await writer.writeBytes('c1', [1, 2, 3]);

    expect(outcome.ok).toBe(false);
    expect(outcome.bytesWritten).toBe(0);
    expect(outcome.error).toBeDefined();
    expect(outcome.error?.kind).toBe('write-failed');
    expect(outcome.error?.message).toBe('Connection lost');
  });
});
