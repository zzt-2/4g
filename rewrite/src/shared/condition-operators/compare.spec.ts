import { describe, expect, it } from 'vitest';
import { compareValues } from './compare';

describe('compareValues', () => {
  describe('eq', () => {
    it('matches equal numbers', () => {
      expect(compareValues(10, 10, 'eq')).toBe(true);
    });

    it('rejects unequal numbers', () => {
      expect(compareValues(10, 20, 'eq')).toBe(false);
    });

    it('matches equal strings', () => {
      expect(compareValues('abc', 'abc', 'eq')).toBe(true);
    });

    it('rejects unequal strings', () => {
      expect(compareValues('abc', 'def', 'eq')).toBe(false);
    });

    it('compares hex string to numeric threshold', () => {
      expect(compareValues('0xFF', 255, 'eq')).toBe(true);
    });

    it('compares uppercase hex', () => {
      expect(compareValues('0X1A', 26, 'eq')).toBe(true);
    });
  });

  describe('neq', () => {
    it('matches different numbers', () => {
      expect(compareValues(1, 2, 'neq')).toBe(true);
    });

    it('rejects equal numbers', () => {
      expect(compareValues(1, 1, 'neq')).toBe(false);
    });

    it('matches different strings', () => {
      expect(compareValues('a', 'b', 'neq')).toBe(true);
    });
  });

  describe('gt', () => {
    it('returns true when actual > threshold', () => {
      expect(compareValues(10, 5, 'gt')).toBe(true);
    });

    it('returns false when actual <= threshold', () => {
      expect(compareValues(5, 10, 'gt')).toBe(false);
      expect(compareValues(5, 5, 'gt')).toBe(false);
    });

    it('works with strings', () => {
      expect(compareValues('b', 'a', 'gt')).toBe(true);
    });
  });

  describe('lt', () => {
    it('returns true when actual < threshold', () => {
      expect(compareValues(5, 10, 'lt')).toBe(true);
    });

    it('returns false when actual >= threshold', () => {
      expect(compareValues(10, 5, 'lt')).toBe(false);
      expect(compareValues(5, 5, 'lt')).toBe(false);
    });
  });

  describe('gte', () => {
    it('returns true when actual >= threshold', () => {
      expect(compareValues(10, 10, 'gte')).toBe(true);
      expect(compareValues(11, 10, 'gte')).toBe(true);
    });

    it('returns false when actual < threshold', () => {
      expect(compareValues(9, 10, 'gte')).toBe(false);
    });
  });

  describe('lte', () => {
    it('returns true when actual <= threshold', () => {
      expect(compareValues(10, 10, 'lte')).toBe(true);
      expect(compareValues(9, 10, 'lte')).toBe(true);
    });

    it('returns false when actual > threshold', () => {
      expect(compareValues(11, 10, 'lte')).toBe(false);
    });
  });

  describe('contains', () => {
    it('returns true when string contains substring', () => {
      expect(compareValues('hello world', 'world', 'contains')).toBe(true);
    });

    it('returns false when string does not contain substring', () => {
      expect(compareValues('hello', 'world', 'contains')).toBe(false);
    });

    it('returns true for exact match', () => {
      expect(compareValues('abc', 'abc', 'contains')).toBe(true);
    });

    it('handles numeric values as strings', () => {
      expect(compareValues(12345, 34, 'contains')).toBe(true);
      expect(compareValues(12345, 67, 'contains')).toBe(false);
    });

    it('returns false when actual is null', () => {
      expect(compareValues(null, 'test', 'contains')).toBe(false);
    });

    it('returns false when threshold is null', () => {
      expect(compareValues('test', null, 'contains')).toBe(false);
    });
  });

  describe('change', () => {
    it('returns true when values differ', () => {
      expect(compareValues(1, 2, 'change')).toBe(true);
    });

    it('returns false when values are equal', () => {
      expect(compareValues(1, 1, 'change')).toBe(false);
    });

    it('returns false when actual is null', () => {
      expect(compareValues(null, 1, 'change')).toBe(false);
    });

    it('returns false when threshold is null', () => {
      expect(compareValues(1, null, 'change')).toBe(false);
    });
  });

  describe('any', () => {
    it('returns true for any non-null value', () => {
      expect(compareValues(0, null, 'any')).toBe(true);
      expect(compareValues('', null, 'any')).toBe(true);
      expect(compareValues(false, null, 'any')).toBe(true);
    });

    it('returns false for null', () => {
      expect(compareValues(null, null, 'any')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(compareValues(undefined, null, 'any')).toBe(false);
    });
  });

  describe('null/undefined handling', () => {
    it('returns false for eq when actual is null', () => {
      expect(compareValues(null, 10, 'eq')).toBe(false);
    });

    it('returns false for eq when threshold is undefined', () => {
      expect(compareValues(10, undefined, 'eq')).toBe(false);
    });

    it('returns false for gt when actual is null', () => {
      expect(compareValues(null, 10, 'gt')).toBe(false);
    });
  });

  describe('type coercion', () => {
    it('compares number-string mixed values', () => {
      expect(compareValues('10', 10, 'eq')).toBe(true);
    });

    it('compares numeric string thresholds', () => {
      expect(compareValues(10, '10', 'eq')).toBe(true);
    });

    it('falls back to string comparison for non-numeric strings', () => {
      expect(compareValues('abc', 'abc', 'eq')).toBe(true);
      expect(compareValues('abc', 'def', 'lt')).toBe(true);
    });

    it('handles bigint values', () => {
      expect(compareValues(BigInt(10), 10, 'eq')).toBe(true);
    });

    it('handles boolean values', () => {
      expect(compareValues(true, 1, 'eq')).toBe(true);
      expect(compareValues(false, 0, 'eq')).toBe(true);
    });

    it('returns false for invalid hex strings', () => {
      expect(compareValues('0xGG', 1, 'eq')).toBe(false);
    });
  });
});
