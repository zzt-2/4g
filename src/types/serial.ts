/**
 * 串口相关的类型定义
 */

// 奇偶校验类型
export type ParityType = 'none' | 'even' | 'odd' | 'mark' | 'space';

// 流控制类型
export type FlowControlType = 'none' | 'hardware' | 'software';

// 串口配置选项
export interface SerialPortOptions {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: ParityType;
  flowControl: FlowControlType;
  bufferSize?: number;
  autoOpen?: boolean;
}

// 串口信息
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  vendorId?: string;
  productId?: string;
  friendlyName?: string;
  isOpen?: boolean;
}

// 串口消息方向
export type MessageDirection = 'sent' | 'received';

// 串口消息格式
export type MessageFormat = 'hex' | 'ascii' | 'utf8' | 'binary';

// 时间戳格式
export type TimestampFormat = 'none' | 'time' | 'date' | 'datetime';

// 串口消息数据
export interface SerialMessage {
  id: string;
  timestamp: number;
  direction: MessageDirection;
  data: Uint8Array;
  notes?: string;
}

// 串口状态
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// 指令集类型
export interface CommandSet {
  id: string;
  name: string;
  deviceType: string;
  commands: Command[];
  lastUsed: number;
}

// 指令类型
export interface Command {
  id: string;
  name: string;
  description?: string;
  data: string; // HEX格式的命令数据
  expectedResponsePattern?: string; // 预期响应的正则表达式
  timeout?: number; // 响应超时时间（毫秒）
  notes?: string;
}

// 设备类型
export interface Device {
  id: string;
  name: string;
  path: string;
  options: SerialPortOptions;
  commandSetId?: string;
}

// 响应数据
export interface ResponseData {
  commandId: string;
  timestamp: number;
  data: Uint8Array;
  isValid?: boolean;
  notes?: string;
}

// 导出格式
export type ExportFormat = 'csv' | 'txt' | 'json';
