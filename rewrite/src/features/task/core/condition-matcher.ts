import type { WaitCondition, ConditionMatchInput } from './types';
import { compareValues } from '@/shared/condition-operators';

export function evaluateCondition(
  condition: WaitCondition,
  input: ConditionMatchInput,
): boolean {
  if (input.frameId !== condition.frameId || input.fieldId !== condition.fieldId) {
    return false;
  }
  if (condition.sourceId !== undefined) {
    if (input.sourceId === undefined || condition.sourceId !== input.sourceId) {
      return false;
    }
  }
  return compareValues(input.value, condition.threshold, condition.operator);
}
