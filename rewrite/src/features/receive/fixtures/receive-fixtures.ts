import {
  FRAME_DIRECTIONS,
  type FrameAsset,
  type FrameFieldDefinition,
} from '@/features/frame';
import type {
  ReceiveInputBatch,
  ReceiveInputError,
  ReceiveSourceSnapshot,
} from '../core';

const headerField: FrameFieldDefinition = {
  id: 'field-header',
  name: '帧头',
  dataType: 'uint8',
  length: 1,
  inputType: 'input',
  configurable: false,
  options: [
    {
      value: '0xAA',
      label: '起始',
    },
  ],
  dataParticipationType: 'direct',
};

const modeField: FrameFieldDefinition = {
  id: 'field-mode',
  name: '模式',
  dataType: 'uint8',
  length: 1,
  inputType: 'radio',
  configurable: false,
  options: [
    {
      value: '0x01',
      label: '正常',
    },
    {
      value: '0x02',
      label: '告警',
    },
  ],
  dataParticipationType: 'direct',
};

const temperatureField: FrameFieldDefinition & { readonly factor: number } = {
  id: 'field-temperature',
  name: '温度',
  dataType: 'uint16',
  length: 2,
  inputType: 'input',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  factor: 0.1,
  bigEndian: true,
};

const reservedField: FrameFieldDefinition = {
  id: 'field-reserved',
  name: '保留',
  dataType: 'uint8',
  length: 1,
  inputType: 'input',
  configurable: false,
  options: [],
  dataParticipationType: 'indirect',
};

export const receiveSourceFixture: ReceiveSourceSnapshot = {
  sourceId: 'source-main',
  connectionId: 'serial-main',
  targetId: 'serial-main-target',
  kind: 'serial',
  label: 'Main serial',
  routeLabel: 'COM3',
  available: true,
};

export const receiveTelemetryFrameFixture: FrameAsset = {
  id: 'receive-telemetry',
  name: '遥测接收帧',
  direction: 'receive',
  fields: [headerField, modeField, temperatureField, reservedField],
  options: {
    autoChecksum: false,
    bigEndian: true,
    includeLengthField: false,
  },
  identifierRules: [
    {
      startIndex: 0,
      endIndex: 0,
      operator: 'eq',
      value: '0xAA',
    },
    {
      startIndex: 1,
      endIndex: 1,
      operator: 'eq',
      value: '0x01',
    },
  ],
};

export const outboundLikeFrameFixture: FrameAsset = {
  ...receiveTelemetryFrameFixture,
  id: 'ignored-outbound-like',
  name: '非接收方向帧',
  direction: FRAME_DIRECTIONS[0],
};

export const receiveFrameWithoutRulesFixture: FrameAsset = {
  ...receiveTelemetryFrameFixture,
  id: 'receive-without-rules',
  identifierRules: [],
};

export const matchedReceiveBytesFixture = [0xaa, 0x01, 0x00, 0x64, 0xff] as const;
export const unmatchedReceiveBytesFixture = [0xab, 0x01, 0x00, 0x64, 0xff] as const;
export const truncatedReceiveBytesFixture = [0xaa, 0x01, 0x00] as const;
export const invalidReceiveBytesFixture = [0xaa, 999, 0x00] as const;

export const matchedReceiveBatchFixture: ReceiveInputBatch = {
  id: 'receive-batch-001',
  bytes: matchedReceiveBytesFixture,
  receivedAt: '2026-05-04T00:00:01.000Z',
  source: receiveSourceFixture,
  referenceVersion: 1,
};

export const unmatchedReceiveBatchFixture: ReceiveInputBatch = {
  ...matchedReceiveBatchFixture,
  id: 'receive-batch-unmatched',
  bytes: unmatchedReceiveBytesFixture,
};

export const truncatedReceiveBatchFixture: ReceiveInputBatch = {
  ...matchedReceiveBatchFixture,
  id: 'receive-batch-truncated',
  bytes: truncatedReceiveBytesFixture,
};

export const invalidReceiveBatchFixture: ReceiveInputBatch = {
  ...matchedReceiveBatchFixture,
  id: 'receive-batch-invalid',
  bytes: invalidReceiveBytesFixture,
};

export const receiveInputErrorFixture: ReceiveInputError = {
  id: 'receive-input-error-001',
  occurredAt: '2026-05-04T00:00:02.000Z',
  kind: 'timeout',
  message: 'Input source timeout.',
  source: receiveSourceFixture,
  recoverable: true,
};
