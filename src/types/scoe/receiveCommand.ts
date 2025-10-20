// SCOE接收指令相关类型定义

import type { SendFrameInstance } from '../frames/sendInstances';

/**
 * SCOE接收指令类型枚举
 */
export enum ScoeCommandType {}

/**
 * SCOE接收指令功能枚举
 */
export enum ScoeCommandFunction {
  /** 加载卫星ID */
  LOAD_SATELLITE_ID = 'load_satellite_id',
  /** 卸载卫星ID */
  UNLOAD_SATELLITE_ID = 'unload_satellite_id',
  /** 健康自检 */
  HEALTH_CHECK = 'health_check',
  /** 链路自检 */
  LINK_CHECK = 'link_check',
  /** 发送帧 */
  SEND_FRAME = 'send_frame',
  /** 读取文件并发送 */
  READ_FILE_AND_SEND = 'read_file_and_send',
}

/**
 * 指令功能选项
 */
export const commandFunctionOptions = [
  { label: '加载卫星ID', value: ScoeCommandFunction.LOAD_SATELLITE_ID },
  { label: '卸载卫星ID', value: ScoeCommandFunction.UNLOAD_SATELLITE_ID },
  { label: '健康自检', value: ScoeCommandFunction.HEALTH_CHECK },
  { label: '链路自检', value: ScoeCommandFunction.LINK_CHECK },
  { label: '发送帧', value: ScoeCommandFunction.SEND_FRAME },
  { label: '读取文件发送', value: ScoeCommandFunction.READ_FILE_AND_SEND },
];

/**
 * 获取指令功能的显示名称
 */
export function getCommandFunctionLabel(func: ScoeCommandFunction): string {
  const option = commandFunctionOptions.find((opt) => opt.value === func);
  return option?.label || '未知功能';
}

/**
 * 校验和配置
 */
export interface ChecksumConfig {
  enabled: boolean;
  offset: number; // 校验计算起始字节偏移
  length: number; // 计算字节数
  checksumOffset: number; // 校验位字节偏移
}

/**
 * 参数选项接口
 */
export interface ScoeCommandParamsOption {
  label: string;
  value: string;
  receiveCode: string;
}

/**
 * 指令参数接口
 */
export interface ScoeCommandParams {
  id: string;
  label: string;
  value: string;
  type: 'string' | 'number' | 'boolean';
  offset: number;
  length: number;
  targetInstanceId?: string;
  targetFieldId?: string;
  options: ScoeCommandParamsOption[];
}

/**
 * SCOE接收指令实例
 */
export interface ScoeReceiveCommand {
  /** 唯一标识 */
  id: string;
  /** 指令标签（显示名称） */
  label: string;
  /** 功能码（十六进制字符串，如 "0x1234"） */
  code: string;
  /** 发送间隔（毫秒） */
  sendInterval?: number;
  /** 指令参数数组 */
  params?: ScoeCommandParams[];
  /** 执行功能 */
  function: ScoeCommandFunction;
  /** 校验和配置数组 */
  checksums: ChecksumConfig[];
  /** 帧实例数组 */
  frameInstances?: SendFrameInstance[];
}

/**
 * SCOE 错误原因枚举
 */
export enum ScoeErrorReason {
  NONE = '无错误',
  SATELLITE_ID_NOT_FOUND = '请求加载卫星ID不存在',
  SATELLITE_CONFIG_INCOMPLETE = '请求加载卫星ID配置不完整',
  SATELLITE_ID_LOADING = '存在正在加载的卫星ID',
  COMMAND_CODE_NOT_FOUND = '不存在该指令码',
  CHECKSUM_ERROR = '校验和错误',
}

/**
 * 创建默认接收指令
 */
export function createDefaultReceiveCommand(id: string): ScoeReceiveCommand {
  return {
    id,
    label: `指令 ${id}`,
    code: '00',
    function: ScoeCommandFunction.LOAD_SATELLITE_ID,
    checksums: [],
    params: [],
    frameInstances: [],
  };
}
