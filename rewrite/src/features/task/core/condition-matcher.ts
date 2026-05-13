import type { WaitCondition, ConditionTerm, ConditionMatchInput } from './types';
import { compareValues } from '@/shared/condition-operators';

export function evaluateCondition(
  condition: WaitCondition,
  input: ConditionMatchInput,
): boolean {
  if (input.frameId !== condition.frameId) {
    return false;
  }
  if (condition.sourceId !== undefined) {
    if (input.sourceId === undefined || condition.sourceId !== input.sourceId) {
      return false;
    }
  }
  const value = input.fieldValues[condition.fieldId];
  if (value === undefined) return false;
  return compareValues(value, condition.threshold, condition.operator);
}

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
    } else {
      result = result && matches;
    }
  }
  return result;
}
