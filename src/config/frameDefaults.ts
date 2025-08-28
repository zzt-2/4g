/**
 * 帧模块全局默认值和常量配置
 */

import type { FrameOptions, FilterOptions, IdentifierRule, ValidationParam } from '../types/frames';

/**
 * 排序选项常量
 */
export const SORT_OPTIONS = {
  ID: 'id',
  NAME: 'name',
  DATE: 'date',
  USAGE: 'usage',
} as const;

/**
 * 协议选项
 * 用于UI下拉选择
 */
export const PROTOCOL_OPTIONS = [
  { label: 'Modbus', value: 'modbus' },
  { label: '自定义', value: 'custom' },
  { label: 'Profibus', value: 'profibus' },
] as const;

/**
 * 帧方向选项
 * 用于UI下拉选择
 */
export const FRAME_DIRECTION_OPTIONS = [
  { label: '发送', value: 'send' },
  { label: '接收', value: 'receive' },
] as const;

/**
 * 帧类型选项
 * 用于UI下拉选择
 */
export const FRAME_TYPE_OPTIONS = [
  { label: '命令帧', value: 'command', direction: 'send' },
  { label: '查询帧', value: 'query', direction: 'send' },
  { label: '控制帧', value: 'control', direction: 'send' },
  { label: '响应帧', value: 'response', direction: 'receive' },
  { label: '状态帧', value: 'status', direction: 'receive' },
  { label: '事件帧', value: 'event', direction: 'receive' },
  { label: '数据帧', value: 'data', direction: 'receive' },
  { label: '自定义', value: 'custom', direction: ['send', 'receive'] },
] as const;

/**
 * 字段类型选项
 * 用于UI下拉选择
 */
export const FIELD_TYPE_OPTIONS = [
  { label: '无符号8位整数 (1字节)', value: 'uint8' },
  { label: '有符号8位整数 (1字节)', value: 'int8' },
  { label: '无符号16位整数 (2字节)', value: 'uint16' },
  { label: '有符号16位整数 (2字节)', value: 'int16' },
  { label: '无符号32位整数 (4字节)', value: 'uint32' },
  { label: '有符号32位整数 (4字节)', value: 'int32' },
  { label: '无符号64位整数 (8字节)', value: 'uint64' },
  { label: '有符号64位整数 (8字节)', value: 'int64' },
  { label: '单精度浮点数 (4字节)', value: 'float' },
  { label: '双精度浮点数 (8字节)', value: 'double' },
  { label: '字节数组', value: 'bytes' },
] as const;

/**
 * UI标签常量
 */
export const UI_LABELS = {
  CHECKSUM: '校验和',
  FIELD_EDITOR: '字段编辑器',
  FIELD_LIST: '字段列表',
  BASIC_INFO: '基本信息',
  NO_FIELDS: '暂无字段',
  ADD_FIELD: '添加字段',
  EDIT_FIELD: '编辑字段',
  DELETE_FIELD: '删除字段',
  SAVE: '保存',
  CANCEL: '取消',
  DELETE: '删除',
  CREATE: '创建',
  UPDATE: '更新',
} as const;

/**
 * 字段类型配置
 * 每种类型的特性配置
 */
export const FIELD_TYPE_CONFIGS = {
  uint8: { needsLength: false, fixedLength: 1, needsBits: false },
  uint16: { needsLength: false, fixedLength: 2, needsBits: false },
  uint32: { needsLength: false, fixedLength: 4, needsBits: false },
  int8: { needsLength: false, fixedLength: 1, needsBits: false },
  int16: { needsLength: false, fixedLength: 2, needsBits: false },
  int32: { needsLength: false, fixedLength: 4, needsBits: false },
  uint64: { needsLength: false, fixedLength: 8, needsBits: false },
  int64: { needsLength: false, fixedLength: 8, needsBits: false },
  float: { needsLength: false, fixedLength: 4, needsBits: false },
  bytes: { needsLength: true, fixedLength: null, needsBits: false },
  string: { needsLength: true, fixedLength: null, needsBits: false },
  // 默认配置，用于未知类型
  default: { needsLength: false, fixedLength: null, needsBits: false },
};

/**
 * 默认帧选项
 */
export const DEFAULT_FRAME_OPTIONS: FrameOptions = {
  autoChecksum: true,
  bigEndian: false,
  includeLengthField: false,
};

/**
 * 默认过滤选项
 */
export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  protocol: '',
  frameType: '',
  direction: '',
  dateRange: undefined,
};

/**
 * 默认识别规则
 */
export const DEFAULT_IDENTIFIER_RULES: IdentifierRule = {
  startIndex: 0,
  endIndex: 7,
  operator: 'eq',
  value: '0x00',
  logicOperator: 'and',
};

/**
 * 默认校验设置
 */
export const DEFAULT_VALID_OPTION: ValidationParam = {
  isChecksum: false,
  startFieldIndex: '0',
  endFieldIndex: '0',
  checksumMethod: 'sum8', // 默认使用CRC-16
};

/**
 * 每页显示的帧数量
 */
export const FRAMES_PER_PAGE = 20;

/**
 * 最近使用的帧数量上限
 */
export const RECENT_FRAMES_LIMIT = 10;

/**
 * 枚举类型的默认选项
 */
export const DEFAULT_ENUM_OPTIONS = [
  { value: '0', label: '选项 0' },
  { value: '1', label: '选项 1' },
  { value: '2', label: '选项 2' },
] as const;

/**
 * 单选按钮的默认选项
 */
export const DEFAULT_RADIO_OPTIONS = [
  { value: '0', label: '选项 A', isDefault: true },
  { value: '1', label: '选项 B', isDefault: false },
] as const;

/**
 * 下拉菜单的默认选项
 */
export const DEFAULT_SELECT_OPTIONS = [
  { value: '0', label: '选项 1', isDefault: true },
  { value: '1', label: '选项 2', isDefault: false },
  { value: '2', label: '选项 3', isDefault: false },
] as const;

/**
 * 输入类型配置
 */
export const INPUT_TYPE_CONFIG = {
  input: {
    needsOptions: false,
    maxOptions: 0,
    minOptions: 0,
    hasDefaultOption: false,
    description: '普通输入框，适用于简单数值或文本输入',
  },
  select: {
    needsOptions: true,
    maxOptions: 20, // 设置最大选项数量限制
    minOptions: 2, // 最少需要2个选项
    hasDefaultOption: true,
    description: '下拉选择框，适用于预定义的多选项',
  },
  radio: {
    needsOptions: true,
    maxOptions: 10, // 设置最大选项数量限制
    minOptions: 2, // 最少需要2个选项
    hasDefaultOption: true,
    description: '单选按钮组，适用于需要明确显示所有选项的场景',
  },
  expression: {
    needsOptions: false,
    maxOptions: 0,
    minOptions: 0,
    hasDefaultOption: false,
    description: '自定义表达式，通过表达式计算得出字段值',
  },
} as const;

/**
 * 输入类型选项
 */
export const INPUT_TYPE_OPTIONS = [
  { label: '输入框', value: 'input' },
  { label: '下拉框', value: 'select' },
  { label: '单选框', value: 'radio' },
  { label: '自定义表达式', value: 'expression' },
];

/**
 * 数据参与类型选项
 */
export const DATA_PARTICIPATION_TYPE_OPTIONS = [
  { label: '直接数据', value: 'direct', description: '参与组帧发送或从帧中直接解析' },
  { label: '间接数据', value: 'indirect', description: '不参与组帧，通过计算得出或作为计算参数' },
];

/**
 * 校验方法选项
 */
export const CHECKSUM_METHOD_OPTIONS = [
  { label: 'CRC-16', value: 'crc16' },
  { label: 'CRC-32', value: 'crc32' },
  { label: '异或校验 (XOR-8)', value: 'xor8' },
  { label: '和校验 (SUM-8)', value: 'sum8' },
];
