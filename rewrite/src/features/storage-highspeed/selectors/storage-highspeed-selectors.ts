import type { HighSpeedStorageState, StorageStatus } from '../core'

export function selectStorageStatus(state: HighSpeedStorageState): StorageStatus {
  if (!state.config.enabled) return 'disabled'
  if (!state.rule) return 'no-rule'
  if (!state.rule.enabled) return 'rule-disabled'
  if (state.stats.isStorageActive) return 'active'
  return 'ready'
}

export interface FormattedStats {
  readonly totalFramesStored: string
  readonly totalBytesStored: string
  readonly currentFileSize: string
  readonly storageDuration: string
  readonly lastStorageTime: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

function formatDuration(startTime: string | null, endTime: string | null): string {
  if (!startTime) return '-'
  const start = new Date(startTime).getTime()
  const end = endTime ? new Date(endTime).getTime() : Date.now()
  const diff = Math.max(0, end - start)
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatRelativeTime(time: string | null): string {
  if (!time) return '-'
  const diff = Date.now() - new Date(time).getTime()
  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

export function selectFormattedStats(state: HighSpeedStorageState): FormattedStats {
  return {
    totalFramesStored: String(state.stats.totalFramesStored),
    totalBytesStored: formatBytes(state.stats.totalBytesStored),
    currentFileSize: formatBytes(state.stats.currentFileSize),
    storageDuration: formatDuration(state.stats.storageStartTime, state.stats.lastStorageTime),
    lastStorageTime: formatRelativeTime(state.stats.lastStorageTime),
  }
}

export function selectCanActivate(state: HighSpeedStorageState): boolean {
  return !state.config.enabled && state.rule !== null && state.rule.enabled
}

export interface RuleSummary {
  readonly connectionId: string
  readonly patternCount: number
  readonly enabled: boolean
}

export function selectRuleSummary(state: HighSpeedStorageState): RuleSummary | null {
  if (!state.rule) return null
  return {
    connectionId: state.rule.connectionId,
    patternCount: state.rule.headerPatterns.length,
    enabled: state.rule.enabled,
  }
}
