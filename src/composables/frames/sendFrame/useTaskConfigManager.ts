/**
 * 任务配置管理器
 * 提供配置文件的保存和加载功能
 */

import type {
  SendFrameInstance,
  InstanceTargetConfig,
  StrategyConfig,
} from '../../../types/frames/sendInstances';
import type {
  TaskConfigFile,
  ConfigFileResult,
  ConfigLoadResult,
} from '../../../types/frames/taskConfig';
import {
  createTaskConfigFile,
  validateTaskConfigFile,
  extractInstancesFromConfig,
} from '../../../utils/frames/taskConfigUtils';

export function useTaskConfigManager() {
  /**
   * 保存配置到用户选择的文件
   */
  async function saveConfigToUserFile(
    instances: SendFrameInstance[],
    targets: InstanceTargetConfig[],
    strategy?: StrategyConfig,
    name: string = '任务配置',
    description?: string,
  ): Promise<ConfigFileResult> {
    try {
      const configData = createTaskConfigFile(instances, targets, strategy, name, description);

      // 使用 Electron 的文件对话框
      const { dialog } = window.require('electron').remote;
      const result = await dialog.showSaveDialog({
        title: '保存任务配置',
        defaultPath: `${name.replace(/\s+/g, '_')}.json`,
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, message: '用户取消保存' };
      }

      // 保存文件
      const fs = window.require('fs').promises;
      await fs.writeFile(result.filePath, JSON.stringify(configData, null, 2), 'utf-8');

      return {
        success: true,
        data: configData,
        filePath: result.filePath,
        message: '配置保存成功',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      return { success: false, message };
    }
  }

  /**
   * 从用户选择的文件加载配置
   */
  async function loadConfigFromUserFile(): Promise<ConfigLoadResult> {
    try {
      // 使用 Electron 的文件对话框
      const { dialog } = window.require('electron').remote;
      const result = await dialog.showOpenDialog({
        title: '加载任务配置',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths?.length) {
        return { success: false, message: '用户取消加载' };
      }

      // 读取文件
      const fs = window.require('fs').promises;
      const fileContent = await fs.readFile(result.filePaths[0], 'utf-8');
      const configData = JSON.parse(fileContent);

      // 验证配置格式
      if (!validateTaskConfigFile(configData)) {
        return { success: false, message: '无效的配置文件格式' };
      }

      // 提取配置数据
      const extractedData = extractInstancesFromConfig(configData);

      return {
        success: true,
        data: {
          instances: extractedData.instances,
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
   * 保存配置到指定路径
   */
  async function saveConfigToPath(
    filePath: string,
    instances: SendFrameInstance[],
    targets: InstanceTargetConfig[],
    strategy?: StrategyConfig,
    name: string = '任务配置',
    description?: string,
  ): Promise<ConfigFileResult> {
    try {
      const configData = createTaskConfigFile(instances, targets, strategy, name, description);

      // 保存文件
      const fs = window.require('fs').promises;
      await fs.writeFile(filePath, JSON.stringify(configData, null, 2), 'utf-8');

      return {
        success: true,
        data: configData,
        filePath,
        message: '配置保存成功',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      return { success: false, message };
    }
  }

  /**
   * 从指定路径加载配置
   */
  async function loadConfigFromPath(filePath: string): Promise<ConfigLoadResult> {
    try {
      // 读取文件
      const fs = window.require('fs').promises;
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const configData = JSON.parse(fileContent);

      // 验证配置格式
      if (!validateTaskConfigFile(configData)) {
        return { success: false, message: '无效的配置文件格式' };
      }

      // 提取配置数据
      const extractedData = extractInstancesFromConfig(configData);

      return {
        success: true,
        data: {
          instances: extractedData.instances,
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

  return {
    saveConfigToUserFile,
    loadConfigFromUserFile,
    saveConfigToPath,
    loadConfigFromPath,
  };
}
