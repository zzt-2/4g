import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { WriteStream } from 'node:fs'

interface FileConfig {
  maxFileSize: number
  enableRotation: boolean
  rotationCount: number
}

interface Stats {
  totalFramesStored: number
  totalBytesStored: number
  currentFileSize: number
  storageStartTime: string | null
  lastStorageTime: string | null
  isStorageActive: boolean
}

export class StorageFilter {
  private connectionId: string | null = null
  private patterns: (readonly number[])[] = []
  private writeStream: WriteStream | null = null
  private currentFilePath = ''
  private fileConfig: FileConfig = {
    maxFileSize: 100 * 1024 * 1024,
    enableRotation: true,
    rotationCount: 5,
  }
  private stats: Stats = {
    totalFramesStored: 0,
    totalBytesStored: 0,
    currentFileSize: 0,
    storageStartTime: null,
    lastStorageTime: null,
    isStorageActive: false,
  }
  private storageDir: string

  constructor() {
    this.storageDir = path.join(app.getPath('userData'), 'dongfanghong', 'business-data')
  }

  activate(request: {
    readonly connectionId: string
    readonly compiledPatterns: readonly (readonly number[])[]
    readonly fileConfig: { readonly maxFileSize: number; readonly enableRotation: boolean; readonly rotationCount: number }
  }): void {
    this.deactivate()

    this.connectionId = request.connectionId
    this.patterns = [...request.compiledPatterns.map(p => [...p])]
    this.fileConfig = { ...request.fileConfig }

    this.stats = {
      totalFramesStored: 0,
      totalBytesStored: 0,
      currentFileSize: 0,
      storageStartTime: new Date().toISOString(),
      lastStorageTime: null,
      isStorageActive: true,
    }

    fs.mkdirSync(this.storageDir, { recursive: true })
    this.initializeWriteStream()
  }

  deactivate(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
    this.connectionId = null
    this.patterns = []
    this.stats.isStorageActive = false
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
    if (!this.writeStream) return

    const hex = this.toHexString(data)
    this.writeStream.write(hex + '\n')

    this.stats.totalFramesStored++
    this.stats.totalBytesStored += data.length
    this.stats.currentFileSize += hex.length + 1
    this.stats.lastStorageTime = new Date().toISOString()

    this.checkRotation()
  }

  getStats(): Stats {
    return { ...this.stats }
  }

  resetStats(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }

    if (this.currentFilePath) {
      try {
        fs.unlinkSync(this.currentFilePath)
      } catch {
        // ignore if file doesn't exist
      }
      this.currentFilePath = ''
    }

    this.stats = {
      totalFramesStored: 0,
      totalBytesStored: 0,
      currentFileSize: 0,
      storageStartTime: null,
      lastStorageTime: null,
      isStorageActive: this.connectionId !== null,
    }

    if (this.connectionId) {
      this.stats.storageStartTime = new Date().toISOString()
      this.initializeWriteStream()
    }
  }

  updateConfig(config: { readonly maxFileSize?: number; readonly enableRotation?: boolean; readonly rotationCount?: number }): void {
    if (config.maxFileSize !== undefined) this.fileConfig.maxFileSize = config.maxFileSize
    if (config.enableRotation !== undefined) this.fileConfig.enableRotation = config.enableRotation
    if (config.rotationCount !== undefined) this.fileConfig.rotationCount = config.rotationCount
  }

  cleanup(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
    this.connectionId = null
    this.patterns = []
    this.stats.isStorageActive = false
  }

  private initializeWriteStream(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `business_data_${timestamp}.txt`
    this.currentFilePath = path.join(this.storageDir, filename)
    this.writeStream = fs.createWriteStream(this.currentFilePath, { flags: 'a' })
  }

  private checkRotation(): void {
    if (!this.fileConfig.enableRotation) return
    if (this.stats.currentFileSize < this.fileConfig.maxFileSize) return

    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }

    this.cleanupOldFiles()
    this.stats.currentFileSize = 0
    this.initializeWriteStream()
  }

  private cleanupOldFiles(): void {
    try {
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.startsWith('business_data_') && f.endsWith('.txt'))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(this.storageDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time)

      const toDelete = files.slice(this.fileConfig.rotationCount)
      for (const f of toDelete) {
        try {
          fs.unlinkSync(path.join(this.storageDir, f.name))
        } catch {
          // ignore individual delete errors
        }
      }
    } catch {
      // ignore directory read errors
    }
  }

  private toHexString(data: Buffer | readonly number[]): string {
    if (Buffer.isBuffer(data)) return data.toString('hex').toUpperCase()
    return Buffer.from(data as readonly number[]).toString('hex').toUpperCase()
  }
}

export const storageFilter = new StorageFilter()
