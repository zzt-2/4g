import {
  FRAME_DIRECTIONS,
  IDENTIFIER_LOGIC_OPERATORS,
  IDENTIFIER_RULE_OPERATORS,
  type FrameAsset,
  type ValidationIssue,
  type ValidationResult,
} from './types';
import { validateFrameField } from './validation-field';

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

export function validateFrameAsset(frame: FrameAsset, path = 'frame'): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!hasText(frame.id)) {
    issues.push(createIssue('frame.idMissing', `${path}.id`, '帧 ID 不能为空'));
  }

  if (!hasText(frame.name)) {
    issues.push(createIssue('frame.nameMissing', `${path}.name`, '帧名称不能为空'));
  }

  if (!isOneOf(frame.direction, FRAME_DIRECTIONS)) {
    issues.push(createIssue('frame.directionUnsupported', `${path}.direction`, '帧方向必须是 send 或 receive'));
  }

  if (!Array.isArray(frame.fields) || frame.fields.length === 0) {
    issues.push(createIssue('frame.fieldsMissing', `${path}.fields`, '帧至少需要一个字段'));
    return toResult(issues);
  }

  const names = new Map<string, number>();
  for (const [index, field] of frame.fields.entries()) {
    issues.push(...validateFrameField(field, `${path}.fields.${index}`).issues);

    const fieldName = field.name.trim();
    if (!fieldName) {
      continue;
    }

    const count = names.get(fieldName) ?? 0;
    names.set(fieldName, count + 1);
  }

  for (const [name, count] of names.entries()) {
    if (count > 1) {
      issues.push(createIssue('frame.fieldNameDuplicate', `${path}.fields`, `字段名称必须唯一: ${name}`));
    }
  }

  if (frame.identifierRules) {
    for (const [index, rule] of frame.identifierRules.entries()) {
      const rulePath = `${path}.identifierRules.${index}`;
      if (!Number.isInteger(rule.startIndex) || rule.startIndex < 0) {
        issues.push(createIssue('frame.identifierRuleStartIndex', `${rulePath}.startIndex`, '标识规则 startIndex 必须是非负整数'));
      }
      if (!Number.isInteger(rule.endIndex) || rule.endIndex < 0) {
        issues.push(createIssue('frame.identifierRuleEndIndex', `${rulePath}.endIndex`, '标识规则 endIndex 必须是非负整数'));
      }
      if (!isOneOf(rule.operator, IDENTIFIER_RULE_OPERATORS)) {
        issues.push(createIssue('frame.identifierRuleOperator', `${rulePath}.operator`, '标识规则 operator 不在枚举内'));
      }
      if (!isOneOf(rule.logicOperator, IDENTIFIER_LOGIC_OPERATORS)) {
        issues.push(createIssue('frame.identifierRuleLogicOperator', `${rulePath}.logicOperator`, '标识规则 logicOperator 不在枚举内'));
      }
    }
  }

  return toResult(issues);
}

export function validateFrameAssetCollection(frames: readonly FrameAsset[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, number>();

  for (const [index, frame] of frames.entries()) {
    issues.push(...validateFrameAsset(frame, `frames.${index}`).issues);

    const id = frame.id.trim();
    if (!id) {
      continue;
    }

    ids.set(id, (ids.get(id) ?? 0) + 1);
  }

  for (const [id, count] of ids.entries()) {
    if (count > 1) {
      issues.push(createIssue('frame.idDuplicate', 'frames', `帧 ID 必须唯一: ${id}`));
    }
  }

  return toResult(issues);
}
