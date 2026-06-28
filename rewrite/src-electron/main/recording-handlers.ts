// 录制 IPC 处理:8 个粗粒度方法(activate/deactivate/append/getStats/reset/
// updateConfig/listRecordingFiles/readRecordingFile),仿 storage-handlers.ts 模板。
// R6 粗粒度 IPC——不每帧一个 IPC,appendFrames 批量传。写盘在主进程 recordingWriter,
// 读盘(list/read)用 node:fs 直接读 recordings/ 目录(不经 writer),业务判断在 renderer。
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import { recordingWriter } from './recording-writer'
import type {
  RecordingFrameInput,
  RecordingStats,
  RecordingActivateRequest,
  RecordingFileMeta,
} from '@/shared/platform-bridge'

const IPC_RECORDING_ACTIVATE = 'recording:activate'
const IPC_RECORDING_DEACTIVATE = 'recording:deactivate'
const IPC_RECORDING_APPEND = 'recording:append'
const IPC_RECORDING_GET_STATS = 'recording:get-stats'
const IPC_RECORDING_RESET = 'recording:reset'
const IPC_RECORDING_UPDATE_CONFIG = 'recording:update-config'
const IPC_RECORDING_LIST_FILES = 'recording:list-files'
const IPC_RECORDING_READ_FILE = 'recording:read-file'

function ok(): { ok: boolean; error?: string } { return { ok: true } }
function fail(err: unknown): { ok: boolean; error?: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

// recordings/ 目录:{userData}/dongfanghong/recordings(与 disk-rotation-writer 的 subDir 一致)。
function recordingsDir(): string {
  return path.join(app.getPath('userData'), 'dongfanghong', 'recordings')
}

function handleActivate(
  _e: Electron.IpcMainInvokeEvent,
  request: RecordingActivateRequest,
): { ok: boolean; error?: string } {
  try {
    recordingWriter.activate(request.fileConfig, request.frameDefinitions ?? [])
    return ok()
  } catch (err) { return fail(err) }
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

// 列 recordings/ 目录下所有 .bin 文件元信息(按 mtime 降序)。History 页时间筛选用。
function handleListFiles(): { readonly files: readonly RecordingFileMeta[] } {
  const dir = recordingsDir()
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('rec_') && f.endsWith('.bin'))
      .map((f) => {
        const fp = path.join(dir, f)
        const stat = fs.statSync(fp)
        return { fileName: f, filePath: fp, byteLength: stat.size, mtimeMs: stat.mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { files }
  } catch {
    // 目录不存在或读失败 → 空列表(不崩,History 显示无数据)
    return { files: [] }
  }
}

// 读单个 .bin 整文件字节。安全校验:文件必须在 recordings 目录下 + 文件名匹配 rec_*.bin,
// 防路径穿越(恶意/误传 ../etc/passwd 等)。读失败返回 ok=false + error。
function handleReadFile(
  _e: Electron.IpcMainInvokeEvent,
  filePath: string,
): { readonly bytes: readonly number[]; readonly ok: boolean; readonly error?: string } {
  try {
    const dir = recordingsDir()
    const resolved = path.resolve(filePath)
    // 路径穿越防护:解析后必须在 recordings 目录内,且文件名匹配 rec_*.bin
    if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
      return { bytes: [], ok: false, error: 'path outside recordings dir' }
    }
    const base = path.basename(resolved)
    if (!base.startsWith('rec_') || !base.endsWith('.bin')) {
      return { bytes: [], ok: false, error: 'invalid filename' }
    }
    const buf = fs.readFileSync(resolved)
    return { bytes: Array.from(buf), ok: true }
  } catch (err) {
    return { bytes: [], ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerRecordingHandlers(): void {
  ipcMain.handle(IPC_RECORDING_ACTIVATE, handleActivate)
  ipcMain.handle(IPC_RECORDING_DEACTIVATE, handleDeactivate)
  ipcMain.handle(IPC_RECORDING_APPEND, handleAppend)
  ipcMain.handle(IPC_RECORDING_GET_STATS, handleGetStats)
  ipcMain.handle(IPC_RECORDING_RESET, handleReset)
  ipcMain.handle(IPC_RECORDING_UPDATE_CONFIG, handleUpdateConfig)
  ipcMain.handle(IPC_RECORDING_LIST_FILES, handleListFiles)
  ipcMain.handle(IPC_RECORDING_READ_FILE, handleReadFile)
}

export function cleanupRecordingHandlers(): void {
  ipcMain.removeHandler(IPC_RECORDING_ACTIVATE)
  ipcMain.removeHandler(IPC_RECORDING_DEACTIVATE)
  ipcMain.removeHandler(IPC_RECORDING_APPEND)
  ipcMain.removeHandler(IPC_RECORDING_GET_STATS)
  ipcMain.removeHandler(IPC_RECORDING_RESET)
  ipcMain.removeHandler(IPC_RECORDING_UPDATE_CONFIG)
  ipcMain.removeHandler(IPC_RECORDING_LIST_FILES)
  ipcMain.removeHandler(IPC_RECORDING_READ_FILE)
}
