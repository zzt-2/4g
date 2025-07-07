/**
 * 连接目标相关类型定义
 */

// 连接类型
export type ConnectionType = 'serial' | 'network' | 'bluetooth' | 'other';

// 连接状态
export type ConnectionTargetStatus = 'connected' | 'disconnected' | 'error';

// 连接目标接口
export interface ConnectionTarget {
  id: string; // 唯一标识符
  name: string; // 显示名称
  type: ConnectionType; // 连接类型
  path?: string; // 连接路径（如串口路径）
  address?: string; // 地址（如IP地址）
  status: ConnectionTargetStatus; // 连接状态
  description?: string; // 额外描述

  // 网络连接扩展字段
  connectionId?: string; // 所属网络连接ID（仅网络类型）
  remoteHostId?: string; // 远程主机ID（仅网络远程主机类型）
}
