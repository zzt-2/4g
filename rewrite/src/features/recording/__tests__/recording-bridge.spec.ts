import { describe, it, expect, vi } from 'vitest'
import { RecordingBridge } from '@/runtime/bridges/recording-bridge'
import type { RecordingService } from '@/features/recording/services/recording-service'
import type { ReceiveBatchOutcome } from '@/features/receive'

function mockService(opts: { recording: boolean; selected: string[] }): RecordingService {
  const selectedSet = new Set(opts.selected)
  return {
    isRecording: () => opts.recording,
    getSelectedFrameIds: () => selectedSet,
    appendFrames: vi.fn().mockResolvedValue(undefined),
  } as unknown as RecordingService
}

function matchedOutcome(frameId: string, bytes: number[]): ReceiveBatchOutcome {
  return {
    id: `outcome-${frameId}`,
    kind: 'matched',
    processedAt: '2026-06-28T00:00:00.000Z',
    matchedFrame: { frameId, frameName: frameId, byteLength: bytes.length, fieldCount: 1 },
    input: { id: 'in-1', bytes, receivedAt: '2026-06-28T00:00:00.000Z', source: { sourceId: 's' } },
    fields: [],
    issues: [],
    statsDelta: {} as never,
  } as unknown as ReceiveBatchOutcome
}

describe('RecordingBridge.collect', () => {
  it('returns immediately (no append) when recording is off', () => {
    const svc = mockService({ recording: false, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([matchedOutcome('f1', [1, 2])])
    expect(svc.appendFrames).not.toHaveBeenCalled()
  })

  it('returns when selected set is empty', () => {
    const svc = mockService({ recording: true, selected: [] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([matchedOutcome('f1', [1])])
    expect(svc.appendFrames).not.toHaveBeenCalled()
  })

  it('collects only selected matched frames with bytes', () => {
    const svc = mockService({ recording: true, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([
      matchedOutcome('f1', [1, 2]),     // 命中
      matchedOutcome('f2', [3]),         // 未选中
      matchedOutcome('f1', []),          // 命中但空 bytes,跳过
    ])
    expect(svc.appendFrames).toHaveBeenCalledTimes(1)
    const arg = (svc.appendFrames as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg).toHaveLength(1)
    expect(arg[0].frameId).toBe('f1')
    expect(arg[0].bytes).toEqual([1, 2])
  })

  it('skips non-matched outcomes', () => {
    const svc = mockService({ recording: true, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    const unmatched = { kind: 'unmatched', issues: [] } as unknown as ReceiveBatchOutcome
    bridge.collect([unmatched, matchedOutcome('f1', [1])])
    expect(svc.appendFrames).toHaveBeenCalledTimes(1)
    const arg = (svc.appendFrames as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg).toHaveLength(1)
  })

  it('collects multiple selected frames in one append call', () => {
    const svc = mockService({ recording: true, selected: ['f1', 'f2'] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([
      matchedOutcome('f1', [1]),
      matchedOutcome('f2', [2, 3]),
      matchedOutcome('f3', [4]),  // 未选中
    ])
    expect(svc.appendFrames).toHaveBeenCalledTimes(1)
    const arg = (svc.appendFrames as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg).toHaveLength(2)
    expect(arg.map((f: { frameId: string }) => f.frameId).sort()).toEqual(['f1', 'f2'])
  })

  it('does not call appendFrames when all matched frames lack bytes', () => {
    const svc = mockService({ recording: true, selected: ['f1'] })
    const bridge = new RecordingBridge(svc)
    bridge.collect([matchedOutcome('f1', [])])
    expect(svc.appendFrames).not.toHaveBeenCalled()
  })
})
