/**
 * 串口连接相关的组合式API
 */
import { useSerialStore } from '../../stores/serialStore';
import { storeToRefs } from 'pinia';
import type { SerialPortOptions } from '../../types/serial';

export const useSerialPort = () => {
  const serialStore = useSerialStore();

  // 从store中提取响应式状态
  const { availablePorts, selectedPort, connectionStatus, isConnecting, portOptions } =
    storeToRefs(serialStore);

  // 连接到串口
  const connect = async () => {
    if (!selectedPort.value) {
      throw new Error('未选择串口');
    }

    await serialStore.connect();
  };

  // 断开连接
  const disconnect = () => {
    serialStore.disconnect();
  };

  // 刷新可用端口
  const refreshPorts = async () => {
    await serialStore.refreshPorts();
  };

  // 更新串口选项
  const updatePortOptions = (options: Partial<SerialPortOptions>) => {
    serialStore.updatePortOptions(options);
  };

  return {
    // 状态
    availablePorts,
    selectedPort,
    connectionStatus,
    isConnecting,
    portOptions,

    // 方法
    connect,
    disconnect,
    refreshPorts,
    updatePortOptions,

    // Store方法
    selectPort: serialStore.selectPort,
  };
};
