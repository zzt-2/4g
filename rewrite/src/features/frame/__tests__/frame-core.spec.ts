import { describe, expect, it } from 'vitest';
import {
  validateExpressionDefinition,
  validateFrameAsset,
  validateFrameAssetCollection,
} from '../core';
import {
  duplicateFieldNameFrameAsset,
  expressionFrameAsset,
  frameAssetWithIdentifierRules,
  invalidExpressionFrameAsset,
  minimalFrameAsset,
} from '../fixtures/frame-fixtures';

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
