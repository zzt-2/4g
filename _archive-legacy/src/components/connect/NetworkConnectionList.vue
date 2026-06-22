<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNetworkStore } from '../../stores/netWorkStore';
import type { NetworkConnectionStatus, NetworkConnectionType } from '../../types/serial/network';

const networkStore = useNetworkStore();

// 操作状态
const operatingConnections = ref<Record<string, boolean>>({});

// 连接到指定网络
const handleConnect = async (connection: {
  id: string;
  type: NetworkConnectionType;
  host: string;
  port: number;
  name?: string;
  description?: string;
  status: NetworkConnectionStatus;
}) => {
  if (operatingConnections.value[connection.id] || connection.status === 'connecting') return;

  operatingConnections.value[connection.id] = true;
  try {
    await networkStore.connect({
      id: connection.id,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      name: connection.name || '',
      description: connection.description || '',
    });
  } finally {
    operatingConnections.value[connection.id] = false;
  }
};

// 断开连接
const handleDisconnect = async (connectionId: string) => {
  if (operatingConnections.value[connectionId]) return;

  operatingConnections.value[connectionId] = true;
  try {
    await networkStore.disconnect(connectionId);
  } finally {
    operatingConnections.value[connectionId] = false;
  }
};

// 获取连接的显示名称
const getConnectionDisplayName = (connection: { name?: string; host: string; port: number }) => {
  return connection.name || `${connection.host}:${connection.port}`;
};

// 获取连接的状态颜色
const getConnectionStatusColor = (connection: {
  isConnected: boolean;
  status: NetworkConnectionStatus;
}) => {
  if (connection.isConnected) return 'green';
  if (connection.status === 'error') return 'red';
  if (connection.status === 'connecting') return 'orange';
  return 'grey';
};

// 获取连接状态图标
const getConnectionStatusIcon = (connection: {
  isConnected: boolean;
  status: NetworkConnectionStatus;
}) => {
  if (connection.isConnected) return 'wifi';
  if (connection.status === 'error') return 'wifi_off';
  if (connection.status === 'connecting') return 'wifi_find';
  return 'wifi_off';
};

// 计算属性：是否有任何连接正在进行
const isAnyConnecting = computed(() => {
  return Object.values(networkStore.isConnecting).some((connecting) => connecting);
});

// 刷新网络连接列表
const refreshConnections = () => {
  networkStore.refreshConnections();
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 无可用网络连接的提示 -->
    <div v-if="networkStore.connections.length === 0" class="text-center py-4">
      <div class="text-industrial-secondary mb-2 text-sm">暂无网络连接</div>
      <q-btn
        outline
        color="blue-5"
        label="刷新"
        size="sm"
        class="text-xs"
        :loading="isAnyConnecting"
        @click="refreshConnections"
      />
    </div>

    <!-- 网络连接列表 -->
    <div v-else class="space-y-2">
      <div
        v-for="connection in networkStore.connections"
        :key="connection.id"
        class="p-3 border border-industrial rounded bg-industrial-panel hover:bg-industrial-highlight transition-colors"
      >
        <!-- 连接信息行 -->
        <div class="flex justify-between items-center">
          <div class="flex items-center flex-1 min-w-0">
            <q-icon
              :name="getConnectionStatusIcon(connection)"
              :color="getConnectionStatusColor(connection)"
              size="sm"
              class="mr-2 flex-shrink-0"
            />
            <div class="min-w-0 flex-1">
              <div class="text-sm text-industrial-primary font-medium truncate">
                {{ getConnectionDisplayName(connection) }}
              </div>
              <div class="text-xs text-industrial-secondary truncate">
                {{ connection.type.toUpperCase() }}://{{ connection.host }}:{{ connection.port }}
              </div>
            </div>
          </div>

          <!-- 连接控制 -->
          <div class="flex items-center ml-2">
            <q-toggle
              :model-value="connection.isConnected"
              :disable="connection.status === 'connecting' || operatingConnections[connection.id]"
              :loading="operatingConnections[connection.id]"
              color="green"
              size="sm"
              @update:model-value="
                connection.isConnected ? handleDisconnect(connection.id) : handleConnect(connection)
              "
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
