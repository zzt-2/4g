import { describe, it, expect, vi } from 'vitest'
import { createStorageHighspeedService } from '../services/storage-highspeed-service'
import type { StoragePlatformFacade } from '../services/storage-highspeed-service'
import type { StorageHighspeedStateContainer } from '../state/storage-highspeed-state'
import type { FrameHeaderRule } from '../core'

function createMockFacade(): StoragePlatformFacade {
  return {
    activateFilter: vi.fn().mockResolvedValue({ ok: true }),
    deactivateFilter: vi.fn().mockResolvedValue({ ok: true }),
    getStats: vi.fn().mockResolvedValue({
      totalFramesStored: 0,
      totalBytesStored: 0,
      currentFileSize: 0,
      storageStartTime: null,
      lastStorageTime: null,
      isStorageActive: false,
    }),
    resetStats: vi.fn().mockResolvedValue({ ok: true }),
    updateConfig: vi.fn().mockResolvedValue({ ok: true }),
  }
}

function validRuleData(): Omit<FrameHeaderRule, 'id'> {
  return {
    connectionId: 'conn-1',
    headerPatterns: ['AABBCC'],
    enabled: true,
  }
}

describe('createStorageHighspeedService', () => {
  describe('initial state', () => {
    it('returns default config, no rule, and default stats', () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
      })

      const snapshot = service.getSnapshot()

      expect(snapshot.config).toEqual({
        enabled: false,
        maxFileSize: 100,
        enableRotation: true,
        rotationCount: 5,
      })
      expect(snapshot.rule).toBeNull()
      expect(snapshot.stats).toEqual({
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: null,
        isStorageActive: false,
      })
      expect(snapshot.isLoading).toBe(false)
      expect(snapshot.lastError).toBeNull()
    })
  })

  describe('setRule', () => {
    it('sets a valid rule into state', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())

      const snapshot = service.getSnapshot()
      expect(snapshot.rule).toEqual({
        id: 'rule-1',
        connectionId: 'conn-1',
        headerPatterns: ['AABBCC'],
        enabled: true,
      })
    })

    it('throws on invalid rule (missing connectionId)', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await expect(
        service.setRule({
          connectionId: '',
          headerPatterns: ['AABBCC'],
          enabled: true,
        }),
      ).rejects.toThrow('Connection ID is required')

      expect(service.getSnapshot().rule).toBeNull()
    })

    it('throws on invalid rule (no header patterns)', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await expect(
        service.setRule({
          connectionId: 'conn-1',
          headerPatterns: [],
          enabled: true,
        }),
      ).rejects.toThrow('At least one header pattern is required')
    })

    it('throws on invalid hex pattern', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await expect(
        service.setRule({
          connectionId: 'conn-1',
          headerPatterns: ['ZZ'],
          enabled: true,
        }),
      ).rejects.toThrow('Invalid pattern')
    })

    it('deactivates before setting rule when currently active', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      // Set a rule and activate
      await service.setRule(validRuleData())
      await service.activate()

      expect(service.getSnapshot().config.enabled).toBe(true)
      expect(facade.deactivateFilter).not.toHaveBeenCalled()

      // Set a different rule while active — should deactivate first
      await service.setRule({
        connectionId: 'conn-2',
        headerPatterns: ['DDEEFF'],
        enabled: true,
      })

      expect(facade.deactivateFilter).toHaveBeenCalledTimes(1)
      expect(service.getSnapshot().config.enabled).toBe(false)
      expect(service.getSnapshot().rule?.connectionId).toBe('conn-2')
    })
  })

  describe('activate', () => {
    it('throws when no rule is configured', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
      })

      await service.activate()

      const snapshot = service.getSnapshot()
      expect(snapshot.config.enabled).toBe(false)
      expect(snapshot.lastError).toBe('No rule configured')
    })

    it('throws when rule is disabled', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule({
        connectionId: 'conn-1',
        headerPatterns: ['AABBCC'],
        enabled: false,
      })

      await service.activate()

      const snapshot = service.getSnapshot()
      expect(snapshot.config.enabled).toBe(false)
      expect(snapshot.lastError).toBe('Rule is disabled')
      expect(facade.activateFilter).not.toHaveBeenCalled()
    })

    it('calls activateFilter and sets enabled=true with valid enabled rule', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()

      expect(facade.activateFilter).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        compiledPatterns: [[0xaa, 0xbb, 0xcc]],
        fileConfig: {
          maxFileSize: 100 * 1024 * 1024,
          enableRotation: true,
          rotationCount: 5,
        },
      })

      const snapshot = service.getSnapshot()
      expect(snapshot.config.enabled).toBe(true)
      expect(snapshot.lastError).toBeNull()
    })

    it('sets lastError when activateFilter returns ok=false', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.activateFilter).mockResolvedValue({
        ok: false,
        error: 'Port busy',
      })

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()

      const snapshot = service.getSnapshot()
      expect(snapshot.config.enabled).toBe(false)
      expect(snapshot.lastError).toBe('Port busy')
    })

    it('sets lastError when activateFilter returns ok=false without error message', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.activateFilter).mockResolvedValue({ ok: false })

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()

      expect(service.getSnapshot().lastError).toBe('Activation failed')
    })
  })

  describe('deactivate', () => {
    it('calls deactivateFilter and sets enabled=false', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      expect(service.getSnapshot().config.enabled).toBe(true)

      await service.deactivate()

      expect(facade.deactivateFilter).toHaveBeenCalledTimes(1)
      expect(service.getSnapshot().config.enabled).toBe(false)
      expect(service.getSnapshot().lastError).toBeNull()
    })

    it('sets lastError when deactivateFilter returns ok=false', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.deactivateFilter).mockResolvedValue({
        ok: false,
        error: 'Device error',
      })

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      await service.deactivate()

      expect(service.getSnapshot().lastError).toBe('Device error')
    })

    it('sets lastError when deactivateFilter returns ok=false without message', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.deactivateFilter).mockResolvedValue({ ok: false })

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      await service.deactivate()

      expect(service.getSnapshot().lastError).toBe('Deactivation failed')
    })
  })

  describe('deleteRule', () => {
    it('clears the rule', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      expect(service.getSnapshot().rule).not.toBeNull()

      await service.deleteRule()

      expect(service.getSnapshot().rule).toBeNull()
    })

    it('deactivates first if currently active', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      expect(service.getSnapshot().config.enabled).toBe(true)

      await service.deleteRule()

      expect(facade.deactivateFilter).toHaveBeenCalledTimes(1)
      expect(service.getSnapshot().config.enabled).toBe(false)
      expect(service.getSnapshot().rule).toBeNull()
    })

    it('does not call deactivateFilter when not active', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      // Rule is set but not activated
      expect(service.getSnapshot().config.enabled).toBe(false)

      await service.deleteRule()

      expect(facade.deactivateFilter).not.toHaveBeenCalled()
      expect(service.getSnapshot().rule).toBeNull()
    })
  })

  describe('updateRule', () => {
    it('updates an existing rule', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.updateRule({ connectionId: 'conn-updated' })

      const snapshot = service.getSnapshot()
      expect(snapshot.rule?.connectionId).toBe('conn-updated')
      expect(snapshot.rule?.id).toBe('rule-1')
    })

    it('throws when no rule exists', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
      })

      await expect(
        service.updateRule({ connectionId: 'conn-x' }),
      ).rejects.toThrow('No rule to update')
    })

    it('throws on invalid update', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())

      await expect(
        service.updateRule({ connectionId: '' }),
      ).rejects.toThrow('Connection ID is required')
    })

    it('preserves rule id during update', async () => {
      const service = createStorageHighspeedService({
        platformFacade: createMockFacade(),
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.updateRule({ enabled: false })

      // id must not change even though updateRule spreads the updates
      expect(service.getSnapshot().rule?.id).toBe('rule-1')
    })

    it('deactivates when updating an active rule', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      expect(service.getSnapshot().config.enabled).toBe(true)

      await service.updateRule({ connectionId: 'conn-updated' })

      expect(facade.deactivateFilter).toHaveBeenCalledTimes(1)
      expect(service.getSnapshot().config.enabled).toBe(false)
    })
  })

  describe('refreshStats', () => {
    it('calls getStats and updates state', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.getStats).mockResolvedValue({
        totalFramesStored: 42,
        totalBytesStored: 1024,
        currentFileSize: 512,
        storageStartTime: '2026-01-01T00:00:00Z',
        lastStorageTime: '2026-01-01T00:10:00Z',
        isStorageActive: true,
      })

      const service = createStorageHighspeedService({
        platformFacade: facade,
      })

      await service.refreshStats()

      const snapshot = service.getSnapshot()
      expect(snapshot.stats).toEqual({
        totalFramesStored: 42,
        totalBytesStored: 1024,
        currentFileSize: 512,
        storageStartTime: '2026-01-01T00:00:00Z',
        lastStorageTime: '2026-01-01T00:10:00Z',
        isStorageActive: true,
      })
    })

    it('sets lastError on getStats failure', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.getStats).mockRejectedValue(new Error('IPC failed'))

      const service = createStorageHighspeedService({
        platformFacade: facade,
      })

      await service.refreshStats()

      expect(service.getSnapshot().lastError).toBe('IPC failed')
    })
  })

  describe('resetStats', () => {
    it('calls platform resetStats and zeros counters', async () => {
      const facade = createMockFacade()

      const service = createStorageHighspeedService({
        platformFacade: facade,
      })

      // First set some stats via refreshStats
      vi.mocked(facade.getStats).mockResolvedValue({
        totalFramesStored: 99,
        totalBytesStored: 2048,
        currentFileSize: 1024,
        storageStartTime: '2026-01-01T00:00:00Z',
        lastStorageTime: '2026-01-01T00:10:00Z',
        isStorageActive: true,
      })
      await service.refreshStats()
      expect(service.getSnapshot().stats.totalFramesStored).toBe(99)

      // Now reset
      await service.resetStats()

      expect(facade.resetStats).toHaveBeenCalledTimes(1)
      const snapshot = service.getSnapshot()
      expect(snapshot.stats).toEqual({
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: null,
        isStorageActive: false,
      })
      expect(snapshot.lastError).toBeNull()
    })

    it('preserves isStorageActive based on current config after reset', async () => {
      const facade = createMockFacade()
      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      expect(service.getSnapshot().config.enabled).toBe(true)

      await service.resetStats()

      expect(service.getSnapshot().stats.isStorageActive).toBe(true)
    })

    it('sets lastError when platform resetStats returns ok=false', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.resetStats).mockResolvedValue({
        ok: false,
        error: 'Reset not supported',
      })

      const service = createStorageHighspeedService({
        platformFacade: facade,
      })

      await service.resetStats()

      expect(service.getSnapshot().lastError).toBe('Reset not supported')
    })

    it('sets lastError when platform resetStats returns ok=false without message', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.resetStats).mockResolvedValue({ ok: false })

      const service = createStorageHighspeedService({
        platformFacade: facade,
      })

      await service.resetStats()

      expect(service.getSnapshot().lastError).toBe('Reset failed')
    })
  })

  describe('error handling', () => {
    it('sets lastError when platformFacade throws', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.activateFilter).mockRejectedValue(
        new Error('IPC channel closed'),
      )

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()

      expect(service.getSnapshot().lastError).toBe('IPC channel closed')
    })

    it('sets lastError for non-Error throws', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.deactivateFilter).mockRejectedValue('raw string error')

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()
      await service.deactivate()

      expect(service.getSnapshot().lastError).toBe('raw string error')
    })

    it('clears lastError on next successful operation', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.activateFilter)
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValueOnce({ ok: true })

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())

      // First activate fails
      await service.activate()
      expect(service.getSnapshot().lastError).toBe('first fail')

      // Second activate succeeds and clears error
      await service.activate()
      expect(service.getSnapshot().lastError).toBeNull()
      expect(service.getSnapshot().config.enabled).toBe(true)
    })

    it('sets loading to false even when platform throws', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.activateFilter).mockRejectedValue(new Error('crash'))

      const service = createStorageHighspeedService({
        platformFacade: facade,
        generateId: () => 'rule-1',
      })

      await service.setRule(validRuleData())
      await service.activate()

      expect(service.getSnapshot().isLoading).toBe(false)
    })

    it('refreshStats sets lastError on non-Error rejection', async () => {
      const facade = createMockFacade()
      vi.mocked(facade.getStats).mockRejectedValue(42)

      const service = createStorageHighspeedService({
        platformFacade: facade,
      })

      await service.refreshStats()

      expect(service.getSnapshot().lastError).toBe('42')
    })
  })

  describe('custom state container', () => {
    it('uses provided state container instead of creating a new one', () => {
      const facade = createMockFacade()
      const customState: StorageHighspeedStateContainer = {
        getSnapshot: vi.fn().mockReturnValue({
          config: {
            enabled: false,
            maxFileSize: 200,
            enableRotation: false,
            rotationCount: 10,
          },
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
        }),
        setConfig: vi.fn().mockReturnValue({
          config: { enabled: false, maxFileSize: 200, enableRotation: false, rotationCount: 10 },
          rule: null,
          stats: {
            totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
            storageStartTime: null, lastStorageTime: null, isStorageActive: false,
          },
          isLoading: false,
          lastError: null,
        }),
        setRule: vi.fn().mockReturnValue({
          config: { enabled: false, maxFileSize: 200, enableRotation: false, rotationCount: 10 },
          rule: null,
          stats: {
            totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
            storageStartTime: null, lastStorageTime: null, isStorageActive: false,
          },
          isLoading: false,
          lastError: null,
        }),
        deleteRule: vi.fn().mockReturnValue({
          config: { enabled: false, maxFileSize: 200, enableRotation: false, rotationCount: 10 },
          rule: null,
          stats: {
            totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
            storageStartTime: null, lastStorageTime: null, isStorageActive: false,
          },
          isLoading: false,
          lastError: null,
        }),
        setStats: vi.fn().mockReturnValue({
          config: { enabled: false, maxFileSize: 200, enableRotation: false, rotationCount: 10 },
          rule: null,
          stats: {
            totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
            storageStartTime: null, lastStorageTime: null, isStorageActive: false,
          },
          isLoading: false,
          lastError: null,
        }),
        setLoading: vi.fn().mockReturnValue({
          config: { enabled: false, maxFileSize: 200, enableRotation: false, rotationCount: 10 },
          rule: null,
          stats: {
            totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
            storageStartTime: null, lastStorageTime: null, isStorageActive: false,
          },
          isLoading: false,
          lastError: null,
        }),
        setError: vi.fn().mockReturnValue({
          config: { enabled: false, maxFileSize: 200, enableRotation: false, rotationCount: 10 },
          rule: null,
          stats: {
            totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
            storageStartTime: null, lastStorageTime: null, isStorageActive: false,
          },
          isLoading: false,
          lastError: null,
        }),
      }

      const service = createStorageHighspeedService({
        platformFacade: facade,
        state: customState,
      })

      const snapshot = service.getSnapshot()
      expect(snapshot.config.maxFileSize).toBe(200)
      expect(snapshot.config.enableRotation).toBe(false)
      expect(snapshot.config.rotationCount).toBe(10)
      expect(customState.getSnapshot).toHaveBeenCalled()
    })
  })
})
