import type { ReadonlyFrameAsset } from '@/features/frame';
import { compileConditional, evaluateConditional } from '@/shared/expression';
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

  for (const field of fields) {
    // Priority 1: configurable field with user value
    if (field.configurable && field.id in userFieldValues) {
      values[field.id] = userFieldValues[field.id]!;
      mergedVars.set(field.id, userFieldValues[field.id]! as number | string | boolean);
      continue;
    }

    // Priority 2: expression config
    if (field.expressionConfig) {
      const result = evaluateFieldExpressions(field, mergedVars);
      if (result.value !== null) {
        values[field.id] = result.value;
        mergedVars.set(field.id, result.value as number | string | boolean);
      } else {
        values[field.id] = 0;
      }
      issues.push(...result.issues);
      continue;
    }

    // Priority 3: default value
    if (field.defaultValue !== undefined) {
      const parsed = parseDefaultValue(field.defaultValue);
      values[field.id] = parsed;
      mergedVars.set(field.id, parsed as number | string | boolean);
      continue;
    }

    // Priority 4: zero fill with warning
    values[field.id] = 0;
    issues.push({
      severity: 'warning',
      code: 'send.resolve.zeroFill',
      fieldId: field.id,
      message: `Field "${field.id}" has no value source; zero-filled`,
    });
  }

  return { values, issues };
}

export function evaluateFieldExpressions(
  field: SendFieldEncodingDef,
  mergedVariables: VariableMap,
): { value: SendFieldValue | null; issues: SendBuildIssue[] } {
  const issues: SendBuildIssue[] = [];

  if (!field.expressionConfig) {
    return { value: null, issues };
  }

  const branches = field.expressionConfig.expressions;
  const compileResult = compileConditional(branches);
  if (!compileResult.success) {
    issues.push({
      severity: 'error',
      code: 'send.resolve.expressionCompile',
      fieldId: field.id,
      message: `Expression compile failed for field "${field.id}": ${compileResult.error}`,
    });
    return { value: null, issues };
  }

  const evalResult = evaluateConditional(compileResult.compiled, mergedVariables);
  if (!evalResult.success) {
    issues.push({
      severity: 'error',
      code: 'send.resolve.expressionEval',
      fieldId: field.id,
      message: `Expression eval failed for field "${field.id}": ${evalResult.error}`,
    });
    return { value: null, issues };
  }

  return { value: evalResult.value, issues };
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
