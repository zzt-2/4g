/**
 * 通用定时器管理器
 * 在主进程中管理所有定时器，避免渲染进程定时器被节流
 */

import { BrowserWindow } from 'electron';
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import type {
  TimerConfig,
  TimerInfo,
  TimerOperationResult,
  TimerEventData,
  BatchTimerOperation,
  TimerStats,
  TimerStatus,
} from '../../../src/types/common/timerManager';

// 定时器实例类
class TimerInstance {
  private config: TimerConfig;
  private status: TimerStatus = 'idle';
  private executionCount = 0;
  private lastExecutionTime?: number;
  private createdAt: number;
  private startedAt?: number;
  private timerId: NodeJS.Timeout | undefined;
  private pausedAt?: number;
  private pausedTimeElapsed = 0;

  constructor(config: TimerConfig) {
    this.config = config;
    this.createdAt = Date.now();
  }

  // 获取定时器信息
  getInfo(): TimerInfo {
    return {
      ...this.config,
      status: this.status,
      executionCount: this.executionCount,
      lastExecutionTime: this.lastExecutionTime,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
    };
  }

  // 启动定时器
  start(): boolean {
    if (this.status === 'running') return false;

    this.status = 'running';
    this.startedAt = Date.now();

    const executeCallback = () => {
      this.executionCount++;
      this.lastExecutionTime = Date.now();

      // 发送事件到渲染进程
      this.sendEventToRenderer();

      // 检查是否达到最大执行次数
      if (this.config.maxExecutions && this.executionCount >= this.config.maxExecutions) {
        this.stop();
      }
    };

    if (this.config.type === 'timeout') {
      // 一次性定时器
      this.timerId = setTimeout(executeCallback, this.config.interval);
    } else if (this.config.type === 'interval') {
      // 周期性定时器
      this.timerId = setInterval(executeCallback, this.config.interval);
    } else if (this.config.type === 'delayed') {
      // 延迟后周期执行
      const delay = this.config.delay || 0;
      setTimeout(() => {
        if (this.status === 'running') {
          this.timerId = setInterval(executeCallback, this.config.interval);
        }
      }, delay);
    }

    return true;
  }

  // 停止定时器
  stop(): boolean {
    if (this.status === 'stopped' || this.status === 'idle') return false;

    if (this.timerId) {
      clearTimeout(this.timerId);
      clearInterval(this.timerId);
      this.timerId = undefined;
    }

    this.status = 'stopped';
    this.pausedTimeElapsed = 0;
    return true;
  }

  // 暂停定时器
  pause(): boolean {
    if (this.status !== 'running') return false;

    if (this.timerId) {
      clearTimeout(this.timerId);
      clearInterval(this.timerId);
      this.timerId = undefined;
    }

    this.status = 'paused';
    this.pausedAt = Date.now();
    return true;
  }

  // 恢复定时器
  resume(): boolean {
    if (this.status !== 'paused') return false;

    this.status = 'running';

    // 重新启动定时器
    if (this.config.type === 'interval') {
      const executeCallback = () => {
        this.executionCount++;
        this.lastExecutionTime = Date.now();
        this.sendEventToRenderer();

        if (this.config.maxExecutions && this.executionCount >= this.config.maxExecutions) {
          this.stop();
        }
      };

      this.timerId = setInterval(executeCallback, this.config.interval);
    }

    return true;
  }

  // 发送事件到渲染进程
  private sendEventToRenderer(): void {
    const eventData: TimerEventData = {
      timerId: this.config.id,
      executionCount: this.executionCount,
      timestamp: Date.now(),
      interval: this.config.interval,
    };

    // 获取主窗口并发送事件
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      const eventChannel = this.config.eventChannel || `timer:tick:${this.config.id}`;
      mainWindow.webContents.send(eventChannel, eventData);
    }
  }
}

// 定时器管理器类
class TimerManager {
  private timers = new Map<string, TimerInstance>();

  // 注册定时器
  register(config: TimerConfig): TimerOperationResult {
    if (this.timers.has(config.id)) {
      return {
        success: false,
        message: `定时器 ${config.id} 已存在`,
      };
    }

    try {
      const timer = new TimerInstance(config);
      this.timers.set(config.id, timer);

      // 如果配置了自动启动，则立即启动
      if (config.autoStart) {
        timer.start();
      }

      return {
        success: true,
        timerId: config.id,
        message: `定时器 ${config.id} 注册成功`,
      };
    } catch (error) {
      return {
        success: false,
        message: `注册定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  // 启动定时器
  start(timerId: string): TimerOperationResult {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return {
        success: false,
        message: `定时器 ${timerId} 不存在`,
      };
    }

    const started = timer.start();
    return {
      success: started,
      timerId,
      message: started ? `定时器 ${timerId} 启动成功` : `定时器 ${timerId} 已在运行中`,
    };
  }

  // 停止定时器
  stop(timerId: string): TimerOperationResult {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return {
        success: false,
        message: `定时器 ${timerId} 不存在`,
      };
    }

    const stopped = timer.stop();
    return {
      success: stopped,
      timerId,
      message: stopped ? `定时器 ${timerId} 停止成功` : `定时器 ${timerId} 已停止`,
    };
  }

  // 暂停定时器
  pause(timerId: string): TimerOperationResult {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return {
        success: false,
        message: `定时器 ${timerId} 不存在`,
      };
    }

    const paused = timer.pause();
    return {
      success: paused,
      timerId,
      message: paused ? `定时器 ${timerId} 暂停成功` : `定时器 ${timerId} 无法暂停`,
    };
  }

  // 恢复定时器
  resume(timerId: string): TimerOperationResult {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return {
        success: false,
        message: `定时器 ${timerId} 不存在`,
      };
    }

    const resumed = timer.resume();
    return {
      success: resumed,
      timerId,
      message: resumed ? `定时器 ${timerId} 恢复成功` : `定时器 ${timerId} 无法恢复`,
    };
  }

  // 移除定时器
  unregister(timerId: string): TimerOperationResult {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return {
        success: false,
        message: `定时器 ${timerId} 不存在`,
      };
    }

    timer.stop();
    this.timers.delete(timerId);

    return {
      success: true,
      timerId,
      message: `定时器 ${timerId} 移除成功`,
    };
  }

  // 获取定时器信息
  getInfo(timerId: string): TimerInfo | null {
    const timer = this.timers.get(timerId);
    return timer ? timer.getInfo() : null;
  }

  // 获取所有定时器信息
  getAllTimers(): TimerInfo[] {
    return Array.from(this.timers.values()).map((timer) => timer.getInfo());
  }

  // 批量操作
  batchOperation(operation: BatchTimerOperation): TimerOperationResult[] {
    return operation.timerIds.map((timerId) => {
      switch (operation.operation) {
        case 'start':
          return this.start(timerId);
        case 'stop':
          return this.stop(timerId);
        case 'pause':
          return this.pause(timerId);
        case 'resume':
          return this.resume(timerId);
        default:
          return {
            success: false,
            message: `不支持的操作: ${operation.operation}`,
          };
      }
    });
  }

  // 获取统计信息
  getStats(): TimerStats {
    const timers = this.getAllTimers();
    return {
      totalTimers: timers.length,
      runningTimers: timers.filter((t) => t.status === 'running').length,
      pausedTimers: timers.filter((t) => t.status === 'paused').length,
      stoppedTimers: timers.filter((t) => t.status === 'stopped').length,
      totalExecutions: timers.reduce((sum, t) => sum + t.executionCount, 0),
    };
  }

  // 清理所有定时器
  cleanup(): void {
    for (const timer of this.timers.values()) {
      timer.stop();
    }
    this.timers.clear();
  }
}

// 全局定时器管理器实例
const timerManager = new TimerManager();

// 注册IPC处理器
export const registerTimerManagerHandlers = (): void => {
  const timerRegistry = createHandlerRegistry('timerManager');

  // 注册定时器
  timerRegistry.register(
    'register',
    async (_, config: TimerConfig): Promise<TimerOperationResult> => {
      return timerManager.register(config);
    },
  );

  // 启动定时器
  timerRegistry.register('start', async (_, timerId: string): Promise<TimerOperationResult> => {
    return timerManager.start(timerId);
  });

  // 停止定时器
  timerRegistry.register('stop', async (_, timerId: string): Promise<TimerOperationResult> => {
    return timerManager.stop(timerId);
  });

  // 暂停定时器
  timerRegistry.register('pause', async (_, timerId: string): Promise<TimerOperationResult> => {
    return timerManager.pause(timerId);
  });

  // 恢复定时器
  timerRegistry.register('resume', async (_, timerId: string): Promise<TimerOperationResult> => {
    return timerManager.resume(timerId);
  });

  // 移除定时器
  timerRegistry.register(
    'unregister',
    async (_, timerId: string): Promise<TimerOperationResult> => {
      return timerManager.unregister(timerId);
    },
  );

  // 获取定时器信息
  timerRegistry.register('getInfo', async (_, timerId: string): Promise<TimerInfo | null> => {
    return timerManager.getInfo(timerId);
  });

  // 获取所有定时器
  timerRegistry.register('getAllTimers', async (): Promise<TimerInfo[]> => {
    return timerManager.getAllTimers();
  });

  // 批量操作
  timerRegistry.register(
    'batchOperation',
    async (_, operation: BatchTimerOperation): Promise<TimerOperationResult[]> => {
      return timerManager.batchOperation(operation);
    },
  );

  // 获取统计信息
  timerRegistry.register('getStats', async (): Promise<TimerStats> => {
    return timerManager.getStats();
  });

  // 清理所有定时器
  timerRegistry.register('cleanup', async (): Promise<TimerOperationResult> => {
    try {
      timerManager.cleanup();
      return {
        success: true,
        message: '所有定时器清理完成',
      };
    } catch (error) {
      return {
        success: false,
        message: `清理定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  });

  // 注册所有处理器
  timerRegistry.registerAll();
};

// 导出清理函数，供应用退出时调用
export const cleanupTimers = (): void => {
  timerManager.cleanup();
};
