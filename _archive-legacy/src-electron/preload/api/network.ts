/**
 * 网络连接预加载API
 * 为渲染进程提供类型安全的网络操作接口
 */

import { ipcRenderer } from 'electron';
import type {
  NetworkConnectionConfig,
  NetworkConnection,
  NetworkStatus,
  NetworkOperationResult,
  NetworkConnectionOptions,
} from '../../../src/types/serial/network';

/**
 * 网络连接API
 */
export const networkAPI = {
  /**
   * 连接网络
   * @param config 网络连接配置
   * @param options 连接选项
   * @returns 操作结果
   */
  connect: (
    config: NetworkConnectionConfig,
    options?: NetworkConnectionOptions,
  ): Promise<NetworkOperationResult> => ipcRenderer.invoke('network:connect', config, options),

  /**
   * 断开网络连接
   * @param connectionId 连接ID
   * @returns 操作结果
   */
  disconnect: (connectionId: string): Promise<NetworkOperationResult> =>
    ipcRenderer.invoke('network:disconnect', connectionId),

  /**
   * 发送网络数据
   * @param connectionId 连接ID
   * @param data 要发送的数据
   * @param targetHost 目标主机
   * @returns 操作结果
   */
  send: (
    connectionId: string,
    data: Uint8Array,
    targetHost?: string,
  ): Promise<NetworkOperationResult> =>
    ipcRenderer.invoke('network:send', connectionId, data, targetHost),

  /**
   * 获取所有网络连接
   * @returns 连接列表
   */
  getConnections: (): Promise<NetworkConnection[]> => ipcRenderer.invoke('network:getConnections'),

  /**
   * 获取网络连接状态
   * @param connectionId 连接ID
   * @returns 连接状态
   */
  getStatus: (connectionId: string): Promise<NetworkStatus | null> =>
    ipcRenderer.invoke('network:getStatus', connectionId),

  /**
   * 监听网络数据
   * @param callback 数据接收回调函数
   * @returns 清理函数
   */
  onData: (
    callback: (data: {
      connectionId: string;
      data: number[];
      size: number;
      timestamp: Date;
    }) => void,
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('network:data', listener);

    // 返回清理函数
    return () => {
      ipcRenderer.off('network:data', listener);
    };
  },

  /**
   * 监听网络连接事件
   * @param callback 连接事件回调函数
   * @returns 清理函数
   */
  onConnectionEvent: (
    callback: (event: {
      connectionId: string;
      eventType: string;
      data?: unknown;
      timestamp: Date;
    }) => void,
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('network:connectionEvent', listener);

    // 返回清理函数
    return () => {
      ipcRenderer.off('network:connectionEvent', listener);
    };
  },

  /**
   * 监听网络状态变化
   * @param callback 状态变化回调函数
   * @returns 清理函数
   */
  onStatusChange: (callback: (data: { connectionId: string; status: NetworkStatus }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('network:statusChange', listener);

    // 返回清理函数
    return () => {
      ipcRenderer.off('network:statusChange', listener);
    };
  },
};
