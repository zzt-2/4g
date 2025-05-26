/**
 * 任务配置管理工具函数
 */

import type { TaskConfigFile } from '../../types/frames/taskConfig';
import type {
  SendFrameInstance,
  InstanceTargetConfig,
  StrategyConfig,
} from '../../types/frames/sendInstances';

/**
 * 创建任务配置文件数据
 */
export function createTaskConfigFile(
  instances: SendFrameInstance[],
  targets: InstanceTargetConfig[],
  strategy?: StrategyConfig,
  name: string = '任务配置',
  description?: string,
): TaskConfigFile {
  const configType =
    instances.length === 1
      ? `single-${strategy?.type || 'immediate'}`
      : `multi-${strategy?.type || 'immediate'}`;

  const configFile: TaskConfigFile = {
    version: '1.0',
    configType: configType as TaskConfigFile['configType'],
    name,
    instances,
    targets,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 仅在有值时添加可选属性
  if (description) {
    configFile.description = description;
  }
  if (strategy) {
    configFile.strategy = strategy;
  }

  return configFile;
}

/**
 * 验证任务配置文件格式
 */
export function validateTaskConfigFile(data: any): data is TaskConfigFile {
  return (
    data &&
    typeof data === 'object' &&
    data.version &&
    data.configType &&
    data.name &&
    Array.isArray(data.instances) &&
    Array.isArray(data.targets)
  );
}

/**
 * 获取配置类型的显示标签
 */
export function getConfigTypeLabel(configType: TaskConfigFile['configType']): string {
  const labels: Record<TaskConfigFile['configType'], string> = {
    'single-immediate': '单帧立即发送',
    'single-timed': '单帧定时发送',
    'single-triggered': '单帧触发发送',
    'multi-immediate': '多帧顺序发送',
    'multi-timed': '多帧定时发送',
    'multi-triggered': '多帧触发发送',
  };
  return labels[configType] || '未知配置';
}

/**
 * 从配置文件提取实例数据
 */
export function extractInstancesFromConfig(config: TaskConfigFile) {
  return {
    instances: config.instances,
    targets: config.targets,
    strategy: config.strategy,
    name: config.name,
    description: config.description,
  };
}
