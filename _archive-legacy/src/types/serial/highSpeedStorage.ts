/**
 * 高速存储相关类型定义
 */

/**
 * 业务帧识别规则
 */
export interface FrameHeaderRule {
  id: string;
  connectionId: string; // 关联的网络连接ID
  headerPatterns: string[]; // 帧头十六进制字符串数组，如 ["AABBCC", "DDEEFF"]
  enabled: boolean;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  enabled: boolean;
  rule: FrameHeaderRule | null; // 单个识别规则
  maxFileSize: number; // 最大文件大小（MB）
  enableRotation: boolean; // 是否启用文件轮转
  rotationCount: number; // 保留的轮转文件数量
}

/**
 * 存储统计信息
 */
export interface StorageStats {
  totalFramesStored: number;
  totalBytesStored: number;
  currentFileSize: number;
  storageStartTime: Date | null;
  lastStorageTime: Date | null;
  frameTypeStats: Record<string, number>; // 按帧类型统计
  currentFilePath: string;
  isStorageActive: boolean;
}

/**
 * 存储操作结果
 */
export interface StorageOperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 帧头规则验证结果
 */
export interface RuleValidationResult {
  isValid: boolean;
  errors: string[];
}
