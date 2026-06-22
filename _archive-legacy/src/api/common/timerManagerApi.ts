/**
 * 定时器管理API封装
 * 提供定时器管理的统一接口
 */

import type {
  TimerConfig,
  TimerInfo,
  TimerOperationResult,
  BatchTimerOperation,
  TimerStats,
  TimerEventData,
} from '../../types/common/timerManager';

// 定时器管理器API
export const timerManagerAPI = {
  /**
   * 注册定时器
   * @param config 定时器配置
   */
  register: (config: TimerConfig): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.register) {
      return window.electron.timerManager.register(config);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(register) 不可用',
    });
  },

  /**
   * 启动定时器
   * @param timerId 定时器ID
   */
  start: (timerId: string): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.start) {
      return window.electron.timerManager.start(timerId);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(start) 不可用',
    });
  },

  /**
   * 停止定时器
   * @param timerId 定时器ID
   */
  stop: (timerId: string): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.stop) {
      return window.electron.timerManager.stop(timerId);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(stop) 不可用',
    });
  },

  /**
   * 暂停定时器
   * @param timerId 定时器ID
   */
  pause: (timerId: string): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.pause) {
      return window.electron.timerManager.pause(timerId);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(pause) 不可用',
    });
  },

  /**
   * 恢复定时器
   * @param timerId 定时器ID
   */
  resume: (timerId: string): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.resume) {
      return window.electron.timerManager.resume(timerId);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(resume) 不可用',
    });
  },

  /**
   * 移除定时器
   * @param timerId 定时器ID
   */
  unregister: (timerId: string): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.unregister) {
      return window.electron.timerManager.unregister(timerId);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(unregister) 不可用',
    });
  },

  /**
   * 获取定时器信息
   * @param timerId 定时器ID
   */
  getInfo: (timerId: string): Promise<TimerInfo | null> => {
    if (window.electron?.timerManager?.getInfo) {
      return window.electron.timerManager.getInfo(timerId);
    }
    return Promise.resolve(null);
  },

  /**
   * 获取所有定时器信息
   */
  getAllTimers: (): Promise<TimerInfo[]> => {
    if (window.electron?.timerManager?.getAllTimers) {
      return window.electron.timerManager.getAllTimers();
    }
    return Promise.resolve([]);
  },

  /**
   * 批量操作定时器
   * @param operation 批量操作配置
   */
  batchOperation: (operation: BatchTimerOperation): Promise<TimerOperationResult[]> => {
    if (window.electron?.timerManager?.batchOperation) {
      return window.electron.timerManager.batchOperation(operation);
    }
    return Promise.resolve([]);
  },

  /**
   * 获取定时器统计信息
   */
  getStats: (): Promise<TimerStats> => {
    if (window.electron?.timerManager?.getStats) {
      return window.electron.timerManager.getStats();
    }
    return Promise.resolve({
      totalTimers: 0,
      runningTimers: 0,
      pausedTimers: 0,
      stoppedTimers: 0,
      totalTicks: 0,
      totalExecutions: 0,
    });
  },

  /**
   * 清理所有定时器
   */
  cleanup: (): Promise<TimerOperationResult> => {
    if (window.electron?.timerManager?.cleanup) {
      return window.electron.timerManager.cleanup();
    }
    return Promise.resolve({
      success: false,
      message: 'Electron timerManager API(cleanup) 不可用',
    });
  },

  /**
   * 监听定时器事件
   * @param timerId 定时器ID
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onTimerTick: (timerId: string, callback: (data: TimerEventData) => void): (() => void) => {
    if (window.electron?.timerManager?.onTimerTick) {
      return window.electron.timerManager.onTimerTick(timerId, callback);
    }
    return () => {}; // 返回空的清理函数
  },

  /**
   * 监听自定义事件通道
   * @param eventChannel 事件通道名称
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onCustomEvent: (eventChannel: string, callback: (data: TimerEventData) => void): (() => void) => {
    if (window.electron?.timerManager?.onCustomEvent) {
      return window.electron.timerManager.onCustomEvent(eventChannel, callback);
    }
    return () => {}; // 返回空的清理函数
  },
};
