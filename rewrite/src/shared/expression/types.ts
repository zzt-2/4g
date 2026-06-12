export type VariableValue = number | string | boolean | bigint;
export type VariableMap = ReadonlyMap<string, VariableValue>;
export type FunctionTable = ReadonlyMap<string, (...args: number[]) => number>;

export type CompileResult =
  | { readonly success: true; readonly compiled: CompiledExpr }
  | { readonly success: false; readonly error: string; readonly position?: number };

export type EvalResult =
  | { readonly success: true; readonly value: VariableValue }
  | { readonly success: false; readonly error: string };

export type ConditionalCompileResult =
  | { readonly success: true; readonly compiled: CompiledConditional }
  | { readonly success: false; readonly error: string; readonly position?: number };

export type ConditionalEvalResult =
  | { readonly success: true; readonly value: VariableValue; readonly matchedIndex: number }
  | { readonly success: false; readonly error: string };

export type GroupCompileResult =
  | { readonly success: true; readonly group: CompiledGroup }
  | { readonly success: false; readonly errors: ReadonlyMap<string, string> };

export interface GroupEvalResult {
  readonly values: ReadonlyMap<string, VariableValue>;
  readonly errors: ReadonlyMap<string, string>;
}

export interface CompiledExpr {
  readonly _fn: (vars: VariableMap) => VariableValue;
  readonly _deps: ReadonlySet<string>;
}

export interface CompiledConditional {
  readonly _branches: ReadonlyArray<{
    readonly conditionFn: (vars: VariableMap) => VariableValue;
    readonly expressionFn: (vars: VariableMap) => VariableValue;
  }>;
  readonly fallback: number;
}

export interface CompiledGroup {
  readonly _order: ReadonlyArray<string>;
  readonly _compiled: ReadonlyMap<string, CompiledExpr>;
}
