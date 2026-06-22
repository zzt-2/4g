/**
 * 任务配置管理器
 * 提供配置文件的保存和加载功能
 */

import type {
  SendFrameInstance,
  InstanceTargetConfig,
  StrategyConfig,
} from '../../../types/frames/sendInstances';
import type { ConfigFileResult, ConfigLoadResult } from '../../../types/frames/taskConfig';
import {
  createLeanTaskConfigFile,
  validateTaskConfigFile,
  extractInstancesFromConfig,
  validateInstanceReferences,
} from '../../../utils/frames/taskConfigUtils';
import { dataStorageAPI } from '../../../api/common';

interface TaskConfigData {
  targets: InstanceTargetConfig[];
  strategy?: StrategyConfig;
  name: string;
  description?: string;
}

export function useTaskConfigManager() {
  /**
   * 保存配置到用户选择的文件（使用精简格式）
   */
  async function saveConfigToUserFile(
    instances: SendFrameInstance[],
    targets: InstanceTargetConfig[],
    strategy?: StrategyConfig,
    name: string = '任务配置',
    description?: string,
  ): Promise<ConfigFileResult> {
    try {
      // 根据参数选择使用精简格式还是完整格式
      const configData = createLeanTaskConfigFile(instances, targets, strategy, name, description);

      // 使用 dataStorageAPI 的 export 功能，它会处理文件对话框
      const result = await dataStorageAPI.sendInstances.export([configData]);

      if (result.success && result.filePath) {
        return {
          success: true,
          data: configData,
          filePath: result.filePath,
          message: result.message || '配置保存成功',
        };
      } else {
        return {
          success: false,
          message: result.message || '保存失败',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      return { success: false, message };
    }
  }

  /**
   * 从用户选择的文件加载配置
   */
  async function loadConfigFromUserFile(
    availableInstances?: SendFrameInstance[], // 可选的当前可用实例列表，用于验证
  ): Promise<ConfigLoadResult> {
    try {
      // 使用 dataStorageAPI 的 import 功能，它会处理文件对话框
      const result = await dataStorageAPI.sendInstances.import();

      if (!result.success || !result.data?.length) {
        return {
          success: false,
          message: result.message || '加载失败',
        };
      }

      // 取第一个配置项（我们保存时只会有一个配置）
      const configData = result.data[0];

      // 验证配置格式
      if (!validateTaskConfigFile(configData)) {
        return { success: false, message: '无效的配置文件格式' };
      }

      // 提取配置数据
      const extractedData = extractInstancesFromConfig(configData);

      // 如果存在精简引用且提供了可用实例列表，则进行验证
      if (extractedData.instanceRefs && availableInstances) {
        const validation = validateInstanceReferences(
          extractedData.instanceRefs,
          availableInstances,
        );
        if (!validation.valid) {
          return {
            success: false,
            message: `配置验证失败:\n${validation.errors.join('\n')}`,
          };
        }
      }

      return {
        success: true,
        data: {
          targets: extractedData.targets,
          ...(extractedData.strategy ? { strategy: extractedData.strategy } : {}),
          name: configData.name,
          ...(configData.description ? { description: configData.description } : {}),
        },
        message: '配置加载成功',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载失败';
      return { success: false, message };
    }
  }

  /**
   * 创建任务配置数据格式
   */
  function createTaskConfigData(
    instances: SendFrameInstance[],
    targets: InstanceTargetConfig[],
    strategy?: StrategyConfig,
    name: string = '任务配置',
    description?: string,
  ) {
    return createLeanTaskConfigFile(instances, targets, strategy, name, description);
  }

  /**
   * 解析任务配置数据格式
   */
  function parseTaskConfigData(configData: unknown): TaskConfigData {
    // 验证配置格式
    if (!validateTaskConfigFile(configData)) {
      throw new Error('无效的配置文件格式');
    }

    // 提取配置数据
    const extractedData = extractInstancesFromConfig(configData);
    const config = configData as { name: string; description?: string };

    return {
      targets: extractedData.targets,
      ...(extractedData.strategy ? { strategy: extractedData.strategy } : {}),
      name: config.name,
      ...(config.description ? { description: config.description } : {}),
    };
  }

  return {
    saveConfigToUserFile,
    loadConfigFromUserFile,
    createTaskConfigData,
    parseTaskConfigData,
  };
}
