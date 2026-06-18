import { describe, it, expect } from 'vitest';
import { getPathValue, setPathValue } from '../core/path-resolver';

describe('path-resolver', () => {
  it('gets a simple property', () => {
    expect(getPathValue({ a: { b: 1 } }, 'a.b')).toBe(1);
  });

  it('gets array element by index', () => {
    expect(getPathValue({ arr: [{ x: 5 }] }, 'arr[0].x')).toBe(5);
  });

  it('returns undefined for missing path', () => {
    expect(getPathValue({ a: 1 }, 'b.c')).toBeUndefined();
  });

  it('sets a simple property (immutably)', () => {
    const obj = { a: { b: 1 } };
    const next = setPathValue(obj, 'a.b', 99) as typeof obj;
    expect(next.a.b).toBe(99);
    expect(obj.a.b).toBe(1); // 原对象不变
  });

  it('sets array element by index', () => {
    const obj = { arr: [{ x: 1 }, { x: 2 }] };
    const next = setPathValue(obj, 'arr[1].x', 99) as typeof obj;
    expect(next.arr[1].x).toBe(99);
    expect(obj.arr[1].x).toBe(2); // 原对象不变
  });

  it('parses path segments (点 + 方括号)', () => {
    expect(getPathValue({
      step1: { send: { userFieldValues: { power: 50 } } },
    }, 'step1.send.userFieldValues.power')).toBe(50);
  });
});
