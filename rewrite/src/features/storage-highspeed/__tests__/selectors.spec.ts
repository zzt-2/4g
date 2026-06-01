import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { HighSpeedStorageState } from '../core/types'
import {
  selectStorageStatus,
  selectFormattedStats,
  selectCanActivate,
  selectRuleSummary,
} from '../selectors/storage-highspeed-selectors'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(override: Partial<HighSpeedStorageState> = {}): HighSpeedStorageState {
  return {
    config: { enabled: false, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
    rule: null,
    stats: {
      totalFramesStored: 0,
      totalBytesStored: 0,
      currentFileSize: 0,
      storageStartTime: null,
      lastStorageTime: null,
      isStorageActive: false,
    },
    isLoading: false,
    lastError: null,
    ...override,
  }
}

// ---------------------------------------------------------------------------
// selectStorageStatus
// ---------------------------------------------------------------------------

describe('selectStorageStatus', () => {
  it('returns "disabled" when config.enabled is false', () => {
    const state = makeState({
      config: { enabled: false, maxFileSize: 1073741824, enableRotation: true, rotationCount: 3 },
    })
    expect(selectStorageStatus(state)).toBe('disabled')
  })

  it('returns "disabled" even when rule exists but config is disabled', () => {
    const state = makeState({
      config: { enabled: false, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: true },
    })
    expect(selectStorageStatus(state)).toBe('disabled')
  })

  it('returns "no-rule" when enabled but rule is null', () => {
    const state = makeState({
      config: { enabled: true, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: null,
    })
    expect(selectStorageStatus(state)).toBe('no-rule')
  })

  it('returns "rule-disabled" when enabled, rule exists, but rule.enabled is false', () => {
    const state = makeState({
      config: { enabled: true, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: false },
    })
    expect(selectStorageStatus(state)).toBe('rule-disabled')
  })

  it('returns "ready" when enabled, rule enabled, but not actively storing', () => {
    const state = makeState({
      config: { enabled: true, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: true },
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: null,
        isStorageActive: false,
      },
    })
    expect(selectStorageStatus(state)).toBe('ready')
  })

  it('returns "active" when enabled, rule enabled, and storage is active', () => {
    const state = makeState({
      config: { enabled: true, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: true },
      stats: {
        totalFramesStored: 100,
        totalBytesStored: 4096,
        currentFileSize: 2048,
        storageStartTime: '2026-05-25T10:00:00.000Z',
        lastStorageTime: '2026-05-25T10:05:00.000Z',
        isStorageActive: true,
      },
    })
    expect(selectStorageStatus(state)).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// selectFormattedStats
// ---------------------------------------------------------------------------

describe('selectFormattedStats', () => {
  it('formats zero stats as "0 B", "-", "-"', () => {
    const state = makeState()
    const result = selectFormattedStats(state)

    expect(result.totalBytesStored).toBe('0 B')
    expect(result.currentFileSize).toBe('0 B')
    expect(result.storageDuration).toBe('-')
    expect(result.lastStorageTime).toBe('-')
    expect(result.totalFramesStored).toBe('0')
  })

  it('formats kilobytes correctly', () => {
    const state = makeState({
      stats: {
        totalFramesStored: 500,
        totalBytesStored: 1536,   // 1.50 KB
        currentFileSize: 2048,    // 2.00 KB
        storageStartTime: null,
        lastStorageTime: null,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.totalBytesStored).toBe('1.50 KB')
    expect(result.currentFileSize).toBe('2.00 KB')
    expect(result.totalFramesStored).toBe('500')
  })

  it('formats megabytes correctly', () => {
    const bytes = 5 * 1024 * 1024 + 512 * 1024  // 5.5 MB
    const state = makeState({
      stats: {
        totalFramesStored: 1000,
        totalBytesStored: bytes,
        currentFileSize: bytes,
        storageStartTime: null,
        lastStorageTime: null,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.totalBytesStored).toBe('5.50 MB')
    expect(result.currentFileSize).toBe('5.50 MB')
  })

  it('formats gigabytes correctly', () => {
    const bytes = 2 * 1024 * 1024 * 1024  // 2.00 GB
    const state = makeState({
      stats: {
        totalFramesStored: 50000,
        totalBytesStored: bytes,
        currentFileSize: bytes,
        storageStartTime: null,
        lastStorageTime: null,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.totalBytesStored).toBe('2.00 GB')
    expect(result.currentFileSize).toBe('2.00 GB')
  })

  it('formats duration as seconds', () => {
    const start = '2026-05-25T10:00:00.000Z'
    const end = '2026-05-25T10:00:45.000Z'
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: start,
        lastStorageTime: end,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.storageDuration).toBe('45s')
  })

  it('formats duration as minutes and seconds', () => {
    const start = '2026-05-25T10:00:00.000Z'
    const end = '2026-05-25T10:05:30.000Z'
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: start,
        lastStorageTime: end,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.storageDuration).toBe('5m 30s')
  })

  it('formats duration as hours and minutes', () => {
    const start = '2026-05-25T10:00:00.000Z'
    const end = '2026-05-25T12:30:00.000Z'
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: start,
        lastStorageTime: end,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.storageDuration).toBe('2h 30m')
  })

  it('formats relative time for lastStorageTime using Date.now', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T10:01:00.000Z'))

    const lastTime = '2026-05-25T10:00:30.000Z'  // 30s ago
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: lastTime,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.lastStorageTime).toBe('30s ago')

    vi.useRealTimers()
  })

  it('formats relative time as "just now" for sub-second recency', () => {
    const now = new Date('2026-05-25T10:00:00.500Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const lastTime = '2026-05-25T10:00:00.000Z'  // 500ms ago
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: lastTime,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.lastStorageTime).toBe('just now')

    vi.useRealTimers()
  })

  it('formats relative time as minutes ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T10:10:00.000Z'))

    const lastTime = '2026-05-25T10:05:00.000Z'  // 5m ago
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: lastTime,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.lastStorageTime).toBe('5m ago')

    vi.useRealTimers()
  })

  it('formats relative time as hours ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T13:00:00.000Z'))

    const lastTime = '2026-05-25T10:00:00.000Z'  // 3h ago
    const state = makeState({
      stats: {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: lastTime,
        isStorageActive: false,
      },
    })
    const result = selectFormattedStats(state)

    expect(result.lastStorageTime).toBe('3h ago')

    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// selectCanActivate
// ---------------------------------------------------------------------------

describe('selectCanActivate', () => {
  it('returns true when not enabled, has rule, and rule is enabled', () => {
    const state = makeState({
      config: { enabled: false, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: true },
    })
    expect(selectCanActivate(state)).toBe(true)
  })

  it('returns false when already enabled', () => {
    const state = makeState({
      config: { enabled: true, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: true },
    })
    expect(selectCanActivate(state)).toBe(false)
  })

  it('returns false when no rule exists', () => {
    const state = makeState({
      config: { enabled: false, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: null,
    })
    expect(selectCanActivate(state)).toBe(false)
  })

  it('returns false when rule exists but is disabled', () => {
    const state = makeState({
      config: { enabled: false, maxFileSize: 0, enableRotation: false, rotationCount: 0 },
      rule: { id: 'r1', connectionId: 'conn-1', headerPatterns: ['AA BB'], enabled: false },
    })
    expect(selectCanActivate(state)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// selectRuleSummary
// ---------------------------------------------------------------------------

describe('selectRuleSummary', () => {
  it('returns null when no rule exists', () => {
    const state = makeState({ rule: null })
    expect(selectRuleSummary(state)).toBeNull()
  })

  it('returns summary with connectionId, patternCount, and enabled from the rule', () => {
    const state = makeState({
      rule: {
        id: 'r1',
        connectionId: 'conn-42',
        headerPatterns: ['AA BB', 'CC DD', 'EE FF'],
        enabled: true,
      },
    })
    const summary = selectRuleSummary(state)

    expect(summary).toEqual({
      connectionId: 'conn-42',
      patternCount: 3,
      enabled: true,
    })
  })

  it('returns patternCount 0 when headerPatterns is empty', () => {
    const state = makeState({
      rule: {
        id: 'r2',
        connectionId: 'conn-1',
        headerPatterns: [],
        enabled: false,
      },
    })
    const summary = selectRuleSummary(state)

    expect(summary).toEqual({
      connectionId: 'conn-1',
      patternCount: 0,
      enabled: false,
    })
  })

  it('does not include rule id in the summary', () => {
    const state = makeState({
      rule: {
        id: 'secret-id',
        connectionId: 'conn-1',
        headerPatterns: ['AA'],
        enabled: true,
      },
    })
    const summary = selectRuleSummary(state)

    expect(summary).not.toHaveProperty('id')
    expect(summary).toEqual({
      connectionId: 'conn-1',
      patternCount: 1,
      enabled: true,
    })
  })
})
