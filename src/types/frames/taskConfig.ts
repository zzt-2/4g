/**
 * 任务配置文件相关类型定义
 */

import type { InstanceTargetConfig, StrategyConfig } from './sendInstances';

/**
 * 精简的实例引用信息（用于任务配置）
 * 只包含任务配置所需的基本信息，避免存储完整的字段数据
 */
export interface InstanceReference {
  id: string; // 实例ID
  label: string; // 实例标签（用于显示）
  frameId: string; // 关联的帧结构ID（用于验证）
  description?: string; // 实例描述
}

/**
 * 任务配置文件格式
 */
export interface TaskConfigFile {
  version: string;
  configType:
    | 'single-immediate'
    | 'single-timed'
    | 'single-triggered'
    | 'multi-immediate'
    | 'multi-timed'
    | 'multi-triggered';
  name: string;
  description?: string;
  instanceRefs?: InstanceReference[]; // 新的精简引用格式
  targets: InstanceTargetConfig[];
  strategy?: StrategyConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * 配置文件操作结果
 */
export interface ConfigFileResult<T = TaskConfigFile> {
  success: boolean;
  data?: T;
  message?: string;
  filePath?: string;
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  success: boolean;
  data?: {
    targets: InstanceTargetConfig[];
    strategy?: StrategyConfig;
    name: string;
    description?: string;
  };
  message?: string;
}
