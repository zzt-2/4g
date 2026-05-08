import type { FunctionTable } from './types';

export const defaultMathFunctions: FunctionTable = new Map([
  ['abs', Math.abs],
  ['floor', Math.floor],
  ['ceil', Math.ceil],
  ['round', Math.round],
  ['min', Math.min],
  ['max', Math.max],
  ['sqrt', Math.sqrt],
  ['pow', Math.pow],
  ['sin', Math.sin],
  ['cos', Math.cos],
  ['tan', Math.tan],
  ['log', Math.log],
  ['exp', Math.exp],
]);
