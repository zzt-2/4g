import { ref, computed, watchEffect } from 'vue';
import { defineStore } from 'pinia';
import { useSerialStore } from './serialStore';
import { useNetworkStore } from './netWorkStore';
import { useDebounceFn } from '@vueuse/core';
import type { ConnectionTarget, ConnectionType } from '../types/common/connectionTarget';

/**
 * 连接目标管理 Store
 * 统一管理所有类型的连接目标，避免重复创建和频繁刷新
 */
export const useConnectionTargetsStore = defineStore('connectionTargets', () => {
  // 状态
  const availableTargets = ref<ConnectionTarget[]>([]);
  const isLoading = ref(false);

  // 计算属性：按类型分组的目标
  const serialTargets = computed(() =>
    availableTargets.value.filter((target) => target.type === 'serial'),
  );

  const networkTargets = computed(() =>
    availableTargets.value.filter((target) => target.type === 'network'),
  );

  const connectedTargets = computed(() =>
    availableTargets.value.filter((target) => target.status === 'connected'),
  );

  // 防抖刷新可用目标列表（300ms 防抖）
  const refreshTargets = useDebounceFn(async () => {
    isLoading.value = true;
    try {
      // 引入stores
      const serialStore = useSerialStore();
      const networkStore = useNetworkStore();

      // 获取串口列表
      // await serialStore.refreshPorts(true);

      // 准备新的目标列表
      const newTargets: ConnectionTarget[] = [];

      // 添加串口目标
      for (const port of serialStore.availablePorts) {
        // 检查串口状态
        const isConnected = serialStore.isPortConnected(port.path);

        // 准备设备描述
        const description =
          (port.friendlyName ? port.friendlyName : '') ||
          (port.manufacturer ? port.manufacturer : '') ||
          '串口设备';

        newTargets.push({
          id: `serial:${port.path}`,
          name: port.path,
          type: 'serial',
          path: port.path,
          status: isConnected ? 'connected' : 'disconnected',
          description,
        });
      }

      // 添加网络连接目标
      const networkConnections = networkStore.getActiveConnections();
      for (const connection of networkConnections) {
        if (connection.type === 'tcp') {
          // TCP连接：创建单一连接目标，代表整个TCP连接
          const tcpTargetId = `network:${connection.id}`;
          const tcpDescription =
            connection.description || `TCP连接 - ${connection.host}:${connection.port}`;

          newTargets.push({
            id: tcpTargetId,
            name: connection.name || `${connection.host}:${connection.port}`,
            type: 'network',
            address: `${connection.host}:${connection.port}`,
            status: connection.isConnected ? 'connected' : 'disconnected',
            description: tcpDescription,
            connectionId: connection.id,
          });
        } else if (connection.type === 'udp') {
          // UDP连接：只添加远程主机目标（UDP绑定地址不是发送目标）
          if (connection.remoteHosts && connection.remoteHosts.length > 0) {
            for (const remoteHost of connection.remoteHosts) {
              // 只添加启用的远程主机
              if (remoteHost.enabled !== false) {
                const remoteTargetId = `network:${connection.id}:${remoteHost.id}`;
                const remoteDescription =
                  remoteHost.description || `UDP远程主机 - ${remoteHost.host}:${remoteHost.port}`;

                newTargets.push({
                  id: remoteTargetId,
                  name: `${connection.name || connection.host}/${remoteHost.name}`,
                  type: 'network',
                  address: `${remoteHost.host}:${remoteHost.port}`,
                  status: connection.isConnected ? 'connected' : 'disconnected',
                  description: remoteDescription,
                  connectionId: connection.id,
                  remoteHostId: remoteHost.id,
                });
              }
            }
          }
        }
      }

      // 更新可用目标列表
      availableTargets.value = newTargets;
    } finally {
      isLoading.value = false;
    }
  }, 1000);

  // 根据目标ID获取目标对象
  function getTargetById(targetId: string) {
    return availableTargets.value.find((t) => t.id === targetId);
  }

  // 获取特定类型的可用目标
  function getTargetsByType(type: ConnectionType) {
    return availableTargets.value.filter((t) => t.type === type);
  }

  // 从目标ID解析其类型
  function parseTargetType(targetId: string): ConnectionType | null {
    const parts = targetId.split(':');
    if (
      parts.length >= 2 &&
      ['serial', 'network', 'bluetooth', 'other'].includes(parts[0] as string)
    ) {
      return parts[0] as ConnectionType;
    }
    return null;
  }

  // 从目标ID解析其路径/地址
  function parseTargetPath(targetId: string): string | null {
    const parts = targetId.split(':');
    if (parts.length >= 2) {
      return parts.slice(1).join(':');
    }
    return null;
  }

  /**
   * 获取验证后的目标路径
   * 用于统一发送路由器，确保路径格式正确
   * @param targetId 目标ID
   * @returns 验证后的路径，如果无效则返回null
   */
  function getValidatedTargetPath(targetId: string): string | null {
    const target = getTargetById(targetId);
    if (!target) {
      return null;
    }

    // 对于串口，返回路径
    if (target.type === 'serial' && target.path) {
      return target.path;
    }

    // 对于网络连接
    if (target.type === 'network' && target.connectionId) {
      // TCP主连接目标：network:connectionId -> connectionId
      if (!target.remoteHostId) {
        return target.connectionId;
      }

      // UDP远程主机目标：network:connectionId:remoteHostId -> connectionId:targetHost
      if (target.remoteHostId && target.address) {
        return `${target.connectionId}:${target.address}`;
      }
    }

    return null;
  }

  // 获取第一个可用的目标ID（优先选择已连接的）
  function getFirstAvailableTargetId(): string {
    const connected = connectedTargets.value[0];
    if (connected) return connected.id;

    const first = availableTargets.value[0];
    return first?.id || '';
  }

  // 初始化时自动刷新
  refreshTargets();

  // 监听串口连接状态变化，及时更新目标列表
  watchEffect(() => {
    const serialStore = useSerialStore();
    // 当串口连接状态变化时重新获取目标
    void serialStore.portConnectionStatuses;
    refreshTargets();
  });

  // 监听网络连接状态变化，及时更新目标列表
  watchEffect(() => {
    const networkStore = useNetworkStore();
    // 当网络连接状态变化时重新获取目标
    void networkStore.connectedCount;
    refreshTargets();
  });

  return {
    // 状态
    availableTargets,
    isLoading,

    // 计算属性
    serialTargets,
    networkTargets,
    connectedTargets,

    // 方法
    refreshTargets,
    getTargetById,
    getTargetsByType,
    parseTargetType,
    parseTargetPath,
    getValidatedTargetPath,
    getFirstAvailableTargetId,
  };
});
