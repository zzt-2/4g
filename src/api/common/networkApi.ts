/**
 * 网络连接API封装
 * 提供网络通信的统一接口
 */

import { deepClone } from '../../utils/frames/frameUtils';
import type {
  NetworkConnectionConfig,
  NetworkConnection,
  NetworkStatus,
  NetworkOperationResult,
  NetworkConnectionOptions,
} from '../../types/serial/network';

// 导出网络连接API
export const networkAPI = {
  // 连接网络
  connect: (
    config: NetworkConnectionConfig,
    options?: NetworkConnectionOptions,
  ): Promise<NetworkOperationResult> => {
    if (window.electron?.network?.connect) {
      return window.electron.network.connect(deepClone(config), deepClone(options));
    }
    return Promise.resolve({ success: false, error: 'Electron network API(connect) 不可用' });
  },

  // 断开网络连接
  disconnect: (connectionId: string): Promise<NetworkOperationResult> => {
    if (window.electron?.network?.disconnect) {
      return window.electron.network.disconnect(connectionId);
    }
    return Promise.resolve({ success: false, error: 'Electron network API(disconnect) 不可用' });
  },

  // 发送网络数据
  send: (
    connectionId: string,
    data: Uint8Array,
    targetHost?: string,
  ): Promise<NetworkOperationResult> => {
    if (window.electron?.network?.send) {
      return window.electron.network.send(connectionId, data, targetHost);
    }
    return Promise.resolve({ success: false, error: 'Electron network API(send) 不可用' });
  },

  // 获取所有网络连接
  getConnections: (): Promise<NetworkConnection[]> => {
    if (window.electron?.network?.getConnections) {
      return window.electron.network.getConnections();
    }
    return Promise.resolve([]);
  },

  // 获取网络连接状态
  getStatus: (connectionId: string): Promise<NetworkStatus | null> => {
    if (window.electron?.network?.getStatus) {
      return window.electron.network.getStatus(connectionId);
    }
    return Promise.resolve(null);
  },

  // 监听网络数据
  onData: (
    callback: (data: {
      connectionId: string;
      data: number[];
      size: number;
      timestamp: Date;
    }) => void,
  ) => {
    if (window.electron?.network?.onData) {
      return window.electron.network.onData(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听网络连接事件
  onConnectionEvent: (
    callback: (event: {
      connectionId: string;
      eventType: string;
      data?: unknown;
      timestamp: Date;
    }) => void,
  ) => {
    if (window.electron?.network?.onConnectionEvent) {
      return window.electron.network.onConnectionEvent(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听网络状态变化
  onStatusChange: (callback: (data: { connectionId: string; status: NetworkStatus }) => void) => {
    if (window.electron?.network?.onStatusChange) {
      return window.electron.network.onStatusChange(callback);
    }
    return () => {}; // 返回空的清理函数
  },
};
