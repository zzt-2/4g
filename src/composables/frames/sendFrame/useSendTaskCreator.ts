/**
 * 发送任务创建器 - 可组合函数
 *
 * 负责各种类型任务的创建
 */
import { ref } from 'vue';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
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
  // 获取store实例
  const sendFrameInstancesStore = useSendFrameInstancesStore();
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
    console.log('createTimedSingleTask - 接收到的参数:', {
      instanceId,
      targetId,
      interval,
      repeatCount,
      isInfinite,
      name,
    });

    try {
      // 查找实例
      const instance = sendFrameInstancesStore.instances.find((i) => i.id === instanceId);
      if (!instance) {
        processingError.value = '无法创建任务：找不到指定的实例';
        console.error('createTimedSingleTask - 找不到实例:', instanceId);
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

      console.log('createTimedSingleTask - 创建任务配置:', taskConfig);

      // 添加到任务存储
      const taskId = sendTasksStore.addTask({
        name,
        type: 'timed-single',
        status: 'idle',
        config: taskConfig,
      });

      console.log('createTimedSingleTask - 任务已添加到存储:', { taskId, type: 'timed-single' });

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
    conditions: TriggerCondition[],
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
    conditions: TriggerCondition[],
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

      return taskId;
    } catch (e) {
      console.error('创建多实例触发发送任务失败:', e);
      processingError.value = e instanceof Error ? e.message : '创建任务失败';
      return null;
    }
  }

  return {
    // 状态
    processingError,

    // 任务创建
    createSequentialTask,
    createTimedSingleTask,
    createTimedMultipleTask,
    createTriggeredSingleTask,
    createTriggeredMultipleTask,
  };
}
