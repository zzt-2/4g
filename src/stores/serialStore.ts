import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { SerialPortInfo, SerialPortOptions, SerialMessage } from '../types/serial';

export const useSerialStore = defineStore('serial', () => {
  // 状态
  const availablePorts = ref<SerialPortInfo[]>([]);
  const selectedPort = ref<string | null>(null);
  const portOptions = ref<SerialPortOptions>({
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  });
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const lastError = ref<string | null>(null);
  const messages = ref<SerialMessage[]>([]);
  const isRecording = ref(false);
  const autoScroll = ref(true);

  // 计算属性
  const hasAvailablePorts = computed(() => availablePorts.value.length > 0);
  const selectedPortInfo = computed(() =>
    availablePorts.value.find((port) => port.path === selectedPort.value),
  );
  const connectionStatus = computed(() => {
    if (isConnected.value) return 'connected';
    if (isConnecting.value) return 'connecting';
    return 'disconnected';
  });

  // 方法
  const refreshPorts = async () => {
    try {
      // 在实际应用中，这里会调用Electron主进程API获取可用串口
      isConnecting.value = true;
      lastError.value = null;

      // 模拟获取串口列表
      setTimeout(() => {
        availablePorts.value = [
          {
            path: 'COM1',
            manufacturer: 'FTDI',
            serialNumber: '12345',
            vendorId: '0x0403',
            productId: '0x6001',
          },
          {
            path: 'COM2',
            manufacturer: 'Prolific',
            serialNumber: '67890',
            vendorId: '0x067B',
            productId: '0x2303',
          },
        ];
        isConnecting.value = false;
      }, 500);
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      isConnecting.value = false;
    }
  };

  const selectPort = (path: string) => {
    selectedPort.value = path;
  };

  const updatePortOptions = (options: Partial<SerialPortOptions>) => {
    portOptions.value = { ...portOptions.value, ...options };
  };

  const connect = async () => {
    if (!selectedPort.value) {
      lastError.value = '未选择串口';
      return;
    }

    try {
      isConnecting.value = true;
      lastError.value = null;

      // 在实际应用中，这里会调用Electron主进程API连接串口
      // 模拟连接过程
      setTimeout(() => {
        isConnected.value = true;
        isConnecting.value = false;
      }, 800);
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      isConnecting.value = false;
    }
  };

  const disconnect = async () => {
    try {
      // 在实际应用中，这里会调用Electron主进程API断开串口
      isConnected.value = false;
      lastError.value = null;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
    }
  };

  const sendData = async (data: Uint8Array | string, isHex = false) => {
    if (!isConnected.value) {
      lastError.value = '串口未连接';
      return;
    }

    try {
      // 数据处理逻辑
      const dataToSend =
        typeof data === 'string'
          ? isHex
            ? hexToBytes(data)
            : new TextEncoder().encode(data)
          : data;

      // 调用 API 发送数据
      await sendData(dataToSend, isHex);

      // 记录发送的消息
      const timestamp = new Date();
      messages.value.push({
        id: `tx-${Date.now()}`,
        direction: 'tx',
        timestamp,
        data: typeof data === 'string' ? data : bytesToHex(dataToSend),
        format: 'hex',
        rawData: dataToSend,
      });

      // 控制消息数量，避免内存泄漏
      if (messages.value.length > 1000) {
        messages.value = messages.value.slice(-1000);
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
    }
  };

  const clearMessages = () => {
    messages.value = [];
  };

  const toggleRecording = () => {
    isRecording.value = !isRecording.value;
  };

  const toggleAutoScroll = () => {
    autoScroll.value = !autoScroll.value;
  };

  // 处理接收到的数据（在实际应用中会被Electron主进程调用）
  const handleReceivedData = (data: string, rawData: Uint8Array) => {
    const timestamp = new Date();
    messages.value.push({
      id: `rx-${Date.now()}`,
      direction: 'rx',
      timestamp,
      data,
      format: 'hex', // 假设接收的数据总是以HEX格式显示
      rawData,
    });

    // 控制消息数量，避免内存泄漏
    if (messages.value.length > 1000) {
      messages.value = messages.value.slice(-1000);
    }
  };

  /**
   * 保存数据到文件
   * @param content 要保存的内容
   * @param fileName 文件名
   */
  const saveToFile = async (content: string, fileName: string) => {
    try {
      // 这里将通过IPC调用Electron主进程的保存文件API
      // 在真实环境中使用ipcRenderer.invoke
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('file:save', { content, fileName });
      return true;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      console.error('保存文件失败:', error);
      return false;
    }
  };

  return {
    // 状态
    availablePorts,
    selectedPort,
    portOptions,
    isConnected,
    isConnecting,
    lastError,
    messages,
    isRecording,
    autoScroll,

    // 计算属性
    hasAvailablePorts,
    selectedPortInfo,
    connectionStatus,

    // 方法
    refreshPorts,
    selectPort,
    updatePortOptions,
    connect,
    disconnect,
    sendData,
    clearMessages,
    toggleRecording,
    toggleAutoScroll,
    handleReceivedData,
    saveToFile,
  };
});
