import { defaultConfig, defaultStats } from '../core'
import type {
  HighSpeedStorageConfig,
  HighSpeedStorageState,
  HighSpeedStorageStats,
  FrameHeaderRule,
} from '../core'

export interface StorageHighspeedStateContainer {
  getSnapshot(): HighSpeedStorageState
  setConfig(config: HighSpeedStorageConfig): HighSpeedStorageState
  setRule(rule: FrameHeaderRule | null): HighSpeedStorageState
  deleteRule(): HighSpeedStorageState
  setStats(stats: HighSpeedStorageStats): HighSpeedStorageState
  setLoading(loading: boolean): HighSpeedStorageState
  setError(error: string | null): HighSpeedStorageState
}

export function createStorageHighspeedState(): StorageHighspeedStateContainer {
  let config: HighSpeedStorageConfig = { ...defaultConfig }
  let rule: FrameHeaderRule | null = null
  let stats: HighSpeedStorageStats = { ...defaultStats }
  let isLoading = false
  let lastError: string | null = null

  const snapshot = (): HighSpeedStorageState => ({
    config: { ...config },
    rule: rule ? { ...rule, headerPatterns: [...rule.headerPatterns] } : null,
    stats: { ...stats },
    isLoading,
    lastError,
  })

  return {
    getSnapshot: snapshot,
    setConfig(next) {
      config = { ...next }
      return snapshot()
    },
    setRule(next) {
      rule = next ? { ...next, headerPatterns: [...next.headerPatterns] } : null
      return snapshot()
    },
    deleteRule() {
      rule = null
      return snapshot()
    },
    setStats(next) {
      stats = { ...next }
      return snapshot()
    },
    setLoading(next) {
      isLoading = next
      return snapshot()
    },
    setError(next) {
      lastError = next
      return snapshot()
    },
  }
}
