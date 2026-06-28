// storage-highspeed 的原始字节落盘过滤器。重构为 compose DiskRotationWriter(T2
// 共享工具),保留 storage-highspeed 专有的 shouldStore(pattern 匹配)和 toHexString
// (serializer 注入)。对外 Stats 形状不变(契约保持,映射 RotationWriterStats)。
//
// 历史写盘逻辑(initializeWriteStream/checkRotation/cleanupOldFiles)已上移到
// disk-rotation-writer.ts,与 recording-writer 复用(spec §五.3 去重)。
import {
  DiskRotationWriter,
  type RotationFileConfig,
  type RotationWriterStats,
} from './shared/disk-rotation-writer'

// storage-highspeed 沿用旧 Stats 形状(对外契约不变),内部映射到 RotationWriterStats。
export interface Stats {
  totalFramesStored: number
  totalBytesStored: number
  currentFileSize: number
  storageStartTime: string | null
  lastStorageTime: string | null
  isStorageActive: boolean
}

const toStats = (s: RotationWriterStats): Stats => ({
  totalFramesStored: s.totalItemsStored,
  totalBytesStored: s.totalBytesStored,
  currentFileSize: s.currentFileSize,
  storageStartTime: s.startTime,
  lastStorageTime: s.lastTime,
  isStorageActive: s.isActive,
})

export class StorageFilter {
  private connectionId: string | null = null
  private patterns: (readonly number[])[] = []
  // 复用共享写盘工具;hex 文本行 = storage-highspeed 专有格式(serializer 注入)。
  private writer = new DiskRotationWriter({
    subDir: 'dongfanghong/business-data',
    filenamePrefix: 'business_data_',
    extension: '.txt',
  })

  activate(request: {
    readonly connectionId: string
    readonly compiledPatterns: readonly (readonly number[])[]
    readonly fileConfig: { readonly maxFileSize: number; readonly enableRotation: boolean; readonly rotationCount: number }
  }): void {
    this.deactivate()
    this.connectionId = request.connectionId
    this.patterns = [...request.compiledPatterns.map(p => [...p])]
    this.writer.activate(request.fileConfig as RotationFileConfig)
  }

  deactivate(): void {
    this.writer.deactivate()
    this.connectionId = null
    this.patterns = []
  }

  shouldStore(connectionId: string, data: Buffer | readonly number[]): boolean {
    if (!this.connectionId || this.connectionId !== connectionId) return false
    if (this.patterns.length === 0) return false

    const len = data.length
    for (const pattern of this.patterns) {
      if (len < pattern.length) continue
      let match = true
      for (let i = 0; i < pattern.length; i++) {
        if (data[i] !== pattern[i]) {
          match = false
          break
        }
      }
      if (match) return true
    }
    return false
  }

  storeData(data: Buffer | readonly number[]): void {
    if (!this.connectionId) return
    const hex = this.toHexString(data)
    // hex + '\n' 一行,与原格式完全一致(hex 翻倍 + 换行符计入 currentFileSize)
    this.writer.writeItem(hex + '\n', data.length)
  }

  getStats(): Stats {
    return toStats(this.writer.getStats())
  }

  resetStats(): void {
    this.writer.resetStats()
  }

  updateConfig(config: { readonly maxFileSize?: number; readonly enableRotation?: boolean; readonly rotationCount?: number }): void {
    this.writer.updateConfig(config)
  }

  cleanup(): void {
    this.writer.cleanup()
    this.connectionId = null
    this.patterns = []
  }

  private toHexString(data: Buffer | readonly number[]): string {
    if (Buffer.isBuffer(data)) return data.toString('hex').toUpperCase()
    return Buffer.from(data as readonly number[]).toString('hex').toUpperCase()
  }
}

export const storageFilter = new StorageFilter()
