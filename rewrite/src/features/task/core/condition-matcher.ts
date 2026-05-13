import type { ConditionTerm } from './types';
import { compareValues } from '@/shared/condition-operators';

export function evaluateSingleCondition(
  condition: ConditionTerm,
  fieldValues: Record<string, number | string | null>,
): boolean {
  const value = fieldValues[condition.fieldId];
  if (value === null || value === undefined) return false;
  return compareValues(value, condition.threshold, condition.operator);
}

export function evaluateConditionGroup(
  conditions: readonly ConditionTerm[],
  fieldValues: Record<string, number | string | null>,
): boolean {
  if (conditions.length === 0) return true;

  let result = evaluateSingleCondition(conditions[0]!, fieldValues);

  for (let i = 1; i < conditions.length; i++) {
    const matches = evaluateSingleCondition(conditions[i]!, fieldValues);
    const logicOp = conditions[i]!.logicOperator ?? 'and';

    if (logicOp === 'or') {
      result = result || matches;
      if (result) break; // OR short-circuit
    } else {
      result = result && matches;
      if (!result) break; // AND short-circuit
    }
  }
  return result;
}
