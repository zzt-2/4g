/**
 * 定时器管理器组合式函数
 */

import { ref, onUnmounted } from 'vue';
import { timerManagerAPI } from '../../api/common';
import type {
  TimerConfig,
  TimerEventData,
  TimerOperationResult,
} from '../../types/common/timerManager';

export interface TimerRegistration {
  id: string;
  config: TimerConfig;
  unsubscribe: (() => void) | null;
  callback: (data: TimerEventData) => void;
}

export const useTimerManager = (ifAutoCleanup?: boolean) => {
  // 注册的定时器列表
  const registeredTimers = ref<Map<string, TimerRegistration>>(new Map());

  /**
   * 注册并启动定时器
   * @param config 定时器配置
   * @param callback 定时器触发时的回调函数
   */
  const registerTimer = async (
    config: TimerConfig,
    callback: (data: TimerEventData) => void,
  ): Promise<TimerOperationResult> => {
    try {
      // 如果已经存在同名定时器，先移除
      if (registeredTimers.value.has(config.id)) {
        console.log(`检测到定时器 ${config.id} 已存在，先移除旧定时器`);
        await unregisterTimer(config.id);
      }

      // 注册定时器
      const result = await timerManagerAPI.register(config);

      if (result.success) {
        // 监听定时器事件
        const unsubscribe = timerManagerAPI.onTimerTick(config.id, callback);

        // 保存注册信息
        registeredTimers.value.set(config.id, {
          id: config.id,
          config,
          unsubscribe,
          callback,
        });

        console.log(`定时器 ${config.id} 注册成功`);
      } else {
        // 如果注册失败且是重复定时器错误，尝试先移除主进程中的定时器再重试
        if (result.message?.includes('已存在')) {
          console.log(`主进程中定时器 ${config.id} 已存在，尝试先移除再重新注册`);

          // 直接调用主进程API移除定时器
          await timerManagerAPI.unregister(config.id);

          // 重新注册
          const retryResult = await timerManagerAPI.register(config);

          if (retryResult.success) {
            // 监听定时器事件
            const unsubscribe = timerManagerAPI.onTimerTick(config.id, callback);

            // 保存注册信息
            registeredTimers.value.set(config.id, {
              id: config.id,
              config,
              unsubscribe,
              callback,
            });

            console.log(`定时器 ${config.id} 重新注册成功`);
            return retryResult;
          } else {
            return retryResult;
          }
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: `注册定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  };

  /**
   * 启动定时器
   * @param timerId 定时器ID
   */
  const startTimer = async (timerId: string): Promise<TimerOperationResult> => {
    try {
      const result = await timerManagerAPI.start(timerId);

      if (result.success) {
        console.log(`定时器 ${timerId} 启动成功`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: `启动定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  };

  /**
   * 停止定时器
   * @param timerId 定时器ID
   */
  const stopTimer = async (timerId: string): Promise<TimerOperationResult> => {
    try {
      const result = await timerManagerAPI.stop(timerId);

      if (result.success) {
        console.log(`定时器 ${timerId} 停止成功`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: `停止定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  };

  /**
   * 移除定时器
   * @param timerId 定时器ID
   */
  const unregisterTimer = async (timerId: string): Promise<TimerOperationResult> => {
    try {
      const registration = registeredTimers.value.get(timerId);

      // 移除事件监听
      if (registration?.unsubscribe) {
        registration.unsubscribe();
      }

      // 移除定时器
      const result = await timerManagerAPI.unregister(timerId);

      if (result.success) {
        registeredTimers.value.delete(timerId);
        console.log(`定时器 ${timerId} 移除成功`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: `移除定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  };

  /**
   * 暂停定时器
   * @param timerId 定时器ID
   */
  const pauseTimer = async (timerId: string): Promise<TimerOperationResult> => {
    try {
      return await timerManagerAPI.pause(timerId);
    } catch (error) {
      return {
        success: false,
        message: `暂停定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  };

  /**
   * 恢复定时器
   * @param timerId 定时器ID
   */
  const resumeTimer = async (timerId: string): Promise<TimerOperationResult> => {
    try {
      return await timerManagerAPI.resume(timerId);
    } catch (error) {
      return {
        success: false,
        message: `恢复定时器失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  };

  /**
   * 获取注册的定时器信息
   * @param timerId 定时器ID
   */
  const getTimerInfo = async (timerId: string) => {
    try {
      return await timerManagerAPI.getInfo(timerId);
    } catch (error) {
      console.error(`获取定时器信息失败: ${error}`);
      return null;
    }
  };

  /**
   * 获取所有定时器统计信息
   */
  const getTimerStats = async () => {
    try {
      return await timerManagerAPI.getStats();
    } catch (error) {
      console.error(`获取定时器统计失败: ${error}`);
      return null;
    }
  };

  /**
   * 清理所有注册的定时器
   */
  const cleanup = async (): Promise<void> => {
    try {
      // 移除所有事件监听
      for (const registration of registeredTimers.value.values()) {
        if (registration.unsubscribe) {
          registration.unsubscribe();
        }
      }

      // 清理主进程中的定时器
      await timerManagerAPI.cleanup();

      // 清空本地注册信息
      registeredTimers.value.clear();

      console.log('所有定时器已清理');
    } catch (error) {
      console.error(`清理定时器失败: ${error}`);
    }
  };

  // 组件卸载时自动清理（默认开启，除非明确传递 false）
  if (ifAutoCleanup !== false) {
    onUnmounted(() => {
      cleanup();
    });
  }

  return {
    registeredTimers: registeredTimers.value,
    registerTimer,
    startTimer,
    stopTimer,
    unregisterTimer,
    pauseTimer,
    resumeTimer,
    getTimerInfo,
    getTimerStats,
    cleanup,
  };
};
