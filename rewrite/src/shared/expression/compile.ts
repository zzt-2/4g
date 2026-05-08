import type {
  VariableMap, FunctionTable, CompileResult,
  ConditionalCompileResult, GroupCompileResult,
  CompiledExpr,
} from './types';
import type { ASTNode, BinaryOp } from './_internal';
import { tokenize } from './tokenizer';
import { parse } from './parser';
import { extractDependencies, kahnSort } from './dependency';
import { defaultMathFunctions } from './functions';

class ExprError extends Error {}

function getVar(vars: VariableMap, name: string): number | string | boolean {
  if (!vars.has(name)) throw new ExprError(`undefined variable: ${name}`);
  const v = vars.get(name)!;
  if (v == null) throw new ExprError(`variable ${name} is null`);
  return v;
}

function compileNode(
  node: ASTNode,
  funcs: FunctionTable,
): (vars: VariableMap) => number | string | boolean {
  switch (node.type) {
    case 'number':
      return () => node.value;
    case 'string':
      return () => node.value;
    case 'boolean':
      return () => node.value;
    case 'variable':
      return (vars) => getVar(vars, node.name);
    case 'unary': {
      const operand = compileNode(node.operand, funcs);
      if (node.op === '-') return (vars) => -(operand(vars) as number);
      return (vars) => !(operand(vars));
    }
    case 'binary': {
      const left = compileNode(node.left, funcs);
      const right = compileNode(node.right, funcs);
      return makeBinary(node.op, left, right);
    }
    case 'call': {
      const argFns = node.args.map(a => compileNode(a, funcs));
      const fn = funcs.get(node.name);
      if (!fn) throw new ExprError(`unknown function: ${node.name}`);
      return (vars) => fn(...argFns.map(a => a(vars) as number));
    }
  }
}

function makeBinary(
  op: BinaryOp,
  left: (v: VariableMap) => number | string | boolean,
  right: (v: VariableMap) => number | string | boolean,
): (v: VariableMap) => number | string | boolean {
  switch (op) {
    case '+': return (v) => (left(v) as number) + (right(v) as number);
    case '-': return (v) => (left(v) as number) - (right(v) as number);
    case '*': return (v) => (left(v) as number) * (right(v) as number);
    case '/': return (v) => {
      const r = right(v) as number;
      if (r === 0) throw new ExprError('division by zero');
      return (left(v) as number) / r;
    };
    case '%': return (v) => {
      const r = right(v) as number;
      if (r === 0) throw new ExprError('division by zero');
      return (left(v) as number) % r;
    };
    case '==': return (v) => left(v) === right(v);
    case '!=': return (v) => left(v) !== right(v);
    case '>': return (v) => (left(v) as number) > (right(v) as number);
    case '<': return (v) => (left(v) as number) < (right(v) as number);
    case '>=': return (v) => (left(v) as number) >= (right(v) as number);
    case '<=': return (v) => (left(v) as number) <= (right(v) as number);
    case '&&': return (v) => !!(left(v)) && !!(right(v));
    case '||': return (v) => !!(left(v)) || !!(right(v));
  }
}

function validateFunctions(node: ASTNode, funcs: FunctionTable): string | null {
  switch (node.type) {
    case 'number': case 'string': case 'boolean': case 'variable':
      return null;
    case 'unary':
      return validateFunctions(node.operand, funcs);
    case 'binary':
      return validateFunctions(node.left, funcs) ?? validateFunctions(node.right, funcs);
    case 'call':
      if (!funcs.has(node.name)) return `unknown function: ${node.name}`;
      for (const arg of node.args) {
        const err = validateFunctions(arg, funcs);
        if (err) return err;
      }
      return null;
  }
}

function compileInternal(
  text: string,
  funcs: FunctionTable,
): CompileResult {
  const tokens = tokenize(text);
  if (!tokens.success) return { success: false, error: tokens.error, position: tokens.position };

  const parsed = parse(tokens.tokens);
  if (!parsed.success) return { success: false, error: parsed.error, position: parsed.position };

  const funcErr = validateFunctions(parsed.ast, funcs);
  if (funcErr) return { success: false, error: funcErr };

  const deps = extractDependencies(parsed.ast);
  const fn = compileNode(parsed.ast, funcs);

  return { success: true, compiled: { _fn: fn, _deps: deps } };
}

export function compileExpression(
  text: string,
  functions?: FunctionTable,
): CompileResult {
  return compileInternal(text, functions ?? defaultMathFunctions);
}

export function compileConditional(
  branches: ReadonlyArray<{ readonly condition: string; readonly expression: string }>,
  fallback: number = 0,
  functions?: FunctionTable,
): ConditionalCompileResult {
  const funcs = functions ?? defaultMathFunctions;
  const compiledBranches: Array<{
    conditionFn: (vars: VariableMap) => number | string | boolean;
    expressionFn: (vars: VariableMap) => number | string | boolean;
  }> = [];

  for (let i = 0; i < branches.length; i++) {
    const { condition, expression } = branches[i]!;

    const condResult = compileInternal(condition, funcs);
    if (!condResult.success) {
      return { success: false, error: `branch ${i} condition: ${condResult.error}`, position: condResult.position };
    }

    const exprResult = compileInternal(expression, funcs);
    if (!exprResult.success) {
      return { success: false, error: `branch ${i} expression: ${exprResult.error}`, position: exprResult.position };
    }

    compiledBranches.push({
      conditionFn: condResult.compiled._fn,
      expressionFn: exprResult.compiled._fn,
    });
  }

  return { success: true, compiled: { _branches: compiledBranches, fallback } };
}

export function compileGroup(
  expressions: ReadonlyMap<string, string>,
  functions?: FunctionTable,
): GroupCompileResult {
  const funcs = functions ?? defaultMathFunctions;
  const compiledMap = new Map<string, CompiledExpr>();
  const errors = new Map<string, string>();

  for (const [key, text] of expressions) {
    const result = compileExpression(text, funcs);
    if (!result.success) {
      errors.set(key, result.error);
      continue;
    }
    compiledMap.set(key, result.compiled);
  }

  if (errors.size > 0) return { success: false, errors };

  const depsMap = new Map<string, ReadonlySet<string>>();
  for (const [key, compiled] of compiledMap) {
    depsMap.set(key, compiled._deps);
  }

  const sortResult = kahnSort(depsMap);
  if ('cycle' in sortResult) {
    const cycleErrors = new Map<string, string>();
    for (const key of sortResult.cycle) cycleErrors.set(key, 'circular dependency');
    return { success: false, errors: cycleErrors };
  }

  return { success: true, group: { _order: sortResult.order, _compiled: compiledMap } };
}
