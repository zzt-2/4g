import { compileExpression } from '@/shared/expression';
import { tokenize } from '@/shared/expression/tokenizer';
import {
  EXPRESSION_SOURCE_TYPES,
  type ConditionalExpressionDefinition,
  type ExpressionDefinition,
  type ExpressionVariableDefinition,
  type ValidationIssue,
  type ValidationResult,
} from './types';
import { createIssue, hasText, isOneOf, toResult } from './validation-utils';

const EXPRESSION_KEYWORDS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'Math',
  'sin',
  'cos',
  'tan',
  'log',
  'exp',
  'sqrt',
  'abs',
  'floor',
  'ceil',
  'round',
  'max',
  'min',
  'pow',
]);

const DANGEROUS_EXPRESSION_PATTERNS: readonly RegExp[] = [
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bwindow\./,
  /\bdocument\./,
  /\bprocess\./,
  /\brequire\s*\(/,
  /\bimport\s+/,
  /\bexport\s+/,
];

function validateExpressionSyntax(value: string, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!hasText(value)) {
    issues.push(createIssue('expression.empty', path, '表达式不能为空'));
    return issues;
  }

  const compileResult = compileExpression(value);
  if (!compileResult.success) {
    issues.push(createIssue('expression.compile', path, `表达式语法错误: ${compileResult.error}`));
  }

  if (DANGEROUS_EXPRESSION_PATTERNS.some((pattern) => pattern.test(value))) {
    issues.push(createIssue('expression.unsafe', path, '表达式包含不允许的运行时代码'));
  }

  return issues;
}

function extractExpressionIdentifiers(value: string): string[] {
  const result = tokenize(value);
  if (!result.success) return [];
  return Array.from(new Set(
    result.tokens
      .filter((t: { type: string }) => t.type === 'IDENTIFIER')
      .map((t: { value: string }) => t.value)
      .filter((name: string) => !EXPRESSION_KEYWORDS.has(name)),
  ));
}

function validateVariable(
  variable: ExpressionVariableDefinition,
  path: string,
  seenIdentifiers: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(variable.identifier)) {
    issues.push(createIssue('expression.variableIdentifier', path, '变量标识符必须是合法标识符'));
  }

  if (seenIdentifiers.has(variable.identifier)) {
    issues.push(createIssue('expression.variableDuplicate', path, '变量标识符不能重复'));
  }
  seenIdentifiers.add(variable.identifier);

  if (!isOneOf(variable.sourceType, EXPRESSION_SOURCE_TYPES)) {
    issues.push(
      createIssue('expression.variableSourceUnsupported', path, '变量来源类型不在本轮 pilot 范围内'),
    );
    return issues;
  }

  if (variable.sourceType === 'frame_field') {
    if (!hasText(variable.frameId)) {
      issues.push(createIssue('expression.variableFrameMissing', `${path}.frameId`, '帧字段来源必须指定帧 ID'));
    }
    if (!hasText(variable.fieldId)) {
      issues.push(createIssue('expression.variableFieldMissing', `${path}.fieldId`, '帧字段来源必须指定字段 ID'));
    }
    return issues;
  }

  if (!hasText(variable.sourceId) && !hasText(variable.fieldId)) {
    issues.push(createIssue('expression.variableSourceMissing', path, '变量来源必须指定 sourceId 或 fieldId'));
  }

  return issues;
}

function validateConditionalExpression(
  expression: ConditionalExpressionDefinition,
  path: string,
  variableIdentifiers: Set<string>,
): ValidationIssue[] {
  const issues = [
    ...validateExpressionSyntax(expression.condition, `${path}.condition`),
    ...validateExpressionSyntax(expression.expression, `${path}.expression`),
  ];

  for (const expressionKey of ['condition', 'expression'] as const) {
    for (const usedIdentifier of extractExpressionIdentifiers(expression[expressionKey])) {
      if (!variableIdentifiers.has(usedIdentifier)) {
        issues.push(
          createIssue(
            'expression.variableUndefined',
            `${path}.${expressionKey}`,
            `表达式引用了未定义变量 ${usedIdentifier}`,
          ),
        );
      }
    }
  }

  return issues;
}

export function validateExpressionDefinition(
  expression: ExpressionDefinition | undefined,
  path = 'expressionConfig',
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!expression) {
    return toResult([createIssue('expression.missing', path, '表达式字段必须配置表达式定义')]);
  }

  if (!Array.isArray(expression.expressions) || expression.expressions.length === 0) {
    issues.push(createIssue('expression.expressionsEmpty', `${path}.expressions`, '至少需要一个表达式'));
  }

  if (!Array.isArray(expression.variables)) {
    issues.push(createIssue('expression.variablesInvalid', `${path}.variables`, '变量映射必须是数组'));
    return toResult(issues);
  }

  const seenIdentifiers = new Set<string>();
  for (const [index, variable] of expression.variables.entries()) {
    issues.push(...validateVariable(variable, `${path}.variables.${index}`, seenIdentifiers));
  }

  for (const [index, item] of expression.expressions.entries()) {
    issues.push(...validateConditionalExpression(item, `${path}.expressions.${index}`, seenIdentifiers));
  }

  return toResult(issues);
}
