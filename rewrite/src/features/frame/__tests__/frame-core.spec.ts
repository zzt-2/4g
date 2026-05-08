import { describe, expect, it } from 'vitest';
import {
  isLegacyFrameConfigJson,
  migrateLegacyFrameConfig,
  validateExpressionDefinition,
  validateFrameAsset,
  validateFrameAssetCollection,
} from '../core';
import {
  duplicateFieldNameFrameAsset,
  expressionFrameAsset,
  frameAssetWithIdentifierRules,
  invalidExpressionFrameAsset,
  invalidLegacyImportSample,
  legacyFrameConfigSample,
  legacyFrameConfigWithFactorAndRulesSample,
  legacyFrameConfigWithoutDataParticipationTypeSample,
  legacyMinimalFrameSample,
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

  it('accepts legacy expression samples through the shared expression compiler', () => {
    const legacyFrame = legacyFrameConfigSample[0]!;
    const expressionField = legacyFrame.fields[2]!;
    const result = validateExpressionDefinition({
      expressions: expressionField.expressionConfig!.expressions,
      variables: expressionField.expressionConfig!.variables.map((v) => ({
        identifier: v.identifier,
        sourceType: v.sourceType,
        ...(v.sourceId ? { sourceId: v.sourceId } : {}),
        ...(v.frameId ? { frameId: v.frameId } : {}),
        ...(v.fieldId ? { fieldId: v.fieldId } : {}),
      })),
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
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

describe('legacy frame JSON pilot migration', () => {
  it('recognizes the legacy frame config array shape', () => {
    expect(isLegacyFrameConfigJson(legacyFrameConfigSample)).toBe(true);
    expect(isLegacyFrameConfigJson([])).toBe(true);
    expect(isLegacyFrameConfigJson([{ id: 'not-frame', fields: 'not-array' }])).toBe(false);
    expect(isLegacyFrameConfigJson([{ id: 'missing-fields', name: '缺少 fields' }])).toBe(false);
    expect(isLegacyFrameConfigJson(invalidLegacyImportSample)).toBe(false);
  });

  it('migrates a trimmed legacy frame sample into the pilot frame asset model', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigSample);

    expect(result.recognized).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.frames).toHaveLength(1);
    const migratedFrame = result.frames[0]!;
    expect(migratedFrame).toMatchObject({
      id: 'NK001',
      name: '光多普勒复位指令',
      direction: 'send',
      fields: [
        {
          id: 'uN6RewEHGco0Tyqqsra4Q',
          name: '帧头码',
          dataType: 'uint8',
          length: 1,
        },
        {
          id: 'ZmfP9zO3ZoIZbprSLAvZa',
          inputType: 'radio',
        },
        {
          id: '8uTCLPthieOLzTfuBjEQr',
          inputType: 'expression',
        },
      ],
    });
    expect('timestamp' in migratedFrame).toBe(false);
  });

  it('reports unknown legacy direction, dataType and inputType without silently normalizing them', () => {
    const sourceFrame = legacyFrameConfigSample[0]!;
    const sourceField = sourceFrame.fields[0]!;
    const result = migrateLegacyFrameConfig([
      {
        ...sourceFrame,
        direction: 'telemetry',
        fields: [
          {
            ...sourceField,
            dataType: 'hex',
            inputType: 'slider',
          },
        ],
      },
    ]);

    expect(result.recognized).toBe(true);
    expect(result.frames[0]!.direction).toBe('telemetry');
    expect(result.frames[0]!.fields[0]!.dataType).toBe('hex');
    expect(result.frames[0]!.fields[0]!.inputType).toBe('slider');
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'legacy.directionUnsupported',
        'legacy.dataTypeUnsupported',
        'legacy.inputTypeUnsupported',
      ]),
    );
  });

  it('keeps missing legacy dataParticipationType as a direct fallback with warnings', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigWithoutDataParticipationTypeSample);

    expect(result.recognized).toBe(true);
    expect(result.frames[0]!.fields.map((field) => field.dataParticipationType)).toEqual([
      'direct',
      'direct',
    ]);
    expect(result.issues).toEqual([
      {
        code: 'legacy.dataParticipationDefaulted',
        path: 'legacy.0.fields.0.dataParticipationType',
        message: '旧 field 缺少 dataParticipationType，兼容迁移为 direct',
        severity: 'warning',
      },
      {
        code: 'legacy.dataParticipationDefaulted',
        path: 'legacy.0.fields.1.dataParticipationType',
        message: '旧 field 缺少 dataParticipationType，兼容迁移为 direct',
        severity: 'warning',
      },
    ]);
  });

  it('documents migration recognition for empty, non-frame and missing-fields arrays', () => {
    expect(migrateLegacyFrameConfig([])).toEqual({
      recognized: true,
      frames: [],
      issues: [],
    });

    const nonFrameArrayResult = migrateLegacyFrameConfig([1]);
    expect(nonFrameArrayResult.recognized).toBe(true);
    expect(nonFrameArrayResult.frames).toEqual([]);
    expect(nonFrameArrayResult.issues.map((item) => item.code)).toContain('legacy.frameInvalid');

    const missingFieldsResult = migrateLegacyFrameConfig([
      {
        id: 'missing-fields-frame',
        name: '缺少 fields 的旧帧',
        direction: 'send',
      },
    ]);
    expect(missingFieldsResult.recognized).toBe(true);
    expect(missingFieldsResult.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(['legacy.fieldsInvalid', 'frame.fieldsMissing']),
    );
  });

  it('rejects non-array legacy imports at the migration boundary', () => {
    const result = migrateLegacyFrameConfig(invalidLegacyImportSample);

    expect(result).toEqual({
      recognized: false,
      frames: [],
      issues: [
        {
          code: 'legacy.rootInvalid',
          path: 'legacy',
          message: '旧 frame 导入内容必须是数组',
          severity: 'error',
        },
      ],
    });
  });

  it('migrates legacy factor from string to number', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigWithFactorAndRulesSample);

    expect(result.recognized).toBe(true);
    expect(result.frames[0]!.fields[0]!.factor).toBeCloseTo(0.01);
    expect(typeof result.frames[0]!.fields[0]!.factor).toBe('number');
  });

  it('migrates legacy validOption startFieldIndex/endFieldIndex from string to number', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigWithFactorAndRulesSample);

    expect(result.recognized).toBe(true);
    const checksumField = result.frames[0]!.fields[1]!;
    expect(checksumField.validOption!.startFieldIndex).toBe(0);
    expect(typeof checksumField.validOption!.startFieldIndex).toBe('number');
    expect(checksumField.validOption!.endFieldIndex).toBe(2);
    expect(typeof checksumField.validOption!.endFieldIndex).toBe('number');
    expect(checksumField.validOption!.checksumMethod).toBe('sum8');
  });

  it('migrates legacy identifierRules startIndex/endIndex from string to number', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigWithFactorAndRulesSample);

    expect(result.recognized).toBe(true);
    const rules = result.frames[0]!.identifierRules!;
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({ startIndex: 0, endIndex: 1, operator: 'eq', value: '0xAA', logicOperator: 'and' });
    expect(rules[1]).toEqual({ startIndex: 2, endIndex: 3, operator: 'mask', value: '0x0F', logicOperator: 'or' });
    expect(typeof rules[0]!.startIndex).toBe('number');
    expect(typeof rules[0]!.endIndex).toBe('number');
  });

  it('migrates the minimal single-field legacy frame without issues', () => {
    const result = migrateLegacyFrameConfig(legacyMinimalFrameSample);

    expect(result.recognized).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).toMatchObject({
      id: 'MIN001',
      name: '最小帧',
      direction: 'send',
      fields: [{ id: 'f1', name: '数据', dataType: 'uint8', length: 1 }],
    });
  });

  it('drops lastId and timestamp from legacy frames', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigSample);

    expect(result.recognized).toBe(true);
    const frame = result.frames[0]!;
    expect('lastId' in frame).toBe(false);
    expect('timestamp' in frame).toBe(false);
  });

  it('preserves all field values through full migration round-trip', () => {
    const result = migrateLegacyFrameConfig(legacyFrameConfigWithFactorAndRulesSample);

    expect(result.recognized).toBe(true);
    expect(result.issues.every((i) => i.severity !== 'error')).toBe(true);
    const frame = result.frames[0]!;
    const fieldA = frame.fields[0]!;
    const fieldB = frame.fields[1]!;

    // factor precision
    expect(fieldA.factor).toBeCloseTo(0.01);
    // validOption types
    expect(fieldA.validOption!.startFieldIndex).toBe(0);
    expect(fieldA.validOption!.endFieldIndex).toBe(1);
    expect(fieldA.validOption!.checksumMethod).toBe('xor8');
    // checksum field
    expect(fieldB.validOption!.isChecksum).toBe(true);
    expect(fieldB.validOption!.endFieldIndex).toBe(2);
    expect(fieldB.validOption!.checksumMethod).toBe('sum8');
    // identifierRules
    expect(frame.identifierRules).toHaveLength(2);
    expect(frame.identifierRules![0]!.operator).toBe('eq');
    expect(frame.identifierRules![1]!.logicOperator).toBe('or');
  });

  it('rejects raw non-JSON string input', () => {
    const result = migrateLegacyFrameConfig('not a json array');

    expect(result.recognized).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('legacy.rootInvalid');
  });

  it('handles missing direction gracefully with an issue', () => {
    const result = migrateLegacyFrameConfig([
      { id: 'no-dir', name: '无方向帧', fields: [{ id: 'f1', name: '数据', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct' }] },
    ]);

    expect(result.recognized).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('legacy.directionUnsupported');
  });
});
