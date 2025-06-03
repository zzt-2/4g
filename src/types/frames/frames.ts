/**
 * 帧结构相关类型定义
 */

import type { ProtocolType, FrameType, FrameDirection } from './basic';
import type { FrameField } from './fields';

// 帧选项
export interface FrameOptions {
  autoChecksum: boolean;
  bigEndian: boolean;
  includeLengthField: boolean;
}

export interface IdentifierRule {
  startIndex: number;
  endIndex: number;
  operator: string;
  value: string;
  logicOperator: 'and' | 'or';
}

// 完整帧定义(包含状态和时间戳)
export interface Frame {
  id: string;
  lastId: string;
  name: string;
  description: string;
  direction: FrameDirection;
  protocol: ProtocolType;
  frameType: FrameType;
  fields: FrameField[];
  paramCount?: number;
  value?: number | string;
  timestamp: number;
  createdAt?: Date;
  updatedAt?: Date;
  usageCount?: number;
  isFavorite?: boolean;
  options: FrameOptions;
  identifierRules: Array<IdentifierRule>;
}
