// 共享滚动写盘工具。从 storage-filter.ts 提取(L162-204 的 initializeWriteStream/
// checkRotation/cleanupOldFiles + stream-end + mkdirSync + Stats 接口),参数化
// 目录/前缀/扩展名/序列化器,供 storage-highspeed(T4 重构)和 recording(T3)复用,
// 消除 70-80% 结构性重复(spec §五.3)。
//
// 职责边界(R6/R7):本工具只管 append + 大小滚动 + stats,不含业务规则
// (storage-highspeed 的 pattern 匹配、recording 的选帧判断都在各自 feature)。
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { WriteStream } from 'node:fs'

export interface RotationFileConfig {
  /** 单文件大小上限(字节),达到则滚动开新文件。 */
  readonly maxFileSize: number
  /** 是否启用滚动。false 时单文件无限增长。 */
  readonly enableRotation: boolean
  /** 滚动保留的最近文件数(含当前),超出按 mtime 删最旧。 */
  readonly rotationCount: number
}

export interface RotationWriterStats {
  /** 已写条目数(storage 的帧 / recording 的帧)。 */
  readonly totalItemsStored: number
  /** 已写原始条目字节数(不含序列化膨胀,如 hex 翻倍)。 */
  readonly totalBytesStored: number
  /** 当前文件已写字节数(序列化后)。 */
  readonly currentFileSize: number
  /** 本次 activate 起的 ISO 时间。 */
  readonly startTime: string | null
  /** 最近一次 writeItem 的 ISO 时间。 */
  readonly lastTime: string | null
  /** 是否处于 activate 态(写盘中)。 */
  readonly isActive: boolean
}

interface RotationWriterOptions {
  /** userData 下的子目录,如 'dongfanghong/recordings'。 */
  readonly subDir: string
  /** 文件名前缀,如 'rec_' 或 'business_data_'。 */
  readonly filenamePrefix: string
  /** 文件扩展名(含点),如 '.bin' 或 '.txt'。 */
  readonly extension: string
}

const DEFAULT_STATS: RotationWriterStats = {
  totalItemsStored: 0,
  totalBytesStored: 0,
  currentFileSize: 0,
  startTime: null,
  lastTime: null,
  isActive: false,
}

export class DiskRotationWriter {
  private writeStream: WriteStream | null = null
  private currentFilePath = ''
  private fileConfig: RotationFileConfig = {
    maxFileSize: 100 * 1024 * 1024,
    enableRotation: true,
    rotationCount: 5,
  }
  private stats: RotationWriterStats = { ...DEFAULT_STATS }
  private readonly storageDir: string

  constructor(private readonly options: RotationWriterOptions) {
    this.storageDir = path.join(app.getPath('userData'), ...options.subDir.split('/'))
  }

  activate(fileConfig: RotationFileConfig): void {
    this.deactivate()
    this.fileConfig = { ...fileConfig }
    this.stats = {
      ...DEFAULT_STATS,
      startTime: new Date().toISOString(),
      isActive: true,
    }
    fs.mkdirSync(this.storageDir, { recursive: true })
    this.initializeWriteStream()
  }

  deactivate(): void {
    this.endStream()
    this.stats = { ...this.stats, isActive: false }
  }

  /** 写入一段已序列化字节 + 累加 stats + 触发滚动。返回是否触发了滚动。 */
  writeItem(serialized: Buffer | string, itemByteCount: number): boolean {
    if (!this.writeStream) return false
    this.writeStream.write(serialized)
    const writtenLen = typeof serialized === 'string' ? Buffer.byteLength(serialized) : serialized.length
    this.stats = {
      ...this.stats,
      totalItemsStored: this.stats.totalItemsStored + 1,
      totalBytesStored: this.stats.totalBytesStored + itemByteCount,
      currentFileSize: this.stats.currentFileSize + writtenLen,
      lastTime: new Date().toISOString(),
    }
    return this.checkRotation()
  }

  getStats(): RotationWriterStats {
    return { ...this.stats }
  }

  resetStats(): void {
    this.endStream()
    if (this.currentFilePath) {
      try { fs.unlinkSync(this.currentFilePath) } catch { /* ignore */ }
      this.currentFilePath = ''
    }
    const wasActive = this.stats.isActive
    this.stats = {
      ...DEFAULT_STATS,
      isActive: wasActive,
      startTime: wasActive ? new Date().toISOString() : null,
    }
    if (wasActive) this.initializeWriteStream()
  }

  updateConfig(config: Partial<RotationFileConfig>): void {
    if (config.maxFileSize !== undefined) this.fileConfig = { ...this.fileConfig, maxFileSize: config.maxFileSize }
    if (config.enableRotation !== undefined) this.fileConfig = { ...this.fileConfig, enableRotation: config.enableRotation }
    if (config.rotationCount !== undefined) this.fileConfig = { ...this.fileConfig, rotationCount: config.rotationCount }
  }

  cleanup(): void {
    this.endStream()
    this.stats = { ...this.stats, isActive: false }
  }

  private endStream(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
  }

  private initializeWriteStream(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${this.options.filenamePrefix}${timestamp}${this.options.extension}`
    this.currentFilePath = path.join(this.storageDir, filename)
    this.writeStream = fs.createWriteStream(this.currentFilePath, { flags: 'a' })
  }

  private checkRotation(): boolean {
    if (!this.fileConfig.enableRotation) return false
    if (this.stats.currentFileSize < this.fileConfig.maxFileSize) return false
    this.endStream()
    this.cleanupOldFiles()
    this.stats = { ...this.stats, currentFileSize: 0 }
    this.initializeWriteStream()
    return true
  }

  private cleanupOldFiles(): void {
    try {
      const prefix = this.options.filenamePrefix
      const ext = this.options.extension
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.startsWith(prefix) && f.endsWith(ext))
        .map(f => ({ name: f, time: fs.statSync(path.join(this.storageDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time)
      const toDelete = files.slice(this.fileConfig.rotationCount)
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(this.storageDir, f.name)) } catch { /* ignore */ }
      }
    } catch { /* ignore dir read errors */ }
  }
}
