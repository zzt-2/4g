import { windowAPI } from './window';
import { menuAPI } from './menu';
import { autoLaunchApi } from './autolaunch';
import { serialAPI } from './serial';
import { framesAPI } from './frames';

export const api = {
  window: windowAPI,
  menu: menuAPI,
  autoLaunch: autoLaunchApi,
  serial: serialAPI,
  frames: framesAPI,
} as const; // 添加 as const 以确保类型正确
