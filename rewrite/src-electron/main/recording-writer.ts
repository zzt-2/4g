// 主进程录制写盘器:包装 DiskRotationWriter(T2 共享工具),注入二进制序列化
// (T1 的 encodeFileHeader/encodeFrameRecord/encodeFrameDefinitionBlock)。
// 每个录制 session 一个 .bin 文件,开头写 4B magic "RCD1" + 帧定义块(防漂移),
// 随后逐帧 append 原始字节。
//
// 主进程直接引用 src/ 下的纯函数(@/ 别名,tsconfig paths 已配,src-electron 在
// 根 tsconfig include 内)。业务判断(选哪些帧)在 renderer service(T8),本处只
// 负责 append + 滚动,不含业务规则(R6/R7)。
//
// S015/D013 守约:帧定义块是 activate 时一次性写(所有选中帧一起写),
// 不是每帧写;帧记录流格式不变,写入路径 O(1) 追加。
import { DiskRotationWriter, type RotationFileConfig, type RotationWriterStats } from './shared/disk-rotation-writer'
import {
  encodeFileHeader,
  encodeFrameRecord,
  encodeFrameDefinitionBlock,
  type RecordingFrameRecord,
  type FrameDefinitionEntry,
} from '@/features/recording/core/serialization'
import type { RecordingFrameInput } from '@/shared/platform-bridge'

class RecordingWriterImpl {
  private writer = new DiskRotationWriter({
    subDir: 'dongfanghong/recordings',
    filenamePrefix: 'rec_',
    extension: '.bin',
  })
  private headerWritten = false
  // 最近一次 activate 的帧定义,resetStats 重写头时复用(reset 罕见,且本就应重 activate)。
  private lastFrameDefinitions: readonly { readonly frameId: string; readonly frameAssetJson: string }[] = []

  activate(
    fileConfig: RotationFileConfig,
    frameDefinitions: readonly { readonly frameId: string; readonly frameAssetJson: string }[],
  ): void {
    this.writer.activate(fileConfig)
    this.lastFrameDefinitions = frameDefinitions
    this.writeHeader(frameDefinitions)
    this.headerWritten = true
  }

  deactivate(): void {
    this.writer.deactivate()
    this.headerWritten = false
  }

  // 写文件头:magic + 帧定义块(总长前缀 + 内容)。每个新文件都写一次。
  private writeHeader(frameDefinitions: readonly { readonly frameId: string; readonly frameAssetJson: string }[]): void {
    this.writer.writeItem(encodeFileHeader(), 0)
    const entries: FrameDefinitionEntry[] = frameDefinitions.map((d) => ({
      frameId: d.frameId,
      frameAssetJson: d.frameAssetJson,
    }))
    this.writer.writeItem(encodeFrameDefinitionBlock(entries), 0)
  }

  // 入参用 RecordingFrameInput(与 IPC bridge 类型一致),内部转 RecordingFrameRecord 序列化。
  writeFrames(frames: readonly RecordingFrameInput[]): void {
    if (!this.headerWritten) return
    for (const f of frames) {
      const record: RecordingFrameRecord = { capturedAt: f.capturedAt, frameId: f.frameId, bytes: f.bytes }
      const buf = encodeFrameRecord(record)
      this.writer.writeItem(buf, f.bytes.length)
    }
  }

  getStats(): RotationWriterStats {
    return this.writer.getStats()
  }

  resetStats(): void {
    this.writer.resetStats()
    if (this.headerWritten) {
      // reset 开了新文件,重写 magic 头 + 帧定义块(复用 activate 时的帧定义快照)。
      // reset 罕见(通常 deactivate 再 activate);若帧定义已过期,用户应重新 activate。
      this.writeHeader(this.lastFrameDefinitions)
    }
  }

  updateConfig(config: Partial<RotationFileConfig>): void {
    this.writer.updateConfig(config)
  }

  cleanup(): void {
    this.writer.cleanup()
    this.headerWritten = false
  }
}

export const recordingWriter = new RecordingWriterImpl()
