import { windowAPI } from './window';
import { menuAPI } from './menu';
import { autoLaunchApi } from './autolaunch';
import { serialAPI } from './serial';
import { filesAPI } from './files';
import { dataStorageAPI } from './dataStorage';
import { pathAPI } from './path';

// 动态导入所有API模块
const apiModules = {
  window: windowAPI,
  menu: menuAPI,
  autoLaunch: autoLaunchApi,
  serial: serialAPI,
  files: filesAPI,
  dataStorage: dataStorageAPI,
  path: pathAPI,
};

// 导出组合的API对象
export const api = apiModules;

// 导出API模块类型，以供类型声明使用
export type APIModules = typeof apiModules;
