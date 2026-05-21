/**
 * T014: Command-ingress two-phase state machine integration test
 *
 * Exercises the real state container (createCommandIngressState) wired to the
 * real SCOE protocol adapter (createScoeProtocolAdapter). No fakes, no mocks
 * on the state layer -- the adapter reads live state that the writer mutates.
 *
 * Phase 1 (scoeFramesLoaded=false): only LOAD_SATELLITE_ID (code '01') matches.
 * Phase 2 (scoeFramesLoaded=true):  all valid SCOE commands match.
 * UNLOAD resets to phase 1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createScoeProtocolAdapter } from '@/features/command-ingress/adapters/scoe-protocol-adapter';
import { createCommandIngressState } from '@/features/command-ingress/core/state';
import type {
  ScoeGlobalConfig,
  ScoeCommandConfig,
  ParsedCommand,
} from '@/features/command-ingress/core';
import type { TransportEventSnapshot } from '@/features/connection';

// ---------------------------------------------------------------------------
// Fixtures (self-contained, no external fixture imports)
// ---------------------------------------------------------------------------

const globalConfig: ScoeGlobalConfig = {
  scoeIdentifier: '0x55',
  tcpServerIp: '0.0.0.0',
  tcpServerPort: 6000,
  tcpServerAutoConnect: false,
  udpIpAddress: '127.0.0.1',
  udpPort: 7000,
  udpTargetId: 'network:scoe-udp:remote',
  messageIdentifierOffset: 4,
  sourceIdentifierOffset: 5,
  destinationIdentifierOffset: 6,
  modelIdOffset: 7,
  satelliteIdOffset: 8,
  functionCodeOffset: 0,
};

const loadCommand: ScoeCommandConfig = {
  id: 'cmd-load',
  label: 'LOAD_SATELLITE_ID',
  code: '01',
  function: 'load_satellite_id',
  checksums: [],
  params: [],
};

const unloadCommand: ScoeCommandConfig = {
  id: 'cmd-unload',
  label: 'UNLOAD_SATELLITE_ID',
  code: '02',
  function: 'unload_satellite_id',
  checksums: [],
  params: [],
};

const healthCommand: ScoeCommandConfig = {
  id: 'cmd-health',
  label: 'HEALTH_CHECK',
  code: '03',
  function: 'health_check',
  checksums: [],
  params: [],
};

const sendFrameCommand: ScoeCommandConfig = {
  id: 'cmd-send',
  label: 'SEND_FRAME',
  code: '05',
  function: 'send_frame',
  checksums: [
    { enabled: true, offset: 4, length: 4, checksumOffset: 8 },
  ],
  params: [],
};

const baseCommandConfigs: ScoeCommandConfig[] = [
  loadCommand,
  unloadCommand,
  healthCommand,
  sendFrameCommand,
];

/** Satellite-specific commands revealed after LOAD. */
const satelliteSendFrame: ScoeCommandConfig = {
  id: 'sat-cmd-send',
  label: 'SAT_SEND_FRAME',
  code: '05',
  function: 'send_frame',
  checksums: [],
  params: [],
};

const satelliteCommands: ScoeCommandConfig[] = [satelliteSendFrame];

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

let nextEventId = 1;

function resetIds(): void {
  nextEventId = 1;
}

function makeDataEvent(bytes: number[], connectionId = 'conn-tcp-1'): TransportEventSnapshot {
  return {
    id: `evt-${nextEventId++}`,
    kind: 'data',
    connectionId,
    occurredAt: new Date().toISOString(),
    bytes,
    byteLength: bytes.length,
  };
}

function makeNonDataEvent(kind: TransportEventSnapshot['kind'], connectionId = 'conn-tcp-1'): TransportEventSnapshot {
  return {
    id: `evt-${nextEventId++}`,
    kind,
    connectionId,
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Build a SCOE-compatible byte array:
 *   byte[fcOffset]   = identifier (0x55)
 *   byte[fcOffset+1] = commandCode
 *   byte[fcOffset+2] = 0xAA
 *   byte[fcOffset+3] = 0xAA
 *   + optional extra bytes appended after
 */
function buildScoeBytes(commandCode: number, extra: number[] = []): number[] {
  const fcOffset = globalConfig.functionCodeOffset;
  const identByte = parseInt(globalConfig.scoeIdentifier.replace(/^0x/i, ''), 16);
  const frame: number[] = [];
  while (frame.length < fcOffset + 4) frame.push(0);
  frame[fcOffset] = identByte;
  frame[fcOffset + 1] = commandCode;
  frame[fcOffset + 2] = 0xaa;
  frame[fcOffset + 3] = 0xaa;
  return [...frame, ...extra];
}

/**
 * Build SCOE bytes + append a valid checksum for `sendFrameCommand`.
 * Checksum config: offset=4, length=4, checksumOffset=8.
 */
function buildScoeBytesWithChecksum(commandCode: number): number[] {
  const extra = [0x10, 0x20, 0x30, 0x40]; // 4 payload bytes
  const frame = buildScoeBytes(commandCode, extra);
  // Ensure frame long enough for checksum byte at offset 8
  while (frame.length <= 8) frame.push(0);
  const cs = sendFrameCommand.checksums[0]!;
  let sum = 0;
  for (let i = cs.offset; i < cs.offset + cs.length; i++) {
    sum += frame[i] ?? 0;
  }
  frame[cs.checksumOffset] = sum % 256;
  return frame;
}

/** Bytes that do NOT match SCOE identifier. */
function buildNonScoeBytes(): number[] {
  return [0xde, 0xad, 0xbe, 0xef, 0x00, 0x00];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIds();
});

describe('T014: Command-ingress two-phase state machine', () => {
  // -----------------------------------------------------------------------
  // 1. Phase 1: only LOAD matches
  // -----------------------------------------------------------------------
  describe('phase 1 — only LOAD_SATELLITE_ID is consumed', () => {
    it('consumes LOAD event, leaves non-SCOE and non-LOAD SCOE events in remaining', async () => {
      const { reader } = createCommandIngressState(globalConfig);
      expect(reader.scoeFramesLoaded).toBe(false);

      const onCommand = vi.fn();
      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
        onCommand,
      });

      const nonScoeEvent = makeDataEvent(buildNonScoeBytes());
      const scoeNonLoadEvent = makeDataEvent(buildScoeBytes(0x02)); // UNLOAD (code 02)
      const scoeLoadEvent = makeDataEvent(buildScoeBytes(0x01));    // LOAD (code 01)

      const result = await adapter.consume([nonScoeEvent, scoeNonLoadEvent, scoeLoadEvent]);

      expect(result.consumed).toEqual([scoeLoadEvent]);
      expect(result.remaining).toEqual([nonScoeEvent, scoeNonLoadEvent]);

      // onCommand called once for the LOAD
      expect(onCommand).toHaveBeenCalledOnce();
      const parsed: ParsedCommand = onCommand.mock.calls[0][0];
      expect(parsed.commandCode).toBe('01');
      expect(parsed.commandFunction).toBe('load_satellite_id');

      // State unchanged — adapter does not transition state; handler does.
      expect(reader.scoeFramesLoaded).toBe(false);
    });

    it('phase 1 rejects HEALTH_CHECK, SEND_FRAME, and UNLOAD', async () => {
      const { reader } = createCommandIngressState(globalConfig);
      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const healthEvent = makeDataEvent(buildScoeBytes(0x03));
      const sendEvent = makeDataEvent(buildScoeBytes(0x05));
      const unloadEvent = makeDataEvent(buildScoeBytes(0x02));

      const result = await adapter.consume([healthEvent, sendEvent, unloadEvent]);
      expect(result.consumed).toHaveLength(0);
      expect(result.remaining).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Phase 2: all SCOE commands available
  // -----------------------------------------------------------------------
  describe('phase 2 — all SCOE commands are consumed', () => {
    it('after setLoaded, all valid SCOE events are consumed', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-99', satelliteCommands);
      expect(reader.scoeFramesLoaded).toBe(true);

      const onCommand = vi.fn();
      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
        onCommand,
      });

      const loadEvent = makeDataEvent(buildScoeBytes(0x01));
      const unloadEvent = makeDataEvent(buildScoeBytes(0x02));
      const healthEvent = makeDataEvent(buildScoeBytes(0x03));
      const sendEvent = makeDataEvent(buildScoeBytesWithChecksum(0x05));

      const result = await adapter.consume([loadEvent, unloadEvent, healthEvent, sendEvent]);

      expect(result.consumed).toEqual([loadEvent, unloadEvent, healthEvent, sendEvent]);
      expect(result.remaining).toEqual([]);

      expect(onCommand).toHaveBeenCalledTimes(4);
      const functions = onCommand.mock.calls.map((c: [ParsedCommand]) => c[0].commandFunction);
      expect(functions).toEqual([
        'load_satellite_id',
        'unload_satellite_id',
        'health_check',
        'send_frame',
      ]);
    });

    it('non-SCOE data events still go to remaining in phase 2', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-99', satelliteCommands);

      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const scoeEvent = makeDataEvent(buildScoeBytes(0x01));
      const nonScoe1 = makeDataEvent(buildNonScoeBytes());
      const nonScoe2 = makeDataEvent([0x10, 0x20, 0x30, 0x40, 0x50, 0x60]);

      const result = await adapter.consume([scoeEvent, nonScoe1, nonScoe2]);
      expect(result.consumed).toEqual([scoeEvent]);
      expect(result.remaining).toEqual([nonScoe1, nonScoe2]);
    });
  });

  // -----------------------------------------------------------------------
  // 3. UNLOAD resets to phase 1
  // -----------------------------------------------------------------------
  describe('resetRuntimeState returns to phase 1', () => {
    it('after LOAD then reset, non-LOAD SCOE events go to remaining again', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);

      // Transition to phase 2
      writer.setLoaded('SAT-01', satelliteCommands);
      expect(reader.scoeFramesLoaded).toBe(true);

      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      // Verify phase 2 works
      const phase2Load = makeDataEvent(buildScoeBytes(0x01));
      const phase2Send = makeDataEvent(buildScoeBytes(0x05));
      const phase2Result = await adapter.consume([phase2Load, phase2Send]);
      expect(phase2Result.consumed).toHaveLength(2);

      // Reset to phase 1
      writer.resetRuntimeState();
      expect(reader.scoeFramesLoaded).toBe(false);
      expect(reader.loadedSatelliteId).toBe('');

      // Re-create adapter so it picks up fresh state
      const adapterPhase1 = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const nonLoadEvent = makeDataEvent(buildScoeBytes(0x05));
      const loadEvent = makeDataEvent(buildScoeBytes(0x01));

      const result = await adapterPhase1.consume([nonLoadEvent, loadEvent]);
      expect(result.consumed).toEqual([loadEvent]);
      expect(result.remaining).toEqual([nonLoadEvent]);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Checksum validation
  // -----------------------------------------------------------------------
  describe('checksum validation', () => {
    it('valid checksum passes and event is consumed with parsed command', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-01', satelliteCommands);

      const onCommand = vi.fn();
      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
        onCommand,
      });

      const bytes = buildScoeBytesWithChecksum(0x05);
      const event = makeDataEvent(bytes);

      const result = await adapter.consume([event]);
      expect(result.consumed).toHaveLength(1);
      expect(result.remaining).toHaveLength(0);

      expect(onCommand).toHaveBeenCalledOnce();
      const parsed: ParsedCommand = onCommand.mock.calls[0][0];
      expect(parsed.commandCode).toBe('05');
      expect(parsed.commandFunction).toBe('send_frame');
      expect(parsed.rawBytes).toEqual(bytes);
    });

    it('invalid checksum triggers onParseError and event is still consumed', async () => {
      // Use an empty satellite config list so getCommandConfigs() returns
      // baseCommandConfigs intact — sendFrameCommand has checksums enabled.
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-01', []); // empty satellite configs → base built-ins prevail

      const onCommand = vi.fn();
      const onParseError = vi.fn();
      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
        onCommand,
        onParseError,
      });

      // Build valid frame then corrupt the checksum byte
      const bytes = buildScoeBytesWithChecksum(0x05);
      const cs = sendFrameCommand.checksums[0]!;
      bytes[cs.checksumOffset] = 0xff; // corrupt

      const event = makeDataEvent(bytes);

      const result = await adapter.consume([event]);

      // canHandle passes (byte-level check only), so event is consumed
      expect(result.consumed).toHaveLength(1);

      // parse() throws checksum error, so onCommand is NOT called
      expect(onCommand).not.toHaveBeenCalled();

      // onParseError is called with the error and raw bytes
      expect(onParseError).toHaveBeenCalledOnce();
      const [error, rawBytes] = onParseError.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/Checksum failed/);
      expect(rawBytes).toEqual(bytes);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Command dispatch callback (onCommand)
  // -----------------------------------------------------------------------
  describe('onCommand callback', () => {
    it('receives ParsedCommand with correct fields for each consumed event', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-01', satelliteCommands);

      const parsedCommands: ParsedCommand[] = [];
      const onCommand = vi.fn((p: ParsedCommand) => parsedCommands.push(p));

      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
        onCommand,
      });

      const loadBytes = buildScoeBytes(0x01);
      const unloadBytes = buildScoeBytes(0x02);
      const healthBytes = buildScoeBytes(0x03);

      const loadEvent = makeDataEvent(loadBytes);
      const unloadEvent = makeDataEvent(unloadBytes);
      const healthEvent = makeDataEvent(healthBytes);

      await adapter.consume([loadEvent, unloadEvent, healthEvent]);

      expect(onCommand).toHaveBeenCalledTimes(3);

      // LOAD
      expect(parsedCommands[0].commandCode).toBe('01');
      expect(parsedCommands[0].commandFunction).toBe('load_satellite_id');
      expect(parsedCommands[0].commandId).toBe(`scoe-cmd-${loadEvent.id}`);
      expect(parsedCommands[0].rawBytes).toEqual(loadBytes);
      expect(parsedCommands[0].connectionId).toBe('conn-tcp-1');
      expect(parsedCommands[0].occurredAt).toBe(loadEvent.occurredAt);

      // UNLOAD
      expect(parsedCommands[1].commandCode).toBe('02');
      expect(parsedCommands[1].commandFunction).toBe('unload_satellite_id');
      expect(parsedCommands[1].commandId).toBe(`scoe-cmd-${unloadEvent.id}`);

      // HEALTH
      expect(parsedCommands[2].commandCode).toBe('03');
      expect(parsedCommands[2].commandFunction).toBe('health_check');
    });

    it('onCommand is not called when onParseError fires', async () => {
      // Empty satellite configs so base sendFrameCommand (with checksums) is used
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-01', []);

      const onCommand = vi.fn();
      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: [sendFrameCommand], // only command with checksum
        stateReader: reader,
        onCommand,
      });

      const bytes = buildScoeBytesWithChecksum(0x05);
      bytes[sendFrameCommand.checksums[0]!.checksumOffset] = 0xff;

      await adapter.consume([makeDataEvent(bytes)]);

      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Non-data events ignored
  // -----------------------------------------------------------------------
  describe('non-data events go to remaining', () => {
    it('connected, disconnected, error events are all remaining', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-01', satelliteCommands);

      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const connectedEvent = makeNonDataEvent('connected');
      const disconnectedEvent = makeNonDataEvent('disconnected');
      const errorEvent = makeNonDataEvent('error');
      const dataEvent = makeDataEvent(buildScoeBytes(0x01));

      const result = await adapter.consume([connectedEvent, disconnectedEvent, errorEvent, dataEvent]);

      expect(result.consumed).toEqual([dataEvent]);
      expect(result.remaining).toEqual([connectedEvent, disconnectedEvent, errorEvent]);
    });

    it('data event without bytes field goes to remaining', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);
      writer.setLoaded('SAT-01', satelliteCommands);

      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const eventNoBytes: TransportEventSnapshot = {
        id: 'evt-no-bytes',
        kind: 'data',
        connectionId: 'conn-tcp-1',
        occurredAt: new Date().toISOString(),
        // bytes is undefined
      };

      const result = await adapter.consume([eventNoBytes]);
      expect(result.consumed).toHaveLength(0);
      expect(result.remaining).toEqual([eventNoBytes]);
    });

    it('mix of non-data and non-SCOE data in phase 1', async () => {
      const { reader } = createCommandIngressState(globalConfig);
      // Phase 1: not loaded

      const adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const connected = makeNonDataEvent('connected');
      const nonScoeData = makeDataEvent(buildNonScoeBytes());
      const scoeNonLoad = makeDataEvent(buildScoeBytes(0x05)); // SEND_FRAME in phase 1
      const scoeLoad = makeDataEvent(buildScoeBytes(0x01));

      const result = await adapter.consume([connected, nonScoeData, scoeNonLoad, scoeLoad]);

      expect(result.consumed).toEqual([scoeLoad]);
      expect(result.remaining).toEqual([connected, nonScoeData, scoeNonLoad]);
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle: phase 1 -> LOAD -> phase 2 -> UNLOAD -> phase 1
  // -----------------------------------------------------------------------
  describe('full lifecycle', () => {
    it('phase 1 -> LOAD -> phase 2 -> reset -> phase 1 round-trip', async () => {
      const { reader, writer } = createCommandIngressState(globalConfig);

      // --- Phase 1 ---
      expect(reader.scoeFramesLoaded).toBe(false);

      let adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const phase1Send = makeDataEvent(buildScoeBytes(0x05));
      let result = await adapter.consume([phase1Send]);
      expect(result.consumed).toHaveLength(0);
      expect(result.remaining).toEqual([phase1Send]);

      // --- Transition to phase 2 ---
      writer.setLoaded('SAT-LC', satelliteCommands);
      expect(reader.scoeFramesLoaded).toBe(true);

      // Re-create adapter to pick up new state (reader is same object, so technically
      // the old adapter would also see it, but we create fresh to simulate a real cycle)
      adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const phase2Load = makeDataEvent(buildScoeBytes(0x01));
      const phase2Health = makeDataEvent(buildScoeBytes(0x03));
      const phase2Send = makeDataEvent(buildScoeBytes(0x05));
      result = await adapter.consume([phase2Load, phase2Health, phase2Send]);
      expect(result.consumed).toHaveLength(3);
      expect(result.remaining).toHaveLength(0);

      // --- Reset back to phase 1 ---
      writer.resetRuntimeState();
      expect(reader.scoeFramesLoaded).toBe(false);

      adapter = createScoeProtocolAdapter({
        globalConfig,
        commandConfigs: baseCommandConfigs,
        stateReader: reader,
      });

      const backToPhase1Send = makeDataEvent(buildScoeBytes(0x05));
      const backToPhase1Load = makeDataEvent(buildScoeBytes(0x01));
      result = await adapter.consume([backToPhase1Send, backToPhase1Load]);
      expect(result.consumed).toEqual([backToPhase1Load]);
      expect(result.remaining).toEqual([backToPhase1Send]);
    });
  });
});
