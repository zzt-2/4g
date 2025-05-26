// 导入 preload API 的类型
import type { APIModules } from '../preload/api';

// 使用APIModules类型自动生成ElectronAPI接口
export type ElectronAPI = APIModules;

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
