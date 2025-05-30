/**
 * 任务配置管理工具函数
 */

import type { TaskConfigFile, InstanceReference } from '../../types/frames/taskConfig';
import type {
  SendFrameInstance,
  InstanceTargetConfig,
  StrategyConfig,
} from '../../types/frames/sendInstances';

/**
 * 创建精简的任务配置文件数据（推荐使用）
 * 只存储实例引用信息，避免存储完整的字段数据
 */
export function createLeanTaskConfigFile(
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

  // 创建精简的实例引用
  const instanceRefs: InstanceReference[] = instances.map((instance) => ({
    id: instance.id,
    label: instance.label,
    frameId: instance.frameId,
    ...(instance.description ? { description: instance.description } : {}),
  }));

  const configFile: TaskConfigFile = {
    version: '1.0',
    configType: configType as TaskConfigFile['configType'],
    name,
    instanceRefs,
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
export function validateTaskConfigFile(data: unknown): data is TaskConfigFile {
  if (!data || typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.version === 'string' &&
    typeof obj.configType === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.instanceRefs) &&
    Array.isArray(obj.targets)
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
    instanceRefs: config.instanceRefs, // 新增：精简引用
    targets: config.targets,
    strategy: config.strategy,
    name: config.name,
    description: config.description,
  };
}

/**
 * 验证实例引用是否在当前系统中存在
 * @param instanceRefs 要验证的实例引用列表
 * @param availableInstances 当前系统中可用的实例列表
 * @returns 验证结果和错误信息
 */
export function validateInstanceReferences(
  instanceRefs: InstanceReference[],
  availableInstances: SendFrameInstance[],
): { valid: boolean; errors: string[]; missingInstances: string[] } {
  const errors: string[] = [];
  const missingInstances: string[] = [];

  for (const ref of instanceRefs) {
    const instance = availableInstances.find((inst) => inst.id === ref.id);
    if (!instance) {
      const error = `实例 "${ref.label}" (ID: ${ref.id}) 在当前系统中不存在`;
      errors.push(error);
      missingInstances.push(ref.id);
    } else if (instance.frameId !== ref.frameId) {
      const error = `实例 "${ref.label}" 的帧结构已发生变化 (期望: ${ref.frameId}, 实际: ${instance.frameId})`;
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingInstances,
  };
}
