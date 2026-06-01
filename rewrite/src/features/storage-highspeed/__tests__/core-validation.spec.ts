import { describe, expect, it } from 'vitest'
import type { FrameHeaderRule } from '../core/types'
import { validateHexPattern, validateRule } from '../core/validation'

describe('validateHexPattern', () => {
  it('returns null for a valid hex pattern', () => {
    expect(validateHexPattern('AABBCC')).toBeNull()
  })

  it('returns error for an empty string', () => {
    expect(validateHexPattern('')).toBe('Hex pattern cannot be empty')
  })

  it('returns error for odd-length string', () => {
    expect(validateHexPattern('AAB')).toBe('Hex pattern must have even length')
  })

  it('returns error for invalid characters', () => {
    expect(validateHexPattern('GGHH')).toBe('Hex pattern contains invalid characters')
  })

  it('accepts lowercase hex', () => {
    expect(validateHexPattern('aabb')).toBeNull()
  })

  it('accepts mixed case hex', () => {
    expect(validateHexPattern('AaBb')).toBeNull()
  })

  it('accepts a single byte pattern', () => {
    expect(validateHexPattern('FF')).toBeNull()
  })
})

describe('validateRule', () => {
  function makeRule(overrides: Partial<FrameHeaderRule> = {}): FrameHeaderRule {
    return {
      id: 'rule-1',
      connectionId: 'conn-1',
      headerPatterns: ['AABBCC'],
      enabled: true,
      ...overrides,
    }
  }

  it('returns valid for a correct rule', () => {
    const result = validateRule(makeRule())
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns error when connectionId is missing', () => {
    const result = validateRule(makeRule({ connectionId: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Connection ID is required')
  })

  it('returns error when headerPatterns is empty', () => {
    const result = validateRule(makeRule({ headerPatterns: [] }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('At least one header pattern is required')
  })

  it('returns error when headerPatterns contains an invalid pattern', () => {
    const result = validateRule(makeRule({ headerPatterns: ['GG'] }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Invalid pattern'))).toBe(true)
  })

  it('collects multiple errors at once', () => {
    const result = validateRule(makeRule({ connectionId: '', headerPatterns: [] }))
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors).toContain('Connection ID is required')
    expect(result.errors).toContain('At least one header pattern is required')
  })

  it('reports each invalid pattern individually', () => {
    const result = validateRule(
      makeRule({ headerPatterns: ['GG', 'ZZ'] }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
  })
})
