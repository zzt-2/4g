<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNetworkStore } from '../../stores/netWorkStore';
import type { NetworkConnectionConfig } from '../../types/serial/network';

const props = defineProps<{
  config: NetworkConnectionConfig;
  isConnected?: boolean;
  status?: 'idle' | 'connecting' | 'connected' | 'error';
  error?: string;
}>();

const emit = defineEmits<{
  edit: [config: NetworkConnectionConfig];
  delete: [configId: string];
  connect: [config: NetworkConnectionConfig];
  disconnect: [configId: string];
}>();

const networkStore = useNetworkStore();
const isOperating = ref(false);

// 计算连接状态
const connectionStatus = computed(() => {
  return props.status || 'idle';
});

// 获取状态颜色
const getStatusColor = () => {
  if (props.isConnected) return 'green';
  if (connectionStatus.value === 'error') return 'red';
  if (connectionStatus.value === 'connecting') return 'orange';
  return 'grey';
};

// 获取状态图标
const getStatusIcon = () => {
  if (props.isConnected) return 'wifi';
  if (connectionStatus.value === 'error') return 'wifi_off';
  if (connectionStatus.value === 'connecting') return 'wifi_find';
  return 'wifi_off';
};

// 获取状态文本
const getStatusText = () => {
  if (props.isConnected) return '已连接';
  if (connectionStatus.value === 'error') return '连接失败';
  if (connectionStatus.value === 'connecting') return '连接中';
  return '未连接';
};

// 处理连接操作
const handleConnect = async () => {
  if (isOperating.value) return;

  if (props.isConnected) {
    emit('disconnect', props.config.id);
  } else {
    emit('connect', props.config);
  }
};

// 处理编辑
const handleEdit = () => {
  emit('edit', props.config);
};

// 处理删除
const handleDelete = () => {
  emit('delete', props.config.id);
};

// 获取显示名称
const displayName = computed(() => {
  return props.config.name || `${props.config.host}:${props.config.port}`;
});

// 是否可以连接
const canConnect = computed(() => {
  return connectionStatus.value !== 'connecting' && !isOperating.value;
});
</script>

<template>
  <div
    class="bg-industrial-secondary border border-industrial rounded-lg p-4 h-full flex flex-col hover:bg-industrial-highlight transition-colors"
  >
    <!-- 卡片标题 -->
    <div class="flex items-start justify-between mb-3">
      <div class="min-w-0 flex-1">
        <h6 class="text-sm font-medium text-industrial-primary m-0 truncate" :title="displayName">
          {{ displayName }}
        </h6>
        <div class="text-xs text-industrial-secondary mt-1 truncate">
          {{ config.type.toUpperCase() }}://{{ config.host }}:{{ config.port }}
        </div>
      </div>
      <q-icon
        :name="getStatusIcon()"
        :color="getStatusColor()"
        size="sm"
        class="ml-2 flex-shrink-0"
      />
    </div>

    <!-- 连接状态 -->
    <div class="mb-3 flex-1">
      <div class="flex items-center mb-2">
        <span class="text-xs text-industrial-secondary mr-2">状态:</span>
        <span
          class="text-xs px-2 py-1 rounded"
          :class="`text-${getStatusColor()}-400 bg-${getStatusColor()}-900/20`"
        >
          {{ getStatusText() }}
        </span>
      </div>

      <!-- 错误信息 -->
      <div
        v-if="error && status === 'error'"
        class="text-xs text-red-400 bg-red-900/20 p-2 rounded"
      >
        {{ error }}
      </div>

      <!-- 描述信息 -->
      <div
        v-else-if="config.description"
        class="text-xs text-industrial-tertiary break-all overflow-hidden"
        style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical"
      >
        {{ config.description }}
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex gap-1 mt-auto">
      <!-- 编辑按钮 -->
      <q-btn
        flat
        dense
        size="sm"
        icon="edit"
        label="编辑"
        class="flex-1 text-xs text-industrial-accent hover:bg-industrial-highlight"
        @click="handleEdit"
      >
        <q-tooltip class="bg-industrial-panel text-industrial-primary">编辑配置</q-tooltip>
      </q-btn>

      <!-- 删除按钮 -->
      <q-btn
        flat
        dense
        size="sm"
        icon="delete"
        label="删除"
        class="flex-1 text-xs text-red-400 hover:bg-industrial-highlight"
        :disable="isConnected"
        @click="handleDelete"
      >
        <q-tooltip class="bg-industrial-panel text-industrial-primary">{{
          isConnected ? '请先断开连接' : '删除配置'
        }}</q-tooltip>
      </q-btn>

      <!-- 连接按钮 -->
      <q-btn
        :class="[
          'flex-1 text-xs',
          isConnected ? 'btn-industrial-danger' : 'btn-industrial-primary',
        ]"
        :icon="isConnected ? 'wifi_off' : 'wifi'"
        :label="isConnected ? '断开' : '连接'"
        dense
        size="sm"
        :disable="!canConnect"
        :loading="status === 'connecting' || isOperating"
        @click="handleConnect"
      >
        <q-tooltip class="bg-industrial-panel text-industrial-primary">{{
          isConnected ? '断开网络连接' : '连接到网络'
        }}</q-tooltip>
      </q-btn>
    </div>
  </div>
</template>
