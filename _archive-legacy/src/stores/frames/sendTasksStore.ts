/**
 * 发送任务状态管理 Store
 * 使用 Pinia + Composition API
 */
import { defineStore } from 'pinia';
import { ref, computed, watch, shallowRef } from 'vue';
import { nanoid } from 'nanoid';
import type { SendFrameInstance, TriggerCondition } from '../../types/frames/sendInstances';
import type { DataItem } from '../../types/frames/receive';
import { useSendTaskTriggerListener } from '../../composables/frames/sendFrame/useSendTaskTriggerListener';

/**
 * 任务类型枚举
 */
export type TaskType =
  | 'sequential' // 顺序发送
  | 'timed' // 定时发送
  | 'triggered'; // 触发发送

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
 * 字段变化配置
 */
export interface FieldVariation {
  fieldId: string;
  values: (string | number)[]; // 变化值数组，按照repeatCount轮次变化
}

/**
 * 任务中的帧实例配置
 */
export interface FrameInstanceInTask {
  id: string;
  instance: SendFrameInstance; // 完整的帧实例对象
  targetId: string;
  interval?: number;
  status?: TaskStatus;
  errorMessage?: string;
  // 新增：是否启用参数变化
  enableVariation?: boolean;
  // 新增：字段变化配置
  fieldVariations?: FieldVariation[];
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
  timers?: string[]; // 新增：存储定时器ID数组，用于任务停止时清理（主进程定时器使用字符串ID）
  errorInfo?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

/**
 * 任务进度缓存接口
 */
interface TaskProgressCache {
  taskId: string;
  progress: TaskProgress;
  lastUpdated: number;
}

/**
 * 任务配置缓存接口
 */
interface TaskConfigCache {
  taskId: string;
  config: TaskConfigBase | TimedTaskConfig | TriggerTaskConfig;
  lastUpdated: number;
}

/**
 * 发送任务状态管理 Store
 */
export const useSendTasksStore = defineStore('sendTasks', () => {
  // 状态
  const tasks = shallowRef<SendTask[]>([]);

  // 触发监听器实例
  const triggerListener = useSendTaskTriggerListener();

  // 性能优化：进度缓存和配置缓存
  const progressCache = new Map<string, TaskProgressCache>();
  const configCache = new Map<string, TaskConfigCache>();

  // 批量更新定时器
  let batchUpdateTimer: number | null = null;
  const BATCH_UPDATE_INTERVAL = 1000; // 1秒批量更新间隔

  // 🚀 性能优化：状态索引映射
  const statusIndexes = ref<Map<TaskStatus, Set<string>>>(
    new Map([
      ['idle', new Set()],
      ['running', new Set()],
      ['paused', new Set()],
      ['completed', new Set()],
      ['error', new Set()],
      ['waiting-trigger', new Set()],
      ['waiting-schedule', new Set()],
    ]),
  );

  // 任务ID到任务的快速映射
  const taskMap = ref<Map<string, SendTask>>(new Map());

  // 🚀 优化后的计算属性 - O(1)时间复杂度
  const activeTasks = computed(() => {
    const activeIds = [
      ...(statusIndexes.value.get('running') || []),
      ...(statusIndexes.value.get('paused') || []),
      ...(statusIndexes.value.get('waiting-trigger') || []),
      ...(statusIndexes.value.get('waiting-schedule') || []),
    ];
    return activeIds.map((id) => taskMap.value.get(id)!).filter(Boolean);
  });

  const runningTasks = computed(() => {
    const runningIds = statusIndexes.value.get('running') || new Set();
    return Array.from(runningIds)
      .map((id) => taskMap.value.get(id)!)
      .filter(Boolean);
  });

  const completedTasks = computed(() => {
    const completedIds = statusIndexes.value.get('completed') || new Set();
    return Array.from(completedIds)
      .map((id) => taskMap.value.get(id)!)
      .filter(Boolean);
  });

  const errorTasks = computed(() => {
    const errorIds = statusIndexes.value.get('error') || new Set();
    return Array.from(errorIds)
      .map((id) => taskMap.value.get(id)!)
      .filter(Boolean);
  });

  // 等待触发的任务
  const waitingTriggerTasks = computed(() => {
    const waitingIds = statusIndexes.value.get('waiting-trigger') || new Set();
    return Array.from(waitingIds)
      .map((id) => taskMap.value.get(id)!)
      .filter(Boolean);
  });

  // 🚀 辅助函数：更新状态索引
  const updateStatusIndex = (
    taskId: string,
    oldStatus: TaskStatus | null,
    newStatus: TaskStatus,
  ) => {
    // 从旧状态中移除
    if (oldStatus && statusIndexes.value.has(oldStatus)) {
      statusIndexes.value.get(oldStatus)?.delete(taskId);
    }
    // 添加到新状态
    if (statusIndexes.value.has(newStatus)) {
      statusIndexes.value.get(newStatus)?.add(taskId);
    }
  };

  // 🚀 初始化索引（处理现有数据）
  const initializeIndexes = () => {
    // 清空现有索引
    statusIndexes.value.forEach((set) => set.clear());
    taskMap.value.clear();

    // 重建索引
    tasks.value.forEach((task) => {
      taskMap.value.set(task.id, task);
      updateStatusIndex(task.id, null, task.status);
    });
  };

  // 监听tasks数组变化，自动初始化索引
  watch(
    tasks,
    () => {
      // 只在数组被重新赋值时重建索引（比如从存储加载数据）
      const currentTaskIds = new Set(tasks.value.map((t) => t.id));
      const indexedTaskIds = new Set(taskMap.value.keys());

      // 如果任务ID集合不匹配，说明数据被外部重新加载，需要重建索引
      if (
        currentTaskIds.size !== indexedTaskIds.size ||
        !Array.from(currentTaskIds).every((id) => indexedTaskIds.has(id))
      ) {
        console.log('检测到tasks数组变化，重建索引...');
        initializeIndexes();
      }
    },
    { deep: false },
  ); // 不使用深度监听，只监听数组引用变化

  // 缓存管理方法
  /**
   * 批量同步缓存到 store（类似 sendFrameInstancesStore 的 updateSendStats）
   */
  function syncCacheToStore() {
    // 收集所有需要更新的 taskId
    const allTaskIds = new Set([...progressCache.keys(), ...configCache.keys()]);

    const currentTime = new Date().toISOString();

    // 一次性处理所有任务的更新
    allTaskIds.forEach((taskId) => {
      const task = getTaskById(taskId);
      if (!task) return;

      const progressCacheData = progressCache.get(taskId);
      const configCacheData = configCache.get(taskId);

      // 合并所有更新到一次赋值
      Object.assign(task, {
        ...(progressCacheData && {
          progress: {
            ...task.progress,
            ...progressCacheData.progress,
          },
        }),
        ...(configCacheData && {
          config: configCacheData.config,
        }),
        updatedAt: currentTime,
      });
    });

    // 清理缓存
    progressCache.clear();
    configCache.clear();
  }

  /**
   * 更新进度到缓存（替代原来的 updateTaskProgress）
   */
  function updateTaskProgressCached(id: string, progress: TaskProgress) {
    const existingCache = progressCache.get(id);

    progressCache.set(id, {
      taskId: id,
      progress: {
        ...existingCache?.progress,
        ...progress,
      },
      lastUpdated: Date.now(),
    });

    // 启动批量更新定时器
    if (batchUpdateTimer === null) {
      batchUpdateTimer = window.setTimeout(() => {
        syncCacheToStore();
        batchUpdateTimer = null;
      }, BATCH_UPDATE_INTERVAL);
    }
  }

  /**
   * 更新任务配置到缓存（替代部分 updateTask 的使用）
   */
  function updateTaskConfigCached(
    id: string,
    config: TaskConfigBase | TimedTaskConfig | TriggerTaskConfig,
  ) {
    configCache.set(id, {
      taskId: id,
      config: config,
      lastUpdated: Date.now(),
    });

    // 启动批量更新定时器
    if (batchUpdateTimer === null) {
      batchUpdateTimer = window.setTimeout(() => {
        syncCacheToStore();
        batchUpdateTimer = null;
      }, BATCH_UPDATE_INTERVAL);
    }
  }

  /**
   * 强制同步缓存（用于任务完成或停止时立即更新）
   */
  function forceSyncCache() {
    if (batchUpdateTimer !== null) {
      clearTimeout(batchUpdateTimer);
      batchUpdateTimer = null;
    }
    syncCacheToStore();
  }

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

    // 🚀 更新索引映射
    taskMap.value.set(task.id, task);
    updateStatusIndex(task.id, null, task.status);

    // 保持数组同步（为了兼容性）
    tasks.value.push(task);
    return task.id;
  }

  /**
   * 根据ID获取任务
   */
  function getTaskById(id: string): SendTask | undefined {
    return taskMap.value.get(id);
  }

  function getTaskByName(name: string): SendTask | undefined {
    return tasks.value.find((task) => task.name === name);
  }

  /**
   * 更新任务状态
   */
  function updateTaskStatus(id: string, status: TaskStatus, errorInfo?: string) {
    const task = getTaskById(id);
    if (!task) return;

    // 记录旧状态用于索引更新
    const oldStatus = task.status;

    // 对于重要状态变更，强制同步缓存
    if (status === 'completed' || status === 'error' || status === 'paused') {
      forceSyncCache();
    }

    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }

    if (status === 'error') {
      task.completedAt = new Date().toISOString();
    }

    if (status === 'completed') {
      removeTask(id);
    }

    if (errorInfo) {
      task.errorInfo = errorInfo;
    }

    // 🚀 更新状态索引
    updateStatusIndex(id, oldStatus, status);
  }

  /**
   * 更新任务（对于配置变更使用缓存优化）
   */
  function updateTask(id: string, updates: Partial<SendTask>) {
    const task = getTaskById(id);
    if (!task) return;

    // 如果只是更新配置，使用缓存版本
    if (updates.config && Object.keys(updates).length === 1) {
      updateTaskConfigCached(id, updates.config);
      return;
    }

    // 如果包含配置更新，先同步缓存再更新
    if (updates.config) {
      forceSyncCache();
    }

    Object.assign(task, updates);
    task.updatedAt = new Date().toISOString();
  }

  /**
   * 删除任务
   */
  function removeTask(id: string) {
    const task = taskMap.value.get(id);
    if (!task) return;

    // 🚀 从状态索引中移除
    updateStatusIndex(id, task.status, task.status); // 先移除旧状态
    statusIndexes.value.get(task.status)?.delete(id);

    // 从映射中移除
    taskMap.value.delete(id);

    // 从数组中移除（保持兼容性）
    const index = tasks.value.findIndex((task) => task.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
    }
  }

  /**
   * 清空已完成的任务
   */
  function clearCompletedTasks() {
    // 🚀 从状态索引中移除已完成的任务
    const completedIds = statusIndexes.value.get('completed') || new Set();
    completedIds.forEach((id) => {
      taskMap.value.delete(id);
    });
    statusIndexes.value.get('completed')?.clear();

    // 更新数组（保持兼容性）
    tasks.value = tasks.value.filter((task) => task.status !== 'completed');
  }

  /**
   * 清空错误任务
   */
  function clearErrorTasks() {
    // 🚀 从状态索引中移除错误任务
    const errorIds = statusIndexes.value.get('error') || new Set();
    errorIds.forEach((id) => {
      taskMap.value.delete(id);
    });
    statusIndexes.value.get('error')?.clear();

    // 更新数组（保持兼容性）
    tasks.value = tasks.value.filter((task) => task.status !== 'error');
  }

  /**
   * 清空所有任务
   */
  function clearAllTasks() {
    // 🚀 清空所有索引
    statusIndexes.value.forEach((set) => set.clear());
    taskMap.value.clear();

    // 清空数组
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
    getTaskByName,
    updateTaskStatus,
    updateTask,
    removeTask,
    clearCompletedTasks,
    clearErrorTasks,
    clearAllTasks,
    stopAllRunningTasks,

    // 缓存优化方法
    updateTaskProgressCached,
    updateTaskConfigCached,
    forceSyncCache,
    syncCacheToStore,

    // 触发监听器相关方法
    registerTaskTriggerListener,
    unregisterTaskTriggerListener,
    handleFrameReceived,
    getActiveTriggerListeners,
    getTriggerListenerStats,
  };
});
