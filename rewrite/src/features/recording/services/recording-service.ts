// 录制服务:start/stop 状态机 + appendFrames(fire-and-forget IPC)+ config 读写。
// Set 缓存 selectedFrameIds 供 bridge O(1) 查询(config 变化时重建,避免每帧重建)。
// start() 时从 frameReader 取选中帧的 FrameAsset 快照,序列化进 .bin 头部(防漂移)。
import type { RecordingPlatformFacade, RecordingFileMeta, RecordingReadResult } from '@/platform/recording'
import type { FrameAssetReader } from '@/features/frame'
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
  /** 列 recordings/ 目录下所有 .bin 文件元信息(History 页用)。代理 facade。 */
  listRecordingFiles(): Promise<readonly RecordingFileMeta[]>
  /** 读单个 .bin 整文件字节(History 页解析用)。代理 facade。 */
  readRecordingFile(filePath: string): Promise<RecordingReadResult>
}

export interface CreateRecordingServiceOptions {
  readonly platformFacade: RecordingPlatformFacade
  readonly frameReader: FrameAssetReader
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
      // 取选中帧的 FrameAsset 快照,序列化进 .bin 头部帧定义块(防漂移)。
      // frameReader 是静态源(R19),JSON.stringify 完整 FrameAsset。
      const selected = selectedSet
      const allFrames = options.frameReader.findFrames()
      const frameDefinitions = allFrames
        .filter((f) => selected.has(f.id))
        .map((f) => ({ frameId: f.id, frameAssetJson: JSON.stringify(f) }))
      await options.platformFacade.activate({
        fileConfig: {
          maxFileSize: config.maxFileSizeMb * 1024 * 1024,
          enableRotation: config.enableRotation,
          rotationCount: config.rotationCount,
        },
        frameDefinitions,
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

    async listRecordingFiles() {
      return options.platformFacade.listRecordingFiles()
    },

    async readRecordingFile(filePath) {
      return options.platformFacade.readRecordingFile(filePath)
    },
  }
}
