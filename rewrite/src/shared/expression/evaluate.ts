import type {
  VariableMap, EvalResult, ConditionalEvalResult, GroupEvalResult,
  CompiledExpr, CompiledConditional, CompiledGroup,
} from './types';

export function evaluate(compiled: CompiledExpr, variables: VariableMap): EvalResult {
  try {
    const value = compiled._fn(variables);
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { success: false, error: 'result is not finite' };
    }
    return { success: true, value };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function evaluateConditional(
  compiled: CompiledConditional,
  variables: VariableMap,
): ConditionalEvalResult {
  for (let i = 0; i < compiled._branches.length; i++) {
    const branch = compiled._branches[i]!;
    try {
      const condValue = branch.conditionFn(variables);
      if (condValue === true) {
        const value = branch.expressionFn(variables);
        if (typeof value === 'number' && !Number.isFinite(value)) {
          return { success: false, error: 'result is not finite' };
        }
        return { success: true, value, matchedIndex: i };
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { success: true, value: compiled.fallback, matchedIndex: -1 };
}

export function evaluateGroup(
  group: CompiledGroup,
  variables: VariableMap,
): GroupEvalResult {
  const values = new Map<string, number | string | boolean>();
  const errors = new Map<string, string>();
  const vars = new Map(variables);

  for (const key of group._order) {
    const compiled = group._compiled.get(key);
    if (!compiled) {
      errors.set(key, 'missing compiled expression');
      continue;
    }
    try {
      const value = compiled._fn(vars);
      if (typeof value === 'number' && !Number.isFinite(value)) {
        errors.set(key, 'result is not finite');
        continue;
      }
      values.set(key, value);
      vars.set(key, value);
    } catch (e) {
      errors.set(key, e instanceof Error ? e.message : String(e));
    }
  }

  return { values, errors };
}
