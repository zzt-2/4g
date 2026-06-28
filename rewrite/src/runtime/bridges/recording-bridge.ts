// 录制桥:从 routingTick 的 outcomes 采集选中帧的原始字节。
//
// S015/D013 红线(本文件最高优先级约束):
// - collect 录制关时 O(1) 早退(第一行 return),routingTick 热路径几乎零开销。
// - 写盘由 service 通过 IPC 在主进程做,renderer 只 fire-and-forget(void,不等返回)。
// - 不碰 storage-local 的 records 数组(D013 单一入口 appendLocalRecords)。
// - renderer 侧无数组累积/深拷贝(S015 根因)。
import type { ReceiveBatchOutcome } from '@/features/receive'
import type { RecordingService } from '@/features/recording/services/recording-service'
import type { RecordingFrameInput } from '@/features/recording/core'

export class RecordingBridge {
  constructor(private readonly recordingService: RecordingService) {}

  /**
   * 从 routingTick 的 outcomes 采集选中帧的原始字节。
   * 录制关时 O(1) 早退(几乎零开销)。写盘由 service 通过 IPC 在主进程做,renderer 只 fire-and-forget。
   */
  collect(outcomes: readonly ReceiveBatchOutcome[]): void {
    if (!this.recordingService.isRecording()) return   // ★ O(1) 早退,S015 守约
    const selected = this.recordingService.getSelectedFrameIds()
    if (selected.size === 0) return

    const frames: RecordingFrameInput[] = []
    for (const outcome of outcomes) {
      if (outcome.kind !== 'matched') continue
      if (!outcome.matchedFrame) continue
      if (!selected.has(outcome.matchedFrame.frameId)) continue
      const bytes = outcome.input?.bytes
      if (!bytes || bytes.length === 0) continue
      frames.push({
        capturedAt: Math.floor(Date.now() / 1000),
        frameId: outcome.matchedFrame.frameId,
        bytes,
      })
    }
    if (frames.length > 0) {
      // fire-and-forget:不等 IPC 返回,不阻塞 routingTick
      void this.recordingService.appendFrames(frames)
    }
  }
}
