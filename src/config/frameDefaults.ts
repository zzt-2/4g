/**
 * 帧模块全局默认值和常量配置
 */

import type { Category, FrameOptions, FilterOptions, FieldType } from '../types/frames';

/**
 * 分类ID常量
 */
export const CATEGORY_IDS = {
  ALL: 'all',
  RECENT: 'recent',
  FAVORITES: 'favorites',
  SENSORS: 'sensors',
  CONTROLS: 'controls',
} as const;

/**
 * 系统预设分类
 * 这些分类不允许被删除
 */
export const SYSTEM_CATEGORIES = [
  CATEGORY_IDS.ALL,
  CATEGORY_IDS.RECENT,
  CATEGORY_IDS.FAVORITES,
  CATEGORY_IDS.SENSORS,
  CATEGORY_IDS.CONTROLS,
] as const;

/**
 * 预设分类配置
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: CATEGORY_IDS.ALL, name: '全部帧', count: 0, icon: 'category', color: 'blue' },
  { id: CATEGORY_IDS.RECENT, name: '最近使用', count: 0, icon: 'history', color: 'teal' },
  { id: CATEGORY_IDS.FAVORITES, name: '收藏', count: 0, icon: 'star', color: 'amber' },
  { id: CATEGORY_IDS.SENSORS, name: '传感器', count: 0, icon: 'sensors', color: 'green' },
  { id: CATEGORY_IDS.CONTROLS, name: '控制器', count: 0, icon: 'tune', color: 'red' },
] as const;

/**
 * 排序选项常量
 */
export const SORT_OPTIONS = {
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
 * 设备类型选项
 * 用于UI下拉选择
 */
export const DEVICE_TYPE_OPTIONS = [
  { label: '传感器', value: 'sensor' },
  { label: '控制器', value: 'controller' },
  { label: 'PLC', value: 'plc' },
] as const;

/**
 * 字段类型选项
 * 用于UI下拉选择
 */
export const FIELD_TYPE_OPTIONS = [
  { label: '比特', value: 'bit' },
  { label: '无符号8位整数 (1字节)', value: 'uint8' },
  { label: '有符号8位整数 (1字节)', value: 'int8' },
  { label: '无符号16位整数 (2字节)', value: 'uint16' },
  { label: '有符号16位整数 (2字节)', value: 'int16' },
  { label: '无符号32位整数 (4字节)', value: 'uint32' },
  { label: '有符号32位整数 (4字节)', value: 'int32' },
  { label: '32位浮点数 (4字节)', value: 'float' },
  { label: '字节数组', value: 'bytes' },
  { label: '字符串', value: 'string' },
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
  bit: { needsLength: false, fixedLength: 1, needsOptions: false, needsBits: true },
  uint8: { needsLength: false, fixedLength: 1, needsOptions: false, needsBits: false },
  uint16: { needsLength: false, fixedLength: 2, needsOptions: false, needsBits: false },
  uint32: { needsLength: false, fixedLength: 4, needsOptions: false, needsBits: false },
  int8: { needsLength: false, fixedLength: 1, needsOptions: false, needsBits: false },
  int16: { needsLength: false, fixedLength: 2, needsOptions: false, needsBits: false },
  int32: { needsLength: false, fixedLength: 4, needsOptions: false, needsBits: false },
  float: { needsLength: false, fixedLength: 4, needsOptions: false, needsBits: false },
  bytes: { needsLength: true, fixedLength: null, needsOptions: false, needsBits: false },
  string: { needsLength: true, fixedLength: null, needsOptions: false, needsBits: false },
  // 默认配置，用于未知类型
  default: { needsLength: false, fixedLength: null, needsOptions: false, needsBits: false },
};

/**
 * 字段类型长度映射
 * 用于在更改类型时自动设置长度
 */
export const FIELD_TYPE_LENGTH_MAP: Record<
  FieldType,
  { variableLength: boolean; defaultLength: number }
> = {
  bit: { variableLength: false, defaultLength: 1 },
  uint8: { variableLength: false, defaultLength: 1 },
  uint16: { variableLength: false, defaultLength: 2 },
  uint32: { variableLength: false, defaultLength: 4 },
  int8: { variableLength: false, defaultLength: 1 },
  int16: { variableLength: false, defaultLength: 2 },
  int32: { variableLength: false, defaultLength: 4 },
  float: { variableLength: false, defaultLength: 4 },
  bytes: { variableLength: true, defaultLength: 1 },
  string: { variableLength: true, defaultLength: 1 },
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
  deviceType: '',
  dateRange: undefined,
  status: undefined,
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
export const DEFAULT_ENUM_OPTIONS = ['选项1', '选项2'] as const;
