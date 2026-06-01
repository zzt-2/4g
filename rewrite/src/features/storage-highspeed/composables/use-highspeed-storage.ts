import { ref, readonly, onUnmounted, type Ref } from 'vue'
import type { StorageHighspeedService } from '../services'
import type { HighSpeedStorageState, FrameHeaderRule } from '../core'
import { selectStorageStatus, selectFormattedStats, selectCanActivate, selectRuleSummary } from '../selectors'

export interface UseHighspeedStorage {
  readonly config: Ref<HighSpeedStorageState['config']>
  readonly rule: Ref<HighSpeedStorageState['rule']>
  readonly stats: Ref<HighSpeedStorageState['stats']>
  readonly status: Ref<ReturnType<typeof selectStorageStatus>>
  readonly isLoading: Ref<boolean>
  readonly lastError: Ref<string | null>
  readonly formattedStats: Ref<ReturnType<typeof selectFormattedStats>>
  readonly canActivate: Ref<boolean>
  readonly ruleSummary: Ref<ReturnType<typeof selectRuleSummary>>
  activate(): Promise<void>
  deactivate(): Promise<void>
  setRule(rule: Omit<FrameHeaderRule, 'id'>): Promise<void>
  updateRule(updates: Partial<FrameHeaderRule>): Promise<void>
  deleteRule(): Promise<void>
  refreshStats(): Promise<void>
  resetStats(): Promise<void>
}

export function useHighspeedStorage(service: StorageHighspeedService): UseHighspeedStorage {
  const syncState = () => {
    const s = service.getSnapshot()
    config.value = s.config
    rule.value = s.rule
    stats.value = s.stats
    status.value = selectStorageStatus(s)
    isLoading.value = s.isLoading
    lastError.value = s.lastError
    formattedStats.value = selectFormattedStats(s)
    canActivate.value = selectCanActivate(s)
    ruleSummary.value = selectRuleSummary(s)
  }

  const config = ref(service.getSnapshot().config) as Ref<HighSpeedStorageState['config']>
  const rule = ref(service.getSnapshot().rule) as Ref<HighSpeedStorageState['rule']>
  const stats = ref(service.getSnapshot().stats) as Ref<HighSpeedStorageState['stats']>
  const status = ref(selectStorageStatus(service.getSnapshot()))
  const isLoading = ref(service.getSnapshot().isLoading)
  const lastError = ref(service.getSnapshot().lastError)
  const formattedStats = ref(selectFormattedStats(service.getSnapshot()))
  const canActivate = ref(selectCanActivate(service.getSnapshot()))
  const ruleSummary = ref(selectRuleSummary(service.getSnapshot()))

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      service.refreshStats().then(syncState).catch(() => {})
    }, 1000)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const wrappedActivate = async () => {
    await service.activate()
    syncState()
    if (service.getSnapshot().config.enabled) startPolling()
  }

  const wrappedDeactivate = async () => {
    stopPolling()
    await service.deactivate()
    syncState()
  }

  const wrappedSetRule = async (rule: Omit<FrameHeaderRule, 'id'>) => {
    await service.setRule(rule)
    syncState()
  }

  const wrappedUpdateRule = async (updates: Partial<FrameHeaderRule>) => {
    await service.updateRule(updates)
    syncState()
  }

  const wrappedDeleteRule = async () => {
    await service.deleteRule()
    syncState()
  }

  const wrappedRefreshStats = async () => {
    await service.refreshStats()
    syncState()
  }

  const wrappedResetStats = async () => {
    await service.resetStats()
    syncState()
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    config: readonly(config),
    rule: readonly(rule),
    stats: readonly(stats),
    status: readonly(status),
    isLoading: readonly(isLoading),
    lastError: readonly(lastError),
    formattedStats: readonly(formattedStats),
    canActivate: readonly(canActivate),
    ruleSummary: readonly(ruleSummary),
    activate: wrappedActivate,
    deactivate: wrappedDeactivate,
    setRule: wrappedSetRule,
    updateRule: wrappedUpdateRule,
    deleteRule: wrappedDeleteRule,
    refreshStats: wrappedRefreshStats,
    resetStats: wrappedResetStats,
  }
}
