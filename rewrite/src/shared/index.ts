export { cloneUnknownValue } from './utils/clone-unknown';
export { compareValues } from './condition-operators';
export type { ComparisonOperator } from './condition-operators';
export { TimerRegistry } from './timer';
export { defaultNow } from './utils/timestamp';

export {
  compileExpression,
  compileConditional,
  compileGroup,
  evaluate,
  evaluateConditional,
  evaluateGroup,
  defaultMathFunctions,
} from './expression';
export type {
  VariableValue,
  VariableMap,
  FunctionTable,
  CompileResult,
  EvalResult,
  ConditionalCompileResult,
  ConditionalEvalResult,
  GroupCompileResult,
  GroupEvalResult,
  CompiledExpr,
  CompiledConditional,
  CompiledGroup,
} from './expression';
