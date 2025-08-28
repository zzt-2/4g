/**
 * 串口操作相关的状态管理
 * 基于Pinia和VueUse构建
 */
import { defineStore } from 'pinia';
import { ref, computed, onUnmounted } from 'vue';
import { useStorage, useDebounceFn } from '@vueuse/core';
import { serialAPI } from '../api/common';
import { frameToBuffer } from '../utils/frames/frameInstancesUtils';
import type {
  SerialPortInfo,
  SerialPortOptions,
  SerialStatus,
  ConnectionStatus,
  MessageFormat,
  MultiPortOperationResult,
} from '../types/serial/serial';
import type { SendFrameInstance } from '../types/frames/sendInstances';
import { useReceiveFramesStore } from './frames/receiveFramesStore';

// 默认串口配置
const DEFAULT_OPTIONS: SerialPortOptions = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
  autoOpen: false,
};

// 创建串口Store
export const useSerialStore = defineStore('serial', () => {
  // 获取接收帧处理Store
  const receiveFramesStore = useReceiveFramesStore();
  // 可用串口列表
  const availablePorts = ref<SerialPortInfo[]>([]);

  // 加载状态
  const isLoading = ref(false);

  // 各串口连接状态映射
  const portConnectionStatuses = ref<Record<string, ConnectionStatus>>({});

  // 各串口错误信息
  const portErrorMessages = ref<Record<string, string>>({});

  // 活跃的串口列表（已连接的）
  const activePorts = ref<string[]>([]);

  // 上次使用的串口（用于默认选择）
  const lastUsedPort = useStorage<string>('last-used-port', '');

  // 串口配置映射 (为每个串口保存独立配置)
  const portSerialOptions = useStorage<Record<string, SerialPortOptions>>('serial-options-map', {});

  // 全局默认串口配置 (用于新串口)
  const defaultSerialOptions = useStorage<SerialPortOptions>('default-serial-options', {
    ...DEFAULT_OPTIONS,
  });

  // 接收到的数据映射 (按串口分类)
  const receivedMessagesMap = ref<
    Record<
      string,
      Array<{
        id: string;
        timestamp: number;
        data: Uint8Array;
        direction: 'received';
        portPath: string;
        format?: MessageFormat;
      }>
    >
  >({});

  // 发送的数据记录映射 (按串口分类)
  const sentMessagesMap = ref<
    Record<
      string,
      Array<{
        id: string;
        timestamp: number;
        data: Uint8Array;
        direction: 'sent';
        portPath: string;
        format?: MessageFormat;
      }>
    >
  >({});

  // 串口详细状态映射
  const portStatuses = ref<Record<string, SerialStatus>>({});

  // 自动滚动接收区
  const autoScroll = ref(true);

  // 监听器清理函数映射 (按串口管理)
  const listenerCleanupFunctions = ref<Record<string, Array<(() => void) | undefined>>>({});

  // 计算属性：是否至少有一个串口已连接
  const hasConnectedPort = computed(() =>
    Object.values(portConnectionStatuses.value).some((status) => status === 'connected'),
  );

  // 计算属性：按串口返回连接状态
  const isPortConnected = computed(
    () => (portPath: string) => portConnectionStatuses.value[portPath] === 'connected',
  );

  // 计算属性：某个串口接收的字节数
  const portReceivedBytes = computed(
    () => (portPath: string) => portStatuses.value[portPath]?.bytesReceived || 0,
  );

  // 计算属性：某个串口发送的字节数
  const portSentBytes = computed(
    () => (portPath: string) => portStatuses.value[portPath]?.bytesSent || 0,
  );

  // 计算属性：所有串口接收的总字节数
  const totalReceivedBytes = computed(() =>
    Object.values(portStatuses.value).reduce((sum, status) => sum + (status.bytesReceived || 0), 0),
  );

  // 计算属性：所有串口发送的总字节数
  const totalSentBytes = computed(() =>
    Object.values(portStatuses.value).reduce((sum, status) => sum + (status.bytesSent || 0), 0),
  );

  /**
   * 刷新可用串口列表
   * @param forceRefresh 是否强制刷新，不使用缓存
   */
  async function refreshPorts(forceRefresh = false) {
    isLoading.value = true;

    try {
      availablePorts.value = await serialAPI.listPorts(forceRefresh);

      // 更新串口状态信息
      const allStatus = await serialAPI.getAllStatus();
      if (allStatus) {
        for (const [portPath, status] of Object.entries(allStatus)) {
          updatePortStatus(portPath, status as SerialStatus);
        }
      }
    } catch (error) {
      console.error('获取串口列表失败', error);

      // 不设置全局错误，因为现在每个串口有独立的错误状态
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 连接串口
   * @param portPath 要连接的串口路径
   * @returns 操作是否成功
   */
  async function connectPort(portPath: string) {
    if (!portPath) {
      setPortError(portPath, '串口路径不能为空');
      return false;
    }

    // 更新状态
    isLoading.value = true;
    setPortConnectionStatus(portPath, 'connecting');
    clearPortError(portPath);

    try {
      // 获取串口配置，如果没有则使用默认配置
      const options = portSerialOptions.value[portPath] || defaultSerialOptions.value;

      // 连接串口
      const result = await serialAPI.open(portPath, options);

      if (result && result.success) {
        // 连接成功
        setPortConnectionStatus(portPath, 'connected');

        // 记录最后使用的串口
        lastUsedPort.value = portPath;

        // 添加到活跃串口列表
        if (!activePorts.value.includes(portPath)) {
          activePorts.value.push(portPath);
        }

        // 设置监听器
        setupPortListeners(portPath);
        return true;
      } else {
        // 连接失败
        setPortConnectionStatus(portPath, 'error');
        setPortError(portPath, (result && result.message) || '连接串口失败');
        return false;
      }
    } catch (error) {
      // 处理异常
      setPortConnectionStatus(portPath, 'error');
      console.error(`连接串口 ${portPath} 失败`, error);
      setPortError(portPath, error instanceof Error ? error.message : '连接串口失败');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 断开指定串口连接
   * @param portPath 串口路径
   * @returns 操作是否成功
   */
  async function disconnectPort(portPath: string) {
    if (portConnectionStatuses.value[portPath] !== 'connected') {
      return true; // 已经是断开状态
    }

    isLoading.value = true;

    try {
      const result = await serialAPI.close(portPath);

      // 清理监听器
      cleanupPortListeners(portPath);

      // 更新状态
      setPortConnectionStatus(portPath, 'disconnected');

      // 从活跃串口列表中移除
      activePorts.value = activePorts.value.filter((p) => p !== portPath);

      return result && result.success;
    } catch (error) {
      console.error(`断开串口 ${portPath} 失败`, error);
      setPortError(portPath, error instanceof Error ? error.message : '断开串口失败');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 断开所有已连接的串口
   * @returns 操作结果列表
   */
  async function disconnectAllPorts() {
    const results: MultiPortOperationResult[] = [];
    isLoading.value = true;

    try {
      // 使用API一次性断开所有串口
      const closeResults = await serialAPI.closeAll();

      // 处理返回结果
      if (Array.isArray(closeResults)) {
        for (const result of closeResults) {
          const portPath = result.portPath;

          // 清理监听器
          cleanupPortListeners(portPath);

          // 更新状态
          setPortConnectionStatus(portPath, 'disconnected');

          results.push(result);
        }
      }

      // 清空活跃串口列表
      activePorts.value = [];

      return results;
    } catch (error) {
      console.error('断开所有串口失败', error);
      return [
        {
          portPath: 'all',
          success: false,
          message: error instanceof Error ? error.message : '断开所有串口失败',
        },
      ];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 设置串口参数
   * @param portPath 串口路径
   * @param options 串口配置
   */
  async function setPortOptions(portPath: string, options: SerialPortOptions) {
    // 保存配置到存储
    portSerialOptions.value = {
      ...portSerialOptions.value,
      [portPath]: options,
    };

    // 如果串口已连接，则应用新配置
    if (isPortConnected.value(portPath)) {
      try {
        return await serialAPI.setOptions(portPath, options);
      } catch (error) {
        console.error(`设置串口 ${portPath} 参数失败`, error);
        setPortError(portPath, error instanceof Error ? error.message : '设置串口参数失败');
        return { success: false, message: '设置串口参数失败' };
      }
    }

    return { success: true, message: '参数已保存，将在下次连接时应用' };
  }

  /**
   * 设置串口连接状态
   * @param portPath 串口路径
   * @param status 连接状态
   */
  function setPortConnectionStatus(portPath: string, status: ConnectionStatus) {
    portConnectionStatuses.value = {
      ...portConnectionStatuses.value,
      [portPath]: status,
    };
  }

  /**
   * 设置串口错误信息
   * @param portPath 串口路径
   * @param error 错误信息
   */
  function setPortError(portPath: string, error: string) {
    portErrorMessages.value = {
      ...portErrorMessages.value,
      [portPath]: error,
    };
  }

  /**
   * 清除串口错误信息
   * @param portPath 串口路径
   */
  function clearPortError(portPath: string) {
    const newErrors = { ...portErrorMessages.value };
    delete newErrors[portPath];
    portErrorMessages.value = newErrors;
  }

  /**
   * 更新串口状态
   * @param portPath 串口路径
   * @param status 串口状态
   */
  function updatePortStatus(portPath: string, status: SerialStatus) {
    portStatuses.value = {
      ...portStatuses.value,
      [portPath]: status,
    };

    // 如果串口已断开，更新连接状态
    if (!status.isOpen && portConnectionStatuses.value[portPath] === 'connected') {
      setPortConnectionStatus(portPath, 'disconnected');

      // 从活跃串口列表中移除
      activePorts.value = activePorts.value.filter((p) => p !== portPath);
    }

    // 如果有错误，更新错误信息
    if (status.error) {
      setPortError(portPath, status.error);
      if (portConnectionStatuses.value[portPath] === 'connected') {
        setPortConnectionStatus(portPath, 'error');
      }
    }
  }

  /**
   * 设置串口监听器
   * @param portPath 串口路径
   */
  function setupPortListeners(portPath: string) {
    // 清理之前的监听器
    cleanupPortListeners(portPath);

    // 确保有清理函数数组
    if (!listenerCleanupFunctions.value[portPath]) {
      listenerCleanupFunctions.value[portPath] = [];
    }

    // 数据监听
    const dataListener = serialAPI.onData((data) => {
      // 过滤只处理来自指定串口的数据
      if (data.portPath === portPath) {
        // 确保有消息数组
        if (!receivedMessagesMap.value[portPath]) {
          receivedMessagesMap.value[portPath] = [];
        }

        // 添加接收到的数据（保持原有功能）
        receivedMessagesMap.value[portPath].push({
          id: generateId(),
          timestamp: Date.now(),
          data: new Uint8Array(data.data),
          direction: 'received',
          portPath,
        });

        // 限制消息数量
        if (receivedMessagesMap.value[portPath].length > 100) {
          receivedMessagesMap.value[portPath].shift();
        }

        // 统一数据接收处理 - 调用接收帧处理
        try {
          receiveFramesStore.handleReceivedData('serial', portPath, new Uint8Array(data.data));
        } catch (error) {
          console.error('统一数据接收处理失败:', error);
        }
      }
    });

    // 发送数据监听
    const sentDataListener = serialAPI.onDataSent((data) => {
      // 过滤只处理来自指定串口的数据
      if (data.portPath === portPath) {
        // 确保有消息数组
        if (!sentMessagesMap.value[portPath]) {
          sentMessagesMap.value[portPath] = [];
        }

        // 添加发送的数据
        sentMessagesMap.value[portPath].push({
          id: generateId(),
          timestamp: Date.now(),
          data: new Uint8Array(data.data),
          direction: 'sent',
          portPath,
        });

        // 限制消息数量
        if (sentMessagesMap.value[portPath].length > 100) {
          sentMessagesMap.value[portPath].shift();
        }
      }
    });

    // 状态监听 - 添加500ms防抖
    const debouncedStatusUpdate = useDebounceFn((data) => {
      // 过滤只处理来自指定串口的状态
      if (data.portPath === portPath) {
        updatePortStatus(portPath, data.status);
      }
    }, 500);

    const statusListener = serialAPI.onStatusChange(debouncedStatusUpdate);

    // 所有串口状态变化监听 - 添加500ms防抖
    const debouncedAllStatusUpdate = useDebounceFn((statusMap: Record<string, SerialStatus>) => {
      for (const [path, status] of Object.entries(statusMap)) {
        updatePortStatus(path, status);
      }
    }, 500);

    const allStatusListener = serialAPI.onAllStatusChange(debouncedAllStatusUpdate);

    // 保存清理函数
    if (typeof dataListener === 'function') {
      listenerCleanupFunctions.value[portPath].push(dataListener);
    }
    if (typeof sentDataListener === 'function') {
      listenerCleanupFunctions.value[portPath].push(sentDataListener);
    }
    if (typeof statusListener === 'function') {
      listenerCleanupFunctions.value[portPath].push(statusListener);
    }
    if (typeof allStatusListener === 'function') {
      listenerCleanupFunctions.value[portPath].push(allStatusListener);
    }
  }

  /**
   * 清理串口监听器
   * @param portPath 串口路径
   */
  function cleanupPortListeners(portPath: string) {
    const cleanups = listenerCleanupFunctions.value[portPath] || [];

    // 执行所有清理函数
    for (const cleanup of cleanups) {
      if (typeof cleanup === 'function') {
        try {
          cleanup();
        } catch (err) {
          console.error(`清理串口 ${portPath} 监听器时出错:`, err);
        }
      }
    }

    // 清空清理函数列表
    listenerCleanupFunctions.value[portPath] = [];
  }

  /**
   * 向指定串口发送文本数据
   * @param portPath 串口路径
   * @param text 要发送的文本
   * @param isHex 是否为十六进制字符串
   */
  async function sendText(portPath: string, text: string, isHex: boolean = false) {
    if (!isPortConnected.value(portPath)) {
      setPortError(portPath, '串口未连接');
      return false;
    }

    try {
      // 发送数据
      const result = await serialAPI.write(portPath, text, isHex);

      // 不需要手动记录发送的数据，因为已经通过onDataSent监听处理

      return result && result.success;
    } catch (error) {
      console.error(`向串口 ${portPath} 发送数据失败`, error);
      setPortError(portPath, error instanceof Error ? error.message : '发送数据失败');
      return false;
    }
  }

  /**
   * 向指定串口发送二进制数据
   * @param portPath 串口路径
   * @param data Uint8Array二进制数据
   */
  async function sendBinary(portPath: string, data: Uint8Array) {
    if (!isPortConnected.value(portPath)) {
      setPortError(portPath, '串口未连接');
      return false;
    }

    try {
      // 发送数据
      const result = await serialAPI.sendData(portPath, data);

      // 不需要手动记录发送的数据，因为已经通过onDataSent监听处理

      return result && result.success;
    } catch (error) {
      console.error(`向串口 ${portPath} 发送数据失败`, error);
      setPortError(portPath, error instanceof Error ? error.message : '发送数据失败');
      return false;
    }
  }

  /**
   * 向指定串口发送帧实例
   * @param portPath 串口路径
   * @param frameInstance 帧实例
   */
  async function sendFrameInstance(portPath: string, frameInstance: SendFrameInstance) {
    if (!isPortConnected.value(portPath)) {
      setPortError(portPath, '串口未连接');
      return false;
    }

    try {
      // 将帧实例转换为二进制数据
      const buffer = frameToBuffer(frameInstance);

      console.log('发送帧:', buffer, '到串口:', portPath);

      // 发送数据
      return await sendBinary(portPath, buffer);
    } catch (error) {
      console.error(`向串口 ${portPath} 发送帧数据失败`, error);
      setPortError(portPath, error instanceof Error ? error.message : '发送帧数据失败');
      return false;
    }
  }

  /**
   * 清空指定串口接收缓冲区
   * @param portPath 串口路径
   */
  async function clearBuffer(portPath: string) {
    try {
      await serialAPI.clearBuffer(portPath);
      return true;
    } catch (error) {
      console.error(`清空串口 ${portPath} 缓冲区失败`, error);
      return false;
    }
  }

  /**
   * 清空指定串口接收历史
   * @param portPath 串口路径
   */
  function clearReceivedHistory(portPath: string) {
    receivedMessagesMap.value = {
      ...receivedMessagesMap.value,
      [portPath]: [],
    };
  }

  /**
   * 清空指定串口发送历史
   * @param portPath 串口路径
   */
  function clearSentHistory(portPath: string) {
    sentMessagesMap.value = {
      ...sentMessagesMap.value,
      [portPath]: [],
    };
  }

  /**
   * 清空所有串口接收历史
   */
  function clearAllReceivedHistory() {
    receivedMessagesMap.value = {};
  }

  /**
   * 清空所有串口发送历史
   */
  function clearAllSentHistory() {
    sentMessagesMap.value = {};
  }

  /**
   * 获取指定串口的接收消息列表
   * @param portPath 串口路径
   * @returns 消息列表
   */
  function getReceivedMessages(portPath: string) {
    return receivedMessagesMap.value[portPath] || [];
  }

  /**
   * 获取指定串口的发送消息列表
   * @param portPath 串口路径
   * @returns 消息列表
   */
  function getSentMessages(portPath: string) {
    return sentMessagesMap.value[portPath] || [];
  }

  /**
   * 获取所有端口的消息(展平为单一数组)
   * @param includeReceived 是否包含接收消息
   * @param includeSent 是否包含发送消息
   * @returns 所有消息的展平数组
   */
  function getAllMessages(includeReceived = true, includeSent = true) {
    const allMessages = [];

    if (includeReceived) {
      for (const portMessages of Object.values(receivedMessagesMap.value)) {
        allMessages.push(...portMessages);
      }
    }

    if (includeSent) {
      for (const portMessages of Object.values(sentMessagesMap.value)) {
        allMessages.push(...portMessages);
      }
    }

    // 按时间戳排序
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 生成唯一ID
   * 简单实现，实际项目中可使用nanoid或uuid库
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * 十六进制字符串转Uint8Array
   * @param hexString 十六进制字符串，例如"0A1B2C"或"0A 1B 2C"
   * @returns Uint8Array
   */
  function hexStringToUint8Array(hexString: string): Uint8Array {
    // 移除空格和0x前缀
    const cleanHex = hexString.replace(/(\s|0x)/g, '');

    // 确保是偶数长度
    const paddedHex = cleanHex.length % 2 ? '0' + cleanHex : cleanHex;

    // 将十六进制字符串转换为Uint8Array
    const bytes = new Uint8Array(paddedHex.length / 2);
    for (let i = 0; i < paddedHex.length; i += 2) {
      bytes[i / 2] = parseInt(paddedHex.substring(i, i + 2), 16);
    }

    return bytes;
  }

  // 初始化：加载串口列表
  refreshPorts();

  // 组件卸载时清理
  onUnmounted(() => {
    // 断开所有串口连接
    disconnectAllPorts();

    // 清理所有监听器
    for (const portPath in listenerCleanupFunctions.value) {
      cleanupPortListeners(portPath);
    }
  });

  // 返回store暴露的内容
  return {
    // 状态
    availablePorts,
    isLoading,
    portConnectionStatuses,
    portErrorMessages,
    activePorts,
    lastUsedPort,
    portSerialOptions,
    defaultSerialOptions,
    receivedMessagesMap,
    sentMessagesMap,
    portStatuses,
    autoScroll,

    // 计算属性
    hasConnectedPort,
    isPortConnected,
    portReceivedBytes,
    portSentBytes,
    totalReceivedBytes,
    totalSentBytes,

    // 操作方法
    refreshPorts,
    connectPort,
    disconnectPort,
    disconnectAllPorts,
    setPortOptions,
    sendText,
    sendBinary,
    sendFrameInstance,
    clearBuffer,
    clearReceivedHistory,
    clearSentHistory,
    clearAllReceivedHistory,
    clearAllSentHistory,
    getReceivedMessages,
    getSentMessages,
    getAllMessages,

    // 状态管理辅助方法
    setPortConnectionStatus,
    setPortError,
    clearPortError,
    updatePortStatus,

    // 工具方法
    hexStringToUint8Array,
  };
});
