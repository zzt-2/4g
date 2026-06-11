import { describe, expect, it } from 'vitest';
import { kahnSort } from '../dependency';

describe('shared expression: kahnSort', () => {
  it('returns correct topological order for chain A→B→C', () => {
    // A depends on B, B depends on C → order: C, B, A
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set()],
    ]);
    const result = kahnSort(deps);
    expect('order' in result).toBe(true);
    if ('order' in result) {
      expect(result.order).toEqual(['C', 'B', 'A']);
    }
  });

  it('returns correct order for diamond dependency', () => {
    // D depends on B and C, B depends on A, C depends on A
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set()],
      ['B', new Set(['A'])],
      ['C', new Set(['A'])],
      ['D', new Set(['B', 'C'])],
    ]);
    const result = kahnSort(deps);
    expect('order' in result).toBe(true);
    if ('order' in result) {
      expect(result.order.indexOf('A')).toBeLessThan(result.order.indexOf('B'));
      expect(result.order.indexOf('A')).toBeLessThan(result.order.indexOf('C'));
      expect(result.order.indexOf('B')).toBeLessThan(result.order.indexOf('D'));
      expect(result.order.indexOf('C')).toBeLessThan(result.order.indexOf('D'));
    }
  });

  it('detects cycle between two nodes', () => {
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['A'])],
    ]);
    const result = kahnSort(deps);
    expect('cycle' in result).toBe(true);
    if ('cycle' in result) {
      expect(result.cycle.sort()).toEqual(['A', 'B']);
    }
  });

  it('detects cycle in three-node loop', () => {
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set(['C'])],
      ['B', new Set(['A'])],
      ['C', new Set(['B'])],
    ]);
    const result = kahnSort(deps);
    expect('cycle' in result).toBe(true);
    if ('cycle' in result) {
      expect(result.cycle.sort()).toEqual(['A', 'B', 'C']);
    }
  });

  it('returns order for single node with no deps', () => {
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set()],
    ]);
    const result = kahnSort(deps);
    expect('order' in result).toBe(true);
    if ('order' in result) {
      expect(result.order).toEqual(['A']);
    }
  });

  it('handles empty input', () => {
    const deps = new Map<string, ReadonlySet<string>>();
    const result = kahnSort(deps);
    expect('order' in result).toBe(true);
    if ('order' in result) {
      expect(result.order).toEqual([]);
    }
  });

  it('excludes self-reference from dependencies', () => {
    // A references itself — should not be treated as cycle
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set(['A'])],
      ['B', new Set()],
    ]);
    const result = kahnSort(deps);
    expect('order' in result).toBe(true);
    if ('order' in result) {
      expect(result.order.sort()).toEqual(['A', 'B']);
    }
  });

  it('handles partial cycle with non-cycle nodes', () => {
    // A→B→A cycle, C independent
    const deps = new Map<string, ReadonlySet<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['A'])],
      ['C', new Set()],
    ]);
    const result = kahnSort(deps);
    expect('cycle' in result).toBe(true);
    if ('cycle' in result) {
      expect(result.cycle.sort()).toEqual(['A', 'B']);
    }
  });
});
