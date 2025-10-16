/**
 * 发送任务创建器 - 可组合函数
 *
 * 负责各种类型任务的创建
 */
import { ref } from 'vue';
import {
  useSendTasksStore,
  FrameInstanceInTask,
  TaskConfigBase,
  TimedTaskConfig,
  TriggerTaskConfig,
} from '../../../stores/frames/sendTasksStore';
import type { TriggerCondition } from '../../../types/frames/sendInstances';

/**
 * 任务创建器可组合函数
 */
export function useSendTaskCreator() {
  const sendTasksStore = useSendTasksStore();

  // 本地状态
  const processingError = ref<string | null>(null);

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

      return taskId;
    } catch (e) {
      console.error('创建顺序发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建定时发送任务
   */
  function createTimedTask(
    instances: FrameInstanceInTask[],
    sendInterval: number,
    repeatCount: number,
    isInfinite: boolean = false,
    name: string = '定时发送任务',
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
        type: 'timed',
        status: 'idle',
        config: taskConfig,
      });

      return taskId;
    } catch (e) {
      console.error('创建定时发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建触发发送任务
   */
  function createTriggeredTask(
    instances: FrameInstanceInTask[],
    sourceId: string,
    triggerFrameId: string,
    conditions: TriggerCondition[],
    name: string = '触发发送任务',
    description: string = '',
    continueListening: boolean = true,
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
        continueListening,
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'triggered',
        status: 'idle',
        config: taskConfig,
      });

      return taskId;
    } catch (e) {
      console.error('创建触发发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  /**
   * 创建时间触发发送任务
   */
  function createTimedTriggeredTask(
    instances: FrameInstanceInTask[],
    executeTime: string,
    isRecurring: boolean = false,
    recurringType?: 'daily' | 'weekly' | 'monthly' | 'second' | 'minute' | 'hour',
    recurringInterval?: number,
    endTime?: string,
    name: string = '时间触发发送任务',
    description: string = '',
  ): string | null {
    if (!instances.length) {
      processingError.value = '无法创建任务：没有实例';
      return null;
    }

    try {
      // 创建时间触发任务配置
      const taskConfig: TriggerTaskConfig = {
        instances,
        name,
        description,
        sourceId: '', // 时间触发不需要源ID
        triggerFrameId: '', // 时间触发不需要触发帧ID
        conditions: [], // 时间触发不需要条件
        triggerType: 'time',
        executeTime,
        isRecurring,
        ...(recurringType ? { recurringType } : {}),
        ...(recurringInterval !== undefined ? { recurringInterval } : {}),
        ...(endTime ? { endTime } : {}),
      };

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'triggered',
        status: 'idle',
        config: taskConfig,
      });

      return taskId;
    } catch (e) {
      console.error('创建时间触发发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  return {
    // 状态
    processingError,

    // 任务创建
    createSequentialTask,
    createTimedTask,
    createTriggeredTask,
    createTimedTriggeredTask,
  };
}
