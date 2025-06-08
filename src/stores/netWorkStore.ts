/**
 * 网络连接状态管理Store
 * 管理网络连接的状态、数据监听和连接操作
 */

import { defineStore } from 'pinia';
import { ref, computed, onUnmounted, readonly } from 'vue';
import { networkAPI } from '../utils/electronApi';
import { useReceiveFramesStore } from './frames/receiveFramesStore';
import type {
  NetworkConnection,
  NetworkConnectionConfig,
  NetworkStatus,
  NetworkOperationResult,
  NetworkConnectionOptions,
} from '../types/serial/network';

export const useNetworkStore = defineStore('network', () => {
  // ==================== 状态定义 ====================

  const connections = ref<NetworkConnection[]>([]);
  const connectionStats = ref<Record<string, NetworkStatus>>({});
  const isConnecting = ref<Record<string, boolean>>({});
  const lastError = ref<string | null>(null);

  // 数据监听清理函数
  const dataListenerCleanup = ref<(() => void) | null>(null);
  const connectionEventCleanup = ref<(() => void) | null>(null);
  const statusChangeCleanup = ref<(() => void) | null>(null);

  // ==================== 计算属性 ====================

  const connectedConnections = computed(() => connections.value.filter((conn) => conn.isConnected));

  const availableConnections = computed(() =>
    connections.value.filter((conn) => conn.status !== 'error'),
  );

  const connectionCount = computed(() => connections.value.length);

  const connectedCount = computed(() => connectedConnections.value.length);

  const hasActiveConnections = computed(() => connectedCount.value > 0);

  // ==================== 网络连接管理 ====================

  /**
   * 创建网络连接
   */
  const connect = async (
    config: NetworkConnectionConfig,
    options?: NetworkConnectionOptions,
  ): Promise<NetworkOperationResult> => {
    try {
      isConnecting.value[config.id] = true;
      lastError.value = null;

      const result = await networkAPI.connect(config, options);

      if (result.success) {
        await refreshConnections();
      } else {
        lastError.value = result.error || '连接失败';
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '连接失败';
      lastError.value = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      isConnecting.value[config.id] = false;
    }
  };

  /**
   * 断开网络连接
   */
  const disconnect = async (connectionId: string): Promise<NetworkOperationResult> => {
    try {
      lastError.value = null;

      const result = await networkAPI.disconnect(connectionId);

      if (result.success) {
        // 从本地状态中移除连接
        connections.value = connections.value.filter((conn) => conn.id !== connectionId);
        delete connectionStats.value[connectionId];
        delete isConnecting.value[connectionId];
      } else {
        lastError.value = result.error || '断开连接失败';
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '断开连接失败';
      lastError.value = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * 发送数据到指定连接
   */
  const sendData = async (
    connectionId: string,
    data: Uint8Array,
  ): Promise<NetworkOperationResult> => {
    try {
      lastError.value = null;

      const result = await networkAPI.send(connectionId, data);

      if (!result.success) {
        lastError.value = result.error || '发送数据失败';
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发送数据失败';
      lastError.value = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * 刷新连接列表
   */
  const refreshConnections = async (): Promise<void> => {
    try {
      const networkConnections = await networkAPI.getConnections();
      connections.value = networkConnections;

      // 更新连接状态
      for (const connection of networkConnections) {
        const status = await networkAPI.getStatus(connection.id);
        if (status) {
          connectionStats.value[connection.id] = status;
        }
      }
    } catch (error) {
      console.error('刷新网络连接列表失败:', error);
      lastError.value = error instanceof Error ? error.message : '刷新连接列表失败';
    }
  };

  /**
   * 获取连接状态
   */
  const getConnectionStatus = async (connectionId: string): Promise<NetworkStatus | null> => {
    try {
      const status = await networkAPI.getStatus(connectionId);
      if (status) {
        connectionStats.value[connectionId] = status;
      }
      return status;
    } catch (error) {
      console.error(`获取连接状态失败 (${connectionId}):`, error);
      return null;
    }
  };

  /**
   * 检查连接是否可用
   */
  const isConnectionAvailable = (connectionId: string): boolean => {
    const connection = connections.value.find((conn) => conn.id === connectionId);
    return connection?.isConnected || false;
  };

  /**
   * 获取连接信息
   */
  const getConnection = (connectionId: string): NetworkConnection | undefined => {
    return connections.value.find((conn) => conn.id === connectionId);
  };

  /**
   * 获取活动连接列表（用于连接目标选择）
   */
  const getActiveConnections = (): NetworkConnection[] => {
    return connectedConnections.value;
  };

  // ==================== 数据监听设置 ====================

  /**
   * 设置网络数据监听
   */
  const setupNetworkDataHandling = () => {
    const receiveFramesStore = useReceiveFramesStore();

    // 清理现有监听器
    cleanupListeners();

    // 设置数据监听
    dataListenerCleanup.value = networkAPI.onData((data) => {
      const { connectionId, data: receivedData, timestamp } = data;

      // 转换数据格式并调用统一数据处理
      const uint8Data = new Uint8Array(receivedData);
      receiveFramesStore.handleReceivedData('network', connectionId, uint8Data);

      // 更新连接活动时间
      const connection = connections.value.find((conn) => conn.id === connectionId);
      if (connection) {
        connection.lastActivity = timestamp;
      }
    });

    // 设置连接事件监听
    connectionEventCleanup.value = networkAPI.onConnectionEvent((event) => {
      const { connectionId, eventType, timestamp } = event;

      // 更新连接状态
      const connection = connections.value.find((conn) => conn.id === connectionId);
      if (connection) {
        connection.lastActivity = timestamp;

        switch (eventType) {
          case 'connected':
            connection.isConnected = true;
            connection.status = 'connected';
            delete connection.error;
            break;
          case 'disconnected':
            connection.isConnected = false;
            connection.status = 'disconnected';
            break;
          case 'error':
            connection.isConnected = false;
            connection.status = 'error';
            if (event.data && typeof event.data === 'object' && 'error' in event.data) {
              connection.error = (event.data as { error: string }).error;
            }
            break;
        }
      }
    });

    // 设置状态变化监听
    statusChangeCleanup.value = networkAPI.onStatusChange((data) => {
      const { connectionId, status } = data;
      connectionStats.value[connectionId] = status;
    });
  };

  /**
   * 清理监听器
   */
  const cleanupListeners = () => {
    if (dataListenerCleanup.value) {
      dataListenerCleanup.value();
      dataListenerCleanup.value = null;
    }

    if (connectionEventCleanup.value) {
      connectionEventCleanup.value();
      connectionEventCleanup.value = null;
    }

    if (statusChangeCleanup.value) {
      statusChangeCleanup.value();
      statusChangeCleanup.value = null;
    }
  };

  /**
   * 清除错误状态
   */
  const clearError = () => {
    lastError.value = null;
  };

  /**
   * 断开所有连接
   */
  const disconnectAll = async (): Promise<void> => {
    const disconnectPromises = connections.value.map((conn) => disconnect(conn.id));

    await Promise.allSettled(disconnectPromises);
  };

  // ==================== 生命周期管理 ====================

  // 组件卸载时清理监听器
  onUnmounted(() => {
    cleanupListeners();
  });

  // ==================== 初始化 ====================

  // 初始化时设置数据监听和刷新连接列表
  const initialize = async () => {
    setupNetworkDataHandling();
    await refreshConnections();
  };

  // ==================== 返回接口 ====================

  return {
    // 状态
    connections: readonly(connections),
    connectionStats: readonly(connectionStats),
    isConnecting: readonly(isConnecting),
    lastError: readonly(lastError),

    // 计算属性
    connectedConnections,
    availableConnections,
    connectionCount,
    connectedCount,
    hasActiveConnections,

    // 连接管理方法
    connect,
    disconnect,
    disconnectAll,
    sendData,
    refreshConnections,
    getConnectionStatus,
    isConnectionAvailable,
    getConnection,
    getActiveConnections,

    // 数据监听方法
    setupNetworkDataHandling,
    cleanupListeners,

    // 工具方法
    clearError,
    initialize,
  };
});
