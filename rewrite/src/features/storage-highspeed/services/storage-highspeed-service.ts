import { compilePattern, validateRule } from '../core'
import type { FrameHeaderRule, HighSpeedStorageState } from '../core'
import type { StorageHighspeedStateContainer } from '../state/storage-highspeed-state'
import { createStorageHighspeedState } from '../state/storage-highspeed-state'
import type { StoragePlatformFacade } from '@/platform/storage'

export interface StorageHighspeedService {
  getSnapshot(): HighSpeedStorageState
  activate(): Promise<void>
  deactivate(): Promise<void>
  setRule(rule: Omit<FrameHeaderRule, 'id'>): Promise<void>
  updateRule(updates: Partial<FrameHeaderRule>): Promise<void>
  deleteRule(): Promise<void>
  refreshStats(): Promise<void>
  resetStats(): Promise<void>
}

export interface CreateServiceOptions {
  readonly platformFacade: StoragePlatformFacade
  readonly state?: StorageHighspeedStateContainer
  readonly generateId?: () => string
}

export function createStorageHighspeedService(
  options: CreateServiceOptions,
): StorageHighspeedService {
  const state = options.state ?? createStorageHighspeedState()
  const generateId = options.generateId ?? (() => crypto.randomUUID())
  let activeRuleId: string | null = null

  return {
    getSnapshot: () => state.getSnapshot(),

    async activate() {
      state.setLoading(true)
      state.setError(null)
      try {
        const snapshot = state.getSnapshot()
        if (!snapshot.rule) throw new Error('No rule configured')
        if (!snapshot.rule.enabled) throw new Error('Rule is disabled')

        const compiledPatterns = snapshot.rule.headerPatterns.map((p) => compilePattern(p))
        const result = await options.platformFacade.activateFilter({
          connectionId: snapshot.rule.connectionId,
          compiledPatterns,
          fileConfig: {
            maxFileSize: snapshot.config.maxFileSize * 1024 * 1024,
            enableRotation: snapshot.config.enableRotation,
            rotationCount: snapshot.config.rotationCount,
          },
        })

        if (!result.ok) {
          state.setError(result.error ?? 'Activation failed')
          return
        }

        activeRuleId = snapshot.rule.id
        state.setConfig({ ...snapshot.config, enabled: true })
      } catch (err) {
        state.setError(err instanceof Error ? err.message : String(err))
      } finally {
        state.setLoading(false)
      }
    },

    async deactivate() {
      state.setLoading(true)
      state.setError(null)
      try {
        const result = await options.platformFacade.deactivateFilter()
        if (!result.ok) {
          state.setError(result.error ?? 'Deactivation failed')
          return
        }
        activeRuleId = null
        const snapshot = state.getSnapshot()
        state.setConfig({ ...snapshot.config, enabled: false })
      } catch (err) {
        state.setError(err instanceof Error ? err.message : String(err))
      } finally {
        state.setLoading(false)
      }
    },

    async setRule(rule) {
      const fullRule: FrameHeaderRule = { ...rule, id: generateId() }
      const validation = validateRule(fullRule)
      if (!validation.valid) {
        throw new Error(validation.errors.join('; '))
      }

      const snapshot = state.getSnapshot()
      if (snapshot.config.enabled && activeRuleId !== null) {
        await options.platformFacade.deactivateFilter()
        activeRuleId = null
        state.setConfig({ ...snapshot.config, enabled: false })
      }

      state.setRule(fullRule)
    },

    async updateRule(updates) {
      const snapshot = state.getSnapshot()
      if (!snapshot.rule) throw new Error('No rule to update')

      const updated: FrameHeaderRule = {
        ...snapshot.rule,
        ...updates,
        id: snapshot.rule.id,
        headerPatterns: updates.headerPatterns ?? snapshot.rule.headerPatterns,
      }

      const validation = validateRule(updated)
      if (!validation.valid) {
        throw new Error(validation.errors.join('; '))
      }

      state.setRule(updated)

      if (snapshot.config.enabled && activeRuleId === snapshot.rule.id) {
        await options.platformFacade.deactivateFilter()
        activeRuleId = null
        state.setConfig({ ...snapshot.config, enabled: false })
      }
    },

    async deleteRule() {
      const snapshot = state.getSnapshot()
      if (snapshot.config.enabled && activeRuleId !== null) {
        await options.platformFacade.deactivateFilter()
        activeRuleId = null
        state.setConfig({ ...snapshot.config, enabled: false })
      }
      state.deleteRule()
    },

    async refreshStats() {
      try {
        const stats = await options.platformFacade.getStats()
        state.setStats(stats)
      } catch (err) {
        state.setError(err instanceof Error ? err.message : String(err))
      }
    },

    async resetStats() {
      state.setLoading(true)
      state.setError(null)
      try {
        const result = await options.platformFacade.resetStats()
        if (!result.ok) {
          state.setError(result.error ?? 'Reset failed')
          return
        }
        const snapshot = state.getSnapshot()
        state.setStats({
          totalFramesStored: 0,
          totalBytesStored: 0,
          currentFileSize: 0,
          storageStartTime: null,
          lastStorageTime: null,
          isStorageActive: snapshot.config.enabled,
        })
      } catch (err) {
        state.setError(err instanceof Error ? err.message : String(err))
      } finally {
        state.setLoading(false)
      }
    },
  }
}
