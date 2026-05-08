import {
  DATA_PARTICIPATION_TYPES,
  FRAME_DATA_TYPES,
  FRAME_INPUT_TYPES,
  type FrameDataType,
  type FrameFieldDefinition,
  type ValidationIssue,
  type ValidationResult,
} from './types';
import { validateExpressionDefinition } from './validation-expression';

const FIXED_DATA_TYPE_LENGTHS: Partial<Record<FrameDataType, number>> = {
  uint8: 1,
  int8: 1,
  uint16: 2,
  int16: 2,
  uint32: 4,
  int32: 4,
  uint64: 8,
  int64: 8,
  float: 4,
  double: 8,
};

function createIssue(
  code: string,
  path: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue {
  return { severity, code, path, message };
}

function toResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

function isOneOf<T extends readonly string[]>(value: string, options: T): value is T[number] {
  return (options as readonly string[]).includes(value);
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateFrameField(
  field: FrameFieldDefinition,
  path = 'field',
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!hasText(field.id)) {
    issues.push(createIssue('field.idMissing', `${path}.id`, '字段 ID 不能为空'));
  }

  if (!hasText(field.name)) {
    issues.push(createIssue('field.nameMissing', `${path}.name`, '字段名称不能为空'));
  }

  if (!isOneOf(field.dataType, FRAME_DATA_TYPES)) {
    issues.push(createIssue('field.dataTypeUnsupported', `${path}.dataType`, '字段类型不在本轮 pilot 范围内'));
  }

  if (!Number.isInteger(field.length) || field.length <= 0) {
    issues.push(createIssue('field.lengthInvalid', `${path}.length`, '字段长度必须是正整数'));
  }

  const fixedLength = FIXED_DATA_TYPE_LENGTHS[field.dataType];
  if (fixedLength !== undefined && field.length !== fixedLength) {
    issues.push(
      createIssue(
        'field.lengthMismatch',
        `${path}.length`,
        `字段类型 ${field.dataType} 的长度应为 ${fixedLength}`,
      ),
    );
  }

  if (!isOneOf(field.inputType, FRAME_INPUT_TYPES)) {
    issues.push(createIssue('field.inputTypeUnsupported', `${path}.inputType`, '字段输入类型不受支持'));
  }

  if (!isOneOf(field.dataParticipationType, DATA_PARTICIPATION_TYPES)) {
    issues.push(
      createIssue(
        'field.dataParticipationUnsupported',
        `${path}.dataParticipationType`,
        '数据参与类型不受支持',
      ),
    );
  }

  if ((field.inputType === 'select' || field.inputType === 'radio') && field.options.length === 0) {
    issues.push(createIssue('field.optionsMissing', `${path}.options`, '选择类字段必须提供选项'));
  }

  if (field.inputType === 'expression') {
    issues.push(...validateExpressionDefinition(field.expressionConfig, `${path}.expressionConfig`).issues);
  }

  return toResult(issues);
}
