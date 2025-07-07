import { windowAPI } from './window';
import { menuAPI } from './menu';
import { autoLaunchApi } from './autolaunch';
import { serialAPI } from './serial';
import { networkAPI } from './network';
import { filesAPI } from './files';
import { dataStorageAPI } from './dataStorage';
import { pathAPI } from './path';
import { receiveAPI } from './receive';
import { highSpeedStorageAPI } from './highSpeedStorage';
import { historyDataAPI } from './historyData';
import { timerManagerAPI } from './timerManager';

// 动态导入所有API模块
const apiModules = {
  window: windowAPI,
  menu: menuAPI,
  autoLaunch: autoLaunchApi,
  serial: serialAPI,
  network: networkAPI,
  files: filesAPI,
  dataStorage: dataStorageAPI,
  path: pathAPI,
  receive: receiveAPI,
  highSpeedStorage: highSpeedStorageAPI,
  historyData: historyDataAPI,
  timerManager: timerManagerAPI,
};

// 导出组合的API对象
export const api = apiModules;

// 导出API模块类型，以供类型声明使用
export type APIModules = typeof apiModules;
