import { contextBridge } from 'electron';
import { api } from './api';

// 添加类型检查
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api);
  } catch (error) {
    console.error('Electron API exposure failed:', error);
  }
}
