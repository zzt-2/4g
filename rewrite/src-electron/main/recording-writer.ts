// 主进程录制写盘器:包装 DiskRotationWriter(T2 共享工具),注入二进制序列化
// (T1 的 encodeFileHeader/encodeFrameRecord)。每个录制 session 一个 .bin 文件,
// 开头写 4B magic "RCD1",随后逐帧 append 原始字节。
//
// 主进程直接引用 src/ 下的纯函数(@/ 别名,tsconfig paths 已配,src-electron 在
// 根 tsconfig include 内)。业务判断(选哪些帧)在 renderer bridge(T8),本处只
// 负责 append + 滚动,不含业务规则(R6/R7)。
import { DiskRotationWriter, type RotationFileConfig, type RotationWriterStats } from './shared/disk-rotation-writer'
import { encodeFileHeader, encodeFrameRecord, type RecordingFrameRecord } from '@/features/recording/core/serialization'
import type { RecordingFrameInput } from '@/shared/platform-bridge'

class RecordingWriterImpl {
  private writer = new DiskRotationWriter({
    subDir: 'dongfanghong/recordings',
    filenamePrefix: 'rec_',
    extension: '.bin',
  })
  private headerWritten = false

  activate(fileConfig: RotationFileConfig): void {
    this.writer.activate(fileConfig)
    // 每个新文件写 magic 头(格式版本识别 + 解码时跳过首 4 字节)
    this.writer.writeItem(encodeFileHeader(), 0)
    this.headerWritten = true
  }

  deactivate(): void {
    this.writer.deactivate()
    this.headerWritten = false
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
      // reset 开了新文件,重写 magic 头
      this.writer.writeItem(encodeFileHeader(), 0)
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
