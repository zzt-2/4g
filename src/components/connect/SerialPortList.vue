<script setup lang="ts">
import { ref } from 'vue';
import { useSerialStore } from '../../stores/serialStore';

const serialStore = useSerialStore();

// 操作状态
const operatingPorts = ref<Record<string, boolean>>({});

// 当前展开的串口
const expandedPorts = ref<Record<string, boolean>>({});

// 连接到指定串口
const handleConnect = async (portPath: string) => {
  if (operatingPorts.value[portPath]) return;

  operatingPorts.value[portPath] = true;
  try {
    await serialStore.connectPort(portPath);
  } finally {
    operatingPorts.value[portPath] = false;
  }
};

// 断开连接
const handleDisconnect = async (portPath: string) => {
  if (operatingPorts.value[portPath]) return;

  operatingPorts.value[portPath] = true;
  try {
    await serialStore.disconnectPort(portPath);
  } finally {
    operatingPorts.value[portPath] = false;
  }
};

// 切换展开/折叠状态
const toggleExpand = (portPath: string) => {
  expandedPorts.value[portPath] = !expandedPorts.value[portPath];
};

// 是否是已连接的端口
const isConnectedPort = (portPath: string) => {
  return serialStore.isPortConnected(portPath);
};

// 获取串口的显示名称
const getPortDisplayName = (port: { friendlyName?: string; path: string }) => {
  return port.friendlyName || port.path;
};

// 获取串口的状态颜色
const getPortStatusColor = (portPath: string) => {
  // 已连接
  if (isConnectedPort(portPath)) {
    return 'green';
  }
  // 连接出错
  if (serialStore.portConnectionStatuses[portPath] === 'error') {
    return 'red';
  }
  // 正在连接
  if (serialStore.portConnectionStatuses[portPath] === 'connecting') {
    return 'orange';
  }
  // 默认状态
  return 'gray';
};

// 获取端口状态图标
const getPortStatusIcon = (portPath: string) => {
  // 已连接
  if (isConnectedPort(portPath)) {
    return 'link';
  }
  // 连接出错
  if (serialStore.portConnectionStatuses[portPath] === 'error') {
    return 'error_outline';
  }
  // 正在连接
  if (serialStore.portConnectionStatuses[portPath] === 'connecting') {
    return 'hourglass_empty';
  }
  // 默认状态
  return 'link_off';
};

// 获取端口状态文本
const getPortStatusText = (portPath: string) => {
  // 已连接
  if (isConnectedPort(portPath)) {
    return '已连接';
  }
  // 连接出错
  if (serialStore.portConnectionStatuses[portPath] === 'error') {
    return '连接失败';
  }
  // 正在连接
  if (serialStore.portConnectionStatuses[portPath] === 'connecting') {
    return '连接中';
  }
  // 默认状态
  return '未连接';
};

// 计算属性：是否可以连接特定串口
const canConnect = (portPath: string) => {
  // 只要不是正在连接，就可以连接
  return serialStore.portConnectionStatuses[portPath] !== 'connecting';
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 无可用串口的提示 -->
    <div v-if="serialStore.availablePorts.length === 0" class="text-center py-4">
      <div class="text-industrial-secondary mb-2">未检测到串口设备</div>
      <q-btn outline color="blue-5" label="刷新列表" class="text-sm" :loading="serialStore.isLoading"
        @click="serialStore.refreshPorts(true)" />
    </div>

    <!-- 串口列表 -->
    <div v-else class="space-y-3">
      <div v-for="port in serialStore.availablePorts" :key="port.path"
        class="border border-industrial rounded-lg overflow-hidden bg-industrial-panel">
        <!-- 串口标题行 -->
        <div class="p-3 flex justify-between items-center cursor-pointer hover:bg-industrial-highlight"
          @click="toggleExpand(port.path)">
          <div class="flex items-center">
            <q-icon :name="getPortStatusIcon(port.path)" :color="getPortStatusColor(port.path)" size="sm"
              class="mr-2" />
            <div>
              <div class="text-sm text-industrial-primary">{{ getPortDisplayName(port) }}</div>
              <div class="text-xs text-industrial-secondary">{{ port.path }}</div>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="text-xs mr-2" :class="`text-${getPortStatusColor(port.path)}-500`">
              {{ getPortStatusText(port.path) }}
            </div>

            <!-- 操作按钮 -->
            <div class="flex justify-end">
              <q-btn v-if="!isConnectedPort(port.path)" color="primary" label="连接" size="sm" :loading="operatingPorts[port.path] ||
                serialStore.portConnectionStatuses[port.path] === 'connecting'
                " :disable="!canConnect(port.path)" @click.stop="handleConnect(port.path)">
                <template #loading>
                  <q-spinner-dots />
                </template>
              </q-btn>

              <q-btn v-else color="negative" label="断开" size="sm" :loading="operatingPorts[port.path]"
                @click.stop="handleDisconnect(port.path)">
                <template #loading>
                  <q-spinner-dots />
                </template>
              </q-btn>
            </div>

            <q-icon :name="expandedPorts[port.path] ? 'expand_less' : 'expand_more'" color="blue-5" size="sm" />
          </div>
        </div>

        <!-- 展开的详情内容 -->
        <q-slide-transition>
          <div v-show="expandedPorts[port.path]" class="border-t border-industrial p-3">
            <!-- 详细信息 -->
            <div class="grid grid-cols-2 gap-2 text-xs text-industrial-secondary mb-3">
              <!-- 已连接时显示串口配置 -->
              <template v-if="isConnectedPort(port.path)">
                <div class="flex justify-between col-span-2 mt-2 mb-1">
                  <span class="font-medium text-industrial-accent">当前配置:</span>
                </div>

                <div class="flex justify-between">
                  <span>波特率:</span>
                  <span class="text-industrial-primary">
                    {{ serialStore.portSerialOptions[port.path]?.baudRate || '-' }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span>数据位:</span>
                  <span class="text-industrial-primary">
                    {{ serialStore.portSerialOptions[port.path]?.dataBits || '-' }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span>停止位:</span>
                  <span class="text-industrial-primary">
                    {{ serialStore.portSerialOptions[port.path]?.stopBits || '-' }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span>校验位:</span>
                  <span class="text-industrial-primary">
                    {{ serialStore.portSerialOptions[port.path]?.parity || '-' }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span>流控制:</span>
                  <span class="text-industrial-primary">
                    {{ serialStore.portSerialOptions[port.path]?.flowControl || '-' }}
                  </span>
                </div>

                <!-- 数据统计 -->
                <div class="flex justify-between col-span-2 mt-2 mb-1">
                  <span class="font-medium text-industrial-accent">数据统计:</span>
                </div>

                <div class="flex justify-between items-center">
                  <span>接收:</span>
                  <span class="rounded bg-industrial-table-header px-2 py-1">
                    {{ serialStore.portReceivedBytes(port.path) }} 字节
                  </span>
                </div>

                <div class="flex justify-between items-center">
                  <span>发送:</span>
                  <span class="rounded bg-industrial-table-header px-2 py-1">
                    {{ serialStore.portSentBytes(port.path) }} 字节
                  </span>
                </div>
              </template>
            </div>

            <!-- 错误信息 -->
            <div v-if="
              serialStore.portErrorMessages[port.path] &&
              serialStore.portConnectionStatuses[port.path] === 'error'
            " class="mb-3 bg-red-900/20 p-2 rounded text-xs text-red-400">
              <div class="font-medium mb-1">错误:</div>
              <div>{{ serialStore.portErrorMessages[port.path] }}</div>
            </div>
          </div>
        </q-slide-transition>
      </div>
    </div>
  </div>
</template>
