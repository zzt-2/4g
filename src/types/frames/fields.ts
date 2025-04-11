/**
 * 帧字段相关类型定义
 */

import type { FieldType } from './basic';

// 帧字段基础接口
export interface FrameField {
  id: string;
  name: string;
  type: FieldType;
  length: number;
  bits?: number;
  description: string;
  isChecksum: boolean;
  hasDefaultValue: boolean;
  defaultValue: string;
  options: string[];
}

// 带有时间戳的帧字段接口
export interface ExtendedFrameField extends FrameField {
  createdAt?: Date;
  updatedAt?: Date;
}

// 帧参数
export interface FrameParam {
  id: string;
  name: string;
  type: string;
  value: string | number | boolean;
}
