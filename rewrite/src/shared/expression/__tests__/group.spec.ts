import { describe, expect, it } from 'vitest';
import { compileGroup } from '../compile';
import { evaluateGroup } from '../evaluate';
import type { VariableMap } from '../types';

describe('group expressions', () => {
  describe('C15: cycle detection', () => {
    it('detects direct circular dependency A → B → A', () => {
      const r = compileGroup(new Map([
        ['a', 'b + 1'],
        ['b', 'a * 2'],
      ]));
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.errors.size).toBeGreaterThan(0);
      }
    });

    it('detects three-way cycle', () => {
      const r = compileGroup(new Map([
        ['a', 'b + 1'],
        ['b', 'c * 2'],
        ['c', 'a - 3'],
      ]));
      expect(r.success).toBe(false);
    });

    it('succeeds with no dependencies', () => {
      const r = compileGroup(new Map([
        ['a', '1 + 2'],
        ['b', '3 + 4'],
      ]));
      expect(r.success).toBe(true);
    });

    it('succeeds with valid dependency chain', () => {
      const r = compileGroup(new Map([
        ['a', 'x + 1'],
        ['b', 'a * 2'],
        ['c', 'b + y'],
      ]));
      expect(r.success).toBe(true);
    });
  });

  describe('E9: dependency chain evaluation', () => {
    it('later expressions reference earlier results', () => {
      const compiled = compileGroup(new Map([
        ['temp', 'raw * 0.1'],
        ['display', 'temp + offset'],
      ]));
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['raw', 2500], ['offset', 10]]);
      const r = evaluateGroup(compiled.group, vars);
      expect(r.errors.size).toBe(0);
      expect(r.values.get('temp')).toBe(250);
      expect(r.values.get('display')).toBe(260);
    });
  });

  describe('E10: partial failure', () => {
    it('failing expression does not block independent expressions', () => {
      const compiled = compileGroup(new Map([
        ['a', 'x / 0'],
        ['b', 'a + 1'],
        ['c', 'y + 2'],
      ]));
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map([['x', 5], ['y', 10]]);
      const r = evaluateGroup(compiled.group, vars);
      expect(r.errors.has('a')).toBe(true);
      expect(r.errors.has('b')).toBe(true);
      expect(r.values.has('c')).toBe(true);
      expect(r.values.get('c')).toBe(12);
    });
  });

  describe('topological ordering', () => {
    it('respects dependency order in evaluation', () => {
      const compiled = compileGroup(new Map([
        ['pressure', 'raw + offset'],
        ['temp', 'raw * 0.1'],
        ['altitude', '44330 * (1 - pow(pressure / 1013.25, 0.19))'],
      ]));
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      // pressure must come before altitude in the order
      const order = compiled.group._order;
      const pressureIdx = order.indexOf('pressure');
      const altitudeIdx = order.indexOf('altitude');
      expect(pressureIdx).toBeLessThan(altitudeIdx);

      const vars: VariableMap = new Map([['raw', 100], ['offset', 10]]);
      const r = evaluateGroup(compiled.group, vars);
      expect(r.errors.size).toBe(0);
      expect(r.values.get('pressure')).toBe(110);
      expect(r.values.get('temp')).toBe(10);
    });
  });

  describe('compilation errors', () => {
    it('reports error for invalid expression in group', () => {
      const r = compileGroup(new Map([
        ['good', '1 + 2'],
        ['bad', 'x +'],
      ]));
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.errors.has('bad')).toBe(true);
      }
    });
  });

  describe('self-dependency', () => {
    it('expression referencing itself causes runtime error', () => {
      const compiled = compileGroup(new Map([
        ['x', 'x + 1'],
      ]));
      // Compilation succeeds (self-dep is not a cycle in Kahn)
      expect(compiled.success).toBe(true);
      if (!compiled.success) return;

      const vars: VariableMap = new Map();
      const r = evaluateGroup(compiled.group, vars);
      // Runtime error: undefined variable 'x'
      expect(r.errors.has('x')).toBe(true);
    });
  });
});
