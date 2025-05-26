import { ipcRenderer } from 'electron';
import type { SerialPortOptions, SerialStatus } from '../../../src/types/serial/serial';

// 保存监听器映射，以便能正确移除事件监听
const dataListenerMap = new Map();
const dataSentListenerMap = new Map();
const statusListenerMap = new Map();
const allStatusListenerMap = new Map();

/**
 * 串口通信API
 * 提供与串口设备交互的接口
 */
export const serialAPI = {
  /**
   * 列出系统上所有可用的串口
   * @param forceRefresh 强制刷新串口列表
   * @returns 可用串口列表的Promise
   */
  listPorts: (forceRefresh = false) => ipcRenderer.invoke('serial:list', forceRefresh),

  /**
   * 打开串口连接
   * @param portPath 串口路径
   * @param options 串口配置选项
   * @returns 操作结果的Promise
   */
  open: (portPath: string, options?: SerialPortOptions) =>
    ipcRenderer.invoke('serial:open', portPath, options),

  /**
   * 关闭当前串口连接
   * @param portPath 串口路径
   * @returns 操作结果的Promise
   */
  close: (portPath: string) => ipcRenderer.invoke('serial:close', portPath),

  /**
   * 关闭所有串口连接
   * @returns 操作结果的Promise
   */
  closeAll: () => ipcRenderer.invoke('serial:close-all'),

  /**
   * 向串口写入数据
   * @param portPath 串口路径
   * @param data 要发送的数据
   * @param isHex 数据是否为十六进制字符串格式
   * @returns 操作结果的Promise
   */
  write: (portPath: string, data: Buffer | Uint8Array | string, isHex: boolean = false) =>
    ipcRenderer.invoke('serial:write', portPath, data, isHex),

  /**
   * 发送帧数据
   * @param portPath 串口路径
   * @param data 要发送的二进制数据
   * @returns 操作结果的Promise
   */
  sendData: (portPath: string, data: Uint8Array) =>
    ipcRenderer.invoke('serial:send', portPath, data),

  /**
   * 读取串口数据(一次性读取)
   * @param portPath 串口路径
   * @returns 读取到的数据Promise
   */
  read: (portPath: string) => ipcRenderer.invoke('serial:read', portPath),

  /**
   * 监听串口数据
   * @param callback 数据回调函数
   * @returns 移除监听器的函数
   */
  onData: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    // 创建一个包装回调函数
    const wrappedCallback = (
      _event: any,
      data: { portPath: string; data: Buffer; size: number },
    ) => {
      callback({
        ...data,
        data: Buffer.from(data.data), // 确保数据是Buffer类型
      });
    };

    // 保存回调函数和包装函数的映射，以便后续能正确移除
    dataListenerMap.set(callback, wrappedCallback);

    // 添加监听器
    ipcRenderer.on('serial:data', wrappedCallback);

    // 返回的函数用于移除监听器
    return () => {
      const wrappedCb = dataListenerMap.get(callback);
      if (wrappedCb) {
        ipcRenderer.removeListener('serial:data', wrappedCb);
        dataListenerMap.delete(callback);
      }
    };
  },

  /**
   * 监听发送的数据
   * @param callback 数据回调函数
   * @returns 移除监听器的函数
   */
  onDataSent: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    // 创建一个包装回调函数
    const wrappedCallback = (
      _event: any,
      data: { portPath: string; data: Buffer; size: number },
    ) => {
      callback({
        ...data,
        data: Buffer.from(data.data), // 确保数据是Buffer类型
      });
    };

    // 保存回调函数和包装函数的映射，以便后续能正确移除
    dataSentListenerMap.set(callback, wrappedCallback);

    // 添加监听器
    ipcRenderer.on('serial:data:sent', wrappedCallback);

    // 返回的函数用于移除监听器
    return () => {
      const wrappedCb = dataSentListenerMap.get(callback);
      if (wrappedCb) {
        ipcRenderer.removeListener('serial:data:sent', wrappedCb);
        dataSentListenerMap.delete(callback);
      }
    };
  },

  /**
   * 移除数据监听
   * @param callback 要移除的回调函数
   */
  offData: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    const wrappedCallback = dataListenerMap.get(callback);
    if (wrappedCallback) {
      ipcRenderer.removeListener('serial:data', wrappedCallback);
      dataListenerMap.delete(callback);
    }
  },

  /**
   * 移除发送的数据监听
   * @param callback 要移除的回调函数
   */
  offDataSent: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    const wrappedCallback = dataSentListenerMap.get(callback);
    if (wrappedCallback) {
      ipcRenderer.removeListener('serial:data:sent', wrappedCallback);
      dataSentListenerMap.delete(callback);
    }
  },

  /**
   * 监听串口状态变化
   * @param callback 状态回调函数
   * @returns 移除监听器的函数
   */
  onStatusChange: (callback: (data: { portPath: string; status: SerialStatus }) => void) => {
    // 创建一个包装回调函数
    const wrappedCallback = (_event: any, data: { portPath: string; status: SerialStatus }) => {
      callback(data);
    };

    // 保存回调函数和包装函数的映射
    statusListenerMap.set(callback, wrappedCallback);

    // 添加监听器
    ipcRenderer.on('serial:status', wrappedCallback);

    // 返回清理函数
    return () => {
      const wrappedCb = statusListenerMap.get(callback);
      if (wrappedCb) {
        ipcRenderer.removeListener('serial:status', wrappedCb);
        statusListenerMap.delete(callback);
      }
    };
  },

  /**
   * 监听所有串口状态变化
   * @param callback 状态回调函数
   * @returns 移除监听器的函数
   */
  onAllStatusChange: (callback: (statusMap: Record<string, SerialStatus>) => void) => {
    // 创建一个包装回调函数
    const wrappedCallback = (_event: any, statusMap: Record<string, SerialStatus>) => {
      callback(statusMap);
    };

    // 保存回调函数和包装函数的映射
    allStatusListenerMap.set(callback, wrappedCallback);

    // 添加监听器
    ipcRenderer.on('serial:all-status', wrappedCallback);

    // 返回清理函数
    return () => {
      const wrappedCb = allStatusListenerMap.get(callback);
      if (wrappedCb) {
        ipcRenderer.removeListener('serial:all-status', wrappedCb);
        allStatusListenerMap.delete(callback);
      }
    };
  },

  /**
   * 获取单个串口状态
   * @param portPath 串口路径
   * @returns 串口状态的Promise
   */
  getStatus: (portPath: string) => ipcRenderer.invoke('serial:status', portPath),

  /**
   * 获取所有串口状态
   * @returns 所有串口状态的Promise
   */
  getAllStatus: () => ipcRenderer.invoke('serial:all-status'),

  /**
   * 设置串口参数
   * @param portPath 串口路径
   * @param options 串口配置选项
   * @returns 操作结果的Promise
   */
  setOptions: (portPath: string, options: SerialPortOptions) =>
    ipcRenderer.invoke('serial:setOptions', portPath, options),

  /**
   * 清除接收缓冲区
   * @param portPath 串口路径
   * @returns 操作结果的Promise
   */
  clearBuffer: (portPath: string) => ipcRenderer.invoke('serial:clearBuffer', portPath),
};
