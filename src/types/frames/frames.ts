/**
 * 帧结构相关类型定义
 */

import type { ProtocolType, DeviceType, FrameStatus } from './basic';
import type { FrameField } from './fields';

// 帧选项
export interface FrameOptions {
  autoChecksum: boolean;
  bigEndian: boolean;
  includeLengthField: boolean;
}

// 帧模板
export interface FrameTemplate {
  id: string;
  name: string;
  description: string;
  protocol: ProtocolType;
  deviceType: DeviceType;
  fields: FrameField[];
  createdAt?: Date;
  updatedAt?: Date;
  isFavorite?: boolean;
}

// 完整帧定义(包含状态和时间戳)
export interface Frame {
  id: string;
  name: string;
  description: string;
  protocol: ProtocolType;
  deviceType: DeviceType;
  fields: FrameField[];
  status: FrameStatus;
  paramCount?: number;
  value?: number | string;
  timestamp: number;
  createdAt?: Date;
  updatedAt?: Date;
  usageCount?: number;
  isFavorite?: boolean;
  options: FrameOptions;
}

// 详细帧，用于显示详情
export interface DetailFrame extends Frame {
  category?: string;
  categoryName?: string;
  fieldCount: number;
  totalBytes: number;
}
