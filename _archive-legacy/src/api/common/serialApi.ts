/**
 * 串口通信API封装
 * 提供串口设备通信的统一接口
 */

import { deepClone } from '../../utils/frames/frameUtils';
import type { SerialPortOptions, SerialStatus } from '../../types/serial/serial';

// 导出串口API封装
export const serialAPI = {
  // 列出所有可用串口
  listPorts: (forceRefresh = false) => {
    if (window.electron?.serial?.listPorts) {
      return window.electron.serial.listPorts(forceRefresh);
    }
    return Promise.resolve([]);
  },

  // 打开串口连接
  open: (portPath: string, options?: SerialPortOptions) => {
    if (window.electron?.serial?.open) {
      return window.electron.serial.open(deepClone(portPath), deepClone(options));
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(open) 不可用' });
  },

  // 关闭串口连接
  close: (portPath: string) => {
    if (window.electron?.serial?.close) {
      return window.electron.serial.close(portPath);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(close) 不可用' });
  },

  // 关闭所有串口连接
  closeAll: () => {
    if (window.electron?.serial?.closeAll) {
      return window.electron.serial.closeAll();
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(closeAll) 不可用' });
  },

  // 写入数据到串口
  write: (portPath: string, data: Buffer | Uint8Array | string, isHex = false) => {
    if (window.electron?.serial?.write) {
      return window.electron.serial.write(portPath, data, isHex);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(write) 不可用' });
  },

  // 发送帧数据
  sendData: (portPath: string, data: Uint8Array) => {
    if (window.electron?.serial?.sendData) {
      return window.electron.serial.sendData(portPath, data);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(sendData) 不可用' });
  },

  // 从串口读取数据
  read: (portPath: string) => {
    if (window.electron?.serial?.read) {
      return window.electron.serial.read(portPath);
    }
    return Promise.resolve({ portPath, data: new Uint8Array(), size: 0 });
  },

  // 监听串口数据
  onData: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.onData) {
      return window.electron.serial.onData(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听串口发送的数据
  onDataSent: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.onDataSent) {
      return window.electron.serial.onDataSent(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 移除串口数据监听
  offData: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.offData) {
      window.electron.serial.offData(callback);
    }
  },

  // 移除串口发送的数据监听
  offDataSent: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.offDataSent) {
      window.electron.serial.offDataSent(callback);
    }
  },

  // 监听串口状态变化
  onStatusChange: (callback: (data: { portPath: string; status: SerialStatus }) => void) => {
    if (window.electron?.serial?.onStatusChange) {
      return window.electron.serial.onStatusChange(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听所有串口状态变化
  onAllStatusChange: (callback: (statusMap: Record<string, SerialStatus>) => void) => {
    if (window.electron?.serial?.onAllStatusChange) {
      return window.electron.serial.onAllStatusChange(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 获取当前串口状态
  getStatus: (portPath: string) => {
    if (window.electron?.serial?.getStatus) {
      return window.electron.serial.getStatus(portPath);
    }
    return Promise.resolve({ isOpen: false, error: 'Electron serial API(getStatus) 不可用' });
  },

  // 获取所有串口状态
  getAllStatus: () => {
    if (window.electron?.serial?.getAllStatus) {
      return window.electron.serial.getAllStatus();
    }
    return Promise.resolve({});
  },

  // 设置串口参数
  setOptions: (portPath: string, options: SerialPortOptions) => {
    if (window.electron?.serial?.setOptions) {
      return window.electron.serial.setOptions(portPath, deepClone(options));
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(setOptions) 不可用' });
  },

  // 清除串口缓冲区
  clearBuffer: (portPath: string) => {
    if (window.electron?.serial?.clearBuffer) {
      return window.electron.serial.clearBuffer(portPath);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(clearBuffer) 不可用' });
  },
};
