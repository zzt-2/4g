import { describe, expect, it } from 'vitest';
import { compileConditional } from '../compile';
import { evaluateConditional } from '../evaluate';
import type { VariableMap } from '../types';

const branches5 = [
  { condition: '速率 == 0', expression: '7674.6869248' },
  { condition: '速率 == 1', expression: '3837.3434624' },
  { condition: '速率 == 2', expression: '1918.6717312' },
  { condition: '速率 == 3', expression: '959.3358656' },
  { condition: '速率 == 4', expression: '479.6679328' },
];

describe('conditional expressions', () => {
  describe('C10-C12: compilation', () => {
    it('C10: 5-branch conditional compiles', () => {
      const r = compileConditional(branches5, 0);
      expect(r.success).toBe(true);
    });

    it('C11: condition "true" compiles', () => {
      const r = compileConditional([{ condition: 'true', expression: '42' }]);
      expect(r.success).toBe(true);
    });

    it('C12: string comparison condition compiles', () => {
      const r = compileConditional([{ condition: "模式 == 'RS编码'", expression: '1' }]);
      expect(r.success).toBe(true);
    });
  });

  describe('E6-E8: evaluation', () => {
    it('E6: matches first branch', () => {
      const compiled = compileConditional(branches5, 0);
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['速率', 0]]);
      const r = evaluateConditional(compiled.compiled, vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(7674.6869248);
      expect(r.matchedIndex).toBe(0);
    });

    it('E7: matches third branch', () => {
      const compiled = compileConditional(branches5, 0);
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['速率', 2]]);
      const r = evaluateConditional(compiled.compiled, vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(1918.6717312);
      expect(r.matchedIndex).toBe(2);
    });

    it('E8: no match returns fallback', () => {
      const compiled = compileConditional(branches5, 0);
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['速率', 99]]);
      const r = evaluateConditional(compiled.compiled, vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(0);
      expect(r.matchedIndex).toBe(-1);
    });

    it('uses custom fallback value', () => {
      const compiled = compileConditional(branches5, -1);
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['速率', 99]]);
      const r = evaluateConditional(compiled.compiled, vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(-1);
    });

    it('evaluates string comparison condition', () => {
      const compiled = compileConditional([
        { condition: "模式 == 'RS编码'", expression: '1' },
        { condition: 'true', expression: '0' },
      ], 0);
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['模式', 'RS编码']]);
      const r = evaluateConditional(compiled.compiled, vars);
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(1);
      expect(r.matchedIndex).toBe(0);
    });

    it('short-circuits on first matching condition', () => {
      const compiled = compileConditional([
        { condition: 'true', expression: '100' },
        { condition: 'true', expression: '200' },
      ], 0);
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const r = evaluateConditional(compiled.compiled, new Map());
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.value).toBe(100);
      expect(r.matchedIndex).toBe(0);
    });
  });

  describe('compilation errors', () => {
    it('reports error for invalid condition', () => {
      const r = compileConditional([{ condition: 'x +', expression: '1' }]);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toContain('condition');
    });

    it('reports error for invalid expression', () => {
      const r = compileConditional([{ condition: 'true', expression: 'x +' }]);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toContain('expression');
    });
  });
});
