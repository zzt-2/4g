import { describe, expect, it } from 'vitest';
import type { FrameAsset, FrameFieldDefinition } from '@/features/frame';
import { compileFrameExpressions, evaluateFrameExpressions } from '../core/expression-pass';
import {
  processReceiveBatch,
  type ReceiveFrameReferenceSnapshot,
} from '../core';
import {
  receiveSourceFixture,
  receiveTelemetryFrameFixture,
} from '../fixtures/receive-fixtures';

// --- Fixtures ---

const frameExprHeader: FrameFieldDefinition = {
  id: 'field-expr-header',
  name: '帧头',
  dataType: 'uint8',
  length: 1,
  inputType: 'input',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
};

const speedCodeField: FrameFieldDefinition = {
  id: 'field-speed-code',
  name: '速率编码',
  dataType: 'uint8',
  length: 1,
  inputType: 'input',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
};

const speedValueField: FrameFieldDefinition = {
  id: 'field-speed-value',
  name: '速率值',
  dataType: 'uint8',
  length: 1,
  inputType: 'expression',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  expressionConfig: {
    expressions: [
      { condition: '速率编码==0', expression: '7674.6869248' },
      { condition: '速率编码==1', expression: '3837.3434624' },
      { condition: '速率编码==2', expression: '1918.6717312' },
      { condition: '速率编码==3', expression: '959.3358656' },
      { condition: '速率编码==4', expression: '479.6679328' },
    ],
    variables: [
      { identifier: '速率编码', sourceType: 'current_field', fieldId: 'field-speed-code' },
    ],
  },
};

const frameWithExpression: FrameAsset = {
  id: 'frame-expression-test',
  name: '表达式测试帧',
  direction: 'receive',
  fields: [frameExprHeader, speedCodeField, speedValueField],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
  identifierRules: [
    { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xBB' },
  ],
};

const invalidExprField: FrameFieldDefinition = {
  id: 'field-bad-expr',
  name: '坏表达式',
  dataType: 'uint8',
  length: 1,
  inputType: 'expression',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  expressionConfig: {
    expressions: [
      { condition: 'true', expression: '1 +' },
    ],
    variables: [],
  },
};

const frameWithInvalidExpression: FrameAsset = {
  id: 'frame-invalid-expr',
  name: '无效表达式帧',
  direction: 'receive',
  fields: [frameExprHeader, speedCodeField, invalidExprField],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
  identifierRules: [
    { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xCC' },
  ],
};

const depBaseField: FrameFieldDefinition = {
  id: 'field-base',
  name: '基础值',
  dataType: 'uint16',
  length: 2,
  inputType: 'expression',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  expressionConfig: {
    expressions: [
      { condition: 'true', expression: '原始值*2' },
    ],
    variables: [
      { identifier: '原始值', sourceType: 'current_field', fieldId: 'field-raw' },
    ],
  },
};

const depDerivedField: FrameFieldDefinition = {
  id: 'field-derived',
  name: '派生值',
  dataType: 'uint8',
  length: 1,
  inputType: 'expression',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  expressionConfig: {
    expressions: [
      { condition: 'true', expression: '基础结果+1' },
    ],
    variables: [
      { identifier: '基础结果', sourceType: 'frame_field', frameId: 'frame-dep-test', fieldId: 'field-base' },
    ],
  },
};

const rawField: FrameFieldDefinition = {
  id: 'field-raw',
  name: '原始数据',
  dataType: 'uint16',
  length: 2,
  inputType: 'input',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
};

const frameWithDependency: FrameAsset = {
  id: 'frame-dep-test',
  name: '依赖测试帧',
  direction: 'receive',
  fields: [rawField, depBaseField, depDerivedField],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
  identifierRules: [
    { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xDD' },
  ],
};

const circularFieldA: FrameFieldDefinition = {
  id: 'field-a',
  name: 'Field A',
  dataType: 'uint8',
  length: 1,
  inputType: 'expression',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  expressionConfig: {
    expressions: [
      { condition: 'true', expression: 'B值' },
    ],
    variables: [
      { identifier: 'B值', sourceType: 'frame_field', frameId: 'frame-circular', fieldId: 'field-b' },
    ],
  },
};

const circularFieldB: FrameFieldDefinition = {
  id: 'field-b',
  name: 'Field B',
  dataType: 'uint8',
  length: 1,
  inputType: 'expression',
  configurable: false,
  options: [],
  dataParticipationType: 'direct',
  expressionConfig: {
    expressions: [
      { condition: 'true', expression: 'A值' },
    ],
    variables: [
      { identifier: 'A值', sourceType: 'frame_field', frameId: 'frame-circular', fieldId: 'field-a' },
    ],
  },
};

const frameWithCircular: FrameAsset = {
  id: 'frame-circular',
  name: '循环依赖帧',
  direction: 'receive',
  fields: [circularFieldA, circularFieldB],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
  identifierRules: [
    { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xEE' },
  ],
};

// --- Helpers ---

function reference(frames: ReceiveFrameReferenceSnapshot['frames']): ReceiveFrameReferenceSnapshot {
  return { frames, referenceVersion: 1, refreshedAt: '2026-05-08T00:00:00.000Z' };
}

function batch(bytes: readonly number[], referenceVersion = 1) {
  return {
    id: 'test-batch',
    bytes: [...bytes],
    receivedAt: '2026-05-08T00:00:01.000Z',
    source: receiveSourceFixture,
    referenceVersion,
  };
}

// --- Tests ---

describe('expression-pass compile', () => {
  it('skips frames without expressionConfig', () => {
    const cache = compileFrameExpressions([receiveTelemetryFrameFixture]);
    expect(cache.has(receiveTelemetryFrameFixture.id)).toBe(false);
  });

  it('compiles conditional expressions per field', () => {
    const cache = compileFrameExpressions([frameWithExpression]);
    const entry = cache.get(frameWithExpression.id);

    expect(entry?.success).toBe(true);
    expect(entry!.compiled.fields.has('field-speed-value')).toBe(true);
    expect(entry!.compiled.evalOrder).toContain('field-speed-value');
  });

  it('reports compile failure for invalid syntax', () => {
    const cache = compileFrameExpressions([frameWithInvalidExpression]);
    const entry = cache.get(frameWithInvalidExpression.id);

    expect(entry?.success).toBe(false);
    expect(entry!.error).toContain('field "坏表达式"');
  });

  it('detects circular dependencies', () => {
    const cache = compileFrameExpressions([frameWithCircular]);
    const entry = cache.get(frameWithCircular.id);

    expect(entry?.success).toBe(false);
    expect(entry!.error).toContain('circular dependency');
  });

  it('compiles multiple frames independently', () => {
    const cache = compileFrameExpressions([frameWithExpression, frameWithInvalidExpression]);

    expect(cache.get(frameWithExpression.id)?.success).toBe(true);
    expect(cache.get(frameWithInvalidExpression.id)?.success).toBe(false);
  });
});

describe('expression-pass evaluate', () => {
  it('evaluates conditional expressions with current_field bindings', () => {
    const cache = compileFrameExpressions([frameWithExpression]);
    const entry = cache.get(frameWithExpression.id)!;

    const rawValues = new Map([['field-speed-code', 2]]);
    const result = evaluateFrameExpressions({
      compiled: entry.compiled,
      frameId: frameWithExpression.id,
      currentFrameRawValues: rawValues,
      readModel: new Map(),
      globalParams: new Map(),
    });

    expect(result.errors.size).toBe(0);
    expect(result.values.get('field-speed-value')).toBeCloseTo(1918.6717312);
  });

  it('uses fallback when no condition matches', () => {
    const cache = compileFrameExpressions([frameWithExpression]);
    const entry = cache.get(frameWithExpression.id)!;

    const rawValues = new Map([['field-speed-code', 99]]);
    const result = evaluateFrameExpressions({
      compiled: entry.compiled,
      frameId: frameWithExpression.id,
      currentFrameRawValues: rawValues,
      readModel: new Map(),
      globalParams: new Map(),
    });

    expect(result.errors.size).toBe(0);
    expect(result.values.get('field-speed-value')).toBe(0); // fallback
  });

  it('resolves intra-frame dependencies in correct order', () => {
    const cache = compileFrameExpressions([frameWithDependency]);
    const entry = cache.get(frameWithDependency.id)!;

    // raw field = 5 → base = 5*2 = 10 → derived = 10+1 = 11
    const rawValues = new Map([
      ['field-raw', 5],
      ['field-base', 5],
      ['field-derived', 0],
    ]);
    const result = evaluateFrameExpressions({
      compiled: entry.compiled,
      frameId: frameWithDependency.id,
      currentFrameRawValues: rawValues,
      readModel: new Map(),
      globalParams: new Map(),
    });

    expect(result.errors.size).toBe(0);
    expect(result.values.get('field-base')).toBe(10);
    expect(result.values.get('field-derived')).toBe(11);
  });

  it('degrades gracefully when variable is missing', () => {
    const cache = compileFrameExpressions([frameWithExpression]);
    const entry = cache.get(frameWithExpression.id)!;

    // No raw values provided → variable lookup fails
    const result = evaluateFrameExpressions({
      compiled: entry.compiled,
      frameId: frameWithExpression.id,
      currentFrameRawValues: new Map(),
      readModel: new Map(),
      globalParams: new Map(),
    });

    expect(result.errors.has('field-speed-value')).toBe(true);
  });

  it('resolves cross-frame values from read model', () => {
    const cache = compileFrameExpressions([frameWithDependency]);
    const entry = cache.get(frameWithDependency.id)!;

    const readModel = new Map([
      ['frame-dep-test', new Map([['field-base', 42]])],
    ]);
    const rawValues = new Map([
      ['field-raw', 5],
      ['field-base', 5],
      ['field-derived', 0],
    ]);
    const result = evaluateFrameExpressions({
      compiled: entry.compiled,
      frameId: frameWithDependency.id,
      currentFrameRawValues: rawValues,
      readModel,
      globalParams: new Map(),
    });

    // base = 5*2 = 10 (current_field resolves before read model)
    // derived = 10+1 = 11 (intra-frame resolved value takes priority over read model)
    expect(result.values.get('field-base')).toBe(10);
    expect(result.values.get('field-derived')).toBe(11);
  });
});

describe('expression integration in processor', () => {
  it('marks fields expressionApplied=false when no expressions', () => {
    const outcome = processReceiveBatch({
      batch: batch([0xaa, 0x01, 0x00, 0x64, 0xff]),
      reference: reference([receiveTelemetryFrameFixture]),
      processedAt: '2026-05-08T00:00:03.000Z',
    });

    expect(outcome.kind).toBe('matched');
    for (const field of outcome.fields) {
      expect(field.expressionApplied).toBe(false);
      expect(field.expressionError).toBeUndefined();
    }
  });

  it('applies expressions and marks expressionApplied=true', () => {
    const cache = compileFrameExpressions([frameWithExpression]);

    const outcome = processReceiveBatch({
      batch: batch([0xbb, 0x01, 0x00]),  // speed code = 1
      reference: reference([frameWithExpression]),
      processedAt: '2026-05-08T00:00:03.000Z',
      expressionCache: cache,
    });

    expect(outcome.kind).toBe('matched');

    const speedCode = outcome.fields.find((f) => f.fieldId === 'field-speed-code')!;
    expect(speedCode.expressionApplied).toBe(false);

    const speedValue = outcome.fields.find((f) => f.fieldId === 'field-speed-value')!;
    expect(speedValue.expressionApplied).toBe(true);
    expect(speedValue.expressionError).toBeUndefined();
    expect(speedValue.value).toBeCloseTo(3837.3434624);
  });

  it('marks config-error when expression compile fails', () => {
    const cache = compileFrameExpressions([frameWithInvalidExpression]);

    const outcome = processReceiveBatch({
      batch: batch([0xcc, 0x01, 0x00]),
      reference: reference([frameWithInvalidExpression]),
      processedAt: '2026-05-08T00:00:03.000Z',
      expressionCache: cache,
    });

    expect(outcome.kind).toBe('config-error');
    expect(outcome.issues.some((i) => i.code === 'receive.expression.compileFailed')).toBe(true);
  });

  it('degrades to raw value on eval failure and reports issue', () => {
    // Create a frame with a field that references a non-existent variable
    const missingVarField: FrameFieldDefinition = {
      id: 'field-missing-var',
      name: '缺失变量',
      dataType: 'uint8',
      length: 1,
      inputType: 'expression',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      expressionConfig: {
        expressions: [
          { condition: 'true', expression: '不存在的变量' },
        ],
        variables: [
          { identifier: '不存在的变量', sourceType: 'current_field', fieldId: 'nonexistent-field' },
        ],
      },
    };

    const frameWithMissingVar: FrameAsset = {
      id: 'frame-missing-var',
      name: '缺失变量帧',
      direction: 'receive',
      fields: [frameExprHeader, speedCodeField, missingVarField],
      options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
      identifierRules: [
        { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xFF' },
      ],
    };

    const cache = compileFrameExpressions([frameWithMissingVar]);

    // bytes: header=0xFF, speedCode=0x05, missingVar=0x00
    const outcome = processReceiveBatch({
      batch: batch([0xff, 0x05, 0x00]),
      reference: reference([frameWithMissingVar]),
      processedAt: '2026-05-08T00:00:03.000Z',
      expressionCache: cache,
    });

    expect(outcome.kind).toBe('matched');

    const degradedField = outcome.fields.find((f) => f.fieldId === 'field-missing-var')!;
    expect(degradedField.expressionApplied).toBe(true);
    expect(degradedField.expressionError).toBeDefined();
    expect(degradedField.value).toBe(0); // raw value = bytes[2] = 0x00

    expect(outcome.issues.some((i) => i.code === 'receive.expression.evalFailed')).toBe(true);

    // Other field without expression should be unaffected
    const normalField = outcome.fields.find((f) => f.fieldId === 'field-speed-code')!;
    expect(normalField.expressionApplied).toBe(false);
  });
});
