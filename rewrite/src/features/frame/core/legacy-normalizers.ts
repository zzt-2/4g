import {
  CHECKSUM_METHODS,
  DATA_PARTICIPATION_TYPES,
  FRAME_DATA_TYPES,
  FRAME_DIRECTIONS,
  FRAME_INPUT_TYPES,
  IDENTIFIER_LOGIC_OPERATORS,
  IDENTIFIER_RULE_OPERATORS,
  type ChecksumMethod,
  type DataParticipationType,
  type ExpressionDefinition,
  type ExpressionVariableDefinition,
  type FrameAsset,
  type FrameDataType,
  type FrameDirection,
  type FrameFieldDefinition,
  type FrameInputType,
  type FrameOptionDefinition,
  type IdentifierRule,
  type ValidationIssue,
  type LegacyFrameMigrationResult,
} from './types';
import { validateFrameAssetCollection } from './validation-frame';

type UnknownRecord = Record<string, unknown>;

function issue(
  code: string,
  path: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue {
  return { code, path, message, severity };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isStringOption<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function unknownValueLabel(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  return String(value);
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceToNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function normalizeDirection(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): FrameDirection {
  if (isStringOption(value, FRAME_DIRECTIONS)) {
    return value;
  }

  issues.push(
    issue(
      'legacy.directionUnsupported',
      path,
      `旧 frame direction 不受支持: ${unknownValueLabel(value)}`,
    ),
  );
  return stringValue(value) as FrameDirection;
}

function normalizeDataType(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): FrameDataType {
  if (isStringOption(value, FRAME_DATA_TYPES)) {
    return value;
  }

  issues.push(
    issue(
      'legacy.dataTypeUnsupported',
      path,
      `旧 field dataType 不受支持: ${unknownValueLabel(value)}`,
    ),
  );
  return stringValue(value) as FrameDataType;
}

function normalizeInputType(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): FrameInputType {
  if (isStringOption(value, FRAME_INPUT_TYPES)) {
    return value;
  }

  issues.push(
    issue(
      'legacy.inputTypeUnsupported',
      path,
      `旧 field inputType 不受支持: ${unknownValueLabel(value)}`,
    ),
  );
  return stringValue(value) as FrameInputType;
}

function normalizeDataParticipationType(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): DataParticipationType {
  if (value === undefined) {
    issues.push(
      issue(
        'legacy.dataParticipationDefaulted',
        path,
        '旧 field 缺少 dataParticipationType，兼容迁移为 direct',
        'warning',
      ),
    );
    return 'direct';
  }

  if (isStringOption(value, DATA_PARTICIPATION_TYPES)) {
    return value;
  }

  issues.push(
    issue(
      'legacy.dataParticipationUnsupported',
      path,
      `旧 field dataParticipationType 不受支持: ${unknownValueLabel(value)}`,
    ),
  );
  return stringValue(value) as DataParticipationType;
}

function normalizeOptions(value: unknown): FrameOptionDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((option) => ({
    value: stringValue(option.value),
    label: stringValue(option.label),
    ...(typeof option.isDefault === 'boolean' ? { isDefault: option.isDefault } : {}),
  }));
}

function normalizeIdentifierRule(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): IdentifierRule | undefined {
  if (!isRecord(value)) {
    issues.push(issue('legacy.identifierRuleInvalid', path, '旧标识规则条目必须是对象'));
    return undefined;
  }

  const operatorRaw = stringValue(value.operator);
  const operator = isStringOption(operatorRaw, IDENTIFIER_RULE_OPERATORS) ? operatorRaw : undefined;
  if (operatorRaw && !operator) {
    issues.push(
      issue('legacy.identifierRuleOperatorUnsupported', `${path}.operator`, `旧标识规则 operator 不在枚举内: ${operatorRaw}`, 'warning'),
    );
  }

  const logicOperatorRaw = stringValue(value.logicOperator);
  const logicOperator = isStringOption(logicOperatorRaw, IDENTIFIER_LOGIC_OPERATORS) ? logicOperatorRaw : undefined;
  if (logicOperatorRaw && !logicOperator) {
    issues.push(
      issue('legacy.identifierRuleLogicOperatorUnsupported', `${path}.logicOperator`, `旧标识规则 logicOperator 不在枚举内: ${logicOperatorRaw}`, 'warning'),
    );
  }

  return {
    startIndex: coerceToNumber(value.startIndex, 0),
    endIndex: coerceToNumber(value.endIndex, 0),
    operator: operator ?? 'eq',
    value: stringValue(value.value),
    logicOperator: logicOperator ?? 'and',
  };
}

function normalizeExpression(value: unknown): ExpressionDefinition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const expressions = Array.isArray(value.expressions)
    ? value.expressions.filter(isRecord).map((expression) => ({
        condition: stringValue(expression.condition),
        expression: stringValue(expression.expression),
      }))
    : [];

  const variables: ExpressionVariableDefinition[] = Array.isArray(value.variables)
    ? value.variables.filter(isRecord).map((variable) => ({
        identifier: stringValue(variable.identifier),
        sourceType: stringValue(variable.sourceType),
        sourceId: stringValue(variable.sourceId),
        frameId: stringValue(variable.frameId),
        fieldId: stringValue(variable.fieldId),
      }))
    : [];

  return { expressions, variables };
}

function normalizeField(
  value: unknown,
  frameIndex: number,
  index: number,
  issues: ValidationIssue[],
): FrameFieldDefinition | undefined {
  if (!isRecord(value)) {
    issues.push(issue('legacy.fieldInvalid', `legacy.${frameIndex}.fields.${index}`, '旧 field 条目必须是对象'));
    return undefined;
  }

  const fieldPath = `legacy.${frameIndex}.fields.${index}`;
  const dataType = normalizeDataType(value.dataType, `${fieldPath}.dataType`, issues);
  const inputType = normalizeInputType(value.inputType, `${fieldPath}.inputType`, issues);
  const dataParticipationType = normalizeDataParticipationType(
    value.dataParticipationType,
    `${fieldPath}.dataParticipationType`,
    issues,
  );

  const field: FrameFieldDefinition = {
    id: stringValue(value.id, `legacy-field-${index + 1}`),
    name: stringValue(value.name),
    dataType,
    length: numberValue(value.length, dataType === 'bytes' ? 1 : 0),
    description: stringValue(value.description),
    defaultValue: stringValue(value.defaultValue),
    inputType,
    configurable: booleanValue(value.configurable, false),
    options: normalizeOptions(value.options),
    dataParticipationType,
  };

  if (isRecord(value.validOption)) {
    const checksumMethodRaw = stringValue(value.validOption.checksumMethod);
    const checksumMethod: ChecksumMethod | undefined = isStringOption(checksumMethodRaw, CHECKSUM_METHODS)
      ? checksumMethodRaw
      : undefined;
    if (checksumMethodRaw && !checksumMethod) {
      issues.push(
        issue(
          'legacy.checksumMethodUnsupported',
          `${fieldPath}.validOption.checksumMethod`,
          `旧 checksumMethod 不在枚举内: ${checksumMethodRaw}`,
          'warning',
        ),
      );
    }

    field.validOption = {
      isChecksum: booleanValue(value.validOption.isChecksum, false),
      startFieldIndex: coerceToNumber(value.validOption.startFieldIndex, 0),
      endFieldIndex: coerceToNumber(value.validOption.endFieldIndex, 0),
      ...(checksumMethod ? { checksumMethod } : {}),
    };
  }

  if (inputType === 'expression') {
    const expressionConfig = normalizeExpression(value.expressionConfig);
    if (expressionConfig) {
      field.expressionConfig = expressionConfig;
    }
  }

  if (typeof value.bigEndian === 'boolean') {
    field.bigEndian = value.bigEndian;
  }

  if (typeof value.isASCII === 'boolean') {
    field.isASCII = value.isASCII;
  }

  if (value.factor !== undefined) {
    field.factor = coerceToNumber(value.factor, 1);
  }

  return field;
}

export function normalizeFrame(value: unknown, index: number, issues: ValidationIssue[]): FrameAsset | undefined {
  if (!isRecord(value)) {
    issues.push(issue('legacy.frameInvalid', `legacy.${index}`, '旧 frame 条目必须是对象'));
    return undefined;
  }

  const rawFields = Array.isArray(value.fields) ? value.fields : [];
  if (!Array.isArray(value.fields)) {
    issues.push(issue('legacy.fieldsInvalid', `legacy.${index}.fields`, '旧 frame 缺少 fields 数组'));
  }

  const direction = normalizeDirection(value.direction, `legacy.${index}.direction`, issues);

  const frame: FrameAsset = {
    id: stringValue(value.id, `legacy-frame-${index + 1}`),
    name: stringValue(value.name),
    direction,
    fields: rawFields
      .map((field, fieldIndex) => normalizeField(field, index, fieldIndex, issues))
      .filter((field): field is FrameFieldDefinition => field !== undefined),
    description: stringValue(value.description),
    frameType: stringValue(value.frameType),
    protocol: stringValue(value.protocol),
    isFavorite: booleanValue(value.isFavorite, false),
    identifierRules: Array.isArray(value.identifierRules)
      ? value.identifierRules
          .map((rule, ruleIndex) => normalizeIdentifierRule(rule, `legacy.${index}.identifierRules.${ruleIndex}`, issues))
          .filter((rule): rule is IdentifierRule => rule !== undefined)
      : [],
  };

  if (isRecord(value.options)) {
    frame.options = {
      autoChecksum: booleanValue(value.options.autoChecksum, true),
      bigEndian: booleanValue(value.options.bigEndian, false),
      includeLengthField: booleanValue(value.options.includeLengthField, false),
    };
  }

  if (typeof value.createdAt === 'string') {
    frame.createdAt = value.createdAt;
  }

  if (typeof value.updatedAt === 'string') {
    frame.updatedAt = value.updatedAt;
  }

  return frame;
}

export function isRecordCheck(value: unknown): value is UnknownRecord {
  return isRecord(value);
}

export function createIssue(
  code: string,
  path: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue {
  return issue(code, path, message, severity);
}

export function isLegacyFrameConfigJson(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isRecordCheck(item) && Array.isArray(item.fields));
}

export function migrateLegacyFrameConfig(value: unknown): LegacyFrameMigrationResult {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(value)) {
    return {
      recognized: false,
      frames: [],
      issues: [createIssue('legacy.rootInvalid', 'legacy', '旧 frame 导入内容必须是数组')],
    };
  }

  const frames = value
    .map((item, index) => normalizeFrame(item, index, issues))
    .filter((frame): frame is FrameAsset => frame !== undefined);

  const validation = validateFrameAssetCollection(frames);

  return {
    recognized: true,
    frames,
    issues: [...issues, ...validation.issues],
  };
}
