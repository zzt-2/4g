/**
 * 网口数据接收工具函数
 * 展示如何统一处理网口和串口数据
 */

import { useReceiveFramesStore } from '../../stores/frames/receiveFramesStore';

// 网络连接状态类型
export interface NetworkConnection {
  id: string;
  type: 'tcp' | 'udp';
  host: string;
  port: number;
  isConnected: boolean;
}

// 模拟网络数据接收类
export class NetworkReceiver {
  private connections = new Map<string, NetworkConnection>();
  private receiveFramesStore = useReceiveFramesStore();

  /**
   * 添加网络连接
   * @param connection 网络连接配置
   */
  addConnection(connection: NetworkConnection): void {
    this.connections.set(connection.id, connection);
  }

  /**
   * 移除网络连接
   * @param connectionId 连接ID
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * 模拟接收网络数据
   * @param connectionId 连接ID
   * @param data 接收到的数据
   */
  handleNetworkData(connectionId: string, data: Uint8Array): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isConnected) {
      console.warn(`网络连接 ${connectionId} 不存在或未连接`);
      return;
    }

    try {
      // 统一数据接收处理 - 调用接收帧处理
      this.receiveFramesStore.handleReceivedData('network', connectionId, data);

      console.log(`网络数据已处理: ${connection.type}://${connection.host}:${connection.port}`);
    } catch (error) {
      console.error('网络数据处理失败:', error);
    }
  }

  /**
   * 获取所有连接
   * @returns 连接列表
   */
  getConnections(): NetworkConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 获取指定连接
   * @param connectionId 连接ID
   * @returns 连接对象
   */
  getConnection(connectionId: string): NetworkConnection | undefined {
    return this.connections.get(connectionId);
  }
}

// 导出单例实例
export const networkReceiver = new NetworkReceiver();

/**
 * 示例：如何在网络模块中使用统一数据处理
 */
export function setupNetworkDataHandling() {
  // 示例TCP连接
  const tcpConnection: NetworkConnection = {
    id: 'tcp-main',
    type: 'tcp',
    host: '192.168.1.100',
    port: 8080,
    isConnected: true,
  };

  networkReceiver.addConnection(tcpConnection);

  // 模拟接收数据的处理
  // 在实际的网络模块中，这里会是真实的socket数据接收回调
  const handleTcpData = (data: Uint8Array) => {
    networkReceiver.handleNetworkData('tcp-main', data);
  };

  // 示例UDP连接
  const udpConnection: NetworkConnection = {
    id: 'udp-broadcast',
    type: 'udp',
    host: '255.255.255.255',
    port: 9999,
    isConnected: true,
  };

  networkReceiver.addConnection(udpConnection);

  const handleUdpData = (data: Uint8Array) => {
    networkReceiver.handleNetworkData('udp-broadcast', data);
  };

  console.log('网络数据处理已设置完成');

  return {
    handleTcpData,
    handleUdpData,
    networkReceiver,
  };
}
