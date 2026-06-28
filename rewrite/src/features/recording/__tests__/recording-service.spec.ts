import { describe, it, expect, vi } from 'vitest'
import { createRecordingService } from '../services/recording-service'
import type { RecordingPlatformFacade } from '@/platform/recording'

function mockFacade(): RecordingPlatformFacade {
  return {
    activate: vi.fn().mockResolvedValue({ ok: true }),
    deactivate: vi.fn().mockResolvedValue({ ok: true }),
    appendFrames: vi.fn().mockResolvedValue({ ok: true }),
    getStats: vi.fn().mockResolvedValue({
      totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
      storageStartTime: null, lastStorageTime: null, isStorageActive: false,
    }),
    reset: vi.fn().mockResolvedValue({ ok: true }),
    updateConfig: vi.fn().mockResolvedValue({ ok: true }),
  }
}

describe('recording-service', () => {
  it('start/stop toggles isRecording and calls facade activate/deactivate', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade })
    expect(svc.isRecording()).toBe(false)
    await svc.start()
    expect(svc.isRecording()).toBe(true)
    expect(facade.activate).toHaveBeenCalledTimes(1)
    await svc.stop()
    expect(svc.isRecording()).toBe(false)
    expect(facade.deactivate).toHaveBeenCalledTimes(1)
  })

  it('appendFrames increments recordCount and calls facade appendFrames', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade })
    await svc.appendFrames([
      { capturedAt: 1, frameId: 'a', bytes: [1] },
      { capturedAt: 2, frameId: 'b', bytes: [2] },
    ])
    expect(svc.getSnapshot().recordCount).toBe(2)
    expect(facade.appendFrames).toHaveBeenCalledTimes(1)
  })

  it('setConfig rebuilds selectedFrameIds Set for O(1) lookup', () => {
    const svc = createRecordingService({ platformFacade: mockFacade() })
    svc.setConfig({
      selectedFrameIds: ['frame-1', 'frame-2'],
      maxFileSizeMb: 50, enableRotation: true, rotationCount: 3,
    })
    const set = svc.getSelectedFrameIds()
    expect(set.has('frame-1')).toBe(true)
    expect(set.has('frame-3')).toBe(false)
  })

  it('appendFrames with empty array is a no-op (no IPC)', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade })
    await svc.appendFrames([])
    expect(facade.appendFrames).not.toHaveBeenCalled()
    expect(svc.getSnapshot().recordCount).toBe(0)
  })

  it('refreshStats pulls stats from facade and stores in state', async () => {
    const facade = mockFacade()
    ;(facade.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalFramesStored: 10, totalBytesStored: 2048, currentFileSize: 1024,
      storageStartTime: '2026-06-28T00:00:00.000Z',
      lastStorageTime: '2026-06-28T00:00:01.000Z',
      isStorageActive: true,
    })
    const svc = createRecordingService({ platformFacade: facade })
    await svc.refreshStats()
    expect(svc.getSnapshot().stats).not.toBeNull()
    expect(svc.getSnapshot().stats?.totalFramesStored).toBe(10)
  })

  it('getConfig returns a defensive copy (mutating returned array does not affect service)', () => {
    const svc = createRecordingService({ platformFacade: mockFacade() })
    svc.setConfig({
      selectedFrameIds: ['a', 'b'], maxFileSizeMb: 100, enableRotation: true, rotationCount: 5,
    })
    const cfg = svc.getConfig()
    cfg.selectedFrameIds.push('c')
    // service 内部 Set 不应受影响
    expect(svc.getSelectedFrameIds().has('c')).toBe(false)
  })
})
