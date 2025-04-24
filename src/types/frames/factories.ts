/**
 * 帧相关对象的工厂函数
 */
import { nanoid } from 'nanoid';
import type { Frame, FrameField } from './index';
import { DEFAULT_FRAME_OPTIONS } from '../../config/frameDefaults';

/**
 * 创建空字段
 * @returns 新的空字段对象
 */
export function createEmptyField(): FrameField {
  return {
    id: nanoid(),
    name: '新字段',
    dataType: 'uint8',
    length: 1,
    description: '',
    validOption: {
      isChecksum: false,
      startFieldIndex: '0',
      endFieldIndex: '0',
      checksumMethod: 'crc16',
    },
    defaultValue: '0', // 默认值，基于类型
    inputType: 'input', // 默认输入类型
    options: [],
  };
}

/**
 * 创建空帧
 * @returns 新的空帧对象
 */
export function createEmptyFrame(): Frame {
  return {
    id: nanoid(),
    lastId: '',
    name: '新帧配置',
    description: '',
    direction: 'send',
    frameType: 'custom',
    protocol: 'custom',
    fields: [],
    timestamp: Date.now(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isFavorite: false,
    options: { ...DEFAULT_FRAME_OPTIONS },
    identifierRules: [],
  };
}
