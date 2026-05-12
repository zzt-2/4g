import type { ValidationIssue, ValidationResult } from './types';

export function createIssue(
  code: string,
  path: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue {
  return { severity, code, path, message };
}

export function toResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

export function isOneOf<T extends readonly string[]>(value: string, options: T): value is T[number] {
  return (options as readonly string[]).includes(value);
}

export function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
