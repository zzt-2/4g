/**
 * 串口相关的类型定义
 */

// 奇偶校验类型
export type ParityType = 'none' | 'even' | 'odd' | 'mark' | 'space';

// 流控制类型
export type FlowControlType = 'none' | 'hardware' | 'software';

// 串口配置选项 (兼容预加载API的选项类型)
export interface SerialPortOptions {
  baudRate?: number; // 波特率
  dataBits?: 5 | 6 | 7 | 8; // 数据位
  stopBits?: 1 | 1.5 | 2; // 停止位
  parity?: ParityType; // 校验位
  flowControl?: FlowControlType; // 流控制
  bufferSize?: number; // 缓冲区大小
  autoOpen?: boolean; // 自动打开
  timeout?: number; // 超时设置(ms)
}

// 串口信息
export interface SerialPortInfo {
  path: string; // 串口路径
  manufacturer?: string; // 制造商
  serialNumber?: string; // 序列号
  pnpId?: string; // 即插即用ID
  locationId?: string; // 位置ID
  productId?: string; // 产品ID
  vendorId?: string; // 厂商ID
  friendlyName?: string; // 友好名称
  isOpen?: boolean; // 是否打开
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
  portPath: string; // 新增：消息来源串口路径
  notes?: string;
}

// 串口状态 (兼容预加载API的状态类型)
export interface SerialStatus {
  isOpen: boolean; // 是否打开
  port?: string; // 当前串口名
  options?: SerialPortOptions; // 当前配置
  error?: string; // 错误信息
  bytesReceived?: number; // 已接收字节数
  bytesSent?: number; // 已发送字节数
}

// 连接状态
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// 多串口连接映射表
export interface PortConnectionMap {
  [portPath: string]: {
    status: SerialStatus;
    isConnecting?: boolean;
  };
}

// 多串口操作结果
export interface MultiPortOperationResult {
  portPath: string;
  success: boolean;
  message: string;
  [key: string]: unknown;
}

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
  portPath: string; // 新增：响应来源串口路径
  isValid?: boolean;
  notes?: string;
}

// 导出格式
export type ExportFormat = 'csv' | 'txt' | 'json';

// 操作结果接口
export interface OperationResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}
