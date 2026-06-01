import type { FrameHeaderRule } from './types'

export function validateHexPattern(pattern: string): string | null {
  if (!pattern || pattern.length === 0) return 'Hex pattern cannot be empty'
  if (pattern.length % 2 !== 0) return 'Hex pattern must have even length'
  if (!/^[0-9a-fA-F]+$/.test(pattern)) return 'Hex pattern contains invalid characters'
  return null
}

export interface RuleValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export function validateRule(rule: FrameHeaderRule): RuleValidationResult {
  const errors: string[] = []

  if (!rule.connectionId) {
    errors.push('Connection ID is required')
  }

  if (!rule.headerPatterns || rule.headerPatterns.length === 0) {
    errors.push('At least one header pattern is required')
  } else {
    for (const pattern of rule.headerPatterns) {
      const err = validateHexPattern(pattern)
      if (err) errors.push(`Invalid pattern "${pattern}": ${err}`)
    }
  }

  return { valid: errors.length === 0, errors }
}
