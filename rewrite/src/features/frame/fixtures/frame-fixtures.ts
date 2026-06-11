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

