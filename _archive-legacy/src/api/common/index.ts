/**
 * API模块统一导出文件
 * 提供向后兼容的API导出，减少现有代码的修改量
 */

// 系统相关API
export { electronAPI, windowAPI, menuAPI, autoLaunchAPI } from './systemApi';

// 文件操作API
export { filesAPI } from './filesApi';

// 串口通信API
export { serialAPI } from './serialApi';

// 网络连接API
export { networkAPI } from './networkApi';

// 路径处理API
export { pathAPI } from './pathApi';

// 数据接收处理API
export { receiveAPI } from './receiveApi';

// 数据存储API
export { dataStorageAPI } from './dataStorageApi';

// 高速存储API
export { highSpeedStorageAPI } from './highSpeedStorageApi';

// 历史数据API
export { historyDataAPI } from './historyDataApi';

// 定时器管理API
export { timerManagerAPI } from './timerManagerApi';
