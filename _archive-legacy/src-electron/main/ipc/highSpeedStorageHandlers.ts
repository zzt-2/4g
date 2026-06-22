/**
 * 高速存储IPC处理器
 * 管理业务数据的高速存储功能
 */

import { IpcMainInvokeEvent } from 'electron';
import { createWriteStream, WriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import { pathAPI } from '../../preload/api/path';
import type {
  FrameHeaderRule,
  StorageConfig,
  StorageStats,
  StorageOperationResult,
  RuleValidationResult,
} from '../../../src/types/serial/highSpeedStorage';

// 业务数据存储的基础目录
const getBusinessDataDirectory = (): string => {
  const userDataPath = pathAPI.getDataPath();
  return path.join(userDataPath, 'business-data');
};

/**
 * 高速存储管理器
 */
class HighSpeedStorageManager {
  private config: StorageConfig = {
    enabled: false,
    rule: null,
    maxFileSize: 100, // 100MB
    enableRotation: true,
    rotationCount: 5,
  };

  private stats: StorageStats = {
    totalFramesStored: 0,
    totalBytesStored: 0,
    currentFileSize: 0,
    storageStartTime: null,
    lastStorageTime: null,
    frameTypeStats: {},
    currentFilePath: '',
    isStorageActive: false,
  };

  private writeStream: WriteStream | null = null;
  private currentFilePath: string = '';

  /**
   * 将十六进制字符串转换为字节数组
   * @param hexString 十六进制字符串，如 "AABBCC"
   * @returns 字节数组
   */
  private hexStringToBytes(hexString: string): number[] {
    const cleanHex = hexString.replace(/\s/g, '').toUpperCase();
    const bytes: number[] = [];

    for (let i = 0; i < cleanHex.length; i += 2) {
      const byte = parseInt(cleanHex.substr(i, 2), 16);
      if (!isNaN(byte)) {
        bytes.push(byte);
      }
    }

    return bytes;
  }

  /**
   * 快速帧头匹配函数
   * @param data 接收数据
   * @param rule 匹配规则
   * @returns 是否匹配
   */
  private matchFrameHeader(data: Uint8Array, rule: FrameHeaderRule): boolean {
    // 检查是否匹配任何一个帧头模式
    for (const headerPattern of rule.headerPatterns) {
      const pattern = this.hexStringToBytes(headerPattern);

      if (data.length >= pattern.length) {
        let matches = true;
        for (let i = 0; i < pattern.length; i++) {
          if (data[i] !== pattern[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查是否应该存储此数据
   * @param connectionId 连接ID
   * @param data 接收数据
   * @returns 匹配的规则或null
   */
  public shouldStore(connectionId: string, data: Uint8Array): FrameHeaderRule | null {
    if (!this.config.enabled || !this.config.rule) return null;

    const rule = this.config.rule;
    // console.log('rule为', rule.connectionId, 'connectionId为', connectionId);
    if (!rule.enabled) return null;

    // 解析规则中的连接ID，支持useConnectionTargets格式
    const ruleConnectionId = this.parseConnectionId(rule.connectionId);
    // console.log('ruleConnectionId为', ruleConnectionId, 'connectionId为', connectionId);
    // console.log('this.matchFrameHeader(data, rule)为', this.matchFrameHeader(data, rule));
    if (ruleConnectionId === connectionId && this.matchFrameHeader(data, rule)) {
      return rule;
    }
    return null;
  }

  /**
   * 解析连接ID，从useConnectionTargets格式中提取实际的连接ID
   * @param targetId 目标ID，可能是 "network:conn_xxx:remote_xxx" 格式
   * @returns 实际的连接ID
   */
  private parseConnectionId(targetId: string): string {
    // 如果是useConnectionTargets格式：network:connectionId:remoteHostId
    if (targetId.startsWith('network:')) {
      const parts = targetId.split(':');
      if (parts.length >= 2 && parts[1]) {
        return parts[1]; // 返回实际的连接ID
      }
    }

    // 如果不是复合格式，直接返回
    return targetId;
  }

  /**
   * 生成存储文件路径
   */
  private generateFilePath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dirPath = getBusinessDataDirectory();
    return path.join(dirPath, `business_data_${timestamp}.txt`);
  }

  /**
   * 初始化写入流
   */
  private async initializeWriteStream(): Promise<void> {
    try {
      // 确保目录存在
      const dirPath = getBusinessDataDirectory();
      await fs.mkdir(dirPath, { recursive: true });

      // 生成文件路径
      this.currentFilePath = this.generateFilePath();

      // 创建写入流
      this.writeStream = createWriteStream(this.currentFilePath, { flags: 'a' });

      // 更新统计信息
      this.stats.currentFilePath = this.currentFilePath;
      this.stats.isStorageActive = true;

      if (!this.stats.storageStartTime) {
        this.stats.storageStartTime = new Date();
      }

      console.log(`高速存储初始化完成，文件路径: ${this.currentFilePath}`);
    } catch (error) {
      console.error('初始化写入流失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否需要轮转文件
   */
  private async checkFileRotation(): Promise<void> {
    if (!this.config.enableRotation || !this.writeStream) return;

    try {
      const stats = await fs.stat(this.currentFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB >= this.config.maxFileSize) {
        console.log(`文件大小达到限制 (${fileSizeMB.toFixed(2)}MB)，开始轮转`);

        // 关闭当前流
        this.writeStream.end();
        this.writeStream = null;

        // 清理旧文件
        await this.cleanupOldFiles();

        // 重新初始化
        await this.initializeWriteStream();
      }
    } catch (error) {
      console.error('检查文件轮转失败:', error);
    }
  }

  /**
   * 清理旧的轮转文件
   */
  private async cleanupOldFiles(): Promise<void> {
    try {
      const dirPath = getBusinessDataDirectory();
      const files = await fs.readdir(dirPath);
      const storageFiles = files
        .filter((file) => file.startsWith('business_data_') && file.endsWith('.txt'))
        .map((file) => ({
          name: file,
          path: path.join(dirPath, file),
        }));

      // 按修改时间排序
      const fileStats = await Promise.all(
        storageFiles.map(async (file) => {
          const stat = await fs.stat(file.path);
          return { ...file, mtime: stat.mtime };
        }),
      );

      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // 删除超出保留数量的文件
      if (fileStats.length > this.config.rotationCount) {
        const filesToDelete = fileStats.slice(this.config.rotationCount);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
          console.log(`删除旧存储文件: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('清理旧文件失败:', error);
    }
  }

  /**
   * 存储数据
   * @param data 接收数据
   * @param rule 匹配规则
   */
  public async storeData(data: Uint8Array, rule: FrameHeaderRule): Promise<void> {
    try {
      if (!this.writeStream) {
        await this.initializeWriteStream();
      }

      // 转换为十六进制字符串
      const hexString = Array.from(data)
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('');

      // 写入文件（每行一条数据）
      this.writeStream!.write(hexString + '\n');

      // 更新统计信息
      this.updateStats(data.length, rule.id);

      // 检查是否需要文件轮转
      await this.checkFileRotation();
    } catch (error) {
      console.error('存储数据失败:', error);
      throw error;
    }
  }

  /**
   * 更新统计信息
   * @param dataSize 数据大小
   * @param ruleId 规则ID
   */
  private updateStats(dataSize: number, ruleId: string): void {
    this.stats.totalFramesStored++;
    this.stats.totalBytesStored += dataSize;
    this.stats.lastStorageTime = new Date();

    // 更新帧类型统计
    if (!this.stats.frameTypeStats[ruleId]) {
      this.stats.frameTypeStats[ruleId] = 0;
    }
    this.stats.frameTypeStats[ruleId]++;

    // 更新当前文件大小（估算）
    this.stats.currentFileSize += dataSize * 2 + 1; // 十六进制字符串 + 换行符
  }

  /**
   * 更新配置
   * @param newConfig 新配置
   */
  public async updateConfig(newConfig: StorageConfig): Promise<StorageOperationResult> {
    try {
      const oldEnabled = this.config.enabled;
      this.config = { ...newConfig };

      // 如果从禁用变为启用，初始化存储
      if (!oldEnabled && newConfig.enabled) {
        await this.initializeWriteStream();
      }

      // 如果从启用变为禁用，关闭存储
      if (oldEnabled && !newConfig.enabled) {
        await this.closeStorage();
      }

      return { success: true, message: '配置更新成功' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '配置更新失败',
      };
    }
  }

  /**
   * 关闭存储
   */
  public async closeStorage(): Promise<void> {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    this.stats.isStorageActive = false;
    console.log('高速存储已关闭');
  }

  /**
   * 获取当前配置
   */
  public getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * 获取统计信息
   */
  public getStats(): StorageStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息并删除当前存储文件
   */
  public async resetStats(): Promise<StorageOperationResult> {
    try {
      // 关闭当前写入流
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }

      // 删除当前存储文件
      if (this.currentFilePath) {
        try {
          await fs.unlink(this.currentFilePath);
          console.log(`已删除存储文件: ${this.currentFilePath}`);
        } catch (error) {
          console.warn(`删除存储文件失败: ${error}`);
        }
        this.currentFilePath = '';
      }

      // 重置统计信息
      Object.assign(this.stats, {
        totalFramesStored: 0,
        totalBytesStored: 0,
        currentFileSize: 0,
        storageStartTime: null,
        lastStorageTime: null,
        frameTypeStats: {},
        currentFilePath: '',
        isStorageActive: false,
      });

      return { success: true, message: '统计信息已重置，存储文件已删除' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '重置统计信息失败',
      };
    }
  }

  /**
   * 验证规则
   * @param rule 规则
   */
  public validateRule(rule: FrameHeaderRule): RuleValidationResult {
    const errors: string[] = [];

    if (!rule.connectionId.trim()) {
      errors.push('连接ID不能为空');
    }

    if (!rule.headerPatterns || rule.headerPatterns.length === 0) {
      errors.push('至少需要一个帧头模式');
    }

    // 验证每个帧头模式的十六进制格式
    if (rule.headerPatterns) {
      for (let i = 0; i < rule.headerPatterns.length; i++) {
        const pattern = rule.headerPatterns[i];
        if (!pattern || pattern.trim().length === 0) {
          errors.push(`第${i + 1}个帧头模式不能为空`);
          continue;
        }

        const cleanHex = pattern.replace(/\s/g, '');
        if (cleanHex.length % 2 !== 0) {
          errors.push(`第${i + 1}个帧头模式必须是完整的字节（偶数个十六进制字符）`);
        }

        if (!/^[0-9A-Fa-f]*$/.test(cleanHex)) {
          errors.push(`第${i + 1}个帧头模式只能包含十六进制字符（0-9, A-F）`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// 创建存储管理器实例
const storageManager = new HighSpeedStorageManager();

// ==================== IPC处理器接口 ====================

/**
 * 更新存储配置
 */
async function updateStorageConfig(
  _event: IpcMainInvokeEvent,
  config: StorageConfig,
): Promise<StorageOperationResult> {
  return await storageManager.updateConfig(config);
}

/**
 * 获取存储配置
 */
async function getStorageConfig(): Promise<StorageConfig> {
  return storageManager.getConfig();
}

/**
 * 获取存储统计信息
 */
async function getStorageStats(): Promise<StorageStats> {
  return storageManager.getStats();
}

/**
 * 验证规则
 */
async function validateRule(
  _event: IpcMainInvokeEvent,
  rule: FrameHeaderRule,
): Promise<RuleValidationResult> {
  return storageManager.validateRule(rule);
}

/**
 * 重置统计信息
 */
async function resetStorageStats(): Promise<StorageOperationResult> {
  try {
    return await storageManager.resetStats();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '重置统计信息失败',
    };
  }
}

// ==================== 导出存储管理器供网络处理器使用 ====================

export { storageManager };

// ==================== 注册处理器 ====================

const storageRegistry = createHandlerRegistry('highSpeedStorage');

storageRegistry.register('updateConfig', updateStorageConfig);
storageRegistry.register('getConfig', getStorageConfig);
storageRegistry.register('getStats', getStorageStats);
storageRegistry.register('validateRule', validateRule);
storageRegistry.register('resetStats', resetStorageStats);

export function registerHighSpeedStorageHandlers() {
  return storageRegistry.registerAll();
}
