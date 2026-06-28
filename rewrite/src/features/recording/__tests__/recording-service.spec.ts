import { describe, it, expect, vi } from 'vitest'
import { createRecordingService } from '../services/recording-service'
import type { RecordingPlatformFacade } from '@/platform/recording'
import type { FrameAssetReader } from '@/features/frame'

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
    listRecordingFiles: vi.fn().mockResolvedValue([]),
    readRecordingFile: vi.fn().mockResolvedValue({ bytes: [], ok: false, error: 'not available' }),
  }
}

function mockFrameReader(frames: ReadonlyArray<{ id: string; name: string; direction: string; fields: unknown[] }>): FrameAssetReader {
  return {
    getSnapshot: () => ({ frames: [], selectedFrameId: undefined, referenceVersion: 0, refreshedAt: '' }),
    listFrames: () => [],
    findFrames: () => frames as never,
    getFrame: () => undefined,
    getSelectedFrame: () => undefined,
    listFrameReferences: () => [],
    listFieldReferences: () => [],
  }
}

describe('recording-service', () => {
  it('start/stop toggles isRecording and calls facade activate/deactivate', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({ platformFacade: facade, frameReader: mockFrameReader([]) })
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
    const svc = createRecordingService({ platformFacade: facade, frameReader: mockFrameReader([]) })
    await svc.appendFrames([
      { capturedAt: 1, frameId: 'a', bytes: [1] },
      { capturedAt: 2, frameId: 'b', bytes: [2] },
    ])
    expect(svc.getSnapshot().recordCount).toBe(2)
    expect(facade.appendFrames).toHaveBeenCalledTimes(1)
  })

  it('setConfig rebuilds selectedFrameIds Set for O(1) lookup', () => {
    const svc = createRecordingService({ platformFacade: mockFacade(), frameReader: mockFrameReader([]) })
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
    const svc = createRecordingService({ platformFacade: facade, frameReader: mockFrameReader([]) })
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
    const svc = createRecordingService({ platformFacade: facade, frameReader: mockFrameReader([]) })
    await svc.refreshStats()
    expect(svc.getSnapshot().stats).not.toBeNull()
    expect(svc.getSnapshot().stats?.totalFramesStored).toBe(10)
  })

  it('getConfig returns a defensive copy (mutating returned array does not affect service)', () => {
    const svc = createRecordingService({ platformFacade: mockFacade(), frameReader: mockFrameReader([]) })
    svc.setConfig({
      selectedFrameIds: ['a', 'b'], maxFileSizeMb: 100, enableRotation: true, rotationCount: 5,
    })
    const cfg = svc.getConfig()
    cfg.selectedFrameIds.push('c')
    // service 内部 Set 不应受影响
    expect(svc.getSelectedFrameIds().has('c')).toBe(false)
  })

  it('start() snapshots selected frame definitions into activate request (防漂移)', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({
      platformFacade: facade,
      frameReader: mockFrameReader([
        { id: 'frame-1', name: 'Status', direction: 'receive', fields: [{ id: 'f1' }] },
        { id: 'frame-2', name: 'Other', direction: 'receive', fields: [] },
        { id: 'frame-3', name: 'Unselected', direction: 'receive', fields: [] },
      ]),
    })
    svc.setConfig({
      selectedFrameIds: ['frame-1', 'frame-2'],
      maxFileSizeMb: 50, enableRotation: true, rotationCount: 3,
    })
    await svc.start()
    expect(facade.activate).toHaveBeenCalledTimes(1)
    const arg = (facade.activate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.frameDefinitions).toHaveLength(2)
    expect(arg.frameDefinitions.map((d: { frameId: string }) => d.frameId).sort()).toEqual(['frame-1', 'frame-2'])
    // frameAssetJson 是完整 FrameAsset 的 JSON
    const first = arg.frameDefinitions[0]
    expect(() => JSON.parse(first.frameAssetJson)).not.toThrow()
    const parsed = JSON.parse(first.frameAssetJson)
    expect(parsed.id).toBe(first.frameId)
  })

  it('start() sends empty frameDefinitions when no frames selected', async () => {
    const facade = mockFacade()
    const svc = createRecordingService({
      platformFacade: facade,
      frameReader: mockFrameReader([{ id: 'frame-1', name: 'X', direction: 'receive', fields: [] }]),
    })
    // default config: selectedFrameIds = []
    await svc.start()
    const arg = (facade.activate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.frameDefinitions).toEqual([])
  })

  it('listRecordingFiles / readRecordingFile proxy to facade', async () => {
    const facade = mockFacade()
    ;(facade.listRecordingFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fileName: 'rec_a.bin', filePath: '/tmp/rec_a.bin', byteLength: 100, mtimeMs: 1 },
    ])
    ;(facade.readRecordingFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      bytes: [1, 2, 3], ok: true,
    })
    const svc = createRecordingService({ platformFacade: facade, frameReader: mockFrameReader([]) })
    const files = await svc.listRecordingFiles()
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('rec_a.bin')
    const result = await svc.readRecordingFile('/tmp/rec_a.bin')
    expect(result.ok).toBe(true)
    expect(result.bytes).toEqual([1, 2, 3])
  })
})
