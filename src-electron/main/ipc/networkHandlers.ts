/**
 * 网络连接IPC处理器
 * 在主进程中管理TCP/UDP连接
 */

import { IpcMainInvokeEvent, WebContents, webContents } from 'electron';
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import type {
  NetworkConnectionConfig,
  NetworkConnection,
  NetworkStatus,
  NetworkOperationResult,
  NetworkConnectionOptions,
  TcpConnectionOptions,
  UdpConnectionOptions,
} from '../../../src/types/serial/network';
import * as net from 'net';
import * as dgram from 'dgram';
import { storageManager } from './highSpeedStorageHandlers';

// 连接管理器
class NetworkConnectionManager {
  private connections = new Map<string, NetworkConnection>();
  private tcpSockets = new Map<string, net.Socket>();
  private udpSockets = new Map<string, dgram.Socket>();
  private connectionStats = new Map<string, NetworkStatus>();

  /**
   * 创建网络连接
   */
  async connect(
    config: NetworkConnectionConfig,
    options?: NetworkConnectionOptions,
  ): Promise<NetworkOperationResult> {
    try {
      // 如果连接已存在，检查其状态
      if (this.connections.has(config.id)) {
        const existingConnection = this.connections.get(config.id)!;

        // 如果是已连接状态，返回错误
        if (existingConnection.isConnected) {
          return { success: false, error: '连接已存在且处于连接状态' };
        }

        // 如果是未连接状态或错误状态，先清理再重新创建
        console.log(`清理残留连接: ${config.id}`);
        await this.disconnect(config.id);
      }

      // 创建网络连接对象，简化写法
      const connection: NetworkConnection = {
        ...config,
        isConnected: false,
        status: 'connecting',
      };

      this.connections.set(config.id, connection);
      this.initConnectionStats(config.id);

      if (config.type === 'tcp') {
        return await this.connectTcp(config, options as TcpConnectionOptions);
      } else if (config.type === 'udp') {
        return await this.connectUdp(config, options as UdpConnectionOptions);
      } else {
        return {
          success: false,
          error: `不支持的连接类型: ${config.type}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接失败',
      };
    }
  }

  /**
   * 创建TCP连接（客户端模式）
   */
  private async connectTcp(
    config: NetworkConnectionConfig,
    options?: TcpConnectionOptions,
  ): Promise<NetworkOperationResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      // 设置选项 - 默认禁用Nagle算法以减少延迟
      if (options?.keepAlive) socket.setKeepAlive(true);
      socket.setNoDelay(options?.noDelay !== false); // 默认为true，除非明确设置为false

      const timeout = options?.timeout || config.timeout || 5000;
      socket.setTimeout(timeout);

      // TCP客户端连接到远程服务器
      socket.connect(config.port, config.host, () => {
        const connection = this.connections.get(config.id)!;
        connection.isConnected = true;
        connection.status = 'connected';
        connection.lastActivity = new Date();

        this.tcpSockets.set(config.id, socket);
        this.updateConnectionStats(config.id, { isConnected: true, connectionTime: new Date() });

        // 发送连接成功事件
        this.emitConnectionEvent(config.id, 'connected');

        resolve({ success: true, message: `TCP连接成功 ${config.host}:${config.port}` });
      });

      socket.on('data', (data: Buffer) => {
        this.handleDataReceived(config.id, new Uint8Array(data));
      });

      socket.on('error', (error) => {
        this.handleConnectionError(config.id, error.message);
        // 连接失败时清理连接记录
        this.connections.delete(config.id);
        this.connectionStats.delete(config.id);
        resolve({ success: false, error: error.message });
      });

      socket.on('close', () => {
        this.handleConnectionClosed(config.id);
      });

      socket.on('timeout', () => {
        socket.destroy();
        this.handleConnectionError(config.id, '连接超时');
        // 连接超时时清理连接记录
        this.connections.delete(config.id);
        this.connectionStats.delete(config.id);
        resolve({ success: false, error: '连接超时' });
      });
    });
  }

  /**
   * 创建UDP连接（本地绑定模式）
   */
  private async connectUdp(
    config: NetworkConnectionConfig,
    options?: UdpConnectionOptions,
  ): Promise<NetworkOperationResult> {
    try {
      const socket = dgram.createSocket('udp4');

      // UDP绑定到指定端口进行监听
      const bindPort = config.port;
      const bindHost = config.host === '0.0.0.0' ? undefined : config.host;

      console.log('[UDP连接] 准备绑定到:', {
        bindHost,
        bindPort,
        configHost: config.host,
        configPort: config.port,
      });

      return new Promise((resolve) => {
        socket.bind(bindPort, bindHost, () => {
          // 获取实际绑定的地址信息
          const address = socket.address();
          console.log('[UDP连接] 绑定成功，实际地址:', address);

          const connection = this.connections.get(config.id)!;
          connection.isConnected = true;
          connection.status = 'connected';
          connection.lastActivity = new Date();

          this.udpSockets.set(config.id, socket);
          this.updateConnectionStats(config.id, { isConnected: true, connectionTime: new Date() });
          this.emitConnectionEvent(config.id, 'connected');

          resolve({ success: true, message: `UDP绑定成功 ${address.address}:${address.port}` });
        });

        // 设置选项
        if (options?.broadcast) socket.setBroadcast(true);

        socket.on('message', (data: Buffer) => {
          this.handleDataReceived(config.id, new Uint8Array(data));
        });

        socket.on('error', (error) => {
          console.error('[UDP连接] 绑定错误:', error);
          this.handleConnectionError(config.id, error.message);
          // 连接失败时清理连接记录
          this.connections.delete(config.id);
          this.connectionStats.delete(config.id);
          resolve({ success: false, error: error.message });
        });

        socket.on('close', () => {
          console.log('[UDP连接] Socket已关闭');
          this.handleConnectionClosed(config.id);
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'UDP绑定失败',
      };
    }
  }

  /**
   * 断开连接
   */
  async disconnect(connectionId: string): Promise<NetworkOperationResult> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        return { success: false, error: '连接不存在' };
      }

      if (connection.type === 'tcp') {
        const socket = this.tcpSockets.get(connectionId);
        if (socket) {
          socket.destroy();
          this.tcpSockets.delete(connectionId);
        }
      } else {
        const socket = this.udpSockets.get(connectionId);
        if (socket) {
          socket.close();
          this.udpSockets.delete(connectionId);
        }
      }

      this.connections.delete(connectionId);
      this.connectionStats.delete(connectionId);

      return { success: true, message: '连接已断开' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '断开连接失败',
      };
    }
  }

  /**
   * 发送数据
   */
  async sendData(
    connectionId: string,
    data: Uint8Array,
    targetHost?: string,
  ): Promise<NetworkOperationResult> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection || !connection.isConnected) {
        return { success: false, error: '连接不存在或未连接' };
      }

      const startTime = Date.now(); // 记录开始时间

      let targetAddress = { host: connection.host, port: connection.port };

      // 如果指定了目标主机，解析目标地址
      if (targetHost) {
        // 解析格式：host:port
        const parts = targetHost.split(':');
        if (parts.length === 2) {
          targetAddress = {
            host: parts[0] || connection.host,
            port: parseInt(parts[1] || '0') || connection.port,
          };
        }
      }

      if (connection.type === 'tcp') {
        const socket = this.tcpSockets.get(connectionId);
        if (socket) {
          socket.write(Buffer.from(data));
          this.updateConnectionStats(connectionId, {
            bytesSent: data.length,
            messagesSent: 1,
            lastActivity: new Date(),
          });
          const duration = Date.now() - startTime;
          return { success: true, message: `TCP发送完成，耗时: ${duration}ms` };
        }
      } else {
        const socket = this.udpSockets.get(connectionId);
        if (socket) {
          // 使用Promise等待UDP发送完成
          return new Promise((resolve) => {
            socket.send(Buffer.from(data), targetAddress.port, targetAddress.host, (error) => {
              const duration = Date.now() - startTime;
              if (error) {
                console.error('[UDP发送] 发送失败:', error);
                resolve({ success: false, error: error.message });
              } else {
                // console.log(`[UDP发送] 发送成功，耗时: ${duration}ms`);
                this.updateConnectionStats(connectionId, {
                  bytesSent: data.length,
                  messagesSent: 1,
                  lastActivity: new Date(),
                });
                resolve({ success: true, message: `UDP发送完成，耗时: ${duration}ms` });
              }
            });
          });
        }
      }

      return { success: false, error: 'Socket不存在' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送数据失败',
      };
    }
  }

  /**
   * 获取所有连接
   */
  getConnections(): NetworkConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(connectionId: string): NetworkStatus | null {
    return this.connectionStats.get(connectionId) || null;
  }

  /**
   * 处理接收到的数据
   */
  private handleDataReceived(connectionId: string, data: Uint8Array): void {
    this.updateConnectionStats(connectionId, {
      bytesReceived: data.length,
      messagesReceived: 1,
      lastActivity: new Date(),
    });

    // 检查是否为业务数据需要高速存储
    // console.log('connectionId为', connectionId, 'data为', data);
    const storageRule = storageManager.shouldStore(connectionId, data);
    // console.log('storageRule为', storageRule);
    if (storageRule) {
      // 异步存储，不阻塞数据处理
      storageManager.storeData(data, storageRule).catch((error) => {
        console.error('高速存储失败:', error);
      });

      // 业务数据不发送到渲染进程，避免资源浪费
      return;
    }

    // 非业务数据才发送数据事件到渲染进程
    this.emitDataEvent(connectionId, data);
  }

  /**
   * 处理连接错误
   */
  private handleConnectionError(connectionId: string, error: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'error';
      connection.error = error;
      connection.isConnected = false;
    }

    this.updateConnectionStats(connectionId, { isConnected: false, error });
    this.emitConnectionEvent(connectionId, 'error', { error });
  }

  /**
   * 处理连接关闭
   */
  private handleConnectionClosed(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'disconnected';
      connection.isConnected = false;
    }

    this.updateConnectionStats(connectionId, { isConnected: false });
    this.emitConnectionEvent(connectionId, 'disconnected');
  }

  /**
   * 初始化连接统计
   */
  private initConnectionStats(connectionId: string): void {
    this.connectionStats.set(connectionId, {
      isConnected: false,
      bytesReceived: 0,
      bytesSent: 0,
      messagesReceived: 0,
      messagesSent: 0,
    });
  }

  /**
   * 更新连接统计
   */
  private updateConnectionStats(connectionId: string, updates: Partial<NetworkStatus>): void {
    const stats = this.connectionStats.get(connectionId);
    if (stats) {
      Object.assign(stats, updates);
      if (updates.bytesReceived) stats.bytesReceived += updates.bytesReceived;
      if (updates.bytesSent) stats.bytesSent += updates.bytesSent;
      if (updates.messagesReceived) stats.messagesReceived += updates.messagesReceived;
      if (updates.messagesSent) stats.messagesSent += updates.messagesSent;
    }
  }

  /**
   * 发送连接事件
   */
  private emitConnectionEvent(connectionId: string, eventType: string, data?: unknown): void {
    // 向所有渲染进程发送事件
    const allWebContents = webContents.getAllWebContents();
    allWebContents.forEach((wc: WebContents) => {
      wc.send('network:connectionEvent', {
        connectionId,
        eventType,
        data,
        timestamp: new Date(),
      });
    });
  }

  /**
   * 发送数据事件
   */
  private emitDataEvent(connectionId: string, data: Uint8Array): void {
    const allWebContents = webContents.getAllWebContents();
    allWebContents.forEach((wc: WebContents) => {
      wc.send('network:data', {
        connectionId,
        data: Array.from(data), // 转换为普通数组以便IPC传输
        size: data.length,
        timestamp: new Date(),
      });
    });
  }
}

// 创建连接管理器实例
const connectionManager = new NetworkConnectionManager();

// ==================== IPC处理器接口 ====================

/**
 * 连接网络
 */
async function connectNetwork(
  _event: IpcMainInvokeEvent,
  config: NetworkConnectionConfig,
  options?: NetworkConnectionOptions,
): Promise<NetworkOperationResult> {
  return await connectionManager.connect(config, options);
}

/**
 * 断开网络连接
 */
async function disconnectNetwork(
  _event: IpcMainInvokeEvent,
  connectionId: string,
): Promise<NetworkOperationResult> {
  return await connectionManager.disconnect(connectionId);
}

/**
 * 发送网络数据
 */
async function sendNetworkData(
  _event: IpcMainInvokeEvent,
  connectionId: string,
  data: Uint8Array,
  targetHost?: string,
): Promise<NetworkOperationResult> {
  return await connectionManager.sendData(connectionId, data, targetHost);
}

/**
 * 获取所有网络连接
 */
async function getNetworkConnections(): Promise<NetworkConnection[]> {
  return connectionManager.getConnections();
}

/**
 * 获取网络连接状态
 */
async function getNetworkStatus(
  _event: IpcMainInvokeEvent,
  connectionId: string,
): Promise<NetworkStatus | null> {
  return connectionManager.getConnectionStatus(connectionId);
}

// ==================== 注册处理器 ====================

const networkRegistry = createHandlerRegistry('network');

networkRegistry.register('connect', connectNetwork);
networkRegistry.register('disconnect', disconnectNetwork);
networkRegistry.register('send', sendNetworkData);
networkRegistry.register('getConnections', getNetworkConnections);
networkRegistry.register('getStatus', getNetworkStatus);

export function registerNetworkHandlers() {
  return networkRegistry.registerAll();
}
