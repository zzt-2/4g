export interface HighSpeedStorageConfig {
  readonly enabled: boolean
  readonly maxFileSize: number
  readonly enableRotation: boolean
  readonly rotationCount: number
}

export interface FrameHeaderRule {
  readonly id: string
  readonly connectionId: string
  readonly headerPatterns: readonly string[]
  readonly enabled: boolean
}

export type StorageStatus = 'disabled' | 'no-rule' | 'rule-disabled' | 'ready' | 'active'

export interface HighSpeedStorageStats {
  readonly totalFramesStored: number
  readonly totalBytesStored: number
  readonly currentFileSize: number
  readonly storageStartTime: string | null
  readonly lastStorageTime: string | null
  readonly isStorageActive: boolean
}

export interface HighSpeedStorageState {
  readonly config: HighSpeedStorageConfig
  readonly rule: FrameHeaderRule | null
  readonly stats: HighSpeedStorageStats
  readonly isLoading: boolean
  readonly lastError: string | null
}
