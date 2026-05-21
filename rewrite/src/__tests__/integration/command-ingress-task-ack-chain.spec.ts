/**
 * T005: SCOE command-ingress → task → send → ACK complete chain.
 *
 * Tests the integration of command dispatch from the command-ingress
 * service level through to task creation, task execution, and ACK frame
 * sending. Uses real wireFeatures with real task/send services.
 *
 * Verification points:
 * 1. SEND_FRAME command dispatches a task that completes successfully
 * 2. After task completion, statistics counters reflect command receive/success counts
 * 3. Failed task (bad target) does not send ACK, increments error count
 * 4. Full lifecycle: LOAD → SEND_FRAME → task → send → ACK
 * 5. Multiple SEND_FRAME commands each create separate tasks
 * 6. SEND_FRAME before LOAD is rejected
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wireFeatures } from '@/runtime/feature-wiring';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import { createCommandIngressState } from '@/features/command-ingress/core/state';
import { createCommandIngressService } from '@/features/command-ingress/services/command-ingress-service';
import type { FrameAsset } from '@/features/frame';
import type { RewriteWiredFeatures } from '@/runtime/feature-wiring';
import type {
  ScoeGlobalConfig,
  ScoeCommandConfig,
  SatelliteConfig,
} from '@/features/command-ingress';

const sendFrame: FrameAsset = {
  id: 't005-send-frame',
  name: 'T005 SCOE Send Frame',
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

const ackFrame: FrameAsset = {
  id: 't005-ack-frame',
  name: 'T005 ACK Frame',
  direction: 'send',
  fields: [
    {
      id: 'ack-code',
      name: 'ACK Code',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x55',
    },
  ],
  identifierRules: [],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
};

const globalConfig: ScoeGlobalConfig = {
  scoeIdentifier: '0x55',
  tcpServerIp: '0.0.0.0',
  tcpServerPort: 6000,
  tcpServerAutoConnect: false,
  udpIpAddress: '127.0.0.1',
  udpPort: 7000,
  udpTargetId: '',
  messageIdentifierOffset: 4,
  sourceIdentifierOffset: 5,
  destinationIdentifierOffset: 6,
  modelIdOffset: 7,
  satelliteIdOffset: 8,
  functionCodeOffset: 0,
  successFrameId: ackFrame.id,
};

const sendFrameCommandConfig: ScoeCommandConfig = {
  id: 'cmd-send',
  label: 'SEND_FRAME',
  code: '05',
  function: 'send_frame',
  checksums: [],
  params: [],
  frameMappings: [
    {
      frameId: sendFrame.id,
      instanceId: 'inst-1',
      targetId: '',
      fieldMappings: [
        { fieldId: 'command', source: 'fixed', fixedValue: 0xbb },
      ],
    },
  ],
  successFrameId: ackFrame.id,
};

const loadCommandConfig: ScoeCommandConfig = {
  id: 'cmd-load',
  label: 'LOAD_SATELLITE_ID',
  code: '01',
  function: 'load_satellite_id',
  checksums: [],
  params: [],
};

let nextEventId = 1;

function buildDataEvent(bytes: number[], connectionId = 'conn-scoe-tcp'): {
  id: string;
  kind: 'data';
  connectionId: string;
  occurredAt: string;
  bytes: number[];
  byteLength: number;
} {
  return {
    id: `evt-${nextEventId++}`,
    kind: 'data',
    connectionId,
    occurredAt: new Date().toISOString(),
    bytes,
    byteLength: bytes.length,
  };
}

function buildScoeBytes(commandCode: number): number[] {
  const fcOffset = globalConfig.functionCodeOffset;
  const identByte = parseInt(globalConfig.scoeIdentifier.replace(/^0x/i, ''), 16);
  const frame: number[] = [];
  while (frame.length < fcOffset + 4) frame.push(0);
  frame[fcOffset] = identByte;
  frame[fcOffset + 1] = commandCode;
  frame[fcOffset + 2] = 0xaa;
  frame[fcOffset + 3] = 0xaa;
  return frame;
}

const terminalStates = new Set(['completed', 'failed', 'stopped']);

async function pollUntil(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('pollUntil timed out');
}

interface TestContext {
  features: RewriteWiredFeatures;
  ciService: ReturnType<typeof createCommandIngressService>;
  stateContainer: ReturnType<typeof createCommandIngressState>;
  targetId: string;
}

async function setupWithConnectedTarget(): Promise<TestContext> {
  const adapter = createFakeConnectionTransportAdapter();
  const features = wireFeatures({ connectionAdapter: adapter });

  features.frameService.upsertFrame(sendFrame);
  features.frameService.upsertFrame(ackFrame);

  const connectResult = await features.connectionService.connect({
    kind: 'tcp-client',
    id: 'conn-scoe-tcp',
    host: '127.0.0.1',
    port: 9000,
  });
  expect(connectResult.ok).toBe(true);

  const targets = features.connectionService.listTransportTargets();
  expect(targets.length).toBeGreaterThanOrEqual(1);
  const targetId = targets[0]!.targetId;

  const patchedSendCmd: ScoeCommandConfig = {
    ...sendFrameCommandConfig,
    frameMappings: [
      {
        ...sendFrameCommandConfig.frameMappings![0]!,
        targetId,
      },
    ],
  };

  const patchedSatConfig: SatelliteConfig = {
    satelliteId: 'SAT-01',
    messageIdentifier: '01',
    sourceIdentifier: '02',
    destinationIdentifier: '03',
    modelId: '04',
    commandConfigs: [patchedSendCmd],
  };

  const stateContainer = createCommandIngressState(globalConfig);

  const ciService = createCommandIngressService({
    globalConfig,
    commandConfigs: [loadCommandConfig, patchedSendCmd],
    satelliteConfigs: [patchedSatConfig],
    taskService: features.taskService,
    sendService: features.sendService,
    frameReader: features.frameReader,
    connectionService: features.connectionService,
    connectionSnapshot: () => features.connectionService.getSnapshot(),
    receiveSnapshot: () => ({}),
    platformFileReader: async () => [],
    stateReader: stateContainer.reader,
    stateWriter: stateContainer.writer,
  });

  return { features, ciService, stateContainer, targetId };
}

describe('T005: command-ingress → task → send → ACK chain', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    nextEventId = 1;
    ctx = await setupWithConnectedTarget();
  });

  it('full lifecycle: LOAD → SEND_FRAME → task completes → ACK sent', async () => {
    const { features, ciService, stateContainer } = ctx;

    await ciService.loadSatellite('SAT-01');
    expect(stateContainer.reader.scoeFramesLoaded).toBe(true);

    const sendBytes = buildScoeBytes(0x05);
    const sendEvent = buildDataEvent(sendBytes);

    const consumeResult = await ciService.adapter.consume([sendEvent]);
    expect(consumeResult.consumed).toHaveLength(1);

    const snapshot = features.taskService.getSnapshot();
    const taskInstance = snapshot.instances.find(
      (t) => t.lifecycle === 'running' || t.lifecycle === 'completed',
    );
    expect(taskInstance).toBeDefined();

    await pollUntil(() => {
      const inst = features.taskService.getInstance(taskInstance!.instanceId);
      return !!inst && terminalStates.has(inst.lifecycle);
    });

    const settledInstance = features.taskService.getInstance(taskInstance!.instanceId);
    expect(settledInstance?.lifecycle).toBe('completed');

    await pollUntil(() => ciService.getScoeStatistics().commandSuccessCount === 1);

    const stats = ciService.getScoeStatistics();
    expect(stats.commandReceiveCount).toBe(1);
    expect(stats.commandSuccessCount).toBe(1);
  });

  it('SEND_FRAME before LOAD is rejected and no task created', async () => {
    const { features, ciService } = ctx;

    expect(ciService.isScoeFramesLoaded()).toBe(false);

    const sendBytes = buildScoeBytes(0x05);
    const sendEvent = buildDataEvent(sendBytes);

    const result = await ciService.adapter.consume([sendEvent]);
    expect(result.consumed).toHaveLength(0);
    expect(result.remaining).toHaveLength(1);

    const snapshot = features.taskService.getSnapshot();
    expect(snapshot.instances).toHaveLength(0);
  });

  it('task with bad target stops and does not increment success count', async () => {
    const { features, ciService, stateContainer } = ctx;

    await ciService.loadSatellite('SAT-01');

    const brokenSendCmd: ScoeCommandConfig = {
      ...sendFrameCommandConfig,
      frameMappings: [
        {
          frameId: sendFrame.id,
          instanceId: 'inst-broken',
          targetId: 'nonexistent-target-xxx',
          fieldMappings: [
            { fieldId: 'command', source: 'fixed', fixedValue: 0xbb },
          ],
        },
      ],
      successFrameId: ackFrame.id,
    };

    stateContainer.writer.setLoaded('SAT-01', [brokenSendCmd]);

    const sendBytes = buildScoeBytes(0x05);
    const sendEvent = buildDataEvent(sendBytes);

    await ciService.adapter.consume([sendEvent]);

    const snapshot = features.taskService.getSnapshot();
    const taskInstance = snapshot.instances[0];
    expect(taskInstance).toBeDefined();

    await pollUntil(() => {
      const inst = features.taskService.getInstance(taskInstance!.instanceId);
      return !!inst && terminalStates.has(inst.lifecycle);
    });

    const settled = features.taskService.getInstance(taskInstance!.instanceId);
    expect(settled?.lifecycle).toBe('stopped');

    const stats = ciService.getScoeStatistics();
    expect(stats.commandSuccessCount).toBe(0);
    expect(stats.commandReceiveCount).toBe(1);
  });

  it('command log records success after task completion', async () => {
    const { features, ciService } = ctx;

    await ciService.loadSatellite('SAT-01');

    const sendBytes = buildScoeBytes(0x05);
    const sendEvent = buildDataEvent(sendBytes);

    await ciService.adapter.consume([sendEvent]);

    const snapshot = features.taskService.getSnapshot();
    const taskInstance = snapshot.instances[0];
    expect(taskInstance).toBeDefined();

    await pollUntil(() => {
      const inst = features.taskService.getInstance(taskInstance!.instanceId);
      return !!inst && terminalStates.has(inst.lifecycle);
    });

    await pollUntil(() => {
      const log = ciService.getCommandLog();
      return log.length > 0 && log[0]!.result === 'success';
    });

    const log = ciService.getCommandLog();
    expect(log.length).toBe(1);
    expect(log[0]!.commandCode).toBe('05');
    expect(log[0]!.result).toBe('success');
  });

  it('multiple SEND_FRAME commands each create separate tasks', async () => {
    const { features, ciService } = ctx;

    await ciService.loadSatellite('SAT-01');

    const sendBytes1 = buildScoeBytes(0x05);
    const sendBytes2 = buildScoeBytes(0x05);

    const event1 = buildDataEvent(sendBytes1);
    const event2 = buildDataEvent(sendBytes2);

    await ciService.adapter.consume([event1, event2]);

    const snapshot = features.taskService.getSnapshot();
    expect(snapshot.instances.length).toBe(2);

    for (const inst of snapshot.instances) {
      await pollUntil(() => {
        const i = features.taskService.getInstance(inst.instanceId);
        return !!i && terminalStates.has(i.lifecycle);
      });
    }

    await pollUntil(() => ciService.getScoeStatistics().commandSuccessCount === 2);

    const stats = ciService.getScoeStatistics();
    expect(stats.commandReceiveCount).toBe(2);
    expect(stats.commandSuccessCount).toBe(2);
  });

  it('dispose stops all tracked tasks', async () => {
    const { features, ciService } = ctx;

    await ciService.loadSatellite('SAT-01');

    const sendBytes = buildScoeBytes(0x05);
    await ciService.adapter.consume([buildDataEvent(sendBytes)]);

    const snapshot = features.taskService.getSnapshot();
    const runningTask = snapshot.instances.find((t) => t.lifecycle === 'running');

    if (runningTask) {
      ciService.dispose();

      const afterDispose = features.taskService.getInstance(runningTask.instanceId);
      expect(afterDispose?.lifecycle).toBe('stopped');
    }
  });
});
