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
import { createIssue, hasText, isOneOf, toResult } from './validation-utils';

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

const BIGINT_RANGE_BY_TYPE: Partial<Record<FrameDataType, readonly [bigint, bigint]>> = {
  uint64: [0n, 18_446_744_073_709_551_615n],
  int64: [-9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n],
};

function parseBigintValue(text: string): bigint | null {
  const str = text.trim();
  if (str === '') return null;
  if (/^-?0x[0-9a-f]+$/i.test(str)) {
    const negative = str.startsWith('-');
    const body = negative ? str.slice(1) : str;
    try {
      const bi = BigInt(body);
      return negative ? -bi : bi;
    } catch {
      return null;
    }
  }
  if (/^-?\d+$/.test(str)) {
    try {
      return BigInt(str);
    } catch {
      return null;
    }
  }
  return null;
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

  // uint64/int64 默认值范围校验
  const bigintRange = BIGINT_RANGE_BY_TYPE[field.dataType];
  if (bigintRange && typeof field.defaultValue === 'string' && field.defaultValue.trim() !== '') {
    const parsed = parseBigintValue(field.defaultValue);
    if (parsed === null) {
      issues.push(
        createIssue(
          'field.defaultValueInvalidBigint',
          `${path}.defaultValue`,
          `${field.dataType} 默认值无法解析为整数（支持 10 进制或 0x 前缀 16 进制）`,
        ),
      );
    } else if (parsed < bigintRange[0] || parsed > bigintRange[1]) {
      issues.push(
        createIssue(
          'field.defaultValueOutOfRange',
          `${path}.defaultValue`,
          `${field.dataType} 默认值 ${parsed.toString()} 超出范围 [${bigintRange[0].toString()}, ${bigintRange[1].toString()}]`,
        ),
      );
    }
  }

  if (field.inputType === 'expression') {
    issues.push(...validateExpressionDefinition(field.expressionConfig, `${path}.expressionConfig`).issues);
  }

  return toResult(issues);
}
