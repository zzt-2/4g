import { describe, expect, it } from 'vitest';
import { compileExpression } from '../compile';
import { evaluate } from '../evaluate';
import type { VariableMap } from '../types';

function evalExpr(text: string, vars: VariableMap) {
  const compiled = compileExpression(text);
  if (!compiled.success) throw new Error(compiled.error);
  return evaluate(compiled.compiled, vars);
}

describe('evaluate', () => {
  describe('E1-E5: normal evaluation', () => {
    it('E1: arithmetic with constants and variables', () => {
      const vars = new Map([['var1', 2500], ['var2', 100]]);
      const r = evalExpr('(var1 + var2) * 0.299792458 / 1000000', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBeCloseTo(0.000778, 5);
    });

    it('E2: Chinese variable arithmetic', () => {
      const vars = new Map([['速度', 5], ['帧距', 2]]);
      const r = evalExpr('速度 * 1000 / 帧距', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(2500);
    });

    it('E3: abs function', () => {
      const vars = new Map();
      const r = evalExpr('abs(-10)', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(10);
    });

    it('E4: equality comparison returns true', () => {
      const vars = new Map([['速率', 0]]);
      const r = evalExpr('速率 == 0', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(true);
    });

    it('E5: logical combination returns true', () => {
      const vars = new Map([['速率', 50]]);
      const r = evalExpr('速率 > 0 && 速率 < 100', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(true);
    });
  });

  describe('E11-E13: error paths', () => {
    it('E11: division by zero', () => {
      const vars = new Map([['a', 5], ['b', 0]]);
      const r = evalExpr('a / b', vars);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toContain('division by zero');
      }
    });

    it('E12: undefined variable', () => {
      const vars = new Map();
      const r = evalExpr('x + 1', vars);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toContain('undefined variable');
      }
    });

    it('E13: null variable value', () => {
      const vars = new Map<string, number | string | boolean>();
      (vars as Map<string, number | string | boolean | null>).set('x', null);
      const r = evalExpr('x + 1', vars as VariableMap);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toContain('null');
      }
    });
  });

  describe('T1-T5: type semantics', () => {
    it('T1: strict equality — 5 == "5" is false', () => {
      const vars = new Map();
      const r = evalExpr("5 == '5'", vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(false);
    });

    it('T2: string equality', () => {
      const vars = new Map([['模式', 'RS编码']]);
      const r = evalExpr("模式 == 'RS编码'", vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(true);
    });

    it('T3: boolean AND', () => {
      const r = evalExpr('true && false', new Map());
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(false);
    });

    it('T4: abs as variable (no parens → variable lookup)', () => {
      const vars = new Map([['abs', 5]]);
      const r = evalExpr('abs', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(5);
    });

    it('T5: abs(x) → function call, not variable', () => {
      const vars = new Map([['abs', 5], ['x', -3]]);
      const r = evalExpr('abs(x)', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(3);
    });
  });

  describe('additional arithmetic', () => {
    it('handles modulo', () => {
      const vars = new Map([['a', 10], ['b', 3]]);
      const r = evalExpr('a % b', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(1);
    });

    it('handles nested function calls', () => {
      const vars = new Map([['x', 9]]);
      const r = evalExpr('pow(sqrt(x), 2)', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(9);
    });

    it('handles complex real expression', () => {
      const vars = new Map([['距离', 100], ['帧数', 10], ['帧距', 2], ['采样时钟对应距离', 0.5]]);
      const r = evalExpr('(距离 * 1000 - 帧数 * 帧距) / 采样时钟对应距离', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe((100 * 1000 - 10 * 2) / 0.5);
    });
  });

  describe('B1-B6: bigint semantics', () => {
    it('B1: bigint + bigint returns bigint', () => {
      const vars = new Map<string, number | bigint | string | boolean>([
        ['totalBits', 9_007_199_254_740_993n],
        ['extra', 7n],
      ]);
      const r = evalExpr('totalBits + extra', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(9_007_199_254_741_000n);
      expect(typeof r.value).toBe('bigint');
    });

    it('B2: bigint + integer number promotes number to bigint', () => {
      const vars = new Map<string, number | bigint | string | boolean>([
        ['totalBits', 9_007_199_254_740_993n],
      ]);
      const r = evalExpr('totalBits + 1', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(9_007_199_254_740_994n);
      expect(typeof r.value).toBe('bigint');
    });

    it('B3: bigint + non-integer number returns error', () => {
      const vars = new Map<string, number | bigint | string | boolean>([
        ['totalBits', 9_007_199_254_740_993n],
      ]);
      const r = evalExpr('totalBits + 0.5', vars);
      expect(r.success).toBe(false);
      if (!r.success) return;
      expect(r.error).toContain('non-integer');
    });

    it('B4: bigint subtraction', () => {
      const vars = new Map<string, number | bigint | string | boolean>([
        ['a', 18_446_744_073_709_551_615n],
        ['b', 1n],
      ]);
      const r = evalExpr('a - b', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(18_446_744_073_709_551_614n);
    });

    it('B5: bigint comparison', () => {
      const vars = new Map<string, number | bigint | string | boolean>([
        ['totalBits', 9_007_199_254_740_993n],
      ]);
      const r = evalExpr('totalBits > 9007199254740992', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(true);
    });

    it('B6: bigint equality with integer number', () => {
      const vars = new Map<string, number | bigint | string | boolean>([
        ['totalBits', 100n],
      ]);
      const r = evalExpr('totalBits == 100', vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(true);
    });
  });
});
