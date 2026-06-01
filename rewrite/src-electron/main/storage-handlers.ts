import { ipcMain } from 'electron'
import { storageFilter } from './storage-filter'

const IPC_STORAGE_ACTIVATE = 'storage:activate'
const IPC_STORAGE_DEACTIVATE = 'storage:deactivate'
const IPC_STORAGE_GET_STATS = 'storage:get-stats'
const IPC_STORAGE_RESET = 'storage:reset'
const IPC_STORAGE_UPDATE_CONFIG = 'storage:update-config'

function handleActivate(
  _e: Electron.IpcMainInvokeEvent,
  request: {
    readonly connectionId: string
    readonly compiledPatterns: readonly (readonly number[])[]
    readonly fileConfig: { readonly maxFileSize: number; readonly enableRotation: boolean; readonly rotationCount: number }
  },
): { ok: boolean; error?: string } {
  try {
    storageFilter.activate(request)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function handleDeactivate(): { ok: boolean; error?: string } {
  try {
    storageFilter.deactivate()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function handleGetStats() {
  return storageFilter.getStats()
}

function handleReset(): { ok: boolean; error?: string } {
  try {
    storageFilter.resetStats()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function handleUpdateConfig(
  _e: Electron.IpcMainInvokeEvent,
  config: { readonly maxFileSize?: number; readonly enableRotation?: boolean; readonly rotationCount?: number },
): { ok: boolean; error?: string } {
  try {
    storageFilter.updateConfig(config)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerStorageHandlers(): void {
  ipcMain.handle(IPC_STORAGE_ACTIVATE, handleActivate)
  ipcMain.handle(IPC_STORAGE_DEACTIVATE, handleDeactivate)
  ipcMain.handle(IPC_STORAGE_GET_STATS, handleGetStats)
  ipcMain.handle(IPC_STORAGE_RESET, handleReset)
  ipcMain.handle(IPC_STORAGE_UPDATE_CONFIG, handleUpdateConfig)
}

export function cleanupStorageHandlers(): void {
  ipcMain.removeHandler(IPC_STORAGE_ACTIVATE)
  ipcMain.removeHandler(IPC_STORAGE_DEACTIVATE)
  ipcMain.removeHandler(IPC_STORAGE_GET_STATS)
  ipcMain.removeHandler(IPC_STORAGE_RESET)
  ipcMain.removeHandler(IPC_STORAGE_UPDATE_CONFIG)
}
