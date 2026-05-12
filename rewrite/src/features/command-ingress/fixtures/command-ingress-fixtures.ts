import type { ScoeGlobalConfig, ScoeCommandConfig, ChecksumConfig } from '../core';
import type { CommandIngressState, CommandIngressStateReader } from '../core';
import type { TransportEventSnapshot } from '@/features/connection';

// --- Global config fixture ---

export const testGlobalConfig: ScoeGlobalConfig = {
  scoeIdentifier: '0x01',
  tcpServerIp: '0.0.0.0',
  tcpServerPort: 6000,
  tcpServerAutoConnect: true,
  udpIpAddress: '127.0.0.1',
  udpPort: 7000,
  udpTargetId: 'network:scoe-udp:scoe-udp-remote',
  messageIdentifierOffset: 4,
  sourceIdentifierOffset: 5,
  destinationIdentifierOffset: 6,
  modelIdOffset: 7,
  satelliteIdOffset: 8,
  functionCodeOffset: 0,
  successFrameId: 'ack-frame-001',
};

// --- Command config fixtures ---

export const loadCommandConfig: ScoeCommandConfig = {
  id: 'cmd-load',
  label: 'LOAD_SATELLITE_ID',
  code: '01',
  function: 'load_satellite_id',
  checksums: [],
  params: [],
};

export const unloadCommandConfig: ScoeCommandConfig = {
  id: 'cmd-unload',
  label: 'UNLOAD_SATELLITE_ID',
  code: '02',
  function: 'unload_satellite_id',
  checksums: [],
  params: [],
};

export const sendFrameCommandConfig: ScoeCommandConfig = {
  id: 'cmd-send',
  label: 'SEND_FRAME',
  code: '05',
  function: 'send_frame',
  checksums: [
    { enabled: true, offset: 4, length: 8, checksumOffset: 12 },
  ],
  params: [
    {
      id: 'param-mode',
      label: 'Mode',
      value: '',
      type: 'string',
      offset: 13,
      length: 1,
      options: [
        { label: 'Mode A', value: 'mode_a', receiveCode: '01' },
        { label: 'Mode B', value: 'mode_b', receiveCode: '02' },
      ],
    },
  ],
  frameMappings: [
    {
      frameId: 'frame-001',
      instanceId: 'inst-001',
      targetId: 'network:scoe-udp:scoe-udp-remote',
      fieldMappings: [
        { fieldId: 'field-mode', source: 'param', paramId: 'param-mode' },
        { fieldId: 'field-fixed', source: 'fixed', fixedValue: 100 },
      ],
    },
  ],
  completionConditions: [
    {
      id: 'cond-001',
      label: 'Wait for ack',
      sourceFrameId: 'frame-ack',
      sourceFieldId: 'field-status',
      useParam: false,
      targetFixedValue: '1',
      operator: 'eq',
    },
  ],
  completionTimeout: 5000,
  sendInterval: 100,
};

export const testCommandConfigs: ScoeCommandConfig[] = [
  loadCommandConfig,
  unloadCommandConfig,
  sendFrameCommandConfig,
];

// --- State reader fixture ---

export function createFakeStateReader(
  overrides: Partial<CommandIngressState> = {},
): CommandIngressStateReader {
  const defaults: CommandIngressState = {
    commandReceiveCount: 0,
    commandSuccessCount: 0,
    commandErrorCount: 0,
    loadedSatelliteId: '',
    scoeFramesLoaded: false,
    healthStatus: 'unknown',
    linkTestResult: 'unknown',
    lastCommandCode: '',
    receiveCommandSuccess: false,
    runtimeSeconds: 0,
    satelliteIdRuntimeSeconds: 0,
    lastErrorReason: '',
    globalConfig: testGlobalConfig,
    activeCommandConfigs: [],
  };

  const state = { ...defaults, ...overrides };
  return {
    getSnapshot() { return state; },
    globalConfig() { return state.globalConfig; },
    get loadedSatelliteId() { return state.loadedSatelliteId; },
    get scoeFramesLoaded() { return state.scoeFramesLoaded; },
  };
}

// --- Transport event builder ---

let nextEventId = 1;

export function buildDataEvent(bytes: number[], connectionId = 'conn-tcp-1'): TransportEventSnapshot {
  return {
    id: `evt-${nextEventId++}`,
    kind: 'data',
    connectionId,
    occurredAt: new Date().toISOString(),
    bytes,
    byteLength: bytes.length,
  };
}

// --- SCOE frame byte builder ---

export function buildScoeFrame(
  commandCode: number,
  extraBytes: number[] = [],
  config: ScoeGlobalConfig = testGlobalConfig,
): number[] {
  const fcOffset = config.functionCodeOffset;
  const identByte = parseInt(config.scoeIdentifier.replace(/^0x/i, ''), 16);

  const frame: number[] = [];
  // Ensure we have enough room for the function code area
  while (frame.length < fcOffset + 4) {
    frame.push(0);
  }

  frame[fcOffset] = identByte;
  frame[fcOffset + 1] = commandCode;
  frame[fcOffset + 2] = 0xaa;
  frame[fcOffset + 3] = 0xaa;

  return [...frame, ...extraBytes];
}

export function buildScoeFrameWithChecksum(
  commandCode: number,
  checksumCfg: ChecksumConfig,
  extraBytes: number[] = [],
  config: ScoeGlobalConfig = testGlobalConfig,
): number[] {
  const frame = buildScoeFrame(commandCode, extraBytes, config);

  // Ensure frame is long enough for checksum area + extra
  while (frame.length <= checksumCfg.checksumOffset) {
    frame.push(0);
  }

  // Calculate checksum
  let sum = 0;
  for (let i = checksumCfg.offset; i < checksumCfg.offset + checksumCfg.length; i++) {
    sum += frame[i] ?? 0;
  }
  frame[checksumCfg.checksumOffset] = sum % 256;

  return frame;
}

export function resetFixtureIds(): void {
  nextEventId = 1;
}
