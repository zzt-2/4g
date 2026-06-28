// 录制平台 facade:把 RecordingBridge(IPC 通道)包装成 RecordingPlatformFacade,
// 供 recording-service(T6)调用。仿 storage.ts facade 模板。
import type {
  RecordingBridge,
  RecordingFrameInput,
  RecordingActivateRequest,
  RecordingStats,
  RecordingConfigUpdate,
  RecordingFileMeta,
  RecordingReadResult,
} from '@/shared/platform-bridge'

export type {
  RecordingBridge,
  RecordingFrameInput,
  RecordingActivateRequest,
  RecordingStats,
  RecordingConfigUpdate,
  RecordingFileMeta,
  RecordingReadResult,
}

export interface RecordingPlatformFacade {
  activate(request: RecordingActivateRequest): Promise<{ readonly ok: boolean; readonly error?: string }>
  deactivate(): Promise<{ readonly ok: boolean; readonly error?: string }>
  appendFrames(frames: readonly RecordingFrameInput[]): Promise<{ readonly ok: boolean; readonly error?: string }>
  getStats(): Promise<RecordingStats>
  reset(): Promise<{ readonly ok: boolean; readonly error?: string }>
  updateConfig(config: RecordingConfigUpdate): Promise<{ readonly ok: boolean; readonly error?: string }>
  /** 列 recordings/ 目录下所有 .bin 文件元信息(按 mtime 降序)。History 页用。 */
  listRecordingFiles(): Promise<readonly RecordingFileMeta[]>
  /** 读单个 .bin 整文件字节(主进程读,防路径穿越)。renderer 端再解析。 */
  readRecordingFile(filePath: string): Promise<RecordingReadResult>
}

export function createRecordingFacade(bridge: RecordingBridge): RecordingPlatformFacade {
  return {
    activate: (request) => bridge.activate(request),
    deactivate: () => bridge.deactivate(),
    appendFrames: (frames) => bridge.appendFrames(frames),
    getStats: () => bridge.getStats(),
    reset: () => bridge.reset(),
    updateConfig: (config) => bridge.updateConfig(config),
    listRecordingFiles: () => bridge.listRecordingFiles(),
    readRecordingFile: (filePath) => bridge.readRecordingFile(filePath),
  }
}
