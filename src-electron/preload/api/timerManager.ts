/**
 * 定时器管理器 API
 */

import { ipcRenderer } from 'electron';
import type {
  TimerConfig,
  TimerInfo,
  TimerOperationResult,
  BatchTimerOperation,
  TimerStats,
  TimerEventData,
} from '../../../src/types/common/timerManager';

export const timerManagerAPI = {
  /**
   * 注册定时器
   * @param config 定时器配置
   */
  register: (config: TimerConfig) =>
    ipcRenderer.invoke('timerManager:register', config) as Promise<TimerOperationResult>,

  /**
   * 启动定时器
   * @param timerId 定时器ID
   */
  start: (timerId: string) =>
    ipcRenderer.invoke('timerManager:start', timerId) as Promise<TimerOperationResult>,

  /**
   * 停止定时器
   * @param timerId 定时器ID
   */
  stop: (timerId: string) =>
    ipcRenderer.invoke('timerManager:stop', timerId) as Promise<TimerOperationResult>,

  /**
   * 暂停定时器
   * @param timerId 定时器ID
   */
  pause: (timerId: string) =>
    ipcRenderer.invoke('timerManager:pause', timerId) as Promise<TimerOperationResult>,

  /**
   * 恢复定时器
   * @param timerId 定时器ID
   */
  resume: (timerId: string) =>
    ipcRenderer.invoke('timerManager:resume', timerId) as Promise<TimerOperationResult>,

  /**
   * 移除定时器
   * @param timerId 定时器ID
   */
  unregister: (timerId: string) =>
    ipcRenderer.invoke('timerManager:unregister', timerId) as Promise<TimerOperationResult>,

  /**
   * 获取定时器信息
   * @param timerId 定时器ID
   */
  getInfo: (timerId: string) =>
    ipcRenderer.invoke('timerManager:getInfo', timerId) as Promise<TimerInfo | null>,

  /**
   * 获取所有定时器信息
   */
  getAllTimers: () => ipcRenderer.invoke('timerManager:getAllTimers') as Promise<TimerInfo[]>,

  /**
   * 批量操作定时器
   * @param operation 批量操作配置
   */
  batchOperation: (operation: BatchTimerOperation) =>
    ipcRenderer.invoke('timerManager:batchOperation', operation) as Promise<TimerOperationResult[]>,

  /**
   * 获取定时器统计信息
   */
  getStats: () => ipcRenderer.invoke('timerManager:getStats') as Promise<TimerStats>,

  /**
   * 清理所有定时器
   */
  cleanup: () => ipcRenderer.invoke('timerManager:cleanup') as Promise<TimerOperationResult>,

  /**
   * 监听定时器事件
   * @param timerId 定时器ID
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onTimerTick: (timerId: string, callback: (data: TimerEventData) => void) => {
    const eventChannel = `timer:tick:${timerId}`;
    const handler = (_event: any, data: TimerEventData) => callback(data);

    ipcRenderer.on(eventChannel, handler);

    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener(eventChannel, handler);
    };
  },

  /**
   * 监听自定义事件通道
   * @param eventChannel 事件通道名称
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onCustomEvent: (eventChannel: string, callback: (data: TimerEventData) => void) => {
    const handler = (_event: any, data: TimerEventData) => callback(data);

    ipcRenderer.on(eventChannel, handler);

    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener(eventChannel, handler);
    };
  },
};
