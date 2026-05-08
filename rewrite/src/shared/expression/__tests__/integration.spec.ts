import { describe, expect, it } from 'vitest';
import { compileExpression, compileConditional, compileGroup } from '../compile';
import { evaluate, evaluateConditional, evaluateGroup } from '../evaluate';
import { defaultMathFunctions } from '../functions';
import type { VariableMap } from '../types';

describe('integration: real expression samples', () => {
  it('frame field expression: var1 * 0.1', () => {
    const c = compileExpression('var1 * 0.1');
    expect(c.success).toBe(true);
    if (!c.success) return;
    const r = evaluate(c.compiled, new Map([['var1', 2500]]));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.value).toBe(250);
  });

  it('distance calculation with large constants', () => {
    const expr = '(var1 + var2) * 0.299792458 / 1000000';
    const c = compileExpression(expr);
    expect(c.success).toBe(true);
    if (!c.success) return;
    const r = evaluate(c.compiled, new Map([['var1', 2500], ['var2', 100]]));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.value).toBeCloseTo(0.000778, 5);
  });

  it('Chinese variable expression', () => {
    const expr = '(距离 * 1000 - 帧数 * 帧距) / 采样时钟对应距离';
    const c = compileExpression(expr);
    expect(c.success).toBe(true);
    if (!c.success) return;
    const vars: VariableMap = new Map([
      ['距离', 100], ['帧数', 10], ['帧距', 2], ['采样时钟对应距离', 0.5],
    ]);
    const r = evaluate(c.compiled, vars);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.value).toBe(199960);
  });

  it('large constant expression', () => {
    const expr = '13743895344000 / 299792458 * 速度';
    const c = compileExpression(expr);
    expect(c.success).toBe(true);
    if (!c.success) return;
    const r = evaluate(c.compiled, new Map([['速度', 1]]));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.value).toBeCloseTo(13743895344000 / 299792458, 5);
  });

  it('conditional multi-branch from real config', () => {
    const branches = [
      { condition: '速率 == 0', expression: '7674.6869248' },
      { condition: '速率 == 1', expression: '3837.3434624' },
      { condition: '速率 == 2', expression: '1918.6717312' },
    ];
    const c = compileConditional(branches, 0);
    expect(c.success).toBe(true);
    if (!c.success) return;

    for (let i = 0; i < 3; i++) {
      const r = evaluateConditional(c.compiled, new Map([['速率', i]]));
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.matchedIndex).toBe(i);
      expect(r.value).toBe(Number(branches[i].expression));
    }
  });

  it('group evaluation with dependency chain', () => {
    const group = compileGroup(new Map([
      ['temp', 'raw * 0.1'],
      ['pressure', 'raw + offset'],
      ['altitude', '44330 * (1 - pow(pressure / 1013.25, 0.19))'],
    ]));
    expect(group.success).toBe(true);
    if (!group.success) return;

    const r = evaluateGroup(group.group, new Map([['raw', 500], ['offset', 10]]));
    expect(r.errors.size).toBe(0);
    expect(r.values.get('temp')).toBe(50);
    expect(r.values.get('pressure')).toBe(510);
    const alt = r.values.get('altitude') as number;
    expect(alt).toBeGreaterThan(0);
  });

  it('string comparison condition', () => {
    const c = compileConditional([
      { condition: "模式 == 'RS编码'", expression: '1' },
      { condition: "模式 == '卷积编码'", expression: '2' },
      { condition: 'true', expression: '0' },
    ], -1);
    expect(c.success).toBe(true);
    if (!c.success) return;

    const r = evaluateConditional(c.compiled, new Map([['模式', 'RS编码']]));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.value).toBe(1);
    expect(r.matchedIndex).toBe(0);
  });

  it('defaultMathFunctions contains all required functions', () => {
    const required = ['abs', 'floor', 'ceil', 'round', 'min', 'max', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'log', 'exp'];
    for (const name of required) {
      expect(defaultMathFunctions.has(name)).toBe(true);
    }
  });
});

describe('integration: public API surface', () => {
  it('3-5 lines integration: compile once, evaluate per frame', () => {
    const compiled = compileExpression('raw * 0.1');
    if (!compiled.success) throw new Error(compiled.error);

    for (let i = 0; i < 100; i++) {
      const result = evaluate(compiled.compiled, new Map([['raw', i * 10]]));
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toBeCloseTo(i, 5);
    }
  });

  it('conditional replaces structured condition matching', () => {
    const compiled = compileConditional([
      { condition: '速率 == 0', expression: '7674.69' },
      { condition: '速率 == 1', expression: '3837.34' },
    ], 0);
    expect(compiled.success).toBe(true);
  });

  it('group handles send buildFrame scenario', () => {
    const compiled = compileGroup(new Map([
      ['field1', 'val1 * 0.01'],
      ['field2', 'val2 + field1'],
    ]));
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    const r = evaluateGroup(compiled.group, new Map([['val1', 100], ['val2', 50]]));
    expect(r.errors.size).toBe(0);
    expect(r.values.get('field1')).toBe(1);
    expect(r.values.get('field2')).toBe(51);
  });
});
