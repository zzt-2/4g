/**
 * 发送任务配置管理器 - 可组合函数
 *
 * 负责任务配置的保存和加载
 */
import { ref } from 'vue';
import {
  useSendTasksStore,
  TimedTaskConfig,
  TriggerTaskConfig,
} from '../../../stores/frames/sendTasksStore';
import type { TriggerCondition } from '../../../types/frames/sendInstances';
import { fileDialogManager } from '../../../utils/common/fileDialogManager';
import { pathAPI } from '../../../api/common';
import { useSendTaskCreator } from './useSendTaskCreator';

/**
 * 任务配置数据接口
 */
interface TaskConfigData {
  version?: string;
  taskType: string;
  taskName: string;
  taskDescription?: string;
  instances: Array<{
    id: string;
    instanceId: string;
    targetId: string;
    interval?: number;
  }>;
  typeSpecificConfig?: {
    sendInterval?: number;
    repeatCount?: number;
    isInfinite?: boolean;
    sourceId?: string;
    triggerFrameId?: string;
    conditions?: TriggerCondition[];
  };
  createdAt?: string;
  savedBy?: string;
}

/**
 * 批量任务配置数据接口
 */
interface BatchTaskConfigData {
  version?: string;
  type: string;
  tasks: TaskConfigData[];
  taskCount?: number;
  createdAt?: string;
  savedBy?: string;
}

/**
 * 任务配置管理器可组合函数
 */
export function useSendTaskConfigManager() {
  // 获取store实例和创建器
  const sendTasksStore = useSendTasksStore();
  const {
    createSequentialTask,
    createTimedSingleTask,
    createTimedMultipleTask,
    createTriggeredSingleTask,
    createTriggeredMultipleTask,
  } = useSendTaskCreator();

  // 本地状态
  const processingError = ref<string | null>(null);

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
        createdAt: new Date().toISOString(),
        savedBy: '上位机应用',
      };

      const defaultFilename = `task_${task.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
      const saveFilename = filename || defaultFilename;

      // 使用fileDialogManager导出配置
      const result = await fileDialogManager.exportFile(
        '保存任务配置',
        `${pathAPI.getDataPath()}/data/tasks/${saveFilename}`,
        configData,
      );

      if (result && result.success) {
        console.log('任务配置已保存到:', result.filePath);
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
        const taskData = result.fileData as TaskConfigData;

        if (
          !taskData ||
          !taskData.taskType ||
          !taskData.instances ||
          !Array.isArray(taskData.instances)
        ) {
          throw new Error('无效的任务配置数据');
        }

        console.log('加载任务配置:', {
          version: taskData.version,
          taskType: taskData.taskType,
          taskName: taskData.taskName,
          instancesCount: taskData.instances.length,
          hasTypeSpecificConfig: !!taskData.typeSpecificConfig,
        });

        // 使用导入的数据创建任务
        let taskId: string | null = null;

        switch (taskData.taskType) {
          case 'sequential':
            taskId = createSequentialTask(
              taskData.instances,
              taskData.taskName || '导入的顺序发送任务',
              taskData.taskDescription,
            );
            break;

          case 'timed-single':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的定时任务配置');
            }

            if (!taskData.instances[0]) {
              throw new Error('定时单实例任务需要至少一个实例');
            }

            taskId = createTimedSingleTask(
              taskData.instances[0].instanceId,
              taskData.instances[0].targetId,
              taskData.typeSpecificConfig!.sendInterval!,
              taskData.typeSpecificConfig!.repeatCount!,
              taskData.typeSpecificConfig!.isInfinite || false,
              taskData.taskName || '导入的定时发送任务',
            );
            break;

          case 'timed-multiple':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的多实例定时任务配置');
            }

            taskId = createTimedMultipleTask(
              taskData.instances,
              taskData.typeSpecificConfig!.sendInterval!,
              taskData.typeSpecificConfig!.repeatCount!,
              taskData.typeSpecificConfig!.isInfinite || false,
              taskData.taskName || '导入的多实例定时发送任务',
              taskData.taskDescription,
            );
            break;

          case 'triggered-single':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的触发任务配置');
            }

            if (!taskData.instances[0]) {
              throw new Error('触发单实例任务需要至少一个实例');
            }

            taskId = createTriggeredSingleTask(
              taskData.instances[0].instanceId,
              taskData.instances[0].targetId,
              taskData.typeSpecificConfig!.sourceId!,
              taskData.typeSpecificConfig!.triggerFrameId!,
              taskData.typeSpecificConfig!.conditions || [],
              taskData.taskName || '导入的触发发送任务',
            );
            break;

          case 'triggered-multiple':
            if (!taskData.typeSpecificConfig) {
              throw new Error('无效的多实例触发任务配置');
            }

            taskId = createTriggeredMultipleTask(
              taskData.instances,
              taskData.typeSpecificConfig!.sourceId!,
              taskData.typeSpecificConfig!.triggerFrameId!,
              taskData.typeSpecificConfig!.conditions || [],
              taskData.taskName || '导入的多实例触发发送任务',
              taskData.taskDescription,
            );
            break;

          default:
            throw new Error(`未知的任务类型: ${taskData.taskType}`);
        }

        if (taskId) {
          console.log('任务配置已加载，创建的任务ID:', taskId);
          console.log('配置文件路径:', result.filePath);
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

  /**
   * 批量保存多个任务配置到一个文件
   */
  async function saveMultipleTaskConfigs(taskIds: string[], filename?: string): Promise<boolean> {
    if (!taskIds.length) {
      processingError.value = '没有选择要保存的任务';
      return false;
    }

    try {
      const taskConfigs = taskIds.map((taskId) => {
        const task = sendTasksStore.getTaskById(taskId);
        if (!task) {
          throw new Error(`找不到任务: ${taskId}`);
        }

        return {
          taskId: task.id,
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
      });

      const configData = {
        version: '1.0',
        type: 'multiple-tasks',
        tasks: taskConfigs,
        taskCount: taskConfigs.length,
        createdAt: new Date().toISOString(),
        savedBy: 'RS485上位机应用',
      };

      const defaultFilename = `tasks_batch_${Date.now()}.json`;
      const saveFilename = filename || defaultFilename;

      // 使用fileDialogManager导出配置
      const result = await fileDialogManager.exportFile(
        '批量保存任务配置',
        `${pathAPI.getDataPath()}/data/tasks/${saveFilename}`,
        configData,
      );

      if (result && result.success) {
        console.log(`批量保存了 ${taskConfigs.length} 个任务配置到:`, result.filePath);
        return true;
      } else if (result && !result.canceled) {
        processingError.value = result.error ? String(result.error) : '批量保存失败';
        return false;
      }

      return false;
    } catch (e) {
      console.error('批量保存任务配置失败:', e);
      processingError.value = e instanceof Error ? e.message : '批量保存失败';
      return false;
    }
  }

  /**
   * 批量加载多个任务配置
   */
  async function loadMultipleTaskConfigs(): Promise<string[]> {
    try {
      // 使用fileDialogManager导入配置
      const result = await fileDialogManager.importFile(
        '批量加载任务配置',
        `${pathAPI.getDataPath()}/data/tasks`,
      );

      if (!result.canceled && result.fileData) {
        const data = result.fileData as BatchTaskConfigData;

        if (!data || data.type !== 'multiple-tasks' || !Array.isArray(data.tasks)) {
          throw new Error('无效的批量任务配置数据');
        }

        console.log(`开始批量加载 ${data.tasks.length} 个任务配置`);

        const createdTaskIds: string[] = [];

        for (const taskData of data.tasks) {
          try {
            let taskId: string | null = null;

            switch (taskData.taskType) {
              case 'sequential':
                taskId = createSequentialTask(
                  taskData.instances,
                  taskData.taskName || '导入的顺序发送任务',
                  taskData.taskDescription,
                );
                break;

              case 'timed-single':
                if (!taskData.typeSpecificConfig || !taskData.instances[0]) {
                  console.warn(`跳过无效的定时单实例任务: ${taskData.taskName}`);
                  continue;
                }

                taskId = createTimedSingleTask(
                  taskData.instances[0].instanceId,
                  taskData.instances[0].targetId,
                  taskData.typeSpecificConfig!.sendInterval!,
                  taskData.typeSpecificConfig!.repeatCount!,
                  taskData.typeSpecificConfig!.isInfinite || false,
                  taskData.taskName || '导入的定时发送任务',
                );
                break;

              case 'timed-multiple':
                if (!taskData.typeSpecificConfig) {
                  console.warn(`跳过无效的多实例定时任务: ${taskData.taskName}`);
                  continue;
                }

                taskId = createTimedMultipleTask(
                  taskData.instances,
                  taskData.typeSpecificConfig!.sendInterval!,
                  taskData.typeSpecificConfig!.repeatCount!,
                  taskData.typeSpecificConfig!.isInfinite || false,
                  taskData.taskName || '导入的多实例定时发送任务',
                  taskData.taskDescription,
                );
                break;

              case 'triggered-single':
                if (!taskData.typeSpecificConfig || !taskData.instances[0]) {
                  console.warn(`跳过无效的触发单实例任务: ${taskData.taskName}`);
                  continue;
                }

                taskId = createTriggeredSingleTask(
                  taskData.instances[0].instanceId,
                  taskData.instances[0].targetId,
                  taskData.typeSpecificConfig!.sourceId!,
                  taskData.typeSpecificConfig!.triggerFrameId!,
                  taskData.typeSpecificConfig!.conditions || [],
                  taskData.taskName || '导入的触发发送任务',
                );
                break;

              case 'triggered-multiple':
                if (!taskData.typeSpecificConfig) {
                  console.warn(`跳过无效的多实例触发任务: ${taskData.taskName}`);
                  continue;
                }

                taskId = createTriggeredMultipleTask(
                  taskData.instances,
                  taskData.typeSpecificConfig!.sourceId!,
                  taskData.typeSpecificConfig!.triggerFrameId!,
                  taskData.typeSpecificConfig!.conditions || [],
                  taskData.taskName || '导入的多实例触发发送任务',
                  taskData.taskDescription,
                );
                break;

              default:
                console.warn(`跳过未知任务类型: ${taskData.taskType}`);
                continue;
            }

            if (taskId) {
              createdTaskIds.push(taskId);
              console.log(`成功创建任务: ${taskData.taskName} (ID: ${taskId})`);
            }
          } catch (error) {
            console.error(`创建任务失败: ${taskData.taskName}`, error);
            continue;
          }
        }

        console.log(`批量加载完成，成功创建 ${createdTaskIds.length} 个任务`);
        return createdTaskIds;
      }

      return [];
    } catch (e) {
      console.error('批量加载任务配置失败:', e);
      processingError.value = e instanceof Error ? e.message : '批量加载失败';
      return [];
    }
  }

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
    processingError,

    // 配置管理
    saveTaskConfigToFile,
    loadTaskConfigFromFile,
    saveMultipleTaskConfigs,
    loadMultipleTaskConfigs,

    // 工具函数
    validateTaskConfig,
  };
}
