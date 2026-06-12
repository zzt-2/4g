import { describe, expect, it } from 'vitest';
import {
  validateExpressionDefinition,
  validateFrameAsset,
  validateFrameAssetCollection,
  validateFrameField,
} from '../core';
import {
  duplicateFieldNameFrameAsset,
  expressionFrameAsset,
  frameAssetWithIdentifierRules,
  invalidExpressionFrameAsset,
  minimalFrameAsset,
} from '../fixtures/frame-fixtures';
import type { FrameFieldDefinition } from '../core';

describe('frame core validation pilot', () => {
  it('accepts the minimal frame asset fixture', () => {
    expect(validateFrameAsset(minimalFrameAsset)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('rejects duplicate field names inside one frame', () => {
    const result = validateFrameAsset(duplicateFieldNameFrameAsset);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('frame.fieldNameDuplicate');
  });

  it('accepts a minimal expression definition', () => {
    const expressionField = expressionFrameAsset.fields[1]!;
    const result = validateExpressionDefinition(expressionField.expressionConfig);

    expect(result).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('rejects unsafe expression definitions without executing them', () => {
    const expressionField = invalidExpressionFrameAsset.fields[1]!;
    const result = validateExpressionDefinition(expressionField.expressionConfig);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('expression.unsafe');
  });

  it('rejects malformed expression syntax at compile level', () => {
    const result = validateExpressionDefinition({
      expressions: [{ condition: 'true', expression: 'var1 +' }],
      variables: [{ identifier: 'var1', sourceType: 'current_field', sourceId: 'f1' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('expression.compile');
  });

  it('validates frame collections without leaking statistics into the definition', () => {
    const result = validateFrameAssetCollection([minimalFrameAsset, expressionFrameAsset]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts identifierRules with valid operators and non-negative integer indices', () => {
    const result = validateFrameAsset(frameAssetWithIdentifierRules);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects identifierRules with invalid operator or negative indices', () => {
    const result = validateFrameAsset({
      ...frameAssetWithIdentifierRules,
      identifierRules: [
        { startIndex: -1, endIndex: 1, operator: 'eq', value: '0xAA', logicOperator: 'and' },
        { startIndex: 0, endIndex: 1.5, operator: 'bogus', value: '0xBB', logicOperator: 'invalid' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'frame.identifierRuleStartIndex',
        'frame.identifierRuleEndIndex',
        'frame.identifierRuleOperator',
        'frame.identifierRuleLogicOperator',
      ]),
    );
  });
});

describe('frame field validation: uint64/int64 range', () => {
  function bigintField(dataType: 'uint64' | 'int64', defaultValue?: string): FrameFieldDefinition {
    return {
      id: 'val',
      name: 'val',
      dataType,
      length: 8,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
  }

  it('accepts uint64 = 2^53+1 default value (above number precision)', () => {
    const result = validateFrameField(bigintField('uint64', '9007199254740993'));
    expect(result.valid).toBe(true);
  });

  it('accepts uint64 max (2^64-1) default value', () => {
    const result = validateFrameField(bigintField('uint64', '18446744073709551615'));
    expect(result.valid).toBe(true);
  });

  it('accepts int64 min (-2^63) default value', () => {
    const result = validateFrameField(bigintField('int64', '-9223372036854775808'));
    expect(result.valid).toBe(true);
  });

  it('accepts hex-prefixed uint64 default value', () => {
    const result = validateFrameField(bigintField('uint64', '0xDEADBEEFCAFEBABE'));
    expect(result.valid).toBe(true);
  });

  it('rejects uint64 = 2^64 (one above max)', () => {
    const result = validateFrameField(bigintField('uint64', '18446744073709551616'));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('field.defaultValueOutOfRange');
  });

  it('rejects int64 below -2^63', () => {
    const result = validateFrameField(bigintField('int64', '-9223372036854775809'));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('field.defaultValueOutOfRange');
  });

  it('rejects int64 above 2^63-1', () => {
    const result = validateFrameField(bigintField('int64', '9223372036854775808'));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('field.defaultValueOutOfRange');
  });

  it('rejects malformed uint64 default value', () => {
    const result = validateFrameField(bigintField('uint64', 'not-a-number'));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('field.defaultValueInvalidBigint');
  });

  it('skips range check when defaultValue is empty', () => {
    const result = validateFrameField(bigintField('uint64'));
    expect(result.valid).toBe(true);
  });
});
