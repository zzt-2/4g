import type { StorageBridge, StorageActivateRequest, StorageStats, StorageConfigUpdate } from '@/shared/platform-bridge'

export type { StorageBridge, StorageActivateRequest, StorageStats, StorageConfigUpdate }

export interface StoragePlatformFacade {
  activateFilter(request: StorageActivateRequest): Promise<{ readonly ok: boolean; readonly error?: string }>
  deactivateFilter(): Promise<{ readonly ok: boolean; readonly error?: string }>
  getStats(): Promise<StorageStats>
  resetStats(): Promise<{ readonly ok: boolean; readonly error?: string }>
  updateConfig(config: StorageConfigUpdate): Promise<{ readonly ok: boolean; readonly error?: string }>
}

export function createStorageFacade(bridge: StorageBridge): StoragePlatformFacade {
  return {
    activateFilter: (request) => bridge.activate(request),
    deactivateFilter: () => bridge.deactivate(),
    getStats: () => bridge.getStats(),
    resetStats: () => bridge.reset(),
    updateConfig: (config) => bridge.updateConfig(config),
  }
}
