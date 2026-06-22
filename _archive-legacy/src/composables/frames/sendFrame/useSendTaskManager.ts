/**
 * 发送任务管理器 - 可组合函数
 *
 * 负责任务的创建、启动、停止和监控 - 主入口文件
 */
import { ref, computed } from 'vue';
import { useSendTasksStore } from '../../../stores/frames/sendTasksStore';
import { useSendTaskCreator } from './useSendTaskCreator';
import { useSendTaskExecutor } from './useSendTaskExecutor';
import { useSendTaskController } from './useSendTaskController';

/**
 * 任务管理器可组合函数 - 主入口
 */
export function useSendTaskManager() {
  // 获取store实例
  const sendTasksStore = useSendTasksStore();

  // 获取各个功能模块
  const taskCreator = useSendTaskCreator();
  const taskExecutor = useSendTaskExecutor();
  const taskController = useSendTaskController();

  // 本地状态
  const currentTaskId = ref<string | null>(null);

  // 计算属性
  const activeTasks = computed(() => sendTasksStore.activeTasks);

  const currentTask = computed(() => {
    if (!currentTaskId.value) return null;
    return sendTasksStore.getTaskById(currentTaskId.value);
  });

  // 聚合所有处理错误到一个computed属性
  const processingError = computed(() => {
    return (
      taskCreator.processingError.value ||
      taskExecutor.processingError.value ||
      taskController.processingError.value
    );
  });

  // 获取处理状态
  const isProcessing = computed(() => taskExecutor.isProcessing.value);

  // 扩展任务创建函数，添加当前任务ID设置
  const createSequentialTask = (...args: Parameters<typeof taskCreator.createSequentialTask>) => {
    const taskId = taskCreator.createSequentialTask(...args);
    if (taskId) {
      currentTaskId.value = taskId;
    }
    return taskId;
  };

  const createTimedTask = (...args: Parameters<typeof taskCreator.createTimedTask>) => {
    const taskId = taskCreator.createTimedTask(...args);
    if (taskId) {
      currentTaskId.value = taskId;
    }
    return taskId;
  };

  const createTriggeredTask = (...args: Parameters<typeof taskCreator.createTriggeredTask>) => {
    const taskId = taskCreator.createTriggeredTask(...args);
    if (taskId) {
      currentTaskId.value = taskId;
    }
    return taskId;
  };

  const createTimedTriggeredTask = (
    ...args: Parameters<typeof taskCreator.createTimedTriggeredTask>
  ) => {
    const taskId = taskCreator.createTimedTriggeredTask(...args);
    if (taskId) {
      currentTaskId.value = taskId;
    }
    return taskId;
  };

  // 扩展停止任务函数，清空当前任务ID
  const stopTask = (taskId: string) => {
    const result = taskController.stopTask(taskId);
    if (result && currentTaskId.value === taskId) {
      currentTaskId.value = null;
    }
    return result;
  };

  // 添加选择任务功能
  const selectTask = (taskId: string | null) => {
    currentTaskId.value = taskId;
  };

  // 添加清空选择功能
  const clearSelection = () => {
    currentTaskId.value = null;
  };

  // 获取任务统计信息
  const getTaskStats = () => {
    const allTasks = sendTasksStore.tasks;
    return {
      total: allTasks.length,
      running: allTasks.filter((t) => t.status === 'running').length,
      paused: allTasks.filter((t) => t.status === 'paused').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      error: allTasks.filter((t) => t.status === 'error').length,
      idle: allTasks.filter((t) => t.status === 'idle').length,
      waitingTrigger: allTasks.filter((t) => t.status === 'waiting-trigger').length,
    };
  };

  const getTaskById = (taskId: string) => {
    return sendTasksStore.getTaskById(taskId);
  };

  const getTaskByName = (taskName: string) => {
    return sendTasksStore.getTaskByName(taskName);
  };

  /**
   * 验证配置文件格式
   */
  function validateTaskConfig(configData: unknown): boolean {
    try {
      if (!configData || typeof configData !== 'object') {
        return false;
      }

      const data = configData as Record<string, unknown>;

      // 检查必需的字段
      if (!data.taskType || !data.instances || !Array.isArray(data.instances)) {
        return false;
      }

      // 检查实例数据
      for (const instance of data.instances) {
        if (
          !instance ||
          typeof instance !== 'object' ||
          !(instance as Record<string, unknown>).instanceId ||
          !(instance as Record<string, unknown>).targetId
        ) {
          return false;
        }
      }

      // 检查类型特定配置
      if (typeof data.taskType === 'string' && data.taskType.includes('timed')) {
        const typeConfig = data.typeSpecificConfig as Record<string, unknown>;
        if (
          !typeConfig ||
          typeof typeConfig.sendInterval !== 'number' ||
          typeof typeConfig.repeatCount !== 'number'
        ) {
          return false;
        }
      } else if (typeof data.taskType === 'string' && data.taskType.includes('triggered')) {
        const typeConfig = data.typeSpecificConfig as Record<string, unknown>;
        if (
          !typeConfig ||
          !typeConfig.sourceId ||
          !typeConfig.triggerFrameId ||
          !Array.isArray(typeConfig.conditions)
        ) {
          return false;
        }
      }

      return true;
    } catch (e) {
      console.error('验证配置文件格式失败:', e);
      return false;
    }
  }

  return {
    // 状态
    currentTaskId,
    currentTask,
    activeTasks,
    isProcessing,
    processingError,

    // 任务创建 (从 taskCreator)
    createSequentialTask,
    createTimedTask,
    createTriggeredTask,
    createTimedTriggeredTask,

    // 任务执行 (从 taskExecutor)
    startTask: taskExecutor.startTask,

    // 任务控制 (从 taskController，部分扩展)
    stopTask,
    pauseTask: taskController.pauseTask,
    resumeTask: taskController.resumeTask,
    stopAllTasks: taskController.stopAllTasks,
    forceCleanupTask: taskController.forceCleanupTask,

    // 状态查询 (从 taskController)
    getTaskById,
    getTaskByName,
    getRunningTasksCount: taskController.getRunningTasksCount,
    getActiveTasksCount: taskController.getActiveTasksCount,
    canStopTask: taskController.canStopTask,
    canPauseTask: taskController.canPauseTask,
    canResumeTask: taskController.canResumeTask,
    validateTaskConfig,

    // 触发监听器功能 (从 sendTasksStore)
    getActiveTriggerListeners: sendTasksStore.getActiveTriggerListeners,
    getTriggerListenerStats: sendTasksStore.getTriggerListenerStats,

    // 任务管理功能
    selectTask,
    clearSelection,
    getTaskStats,
  };
}
