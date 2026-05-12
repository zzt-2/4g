import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCommandIngressService } from '../services/command-ingress-service';
import { createCommandIngressState } from '../core/state';
import {
  testGlobalConfig,
  sendFrameCommandConfig,
  testCommandConfigs,
  buildDataEvent,
  buildScoeFrame,
  buildScoeFrameWithChecksum,
  resetFixtureIds,
} from '../fixtures/command-ingress-fixtures';
import type { TransportEventSnapshot } from '@/features/connection';
import type { CommandIngressServiceOptions } from '../services/command-ingress-service';

const satelliteConfigs = [
  {
    satelliteId: '00000001',
    messageIdentifier: '01',
    sourceIdentifier: '02',
    destinationIdentifier: '03',
    modelId: '04',
    commandConfigs: [sendFrameCommandConfig],
  },
];

function createFakeTaskService() {
  const settledResolvers = new Map<string, () => void>();
  const instances = new Map<string, { instanceId: string; lifecycle: string; error?: string }>();

  return {
    createTask: vi.fn().mockImplementation((def: { id: string }) => {
      const inst = { instanceId: `task-${def.id}-${Date.now()}`, lifecycle: 'running' };
      instances.set(inst.instanceId, inst);
      return inst;
    }),
    startTask: vi.fn(),
    stopTask: vi.fn().mockImplementation((id: string) => {
      const inst = instances.get(id);
      if (inst) inst.lifecycle = 'stopped';
    }),
    onSettled: vi.fn().mockImplementation((id: string) => {
      return new Promise<void>((resolve) => {
        settledResolvers.set(id, resolve);
      });
    }),
    getInstance: vi.fn().mockImplementation((id: string) => instances.get(id)),
    // Test helper: settle a task as completed
    settleTask(id: string, lifecycle: 'completed' | 'failed', error?: string) {
      const inst = instances.get(id);
      if (inst) {
        inst.lifecycle = lifecycle;
        if (error) inst.error = error;
      }
      const resolver = settledResolvers.get(id);
      if (resolver) resolver();
    },
    _instances: instances,
  };
}

function createIntegrationContext() {
  const stateContainer = createCommandIngressState(testGlobalConfig);
  const taskService = createFakeTaskService();
  const sendExecute = vi.fn().mockResolvedValue({ kind: 'sent' });

  const service = createCommandIngressService({
    globalConfig: testGlobalConfig,
    commandConfigs: testCommandConfigs,
    satelliteConfigs,
    taskService: taskService as unknown as CommandIngressServiceOptions['taskService'],
    sendService: { execute: sendExecute } as unknown as CommandIngressServiceOptions['sendService'],
    frameReader: {
      getFrame: vi.fn().mockReturnValue({ id: 'ack-frame-001', name: 'Ack Frame' }),
    } as unknown as CommandIngressServiceOptions['frameReader'],
    connectionService: {
      getSnapshot: vi.fn().mockReturnValue({}),
      getConnectionFact: vi.fn().mockReturnValue(undefined),
    } as unknown as CommandIngressServiceOptions['connectionService'],
    connectionSnapshot: vi.fn().mockReturnValue({ runtimeFacts: [] }),
    receiveSnapshot: vi.fn().mockReturnValue({ synced: true }),
    platformFileReader: vi.fn().mockResolvedValue(['line1', 'line2']),
    stateReader: stateContainer.reader,
    stateWriter: stateContainer.writer,
  });

  return { service, stateContainer, taskService, sendExecute };
}

beforeEach(() => {
  resetFixtureIds();
});

// --- C25: End-to-end integration ---

describe('command-ingress integration – full lifecycle', () => {
  it('phase 1: only LOAD is recognized before satellite loaded', async () => {
    const { service } = createIntegrationContext();

    const loadBytes = buildScoeFrame(0x01);
    const sendBytes = buildScoeFrame(0x05);
    const normalBytes = [0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00];

    const result = await service.adapter.consume([
      buildDataEvent(loadBytes),
      buildDataEvent(sendBytes),
      buildDataEvent(normalBytes),
    ]);

    // Only LOAD event consumed
    expect(result.consumed).toHaveLength(1);
    expect(result.remaining).toHaveLength(2);
  });

  it('LOAD → sets scoeFramesLoaded and transitions to phase 2', async () => {
    const { service, stateContainer } = createIntegrationContext();

    // Build LOAD frame with satellite ID at offset 8
    const loadBytes = buildScoeFrame(0x01);
    // Ensure enough room for satellite ID
    while (loadBytes.length < 12) loadBytes.push(0);
    loadBytes[8] = 0x00;
    loadBytes[9] = 0x00;
    loadBytes[10] = 0x00;
    loadBytes[11] = 0x01;

    await service.adapter.consume([buildDataEvent(loadBytes)]);

    expect(stateContainer.reader.scoeFramesLoaded).toBe(true);
    expect(stateContainer.reader.loadedSatelliteId).toBe('00000001');
  });

  it('full lifecycle: LOAD → SEND_FRAME → task created → ack sent', async () => {
    const { service, stateContainer, taskService, sendExecute } = createIntegrationContext();

    // Step 1: LOAD
    const loadBytes = buildScoeFrame(0x01);
    while (loadBytes.length < 12) loadBytes.push(0);
    loadBytes[8] = 0x00;
    loadBytes[9] = 0x00;
    loadBytes[10] = 0x00;
    loadBytes[11] = 0x01;

    await service.adapter.consume([buildDataEvent(loadBytes)]);
    expect(stateContainer.reader.scoeFramesLoaded).toBe(true);

    // Step 2: SEND_FRAME
    const cs = sendFrameCommandConfig.checksums[0]!;
    const sendBytes = buildScoeFrameWithChecksum(0x05, cs, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x01, // param-mode = "mode_a"
    ]);

    const sendResult = await service.adapter.consume([buildDataEvent(sendBytes)]);
    expect(sendResult.consumed).toHaveLength(1);
    expect(sendResult.remaining).toHaveLength(0);

    // Task was created and started
    expect(taskService.createTask).toHaveBeenCalledTimes(1);
    expect(taskService.startTask).toHaveBeenCalledTimes(1);

    // Receive count incremented
    expect(stateContainer.reader.getSnapshot().commandReceiveCount).toBe(1);

    // Step 3: Settle task as completed → triggers ack
    const createdTaskId = taskService.createTask.mock.results[0]!.value.instanceId;
    taskService.settleTask(createdTaskId, 'completed');

    // Wait for onSettled promise to resolve
    await vi.waitFor(() => {
      expect(sendExecute).toHaveBeenCalled();
    });

    expect(sendExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: 'ack-frame-001',
        targetId: 'network:scoe-udp:scoe-udp-remote',
      }),
    );
    expect(stateContainer.reader.getSnapshot().commandSuccessCount).toBe(1);
  });

  it('UNLOAD resets to phase 1', async () => {
    const { service, stateContainer } = createIntegrationContext();

    // LOAD first
    const loadBytes = buildScoeFrame(0x01);
    while (loadBytes.length < 12) loadBytes.push(0);
    loadBytes[8] = 0x00;
    loadBytes[9] = 0x00;
    loadBytes[10] = 0x00;
    loadBytes[11] = 0x01;

    await service.adapter.consume([buildDataEvent(loadBytes)]);
    expect(stateContainer.reader.scoeFramesLoaded).toBe(true);

    // UNLOAD
    const unloadBytes = buildScoeFrame(0x02);
    await service.adapter.consume([buildDataEvent(unloadBytes)]);
    expect(stateContainer.reader.scoeFramesLoaded).toBe(false);
    expect(stateContainer.reader.loadedSatelliteId).toBe('');
  });

  it('non-SCOE events pass through as remaining', async () => {
    const { service } = createIntegrationContext();

    const normalEvents: TransportEventSnapshot[] = [
      buildDataEvent([0xDE, 0xAD, 0xBE, 0xEF]),
      buildDataEvent([0x10, 0x20, 0x30, 0x40]),
    ];

    const result = await service.adapter.consume(normalEvents);
    expect(result.consumed).toHaveLength(0);
    expect(result.remaining).toHaveLength(2);
    expect(result.remaining).toEqual(normalEvents);
  });

  it('HEALTH_CHECK handler updates health status', async () => {
    const { service, stateContainer } = createIntegrationContext();

    // LOAD first
    const loadBytes = buildScoeFrame(0x01);
    while (loadBytes.length < 12) loadBytes.push(0);
    loadBytes[8] = 0x00;
    loadBytes[9] = 0x00;
    loadBytes[10] = 0x00;
    loadBytes[11] = 0x01;
    await service.adapter.consume([buildDataEvent(loadBytes)]);

    // Add a health_check command config (code 03)
    const healthConfig = {
      id: 'cmd-health',
      label: 'HEALTH_CHECK',
      code: '03',
      function: 'health_check' as const,
      checksums: [],
      params: [],
    };
    stateContainer.writer.setLoaded('00000001', [healthConfig, ...testCommandConfigs]);

    const healthBytes = buildScoeFrame(0x03);
    await service.adapter.consume([buildDataEvent(healthBytes)]);

    // healthStatus should be 'error' (default fake snapshot has no runtimeFacts)
    expect(stateContainer.reader.getSnapshot().healthStatus).toBe('error');
  });

  it('connection disconnect stops tracked tasks', async () => {
    const { service, taskService } = createIntegrationContext();

    // LOAD first
    const loadBytes = buildScoeFrame(0x01);
    while (loadBytes.length < 12) loadBytes.push(0);
    loadBytes[8] = 0x00;
    loadBytes[9] = 0x00;
    loadBytes[10] = 0x00;
    loadBytes[11] = 0x01;
    await service.adapter.consume([buildDataEvent(loadBytes)]);

    // SEND_FRAME to create a task
    const cs = sendFrameCommandConfig.checksums[0]!;
    const sendBytes = buildScoeFrameWithChecksum(0x05, cs, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x01,
    ]);
    await service.adapter.consume([buildDataEvent(sendBytes)]);

    const taskId = taskService.createTask.mock.results[0]!.value.instanceId;
    expect(taskService._instances.has(taskId)).toBe(true);

    // Dispose service (simulates connection cleanup)
    service.dispose();

    // Task should have been stopped
    expect(taskService.stopTask).toHaveBeenCalled();
  });
});

// --- CI-R2: loadSatellite / unloadSatellite service methods ---

describe('CommandIngressService loadSatellite/unloadSatellite', () => {
  it('loadSatellite loads a known satellite', async () => {
    const { service, stateContainer } = createIntegrationContext();

    const result = await service.loadSatellite('00000001');
    expect(result.success).toBe(true);
    expect(stateContainer.reader.loadedSatelliteId).toBe('00000001');
    expect(stateContainer.reader.scoeFramesLoaded).toBe(true);
  });

  it('loadSatellite rejects unknown satellite', async () => {
    const { service } = createIntegrationContext();

    const result = await service.loadSatellite('UNKNOWN');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown satellite ID');
  });

  it('loadSatellite rejects when already loaded', async () => {
    const { service } = createIntegrationContext();

    await service.loadSatellite('00000001');
    const result = await service.loadSatellite('00000001');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already loaded');
  });

  it('unloadSatellite resets state', async () => {
    const { service, stateContainer } = createIntegrationContext();

    await service.loadSatellite('00000001');
    expect(stateContainer.reader.scoeFramesLoaded).toBe(true);

    const result = await service.unloadSatellite();
    expect(result.success).toBe(true);
    expect(stateContainer.reader.scoeFramesLoaded).toBe(false);
    expect(stateContainer.reader.loadedSatelliteId).toBe('');
  });

  it('unloadSatellite fails when nothing loaded', async () => {
    const { service } = createIntegrationContext();

    const result = await service.unloadSatellite();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No satellite loaded');
  });
});

// --- CI-R5: Reader methods ---

describe('CommandIngressService Reader methods', () => {
  it('getScoeStatistics returns counter fields', async () => {
    const { service, stateContainer } = createIntegrationContext();

    stateContainer.writer.incrementReceiveCount();
    stateContainer.writer.incrementSuccessCount();
    stateContainer.writer.incrementErrorCount('fail');

    const stats = service.getScoeStatistics();
    expect(stats.commandReceiveCount).toBe(1);
    expect(stats.commandSuccessCount).toBe(1);
    expect(stats.commandErrorCount).toBe(1);
    expect(stats.lastErrorReason).toBe('fail');
  });

  it('getScoeRuntimeStatus returns runtime state subset', async () => {
    const { service } = createIntegrationContext();

    await service.loadSatellite('00000001');
    const status = service.getScoeRuntimeStatus();
    expect(status.loadedSatelliteId).toBe('00000001');
    expect(status.scoeFramesLoaded).toBe(true);
    expect(status.healthStatus).toBe('unknown');
  });

  it('getLoadedSatelliteId returns current satellite', async () => {
    const { service } = createIntegrationContext();

    expect(service.getLoadedSatelliteId()).toBe('');
    await service.loadSatellite('00000001');
    expect(service.getLoadedSatelliteId()).toBe('00000001');
  });

  it('isScoeFramesLoaded returns boolean', async () => {
    const { service } = createIntegrationContext();

    expect(service.isScoeFramesLoaded()).toBe(false);
    await service.loadSatellite('00000001');
    expect(service.isScoeFramesLoaded()).toBe(true);
  });
});
