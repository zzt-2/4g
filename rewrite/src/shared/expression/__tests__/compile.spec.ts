import { describe, expect, it } from 'vitest';
import { compileExpression } from '../compile';

describe('compileExpression', () => {
  describe('C1-C9: compilation success cases', () => {
    it('C1: var1 * 0.1', () => {
      const r = compileExpression('var1 * 0.1');
      expect(r.success).toBe(true);
    });

    it('C2: (var1 + var2) * 299.792458 / 10000', () => {
      const r = compileExpression('(var1 + var2) * 299.792458 / 10000');
      expect(r.success).toBe(true);
    });

    it('C3: Chinese variable names', () => {
      const r = compileExpression('(距离 * 1000 - 帧数 * 帧距) / 采样时钟对应距离');
      expect(r.success).toBe(true);
    });

    it('C4: large number constant', () => {
      const r = compileExpression('13743895344000 / 299792458 * 速度');
      expect(r.success).toBe(true);
    });

    it('C5: comparison expression', () => {
      const r = compileExpression('速率 == 0');
      expect(r.success).toBe(true);
    });

    it('C6: logical combination', () => {
      const r = compileExpression('var1 > 0 && var2 < 100');
      expect(r.success).toBe(true);
    });

    it('C7: function call', () => {
      const r = compileExpression('pow(x, 2) + sqrt(y)');
      expect(r.success).toBe(true);
    });

    it('C8: unary minus on number + variable', () => {
      const r = compileExpression('-5 + 速度');
      expect(r.success).toBe(true);
    });

    it('C9: parenthesized unary minus', () => {
      const r = compileExpression('(-速度)');
      expect(r.success).toBe(true);
    });
  });

  describe('C13-C14: compilation errors', () => {
    it('C13: incomplete expression returns error with position', () => {
      const r = compileExpression('var1 +');
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toBeTruthy();
        expect(r.position).toBeDefined();
      }
    });

    it('C14: unknown function returns error', () => {
      const r = compileExpression('unknownFn(5)');
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toContain('unknown function');
      }
    });

    it('unknown function with custom function table', () => {
      const customFns = new Map([['myFunc', (x: number) => x * 2]]);
      const r = compileExpression('myFunc(5)', customFns);
      expect(r.success).toBe(true);
    });
  });

  describe('dependency extraction', () => {
    it('extracts variable dependencies from compiled expression', () => {
      const r = compileExpression('var1 + var2 * 0.1');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.compiled._deps.has('var1')).toBe(true);
      expect(r.compiled._deps.has('var2')).toBe(true);
      expect(r.compiled._deps.size).toBe(2);
    });

    it('extracts Chinese variable dependencies', () => {
      const r = compileExpression('速度 * 1000 / 帧距');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.compiled._deps.has('速度')).toBe(true);
      expect(r.compiled._deps.has('帧距')).toBe(true);
    });

    it('has no dependencies for constant expression', () => {
      const r = compileExpression('1 + 2');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.compiled._deps.size).toBe(0);
    });

    it('extracts dependencies from function arguments', () => {
      const r = compileExpression('pow(x, y)');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.compiled._deps.has('x')).toBe(true);
      expect(r.compiled._deps.has('y')).toBe(true);
    });
  });
});
