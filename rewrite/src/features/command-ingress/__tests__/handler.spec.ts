import { describe, expect, it, vi } from 'vitest';
import { dispatchCommand } from '../core/handler';
import type { CommandHandler, CommandContext, CommandResult } from '../core/handler';
import type { ParsedCommand } from '../core/protocol-adapter';
import { createHandleLoadSatelliteId } from '../handlers/handle-load';
import { handleUnloadSatelliteId } from '../handlers/handle-unload';
import { handleHealthCheck } from '../handlers/handle-health-check';
import { handleLinkCheck } from '../handlers/handle-link-check';
import { handleSendFrame } from '../handlers/handle-send-frame';
import { handleReadFileAndSend } from '../handlers/handle-read-file-and-send';
import {
  testGlobalConfig,
  sendFrameCommandConfig,
  loadCommandConfig,
} from '../fixtures/command-ingress-fixtures';
import { createCommandIngressState } from '../core/state';

function createFakeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const stateContainer = createCommandIngressState(testGlobalConfig);
  const taskService = {
    createTask: vi.fn().mockReturnValue({ instanceId: 'task-1' }),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    onSettled: vi.fn().mockResolvedValue(undefined),
    getInstance: vi.fn().mockReturnValue(undefined),
  };

  return {
    taskService: taskService as unknown as CommandContext['taskService'],
    sendService: {
      execute: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as CommandContext['sendService'],
    frameReader: { getFrame: vi.fn().mockReturnValue(undefined) } as unknown as CommandContext['frameReader'],
    connectionService: {} as unknown as CommandContext['connectionService'],
    connectionSnapshot: vi.fn().mockReturnValue({ runtimeFacts: [] }),
    receiveSnapshot: vi.fn().mockReturnValue({}),
    platformFileReader: vi.fn().mockResolvedValue(['line1', 'line2']),
    stateReader: stateContainer.reader,
    stateWriter: stateContainer.writer,
    ...overrides,
  };
}

function buildParsedCommand(overrides: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    commandId: 'scoe-cmd-test-1',
    commandCode: '05',
    commandFunction: 'send_frame',
    rawBytes: [0x01, 0x05, 0xaa, 0xaa],
    resolvedParams: {},
    commandConfig: sendFrameCommandConfig,
    connectionId: 'conn-tcp-1',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

// --- dispatchCommand ---

describe('dispatchCommand', () => {
  it('returns error when no handler registered', async () => {
    const handlerMap = new Map<string, CommandHandler>();
    const cmd = buildParsedCommand();
    const ctx = createFakeContext();

    const result = await dispatchCommand(cmd, handlerMap, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler');
  });

  it('dispatches to registered handler', async () => {
    const mockHandler = vi.fn<Promise<CommandResult>, [ParsedCommand, CommandContext]>()
      .mockResolvedValue({ success: true });
    const handlerMap = new Map([['send_frame', mockHandler]]);
    const cmd = buildParsedCommand();
    const ctx = createFakeContext();

    const result = await dispatchCommand(cmd, handlerMap, ctx);
    expect(result.success).toBe(true);
    expect(mockHandler).toHaveBeenCalledWith(cmd, ctx);
  });
});

// --- handleLoadSatelliteId ---

describe('handleLoadSatelliteId', () => {
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

  it('rejects when satellite already loaded', async () => {
    const stateContainer = createCommandIngressState(testGlobalConfig);
    stateContainer.writer.setLoaded('SAT-01', []);
    const ctx = createFakeContext({
      stateReader: stateContainer.reader,
      stateWriter: stateContainer.writer,
    });

    const handler = createHandleLoadSatelliteId(satelliteConfigs);
    const cmd = buildParsedCommand({
      commandFunction: 'load_satellite_id',
      commandCode: '01',
      commandConfig: loadCommandConfig,
      rawBytes: new Array(20).fill(0),
    });
    // Put satellite ID bytes at offset 8 (4 bytes: 0x00, 0x00, 0x00, 0x01)
    cmd.rawBytes[8] = 0x00;
    cmd.rawBytes[9] = 0x00;
    cmd.rawBytes[10] = 0x00;
    cmd.rawBytes[11] = 0x01;

    const result = await handler(cmd, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already loaded');
  });

  it('loads satellite when ID matches config', async () => {
    const ctx = createFakeContext();
    const handler = createHandleLoadSatelliteId(satelliteConfigs);
    const rawBytes = new Array(20).fill(0);
    rawBytes[8] = 0x00;
    rawBytes[9] = 0x00;
    rawBytes[10] = 0x00;
    rawBytes[11] = 0x01;

    const cmd = buildParsedCommand({
      commandFunction: 'load_satellite_id',
      commandCode: '01',
      commandConfig: loadCommandConfig,
      rawBytes,
    });

    const result = await handler(cmd, ctx);
    expect(result.success).toBe(true);
    expect(ctx.stateReader.scoeFramesLoaded).toBe(true);
  });

  it('rejects unknown satellite ID', async () => {
    const ctx = createFakeContext();
    const handler = createHandleLoadSatelliteId(satelliteConfigs);
    const rawBytes = new Array(20).fill(0xff);

    const cmd = buildParsedCommand({
      commandFunction: 'load_satellite_id',
      commandCode: '01',
      commandConfig: loadCommandConfig,
      rawBytes,
    });

    const result = await handler(cmd, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown satellite');
  });
});

// --- handleUnloadSatelliteId ---

describe('handleUnloadSatelliteId', () => {
  it('rejects when no satellite loaded', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({ commandFunction: 'unload_satellite_id' });

    const result = await handleUnloadSatelliteId(cmd, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No satellite');
  });

  it('resets runtime state when loaded', async () => {
    const ctx = createFakeContext();
    ctx.stateWriter.setLoaded('SAT-01', []);
    ctx.stateWriter.incrementReceiveCount();

    const cmd = buildParsedCommand({ commandFunction: 'unload_satellite_id' });
    const result = await handleUnloadSatelliteId(cmd, ctx);

    expect(result.success).toBe(true);
    expect(ctx.stateReader.scoeFramesLoaded).toBe(false);
    expect(ctx.stateReader.loadedSatelliteId).toBe('');
  });
});

// --- handleHealthCheck / handleLinkCheck ---

describe('handleHealthCheck', () => {
  it('succeeds and updates healthStatus based on connection snapshot', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({ commandFunction: 'health_check' });

    const result = await handleHealthCheck(cmd, ctx);
    expect(result.success).toBe(true);
    expect(ctx.connectionSnapshot).toHaveBeenCalled();
    // Default fake snapshot has no runtimeFacts → error
    expect(ctx.stateReader.getSnapshot().healthStatus).toBe('error');
  });
});

describe('handleLinkCheck', () => {
  it('succeeds and updates linkTestResult based on receive snapshot', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({ commandFunction: 'link_check' });

    const result = await handleLinkCheck(cmd, ctx);
    expect(result.success).toBe(true);
    expect(ctx.receiveSnapshot).toHaveBeenCalled();
    // Default fake snapshot is non-null → pass
    expect(ctx.stateReader.getSnapshot().linkTestResult).toBe('pass');
  });

  it('sets linkTestResult to fail when receive snapshot is null', async () => {
    const ctx = createFakeContext({
      receiveSnapshot: vi.fn().mockReturnValue(null),
    });
    const cmd = buildParsedCommand({ commandFunction: 'link_check' });

    const result = await handleLinkCheck(cmd, ctx);
    expect(result.success).toBe(true);
    expect(ctx.stateReader.getSnapshot().linkTestResult).toBe('fail');
  });
});

// --- handleSendFrame ---

describe('handleSendFrame', () => {
  it('rejects when satellite not loaded', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand();

    const result = await handleSendFrame(cmd, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not loaded');
  });

  it('creates and starts task when loaded', async () => {
    const ctx = createFakeContext();
    ctx.stateWriter.setLoaded('SAT-01', [sendFrameCommandConfig]);

    const cmd = buildParsedCommand();
    const result = await handleSendFrame(cmd, ctx);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(ctx.taskService.createTask).toHaveBeenCalled();
    expect(ctx.taskService.startTask).toHaveBeenCalledWith('task-1');
    expect(ctx.stateReader.getSnapshot().commandReceiveCount).toBe(1);
  });
});

// --- handleReadFileAndSend ---

describe('handleReadFileAndSend', () => {
  it('rejects when satellite not loaded', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({ commandFunction: 'read_file_and_send' });

    const result = await handleReadFileAndSend(cmd, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not loaded');
  });

  it('rejects when no file param found', async () => {
    const ctx = createFakeContext();
    ctx.stateWriter.setLoaded('SAT-01', [sendFrameCommandConfig]);

    const cmd = buildParsedCommand({
      commandFunction: 'read_file_and_send',
      commandConfig: {
        ...sendFrameCommandConfig,
        params: undefined,
      },
    });

    const result = await handleReadFileAndSend(cmd, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No file parameter');
  });

  it('creates task from file content', async () => {
    const ctx = createFakeContext();
    ctx.stateWriter.setLoaded('SAT-01', [sendFrameCommandConfig]);

    const cmd = buildParsedCommand({
      commandFunction: 'read_file_and_send',
      commandConfig: {
        ...sendFrameCommandConfig,
        params: [
          {
            id: 'param-file',
            label: 'File',
            value: 'test.txt',
            type: 'string',
            offset: 13,
            length: 1,
            options: [],
          },
        ],
      },
    });

    const result = await handleReadFileAndSend(cmd, ctx);
    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(ctx.platformFileReader).toHaveBeenCalled();
  });
});
