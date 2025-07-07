import { setupWindowIPC } from './windowHandlers';
import { setupMenuIPC } from './menuHandlers';
import { setupSerialIPC } from './serialHandlers';
import { registerNetworkHandlers } from './networkHandlers';
import { registerFileMetadataHandlers } from './fileMetadataHandlers';
import { registerStorageHandlers } from './dataStorageHandlers';
import { registerReceiveHandlers } from './receiveHandlers';
import { registerHighSpeedStorageHandlers } from './highSpeedStorageHandlers';
import { registerHistoryDataHandlers } from './historyDataHandlers';
import { registerTimerManagerHandlers } from './timerManagerHandlers';

export function setupIPC() {
  setupWindowIPC();
  setupMenuIPC();
  registerStorageHandlers(); // 注册统一的数据存储处理程序
  setupSerialIPC(); // 注册串口处理程序
  registerNetworkHandlers(); // 注册网络处理程序
  registerFileMetadataHandlers();
  registerReceiveHandlers(); // 注册接收数据处理程序
  registerHighSpeedStorageHandlers(); // 注册高速存储处理程序
  registerHistoryDataHandlers(); // 注册历史数据处理程序
  registerTimerManagerHandlers(); // 注册定时器管理处理程序
}
