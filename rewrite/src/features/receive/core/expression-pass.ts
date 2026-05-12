import type { ExpressionVariableDefinition, ReadonlyFrameAsset } from '@/features/frame';
import {
  compileConditional,
  defaultMathFunctions,
  evaluateConditional,
} from '@/shared/expression';
import type {
  CompiledConditional,
  FunctionTable,
  GroupEvalResult,
  VariableMap,
  VariableValue,
} from '@/shared/expression';
import type {
  ExpressionCompileCache,
  ExpressionEvalInput,
  FrameExpressionCompileResult,
} from './types';

interface FieldWithExpression {
  readonly id: string;
  readonly name: string;
  readonly expressionConfig: {
    readonly expressions: ReadonlyArray<{ readonly condition: string; readonly expression: string }>;
    readonly variables: readonly ExpressionVariableDefinition[];
  };
}

export function compileFrameExpressions(
  frames: readonly ReadonlyFrameAsset[],
  mathFunctions: FunctionTable = defaultMathFunctions,
): ExpressionCompileCache {
  const cache = new Map<string, FrameExpressionCompileResult>();

  for (const frame of frames) {
    const fieldsWithExpr = frame.fields.filter(
      (f): f is typeof f & { expressionConfig: NonNullable<typeof f.expressionConfig> } =>
        !!f.expressionConfig && f.expressionConfig.expressions.length > 0,
    );

    if (fieldsWithExpr.length === 0) continue;

    const result = compileSingleFrame(frame.id, fieldsWithExpr, mathFunctions);
    cache.set(frame.id, result);
  }

  return cache;
}

function compileSingleFrame(
  frameId: string,
  fieldsWithExpr: readonly FieldWithExpression[],
  mathFunctions: FunctionTable,
): FrameExpressionCompileResult {
  const compiledFields = new Map<string, CompiledConditional>();
  const variablesMap = new Map<string, readonly ExpressionVariableDefinition[]>();
  const compileErrors: string[] = [];

  for (const field of fieldsWithExpr) {
    const config = field.expressionConfig;
    const result = compileConditional(config.expressions, 0, mathFunctions);

    if (!result.success) {
      compileErrors.push(`field "${field.name}": ${result.error}`);
      continue;
    }

    compiledFields.set(field.id, result.compiled);
    variablesMap.set(field.id, config.variables);
  }

  if (compileErrors.length > 0) {
    return { success: false, error: compileErrors.join('; ') };
  }

  const orderResult = computeEvalOrder(fieldsWithExpr, frameId);
  if ('cycle' in orderResult) {
    return { success: false, error: `circular dependency: ${orderResult.cycle.join(', ')}` };
  }

  return {
    success: true,
    compiled: {
      fields: compiledFields,
      variables: variablesMap,
      evalOrder: orderResult.order,
    },
  };
}

function computeEvalOrder(
  fieldsWithExpr: readonly FieldWithExpression[],
  frameId: string,
): { readonly order: readonly string[] } | { readonly cycle: readonly string[] } {
  const fieldIds = new Set(fieldsWithExpr.map((f) => f.id));
  const deps = new Map<string, Set<string>>();

  for (const field of fieldsWithExpr) {
    const fieldDeps = new Set<string>();
    for (const v of field.expressionConfig.variables) {
      if (
        v.sourceType === 'frame_field' &&
        v.frameId === frameId &&
        v.fieldId &&
        fieldIds.has(v.fieldId) &&
        v.fieldId !== field.id
      ) {
        fieldDeps.add(v.fieldId);
      }
    }
    deps.set(field.id, fieldDeps);
  }

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, Set<string>>();

  for (const id of fieldIds) {
    inDegree.set(id, 0);
    adjList.set(id, new Set());
  }

  for (const [id, idDeps] of deps) {
    for (const dep of idDeps) {
      adjList.get(dep)!.add(id);
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjList.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (order.length < fieldIds.size) {
    const cycleNodes = [...fieldIds].filter((id) => !order.includes(id));
    return { cycle: cycleNodes };
  }

  return { order };
}

export function evaluateFrameExpressions(input: ExpressionEvalInput): GroupEvalResult {
  const values = new Map<string, VariableValue>();
  const errors = new Map<string, string>();
  const resolvedValues = new Map<string, VariableValue>();

  for (const fieldId of input.compiled.evalOrder) {
    const fieldCompiled = input.compiled.fields.get(fieldId);
    if (!fieldCompiled) {
      errors.set(fieldId, 'missing compiled expression');
      continue;
    }

    const variableDefs = input.compiled.variables.get(fieldId) ?? [];
    const vars = buildVariableMap(
      variableDefs,
      input.currentFrameRawValues,
      resolvedValues,
      input.readModel,
      input.globalParams,
      input.frameId,
    );

    const result = evaluateConditional(fieldCompiled, vars);

    if (result.success) {
      values.set(fieldId, result.value);
      resolvedValues.set(fieldId, result.value);
    } else {
      errors.set(fieldId, result.error);
    }
  }

  return { values, errors };
}

function buildVariableMap(
  variableDefs: readonly ExpressionVariableDefinition[],
  currentFrameRawValues: ReadonlyMap<string, VariableValue>,
  currentFrameResolvedValues: ReadonlyMap<string, VariableValue>,
  readModel: ReadonlyMap<string, ReadonlyMap<string, VariableValue>>,
  globalParams: ReadonlyMap<string, VariableValue>,
  currentFrameId: string,
): VariableMap {
  const vars = new Map<string, VariableValue>();

  for (const def of variableDefs) {
    let value: VariableValue | undefined;

    switch (def.sourceType) {
      case 'current_field':
        if (def.fieldId) {
          value = currentFrameResolvedValues.get(def.fieldId)
            ?? currentFrameRawValues.get(def.fieldId);
        }
        break;
      case 'frame_field':
        if (def.frameId && def.fieldId) {
          if (def.frameId === currentFrameId) {
            value = currentFrameResolvedValues.get(def.fieldId)
              ?? currentFrameRawValues.get(def.fieldId);
          } else {
            value = readModel.get(def.frameId)?.get(def.fieldId);
          }
        }
        break;
      case 'global_stat':
        if (def.identifier) {
          value = globalParams.get(def.identifier);
        }
        break;
    }

    if (value !== undefined) {
      vars.set(def.identifier, value);
    }
  }

  return vars;
}
