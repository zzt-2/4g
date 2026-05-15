import {
  FRAME_DATA_TYPES,
  DATA_PARTICIPATION_TYPES,
  CHECKSUM_METHODS,
  FRAME_DIRECTIONS,
} from '@/features/frame';
import { FRAME_INPUT_TYPES } from '@/features/frame/core';

export const INPUT_TYPE_LABELS: Record<string, string> = {
  input: '输入',
  select: '选择',
  radio: '单选',
  expression: '表达式',
};

export const PARTICIPATION_LABELS: Record<string, string> = {
  direct: '直接',
  indirect: '间接',
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  current_field: '当前字段',
  frame_field: '帧字段',
  global_stat: '全局统计',
};

export const OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  lt: '<',
  range: '范围',
  mask: '掩码',
  any: '任意',
};

export const DIRECTION_OPTIONS = FRAME_DIRECTIONS.map((d) => ({
  value: d,
  label: d === 'send' ? '发送' : '接收',
}));

export const DATA_TYPE_OPTIONS = FRAME_DATA_TYPES.map((t) => ({
  value: t,
  label: t,
}));

export const INPUT_TYPE_OPTIONS = FRAME_INPUT_TYPES.map((t) => ({
  value: t,
  label: INPUT_TYPE_LABELS[t],
}));

export const PARTICIPATION_OPTIONS = DATA_PARTICIPATION_TYPES.map((t) => ({
  value: t,
  label: PARTICIPATION_LABELS[t],
}));

export const CHECKSUM_METHOD_OPTIONS = CHECKSUM_METHODS.map((t) => ({
  value: t,
  label: t.toUpperCase(),
}));
