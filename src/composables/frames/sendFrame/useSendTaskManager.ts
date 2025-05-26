/**
 * 发送任务管理器 - 可组合函数
 *
 * 负责任务的创建、启动、停止和监控
 */
import { ref, watch, computed, onUnmounted } from 'vue';
import { useSerialStore } from '../../../stores/serialStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import {
  useSendTasksStore,
  TaskType,
  TaskStatus,
  SendTask,
  FrameInstanceInTask,
  TaskConfigBase,
  TimedTaskConfig,
  TriggerTaskConfig,
} from '../../../stores/frames/sendTasksStore';
import { fileDialogManager } from '../../../utils/common/fileDialogManager';
import { pathAPI } from '../../../utils/electronApi';

/**
 * 任务管理器可组合函数
 */
export function useSendTaskManager() {
  // 获取store实例
  const serialStore = useSerialStore();
  const sendFrameInstancesStore = useSendFrameInstancesStore();
  const sendTasksStore = useSendTasksStore();

  // 本地状态
  const currentTaskId = ref<string | null>(null);
  const isProcessing = ref(false); // 是否有任务正在处理中
  const processingError = ref<string | null>(null);

  // 当前活动任务
  const activeTasks = computed(() => sendTasksStore.activeTasks);

  // 当前选中的任务
  const currentTask = computed(() => {
    if (!currentTaskId.value) return null;
    return sendTasksStore.getTaskById(currentTaskId.value);
  });

  /**
   * 创建顺序发送任务
   */
  function createSequentialTask(
    instances: FrameInstanceInTask[],
    name: string = '顺序发送任务',
    description: string = '',
  ): string | null {
    if (!instances.length) {
      processingError.value = '无法创建任务：没有实例';
      return null;
    }

    try {
      // 创建任务配置
      const taskConfig: TaskConfigBase = {
        instances,
        name,
        description,
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'sequential',
        status: 'idle',
        config: taskConfig,
      });

      currentTaskId.value = taskId;
      return taskId;
    } catch (e) {
      console.error('创建顺序发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建单实例定时发送任务
   */
  function createTimedSingleTask(
    instanceId: string,
    targetId: string,
    interval: number,
    repeatCount: number,
    isInfinite: boolean = false,
    name: string = '定时发送任务',
  ): string | null {
    try {
      // 查找实例
      const instance = sendFrameInstancesStore.instances.find((i) => i.id === instanceId);
      if (!instance) {
        processingError.value = '无法创建任务：找不到指定的实例';
        return null;
      }

      // 创建任务配置
      const taskConfig: TimedTaskConfig = {
        instances: [
          {
            id: `task_instance_${Date.now()}`,
            instanceId,
            targetId,
          },
        ],
        name,
        sendInterval: interval,
        repeatCount,
        isInfinite,
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'timed-single',
        status: 'idle',
        config: taskConfig,
      });

      currentTaskId.value = taskId;
      return taskId;
    } catch (e) {
      console.error('创建定时发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建多实例定时发送任务
   */
  function createTimedMultipleTask(
    instances: FrameInstanceInTask[],
    sendInterval: number,
    repeatCount: number,
    isInfinite: boolean = false,
    name: string = '多实例定时发送任务',
    description: string = '',
  ): string | null {
    if (!instances.length) {
      processingError.value = '无法创建任务：没有实例';
      return null;
    }

    try {
      // 创建任务配置
      const taskConfig: TimedTaskConfig = {
        instances,
        name,
        description,
        sendInterval,
        repeatCount,
        isInfinite,
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'timed-multiple',
        status: 'idle',
        config: taskConfig,
      });

      currentTaskId.value = taskId;
      return taskId;
    } catch (e) {
      console.error('创建多实例定时发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建单实例触发发送任务
   */
  function createTriggeredSingleTask(
    instanceId: string,
    targetId: string,
    sourceId: string,
    triggerFrameId: string,
    conditions: any[],
    name: string = '触发发送任务',
  ): string | null {
    try {
      // 查找实例
      const instance = sendFrameInstancesStore.instances.find((i) => i.id === instanceId);
      if (!instance) {
        processingError.value = '无法创建任务：找不到指定的实例';
        return null;
      }

      // 创建任务配置
      const taskConfig: TriggerTaskConfig = {
        instances: [
          {
            id: `task_instance_${Date.now()}`,
            instanceId,
            targetId,
          },
        ],
        name,
        sourceId,
        triggerFrameId,
        conditions,
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'triggered-single',
        status: 'idle',
        config: taskConfig,
      });

      currentTaskId.value = taskId;
      return taskId;
    } catch (e) {
      console.error('创建触发发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建多实例触发发送任务
   */
  function createTriggeredMultipleTask(
    instances: FrameInstanceInTask[],
    sourceId: string,
    triggerFrameId: string,
    conditions: any[],
    name: string = '多实例触发发送任务',
    description: string = '',
  ): string | null {
    if (!instances.length) {
      processingError.value = '无法创建任务：没有实例';
      return null;
    }

    try {
      // 创建任务配置
      const taskConfig: TriggerTaskConfig = {
        instances,
        name,
        description,
        sourceId,
        triggerFrameId,
        conditions,
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'triggered-multiple',
        status: 'idle',
        config: taskConfig,
      });

      currentTaskId.value = taskId;
      return taskId;
    } catch (e) {
      console.error('创建多实例触发发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

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
      sendTasksStore.updateTaskStatus(taskId, 'error', processingError.value);
      return false;
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * 停止任务
   */
  function stopTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) {
      processingError.value = '找不到指定的任务';
      return false;
    }

    if (
      task.status !== 'running' &&
      task.status !== 'paused' &&
      task.status !== 'waiting-trigger'
    ) {
      return true; // 任务已经停止
    }

    try {
      // 清理任务相关的定时器
      if (task.timers && task.timers.length > 0) {
        task.timers.forEach((timerId) => {
          clearTimeout(timerId);
          clearInterval(timerId);
        });
      }

      // 更新任务状态
      sendTasksStore.updateTaskStatus(taskId, 'completed');

      // 如果是当前选中的任务，清空选择
      if (currentTaskId.value === taskId) {
        currentTaskId.value = null;
      }

      return true;
    } catch (e) {
      console.error(`停止任务 ${task.name} 失败:`, e);
      processingError.value = e instanceof Error ? e.message : '停止任务失败';
      return false;
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

    // 按顺序处理每个实例
    let currentIndex = 0;

    // 处理下一个实例的函数
    const processNextInstance = async () => {
      if (currentIndex >= task.config.instances.length) {
        // 所有实例处理完成
        sendTasksStore.updateTaskStatus(task.id, 'completed');
        sendTasksStore.updateTaskProgress(task.id, {
          percentage: 100,
        });
        return;
      }

      const instanceConfig = task.config.instances[currentIndex];
      if (!instanceConfig) {
        throw new Error(`无效的实例配置，索引: ${currentIndex}`);
      }

      // 更新当前处理的实例状态
      const updatedInstances = [...task.config.instances];
      updatedInstances[currentIndex] = {
        id: instanceConfig.id,
        instanceId: instanceConfig.instanceId,
        targetId: instanceConfig.targetId,
        interval: instanceConfig.interval || 0,
        status: 'running',
      };

      sendTasksStore.updateTask(task.id, {
        config: {
          ...task.config,
          instances: updatedInstances,
        },
      });

      sendTasksStore.updateTaskProgress(task.id, {
        currentCount: currentIndex,
        percentage: Math.floor((currentIndex / task.config.instances.length) * 100),
        currentInstanceIndex: currentIndex,
      });

      try {
        // 获取实例
        const instance = sendFrameInstancesStore.instances.find(
          (i) => i.id === instanceConfig.instanceId,
        );
        if (!instance) {
          throw new Error(`找不到实例: ${instanceConfig.instanceId}`);
        }

        // 发送帧
        const success = await serialStore.sendFrameInstance(instanceConfig.targetId, instance);

        if (!success) {
          throw new Error('帧发送失败');
        }

        // 更新实例状态为成功
        updatedInstances[currentIndex] = {
          id: instanceConfig.id,
          instanceId: instanceConfig.instanceId,
          targetId: instanceConfig.targetId,
          interval: instanceConfig.interval || 0,
          status: 'completed',
        };

        sendTasksStore.updateTask(task.id, {
          config: {
            ...task.config,
            instances: updatedInstances,
          },
        });

        // 延时处理下一个实例
        currentIndex++;

        // 使用实例的延时，默认为1000ms
        const delay = instanceConfig.interval || 1000;

        const timerId = window.setTimeout(() => {
          processNextInstance();
        }, delay);

        timers.push(timerId);
      } catch (error) {
        // 更新实例状态为错误
        const updatedInstances = [...task.config.instances];
        updatedInstances[currentIndex] = {
          id: instanceConfig.id,
          instanceId: instanceConfig.instanceId,
          targetId: instanceConfig.targetId,
          interval: instanceConfig.interval || 0,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '发送失败',
        };

        sendTasksStore.updateTask(task.id, {
          config: {
            ...task.config,
            instances: updatedInstances,
          },
        });

        // 继续处理下一个实例
        currentIndex++;

        const timerId = window.setTimeout(() => {
          processNextInstance();
        }, 1000); // 错误后延迟1秒再处理下一个

        timers.push(timerId);
      }
    };

    // 开始处理第一个实例
    processNextInstance();

    // 存储定时器ID到任务中
    sendTasksStore.updateTask(task.id, {
      timers,
    });

    return true;
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

    // 获取实例
    const instance = sendFrameInstancesStore.instances.find(
      (i) => i.id === instanceConfig.instanceId,
    );
    if (!instance) {
      throw new Error(`找不到实例: ${instanceConfig.instanceId}`);
    }

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

    // 立即发送第一帧
    const sendFrame = async () => {
      try {
        const success = await serialStore.sendFrameInstance(instanceConfig.targetId, instance);

        if (!success) {
          throw new Error('帧发送失败');
        }

        currentCount++;

        // 更新进度
        if (!config.isInfinite) {
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount,
            percentage: Math.min(100, Math.floor((currentCount / config.repeatCount) * 100)),
          });

          // 检查是否完成
          if (currentCount >= config.repeatCount) {
            // 任务完成
            sendTasksStore.updateTaskStatus(task.id, 'completed');

            // 清理定时器
            timers.forEach((timerId) => clearInterval(timerId));
          }
        } else {
          // 无限循环模式，只更新计数
          sendTasksStore.updateTaskProgress(task.id, {
            currentCount,
            nextExecutionTime: Date.now() + config.sendInterval,
          });
        }
      } catch (error) {
        console.error('发送帧失败:', error);
        sendTasksStore.updateTaskStatus(
          task.id,
          'error',
          error instanceof Error ? error.message : '发送失败',
        );

        // 清理定时器
        timers.forEach((timerId) => clearInterval(timerId));
      }
    };

    // 发送第一帧
    await sendFrame();

    // 设置定时器继续发送
    if ((config.isInfinite || currentCount < config.repeatCount) && task.status === 'running') {
      const intervalId = window.setInterval(sendFrame, config.sendInterval);
      timers.push(intervalId);

      // 存储定时器ID
      sendTasksStore.updateTask(task.id, {
        timers,
      });
    }

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

    // 更新任务状态
    sendTasksStore.updateTaskStatus(task.id, 'running');

    // 计算总发送次数
    const totalCount = config.isInfinite ? -1 : config.repeatCount;
    const instancesCount = config.instances.length;

    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: totalCount === -1 ? Number.MAX_SAFE_INTEGER : totalCount * instancesCount,
      percentage: 0,
      currentInstanceIndex: 0,
    });

    const timers: number[] = [];
    let currentSequenceCount = 0;

    // 发送一个完整序列的函数
    const sendSequence = async () => {
      let currentInstanceIndex = 0;

      // 创建递归处理实例的函数
      const processInstance = async () => {
        if (currentInstanceIndex >= config.instances.length) {
          // 序列已完成，检查是否继续
          currentSequenceCount++;

          // 更新进度
          if (!config.isInfinite) {
            const percentage = Math.min(
              100,
              Math.floor((currentSequenceCount / config.repeatCount) * 100),
            );
            sendTasksStore.updateTaskProgress(task.id, {
              currentCount: currentSequenceCount * instancesCount,
              percentage,
            });

            // 检查是否所有序列都已完成
            if (currentSequenceCount >= config.repeatCount) {
              sendTasksStore.updateTaskStatus(task.id, 'completed');
              return;
            }
          } else {
            // 无限循环模式，只更新计数
            sendTasksStore.updateTaskProgress(task.id, {
              currentCount: currentSequenceCount * instancesCount,
              nextExecutionTime: Date.now() + config.sendInterval,
            });
          }

          return;
        }

        // 获取当前实例配置
        const instanceConfig = config.instances[currentInstanceIndex];
        if (!instanceConfig) {
          throw new Error(`无效的实例配置，索引: ${currentInstanceIndex}`);
        }

        // 更新当前处理的实例索引
        sendTasksStore.updateTaskProgress(task.id, {
          currentInstanceIndex,
        });

        try {
          // 获取实例
          const instance = sendFrameInstancesStore.instances.find(
            (i) => i.id === instanceConfig.instanceId,
          );
          if (!instance) {
            throw new Error(`找不到实例: ${instanceConfig.instanceId}`);
          }

          // 发送帧
          const success = await serialStore.sendFrameInstance(instanceConfig.targetId, instance);

          if (!success) {
            throw new Error('帧发送失败');
          }

          // 处理下一个实例，使用实例配置的延时或默认延时
          currentInstanceIndex++;

          const delay = instanceConfig.interval || 1000;
          const timerId = window.setTimeout(processInstance, delay);
          timers.push(timerId);
        } catch (error) {
          console.error('发送帧失败:', error);

          // 继续处理下一个实例
          currentInstanceIndex++;

          const timerId = window.setTimeout(processInstance, 1000);
          timers.push(timerId);
        }
      };

      // 开始处理序列中的第一个实例
      processInstance();
    };

    // 发送第一个序列
    await sendSequence();

    // 如果需要重复发送序列
    if (
      (config.isInfinite || currentSequenceCount < config.repeatCount) &&
      task.status === 'running'
    ) {
      const intervalId = window.setInterval(sendSequence, config.sendInterval);
      timers.push(intervalId);
    }

    // 存储定时器ID
    sendTasksStore.updateTask(task.id, {
      timers,
    });

    return true;
  }

  /**
   * 开始单实例触发发送任务
   */
  async function startTriggeredSingleTask(task: SendTask): Promise<boolean> {
    if (
      !task.config ||
      !('instances' in task.config) ||
      !task.config.instances.length ||
      !('sourceId' in task.config) ||
      !('triggerFrameId' in task.config) ||
      !('conditions' in task.config)
    ) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TriggerTaskConfig;
    const instanceConfig = config.instances[0];

    if (!instanceConfig) {
      throw new Error('无效的实例配置');
    }

    // 获取实例
    const instance = sendFrameInstancesStore.instances.find(
      (i) => i.id === instanceConfig.instanceId,
    );
    if (!instance) {
      throw new Error(`找不到实例: ${instanceConfig.instanceId}`);
    }

    // 更新任务状态为等待触发
    sendTasksStore.updateTaskStatus(task.id, 'waiting-trigger');

    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: 0,
      percentage: 0,
    });

    // 设置监听逻辑
    // 注意：这里只是简化的框架，实际应当实现监听收到的帧数据并根据条件触发发送
    // TODO: 实现条件监听和触发逻辑

    return true;
  }

  /**
   * 开始多实例触发发送任务
   */
  async function startTriggeredMultipleTask(task: SendTask): Promise<boolean> {
    if (
      !task.config ||
      !('instances' in task.config) ||
      !task.config.instances.length ||
      !('sourceId' in task.config) ||
      !('triggerFrameId' in task.config) ||
      !('conditions' in task.config)
    ) {
      throw new Error('任务配置无效');
    }

    const config = task.config as TriggerTaskConfig;

    // 更新任务状态为等待触发
    sendTasksStore.updateTaskStatus(task.id, 'waiting-trigger');

    sendTasksStore.updateTaskProgress(task.id, {
      currentCount: 0,
      totalCount: 0,
      percentage: 0,
    });

    // 设置监听逻辑
    // 注意：这里只是简化的框架，实际应当实现监听收到的帧数据并根据条件触发发送
    // TODO: 实现条件监听和触发逻辑

    return true;
  }

  /**
   * 暂停任务
   */
  function pauseTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    // TODO: 实现暂停逻辑
    sendTasksStore.updateTaskStatus(taskId, 'paused');
    return true;
  }

  /**
   * 恢复任务
   */
  function resumeTask(taskId: string): boolean {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task || task.status !== 'paused') {
      return false;
    }

    // TODO: 实现恢复逻辑
    sendTasksStore.updateTaskStatus(taskId, 'running');
    return true;
  }

  /**
   * 保存任务配置到文件
   */
  async function saveTaskConfigToFile(taskId: string, filename?: string): Promise<boolean> {
    const task = sendTasksStore.getTaskById(taskId);
    if (!task) {
      processingError.value = '找不到指定的任务';
      return false;
    }

    try {
      // 准备要保存的数据
      const configData = {
        version: '1.0',
        taskType: task.type,
        taskName: task.name,
        taskDescription: task.config.description || '',
        instances: task.config.instances.map((inst) => ({
          id: inst.id,
          instanceId: inst.instanceId,
          targetId: inst.targetId,
          interval: inst.interval || 0,
        })),
        typeSpecificConfig: task.type.includes('timed')
          ? {
              sendInterval: (task.config as TimedTaskConfig).sendInterval,
              repeatCount: (task.config as TimedTaskConfig).repeatCount,
              isInfinite: (task.config as TimedTaskConfig).isInfinite,
            }
          : task.type.includes('triggered')
            ? {
                sourceId: (task.config as TriggerTaskConfig).sourceId,
                triggerFrameId: (task.config as TriggerTaskConfig).triggerFrameId,
                conditions: (task.config as TriggerTaskConfig).conditions,
              }
            : null,
      };

      const defaultFilename = `task_${task.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
      const saveFilename = filename || defaultFilename;

      // 使用fileDialogManager导出配置
      const result = await fileDialogManager.exportFile(
        '保存任务配置',
        `${pathAPI.getDataPath()}/data/tasks`,
        configData,
      );

      if (result && result.success) {
        console.log('任务配置已保存', result.filePath);
        return true;
      } else if (result && !result.canceled) {
        processingError.value = result.error ? String(result.error) : '保存失败';
        return false;
      }

      return false;
    } catch (e) {
      console.error('保存任务配置失败:', e);
      processingError.value = e instanceof Error ? e.message : '保存失败';
      return false;
    }
  }

  /**
   * 从文件加载任务配置
   */
  async function loadTaskConfigFromFile(): Promise<string | null> {
    try {
      // 使用fileDialogManager导入配置
      const result = await fileDialogManager.importFile(
        '加载任务配置',
        `${pathAPI.getDataPath()}/data/tasks`,
      );

      if (!result.canceled && result.fileData) {
        // 验证任务配置数据
        const taskData = result.fileData;

        if (
          !taskData ||
          !taskData.taskType ||
          !taskData.instances ||
          !Array.isArray(taskData.instances)
        ) {
          throw new Error('无效的任务配置数据');
        }

        // 使用导入的数据创建任务
        let taskId: string | null = null;

        switch (taskData.taskType) {
          case 'sequential':
            taskId = createSequentialTask(
              taskData.instances,
              taskData.taskName,
              taskData.taskDescription,
            );
            break;

          case 'timed-single':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的定时任务配置');
            }

            taskId = createTimedSingleTask(
              taskData.instances[0].instanceId,
              taskData.instances[0].targetId,
              taskData.typeSpecificConfig.sendInterval,
              taskData.typeSpecificConfig.repeatCount,
              taskData.typeSpecificConfig.isInfinite,
              taskData.taskName,
            );
            break;

          case 'timed-multiple':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的多实例定时任务配置');
            }

            taskId = createTimedMultipleTask(
              taskData.instances,
              taskData.typeSpecificConfig.sendInterval,
              taskData.typeSpecificConfig.repeatCount,
              taskData.typeSpecificConfig.isInfinite,
              taskData.taskName,
              taskData.taskDescription,
            );
            break;

          case 'triggered-single':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的触发任务配置');
            }

            taskId = createTriggeredSingleTask(
              taskData.instances[0].instanceId,
              taskData.instances[0].targetId,
              taskData.typeSpecificConfig.sourceId,
              taskData.typeSpecificConfig.triggerFrameId,
              taskData.typeSpecificConfig.conditions,
              taskData.taskName,
            );
            break;

          case 'triggered-multiple':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的多实例触发任务配置');
            }

            taskId = createTriggeredMultipleTask(
              taskData.instances,
              taskData.typeSpecificConfig.sourceId,
              taskData.typeSpecificConfig.triggerFrameId,
              taskData.typeSpecificConfig.conditions,
              taskData.taskName,
              taskData.taskDescription,
            );
            break;

          default:
            throw new Error(`未知的任务类型: ${taskData.taskType}`);
        }

        if (taskId) {
          console.log('任务配置已加载', result.filePath);
          return taskId;
        }
      }

      return null;
    } catch (e) {
      console.error('加载任务配置失败:', e);
      processingError.value = e instanceof Error ? e.message : '加载失败';
      return null;
    }
  }

  // 清理函数
  onUnmounted(() => {
    // 停止所有正在运行的任务
    sendTasksStore.tasks.forEach((task) => {
      if (
        task.status === 'running' ||
        task.status === 'paused' ||
        task.status === 'waiting-trigger'
      ) {
        stopTask(task.id);
      }
    });
  });

  return {
    // 状态
    currentTaskId,
    currentTask,
    activeTasks,
    isProcessing,
    processingError,

    // 任务创建
    createSequentialTask,
    createTimedSingleTask,
    createTimedMultipleTask,
    createTriggeredSingleTask,
    createTriggeredMultipleTask,

    // 任务控制
    startTask,
    stopTask,
    pauseTask,
    resumeTask,

    // 配置管理
    saveTaskConfigToFile,
    loadTaskConfigFromFile,
  };
}
