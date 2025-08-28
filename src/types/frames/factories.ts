/**
 * 帧相关对象的工厂函数
 */
import { nanoid } from 'nanoid';
import type { Frame, FrameField } from './index';
import { DEFAULT_FRAME_OPTIONS, DEFAULT_VALID_OPTION } from '../../config/frameDefaults';
import { createDefaultExpressionConfig } from '../../utils/frames/defaultConfigs';

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
    factor: 1,
    description: '',
    validOption: { ...DEFAULT_VALID_OPTION },
    defaultValue: '0', // 默认值，基于类型
    inputType: 'input', // 默认输入类型
    configurable: true, // 默认可配置
    options: [],
    // 新增表达式相关字段 - 确保向后兼容性，都是可选的
    dataParticipationType: 'direct', // 默认为直接数据参与
  };
}

/**
 * 创建表达式字段
 * @param name 字段名称
 * @param dataType 数据类型
 * @returns 新的表达式字段对象
 */
export function createExpressionField(
  name: string = '表达式字段',
  dataType: FrameField['dataType'] = 'uint8',
): FrameField {
  return {
    id: nanoid(),
    name,
    dataType,
    length: 1,
    description: '通过表达式计算的字段',
    validOption: { ...DEFAULT_VALID_OPTION },
    defaultValue: '0',
    inputType: 'expression', // 表达式输入类型
    configurable: false, // 表达式字段通常不可直接配置
    options: [],
    dataParticipationType: 'indirect', // 间接数据参与
    expressionConfig: createDefaultExpressionConfig(), // 默认表达式配置
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
