// 录制服务:start/stop 状态机 + appendFrames(fire-and-forget IPC)+ config 读写。
// Set 缓存 selectedFrameIds 供 bridge O(1) 查询(config 变化时重建,避免每帧重建)。
import type { RecordingPlatformFacade } from '@/platform/recording'
import type { RecordingFrameInput, RecordingConfig, RecordingState, RecordingStats } from '../core'
import { DEFAULT_RECORDING_CONFIG } from '../core'
import type { RecordingStateContainer } from '../state/recording-state'
import { createRecordingState } from '../state/recording-state'

export interface RecordingService {
  getSnapshot(): RecordingState
  /** 返回当前选中的 frameId Set(O(1) 查询),供 bridge 用。 */
  getSelectedFrameIds(): Set<string>
  isRecording(): boolean
  setConfig(config: RecordingConfig): void
  getConfig(): RecordingConfig
  start(): Promise<void>
  stop(): Promise<void>
  /** 追加帧(fire-and-forget IPC)。累加内存计数。 */
  appendFrames(frames: readonly RecordingFrameInput[]): Promise<void>
  /** 轮询主进程磁盘 stats(供 UI 显示已存帧数/文件大小)。 */
  refreshStats(): Promise<void>
}

export interface CreateRecordingServiceOptions {
  readonly platformFacade: RecordingPlatformFacade
  readonly state?: RecordingStateContainer
}

export function createRecordingService(options: CreateRecordingServiceOptions): RecordingService {
  const state = options.state ?? createRecordingState()
  let config: RecordingConfig = { ...DEFAULT_RECORDING_CONFIG }
  // Set 缓存:config 变化时重建,避免 bridge 每帧重建 Set。
  let selectedSet = new Set(config.selectedFrameIds)

  return {
    getSnapshot: () => state.getSnapshot(),
    getSelectedFrameIds: () => selectedSet,
    isRecording: () => state.getSnapshot().isRecording,
    setConfig(next) {
      config = { ...next, selectedFrameIds: [...next.selectedFrameIds] }
      selectedSet = new Set(config.selectedFrameIds)
    },
    getConfig: () => ({ ...config, selectedFrameIds: [...config.selectedFrameIds] }),

    async start() {
      await options.platformFacade.activate({
        fileConfig: {
          maxFileSize: config.maxFileSizeMb * 1024 * 1024,
          enableRotation: config.enableRotation,
          rotationCount: config.rotationCount,
        },
      })
      state.setRecording(true)
    },

    async stop() {
      await options.platformFacade.deactivate()
      state.setRecording(false)
    },

    async appendFrames(frames) {
      if (frames.length === 0) return
      await options.platformFacade.appendFrames(frames)
      state.setRecordCount(state.getSnapshot().recordCount + frames.length)
    },

    async refreshStats() {
      const stats: RecordingStats = await options.platformFacade.getStats()
      state.setStats(stats)
    },
  }
}
