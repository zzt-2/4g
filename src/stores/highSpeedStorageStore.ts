/**
 * 高速存储状态管理Store
 * 管理业务数据的高速存储配置和统计信息
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import { highSpeedStorageAPI } from '../api/common';
import type {
  StorageConfig,
  StorageStats,
  FrameHeaderRule,
  StorageOperationResult,
  RuleValidationResult,
} from '../types/serial/highSpeedStorage';
import { useStorage } from '@vueuse/core';

export const useHighSpeedStorageStore = defineStore('highSpeedStorage', () => {
  // ==================== 状态定义 ====================

  // 存储配置（持久化到本地存储）
  const config = useStorage<StorageConfig>('highSpeedStorageConfig', {
    enabled: false,
    rule: null,
    maxFileSize: 100, // 100MB
    enableRotation: true,
    rotationCount: 5,
  });

  // 统计信息（运行时状态）
  const stats = ref<StorageStats>({
    totalFramesStored: 0,
    totalBytesStored: 0,
    currentFileSize: 0,
    storageStartTime: null,
    lastStorageTime: null,
    frameTypeStats: {},
    currentFilePath: '',
    isStorageActive: false,
  });

  // 操作状态
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);

  // ==================== 计算属性 ====================

  const hasRule = computed(() => config.value.rule !== null);

  const isRuleEnabled = computed(() => config.value.rule?.enabled || false);

  const ruleCount = computed(() => (hasRule.value ? 1 : 0));

  const isStorageEnabled = computed(
    () => config.value.enabled && hasRule.value && isRuleEnabled.value,
  );

  const storageStatusText = computed(() => {
    if (!config.value.enabled) return '存储已禁用';
    if (!hasRule.value) return '无识别规则';
    if (!isRuleEnabled.value) return '规则已禁用';
    if (stats.value.isStorageActive) return '存储活跃';
    return '存储就绪';
  });

  const formattedStats = computed(() => ({
    totalFrames: stats.value.totalFramesStored.toLocaleString(),
    totalBytes: formatBytes(stats.value.totalBytesStored),
    currentFileSize: formatBytes(stats.value.currentFileSize),
    storageTime: stats.value.storageStartTime
      ? formatDuration(Date.now() - stats.value.storageStartTime.getTime())
      : '未开始',
    lastActivity: stats.value.lastStorageTime
      ? formatRelativeTime(stats.value.lastStorageTime)
      : '无',
  }));

  // ==================== 配置管理方法 ====================

  /**
   * 更新存储配置
   */
  const updateConfig = async (newConfig: StorageConfig): Promise<StorageOperationResult> => {
    try {
      isLoading.value = true;
      lastError.value = null;

      const result = await highSpeedStorageAPI.updateConfig(newConfig);

      if (result.success) {
        config.value = { ...newConfig };
      } else {
        lastError.value = result.error || '更新配置失败';
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新配置失败';
      lastError.value = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 设置规则
   */
  const setRule = async (rule: Omit<FrameHeaderRule, 'id'>): Promise<StorageOperationResult> => {
    const newRule: FrameHeaderRule = {
      ...rule,
      id: generateRuleId(),
    };

    const validation = await validateRule(newRule);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    const newConfig = {
      ...config.value,
      rule: newRule,
    };

    return await updateConfig(newConfig);
  };

  /**
   * 更新规则
   */
  const updateRule = async (
    updates: Partial<Pick<FrameHeaderRule, 'connectionId' | 'headerPatterns' | 'enabled'>>,
  ): Promise<StorageOperationResult> => {
    if (!config.value.rule) {
      return {
        success: false,
        error: '没有可更新的规则',
      };
    }

    const updatedRule: FrameHeaderRule = {
      id: config.value.rule.id,
      connectionId: updates.connectionId ?? config.value.rule.connectionId,
      headerPatterns: updates.headerPatterns ?? config.value.rule.headerPatterns,
      enabled: updates.enabled ?? config.value.rule.enabled,
    };

    const validation = await validateRule(updatedRule);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    const newConfig = {
      ...config.value,
      rule: updatedRule,
    };

    return await updateConfig(newConfig);
  };

  /**
   * 删除规则
   */
  const deleteRule = async (): Promise<StorageOperationResult> => {
    const newConfig = {
      ...config.value,
      rule: null,
    };

    return await updateConfig(newConfig);
  };

  /**
   * 验证规则
   */
  const validateRule = async (rule: FrameHeaderRule): Promise<RuleValidationResult> => {
    try {
      return await highSpeedStorageAPI.validateRule(rule);
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : '验证失败'],
      };
    }
  };

  // ==================== 统计信息管理 ====================

  /**
   * 刷新统计信息
   */
  const refreshStats = async (): Promise<void> => {
    try {
      const latestStats = await highSpeedStorageAPI.getStats();
      stats.value = latestStats;
    } catch (error) {
      console.error('刷新统计信息失败:', error);
      lastError.value = error instanceof Error ? error.message : '刷新统计信息失败';
    }
  };

  /**
   * 重置统计信息
   */
  const resetStats = async (): Promise<StorageOperationResult> => {
    try {
      isLoading.value = true;
      lastError.value = null;

      const result = await highSpeedStorageAPI.resetStats();

      if (result.success) {
        await refreshStats();
      } else {
        lastError.value = result.error || '重置统计信息失败';
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '重置统计信息失败';
      lastError.value = errorMessage;
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      isLoading.value = false;
    }
  };

  // ==================== 初始化和同步 ====================

  /**
   * 初始化存储
   */
  const initialize = async (): Promise<void> => {
    try {
      // 从主进程获取当前配置
      const serverConfig = await highSpeedStorageAPI.getConfig();

      // 如果主进程有配置，同步到本地
      if (serverConfig.rule || serverConfig.enabled) {
        config.value = serverConfig;
      } else {
        // 否则将本地配置同步到主进程
        await highSpeedStorageAPI.updateConfig(config.value);
      }

      // 获取统计信息
      await refreshStats();
    } catch (error) {
      console.error('初始化高速存储失败:', error);
      lastError.value = error instanceof Error ? error.message : '初始化失败';
    }
  };

  /**
   * 清除错误状态
   */
  const clearError = () => {
    lastError.value = null;
  };

  // ==================== 工具函数 ====================

  /**
   * 生成规则ID
   */
  function generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 格式化字节数
   */
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 格式化持续时间
   */
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天 ${hours % 24}小时`;
    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
    return `${seconds}秒`;
  }

  /**
   * 格式化相对时间
   */
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }

  // ==================== 返回接口 ====================

  return {
    // 状态
    config: readonly(config),
    stats: readonly(stats),
    isLoading: readonly(isLoading),
    lastError: readonly(lastError),

    // 计算属性
    hasRule,
    isRuleEnabled,
    ruleCount,
    isStorageEnabled,
    storageStatusText,
    formattedStats,

    // 配置管理方法
    updateConfig,
    setRule,
    updateRule,
    deleteRule,
    validateRule,

    // 统计信息管理
    refreshStats,
    resetStats,

    // 工具方法
    initialize,
    clearError,
  };
});
