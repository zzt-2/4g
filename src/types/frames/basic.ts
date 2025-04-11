/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * 基本帧类型定义
 * 包含字段类型、协议类型、设备类型等基础类型
 */

import {
  FIELD_TYPE_OPTIONS,
  PROTOCOL_OPTIONS,
  DEVICE_TYPE_OPTIONS,
  CATEGORY_IDS,
  SORT_OPTIONS,
} from '../../config/frameDefaults';

// 从选项数组中提取值的类型
export type FieldType = (typeof FIELD_TYPE_OPTIONS)[number]['value'];
export type ProtocolType = (typeof PROTOCOL_OPTIONS)[number]['value'];
export type DeviceType = (typeof DEVICE_TYPE_OPTIONS)[number]['value'];

// 从对象中提取值的类型
export type SystemCategoryId = (typeof CATEGORY_IDS)[keyof typeof CATEGORY_IDS];
export type SortOption = (typeof SORT_OPTIONS)[keyof typeof SORT_OPTIONS];

// 帧状态
export type FrameStatus = 'processing' | 'completed' | 'error' | 'pending';

// 帧验证错误
export interface FrameValidationError {
  field: string;
  message: string;
}
