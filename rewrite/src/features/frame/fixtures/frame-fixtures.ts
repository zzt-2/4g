import type { FrameAsset, IdentifierRule } from '../core';

export const minimalFrameAsset: FrameAsset = {
  id: 'pilot-frame-001',
  name: '最小合法帧',
  direction: 'send',
  fields: [
    {
      id: 'field-header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xAA',
    },
  ],
};

export const duplicateFieldNameFrameAsset: FrameAsset = {
  ...minimalFrameAsset,
  id: 'pilot-frame-duplicate-fields',
  fields: [
    minimalFrameAsset.fields[0]!,
    {
      id: 'field-header-copy',
      name: '帧头',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
  ],
};

export const expressionFrameAsset: FrameAsset = {
  id: 'pilot-frame-expression',
  name: '表达式定义帧',
  direction: 'send',
  fields: [
    {
      id: 'field-source',
      name: '源字段',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '3',
    },
    {
      id: 'field-expression',
      name: '表达式字段',
      dataType: 'uint8',
      length: 1,
      inputType: 'expression',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
      expressionConfig: {
        expressions: [
          {
            condition: 'var1 > 0',
            expression: 'var1 + 1',
          },
        ],
        variables: [
          {
            identifier: 'var1',
            sourceType: 'current_field',
            sourceId: 'field-source',
            fieldId: 'field-source',
          },
        ],
      },
    },
  ],
};

export const invalidExpressionFrameAsset: FrameAsset = {
  ...expressionFrameAsset,
  id: 'pilot-frame-invalid-expression',
  fields: [
    expressionFrameAsset.fields[0]!,
    {
      ...expressionFrameAsset.fields[1]!,
      expressionConfig: {
        expressions: [
          {
            condition: 'true',
            expression: 'eval(var1)',
          },
        ],
        variables: [
          {
            identifier: 'var1',
            sourceType: 'current_field',
            sourceId: 'field-source',
          },
        ],
      },
    },
  ],
};

// 从 public/data/templates/framesConfig.json 抽取的极小旧样本，只作为 legacy oracle。
export const legacyFrameConfigSample = [
  {
    id: 'NK001',
    lastId: 'NK001',
    name: '光多普勒复位指令',
    description: '',
    direction: 'send',
    frameType: 'custom',
    protocol: 'custom',
    fields: [
      {
        id: 'uN6RewEHGco0Tyqqsra4Q',
        name: '帧头码',
        dataType: 'uint8',
        length: 1,
        description: '',
        validOption: {
          isChecksum: false,
          startFieldIndex: '0',
          endFieldIndex: '0',
          checksumMethod: 'sum8',
        },
        defaultValue: '0xFF',
        inputType: 'input',
        configurable: false,
        options: [],
        dataParticipationType: 'direct',
      },
      {
        id: 'ZmfP9zO3ZoIZbprSLAvZa',
        name: '控制字节1',
        dataType: 'uint8',
        length: 1,
        description: '60H：1540.56nm\n61H：1563.05nm',
        validOption: {
          isChecksum: false,
          startFieldIndex: '0',
          endFieldIndex: '0',
          checksumMethod: 'sum8',
        },
        defaultValue: '0x60',
        inputType: 'radio',
        configurable: false,
        options: [
          {
            value: '0x60',
            label: '1540.56nm',
            isDefault: true,
          },
          {
            value: '0x61',
            label: '1563.05nm',
            isDefault: false,
          },
        ],
        dataParticipationType: 'direct',
      },
      {
        id: '8uTCLPthieOLzTfuBjEQr',
        name: '控制字节3',
        dataType: 'uint8',
        length: 1,
        description: '',
        validOption: {
          isChecksum: false,
          startFieldIndex: '0',
          endFieldIndex: '0',
          checksumMethod: 'sum8',
        },
        defaultValue: '0',
        inputType: 'expression',
        configurable: false,
        options: [],
        dataParticipationType: 'direct',
        expressionConfig: {
          expressions: [
            {
              condition: 'true',
              expression: 'var1',
            },
          ],
          variables: [
            {
              identifier: 'var1',
              sourceType: 'current_field',
              sourceId: 'ZmfP9zO3ZoIZbprSLAvZa',
              frameId: '',
              fieldId: '',
            },
          ],
        },
      },
    ],
    timestamp: 1755742350843,
    createdAt: '2025-08-11T01:37:15.783Z',
    updatedAt: '2025-08-21T02:12:30.843Z',
    isFavorite: false,
    usageCount: 12,
    options: {
      autoChecksum: true,
      bigEndian: false,
      includeLengthField: false,
    },
    identifierRules: [],
  },
] as const;

// 从 public/data/frames/configs/1.json 抽取；旧样本缺省 dataParticipationType。
export const legacyFrameConfigWithoutDataParticipationTypeSample = [
  {
    id: '123',
    lastId: '123',
    name: '111',
    description: '',
    direction: 'send',
    frameType: 'custom',
    protocol: 'custom',
    fields: [
      {
        id: '941q7cnKaSIYusJOtWff7',
        name: '111',
        dataType: 'uint8',
        length: 1,
        description: '',
        validOption: {
          isChecksum: false,
          startFieldIndex: '0',
          endFieldIndex: '0',
          checksumMethod: 'crc16',
        },
        defaultValue: '0',
        inputType: 'input',
        configurable: true,
        options: [],
      },
      {
        id: 'axoDlrBb3BmROnW9JOWTl',
        name: '222',
        dataType: 'uint8',
        length: 1,
        description: '',
        validOption: {
          isChecksum: false,
          startFieldIndex: '0',
          endFieldIndex: '0',
          checksumMethod: 'crc16',
        },
        defaultValue: '33',
        inputType: 'input',
        configurable: false,
        options: [],
      },
    ],
    timestamp: 1745574265399,
    createdAt: '2025-04-25T02:38:21.251Z',
    updatedAt: '2025-04-25T09:44:25.399Z',
    isFavorite: false,
    options: {
      autoChecksum: true,
      bigEndian: false,
      includeLengthField: false,
    },
    identifierRules: [],
  },
] as const;

export const invalidLegacyImportSample = {
  frames: legacyFrameConfigSample,
};

export const frameAssetWithIdentifierRules: FrameAsset = {
  id: 'pilot-frame-rules',
  name: '含标识规则帧',
  direction: 'receive',
  fields: [
    {
      id: 'field-header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xAA',
    },
    {
      id: 'field-value',
      name: '数值字段',
      dataType: 'uint16',
      length: 2,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
      factor: 0.01,
    },
  ],
  identifierRules: [
    { startIndex: 0, endIndex: 1, operator: 'eq', value: '0xAA', logicOperator: 'and' },
    { startIndex: 2, endIndex: 3, operator: 'mask', value: '0x0F', logicOperator: 'and' },
  ] satisfies IdentifierRule[],
};

// 旧样本：factor 为字符串、identifierRules startIndex/endIndex 为字符串、validOption startFieldIndex 为字符串
export const legacyFrameConfigWithFactorAndRulesSample = [
  {
    id: 'legacy-factor-rules',
    name: '旧格式含 factor 和标识规则',
    direction: 'receive',
    fields: [
      {
        id: 'field-a',
        name: '字段A',
        dataType: 'uint16',
        length: 2,
        inputType: 'input',
        configurable: true,
        options: [],
        dataParticipationType: 'direct',
        defaultValue: '100',
        factor: '0.01',
        validOption: {
          isChecksum: false,
          startFieldIndex: '0',
          endFieldIndex: '1',
          checksumMethod: 'xor8',
        },
      },
      {
        id: 'field-checksum',
        name: '校验',
        dataType: 'uint8',
        length: 1,
        inputType: 'input',
        configurable: false,
        options: [],
        dataParticipationType: 'direct',
        defaultValue: '0',
        validOption: {
          isChecksum: true,
          startFieldIndex: '0',
          endFieldIndex: '2',
          checksumMethod: 'sum8',
        },
      },
    ],
    identifierRules: [
      { startIndex: '0', endIndex: '1', operator: 'eq', value: '0xAA', logicOperator: 'and' },
      { startIndex: '2', endIndex: '3', operator: 'mask', value: '0x0F', logicOperator: 'or' },
    ],
    options: {
      autoChecksum: true,
      bigEndian: false,
      includeLengthField: false,
    },
  },
] as const;

// 最小单字段旧样本
export const legacyMinimalFrameSample = [
  {
    id: 'MIN001',
    name: '最小帧',
    direction: 'send',
    fields: [
      {
        id: 'f1',
        name: '数据',
        dataType: 'uint8',
        length: 1,
        inputType: 'input',
        configurable: false,
        options: [],
        dataParticipationType: 'direct',
        defaultValue: '0',
      },
    ],
    identifierRules: [],
    options: {
      autoChecksum: false,
      bigEndian: false,
      includeLengthField: false,
    },
  },
] as const;
