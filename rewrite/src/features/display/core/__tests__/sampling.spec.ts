import { describe, expect, it } from 'vitest';
import { extractValuesFromHex } from '../sampling';

describe('extractValuesFromHex', () => {
  it('returns empty for empty hex or invalid bitWidth', () => {
    expect(extractValuesFromHex('', 8)).toEqual([]);
    expect(extractValuesFromHex('1234', 0)).toEqual([]);
    expect(extractValuesFromHex('1234', 33)).toEqual([]);
    expect(extractValuesFromHex('1234', -1)).toEqual([]);
  });

  it('splits hex into values by bitWidth=8 (2 hex chars per value, signed)', () => {
    // bytes [0x12, 0x34, 0xAB] → "1234AB"。0xAB 高位为 1 → 有符号 -85（对接旧版语义）
    expect(extractValuesFromHex('1234AB', 8)).toEqual([0x12, 0x34, -85]);
    // 全小值（高位 0）保持无符号
    expect(extractValuesFromHex('1234', 8)).toEqual([0x12, 0x34]);
  });

  it('splits hex into values by bitWidth=12 (3 hex chars per value)', () => {
    // "7FF400" → 0x7FF=2047, 0x400=1024
    expect(extractValuesFromHex('7FF400', 12)).toEqual([0x7ff, 0x400]);
  });

  it('applies two-complement sign conversion for signed values', () => {
    // bitWidth=8: 0xFF 应解释为有符号 -1（signBit=0x80 命中）
    expect(extractValuesFromHex('FF', 8)).toEqual([-1]);
    // bitWidth=12: 0x800 应解释为 -2048（signBit=0x800 命中）
    expect(extractValuesFromHex('800', 12)).toEqual([-2048]);
    // bitWidth=4: 0xF → -1, 0x7 → 7
    expect(extractValuesFromHex('F7', 4)).toEqual([-1, 7]);
  });

  it('normalizes 0x prefix, spaces, and lowercase', () => {
    // 0xab 高位为 1 → 有符号 -85
    expect(extractValuesFromHex('0x1234ab', 8)).toEqual([0x12, 0x34, -85]);
    expect(extractValuesFromHex('12 34 AB', 8)).toEqual([0x12, 0x34, -85]);
    expect(extractValuesFromHex('0x12 34 ab', 8)).toEqual([0x12, 0x34, -85]);
  });

  it('ignores trailing partial chunk shorter than hexCharsPerValue', () => {
    // bitWidth=12 → 3 hex chars/value；"12345" 只能切出 1 个完整值(123)，剩余 "45" 丢弃
    expect(extractValuesFromHex('12345', 12)).toEqual([0x123]);
  });

  it('returns empty when normalized hex is empty (only prefix/spaces)', () => {
    expect(extractValuesFromHex('0x', 8)).toEqual([]);
    expect(extractValuesFromHex('   ', 8)).toEqual([]);
  });

  it('handles bitWidth=32 (full word, no sign flip for 0x80000000)', () => {
    // bitWidth=32: 8 hex chars/value；0x80000000 signBit=1<<31 命中 → 负数
    expect(extractValuesFromHex('80000000', 32)).toEqual([-2147483648]);
    expect(extractValuesFromHex('00000064', 32)).toEqual([100]);
  });

  it('round-trips with the constellation test frame default I/Q hex', () => {
    // 与 dongfanghong-frames.ts 星座帧 defaultValue 对齐：16 个 12-bit 有符号值
    const iHex = '00030F5A77637FF7635A730F000CF1A5989D80189DA59CF1';
    const iValues = extractValuesFromHex(iHex, 12);
    expect(iValues).toHaveLength(16);
    // 第一个值 0x000=0（正弦相位 0），中段出现负数（补码还原）
    expect(iValues[0]).toBe(0);
    expect(iValues.some((v) => v < 0)).toBe(true);
  });
});
