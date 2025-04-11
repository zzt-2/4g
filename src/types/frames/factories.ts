/**
 * 帧相关对象的工厂函数
 */
import { nanoid } from 'nanoid';
import type {
  Frame,
  FrameField,
  ExtendedFrameField,
  Category,
  FrameTemplate,
  DetailFrame,
} from './index';
import { DEFAULT_FRAME_OPTIONS } from '../../config/frameDefaults';

/**
 * 创建空字段
 * @returns 新的空字段对象
 */
export function createEmptyField(): ExtendedFrameField {
  return {
    id: nanoid(),
    name: '新字段',
    type: 'uint8',
    length: 1,
    description: '',
    isChecksum: false,
    hasDefaultValue: false,
    defaultValue: '',
    options: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建空帧
 * @returns 新的空帧对象
 */
export function createEmptyFrame(): Frame {
  return {
    id: nanoid(),
    name: '新帧配置',
    description: '',
    protocol: 'custom',
    deviceType: 'sensor',
    fields: [],
    status: 'pending',
    timestamp: Date.now(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isFavorite: false,
    options: { ...DEFAULT_FRAME_OPTIONS },
  };
}

/**
 * 创建空帧模板
 * @returns 新的空帧模板对象
 */
export function createEmptyFrameTemplate(): FrameTemplate {
  return {
    id: nanoid(),
    name: '新帧模板',
    description: '',
    protocol: 'custom',
    deviceType: 'sensor',
    fields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    isFavorite: false,
  };
}

/**
 * 创建详细帧对象
 * @param frame 源帧
 * @returns 详细帧对象
 */
export function createDetailFrame(frame: Frame): DetailFrame {
  return {
    ...frame,
    fieldCount: frame.fields.length,
    totalBytes: frame.fields.reduce((sum, field) => sum + field.length, 0),
  };
}

/**
 * 创建分类
 * @param id 分类ID
 * @param name 分类名称
 * @param icon 图标名称
 * @param color 颜色
 * @returns 新的分类对象
 */
export function createCategory(
  id: string,
  name: string,
  icon: string = 'folder',
  color: string = 'grey',
): Category {
  return {
    id,
    name,
    icon,
    color,
    count: 0,
  };
}

/**
 * 复制现有帧
 * @param source 源帧
 * @param overrides 覆盖属性
 * @returns 新的帧对象
 */
export function cloneFrame(source: Frame, overrides: Partial<Frame> = {}): Frame {
  const now = new Date();

  return {
    ...source,
    id: nanoid(),
    name: `${source.name} (副本)`,
    timestamp: Date.now(),
    createdAt: now,
    updatedAt: now,
    // 复制字段数组
    fields: source.fields.map((field) => ({ ...field, id: nanoid() })),
    // 应用覆盖属性
    ...overrides,
  };
}

/**
 * 复制现有字段
 * @param source 源字段
 * @param overrides 覆盖属性
 * @returns 新的字段对象
 */
export function cloneField(source: FrameField, overrides: Partial<FrameField> = {}): FrameField {
  return {
    ...source,
    id: nanoid(),
    name: `${source.name} (副本)`,
    ...overrides,
  };
}
