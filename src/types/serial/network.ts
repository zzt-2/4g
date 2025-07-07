/**
 * 网络连接相关类型定义
 */

// 网络连接类型
export type NetworkConnectionType = 'tcp' | 'udp';

// 网络连接状态
export type NetworkConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// 远程主机配置
export interface RemoteHost {
  id: string; // 远程主机唯一标识
  name: string; // 远程主机名称
  host: string; // IP地址或域名
  port: number; // 端口号
  enabled?: boolean; // 是否启用，默认true
  description?: string; // 描述信息
}

// 网络连接配置
export interface NetworkConnectionConfig {
  id: string; // 唯一标识符
  name: string; // 友好名称
  type: NetworkConnectionType; // 连接类型
  host: string; // 主机地址（主连接地址）
  port: number; // 端口号（主连接端口）
  remoteHosts?: RemoteHost[]; // 远程主机列表
  autoReconnect?: boolean; // 是否自动重连
  timeout?: number; // 连接超时时间(ms)
  description?: string; // 连接描述
}

// 网络连接状态信息
export interface NetworkConnection extends NetworkConnectionConfig {
  isConnected: boolean; // 连接状态
  status: NetworkConnectionStatus; // 详细状态
  lastActivity?: Date; // 最后活动时间
  error?: string; // 错误信息
}

// 网络消息
export interface NetworkMessage {
  id: string; // 消息唯一标识
  timestamp: number; // 时间戳
  data: Uint8Array; // 消息数据
  direction: 'sent' | 'received'; // 消息方向
  connectionId: string; // 连接ID
  size: number; // 数据大小
}

// 网络状态统计
export interface NetworkStatus {
  isConnected: boolean; // 是否已连接
  lastActivity?: Date; // 最后活动时间
  bytesReceived: number; // 接收字节数
  bytesSent: number; // 发送字节数
  messagesReceived: number; // 接收消息数
  messagesSent: number; // 发送消息数
  connectionTime?: Date; // 连接建立时间
  error?: string; // 错误信息
}

// 网络操作结果
export interface NetworkOperationResult {
  success: boolean; // 操作是否成功
  message?: string; // 结果消息
  error?: string; // 错误信息
  data?: unknown; // 返回数据
}

// 网络连接事件类型
export type NetworkEventType = 'connected' | 'disconnected' | 'data' | 'error' | 'timeout';

// 网络连接事件
export interface NetworkEvent {
  type: NetworkEventType; // 事件类型
  connectionId: string; // 连接ID
  timestamp: Date; // 事件时间
  data?: unknown; // 事件数据
  error?: string; // 错误信息
}

// 网络数据包
export interface NetworkDataPacket {
  connectionId: string; // 连接ID
  data: Uint8Array; // 数据内容
  size: number; // 数据大小
  timestamp: Date; // 接收时间
}

// TCP连接选项
export interface TcpConnectionOptions {
  keepAlive?: boolean; // 保持连接
  noDelay?: boolean; // 禁用Nagle算法
  timeout?: number; // 连接超时
}

// UDP连接选项
export interface UdpConnectionOptions {
  broadcast?: boolean; // 是否广播
  multicast?: boolean; // 是否组播
  reuseAddr?: boolean; // 重用地址
}

// 网络连接选项联合类型
export type NetworkConnectionOptions = TcpConnectionOptions | UdpConnectionOptions;

// 网络API响应类型
export interface NetworkApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 网络连接列表响应
export type NetworkConnectionListResponse = NetworkApiResponse<NetworkConnection[]>;

// 网络状态响应
export type NetworkStatusResponse = NetworkApiResponse<NetworkStatus>;

// 网络操作响应
export type NetworkOperationResponse = NetworkApiResponse<void>;
