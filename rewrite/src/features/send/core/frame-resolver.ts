import type { ReadonlyFrameAsset } from '@/features/frame';
import { compileConditional, evaluateConditional, kahnSort } from '@/shared/expression';
import type { VariableMap } from '@/shared/expression/types';
import type {
  SendFieldEncodingDef,
  SendFieldValue,
  SendBuildIssue,
} from './types';
import type { SendVariableProvider } from '../adapters/ports';

export function frameToBuildInput(
  frame: ReadonlyFrameAsset,
): { fields: SendFieldEncodingDef[]; totalByteLength: number } {
  const fields: SendFieldEncodingDef[] = [];
  let offset = 0;
  const frameEndian = frame.options?.bigEndian ?? false;

  for (const field of frame.fields) {
    fields.push({
      id: field.id,
      dataType: field.dataType,
      length: field.length,
      bigEndian: field.bigEndian ?? frameEndian,
      isASCII: field.isASCII ?? false,
      offset,
      factor: field.factor ?? 1,
      defaultValue: field.defaultValue,
      configurable: field.configurable,
      expressionConfig: field.expressionConfig,
      validOption: field.validOption,
    });
    offset += field.length;
  }

  return { fields, totalByteLength: offset };
}

export function resolveFieldValues(
  fields: readonly SendFieldEncodingDef[],
  userFieldValues: Readonly<Record<string, SendFieldValue>>,
  variableProvider: SendVariableProvider,
  variables?: VariableMap,
): { values: Record<string, SendFieldValue>; issues: SendBuildIssue[] } {
  const values: Record<string, SendFieldValue> = {};
  const issues: SendBuildIssue[] = [];

  // Merge provider variables with caller-supplied variables
  const providerVars = variableProvider.getVariables();
  const mergedVars: Map<string, number | string | boolean> = new Map(providerVars);
  if (variables) {
    for (const [k, v] of variables) {
      mergedVars.set(k, v);
    }
  }

  // Separate expression fields from non-expression fields
  const expressionFields: SendFieldEncodingDef[] = [];
  for (const field of fields) {
    // Configurable fields with user values are resolved directly (Priority 1),
    // UNLESS they are self-referencing expressions (e.g. speed = speed + step)
    // which need to go through expression evaluation with the user value as seed.
    const hasUserValue = field.configurable && field.id in userFieldValues;
    if (hasUserValue && !isSelfReferencing(field)) continue;
    if (field.expressionConfig) {
      expressionFields.push(field);
    }
  }

  // Phase 1: Resolve non-expression fields (configurable with user value, default, zero-fill)
  for (const field of fields) {
    // Self-referencing configurable fields are handled in Phase 2/4
    const hasUserValue = field.configurable && field.id in userFieldValues;
    if (hasUserValue && !isSelfReferencing(field)) {
      values[field.id] = userFieldValues[field.id]!;
      mergedVars.set(field.id, userFieldValues[field.id]! as number | string | boolean);
      continue;
    }

    // Skip expression fields (handled in Phase 4)
    if (field.expressionConfig) continue;

    if (field.defaultValue !== undefined) {
      const parsed = parseDefaultValue(field.defaultValue);
      values[field.id] = parsed;
      mergedVars.set(field.id, parsed as number | string | boolean);
      continue;
    }

    values[field.id] = 0;
    issues.push({
      severity: 'warning',
      code: 'send.resolve.zeroFill',
      fieldId: field.id,
      message: `Field "${field.id}" has no value source; zero-filled`,
    });
  }

  // Phase 2: Seed initial values for self-referencing expression fields
  for (const field of expressionFields) {
    if (field.id in userFieldValues) {
      // Has previous value from writeback
      const userVal = userFieldValues[field.id]!;
      values[field.id] = userVal;
      mergedVars.set(field.id, userVal as number | string | boolean);
    } else if (isSelfReferencing(field)) {
      // Self-referencing field without previous value — seed with default/0
      const seedValue = field.defaultValue !== undefined
        ? parseDefaultValue(field.defaultValue)
        : 0;
      values[field.id] = seedValue;
      mergedVars.set(field.id, seedValue as number | string | boolean);
    }
  }

  // Phase 3: Topological sort expression fields by dependencies
  const sortedExpressionFields = topologicalSortExpressions(expressionFields, issues);

  // Phase 4: Resolve expression fields in topological order
  for (const field of sortedExpressionFields) {
    const result = evaluateFieldExpressions(field, mergedVars);
    if (result.value !== null) {
      values[field.id] = result.value;
      mergedVars.set(field.id, result.value as number | string | boolean);
    } else {
      if (!(field.id in values)) {
        values[field.id] = 0;
      }
    }
    issues.push(...result.issues);
  }

  return { values, issues };
}

function isSelfReferencing(field: SendFieldEncodingDef): boolean {
  if (!field.expressionConfig) return false;
  return field.expressionConfig.variables.some(
    v => v.sourceType === 'current_field' && v.sourceId === field.id,
  );
}

function topologicalSortExpressions(
  fields: readonly SendFieldEncodingDef[],
  issues: SendBuildIssue[],
): SendFieldEncodingDef[] {
  if (fields.length <= 1) return [...fields];

  const fieldMap = new Map(fields.map(f => [f.id, f]));

  // Build dependency map: fieldId → Set of depended-upon expression fieldIds
  const depsMap = new Map<string, Set<string>>();
  for (const field of fields) {
    const deps = new Set<string>();
    if (field.expressionConfig) {
      for (const v of field.expressionConfig.variables) {
        if (v.sourceType === 'current_field' && v.sourceId && v.sourceId !== field.id) {
          if (fieldMap.has(v.sourceId)) {
            deps.add(v.sourceId);
          }
        }
      }
    }
    depsMap.set(field.id, deps);
  }

  const result = kahnSort(depsMap);

  if ('cycle' in result) {
    issues.push({
      severity: 'error',
      code: 'send.resolve.expressionCycle',
      message: `Circular dependency detected among expression fields: ${result.cycle.join(', ')}`,
    });
    // Return non-cycle fields first, then cycle fields (best-effort)
    const nonCycleIds = new Set(fields.map(f => f.id).filter(id => !result.cycle.includes(id)));
    const sorted = fields.filter(f => nonCycleIds.has(f.id));
    sorted.push(...fields.filter(f => !nonCycleIds.has(f.id)));
    return sorted;
  }

  return result.order.map(id => fieldMap.get(id)!);
}

function resolveExpressionVariables(
  expressionConfig: NonNullable<SendFieldEncodingDef['expressionConfig']>,
  fieldValues: VariableMap,
): { variables: VariableMap; issues: SendBuildIssue[] } {
  const issues: SendBuildIssue[] = [];
  const resolved = new Map(fieldValues);

  for (const v of expressionConfig.variables) {
    if (v.sourceType === 'current_field' && v.sourceId) {
      const value = fieldValues.get(v.sourceId);
      if (value !== undefined) {
        resolved.set(v.identifier, value);
      } else {
        issues.push({
          severity: 'warning',
          code: 'send.resolve.variableSourceMissing',
          message: `Expression variable "${v.identifier}" source field "${v.sourceId}" has no value yet`,
        });
      }
    }
    // frame_field / global_stat: resolved by external provider or caller variables
  }

  return { variables: resolved, issues };
}

export function evaluateFieldExpressions(
  field: SendFieldEncodingDef,
  mergedVariables: VariableMap,
): { value: SendFieldValue | null; matchedBranchIndex: number; issues: SendBuildIssue[] } {
  const issues: SendBuildIssue[] = [];

  if (!field.expressionConfig) {
    return { value: null, matchedBranchIndex: -1, issues };
  }

  const { variables: evalVars, issues: resolveIssues } = resolveExpressionVariables(
    field.expressionConfig,
    mergedVariables,
  );
  issues.push(...resolveIssues);

  const branches = field.expressionConfig.expressions;
  const compileResult = compileConditional(branches);
  if (!compileResult.success) {
    issues.push({
      severity: 'error',
      code: 'send.resolve.expressionCompile',
      fieldId: field.id,
      message: `Expression compile failed for field "${field.id}": ${compileResult.error}`,
    });
    return { value: null, matchedBranchIndex: -1, issues };
  }

  const evalResult = evaluateConditional(compileResult.compiled, evalVars);
  if (!evalResult.success) {
    issues.push({
      severity: 'error',
      code: 'send.resolve.expressionEval',
      fieldId: field.id,
      message: `Expression eval failed for field "${field.id}": ${evalResult.error}`,
    });
    return { value: null, matchedBranchIndex: -1, issues };
  }

  return { value: evalResult.value, matchedBranchIndex: evalResult.matchedIndex, issues };
}

export function applyFactor(
  fields: readonly SendFieldEncodingDef[],
  fieldValues: Record<string, SendFieldValue>,
): { values: Record<string, SendFieldValue>; issues: SendBuildIssue[] } {
  const values: Record<string, SendFieldValue> = {};
  const issues: SendBuildIssue[] = [];

  for (const field of fields) {
    const rawValue = fieldValues[field.id];

    // bytes type or factor === 1: pass through unchanged
    if (field.dataType === 'bytes' || field.factor === 1) {
      values[field.id] = rawValue ?? 0;
      continue;
    }

    // Apply inverse factor: rawValue / factor
    if (field.factor === 0) {
      issues.push({
        severity: 'error',
        code: 'send.resolve.zeroFactor',
        fieldId: field.id,
        message: `Field "${field.id}" has factor=0, cannot apply inverse transform.`,
      });
      values[field.id] = rawValue ?? 0;
      continue;
    }

    if (typeof rawValue === 'number') {
      values[field.id] = rawValue / field.factor;
    } else if (typeof rawValue === 'string') {
      const num = Number(rawValue);
      if (Number.isFinite(num)) {
        values[field.id] = num / field.factor;
      } else {
        values[field.id] = rawValue;
      }
    } else {
      values[field.id] = rawValue;
    }
  }

  return { values, issues };
}

function parseDefaultValue(defaultValue: string): SendFieldValue {
  // Try number first
  const num = Number(defaultValue);
  if (!Number.isNaN(num) && defaultValue.trim() !== '') {
    return num;
  }
  return defaultValue;
}

export function evaluateFieldPreview(
  field: SendFieldEncodingDef,
  userFieldValues: Readonly<Record<string, SendFieldValue>>,
  variableProvider: SendVariableProvider,
  variables?: VariableMap,
): { value: SendFieldValue; issues: SendBuildIssue[] } {
  const result = resolveFieldValues([field], userFieldValues, variableProvider, variables);
  const factored = applyFactor([field], result.values);
  const value = factored.values[field.id] ?? 0;
  return { value, issues: [...result.issues, ...factored.issues] };
}

export function evaluateFieldPreviewForUI(
  frame: ReadonlyFrameAsset,
  fieldId: string,
  userFieldValues: Readonly<Record<string, SendFieldValue>>,
  variableProvider: SendVariableProvider,
  variables?: VariableMap,
): { value: SendFieldValue; matchedBranchIndex: number; issues: SendBuildIssue[] } {
  const { fields } = frameToBuildInput(frame);
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return { value: 0, matchedBranchIndex: -1, issues: [] };

  const base = evaluateFieldPreview(field, userFieldValues, variableProvider, variables);

  // For expression fields, independently re-evaluate to expose the matched
  // branch index (UI 公式显示用). mergedVars = provider vars + caller vars +
  // known field values (user values + resolved peer values for current_field refs).
  let matchedBranchIndex = -1;
  if (field.expressionConfig) {
    const mergedVars: Map<string, number | string | boolean> = new Map(variableProvider.getVariables());
    if (variables) {
      for (const [k, v] of variables) mergedVars.set(k, v);
    }
    // Seed all peer field values so current_field references can resolve.
    for (const f of fields) {
      const v = userFieldValues[f.id];
      if (v !== undefined) mergedVars.set(f.id, v as number | string | boolean);
    }
    const exprResult = evaluateFieldExpressions(field, mergedVars);
    matchedBranchIndex = exprResult.matchedBranchIndex;
  }

  return { value: base.value, matchedBranchIndex, issues: base.issues };
}
