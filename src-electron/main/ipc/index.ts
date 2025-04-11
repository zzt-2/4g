import { setupWindowIPC } from './windowHandlers';
import { setupMenuIPC } from './menuHandlers';
import { registerFramesHandlers } from './framesHandlers';

export function setupIPC() {
  setupWindowIPC();
  setupMenuIPC();
  registerFramesHandlers(); // 注册帧处理程序
}
