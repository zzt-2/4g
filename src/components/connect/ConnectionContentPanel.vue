<script setup lang="ts">
import { defineProps, computed, watch, ref } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import { useNetworkStore } from '../../stores/netWorkStore';
import SerialOptionsForm from './SerialOptionsForm.vue';
import SerialTestTools from './SerialTestTools.vue';
import NetworkConnectionCard from './NetworkConnectionCard.vue';
import NetworkConnectionEditDialog from './NetworkConnectionEditDialog.vue';
import { useStorage } from '@vueuse/core';
import type { NetworkConnectionConfig } from '../../types/serial/network';

defineProps<{
  // 面板显示模式：'network' | 'serial' | 'test'
  mode: 'network' | 'serial' | 'test';
}>();

const serialStore = useSerialStore();
const networkStore = useNetworkStore();

// 选中的串口路径
const selectedPort = useStorage<string>('selected-serial-port-test', '');

// 网络连接配置存储
const networkConfigs = useStorage<NetworkConnectionConfig[]>('network-connection-configs', []);

// 编辑对话框状态
const editDialogVisible = ref(false);
const editingConfig = ref<NetworkConnectionConfig | undefined>();
const editMode = ref<'add' | 'edit'>('add');

// 删除确认对话框
const deleteConfirmVisible = ref(false);
const deletingConfigId = ref<string>('');

// 计算可用串口列表（包括连接和未连接的）
const availablePorts = computed(() => {
  const ports = serialStore.availablePorts
    .map((port) => port.path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
  return ports;
});

// 当没有选中串口但有可用串口时，自动选择第一个
if (!selectedPort.value && availablePorts.value.length > 0) {
  selectedPort.value = availablePorts.value[0]!;
}

// 监听availablePorts变化，自动选择第一个
watch(availablePorts, (newPorts) => {
  if (!selectedPort.value && newPorts.length > 0) {
    selectedPort.value = newPorts[0]!;
  } else if (newPorts.length === 0) {
    selectedPort.value = '';
  }
});

// 获取连接运行时状态
const getConnectionRuntimeInfo = (configId: string) => {
  const connection = networkStore.connections.find((conn) => conn.id === configId);
  return {
    isConnected: connection?.isConnected || false,
    status: (connection?.status || 'idle') as 'idle' | 'connecting' | 'connected' | 'error',
    error: connection?.error,
  };
};

// 构建卡片props - 修复类型问题
const getCardProps = (config: NetworkConnectionConfig) => {
  const runtimeInfo = getConnectionRuntimeInfo(config.id);

  const baseProps = {
    config,
    isConnected: runtimeInfo.isConnected,
    status: runtimeInfo.status,
  };

  // 只有当error存在时才添加error属性
  if (runtimeInfo.error) {
    return {
      ...baseProps,
      error: runtimeInfo.error,
    };
  }

  return baseProps;
};

// 处理添加新连接
const handleAddConnection = () => {
  editingConfig.value = undefined;
  editMode.value = 'add';
  editDialogVisible.value = true;
};

// 处理编辑连接
const handleEditConnection = (config: NetworkConnectionConfig) => {
  editingConfig.value = config;
  editMode.value = 'edit';
  editDialogVisible.value = true;
};

// 处理删除连接
const handleDeleteConnection = (configId: string) => {
  deletingConfigId.value = configId;
  deleteConfirmVisible.value = true;
};

// 确认删除连接
const confirmDeleteConnection = () => {
  const index = networkConfigs.value.findIndex((config) => config.id === deletingConfigId.value);
  if (index > -1) {
    networkConfigs.value.splice(index, 1);
  }
  deleteConfirmVisible.value = false;
  deletingConfigId.value = '';
};

// 处理连接到网络
const handleConnectToNetwork = async (config: NetworkConnectionConfig) => {
  await networkStore.connect(config);
};

// 处理断开网络连接
const handleDisconnectFromNetwork = async (configId: string) => {
  await networkStore.disconnect(configId);
};

// 保存连接配置
const handleSaveConfig = (config: NetworkConnectionConfig) => {
  if (editMode.value === 'add') {
    networkConfigs.value.push(config);
  } else {
    const index = networkConfigs.value.findIndex((c) => c.id === config.id);
    if (index > -1) {
      networkConfigs.value.splice(index, 1, config);
    }
  }
};

// 获取删除的连接名称
const getDeletingConnectionName = computed(() => {
  const config = networkConfigs.value.find((config) => config.id === deletingConfigId.value);
  return config?.name || '未知连接';
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 网络配置模式 -->
    <template v-if="mode === 'network'">
      <!-- 操作栏 -->
      <div class="mb-4 flex justify-between items-center">
        <div class="text-sm text-industrial-secondary">
          网络连接配置 ({{ networkConfigs.length }}/9)
        </div>
        <q-btn color="primary" icon="add" label="添加连接" size="sm" :disable="networkConfigs.length >= 9"
          @click="handleAddConnection">
          <q-tooltip v-if="networkConfigs.length >= 9"> 最多支持9个网络连接配置 </q-tooltip>
        </q-btn>
      </div>

      <!-- 网络连接卡片网格 -->
      <div class="flex-1 overflow-auto">
        <div v-if="networkConfigs.length === 0"
          class="flex items-center justify-center h-full text-industrial-secondary">
          <div class="text-center">
            <q-icon name="wifi_off" size="lg" class="text-industrial-tertiary mb-2" />
            <div>暂无网络连接配置</div>
            <div class="text-sm mt-1">点击"添加连接"创建新的网络连接</div>
          </div>
        </div>

        <div v-else class="grid grid-cols-3 gap-4 h-fit">
          <NetworkConnectionCard v-for="config in networkConfigs" :key="config.id" v-bind="getCardProps(config)"
            @edit="handleEditConnection" @delete="handleDeleteConnection" @connect="handleConnectToNetwork"
            @disconnect="handleDisconnectFromNetwork" />
        </div>
      </div>
    </template>

    <!-- 串口配置模式 -->
    <template v-else-if="mode === 'serial'">
      <!-- 串口选择 -->
      <div class="mb-3">
        <q-select v-model="selectedPort" :options="availablePorts" label="选择串口" outlined dense dark emit-value
          map-options class="bg-industrial-secondary border-industrial text-industrial-primary mb-2">
          <template v-slot:option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt }}</q-item-label>
              </q-item-section>
              <q-item-section side v-if="serialStore.isPortConnected(scope.opt)">
                <q-icon name="check_circle" color="green" />
              </q-item-section>
            </q-item>
          </template>

          <template v-slot:selected>
            <div class="flex items-center">
              <span>{{ selectedPort }}</span>
              <q-icon v-if="serialStore.isPortConnected(selectedPort)" name="check_circle" color="green" class="ml-1"
                size="xs" />
            </div>
          </template>
        </q-select>
      </div>

      <!-- 串口配置内容 -->
      <div v-if="!selectedPort" class="flex-1 flex items-center justify-center text-industrial-secondary">
        <div class="text-center">
          <q-icon name="usb_off" size="lg" class="text-industrial-tertiary mb-2" />
          <div>未选择串口设备</div>
          <div class="text-sm mt-1">请先选择一个串口设备</div>
        </div>
      </div>
      <SerialOptionsForm v-else class="flex-1" :port-path="selectedPort" />
    </template>

    <!-- 测试模式 - 移除网络测试，只保留串口测试 -->
    <template v-else-if="mode === 'test'">
      <!-- 串口选择 -->
      <div class="mb-3">
        <q-select v-model="selectedPort" :options="availablePorts" label="选择测试串口" outlined dense dark emit-value
          map-options class="bg-industrial-secondary border-industrial text-industrial-primary">
          <template v-slot:option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt }}</q-item-label>
              </q-item-section>
              <q-item-section side v-if="serialStore.isPortConnected(scope.opt)">
                <q-icon name="check_circle" color="green" />
              </q-item-section>
            </q-item>
          </template>

          <template v-slot:selected>
            <div class="flex items-center">
              <span>{{ selectedPort }}</span>
              <q-icon v-if="serialStore.isPortConnected(selectedPort)" name="check_circle" color="green" class="ml-1"
                size="xs" />
            </div>
          </template>
        </q-select>
      </div>

      <!-- 串口测试工具 -->
      <div class="flex-1">
        <div v-if="!selectedPort" class="flex items-center justify-center h-full text-industrial-secondary">
          <div class="text-center">
            <q-icon name="usb_off" size="lg" class="text-industrial-tertiary mb-2" />
            <div>未选择测试串口</div>
            <div class="text-sm mt-1">请先选择一个串口进行测试</div>
          </div>
        </div>
        <SerialTestTools v-else :port-path="selectedPort" />
      </div>
    </template>

    <!-- 编辑对话框 -->
    <NetworkConnectionEditDialog v-model="editDialogVisible" :config="editingConfig" :mode="editMode"
      @save="handleSaveConfig" />

    <!-- 删除确认对话框 -->
    <q-dialog v-model="deleteConfirmVisible">
      <q-card class="bg-industrial-panel border border-industrial w-80 max-w-[90vw]">
        <q-card-section class="bg-industrial-secondary border-b border-industrial row items-center q-py-sm q-px-md">
          <q-icon name="warning" color="warning" size="md" />
          <span class="text-h6 ml-2 text-industrial-primary font-medium">确认删除</span>
        </q-card-section>

        <q-card-section class="q-pa-md">
          <div class="text-industrial-secondary">
            确定要删除连接 "{{ getDeletingConnectionName }}" 吗？
          </div>
          <div class="text-sm text-industrial-tertiary mt-2">
            此操作无法撤销。如果该连接正在使用中，将会自动断开。
          </div>
        </q-card-section>

        <q-card-actions class="bg-industrial-secondary border-t border-industrial px-4 py-3 flex justify-end gap-3">
          <q-btn flat label="取消" class="btn-industrial-secondary px-4 py-2" @click="deleteConfirmVisible = false" />
          <q-btn label="删除" class="btn-industrial-danger px-4 py-2" @click="confirmDeleteConnection" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
