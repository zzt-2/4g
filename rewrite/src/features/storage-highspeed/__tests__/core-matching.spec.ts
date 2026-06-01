import { describe, expect, it } from 'vitest'
import { compilePattern, matchesPrefix, matchFrameHeader } from '../core/matching'

describe('compilePattern', () => {
  it('converts a multi-byte hex string to a byte array', () => {
    expect(compilePattern('AABBCC')).toEqual([0xAA, 0xBB, 0xCC])
  })

  it('returns an empty array for an empty string', () => {
    expect(compilePattern('')).toEqual([])
  })

  it('converts a single byte hex string', () => {
    expect(compilePattern('FF')).toEqual([255])
  })

  it('handles lowercase hex input', () => {
    expect(compilePattern('aabbcc')).toEqual([0xAA, 0xBB, 0xCC])
  })

  it('handles mixed-case hex input', () => {
    expect(compilePattern('AaBbCc')).toEqual([0xAA, 0xBB, 0xCC])
  })

  it('converts zero bytes', () => {
    expect(compilePattern('0000')).toEqual([0, 0])
  })
})

describe('matchesPrefix', () => {
  it('returns true when data starts with the pattern (exact match)', () => {
    expect(matchesPrefix([0xAA, 0xBB], [0xAA, 0xBB])).toBe(true)
  })

  it('returns true when data starts with the pattern (data longer)', () => {
    expect(matchesPrefix([0xAA, 0xBB, 0xCC, 0xDD], [0xAA, 0xBB])).toBe(true)
  })

  it('returns false when data does not start with the pattern', () => {
    expect(matchesPrefix([0xAA, 0xBB], [0xCC, 0xDD])).toBe(false)
  })

  it('returns false when pattern is empty', () => {
    expect(matchesPrefix([0xAA, 0xBB], [])).toBe(false)
  })

  it('returns false when data is shorter than pattern', () => {
    expect(matchesPrefix([0xAA], [0xAA, 0xBB])).toBe(false)
  })

  it('returns false when both data and pattern are empty', () => {
    expect(matchesPrefix([], [])).toBe(false)
  })

  it('returns true for a single-byte matching prefix', () => {
    expect(matchesPrefix([0xFF], [0xFF])).toBe(true)
  })
})

describe('matchFrameHeader', () => {
  const patterns = [[0xAA, 0xBB], [0xCC, 0xDD]] as const

  it('returns true when data matches the first pattern', () => {
    expect(matchFrameHeader([0xAA, 0xBB, 0x01, 0x02], patterns)).toBe(true)
  })

  it('returns true when data matches the second pattern', () => {
    expect(matchFrameHeader([0xCC, 0xDD, 0x03], patterns)).toBe(true)
  })

  it('returns false when data matches no pattern', () => {
    expect(matchFrameHeader([0x11, 0x22], patterns)).toBe(false)
  })

  it('returns false when patterns array is empty', () => {
    expect(matchFrameHeader([0xAA, 0xBB], [])).toBe(false)
  })

  it('returns true for exact-length match', () => {
    expect(matchFrameHeader([0xAA, 0xBB], patterns)).toBe(true)
  })

  it('returns false when data is shorter than all patterns', () => {
    expect(matchFrameHeader([0xAA], patterns)).toBe(false)
  })
})
