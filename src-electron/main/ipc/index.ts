import { setupWindowIPC } from './windowHandlers';
import { setupMenuIPC } from './menuHandlers';
import { setupSerialIPC } from './serialHandlers';
import { registerNetworkHandlers } from './networkHandlers';
import { registerFileMetadataHandlers } from './fileMetadataHandlers';
import { registerStorageHandlers } from './dataStorageHandlers';
import { registerCSVHandlers } from './csvHandlers';
import { registerReceiveHandlers } from './receiveHandlers';

export function setupIPC() {
  setupWindowIPC();
  setupMenuIPC();
  registerStorageHandlers(); // 注册统一的数据存储处理程序
  setupSerialIPC(); // 注册串口处理程序
  registerNetworkHandlers(); // 注册网络处理程序
  registerFileMetadataHandlers();
  registerCSVHandlers(); // 注册CSV处理程序
  registerReceiveHandlers(); // 注册接收数据处理程序
}
