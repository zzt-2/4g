/**
 * 帧字段相关类型定义
 */

import type { FieldType } from './basic';

// 字段输入类型
export type FieldInputType = 'input' | 'select' | 'radio';

// 帧字段基础接口
export interface FrameField {
  id: string;
  name: string;
  dataType: FieldType;
  length: number;
  bits?: number;
  description?: string;
  validOption?: ValidationParam;
  defaultValue?: string;
  inputType: FieldInputType; // 控制字段输入类型
  // 可选配置参数，用于下拉框或单选框
  options?: {
    value: string; // 实际值
    label: string; // 显示标签
    isDefault?: boolean; // 是否为默认选中项
  }[];
}

// 帧参数
export interface FrameParam {
  id: string;
  name: string;
  dataType: string;
  value: string | number | boolean;
}

// 校验参数
export interface ValidationParam {
  isChecksum: boolean;
  startFieldIndex: string;
  endFieldIndex: string;
  checksumMethod?: string; // 校验和计算方法：'crc16', 'crc32', 'xor8', 'sum8', 'custom'
}
