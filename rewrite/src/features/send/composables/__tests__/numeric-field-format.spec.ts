import { describe, it, expect } from 'vitest';
import {
  isHexCapableField,
  valueToDisplayString,
  formatCounterpart,
  parseFieldInput,
} from '../numeric-field-format';
import type { FrameFieldDefinition } from '@/features/frame';

function field(dataType: string): FrameFieldDefinition {
  return {
    id: 'f', name: 'f', dataType,
    length: 1, inputType: 'input', configurable: true,
    options: [],
  } as unknown as FrameFieldDefinition;
}

describe('numeric-field-format', () => {
  describe('isHexCapableField', () => {
    it('true for integer input fields', () => {
      expect(isHexCapableField(field('uint8'))).toBe(true);
      expect(isHexCapableField(field('int32'))).toBe(true);
      expect(isHexCapableField(field('uint64'))).toBe(true);
    });
    it('false for float/double/bytes/non-input', () => {
      expect(isHexCapableField(field('float'))).toBe(false);
      expect(isHexCapableField(field('double'))).toBe(false);
    });
  });

  describe('valueToDisplayString', () => {
    it('dec mode shows decimal', () => {
      expect(valueToDisplayString(255, field('uint8'), false)).toBe('255');
    });
    it('hex mode shows 0x upper for uint32', () => {
      // 0x1ACFFC1D = 449838109
      expect(valueToDisplayString(449838109, field('uint32'), true)).toBe('0x1ACFFC1D');
    });
    it('uint64 beyond safe int shows hex via bigint', () => {
      expect(valueToDisplayString('18446744073709551615', field('uint64'), true)).toBe('0xFFFFFFFFFFFFFFFF');
    });
    it('string non-numeric returns as-is', () => {
      expect(valueToDisplayString('hello', field('uint8'), false)).toBe('hello');
    });
    it('undefined returns empty', () => {
      expect(valueToDisplayString(undefined, field('uint8'), false)).toBe('');
    });
    it('uint32 large value Dec shows plain digit string (no scientific notation)', () => {
      expect(valueToDisplayString(4000000000, field('uint32'), false)).toBe('4000000000');
    });
    it('uint64 beyond safe int Dec shows plain digit string via bigint', () => {
      expect(valueToDisplayString('18446744073709551615', field('uint64'), false)).toBe('18446744073709551615');
    });
    it('super-large value Dec never uses scientific notation (1e21)', () => {
      // Number(1e21).toString() yields '1e+21'; must be plain digit string
      expect(valueToDisplayString(1e21, field('uint64'), false)).toBe('1000000000000000000000');
    });
  });

  describe('formatCounterpart', () => {
    it('dec value -> hex counterpart', () => {
      expect(formatCounterpart(255, field('uint8'), false)).toBe('Hex=0xFF');
    });
    it('hex value -> dec counterpart', () => {
      expect(formatCounterpart(255, field('uint8'), true)).toBe('Dec=255');
    });
    it('uint64 dec -> hex counterpart', () => {
      expect(formatCounterpart('18446744073709551615', field('uint64'), false)).toBe('Hex=0xFFFFFFFFFFFFFFFF');
    });
    it('returns empty for non-numeric', () => {
      expect(formatCounterpart('hello', field('uint8'), false)).toBe('');
    });
  });

  describe('parseFieldInput', () => {
    it('dec input parses to number', () => {
      expect(parseFieldInput('255', false, field('uint8'))).toEqual({ ok: true, value: 255 });
    });
    it('hex input "1acffc1d" in hex mode -> number', () => {
      // 0x1ACFFC1D = 449838109
      expect(parseFieldInput('1acffc1d', true, field('uint32'))).toEqual({ ok: true, value: 449838109 });
    });
    it('0x prefix parsed in dec mode too', () => {
      expect(parseFieldInput('0xFF', false, field('uint8'))).toEqual({ ok: true, value: 255 });
    });
    it('uint64 beyond safe int -> bigint as string', () => {
      const r = parseFieldInput('FFFFFFFFFFFFFFFF', true, field('uint64'));
      expect(r.ok).toBe(true);
      expect(r.ok && r.value).toBe('18446744073709551615');
    });
    it('invalid hex returns ok:false', () => {
      expect(parseFieldInput('xyz', true, field('uint8'))).toEqual({ ok: false, error: '无法解析为数值' });
    });
    it('out of range returns ok:false', () => {
      expect(parseFieldInput('300', false, field('uint8')).ok).toBe(false);
    });
    it('empty input -> ok:true, value empty string', () => {
      expect(parseFieldInput('', false, field('uint8'))).toEqual({ ok: true, value: '' });
    });
  });
});
