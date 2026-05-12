import { describe, expect, it, vi } from 'vitest';
import { sendAckFrame } from '../handlers/send-ack-frame';
import type { ParsedCommand } from '../core/protocol-adapter';
import type { CommandContext } from '../core/handler';
import {
  testGlobalConfig,
  sendFrameCommandConfig,
} from '../fixtures/command-ingress-fixtures';
import { createCommandIngressState } from '../core/state';

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

function createFakeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const stateContainer = createCommandIngressState(testGlobalConfig);
  return {
    taskService: {} as unknown as CommandContext['taskService'],
    sendService: {
      execute: vi.fn().mockResolvedValue({ kind: 'sent' }),
    } as unknown as CommandContext['sendService'],
    frameReader: {
      getFrame: vi.fn().mockReturnValue({ id: 'ack-frame-001', name: 'Ack Frame' }),
    } as unknown as CommandContext['frameReader'],
    connectionService: {} as unknown as CommandContext['connectionService'],
    connectionSnapshot: vi.fn().mockReturnValue({ runtimeFacts: [] }),
    receiveSnapshot: vi.fn().mockReturnValue({}),
    platformFileReader: vi.fn().mockResolvedValue([]),
    stateReader: stateContainer.reader,
    stateWriter: stateContainer.writer,
    ...overrides,
  };
}

// --- C21: FrameAssetReader.getFrame() verification ---

describe('sendAckFrame – C21: frameReader.getFrame() verification', () => {
  it('calls getFrame with command-level successFrameId', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        successFrameId: 'cmd-ack-frame',
      },
    });

    await sendAckFrame(cmd, ctx);

    expect(ctx.frameReader.getFrame).toHaveBeenCalledWith('cmd-ack-frame');
  });

  it('falls back to global successFrameId when command has none', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        successFrameId: undefined,
      },
    });

    await sendAckFrame(cmd, ctx);

    // testGlobalConfig.successFrameId = 'ack-frame-001'
    expect(ctx.frameReader.getFrame).toHaveBeenCalledWith('ack-frame-001');
  });

  it('returns early without calling sendService when no successFrameId anywhere', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        successFrameId: undefined,
      },
    });
    // Override global config to have no successFrameId
    const stateContainer = createCommandIngressState({
      ...testGlobalConfig,
      successFrameId: undefined,
    });
    ctx.stateReader = stateContainer.reader;

    await sendAckFrame(cmd, ctx);

    expect(ctx.sendService.execute).not.toHaveBeenCalled();
  });

  it('returns early when frameReader returns undefined', async () => {
    const ctx = createFakeContext({
      frameReader: { getFrame: vi.fn().mockReturnValue(undefined) } as unknown as CommandContext['frameReader'],
    });
    const cmd = buildParsedCommand();

    await sendAckFrame(cmd, ctx);

    expect(ctx.frameReader.getFrame).toHaveBeenCalled();
    expect(ctx.sendService.execute).not.toHaveBeenCalled();
  });
});

// --- C22-int: sendService.execute() verification ---

describe('sendAckFrame – C22-int: sendService.execute() verification', () => {
  it('sends ack with command-level targetId from frameMappings', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand();

    await sendAckFrame(cmd, ctx);

    expect(ctx.sendService.execute).toHaveBeenCalledWith({
      frameId: 'ack-frame-001',
      targetId: 'network:scoe-udp:scoe-udp-remote',
      userFieldValues: {},
    });
  });

  it('falls back to global udpTargetId when no frameMappings', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        frameMappings: undefined,
      },
    });

    await sendAckFrame(cmd, ctx);

    expect(ctx.sendService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'network:scoe-udp:scoe-udp-remote',
      }),
    );
  });

  it('sends with empty userFieldValues', async () => {
    const ctx = createFakeContext();
    const cmd = buildParsedCommand();

    await sendAckFrame(cmd, ctx);

    const call = (ctx.sendService.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(call.userFieldValues).toEqual({});
  });
});
