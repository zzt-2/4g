/**
 * 发送任务执行器 - 可组合函数
 *
 * 负责各种类型任务的执行
 */
import { ref } from 'vue';
import {
  useSendTasksStore,
  SendTask,
  TimedTaskConfig,
  TriggerTaskConfig,
  FrameInstanceInTask,
} from '../../../stores/frames/sendTasksStore';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';
import { useUnifiedSender } from './useUnifiedSender';
import { deepClone } from '../../../utils/frames/frameUtils';
import { useTimerManager } from '../../common/useTimerManager';
import type { TimerConfig } from '../../../types/common/timerManager';

/**
 * 缓存的帧实例
 */
interface CachedFrameInstance {
  instanceConfig: FrameInstanceInTask;
  originalInstance: SendFrameInstance;
  cachedInstance: SendFrameInstance;
  currentVariationIndex: number;
}

/**
 * 任务执行器可组合函数
 */
export function useSendTaskExecutor() {
  const sendTasksStore = useSendTasksStore();

  // 获取统一发送路由器
  const { sendFrameInstance: sendFrameInstanceUnified, isTargetAvailable } = useUnifiedSender();

  // 获取定时器管理器
  const timerManager = useTimerManager(false);

  // 本地状态
  const isProcessing = ref(false);
  const processingError = ref<string | null>(null);

  // 帧实例缓存 Map，key 为 taskId
  const frameInstanceCaches = new Map<string, CachedFrameInstance[]>();

  // ============= 内部辅助函数 =============

  /**
   * 初始化任务的帧实例缓存
   */
  const initializeFrameInstanceCache = (
    taskId: string,
    instances: FrameInstanceInTask[],
  ): CachedFrameInstance[] => {
    const cache: CachedFrameInstance[] = [];

    for (const instanceConfig of instances) {
      const originalInstance = instanceConfig.instance;
      const cachedInstance = deepClone(originalInstance);

      cache.push({
        instanceConfig,
        originalInstance,
        cachedInstance,
        currentVariationIndex: 0,
      });
    }

    frameInstanceCaches.set(taskId, cache);
    console.log(`初始化任务 ${taskId} 的帧实例缓存，包含 ${cache.length} 个实例`);
    return cache;
  };

  /**
   * 更新缓存实例的字段值（参数变化）
   */
  const updateCachedInstanceFields = (
    cachedInstance: CachedFrameInstance,
    variationIndex: number,
  ): void => {
    const { instanceConfig, cachedInstance: instance } = cachedInstance;

    // 如果启用了参数变化
    if (instanceConfig.enableVariation && instanceConfig.fieldVariations) {
      for (const fieldVariation of instanceConfig.fieldVariations) {
        const field = instance.fields?.find((f) => f.id === fieldVariation.fieldId);
        if (field && fieldVariation.values.length > variationIndex) {
          field.value = String(fieldVariation.values[variationIndex] || '');
          // console.log(
          //   `更新字段 ${field.label}(${field.id}) 为: ${field.value} (轮次: ${variationIndex})`,
          // );
        }
      }
    }

    // 更新变化索引
    cachedInstance.currentVariationIndex = variationIndex;
  };

  /**
   * 获取任务的缓存实例
   */
  const getCachedFrameInstance = (taskId: string, instanceIndex: number): SendFrameInstance => {
    const cache = frameInstanceCaches.get(taskId);
    if (!cache || !cache[instanceIndex]) {
      throw new Error(`任务 ${taskId} 的缓存实例 ${instanceIndex} 不存在`);
    }

    return cache[instanceIndex].cachedInstance;
  };

  /**
   * 清理任务缓存
   */
  const clearFrameInstanceCache = (taskId: string): void => {
    frameInstanceCaches.delete(taskId);
    console.log(`清理任务 ${taskId} 的帧实例缓存`);
  };

  /**
   * 检查任务是否仍在运行
   */
  const isTaskStillRunning = (taskId: string, expectedStatus?: string[]): boolean => {
    const currentTask = sendTasksStore.getTaskById(taskId);
    if (!currentTask) {
      return false;
    }
    if (expectedStatus) {
      return expectedStatus.includes(currentTask.status);
    }
    return currentTask.status === 'running' || currentTask.status === 'waiting-trigger';
  };

  /**
   * 创建任务专用的定时器ID生成器
   */
  const createTaskTimerIds = (taskId: string) => {
    const timerIds: string[] = [];

    const createTimerId = (type: 'interval' | 'timeout', suffix?: string) => {
      const id = `task-${taskId}-${type}-${Date.now()}${suffix ? `-${suffix}` : ''}`;
      timerIds.push(id);
      return id;
    };

    const cleanup = async () => {
      for (const timerId of timerIds) {
        await timerManager.unregisterTimer(timerId);
      }
      timerIds.length = 0;
    };

    const getTimerIds = () => [...timerIds];

    return { createTimerId, cleanup, getTimerIds };
  };

  /**
   * 通用的时间触发计算逻辑
   */
  const createTimeCalculator = (config: {
    executeTime: string;
    isRecurring?: boolean;
    recurringType?: 'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly';
    recurringInterval?: number;
    endTime?: string;
  }) => {
    const executeTime = new Date(config.executeTime);

    const calculateNextExecutionTime = (currentTime: Date): Date | null => {
      if (!config.isRecurring) {
        return executeTime > currentTime ? executeTime : null;
      }

      const { recurringType, recurringInterval = 1 } = config;
      const nextTime = new Date(executeTime);

      // 如果执行时间已过，计算下一个重复时间
      while (nextTime <= currentTime) {
        switch (recurringType) {
          case 'second':
            nextTime.setSeconds(nextTime.getSeconds() + recurringInterval);
            break;
          case 'minute':
            nextTime.setMinutes(nextTime.getMinutes() + recurringInterval);
            break;
          case 'hour':
            nextTime.setHours(nextTime.getHours() + recurringInterval);
            break;
          case 'daily':
            nextTime.setDate(nextTime.getDate() + recurringInterval);
            break;
          case 'weekly':
            nextTime.setDate(nextTime.getDate() + 7 * recurringInterval);
            break;
          case 'monthly':
            nextTime.setMonth(nextTime.getMonth() + recurringInterval);
            break;
        }
      }

      // 检查是否超过结束时间
      if (config.endTime) {
        const endTime = new Date(config.endTime);
        if (nextTime > endTime) {
          return null;
        }
      }

      return nextTime;
    };

    return { calculateNextExecutionTime };
  };

  /**
   * 发送帧到目标并处理错误（使用统一发送路由器）
   */
  const sendFrameToTarget = async (
    targetId: string,
    instance: SendFrameInstance,
    taskId: string,
    taskName: string,
  ): Promise<boolean> => {
    try {
      const result = await sendFrameInstanceUnified(targetId, instance);

      if (!result.success) {
        // 检查是否是连接问题
        const isAvailable = isTargetAvailable(targetId);
        if (!isAvailable) {
          console.log(`连接已断开 (${targetId})，暂停任务: ${taskName}`);
          sendTasksStore.updateTaskStatus(taskId, 'paused', '连接已断开');
          return false;
        }
        throw new Error(result.error || '帧发送失败');
      }

      return true;
    } catch (error) {
      console.error(`发送帧到目标 ${targetId} 失败:`, error);
      throw error;
    }
  };

  /**
   * 处理实例间延时
   */
  const addInstanceDelay = async (
    instanceConfig: FrameInstanceInTask,
    isLastInstance: boolean,
  ): Promise<void> => {
    if (!isLastInstance) {
      const instanceInterval = instanceConfig.interval;
      await new Promise((resolve) => setTimeout(resolve, instanceInterval));
    }
  };

  /**
   * 处理单个实例的发送逻辑
   */
  const processSingleInstance = async (
    taskId: string,
    instanceIndex: number,
    isLastInstance: boolean = true,
  ): Promise<boolean> => {
    try {
      const cache = frameInstanceCaches.get(taskId);
      if (!cache || !cache[instanceIndex]) {
        throw new Error(`任务 ${taskId} 的实例缓存 ${instanceIndex} 不存在`);
      }

      const cachedInstance = cache[instanceIndex];
      const { instanceConfig } = cachedInstance;

      // 发送帧（使用缓存的实例）
      const success = await sendFrameToTarget(
        instanceConfig.targetId,
        cachedInstance.cachedInstance,
        taskId,
        `任务-${taskId}`,
      );
      if (!success) {
        return false; // 连接错误已在函数内处理
      }

      // 添加实例间延时
      await addInstanceDelay(instanceConfig, isLastInstance);

      return true;
    } catch (error) {
      console.error(`发送实例索引 ${instanceIndex} 时出错:`, error);
      throw error;
    }
  };

  /**
   * 处理单个实例（包含完整状态管理）
   * 用于顺序发送和触发发送任务
   */
  const processInstance = async (
    taskId: string,
    instanceIndex: number,
    totalInstances: number,
    isLastInstance: boolean = true,
  ): Promise<boolean> => {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task || !task.config || !('instances' in task.config)) {
      throw new Error('任务配置无效');
    }

    const cache = frameInstanceCaches.get(taskId);
    if (!cache || !cache[instanceIndex]) {
      throw new Error(`任务 ${taskId} 的实例缓存 ${instanceIndex} 不存在`);
    }

    const cachedInstance = cache[instanceIndex];
    const { instanceConfig } = cachedInstance;

    // 更新当前处理的实例状态为 running
    const updatedInstances = [...task.config.instances];
    updatedInstances[instanceIndex] = {
      ...instanceConfig,
      status: 'running',
    };

    sendTasksStore.updateTask(taskId, {
      config: {
        ...task.config,
        instances: updatedInstances,
      },
    });

    // 使用缓存版本以提高性能
    // 注意：对于定时任务(timed)，进度由 createTimedSender 管理，这里只更新 currentInstanceIndex
    if (task.type === 'sequential' || task.type === 'triggered') {
      sendTasksStore.updateTaskProgressCached(taskId, {
        currentCount: instanceIndex,
        percentage: Math.floor((instanceIndex / totalInstances) * 100),
        currentInstanceIndex: instanceIndex,
      });
    } else if (task.type === 'timed') {
      // 定时任务只更新当前实例索引，不更新 currentCount（由轮次管理）
      sendTasksStore.updateTaskProgressCached(taskId, {
        currentInstanceIndex: instanceIndex,
      });
    }

    try {
      // 使用基础的实例发送方法
      const success = await processSingleInstance(taskId, instanceIndex, isLastInstance);

      if (!success) {
        return false; // 连接错误已在函数内处理
      }

      // 更新实例状态为成功
      updatedInstances[instanceIndex] = {
        ...instanceConfig,
        status: 'completed',
      };

      sendTasksStore.updateTask(taskId, {
        config: {
          ...task.config,
          instances: updatedInstances,
        },
      });

      return true;
    } catch (error) {
      // 更新实例状态为错误
      updatedInstances[instanceIndex] = {
        ...instanceConfig,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : '发送失败',
      };

      sendTasksStore.updateTask(taskId, {
        config: {
          ...task.config,
          instances: updatedInstances,
        },
      });

      throw error; // 重新抛出错误供调用方处理
    }
  };

  /**
   * 处理多个实例（触发任务专用）
   * 顺序处理所有实例，包含完整状态管理
   */
  const processMultipleInstances = async (taskId: string): Promise<boolean> => {
    try {
      const cache = frameInstanceCaches.get(taskId);
      if (!cache) {
        throw new Error(`任务 ${taskId} 的实例缓存不存在`);
      }

      const instances = cache.map((c) => c.instanceConfig);

      // 按顺序发送所有实例
      for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex++) {
        // 检查任务是否仍在运行状态
        if (!isTaskStillRunning(taskId)) {
          console.log('任务在实例发送过程中被停止');
          return false;
        }

        try {
          // 使用带状态管理的实例处理方法
          const isLastInstance = instanceIndex === instances.length - 1;
          const success = await processInstance(
            taskId,
            instanceIndex,
            instances.length,
            isLastInstance,
          );

          if (!success) {
            console.error(`实例索引 ${instanceIndex} 处理失败`);
            return false; // 任何一个实例失败都返回失败
          }
        } catch (error) {
          console.error(`处理实例索引 ${instanceIndex} 时出错:`, error);
          return false; // 任何一个实例出错都返回失败
        }
      }

      return true;
    } catch (error) {
      console.error('批量处理实例时出错:', error);
      sendTasksStore.updateTaskStatus(
        taskId,
        'error',
        error instanceof Error ? error.message : '批量处理失败',
      );
      return false;
    }
  };

  // ============= 任务执行函数 =============

  /**
   * 开始执行任务
   */
  async function startTask(taskId: string): Promise<boolean> {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) {
      processingError.value = '找不到指定的任务';
      return false;
    }

    if (task.status === 'running') {
      return true; // 任务已在运行中
    }

    isProcessing.value = true;
    processingError.value = null;

    try {
      // 根据任务类型执行不同的启动逻辑
      switch (task.type) {
        case 'sequential':
          return await startSequentialTask(task);
        case 'timed':
          return await startTimedTask(task);
        case 'triggered':
          return await startTriggeredTask(task);
        default:
          throw new Error(`未知的任务类型: ${task.type}`);
      }
    } catch (e) {
      console.error(`启动任务 ${task.name} 失败:`, e);
      processingError.value = e instanceof Error ? e.message : '启动任务失败';
      sendTasksStore.updateTaskStatus(task.id, 'error', processingError.value);
      return false;
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * 开始顺序发送任务
   */
  async function startSequentialTask(task: SendTask): Promise<boolean> {
    if (!task.config || !('instances' in task.config) || !task.config.instances.length) {
      throw new Error('任务配置无效: 没有实例');
    }

    try {
      // 初始化实例缓存
      initializeFrameInstanceCache(task.id, task.config.instances);

      // 更新任务状态和进度
      sendTasksStore.updateTaskStatus(task.id, 'running');
      sendTasksStore.updateTaskProgressCached(task.id, {
        currentCount: 0,
        totalCount: task.config.instances.length,
        percentage: 0,
        currentInstanceIndex: 0,
      });

      // 直接使用统一的多实例处理函数
      const success = await processMultipleInstances(task.id);

      if (!success) {
        clearFrameInstanceCache(task.id);
        return false; // 错误已在processMultipleInstances中处理
      }

      // 所有实例处理完成，更新任务状态（强制同步缓存）
      sendTasksStore.forceSyncCache();
      sendTasksStore.updateTaskStatus(task.id, 'completed');
      sendTasksStore.updateTaskProgressCached(task.id, {
        percentage: 100,
      });

      // 清理缓存
      clearFrameInstanceCache(task.id);

      return true;
    } catch (error) {
      console.error(`顺序发送任务 ${task.name} 执行失败:`, error);
      sendTasksStore.updateTaskStatus(
        task.id,
        'error',
        error instanceof Error ? error.message : '执行失败',
      );
      clearFrameInstanceCache(task.id);
      return false;
    }
  }

  /**
   * 通用定时发送执行器
   */
  const createTimedSender = (
    task: SendTask,
    config: TimedTaskConfig,
    taskTimerIds: ReturnType<typeof createTaskTimerIds>,
    sendFunction: () => Promise<boolean>,
  ) => {
    let currentCount = 0;

    const executeOnce = async (): Promise<void> => {
      try {
        // 检查任务是否仍在运行
        if (!isTaskStillRunning(task.id)) {
          console.log('定时任务已停止，取消发送');
          return;
        }

        // 检查是否已达到发送次数限制
        if (!config.isInfinite && currentCount >= config.repeatCount) {
          console.log('定时任务已达到发送次数限制，停止发送');
          await taskTimerIds.cleanup();
          sendTasksStore.updateTaskStatus(task.id, 'completed');
          sendTasksStore.updateTaskProgressCached(task.id, {
            currentCount: config.repeatCount,
            percentage: 100,
          });
          clearFrameInstanceCache(task.id);
          return;
        }

        // 更新缓存实例的参数变化
        const cache = frameInstanceCaches.get(task.id);
        if (cache) {
          cache.forEach((cachedInstance) => {
            updateCachedInstanceFields(cachedInstance, currentCount);
          });
        }

        // 执行发送
        const success = await sendFunction();
        if (!success) {
          return; // 连接错误已处理
        }

        currentCount++;

        // 更新进度（使用缓存版本）
        if (!config.isInfinite) {
          const percentage = Math.min(100, Math.floor((currentCount / config.repeatCount) * 100));
          sendTasksStore.updateTaskProgressCached(task.id, {
            currentCount,
            percentage,
          });

          // 检查是否完成
          if (currentCount >= config.repeatCount) {
            console.log('定时发送任务完成');
            await taskTimerIds.cleanup();
            sendTasksStore.forceSyncCache(); // 强制同步缓存
            sendTasksStore.updateTaskStatus(task.id, 'completed');
            sendTasksStore.updateTaskProgressCached(task.id, {
              currentCount: config.repeatCount,
              percentage: 100,
            });
            clearFrameInstanceCache(task.id);
            return;
          }
        } else {
          // 无限循环模式，只更新计数（使用缓存版本）
          sendTasksStore.updateTaskProgressCached(task.id, {
            currentCount,
            nextExecutionTime: Date.now() + config.sendInterval,
          });
        }
      } catch (error) {
        console.error('定时发送失败:', error);
        sendTasksStore.updateTaskStatus(
          task.id,
          'error',
          error instanceof Error ? error.message : '发送失败',
        );
        await taskTimerIds.cleanup();
        clearFrameInstanceCache(task.id);
      }
    };

    const start = async () => {
      // 立即发送第一次
      await executeOnce();

      // 如果需要重复发送，设置定时器
      if (config.isInfinite || config.repeatCount > 1) {
        // 检查任务是否仍在运行且还没完成
        if (
          isTaskStillRunning(task.id) &&
          (config.isInfinite || currentCount < config.repeatCount)
        ) {
          const timerId = taskTimerIds.createTimerId('interval', 'timed-send');
          const timerConfig: TimerConfig = {
            id: timerId,
            type: 'interval',
            delay: config.sendInterval,
            interval: config.sendInterval,
            autoStart: true,
          };

          await timerManager.registerTimer(timerConfig, executeOnce);
          console.log(
            `设置定时器，间隔: ${config.sendInterval}ms, 剩余次数: ${config.isInfinite ? '∞' : config.repeatCount - currentCount}`,
          );
        }
      }
    };

    return { start };
  };

  /**
   * 开始定时发送任务
   */
  async function startTimedTask(task: SendTask): Promise<boolean> {
    if (
      !task.config ||
      !('instances' in task.config) ||
      !task.config.instances.length ||
      !('sendInterval' in task.config)
    ) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TimedTaskConfig;

    console.log('启动定时发送任务:', {
      taskId: task.id,
      sendInterval: config.sendInterval,
      repeatCount: config.repeatCount,
      isInfinite: config.isInfinite,
      instancesCount: config.instances.length,
    });

    try {
      // 初始化实例缓存
      initializeFrameInstanceCache(task.id, config.instances);

      // 创建任务定时器ID管理器
      const taskTimerIds = createTaskTimerIds(task.id);

      // 更新任务状态
      sendTasksStore.updateTaskStatus(task.id, 'running');

      // 计算总发送次数
      const totalCount = config.isInfinite ? Number.MAX_SAFE_INTEGER : config.repeatCount;

      sendTasksStore.updateTaskProgressCached(task.id, {
        currentCount: 0,
        totalCount,
        percentage: 0,
        currentInstanceIndex: 0,
      });

      // 创建发送函数：发送一轮所有实例
      const sendFunction = async (): Promise<boolean> => {
        return await processMultipleInstances(task.id);
      };

      // 使用通用定时发送器
      const timedSender = createTimedSender(task, config, taskTimerIds, sendFunction);
      await timedSender.start();

      // 存储定时器ID到任务中
      sendTasksStore.updateTask(task.id, {
        timers: taskTimerIds.getTimerIds(),
      });

      return true;
    } catch (error) {
      console.error(`定时发送任务 ${task.name} 执行失败:`, error);
      sendTasksStore.updateTaskStatus(
        task.id,
        'error',
        error instanceof Error ? error.message : '执行失败',
      );
      clearFrameInstanceCache(task.id);
      return false;
    }
  }

  /**
   * 开始触发发送任务
   */
  async function startTriggeredTask(task: SendTask): Promise<boolean> {
    if (!task.config || !('instances' in task.config) || !task.config.instances.length) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TriggerTaskConfig;

    try {
      // 初始化实例缓存
      initializeFrameInstanceCache(task.id, config.instances);

      // 根据触发类型处理
      if (config.triggerType === 'time') {
        // 时间触发逻辑
        return await startTimedTriggeredTask(task, config);
      } else {
        // 条件触发逻辑 (原有逻辑)
        if (!config.sourceId || !config.triggerFrameId || !config.conditions) {
          throw new Error('条件触发配置无效');
        }

        // 更新任务状态为等待触发
        sendTasksStore.updateTaskStatus(task.id, 'waiting-trigger');

        sendTasksStore.updateTaskProgressCached(task.id, {
          currentCount: 0,
          totalCount: 0,
          percentage: 0,
        });

        // 设置监听逻辑
        console.log(`注册触发监听器: ${task.id}`, {
          sourceId: config.sourceId,
          triggerFrameId: config.triggerFrameId,
          conditionsCount: config.conditions?.length || 0,
          continueListening: config.continueListening ?? true,
          responseDelay: config.responseDelay || 0,
          instancesCount: config.instances.length,
        });

        // 注册触发监听器
        sendTasksStore.registerTaskTriggerListener(task.id, {
          sourceId: config.sourceId,
          triggerFrameId: config.triggerFrameId,
          conditions: config.conditions || [],
          continueListening: config.continueListening ?? true,
          responseDelay: config.responseDelay || 0,
        });

        return true;
      }
    } catch (error) {
      console.error(`启动触发发送任务失败:`, error);
      clearFrameInstanceCache(task.id);
      throw error;
    }
  }

  /**
   * 通用时间触发执行器
   */
  const createScheduledExecutor = (
    task: SendTask,
    config: TriggerTaskConfig,
    taskTimerIds: ReturnType<typeof createTaskTimerIds>,
    sendFunction: () => Promise<boolean>,
  ) => {
    if (!config.executeTime) {
      throw new Error('时间触发任务缺少执行时间');
    }

    const timeCalculator = createTimeCalculator({
      executeTime: config.executeTime,
      isRecurring: config.isRecurring || false,
      ...(config.recurringType && { recurringType: config.recurringType }),
      ...(config.recurringInterval && { recurringInterval: config.recurringInterval }),
      ...(config.endTime && { endTime: config.endTime }),
    });

    const executeTask = async () => {
      try {
        // 检查任务是否仍在运行状态
        if (!isTaskStillRunning(task.id, ['waiting-schedule', 'running'])) {
          console.log('时间触发任务已停止，取消执行');
          return;
        }

        // 更新状态为运行中
        sendTasksStore.updateTaskStatus(task.id, 'running');

        console.log(`时间触发任务执行: ${task.name}`, {
          executeTime: config.executeTime,
          isRecurring: config.isRecurring,
        });

        const success = await sendFunction();
        if (!success) {
          return; // 连接错误已处理
        }

        // 更新进度（使用缓存版本）
        const currentProgress = task.progress?.currentCount || 0;
        sendTasksStore.updateTaskProgressCached(task.id, {
          currentCount: currentProgress + 1,
        });

        // 处理重复执行
        if (config.isRecurring) {
          const nextTime = timeCalculator.calculateNextExecutionTime(new Date());
          if (nextTime) {
            // 更新状态为等待下次执行
            sendTasksStore.updateTaskStatus(task.id, 'waiting-schedule');
            sendTasksStore.updateTaskProgressCached(task.id, {
              nextExecutionTime: nextTime.getTime(),
            });

            // 设置下次执行的定时器
            const delay = nextTime.getTime() - Date.now();
            console.log(`设置下次执行时间: ${nextTime.toLocaleString()}, 延迟: ${delay}ms`);
            const timerId = taskTimerIds.createTimerId('timeout', 'recurring');
            const timerConfig: TimerConfig = {
              id: timerId,
              type: 'timeout',
              delay,
              interval: 0,
              autoStart: true,
            };
            await timerManager.registerTimer(timerConfig, executeTask);
          } else {
            // 重复执行已结束
            console.log('时间触发任务重复执行已结束');
            sendTasksStore.forceSyncCache(); // 强制同步缓存
            sendTasksStore.updateTaskStatus(task.id, 'completed');
            sendTasksStore.updateTaskProgressCached(task.id, {
              percentage: 100,
            });
          }
        } else {
          // 一次性执行完成
          console.log('时间触发任务执行完成');
          sendTasksStore.forceSyncCache(); // 强制同步缓存
          sendTasksStore.updateTaskStatus(task.id, 'completed');
          sendTasksStore.updateTaskProgressCached(task.id, {
            percentage: 100,
          });
        }
      } catch (error) {
        console.error('时间触发任务执行失败:', error);
        sendTasksStore.updateTaskStatus(
          task.id,
          'error',
          error instanceof Error ? error.message : '执行失败',
        );
        await taskTimerIds.cleanup();
      }
    };

    const start = async () => {
      const now = new Date();
      const executeTime = new Date(config.executeTime!);

      // 检查执行时间是否有效
      if (executeTime <= now && !config.isRecurring) {
        throw new Error('执行时间已过期');
      }

      // 更新任务状态为等待时间触发
      sendTasksStore.updateTaskStatus(task.id, 'waiting-schedule');
      sendTasksStore.updateTaskProgressCached(task.id, {
        currentCount: 0,
        totalCount: config.isRecurring ? Number.MAX_SAFE_INTEGER : 1,
        percentage: 0,
        nextExecutionTime: executeTime.getTime(),
      });

      // 计算初始执行时间
      const nextExecutionTime = timeCalculator.calculateNextExecutionTime(now);
      if (!nextExecutionTime) {
        throw new Error('无法计算执行时间');
      }

      // 设置初始执行定时器
      const initialDelay = nextExecutionTime.getTime() - now.getTime();
      console.log(
        `设置时间触发任务: ${task.name}, 执行时间: ${nextExecutionTime.toLocaleString()}, 延迟: ${initialDelay}ms`,
      );

      if (initialDelay > 0) {
        const timerId = taskTimerIds.createTimerId('timeout', 'initial');
        const timerConfig: TimerConfig = {
          id: timerId,
          type: 'timeout',
          delay: initialDelay,
          interval: 0,
          autoStart: true,
        };
        await timerManager.registerTimer(timerConfig, executeTask);
      } else {
        // 立即执行
        await executeTask();
      }
    };

    return { start };
  };

  /**
   * 开始时间触发任务
   */
  async function startTimedTriggeredTask(
    task: SendTask,
    config: TriggerTaskConfig,
  ): Promise<boolean> {
    // 创建任务定时器ID管理器
    const taskTimerIds = createTaskTimerIds(task.id);

    // 创建发送函数：发送所有实例
    const sendFunction = async (): Promise<boolean> => {
      return await processMultipleInstances(task.id);
    };

    try {
      // 使用通用时间触发执行器
      const scheduledExecutor = createScheduledExecutor(task, config, taskTimerIds, sendFunction);
      await scheduledExecutor.start();

      // 存储定时器ID
      sendTasksStore.updateTask(task.id, {
        timers: taskTimerIds.getTimerIds(),
      });

      return true;
    } catch (error) {
      console.error(`时间触发任务 ${task.name} 执行失败:`, error);
      sendTasksStore.updateTaskStatus(
        task.id,
        'error',
        error instanceof Error ? error.message : '执行失败',
      );
      await taskTimerIds.cleanup();
      clearFrameInstanceCache(task.id);
      return false;
    }
  }

  return {
    // 状态
    isProcessing,
    processingError,

    // 任务执行
    startTask,
    startSequentialTask,
    startTimedTask,
    startTriggeredTask,

    // 触发任务专用方法
    processSingleInstance,
    processInstance,
    processMultipleInstances,

    // 缓存管理方法
    initializeFrameInstanceCache,
    updateCachedInstanceFields,
    getCachedFrameInstance,
    clearFrameInstanceCache,
  };
}
