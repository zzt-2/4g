/**
 * 发送任务触发监听器 - 可组合函数
 *
 * 负责管理活跃的触发监听器、条件评估和触发执行
 */
import { ref } from 'vue';
import type { TriggerCondition } from '../../../types/frames/sendInstances';
import type { DataItem } from '../../../types/frames/receive';
import { useSendTasksStore } from '../../../stores/frames/sendTasksStore';
import type { TriggerTaskConfig } from '../../../stores/frames/sendTasksStore';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';

/**
 * 触发监听器接口
 */
export interface TriggerListener {
  taskId: string;
  sourceId: string;
  triggerFrameId: string;
  conditions: TriggerCondition[];
  continueListening: boolean;
  responseDelay: number;
}

/**
 * 触发监听器可组合函数
 */
export function useSendTaskTriggerListener() {
  // 活跃的触发监听器
  const activeTriggerListeners = ref<Map<string, TriggerListener>>(new Map());

  /**
   * 注册触发监听器
   */
  const registerTriggerListener = (
    taskId: string,
    config: {
      sourceId: string;
      triggerFrameId: string;
      conditions: TriggerCondition[];
      continueListening?: boolean;
      responseDelay?: number;
    },
  ): void => {
    const listener: TriggerListener = {
      taskId,
      sourceId: config.sourceId,
      triggerFrameId: config.triggerFrameId,
      conditions: config.conditions || [],
      continueListening: config.continueListening ?? true,
      responseDelay: config.responseDelay || 0,
    };

    activeTriggerListeners.value.set(taskId, listener);
  };

  /**
   * 注销触发监听器
   */
  const unregisterTriggerListener = (taskId: string): void => {
    const removed = activeTriggerListeners.value.delete(taskId);
    if (!removed) {
      console.warn(`尝试注销不存在的监听器: ${taskId}`);
    }
  };

  /**
   * 处理接收帧数据
   */
  const handleFrameReceived = (
    frameId: string,
    sourceId: string,
    updatedDataItems?: DataItem[],
  ): void => {
    // 遍历活跃的触发监听器
    for (const [taskId, listener] of activeTriggerListeners.value) {
      // 检查帧ID和来源ID是否匹配
      if (listener.triggerFrameId === frameId && listener.sourceId === sourceId) {
        // 检查任务是否仍在等待触发状态
        const sendTasksStore = useSendTasksStore();
        const task = sendTasksStore.getTaskById(taskId);
        if (!task || task.status !== 'waiting-trigger') {
          continue;
        }

        // 评估触发条件
        const shouldTrigger = evaluateTriggerConditions(listener.conditions, updatedDataItems);

        if (shouldTrigger) {
          console.log(`触发条件满足，执行任务: ${taskId}`);
          executeTriggerTask(taskId, listener);
        }
      }
    }
  };

  /**
   * 评估触发条件
   */
  const evaluateTriggerConditions = (
    conditions: TriggerCondition[],
    dataItems?: DataItem[],
  ): boolean => {
    // 空条件数组 = 默认触发（接收到帧就触发）
    if (!conditions || conditions.length === 0) {
      return true;
    }

    if (!dataItems || dataItems.length === 0) {
      return false;
    }

    // 评估所有条件
    let result = true;
    let lastLogicOperator: 'and' | 'or' | undefined = undefined;

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];

      // 检查条件是否有效
      if (!condition) {
        console.warn(`条件 ${i + 1} 为空，跳过`);
        continue;
      }

      // 查找对应的数据项
      const dataItem = findDataItemByFieldId(condition.fieldId, dataItems);
      if (!dataItem) {
        console.warn(`找不到字段ID对应的数据项: ${condition.fieldId}`);
        if (i === 0 || lastLogicOperator === 'and') {
          return false; // AND 逻辑，任何一个条件失败就失败
        }
        continue; // OR 逻辑，继续检查其他条件
      }

      const conditionResult = evaluateSingleCondition(condition, dataItem);

      if (i === 0) {
        result = conditionResult;
      } else {
        const operator = lastLogicOperator || 'and';
        if (operator === 'and') {
          result = result && conditionResult;
        } else if (operator === 'or') {
          result = result || conditionResult;
        }
      }

      lastLogicOperator = condition.logicOperator;

      // 短路逻辑：AND 遇到 false 或 OR 遇到 true 时提前结束
      if ((lastLogicOperator === 'and' && !result) || (lastLogicOperator === 'or' && result)) {
        break;
      }
    }

    return result;
  };

  /**
   * 查找字段ID对应的数据项
   * 通过接收帧映射关系来查找
   */
  const findDataItemByFieldId = (fieldId: string, dataItems: DataItem[]): DataItem | null => {
    // 获取接收帧Store来查找映射关系
    const receiveFramesStore = useReceiveFramesStore();

    // 查找字段ID对应的映射关系
    const mapping = receiveFramesStore.mappings.find((m) => m.fieldId === fieldId);
    if (!mapping) {
      console.warn(`[TriggerListener] 找不到字段 ${fieldId} 的映射关系`);
      return null;
    }

    // 从传入的数据项中查找对应的数据项
    // 这里需要匹配映射关系中定义的dataItemId
    const dataItem = dataItems.find((item) => item.id === mapping.dataItemId);
    if (!dataItem) {
      console.warn(`[TriggerListener] 在当前数据项中找不到 ${mapping.dataItemId}`);
      return null;
    }

    return dataItem;
  };

  /**
   * 评估单个条件
   */
  const evaluateSingleCondition = (condition: TriggerCondition, dataItem: DataItem): boolean => {
    const { condition: operator, value: expectedValue } = condition;
    const actualValue = dataItem.value;

    try {
      switch (operator) {
        case 'equals':
          return String(actualValue) === String(expectedValue);
        case 'not_equals':
          return String(actualValue) !== String(expectedValue);
        case 'greater':
          return Number(actualValue) > Number(expectedValue);
        case 'less':
          return Number(actualValue) < Number(expectedValue);
        case 'contains':
          return String(actualValue).includes(String(expectedValue));
        default:
          console.warn(`[TriggerListener] 未知的条件操作符: ${operator}`);
          return false;
      }
    } catch (error) {
      console.error(`[TriggerListener] 条件评估异常:`, {
        operator,
        actualValue,
        expectedValue,
        error,
      });
      return false;
    }
  };

  /**
   * 执行触发任务
   */
  const executeTriggerTask = async (taskId: string, listener: TriggerListener): Promise<void> => {
    const sendTasksStore = useSendTasksStore();

    try {
      // 添加响应延时
      if (listener.responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, listener.responseDelay));
      }

      // 获取任务配置
      const task = sendTasksStore.getTaskById(taskId);
      if (!task) {
        throw new Error('找不到指定的任务');
      }

      // 检查任务状态
      if (task.status !== 'running' && task.status !== 'waiting-trigger') {
        return;
      }

      // 动态导入 taskExecutor 避免循环依赖
      const { useSendTaskExecutor } = await import('./useSendTaskExecutor');
      const taskExecutor = useSendTaskExecutor();

      // 获取任务配置
      const config = task.config as TriggerTaskConfig;
      if (!config || !config.instances || config.instances.length === 0) {
        throw new Error('任务配置无效: 没有实例');
      }

      // 创建空的定时器数组（触发任务不需要定时器）
      const timers: string[] = [];

      let success = false;

      // 根据实例数量选择处理方式
      if (config.instances.length === 1) {
        // 单实例：使用带状态管理的实例处理方法
        const instanceConfig = config.instances[0];

        if (!instanceConfig) {
          throw new Error('无效的实例配置');
        }

        success = await taskExecutor.processInstance(
          instanceConfig,
          taskId,
          task.name,
          timers,
          0, // instanceIndex
          1, // totalInstances
          true, // isLastInstance = true
        );
      } else {
        // 多实例：使用 processMultipleInstances（已包含完整状态管理）
        success = await taskExecutor.processMultipleInstances(
          config.instances,
          taskId,
          task.name,
          timers,
        );
      }

      if (!success) {
        throw new Error('任务执行失败');
      }

      // 根据 continueListening 决定是否继续监听
      if (!listener.continueListening) {
        unregisterTriggerListener(taskId);
        // 单实例完成后更新任务状态
        sendTasksStore.updateTaskStatus(taskId, 'completed');
        sendTasksStore.updateTaskProgressCached(taskId, {
          percentage: 100,
        });
      }
    } catch (error) {
      console.error(`触发任务执行异常: ${taskId}`, error);
      sendTasksStore.updateTaskStatus(
        taskId,
        'error',
        error instanceof Error ? error.message : '触发执行异常',
      );

      // 执行失败时也要清理监听器
      unregisterTriggerListener(taskId);
    }
  };

  /**
   * 获取活跃监听器信息
   */
  const getActiveTriggerListeners = (): TriggerListener[] => {
    return Array.from(activeTriggerListeners.value.values());
  };

  /**
   * 获取指定任务的监听器
   */
  const getTriggerListener = (taskId: string): TriggerListener | null => {
    return activeTriggerListeners.value.get(taskId) || null;
  };

  /**
   * 检查是否存在指定任务的监听器
   */
  const hasTriggerListener = (taskId: string): boolean => {
    return activeTriggerListeners.value.has(taskId);
  };

  /**
   * 清理所有监听器
   */
  const clearAllTriggerListeners = (): void => {
    activeTriggerListeners.value.clear();
  };

  /**
   * 清理指定帧的监听器
   */
  const clearListenersByFrame = (frameId: string): number => {
    let removedCount = 0;
    for (const [taskId, listener] of activeTriggerListeners.value) {
      if (listener.triggerFrameId === frameId) {
        activeTriggerListeners.value.delete(taskId);
        removedCount++;
      }
    }

    return removedCount;
  };

  /**
   * 获取监听器统计信息
   */
  const getListenerStats = () => {
    const listeners = getActiveTriggerListeners();
    const frameGroups = new Map<string, number>();
    const sourceGroups = new Map<string, number>();

    listeners.forEach((listener) => {
      frameGroups.set(listener.triggerFrameId, (frameGroups.get(listener.triggerFrameId) || 0) + 1);
      sourceGroups.set(listener.sourceId, (sourceGroups.get(listener.sourceId) || 0) + 1);
    });

    return {
      total: listeners.length,
      byFrame: Object.fromEntries(frameGroups),
      bySource: Object.fromEntries(sourceGroups),
      withConditions: listeners.filter((l) => l.conditions.length > 0).length,
      withoutConditions: listeners.filter((l) => l.conditions.length === 0).length,
    };
  };

  return {
    // 状态
    activeTriggerListeners,

    // 核心功能
    registerTriggerListener,
    unregisterTriggerListener,
    handleFrameReceived,
    evaluateTriggerConditions,

    // 查询功能
    getActiveTriggerListeners,
    getTriggerListener,
    hasTriggerListener,
    getListenerStats,

    // 管理功能
    clearAllTriggerListeners,
    clearListenersByFrame,

    // 内部方法暴露（用于测试）
    findDataItemByFieldId,
    evaluateSingleCondition,
  };
}
