import type { FrameAsset } from '@/features/frame';
import type {
  SendFieldEncodingDef,
  SendFieldValue,
  SendRequest,
} from '../core';

// --- Frame asset fixtures ---

export const minimalSendFrameAsset: FrameAsset = {
  id: 'send-frame-001',
  name: '最小发送帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xFF',
    },
    {
      id: 'command',
      name: '命令',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x01',
    },
  ],
};

export const multiTypeFrameAsset: FrameAsset = {
  id: 'send-frame-002',
  name: '多类型帧',
  direction: 'send',
  fields: [
    {
      id: 'addr',
      name: '地址',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      bigEndian: true,
      defaultValue: '0x1234',
    },
    {
      id: 'flag',
      name: '标志',
      dataType: 'int8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '-1',
    },
    {
      id: 'value',
      name: '值',
      dataType: 'float',
      length: 4,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      bigEndian: true,
      defaultValue: '1.5',
    },
  ],
  options: { autoChecksum: false, bigEndian: false, includeLengthField: false },
};

export const littleEndianFrameAsset: FrameAsset = {
  id: 'send-frame-003',
  name: '小端帧',
  direction: 'send',
  fields: [
    {
      id: 'data',
      name: '数据',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      bigEndian: false,
      defaultValue: '0x1234',
    },
  ],
  options: { autoChecksum: false, bigEndian: false, includeLengthField: false },
};

export const asciiFrameAsset: FrameAsset = {
  id: 'send-frame-004',
  name: 'ASCII帧',
  direction: 'send',
  fields: [
    {
      id: 'text',
      name: '文本',
      dataType: 'uint8',
      length: 5,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      isASCII: true,
      defaultValue: 'HELLO',
    },
  ],
};

export const sendFrameAssets = [
  minimalSendFrameAsset,
  multiTypeFrameAsset,
  littleEndianFrameAsset,
  asciiFrameAsset,
] as const;

// --- Encoding def fixtures ---

export const minimalFieldDefs: readonly SendFieldEncodingDef[] = [
  { id: 'header', dataType: 'uint8', length: 1, bigEndian: true, isASCII: false, offset: 0 },
  { id: 'command', dataType: 'uint8', length: 1, bigEndian: true, isASCII: false, offset: 1 },
];

export const minimalFieldValues: Readonly<Record<string, SendFieldValue>> = {
  header: '0xFF',
  command: '0x01',
};

export const multiTypeFieldDefs: readonly SendFieldEncodingDef[] = [
  { id: 'addr', dataType: 'uint16', length: 2, bigEndian: true, isASCII: false, offset: 0 },
  { id: 'flag', dataType: 'int8', length: 1, bigEndian: true, isASCII: false, offset: 2 },
  { id: 'value', dataType: 'float', length: 4, bigEndian: true, isASCII: false, offset: 3 },
];

export const multiTypeFieldValues: Readonly<Record<string, SendFieldValue>> = {
  addr: 0x1234,
  flag: -1,
  value: 1.5,
};

export const littleEndianFieldDefs: readonly SendFieldEncodingDef[] = [
  { id: 'data', dataType: 'uint16', length: 2, bigEndian: false, isASCII: false, offset: 0 },
];

export const littleEndianFieldValues: Readonly<Record<string, SendFieldValue>> = {
  data: 0x1234,
};

export const asciiFieldDefs: readonly SendFieldEncodingDef[] = [
  { id: 'text', dataType: 'uint8', length: 5, bigEndian: true, isASCII: true, offset: 0 },
];

export const asciiFieldValues: Readonly<Record<string, SendFieldValue>> = {
  text: 'HELLO',
};

// --- Checksum test data ---

export const checksumTestBytes = [0x01, 0x02, 0x03, 0x04] as const;

// --- Request fixtures ---

export const validSendRequest: SendRequest = {
  frameId: 'send-frame-001',
  fieldValues: { header: '0xFF', command: '0x01' },
  targetId: 'target-001',
  options: {},
  context: { source: 'user' },
};

export const missingFrameIdRequest: SendRequest = {
  frameId: '',
  fieldValues: {},
  targetId: 'target-001',
  options: {},
  context: { source: 'test' },
};

export const missingTargetIdRequest: SendRequest = {
  frameId: 'frame-001',
  fieldValues: {},
  targetId: '',
  options: {},
  context: { source: 'test' },
};

// --- Target fixtures ---

export const targetFixture = {
  targetId: 'target-001',
  connectionId: 'conn-serial-001',
  kind: 'serial' as const,
  role: 'serial-port' as const,
  label: 'COM3',
  routeLabel: 'serial:COM3',
  available: true,
};

export const unavailableTargetFixture = {
  ...targetFixture,
  targetId: 'target-unavailable',
  available: false,
};
