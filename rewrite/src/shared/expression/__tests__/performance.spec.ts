import { describe, expect, it } from 'vitest';
import { compileExpression, compileGroup, evaluate, evaluateGroup } from '../index';

describe('performance benchmarks', () => {
  it('P1: single expression evaluation < 1μs', () => {
    const compiled = compileExpression('(var1 + var2) * 0.299792458 / 1000000');
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;
    const vars = new Map([['var1', 2500], ['var2', 100]]);

    // Warmup
    for (let i = 0; i < 10000; i++) evaluate(compiled.compiled, vars);

    const iterations = 100000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) evaluate(compiled.compiled, vars);
    const elapsed = performance.now() - start;
    const perCallNs = (elapsed / iterations) * 1e6;

    expect(perCallNs).toBeLessThan(1000); // < 1μs = 1000ns
  });

  it('P2: 50 expression batch evaluation < 20μs', () => {
    const exprMap = new Map<string, string>();
    for (let i = 0; i < 50; i++) {
      if (i === 0) exprMap.set('e0', 'x * 0.1');
      else exprMap.set(`e${i}`, `e${i - 1} + y * ${i}`);
    }
    const compiled = compileGroup(exprMap);
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    const vars = new Map([['x', 100], ['y', 1]]);

    // Warmup
    for (let i = 0; i < 1000; i++) evaluateGroup(compiled.group, vars);

    const iterations = 10000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) evaluateGroup(compiled.group, vars);
    const elapsed = performance.now() - start;
    const perCallNs = (elapsed / iterations) * 1e6;

    expect(perCallNs).toBeLessThan(20000); // < 20μs = 20000ns
  });
});
