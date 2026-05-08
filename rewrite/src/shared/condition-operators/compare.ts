import type { ComparisonOperator } from './types';

export function compareValues(actual: unknown, threshold: unknown, operator: ComparisonOperator): boolean {
  if (operator === 'any') {
    return actual != null;
  }

  if (operator === 'change') {
    return actual != null && threshold != null && actual !== threshold;
  }

  if (operator === 'contains') {
    if (actual == null || threshold == null) return false;
    return String(actual).includes(String(threshold));
  }

  if (actual == null || threshold == null) {
    return false;
  }

  const actualNum = toNumber(actual);
  const thresholdNum = toNumber(threshold);

  const useNumeric = actualNum != null && thresholdNum != null;

  if (useNumeric) {
    return numericCompare(actualNum, thresholdNum, operator);
  }

  return stringCompare(String(actual), String(threshold), operator);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) {
      const parsed = Number.parseInt(value, 16);
      return Number.isNaN(parsed) ? null : parsed;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return null;
}

function numericCompare(a: number, b: number, op: ComparisonOperator): boolean {
  switch (op) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'gt': return a > b;
    case 'lt': return a < b;
    case 'gte': return a >= b;
    case 'lte': return a <= b;
    default: return false;
  }
}

function stringCompare(a: string, b: string, op: ComparisonOperator): boolean {
  switch (op) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'gt': return a > b;
    case 'lt': return a < b;
    case 'gte': return a >= b;
    case 'lte': return a <= b;
    default: return false;
  }
}
