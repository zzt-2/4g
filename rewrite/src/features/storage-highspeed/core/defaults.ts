import type { HighSpeedStorageConfig, HighSpeedStorageStats } from './types'

export const defaultConfig: HighSpeedStorageConfig = {
  enabled: false,
  maxFileSize: 100,
  enableRotation: true,
  rotationCount: 5,
}

export const defaultStats: HighSpeedStorageStats = {
  totalFramesStored: 0,
  totalBytesStored: 0,
  currentFileSize: 0,
  storageStartTime: null,
  lastStorageTime: null,
  isStorageActive: false,
}
