/**
 * 发送任务状态管理Store
 *
 * 负责管理所有类型的发送任务：单次发送、顺序发送、定时发送和触发发送
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSerialStore } from '../serialStore';
import { useSendFrameInstancesStore } from './sendFrameInstancesStore';

// 任务类型定义
export type TaskType =
  | 'sequential' // 顺序发送
  | 'timed-single' // 单实例定时发送
  | 'timed-multiple' // 多实例定时发送
  | 'triggered-single' // 单实例触发发送
  | 'triggered-multiple'; // 多实例触发发送

// 任务状态定义
export type TaskStatus =
  | 'idle' // 空闲
  | 'running' // 运行中
  | 'paused' // 暂停
  | 'completed' // 已完成
  | 'error' // 错误
  | 'waiting-trigger'; // 等待触发

// 帧实例在任务中的配置
export interface FrameInstanceInTask {
  id: string; // 任务内唯一标识符
  instanceId: string; // 关联到原始 SendFrameInstance 的 id
  targetId: string; // 发送目标ID
  interval?: number; // 实例间延时(ms)，用于顺序/定时发送
  status?: TaskStatus; // 实例状态，用于顺序发送中的状态追踪
  errorMessage?: string; // 错误信息
}

// 任务基础配置接口
export interface TaskConfigBase {
  instances: FrameInstanceInTask[]; // 帧实例列表
  name: string; // 任务名称
  description?: string; // 任务描述
}

// 定时任务配置
export interface TimedTaskConfig extends TaskConfigBase {
  sendInterval: number; // 发送间隔(ms)，对于timed-multiple表示整个序列的重复间隔
  repeatCount: number; // 重复次数，0表示无限循环
  isInfinite: boolean; // 是否无限循环
}

// 触发任务配置
export interface TriggerTaskConfig extends TaskConfigBase {
  sourceId: string; // 监听来源ID
  triggerFrameId: string; // 触发帧ID
  conditions: TriggerCondition[]; // 触发条件列表
}

// 触发条件
export interface TriggerCondition {
  id: string; // 条件ID
  fieldId: string; // 字段ID
  condition: string; // 比较条件（equals, not_equals, greater, less, contains）
  value: string; // 比较值
  logicOperator?: 'and' | 'or'; // 与其他条件的逻辑关系
}

// 任务进度信息
export interface TaskProgress {
  currentCount: number; // 当前计数（发送次数或处理的实例索引）
  totalCount: number; // 总计数
  percentage: number; // 进度百分比
  currentInstanceIndex?: number; // 当前实例索引（用于多实例任务）
  nextExecutionTime?: number; // 下次执行时间戳（用于定时任务）
}

// 发送任务接口
export interface SendTask {
  id: string; // 唯一ID
  name: string; // 任务名称
  type: TaskType; // 任务类型
  status: TaskStatus; // 任务状态
  config: TaskConfigBase | TimedTaskConfig | TriggerTaskConfig; // 任务配置
  progress: TaskProgress; // 任务进度
  errorInfo?: string; // 错误信息
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
  timers?: number[]; // 定时器ID列表，用于清理
}

export const useSendTasksStore = defineStore('sendTasks', () => {
  // 状态
  const tasks = ref<SendTask[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 获取其他store实例
  const serialStore = useSerialStore();
  const sendFrameInstancesStore = useSendFrameInstancesStore();

  // 计算属性：按状态筛选任务
  const activeTasks = computed(() => {
    return tasks.value.filter(
      (task) =>
        task.status === 'running' || task.status === 'paused' || task.status === 'waiting-trigger',
    );
  });

  const completedTasks = computed(() => {
    return tasks.value.filter((task) => task.status === 'completed' || task.status === 'error');
  });

  // 通过ID获取任务
  function getTaskById(id: string): SendTask | undefined {
    return tasks.value.find((task) => task.id === id);
  }

  // 添加任务
  function addTask(
    taskData: Omit<SendTask, 'id' | 'createdAt' | 'updatedAt' | 'progress'>,
  ): string {
    const now = new Date();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newTask: SendTask = {
      id: taskId,
      ...taskData,
      progress: {
        currentCount: 0,
        totalCount: 0,
        percentage: 0,
      },
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    };

    tasks.value.push(newTask);
    return taskId;
  }

  // 更新任务
  function updateTask(id: string, updates: Partial<SendTask>): boolean {
    const taskIndex = tasks.value.findIndex((task) => task.id === id);
    if (taskIndex === -1) return false;

    const task = tasks.value[taskIndex];
    if (!task) return false;

    tasks.value[taskIndex] = {
      ...task,
      ...updates,
      // 确保必填字段始终存在
      id: task.id,
      name: updates.name || task.name,
      type: updates.type || task.type,
      status: updates.status || task.status,
      config: updates.config || task.config,
      progress: updates.progress || task.progress,
      createdAt: task.createdAt,
      updatedAt: new Date(),
    };

    return true;
  }

  // 更新任务状态
  function updateTaskStatus(id: string, status: TaskStatus, errorInfo?: string): boolean {
    const taskIndex = tasks.value.findIndex((task) => task.id === id);
    if (taskIndex === -1) return false;

    const task = tasks.value[taskIndex];
    if (!task) return false;

    task.status = status;
    task.updatedAt = new Date();

    if (errorInfo !== undefined) {
      task.errorInfo = errorInfo;
    }

    return true;
  }

  // 更新任务进度
  function updateTaskProgress(id: string, progress: Partial<TaskProgress>): boolean {
    const taskIndex = tasks.value.findIndex((task) => task.id === id);
    if (taskIndex === -1) return false;

    const task = tasks.value[taskIndex];
    if (!task) return false;

    task.progress = {
      ...task.progress,
      ...progress,
    };
    task.updatedAt = new Date();

    return true;
  }

  // 移除任务
  function removeTask(id: string): boolean {
    const taskIndex = tasks.value.findIndex((task) => task.id === id);
    if (taskIndex === -1) return false;

    // 清理任务相关的定时器
    const task = tasks.value[taskIndex];
    if (task?.timers && task.timers.length > 0) {
      task.timers.forEach((timerId) => {
        clearTimeout(timerId);
        clearInterval(timerId);
      });
    }

    // 从数组中移除
    tasks.value.splice(taskIndex, 1);
    return true;
  }

  // 清理所有任务
  function clearAllTasks(): void {
    // 先清理所有定时器
    tasks.value.forEach((task) => {
      if (task.timers && task.timers.length > 0) {
        task.timers.forEach((timerId) => {
          clearTimeout(timerId);
          clearInterval(timerId);
        });
      }
    });

    // 清空数组
    tasks.value = [];
  }

  // 保存任务配置
  async function saveTaskConfig(id: string): Promise<boolean> {
    // 此处可以实现将任务配置保存到文件或localStorage的逻辑
    // 目前为简化版实现，实际实现可能需要调用electron的文件保存API
    try {
      const task = getTaskById(id);
      if (!task) return false;

      // 保存逻辑会在useSendTaskManager中实现
      console.log('保存任务配置', task);

      return true;
    } catch (e) {
      console.error('保存任务配置失败:', e);
      return false;
    }
  }

  // 加载保存的任务配置
  async function loadTaskConfig(data: any): Promise<string | null> {
    // 此处可以实现从文件或localStorage加载任务配置的逻辑
    try {
      // 验证数据格式
      if (!data || !data.type || !data.config) {
        throw new Error('无效的任务配置数据');
      }

      // 创建新任务
      const taskId = addTask({
        name: data.name || '加载的任务',
        type: data.type as TaskType,
        status: 'idle',
        config: data.config,
      });

      return taskId;
    } catch (e) {
      console.error('加载任务配置失败:', e);
      error.value = e instanceof Error ? e.message : '加载失败';
      return null;
    }
  }

  // 导出所有需要的状态和方法
  return {
    tasks,
    isLoading,
    error,
    activeTasks,
    completedTasks,
    getTaskById,
    addTask,
    updateTask,
    updateTaskStatus,
    updateTaskProgress,
    removeTask,
    clearAllTasks,
    saveTaskConfig,
    loadTaskConfig,
  };
});
