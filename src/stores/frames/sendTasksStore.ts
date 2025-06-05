/**
 * 发送任务状态管理 Store
 * 使用 Pinia + Composition API
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { nanoid } from 'nanoid';
import type { TriggerCondition } from '../../types/frames/sendInstances';
import type { DataItem } from '../../types/frames/receive';
import { useSendTaskTriggerListener } from '../../composables/frames/sendFrame/useSendTaskTriggerListener';

/**
 * 任务类型枚举
 */
export type TaskType =
  | 'sequential' // 顺序发送
  | 'timed-single' // 单实例定时发送
  | 'timed-multiple' // 多实例定时发送
  | 'triggered-single' // 单实例触发发送
  | 'triggered-multiple'; // 多实例触发发送

/**
 * 任务状态枚举
 */
export type TaskStatus =
  | 'idle' // 空闲
  | 'running' // 运行中
  | 'paused' // 暂停
  | 'completed' // 已完成
  | 'error' // 错误
  | 'waiting-trigger' // 等待条件触发
  | 'waiting-schedule'; // 等待时间触发

/**
 * 任务中的帧实例配置
 */
export interface FrameInstanceInTask {
  id: string;
  instanceId: string;
  targetId: string;
  interval?: number;
  status?: TaskStatus;
  errorMessage?: string;
}

/**
 * 任务进度信息
 */
export interface TaskProgress {
  currentCount?: number;
  totalCount?: number;
  percentage?: number;
  currentInstanceId?: string;
  lastSentAt?: string;
  currentInstanceIndex?: number;
  nextExecutionTime?: number;
}

/**
 * 基础任务配置
 */
export interface TaskConfigBase {
  instances: FrameInstanceInTask[];
  name: string;
  description?: string;
}

/**
 * 定时任务配置
 */
export interface TimedTaskConfig extends TaskConfigBase {
  sendInterval: number;
  repeatCount: number;
  isInfinite: boolean;
  startDelay?: number;
}

/**
 * 触发任务配置
 */
export interface TriggerTaskConfig extends TaskConfigBase {
  sourceId: string;
  triggerFrameId: string;
  conditions: TriggerCondition[];
  responseDelay?: number;
  continueListening?: boolean; // 触发后是否继续监听（默认true）
  // 时间触发相关字段
  triggerType?: 'condition' | 'time';
  executeTime?: string; // ISO 8601 日期时间字符串
  isRecurring?: boolean; // 是否重复
  recurringType?: 'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly'; // 重复类型
  recurringInterval?: number; // 重复间隔
  endTime?: string; // 重复结束时间
}

/**
 * 发送任务
 */
export interface SendTask {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  config: TaskConfigBase | TimedTaskConfig | TriggerTaskConfig;
  progress?: TaskProgress;
  timers?: number[]; // 新增：存储定时器ID数组，用于任务停止时清理
  errorInfo?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

/**
 * 发送任务状态管理 Store
 */
export const useSendTasksStore = defineStore('sendTasks', () => {
  // 状态
  const tasks = ref<SendTask[]>([]);

  // 触发监听器实例
  const triggerListener = useSendTaskTriggerListener();

  // 计算属性
  const activeTasks = computed(() =>
    tasks.value.filter(
      (task) =>
        task.status === 'running' ||
        task.status === 'paused' ||
        task.status === 'waiting-trigger' ||
        task.status === 'waiting-schedule',
    ),
  );

  const runningTasks = computed(() => tasks.value.filter((task) => task.status === 'running'));

  const completedTasks = computed(() => tasks.value.filter((task) => task.status === 'completed'));

  const errorTasks = computed(() => tasks.value.filter((task) => task.status === 'error'));

  // 等待触发的任务
  const waitingTriggerTasks = computed(() =>
    tasks.value.filter((task) => task.status === 'waiting-trigger'),
  );

  // 方法
  /**
   * 添加任务
   */
  function addTask(taskData: {
    name: string;
    type: TaskType;
    status: TaskStatus;
    config: TaskConfigBase | TimedTaskConfig | TriggerTaskConfig;
  }): string {
    const now = new Date().toISOString();
    const task: SendTask = {
      id: nanoid(),
      ...taskData,
      createdAt: now,
      updatedAt: now,
    };

    tasks.value.push(task);
    return task.id;
  }

  /**
   * 根据ID获取任务
   */
  function getTaskById(id: string): SendTask | undefined {
    return tasks.value.find((task) => task.id === id);
  }

  /**
   * 更新任务状态
   */
  function updateTaskStatus(id: string, status: TaskStatus, errorInfo?: string) {
    const task = getTaskById(id);
    if (!task) return;

    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }

    if (status === 'completed' || status === 'error') {
      task.completedAt = new Date().toISOString();
    }

    if (errorInfo) {
      task.errorInfo = errorInfo;
    }
  }

  /**
   * 更新任务进度
   */
  function updateTaskProgress(id: string, progress: TaskProgress) {
    const task = getTaskById(id);
    if (!task) return;

    task.progress = {
      ...task.progress,
      ...progress,
    };
    task.updatedAt = new Date().toISOString();
  }

  /**
   * 更新任务
   */
  function updateTask(id: string, updates: Partial<SendTask>) {
    const task = getTaskById(id);
    if (!task) return;

    Object.assign(task, updates);
    task.updatedAt = new Date().toISOString();
  }

  /**
   * 删除任务
   */
  function removeTask(id: string) {
    const index = tasks.value.findIndex((task) => task.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
    }
  }

  /**
   * 清空已完成的任务
   */
  function clearCompletedTasks() {
    tasks.value = tasks.value.filter((task) => task.status !== 'completed');
  }

  /**
   * 清空错误任务
   */
  function clearErrorTasks() {
    tasks.value = tasks.value.filter((task) => task.status !== 'error');
  }

  /**
   * 清空所有任务
   */
  function clearAllTasks() {
    tasks.value = [];
  }

  /**
   * 停止所有运行中的任务
   */
  function stopAllRunningTasks() {
    runningTasks.value.forEach((task) => {
      updateTaskStatus(task.id, 'paused');
    });
  }

  /**
   * 注册任务的触发监听器
   */
  function registerTaskTriggerListener(
    taskId: string,
    config: {
      sourceId: string;
      triggerFrameId: string;
      conditions: TriggerCondition[];
      continueListening?: boolean;
      responseDelay?: number;
    },
  ): void {
    triggerListener.registerTriggerListener(taskId, config);
  }

  /**
   * 注销任务的触发监听器
   */
  function unregisterTaskTriggerListener(taskId: string): void {
    triggerListener.unregisterTriggerListener(taskId);
  }

  /**
   * 处理接收到的帧数据（供接收帧Store调用）
   */
  function handleFrameReceived(
    frameId: string,
    sourceId: string,
    updatedDataItems?: DataItem[],
  ): void {
    triggerListener.handleFrameReceived(frameId, sourceId, updatedDataItems);
  }

  /**
   * 获取活跃的触发监听器信息
   */
  function getActiveTriggerListeners() {
    return triggerListener.getActiveTriggerListeners();
  }

  /**
   * 获取触发监听器统计信息
   */
  function getTriggerListenerStats() {
    return triggerListener.getListenerStats();
  }

  return {
    // 状态
    tasks,
    activeTasks,
    runningTasks,
    completedTasks,
    errorTasks,
    waitingTriggerTasks,

    // 方法
    addTask,
    getTaskById,
    updateTaskStatus,
    updateTaskProgress,
    updateTask,
    removeTask,
    clearCompletedTasks,
    clearErrorTasks,
    clearAllTasks,
    stopAllRunningTasks,

    // 触发监听器相关方法
    registerTaskTriggerListener,
    unregisterTaskTriggerListener,
    handleFrameReceived,
    getActiveTriggerListeners,
    getTriggerListenerStats,
  };
});
