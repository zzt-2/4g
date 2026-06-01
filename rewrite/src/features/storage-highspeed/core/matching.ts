export function compilePattern(hexPattern: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < hexPattern.length; i += 2) {
    bytes.push(parseInt(hexPattern.substring(i, i + 2), 16))
  }
  return bytes
}

export function matchesPrefix(data: readonly number[], pattern: readonly number[]): boolean {
  if (pattern.length === 0) return false
  if (data.length < pattern.length) return false
  for (let i = 0; i < pattern.length; i++) {
    if (data[i] !== pattern[i]) return false
  }
  return true
}

export function matchFrameHeader(
  data: readonly number[],
  patterns: readonly (readonly number[])[],
): boolean {
  for (const pattern of patterns) {
    if (matchesPrefix(data, pattern)) return true
  }
  return false
}
