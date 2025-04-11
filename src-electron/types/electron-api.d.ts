// 导入 preload API 的类型
import type { windowAPI } from '../preload/api/window';
import type { menuAPI } from '../preload/api/menu';
import type { bookMarkAPI } from '../preload/api/bookmark';
import type { categoryAPI } from '../preload/api/category';
import type { autoLaunchApi } from '../preload/api/autolaunch';
import type { framesAPI } from '../preload/api/frames';

export interface ElectronAPI {
  window: typeof windowAPI;
  menu: typeof menuAPI;
  bookmark: typeof bookMarkAPI;
  category: typeof categoryAPI;
  autoLaunch: typeof autoLaunchApi;
  frames: typeof framesAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
