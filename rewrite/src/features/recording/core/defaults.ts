import type { RecordingConfig } from './types'

// 录制默认配置。默认不选任何帧(用户必须在设置里选才录),单文件 100MB,
// 启用滚动保留 5 个文件(与 storage-highspeed 默认一致)。
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  selectedFrameIds: [],
  maxFileSizeMb: 100,
  enableRotation: true,
  rotationCount: 5,
}
