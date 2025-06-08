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
      if (this.connections.has(config.id)) {
        return { success: false, error: '连接已存在' };
      }

      const connection: NetworkConnection = {
        ...config,
        isConnected: false,
        status: 'connecting',
      };

      this.connections.set(config.id, connection);
      this.initConnectionStats(config.id);

      if (config.type === 'tcp') {
        return await this.connectTcp(config, options as TcpConnectionOptions);
      } else {
        return await this.connectUdp(config, options as UdpConnectionOptions);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接失败',
      };
    }
  }

  /**
   * 创建TCP连接
   */
  private async connectTcp(
    config: NetworkConnectionConfig,
    options?: TcpConnectionOptions,
  ): Promise<NetworkOperationResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      // 设置选项
      if (options?.keepAlive) socket.setKeepAlive(true);
      if (options?.noDelay) socket.setNoDelay(true);

      const timeout = options?.timeout || config.timeout || 5000;
      socket.setTimeout(timeout);

      socket.connect(config.port, config.host, () => {
        const connection = this.connections.get(config.id)!;
        connection.isConnected = true;
        connection.status = 'connected';
        connection.lastActivity = new Date();

        this.tcpSockets.set(config.id, socket);
        this.updateConnectionStats(config.id, { isConnected: true, connectionTime: new Date() });

        // 发送连接成功事件
        this.emitConnectionEvent(config.id, 'connected');

        resolve({ success: true, message: 'TCP连接成功' });
      });

      socket.on('data', (data: Buffer) => {
        this.handleDataReceived(config.id, new Uint8Array(data));
      });

      socket.on('error', (error) => {
        this.handleConnectionError(config.id, error.message);
        resolve({ success: false, error: error.message });
      });

      socket.on('close', () => {
        this.handleConnectionClosed(config.id);
      });

      socket.on('timeout', () => {
        socket.destroy();
        this.handleConnectionError(config.id, '连接超时');
        resolve({ success: false, error: '连接超时' });
      });
    });
  }

  /**
   * 创建UDP连接
   */
  private async connectUdp(
    config: NetworkConnectionConfig,
    options?: UdpConnectionOptions,
  ): Promise<NetworkOperationResult> {
    try {
      const socket = dgram.createSocket('udp4');

      // 设置选项
      if (options?.reuseAddr) socket.bind({ port: 0, exclusive: false });
      if (options?.broadcast) socket.setBroadcast(true);

      socket.on('message', (data: Buffer, _rinfo) => {
        this.handleDataReceived(config.id, new Uint8Array(data));
      });

      socket.on('error', (error) => {
        this.handleConnectionError(config.id, error.message);
      });

      socket.on('close', () => {
        this.handleConnectionClosed(config.id);
      });

      this.udpSockets.set(config.id, socket);

      const connection = this.connections.get(config.id)!;
      connection.isConnected = true;
      connection.status = 'connected';
      connection.lastActivity = new Date();

      this.updateConnectionStats(config.id, { isConnected: true, connectionTime: new Date() });
      this.emitConnectionEvent(config.id, 'connected');

      return { success: true, message: 'UDP连接成功' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'UDP连接失败',
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
  async sendData(connectionId: string, data: Uint8Array): Promise<NetworkOperationResult> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection || !connection.isConnected) {
        return { success: false, error: '连接不存在或未连接' };
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
          return { success: true };
        }
      } else {
        const socket = this.udpSockets.get(connectionId);
        if (socket) {
          socket.send(Buffer.from(data), connection.port, connection.host);
          this.updateConnectionStats(connectionId, {
            bytesSent: data.length,
            messagesSent: 1,
            lastActivity: new Date(),
          });
          return { success: true };
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

    // 发送数据事件到渲染进程
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
): Promise<NetworkOperationResult> {
  return await connectionManager.sendData(connectionId, data);
}

/**
 * 获取所有网络连接
 */
async function getNetworkConnections(_event: IpcMainInvokeEvent): Promise<NetworkConnection[]> {
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
