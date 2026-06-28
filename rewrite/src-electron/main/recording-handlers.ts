// 录制 IPC 处理:6 个粗粒度方法(activate/deactivate/append/getStats/reset/
// updateConfig),仿 storage-handlers.ts 模板。R6 粗粒度 IPC——不每帧一个 IPC,
// appendFrames 批量传。写盘在主进程 recordingWriter(T3),业务判断在 renderer(T8)。
import { ipcMain } from 'electron'
import { recordingWriter } from './recording-writer'
import type { RecordingFrameInput, RecordingStats } from '@/shared/platform-bridge'

const IPC_RECORDING_ACTIVATE = 'recording:activate'
const IPC_RECORDING_DEACTIVATE = 'recording:deactivate'
const IPC_RECORDING_APPEND = 'recording:append'
const IPC_RECORDING_GET_STATS = 'recording:get-stats'
const IPC_RECORDING_RESET = 'recording:reset'
const IPC_RECORDING_UPDATE_CONFIG = 'recording:update-config'

function ok(): { ok: boolean; error?: string } { return { ok: true } }
function fail(err: unknown): { ok: boolean; error?: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

function handleActivate(
  _e: Electron.IpcMainInvokeEvent,
  request: {
    readonly fileConfig: { readonly maxFileSize: number; readonly enableRotation: boolean; readonly rotationCount: number }
  },
): { ok: boolean; error?: string } {
  try { recordingWriter.activate(request.fileConfig); return ok() } catch (err) { return fail(err) }
}

function handleDeactivate(): { ok: boolean; error?: string } {
  try { recordingWriter.deactivate(); return ok() } catch (err) { return fail(err) }
}

function handleAppend(
  _e: Electron.IpcMainInvokeEvent,
  frames: readonly RecordingFrameInput[],
): { ok: boolean; error?: string } {
  try { recordingWriter.writeFrames(frames); return ok() } catch (err) { return fail(err) }
}

function handleGetStats(): RecordingStats {
  const s = recordingWriter.getStats()
  return {
    totalFramesStored: s.totalItemsStored,
    totalBytesStored: s.totalBytesStored,
    currentFileSize: s.currentFileSize,
    storageStartTime: s.startTime,
    lastStorageTime: s.lastTime,
    isStorageActive: s.isActive,
  }
}

function handleReset(): { ok: boolean; error?: string } {
  try { recordingWriter.resetStats(); return ok() } catch (err) { return fail(err) }
}

function handleUpdateConfig(
  _e: Electron.IpcMainInvokeEvent,
  config: { readonly maxFileSize?: number; readonly enableRotation?: boolean; readonly rotationCount?: number },
): { ok: boolean; error?: string } {
  try { recordingWriter.updateConfig(config); return ok() } catch (err) { return fail(err) }
}

export function registerRecordingHandlers(): void {
  ipcMain.handle(IPC_RECORDING_ACTIVATE, handleActivate)
  ipcMain.handle(IPC_RECORDING_DEACTIVATE, handleDeactivate)
  ipcMain.handle(IPC_RECORDING_APPEND, handleAppend)
  ipcMain.handle(IPC_RECORDING_GET_STATS, handleGetStats)
  ipcMain.handle(IPC_RECORDING_RESET, handleReset)
  ipcMain.handle(IPC_RECORDING_UPDATE_CONFIG, handleUpdateConfig)
}

export function cleanupRecordingHandlers(): void {
  ipcMain.removeHandler(IPC_RECORDING_ACTIVATE)
  ipcMain.removeHandler(IPC_RECORDING_DEACTIVATE)
  ipcMain.removeHandler(IPC_RECORDING_APPEND)
  ipcMain.removeHandler(IPC_RECORDING_GET_STATS)
  ipcMain.removeHandler(IPC_RECORDING_RESET)
  ipcMain.removeHandler(IPC_RECORDING_UPDATE_CONFIG)
}
