// 录制 feature 核心类型。
// RecordingFrameInput 的领域定义在此处(feature 是单一类型源)。
// platform-bridge.ts 里的同名类型是结构等价副本(shared 不能 import feature)。
// T3 的 recording-writer 入参用 @/shared/platform-bridge 的 RecordingFrameInput,
// 与此处结构等价(T5a 注释已说明保持字段一致)。
import type { RecordingStats } from '@/shared/platform-bridge'

export interface RecordingFrameInput {
  /** 帧捕获时间(epoch 秒)。 */
  readonly capturedAt: number
  readonly frameId: string
  readonly bytes: readonly number[]
}

export interface RecordingConfig {
  /** 选录哪些接收帧(frameId 级)。空数组 = 不录任何帧。 */
  readonly selectedFrameIds: readonly string[]
  /** 单文件大小上限(MB),达到则滚动。 */
  readonly maxFileSizeMb: number
  /** 是否启用滚动。 */
  readonly enableRotation: boolean
  /** 滚动保留的最近文件数(含当前)。 */
  readonly rotationCount: number
}

export interface RecordingState {
  readonly isRecording: boolean
  /** 本 session 已录帧数(内存计数,不等同磁盘持久化条数)。 */
  readonly recordCount: number
  /** 本次 start 的时间戳(ms),用于 UI 计时。 */
  readonly sessionStartTime: number | null
  /** 主进程回传的磁盘 stats(轮询更新)。 */
  readonly stats: RecordingStats | null
}
