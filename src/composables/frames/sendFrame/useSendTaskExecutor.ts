/**
 * 发送任务执行器 - 可组合函数
 *
 * 负责各种类型任务的执行
 */
import { ref } from 'vue';
import { useSerialStore } from '../../../stores/serialStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import {
  useSendTasksStore,
  SendTask,
  TimedTaskConfig,
  TriggerTaskConfig,
  FrameInstanceInTask,
} from '../../../stores/frames/sendTasksStore';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';
import { useConnectionTargetsStore } from '../../../stores/connectionTargetsStore';
import { useUnifiedSender } from './useUnifiedSender';

/**
 * 任务执行器可组合函数
 */
export function useSendTaskExecutor() {
  // 获取store实例
  const serialStore = useSerialStore();
  const sendFrameInstancesStore = useSendFrameInstancesStore();
  const sendTasksStore = useSendTasksStore();

  // 获取连接目标管理器用于解析目标ID
  const connectionTargetsStore = useConnectionTargetsStore();

  // 获取统一发送路由器
  const { sendFrameInstance: sendFrameInstanceUnified, isTargetAvailable } = useUnifiedSender();

  // 本地状态
  const isProcessing = ref(false);
  const processingError = ref<string | null>(null);

  // ============= 内部辅助函数 =============

  /**
   * 获取发送帧实例
   */
  const getSendFrameInstance = (instanceId: string): SendFrameInstance => {
    const instance = sendFrameInstancesStore.instances.find((i) => i.id === instanceId);
    if (!instance) {
      throw new Error(`找不到实例: ${instanceId}`);
    }
    return instance;
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
   * 清理定时器
   */
  const cleanupTimers = (timers: number[]): void => {
    timers.forEach((timerId) => {
      clearTimeout(timerId);
      clearInterval(timerId);
    });
  };

  /**
   * 发送帧到目标并处理错误（使用统一发送路由器）
   */
  const sendFrameToTarget = async (
    targetId: string,
    instance: SendFrameInstance,
    taskId: string,
    taskName: string,
    timers: number[],
  ): Promise<boolean> => {
    try {
      const result = await sendFrameInstanceUnified(targetId, instance);

      if (!result.success) {
        // 检查是否是连接问题
        const isAvailable = await isTargetAvailable(targetId);
        if (!isAvailable) {
          console.log(`连接已断开 (${targetId})，暂停任务: ${taskName}`);
          sendTasksStore.updateTaskStatus(taskId, 'paused', '连接已断开');
          cleanupTimers(timers);
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
      const instanceInterval = instanceConfig.interval || 1000;
      await new Promise((resolve) => setTimeout(resolve, instanceInterval));
    }
  };

  /**
   * 处理单个实例的发送逻辑
   */
  const processSingleInstance = async (
    instanceConfig: FrameInstanceInTask,
    taskId: string,
    taskName: string,
    timers: number[],
    isLastInstance: boolean = true,
  ): Promise<boolean> => {
    try {
      // 获取实例
      const instance = getSendFrameInstance(instanceConfig.instanceId);

      // 发送帧（使用统一发送路由器）
      const success = await sendFrameToTarget(
        instanceConfig.targetId,
        instance,
        taskId,
        taskName,
        timers,
      );
      if (!success) {
        return false; // 连接错误已在函数内处理
      }

      // 添加实例间延时
      await addInstanceDelay(instanceConfig, isLastInstance);

      // 异步更新发送统计（不阻塞发送流程）
      setTimeout(() => {
        sendFrameInstancesStore.updateSendStats(instanceConfig.instanceId);
      }, 0);

      return true;
    } catch (error) {
      console.error(`发送实例 ${instanceConfig.instanceId} 时出错:`, error);
      throw error;
    }
  };

  /**
   * 处理单个实例（包含完整状态管理）
   * 用于顺序发送和触发发送任务
   */
  const processInstance = async (
    instanceConfig: FrameInstanceInTask,
    taskId: string,
    taskName: string,
    timers: number[],
    instanceIndex: number,
    totalInstances: number,
    isLastInstance: boolean = true,
  ): Promise<boolean> => {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task || !task.config || !('instances' in task.config)) {
      throw new Error('任务配置无效');
    }

    // 更新当前处理的实例状态为 running
    const updatedInstances = [...task.config.instances];
    updatedInstances[instanceIndex] = {
      id: instanceConfig.id,
      instanceId: instanceConfig.instanceId,
      targetId: instanceConfig.targetId,
      interval: instanceConfig.interval || 0,
      status: 'running',
    };

    sendTasksStore.updateTask(taskId, {
      config: {
        ...task.config,
        instances: updatedInstances,
      },
    });

    sendTasksStore.updateTaskProgress(taskId, {
      currentCount: instanceIndex,
      percentage: Math.floor((instanceIndex / totalInstances) * 100),
      currentInstanceIndex: instanceIndex,
    });

    try {
      // 使用基础的实例发送方法
      const success = await processSingleInstance(
        instanceConfig,
        taskId,
        taskName,
        timers,
        isLastInstance,
      );

      if (!success) {
        return false; // 连接错误已在函数内处理
      }

      // 更新实例状态为成功
      updatedInstances[instanceIndex] = {
        id: instanceConfig.id,
        instanceId: instanceConfig.instanceId,
        targetId: instanceConfig.targetId,
        interval: instanceConfig.interval || 0,
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
        id: instanceConfig.id,
        instanceId: instanceConfig.instanceId,
        targetId: instanceConfig.targetId,
        interval: instanceConfig.interval || 0,
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
  const processMultipleInstances = async (
    instances: FrameInstanceInTask[],
    taskId: string,
    taskName: string,
    timers: number[],
  ): Promise<boolean> => {
    try {
      // 按顺序发送所有实例
      for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex++) {
        // 检查任务是否仍在运行状态
        if (!isTaskStillRunning(taskId)) {
          console.log('任务在实例发送过程中被停止');
          return false;
        }

        const instanceConfig = instances[instanceIndex];
        if (!instanceConfig) {
          console.warn(`无效的实例配置，索引: ${instanceIndex}`);
          continue;
        }

        try {
          // 使用带状态管理的实例处理方法
          const isLastInstance = instanceIndex === instances.length - 1;
          const success = await processInstance(
            instanceConfig,
            taskId,
            taskName,
            timers,
            instanceIndex,
            instances.length,
            isLastInstance,
          );

          if (!success) {
            console.error(`实例 ${instanceConfig.instanceId} 处理失败`);
            return false; // 任何一个实例失败都返回失败
          }
        } catch (error) {
          console.error(`处理实例 ${instanceConfig.instanceId} 时出错:`, error);
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
        case 'timed-single':
          return await startTimedSingleTask(task);
        case 'timed-multiple':
          return await startTimedMultipleTask(task);
        case 'triggered-single':
          return await startTriggeredSingleTask(task);
        case 'triggered-multiple':
          return await startTriggeredMultipleTask(task);
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

    // 更新任务状态和进度
    sendTasksStore.updateTaskStatus(task.id, 'running');
    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: task.config.instances.length,
      percentage: 0,
      currentInstanceIndex: 0,
    });

    // 存储定时器ID，用于后续清理
    const timers: number[] = [];

    try {
      // 直接使用统一的多实例处理函数
      const success = await processMultipleInstances(
        task.config.instances,
        task.id,
        task.name,
        timers,
      );

      if (!success) {
        return false; // 错误已在processMultipleInstances中处理
      }

      // 所有实例处理完成，更新任务状态
      sendTasksStore.updateTaskStatus(task.id, 'completed');
      sendTasksStore.updateTaskProgress(task.id, {
        percentage: 100,
      });

      // 存储定时器ID到任务中
      sendTasksStore.updateTask(task.id, {
        timers,
      });

      return true;
    } catch (error) {
      console.error(`顺序发送任务 ${task.name} 执行失败:`, error);
      sendTasksStore.updateTaskStatus(
        task.id,
        'error',
        error instanceof Error ? error.message : '执行失败',
      );
      cleanupTimers(timers);
      return false;
    }
  }

  /**
   * 开始单实例定时发送任务
   */
  async function startTimedSingleTask(task: SendTask): Promise<boolean> {
    if (
      !task.config ||
      !('instances' in task.config) ||
      !task.config.instances.length ||
      !('sendInterval' in task.config)
    ) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TimedTaskConfig;
    const instanceConfig = config.instances[0];
    if (!instanceConfig) {
      throw new Error('无效的实例配置');
    }

    // 获取实例（使用提取的函数）
    const instance = getSendFrameInstance(instanceConfig.instanceId);

    // 更新任务状态
    sendTasksStore.updateTaskStatus(task.id, 'running');

    // 计算总发送次数
    const totalCount = config.isInfinite ? -1 : config.repeatCount;

    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: totalCount === -1 ? Number.MAX_SAFE_INTEGER : totalCount,
      percentage: 0,
    });

    const timers: number[] = [];
    let currentCount = 0;

    // 发送帧的函数
    const sendFrame = async () => {
      try {
        // 检查任务是否仍在运行
        if (!isTaskStillRunning(task.id)) {
          console.log('单实例定时任务已停止，取消发送');
          return;
        }

        // 检查是否已达到发送次数限制
        if (!config.isInfinite && currentCount >= config.repeatCount) {
          console.log('单实例定时任务已达到发送次数限制，停止发送');
          cleanupTimers(timers);
          sendTasksStore.updateTaskStatus(task.id, 'completed');
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount: config.repeatCount,
            percentage: 100,
          });
          return;
        }

        // 使用提取的函数发送帧
        const targetPath = connectionTargetsStore.getValidatedTargetPath(instanceConfig.targetId);
        if (!targetPath) {
          throw new Error(`无效的目标ID: ${instanceConfig.targetId}`);
        }

        console.log(
          `单实例定时发送帧 ${currentCount + 1}/${config.isInfinite ? '∞' : config.repeatCount} 到目标: ${targetPath}`,
          {
            instanceId: instanceConfig.instanceId,
            sendInterval: config.sendInterval,
            isConnected: serialStore.isPortConnected(targetPath),
          },
        );

        const success = await sendFrameToTarget(
          instanceConfig.targetId,
          instance,
          task.id,
          task.name,
          timers,
        );

        if (!success) {
          return; // 连接错误已处理
        }

        currentCount++;

        // 更新进度
        if (!config.isInfinite) {
          const percentage = Math.min(100, Math.floor((currentCount / config.repeatCount) * 100));
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount,
            percentage,
          });

          console.log(`单实例定时发送进度: ${currentCount}/${config.repeatCount} (${percentage}%)`);

          // 检查是否完成
          if (currentCount >= config.repeatCount) {
            console.log('单实例定时发送任务完成');
            cleanupTimers(timers);
            sendTasksStore.updateTaskStatus(task.id, 'completed');
            sendTasksStore.updateTaskProgress(task.id, {
              currentCount: config.repeatCount,
              percentage: 100,
            });
            return;
          }
        } else {
          // 无限循环模式，只更新计数
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount,
            nextExecutionTime: Date.now() + config.sendInterval,
          });
          console.log(
            `单实例定时发送进度: ${currentCount}/∞, 下次发送时间: ${new Date(Date.now() + config.sendInterval).toLocaleTimeString()}`,
          );
        }
      } catch (error) {
        console.error('单实例定时发送帧失败:', error);
        sendTasksStore.updateTaskStatus(
          task.id,
          'error',
          error instanceof Error ? error.message : '发送失败',
        );
        cleanupTimers(timers);
      }
    };

    // 立即发送第一次
    await sendFrame();

    // 如果需要重复发送，设置定时器
    if (config.isInfinite || config.repeatCount > 1) {
      // 检查任务是否仍在运行且还没完成
      if (isTaskStillRunning(task.id) && (config.isInfinite || currentCount < config.repeatCount)) {
        const intervalId = window.setInterval(sendFrame, config.sendInterval);
        timers.push(intervalId);
        console.log(
          `设置单实例定时器，间隔: ${config.sendInterval}ms, 剩余次数: ${config.isInfinite ? '∞' : config.repeatCount - currentCount}, ID: ${intervalId}`,
        );
      }
    }

    // 存储定时器ID
    sendTasksStore.updateTask(task.id, {
      timers,
    });

    return true;
  }

  /**
   * 开始多实例定时发送任务
   */
  async function startTimedMultipleTask(task: SendTask): Promise<boolean> {
    if (
      !task.config ||
      !('instances' in task.config) ||
      !task.config.instances.length ||
      !('sendInterval' in task.config)
    ) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TimedTaskConfig;

    console.log('启动多实例定时发送任务:', {
      taskId: task.id,
      sendInterval: config.sendInterval,
      repeatCount: config.repeatCount,
      isInfinite: config.isInfinite,
      instancesCount: config.instances.length,
    });

    // 更新任务状态
    sendTasksStore.updateTaskStatus(task.id, 'running');

    // 计算总发送次数
    const totalCount = config.isInfinite ? Number.MAX_SAFE_INTEGER : config.repeatCount;

    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount,
      percentage: 0,
      currentInstanceIndex: 0,
    });

    const timers: number[] = [];
    let currentRoundCount = 0;

    // 发送一轮所有实例的函数
    const sendOneRound = async (): Promise<void> => {
      // 检查任务是否仍在运行
      if (!isTaskStillRunning(task.id)) {
        console.log('多实例定时任务已停止，取消发送');
        return;
      }

      // 检查是否已达到轮次限制
      if (!config.isInfinite && currentRoundCount >= config.repeatCount) {
        console.log('多实例定时任务已达到轮次限制，停止发送');
        cleanupTimers(timers);
        sendTasksStore.updateTaskStatus(task.id, 'completed');
        sendTasksStore.updateTaskProgress(task.id, {
          currentCount: config.repeatCount,
          percentage: 100,
        });
        return;
      }

      currentRoundCount++;
      console.log(`开始第 ${currentRoundCount} 轮发送，共 ${config.instances.length} 个实例`);

      try {
        // 按顺序发送所有实例
        for (let instanceIndex = 0; instanceIndex < config.instances.length; instanceIndex++) {
          // 再次检查任务状态
          if (!isTaskStillRunning(task.id)) {
            console.log('任务在实例发送过程中被停止');
            return;
          }

          const instanceConfig = config.instances[instanceIndex];
          if (!instanceConfig) {
            console.warn(`无效的实例配置，索引: ${instanceIndex}`);
            continue;
          }

          // 更新当前处理的实例索引
          sendTasksStore.updateTaskProgress(task.id, {
            currentInstanceIndex: instanceIndex,
          });

          try {
            // 使用提取的函数处理实例发送
            const isLastInstance = instanceIndex === config.instances.length - 1;
            const success = await processInstance(
              instanceConfig,
              task.id,
              task.name,
              timers,
              instanceIndex,
              config.instances.length,
              isLastInstance,
            );

            if (!success) {
              return; // 连接错误已处理
            }

            console.log(`发送实例 ${instanceIndex + 1}/${config.instances.length} 到目标成功`, {
              instanceId: instanceConfig.instanceId,
              round: currentRoundCount,
            });
          } catch (error) {
            console.error(`发送实例 ${instanceConfig.instanceId} 时出错:`, error);
            continue;
          }
        }

        // 更新进度
        if (!config.isInfinite) {
          const percentage = Math.min(
            100,
            Math.floor((currentRoundCount / config.repeatCount) * 100),
          );
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount: currentRoundCount,
            percentage,
          });

          console.log(
            `多实例定时发送进度: ${currentRoundCount}/${config.repeatCount} (${percentage}%)`,
          );

          // 检查是否完成
          if (currentRoundCount >= config.repeatCount) {
            console.log('多实例定时发送任务完成');
            cleanupTimers(timers);
            sendTasksStore.updateTaskStatus(task.id, 'completed');
            sendTasksStore.updateTaskProgress(task.id, {
              currentCount: config.repeatCount,
              percentage: 100,
            });
            return;
          }
        } else {
          // 无限循环模式，只更新计数
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount: currentRoundCount,
            nextExecutionTime: Date.now() + config.sendInterval,
          });
          console.log(`多实例定时发送进度: ${currentRoundCount}/∞`);
        }

        console.log(`第 ${currentRoundCount} 轮发送完成，${config.sendInterval}ms 后开始下一轮...`);

        // 只有在需要继续且任务仍在运行时，才设置下一轮的定时器
        if (isTaskStillRunning(task.id)) {
          if (config.isInfinite || currentRoundCount < config.repeatCount) {
            console.log(`设置下一轮定时器，间隔: ${config.sendInterval}ms`);
            const nextTimerId = window.setTimeout(() => {
              sendOneRound();
            }, config.sendInterval);
            timers.push(nextTimerId);
          }
        }
      } catch (error) {
        console.error('发送轮次失败:', error);
        sendTasksStore.updateTaskStatus(
          task.id,
          'error',
          error instanceof Error ? error.message : '发送失败',
        );
        cleanupTimers(timers);
      }
    };

    // 立即发送第一轮
    await sendOneRound();

    // 存储定时器ID到任务中
    sendTasksStore.updateTask(task.id, {
      timers,
    });

    return true;
  }

  /**
   * 开始单实例触发发送任务
   */
  async function startTriggeredSingleTask(task: SendTask): Promise<boolean> {
    if (!task.config || !('instances' in task.config) || !task.config.instances.length) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TriggerTaskConfig;
    const instanceConfig = config.instances[0];

    if (!instanceConfig) {
      throw new Error('无效的实例配置');
    }

    // 获取实例（使用提取的函数）
    const instance = getSendFrameInstance(instanceConfig.instanceId);

    // 根据触发类型处理
    if (config.triggerType === 'time') {
      // 时间触发逻辑
      return await startTimedTriggeredSingleTask(task, config, instanceConfig, instance);
    } else {
      // 条件触发逻辑 (原有逻辑)
      if (!config.sourceId || !config.triggerFrameId || !config.conditions) {
        throw new Error('条件触发配置无效');
      }

      // 更新任务状态为等待触发
      sendTasksStore.updateTaskStatus(task.id, 'waiting-trigger');

      sendTasksStore.updateTaskProgress(task.id, {
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
  }

  /**
   * 开始多实例触发发送任务
   */
  async function startTriggeredMultipleTask(task: SendTask): Promise<boolean> {
    if (!task.config || !('instances' in task.config) || !task.config.instances.length) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TriggerTaskConfig;

    // 根据触发类型处理
    if (config.triggerType === 'time') {
      // 时间触发逻辑
      return await startTimedTriggeredMultipleTask(task, config);
    } else {
      // 条件触发逻辑 (原有逻辑)
      if (!config.sourceId || !config.triggerFrameId || !config.conditions) {
        throw new Error('条件触发配置无效');
      }

      // 更新任务状态为等待触发
      sendTasksStore.updateTaskStatus(task.id, 'waiting-trigger');

      sendTasksStore.updateTaskProgress(task.id, {
        currentCount: 0,
        totalCount: 0,
        percentage: 0,
      });

      // 设置监听逻辑
      console.log(`注册多实例触发监听器: ${task.id}`, {
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
  }

  /**
   * 开始单实例时间触发任务
   */
  async function startTimedTriggeredSingleTask(
    task: SendTask,
    config: TriggerTaskConfig,
    instanceConfig: FrameInstanceInTask,
    instance: SendFrameInstance,
  ): Promise<boolean> {
    if (!config.executeTime) {
      throw new Error('时间触发任务缺少执行时间');
    }

    const executeTime = new Date(config.executeTime);
    const now = new Date();

    // 检查执行时间是否有效
    if (executeTime <= now && !config.isRecurring) {
      throw new Error('执行时间已过期');
    }

    // 更新任务状态为等待时间触发
    sendTasksStore.updateTaskStatus(task.id, 'waiting-schedule');
    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: config.isRecurring ? Number.MAX_SAFE_INTEGER : 1,
      percentage: 0,
      nextExecutionTime: executeTime.getTime(),
    });

    const timers: number[] = [];

    // 计算下次执行时间
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

    // 执行任务的函数
    const executeTask = async () => {
      try {
        // 检查任务是否仍在运行状态
        if (!isTaskStillRunning(task.id, ['waiting-schedule', 'running'])) {
          console.log('时间触发任务已停止，取消执行');
          return;
        }

        // 更新状态为运行中
        sendTasksStore.updateTaskStatus(task.id, 'running');

        // 使用提取的函数发送帧
        const targetPath = connectionTargetsStore.getValidatedTargetPath(instanceConfig.targetId);
        if (!targetPath) {
          throw new Error(`无效的目标ID: ${instanceConfig.targetId}`);
        }

        console.log(`时间触发发送帧到目标: ${targetPath}`, {
          instanceId: instanceConfig.instanceId,
          executeTime: config.executeTime,
          isRecurring: config.isRecurring,
          isConnected: serialStore.isPortConnected(targetPath),
        });

        const success = await sendFrameToTarget(
          instanceConfig.targetId,
          instance,
          task.id,
          task.name,
          timers,
        );

        if (!success) {
          return; // 连接错误已处理
        }

        // 更新进度
        const currentProgress = task.progress?.currentCount || 0;
        sendTasksStore.updateTaskProgress(task.id, {
          currentCount: currentProgress + 1,
        });

        // 处理重复执行
        if (config.isRecurring) {
          const nextTime = calculateNextExecutionTime(new Date());
          if (nextTime) {
            // 更新状态为等待下次执行
            sendTasksStore.updateTaskStatus(task.id, 'waiting-schedule');
            sendTasksStore.updateTaskProgress(task.id, {
              nextExecutionTime: nextTime.getTime(),
            });

            // 设置下次执行的定时器
            const delay = nextTime.getTime() - Date.now();
            console.log(`设置下次执行时间: ${nextTime.toLocaleString()}, 延迟: ${delay}ms`);
            const timerId = window.setTimeout(executeTask, delay);
            timers.push(timerId);
          } else {
            // 重复执行已结束
            console.log('时间触发任务重复执行已结束');
            sendTasksStore.updateTaskStatus(task.id, 'completed');
            sendTasksStore.updateTaskProgress(task.id, {
              percentage: 100,
            });
          }
        } else {
          // 一次性执行完成
          console.log('时间触发任务执行完成');
          sendTasksStore.updateTaskStatus(task.id, 'completed');
          sendTasksStore.updateTaskProgress(task.id, {
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
        cleanupTimers(timers);
      }
    };

    // 计算初始执行时间
    const nextExecutionTime = calculateNextExecutionTime(now);
    if (!nextExecutionTime) {
      throw new Error('无法计算执行时间');
    }

    // 设置初始执行定时器
    const initialDelay = nextExecutionTime.getTime() - now.getTime();
    console.log(
      `设置时间触发任务: ${task.name}, 执行时间: ${nextExecutionTime.toLocaleString()}, 延迟: ${initialDelay}ms`,
    );

    if (initialDelay > 0) {
      const timerId = window.setTimeout(executeTask, initialDelay);
      timers.push(timerId);
    } else {
      // 立即执行
      await executeTask();
    }

    // 存储定时器ID
    sendTasksStore.updateTask(task.id, {
      timers,
    });

    return true;
  }

  /**
   * 开始多实例时间触发任务
   */
  async function startTimedTriggeredMultipleTask(
    task: SendTask,
    config: TriggerTaskConfig,
  ): Promise<boolean> {
    if (!config.executeTime) {
      throw new Error('时间触发任务缺少执行时间');
    }

    const executeTime = new Date(config.executeTime);
    const now = new Date();

    // 检查执行时间是否有效
    if (executeTime <= now && !config.isRecurring) {
      throw new Error('执行时间已过期');
    }

    // 更新任务状态为等待时间触发
    sendTasksStore.updateTaskStatus(task.id, 'waiting-schedule');
    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: config.isRecurring ? Number.MAX_SAFE_INTEGER : 1,
      percentage: 0,
      nextExecutionTime: executeTime.getTime(),
      currentInstanceIndex: 0,
    });

    const timers: number[] = [];

    // 计算下次执行时间
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

    // 执行任务的函数
    const executeTask = async () => {
      try {
        // 检查任务是否仍在运行状态
        if (!isTaskStillRunning(task.id, ['waiting-schedule', 'running'])) {
          console.log('多实例时间触发任务已停止，取消执行');
          return;
        }

        // 更新状态为运行中
        sendTasksStore.updateTaskStatus(task.id, 'running');

        console.log(`开始执行多实例时间触发任务: ${task.name}`);

        // 按顺序发送所有实例
        for (let instanceIndex = 0; instanceIndex < config.instances.length; instanceIndex++) {
          // 再次检查任务状态
          if (!isTaskStillRunning(task.id)) {
            console.log('任务在实例发送过程中被停止');
            return;
          }

          const instanceConfig = config.instances[instanceIndex];
          if (!instanceConfig) {
            console.warn(`无效的实例配置，索引: ${instanceIndex}`);
            continue;
          }

          // 更新当前处理的实例索引
          sendTasksStore.updateTaskProgress(task.id, {
            currentInstanceIndex: instanceIndex,
          });

          try {
            // 使用提取的函数处理实例发送
            const isLastInstance = instanceIndex === config.instances.length - 1;
            const success = await processInstance(
              instanceConfig,
              task.id,
              task.name,
              timers,
              instanceIndex,
              config.instances.length,
              isLastInstance,
            );

            if (!success) {
              return; // 连接错误已处理
            }
          } catch (error) {
            console.error(`发送实例 ${instanceConfig.instanceId} 时出错:`, error);
            continue;
          }
        }

        // 更新进度
        const currentProgress = task.progress?.currentCount || 0;
        sendTasksStore.updateTaskProgress(task.id, {
          currentCount: currentProgress + 1,
        });

        // 处理重复执行
        if (config.isRecurring) {
          const nextTime = calculateNextExecutionTime(new Date());
          if (nextTime) {
            // 更新状态为等待下次执行
            sendTasksStore.updateTaskStatus(task.id, 'waiting-schedule');
            sendTasksStore.updateTaskProgress(task.id, {
              nextExecutionTime: nextTime.getTime(),
            });

            // 设置下次执行的定时器
            const delay = nextTime.getTime() - Date.now();
            console.log(`设置下次执行时间: ${nextTime.toLocaleString()}, 延迟: ${delay}ms`);
            const timerId = window.setTimeout(executeTask, delay);
            timers.push(timerId);
          } else {
            // 重复执行已结束
            console.log('多实例时间触发任务重复执行已结束');
            sendTasksStore.updateTaskStatus(task.id, 'completed');
            sendTasksStore.updateTaskProgress(task.id, {
              percentage: 100,
            });
          }
        } else {
          // 一次性执行完成
          console.log('多实例时间触发任务执行完成');
          sendTasksStore.updateTaskStatus(task.id, 'completed');
          sendTasksStore.updateTaskProgress(task.id, {
            percentage: 100,
          });
        }
      } catch (error) {
        console.error('多实例时间触发任务执行失败:', error);
        sendTasksStore.updateTaskStatus(
          task.id,
          'error',
          error instanceof Error ? error.message : '执行失败',
        );
        cleanupTimers(timers);
      }
    };

    // 计算初始执行时间
    const nextExecutionTime = calculateNextExecutionTime(now);
    if (!nextExecutionTime) {
      throw new Error('无法计算执行时间');
    }

    // 设置初始执行定时器
    const initialDelay = nextExecutionTime.getTime() - now.getTime();
    console.log(
      `设置多实例时间触发任务: ${task.name}, 执行时间: ${nextExecutionTime.toLocaleString()}, 延迟: ${initialDelay}ms`,
    );

    if (initialDelay > 0) {
      const timerId = window.setTimeout(executeTask, initialDelay);
      timers.push(timerId);
    } else {
      // 立即执行
      await executeTask();
    }

    // 存储定时器ID
    sendTasksStore.updateTask(task.id, {
      timers,
    });

    return true;
  }

  return {
    // 状态
    isProcessing,
    processingError,

    // 任务执行
    startTask,
    startSequentialTask,
    startTimedSingleTask,
    startTimedMultipleTask,
    startTriggeredSingleTask,
    startTriggeredMultipleTask,

    // 触发任务专用方法
    processSingleInstance,
    processInstance,
    processMultipleInstances,
  };
}
