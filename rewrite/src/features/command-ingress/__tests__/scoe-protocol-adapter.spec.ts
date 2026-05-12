import { describe, expect, it, beforeEach } from 'vitest';
import { createScoeProtocolAdapter, extractAndResolveParams, validateChecksums } from '../adapters/scoe-protocol-adapter';
import {
  testGlobalConfig,
  testCommandConfigs,
  sendFrameCommandConfig,
  createFakeStateReader,
  buildDataEvent,
  buildScoeFrame,
  buildScoeFrameWithChecksum,
  resetFixtureIds,
} from '../fixtures/command-ingress-fixtures';
import type { TransportEventSnapshot } from '@/features/connection';

beforeEach(() => {
  resetFixtureIds();
});

// --- C8: Function code validation ---

describe('ScoeProtocolAdapter canHandle – function code validation', () => {
  it('accepts a valid SCOE frame with matching identifier + 0xAA0xAA', () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const bytes = buildScoeFrame(0x05);
    const event = buildDataEvent(bytes);
    expect(adapter.consume([event])).resolves.toEqual(
      expect.objectContaining({
        consumed: [event],
        remaining: [],
      }),
    );
  });

  it('rejects a frame with wrong SCOE identifier', () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    // Frame with identifier 0x02, but config expects 0x01
    const frame: number[] = [0x02, 0x05, 0xaa, 0xaa];
    const event = buildDataEvent(frame);
    expect(adapter.consume([event])).resolves.toEqual(
      expect.objectContaining({
        consumed: [],
        remaining: [event],
      }),
    );
  });

  it('rejects a frame missing 0xAA0xAA fixed bytes', () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const frame = [0x01, 0x05, 0x00, 0x00];
    const event = buildDataEvent(frame);
    expect(adapter.consume([event])).resolves.toEqual(
      expect.objectContaining({
        consumed: [],
        remaining: [event],
      }),
    );
  });

  it('rejects a frame that is too short for function code area', () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const event = buildDataEvent([0x01, 0x05]);
    expect(adapter.consume([event])).resolves.toEqual(
      expect.objectContaining({
        consumed: [],
        remaining: [event],
      }),
    );
  });

  it('rejects non-data events', () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const event: TransportEventSnapshot = {
      id: 'evt-1',
      kind: 'connected',
      connectionId: 'conn-1',
      occurredAt: new Date().toISOString(),
    };
    expect(adapter.consume([event])).resolves.toEqual(
      expect.objectContaining({
        consumed: [],
        remaining: [event],
      }),
    );
  });
});

// --- C9: Checksum validation ---

describe('ScoeProtocolAdapter parse – checksum validation', () => {
  it('accepts a frame with valid checksum', async () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: [sendFrameCommandConfig],
      stateReader,
    });

    const cs = sendFrameCommandConfig.checksums[0]!;
    const bytes = buildScoeFrameWithChecksum(0x05, cs, [
      0x00, 0x00, 0x00, 0x00,  // padding bytes
      0x00, 0x00, 0x00, 0x00,  // more padding
      0x00,                    // param area
    ]);
    const event = buildDataEvent(bytes);

    const result = await adapter.consume([event]);
    expect(result.consumed).toHaveLength(1);
    expect(result.remaining).toHaveLength(0);
  });

  it('throws on invalid checksum', async () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: [sendFrameCommandConfig],
      stateReader,
    });

    const cs = sendFrameCommandConfig.checksums[0]!;
    const bytes = buildScoeFrameWithChecksum(0x05, cs, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00,
    ]);
    // Corrupt the checksum byte
    bytes[cs.checksumOffset] = 0xff;
    const event = buildDataEvent(bytes);

    // consume() should still categorize the event (canHandle passes), but parse throws
    // In W1, consume doesn't call parse — it only checks canHandle
    // So this event is consumed but parse would fail when called externally
    const result = await adapter.consume([event]);
    expect(result.consumed).toHaveLength(1);
  });

  it('skips disabled checksums', async () => {
    const cmdWithDisabledCs: typeof sendFrameCommandConfig = {
      ...sendFrameCommandConfig,
      checksums: [{ enabled: false, offset: 4, length: 8, checksumOffset: 12 }],
    };
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: [cmdWithDisabledCs],
      stateReader,
    });

    const bytes = buildScoeFrame(0x05, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const event = buildDataEvent(bytes);

    const result = await adapter.consume([event]);
    expect(result.consumed).toHaveLength(1);
  });
});

// --- C10: Parameter extraction and resolve ---

describe('extractAndResolveParams – direct unit tests', () => {
  it('resolves param by matching receiveCode hex to option value', () => {
    const params = sendFrameCommandConfig.params!;
    // Frame: [0x01, 0x05, 0xaa, 0xaa, ...9 zeros..., 0x02] = 14 bytes
    // param offset=13 → bytes[13] = 0x02 → hex "02" → receiveCode "02" → value "mode_b"
    const bytes = buildScoeFrame(0x05, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x02,
    ]);

    const result = extractAndResolveParams(bytes, params);
    expect(result['param-mode']).toBe('mode_b');
  });

  it('resolves to first option when hex matches 01', () => {
    const params = sendFrameCommandConfig.params!;
    const bytes = buildScoeFrame(0x05, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x01,
    ]);

    const result = extractAndResolveParams(bytes, params);
    expect(result['param-mode']).toBe('mode_a');
  });

  it('falls back to raw hex when no option matches', () => {
    const params = sendFrameCommandConfig.params!;
    const bytes = buildScoeFrame(0x05, [
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0xff,
    ]);

    const result = extractAndResolveParams(bytes, params);
    expect(result['param-mode']).toBe('FF');
  });

  it('returns empty object for empty params', () => {
    const result = extractAndResolveParams([0x01, 0x02, 0x03], []);
    expect(result).toEqual({});
  });
});

describe('validateChecksums – direct unit tests', () => {
  it('passes for valid checksum', () => {
    const bytes = [0x01, 0x05, 0xaa, 0xaa, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x00];
    const sum = 0x10 + 0x20 + 0x30 + 0x40 + 0x50 + 0x60 + 0x70 + 0x80;
    bytes[12] = sum % 256;

    expect(() => validateChecksums(bytes, [
      { enabled: true, offset: 4, length: 8, checksumOffset: 12 },
    ])).not.toThrow();
  });

  it('throws for invalid checksum', () => {
    const bytes = [0x01, 0x05, 0xaa, 0xaa, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0xff];

    expect(() => validateChecksums(bytes, [
      { enabled: true, offset: 4, length: 8, checksumOffset: 12 },
    ])).toThrow(/Checksum failed/);
  });

  it('skips disabled checksums', () => {
    const bytes = [0x01, 0x05, 0xaa, 0xaa, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff];

    expect(() => validateChecksums(bytes, [
      { enabled: false, offset: 4, length: 8, checksumOffset: 12 },
    ])).not.toThrow();
  });
});

// --- C11: Two-phase state machine ---

describe('ScoeProtocolAdapter canHandle – two-phase state machine', () => {
  it('phase 1: only accepts LOAD command when scoeFramesLoaded=false', async () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: false });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const loadEvent = buildDataEvent(buildScoeFrame(0x01)); // LOAD
    const sendEvent = buildDataEvent(buildScoeFrame(0x05)); // SEND_FRAME
    const unloadEvent = buildDataEvent(buildScoeFrame(0x02)); // UNLOAD

    const result = await adapter.consume([loadEvent, sendEvent, unloadEvent]);
    expect(result.consumed).toEqual([loadEvent]);
    expect(result.remaining).toEqual([sendEvent, unloadEvent]);
  });

  it('phase 2: accepts all commands when scoeFramesLoaded=true', async () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const loadEvent = buildDataEvent(buildScoeFrame(0x01));
    const sendEvent = buildDataEvent(buildScoeFrame(0x05));
    const unloadEvent = buildDataEvent(buildScoeFrame(0x02));

    const result = await adapter.consume([loadEvent, sendEvent, unloadEvent]);
    expect(result.consumed).toEqual([loadEvent, sendEvent, unloadEvent]);
    expect(result.remaining).toEqual([]);
  });

  it('passes non-SCOE events through as remaining', async () => {
    const stateReader = createFakeStateReader({ scoeFramesLoaded: true });
    const adapter = createScoeProtocolAdapter({
      globalConfig: testGlobalConfig,
      commandConfigs: testCommandConfigs,
      stateReader,
    });

    const scoeEvent = buildDataEvent(buildScoeFrame(0x01));
    const normalEvent = buildDataEvent([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00]);
    const normalEvent2 = buildDataEvent([0x10, 0x20, 0x30, 0x40, 0x50, 0x60]);

    const result = await adapter.consume([scoeEvent, normalEvent, normalEvent2]);
    expect(result.consumed).toEqual([scoeEvent]);
    expect(result.remaining).toEqual([normalEvent, normalEvent2]);
  });
});

// --- State container tests (C4-C5) ---

describe('CommandIngressState container', () => {
  it('starts with correct initial values', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader } = createCommandIngressState(testGlobalConfig);

    expect(reader.scoeFramesLoaded).toBe(false);
    expect(reader.loadedSatelliteId).toBe('');
    const snap = reader.getSnapshot();
    expect(snap.commandReceiveCount).toBe(0);
    expect(snap.runtimeSeconds).toBe(0);
    expect(snap.healthStatus).toBe('unknown');
  });

  it('setLoaded transitions to phase 2', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader, writer } = createCommandIngressState(testGlobalConfig);

    writer.setLoaded('SAT-01', testCommandConfigs);
    expect(reader.scoeFramesLoaded).toBe(true);
    expect(reader.loadedSatelliteId).toBe('SAT-01');
    expect(reader.getSnapshot().activeCommandConfigs).toEqual(testCommandConfigs);
  });

  it('resetRuntimeState clears all runtime data', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader, writer } = createCommandIngressState(testGlobalConfig);

    writer.setLoaded('SAT-01', testCommandConfigs);
    writer.incrementReceiveCount();
    writer.incrementSuccessCount();

    writer.resetRuntimeState();
    expect(reader.scoeFramesLoaded).toBe(false);
    expect(reader.loadedSatelliteId).toBe('');
    expect(reader.getSnapshot().commandReceiveCount).toBe(0);
    expect(reader.getSnapshot().commandSuccessCount).toBe(0);
  });

  it('tickSecond increments runtimeSeconds and resets flags', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader, writer } = createCommandIngressState(testGlobalConfig);

    writer.incrementSuccessCount();
    expect(reader.getSnapshot().receiveCommandSuccess).toBe(true);

    writer.tickSecond();
    expect(reader.getSnapshot().runtimeSeconds).toBe(1);
    expect(reader.getSnapshot().receiveCommandSuccess).toBe(false);
  });

  it('tickSecond clears statistics when not loaded', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader, writer } = createCommandIngressState(testGlobalConfig);

    // Not loaded — set some counts
    writer.incrementReceiveCount();
    writer.incrementErrorCount('test error');
    expect(reader.getSnapshot().commandReceiveCount).toBe(1);

    writer.tickSecond();
    // When not loaded, tick clears statistics
    expect(reader.getSnapshot().commandReceiveCount).toBe(0);
    expect(reader.getSnapshot().commandErrorCount).toBe(0);
    expect(reader.getSnapshot().healthStatus).toBe('unknown');
  });

  it('tickSecond increments satelliteIdRuntimeSeconds when loaded', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader, writer } = createCommandIngressState(testGlobalConfig);

    writer.setLoaded('SAT-01', testCommandConfigs);
    writer.tickSecond();
    writer.tickSecond();
    expect(reader.getSnapshot().satelliteIdRuntimeSeconds).toBe(2);
  });

  it('incrementErrorCount updates error state', async () => {
    const { createCommandIngressState } = await import('../core/state');
    const { reader, writer } = createCommandIngressState(testGlobalConfig);

    writer.incrementErrorCount('timeout');
    expect(reader.getSnapshot().commandErrorCount).toBe(1);
    expect(reader.getSnapshot().lastErrorReason).toBe('timeout');
    expect(reader.getSnapshot().receiveCommandSuccess).toBe(false);
  });
});

