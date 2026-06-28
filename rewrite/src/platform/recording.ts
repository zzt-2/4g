// 录制平台 facade:把 RecordingBridge(IPC 通道)包装成 RecordingPlatformFacade,
// 供 recording-service(T6)调用。仿 storage.ts facade 模板。
import type {
  RecordingBridge,
  RecordingFrameInput,
  RecordingActivateRequest,
  RecordingStats,
  RecordingConfigUpdate,
} from '@/shared/platform-bridge'

export type { RecordingBridge, RecordingFrameInput, RecordingActivateRequest, RecordingStats, RecordingConfigUpdate }

export interface RecordingPlatformFacade {
  activate(request: RecordingActivateRequest): Promise<{ readonly ok: boolean; readonly error?: string }>
  deactivate(): Promise<{ readonly ok: boolean; readonly error?: string }>
  appendFrames(frames: readonly RecordingFrameInput[]): Promise<{ readonly ok: boolean; readonly error?: string }>
  getStats(): Promise<RecordingStats>
  reset(): Promise<{ readonly ok: boolean; readonly error?: string }>
  updateConfig(config: RecordingConfigUpdate): Promise<{ readonly ok: boolean; readonly error?: string }>
}

export function createRecordingFacade(bridge: RecordingBridge): RecordingPlatformFacade {
  return {
    activate: (request) => bridge.activate(request),
    deactivate: () => bridge.deactivate(),
    appendFrames: (frames) => bridge.appendFrames(frames),
    getStats: () => bridge.getStats(),
    reset: () => bridge.reset(),
    updateConfig: (config) => bridge.updateConfig(config),
  }
}
