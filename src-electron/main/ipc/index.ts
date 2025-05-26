import { setupWindowIPC } from './windowHandlers';
import { setupMenuIPC } from './menuHandlers';
import { setupSerialIPC } from './serialHandlers';
import { registerFileMetadataHandlers } from './fileMetadataHandlers';
import { registerStorageHandlers } from './dataStorageHandlers';

export function setupIPC() {
  setupWindowIPC();
  setupMenuIPC();
  registerStorageHandlers(); // 注册统一的数据存储处理程序
  setupSerialIPC(); // 注册串口处理程序
  registerFileMetadataHandlers();
}
