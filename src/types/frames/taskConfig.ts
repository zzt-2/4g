/**
 * 任务配置文件相关类型定义
 */

import type { SendFrameInstance, InstanceTargetConfig, StrategyConfig } from './sendInstances';

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
  instances: SendFrameInstance[];
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
    instances: SendFrameInstance[];
    targets: InstanceTargetConfig[];
    strategy?: StrategyConfig;
    name: string;
    description?: string;
  };
  message?: string;
}
