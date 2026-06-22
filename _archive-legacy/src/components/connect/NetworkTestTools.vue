<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useNetworkStore } from '../../stores/netWorkStore';
import { useStorage } from '@vueuse/core';

const props = defineProps<{
  connectionId?: string; // 可选的连接ID
}>();

const networkStore = useNetworkStore();

// 选中的连接ID
const selectedConnectionId = useStorage<string>('selected-network-connection-test', '');

// 发送数据相关
const sendData = ref('');
const sendFormat = ref<'hex' | 'text'>('hex');
const isSending = ref(false);

// 接收数据相关
const receivedData = ref<string[]>([]);
const receiveFormat = ref<'hex' | 'text'>('hex');
const autoScroll = ref(true);
const maxReceiveLines = ref(1000);

// 计算可用连接列表
const availableConnections = computed(() => {
  return networkStore.connections
    .filter((conn) => conn.isConnected)
    .map((conn) => ({
      label: conn.name || `${conn.host}:${conn.port}`,
      value: conn.id,
      description: `${conn.type.toUpperCase()}://${conn.host}:${conn.port}`,
    }));
});

// 当前选中的连接
const selectedConnection = computed(() => {
  return networkStore.getConnection(selectedConnectionId.value);
});

// 监听props变化
watch(
  () => props.connectionId,
  (connectionId) => {
    if (connectionId) {
      selectedConnectionId.value = connectionId;
    }
  },
  { immediate: true },
);

// 当没有选中连接但有可用连接时，自动选择第一个
watch(
  availableConnections,
  (newConnections) => {
    if (!selectedConnectionId.value && newConnections.length > 0) {
      selectedConnectionId.value = newConnections[0]!.value;
    } else if (newConnections.length === 0) {
      selectedConnectionId.value = '';
    }
  },
  { immediate: true },
);

// 发送数据
const handleSendData = async () => {
  if (!selectedConnectionId.value || !sendData.value.trim()) return;

  isSending.value = true;
  try {
    let dataToSend: Uint8Array;

    if (sendFormat.value === 'hex') {
      // 十六进制格式
      const hexString = sendData.value.replace(/\s+/g, '');
      if (!/^[0-9A-Fa-f]*$/.test(hexString)) {
        throw new Error('无效的十六进制格式');
      }
      if (hexString.length % 2 !== 0) {
        throw new Error('十六进制字符串长度必须为偶数');
      }

      const bytes = [];
      for (let i = 0; i < hexString.length; i += 2) {
        bytes.push(parseInt(hexString.substr(i, 2), 16));
      }
      dataToSend = new Uint8Array(bytes);
    } else {
      // 文本格式
      dataToSend = new TextEncoder().encode(sendData.value);
    }

    const result = await networkStore.sendData(selectedConnectionId.value, dataToSend);

    if (result.success) {
      // 添加发送记录到接收区域
      const timestamp = new Date().toLocaleTimeString();
      const displayData =
        sendFormat.value === 'hex'
          ? Array.from(dataToSend)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ')
              .toUpperCase()
          : sendData.value;

      addReceivedData(`[${timestamp}] 发送: ${displayData}`, 'sent');

      // 清空发送框
      sendData.value = '';
    } else {
      throw new Error(result.error || '发送失败');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '发送失败';
    const timestamp = new Date().toLocaleTimeString();
    addReceivedData(`[${timestamp}] 错误: ${errorMessage}`, 'error');
  } finally {
    isSending.value = false;
  }
};

// 添加接收数据
const addReceivedData = (data: string, type: 'received' | 'sent' | 'error' = 'received') => {
  const prefix = type === 'received' ? '← ' : type === 'sent' ? '→ ' : '⚠ ';
  receivedData.value.push(prefix + data);

  // 限制最大行数
  if (receivedData.value.length > maxReceiveLines.value) {
    receivedData.value = receivedData.value.slice(-maxReceiveLines.value);
  }

  // 自动滚动
  if (autoScroll.value) {
    setTimeout(() => {
      const textarea = document.querySelector('.receive-area') as HTMLTextAreaElement;
      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    }, 10);
  }
};

// 清空接收区域
const clearReceiveArea = () => {
  receivedData.value = [];
};

// 保存接收数据
const saveReceiveData = () => {
  const dataStr = receivedData.value.join('\n');
  const blob = new Blob([dataStr], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `network-test-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// 格式化显示数据
const formatDisplayData = (data: string) => {
  if (receiveFormat.value === 'hex') {
    // 如果是十六进制格式，每16个字节换行
    return data.replace(/(.{48})/g, '$1\n');
  }
  return data;
};

// 连接状态检查
const isConnectionAvailable = computed(() => {
  return selectedConnection.value?.isConnected || false;
});

// 快速发送预设
const quickSendPresets = [
  { label: '心跳包', value: 'FF FF 00 01', format: 'hex' },
  { label: '查询状态', value: 'FF FF 00 02', format: 'hex' },
  { label: '复位命令', value: 'FF FF 00 03', format: 'hex' },
  { label: 'Hello', value: 'Hello', format: 'text' },
  { label: 'Test', value: 'Test', format: 'text' },
];

// 使用预设
const usePreset = (preset: (typeof quickSendPresets)[0]) => {
  sendData.value = preset.value;
  sendFormat.value = preset.format as 'hex' | 'text';
};

// 连接操作
const handleConnect = async () => {
  if (!selectedConnection.value) return;

  try {
    await networkStore.connect({
      id: selectedConnection.value.id,
      name: selectedConnection.value.name,
      type: selectedConnection.value.type,
      host: selectedConnection.value.host,
      port: selectedConnection.value.port,
      description: selectedConnection.value.description || '',
    });
  } catch (error) {
    console.error('连接失败:', error);
  }
};

const handleDisconnect = async () => {
  if (!selectedConnectionId.value) return;

  try {
    await networkStore.disconnect(selectedConnectionId.value);
  } catch (error) {
    console.error('断开连接失败:', error);
  }
};
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 连接选择 -->
    <div class="mb-3">
      <q-select
        v-model="selectedConnectionId"
        :options="availableConnections"
        label="选择网络连接"
        outlined
        dense
        dark
        emit-value
        map-options
        bg-color="rgba(16, 24, 40, 0.6)"
        class="mb-2"
      >
        <template v-slot:option="scope">
          <q-item v-bind="scope.itemProps">
            <q-item-section>
              <q-item-label>{{ scope.opt.label }}</q-item-label>
              <q-item-label caption>{{ scope.opt.description }}</q-item-label>
            </q-item-section>
            <q-item-section side v-if="networkStore.getConnection(scope.opt.value)?.isConnected">
              <q-icon name="wifi" color="green" />
            </q-item-section>
          </q-item>
        </template>

        <template v-slot:selected>
          <div class="flex items-center">
            <span>{{
              availableConnections.find((c) => c.value === selectedConnectionId)?.label ||
              selectedConnectionId
            }}</span>
            <q-icon v-if="isConnectionAvailable" name="wifi" color="green" class="ml-1" size="xs" />
          </div>
        </template>
      </q-select>
    </div>

    <!-- 无连接提示 -->
    <div
      v-if="!selectedConnectionId"
      class="flex-1 flex items-center justify-center text-industrial-secondary"
    >
      <div class="text-center">
        <q-icon name="wifi_off" size="lg" class="text-industrial-tertiary mb-2" />
        <div>未选择网络连接</div>
        <div class="text-sm mt-1">请先选择一个网络连接</div>
      </div>
    </div>

    <!-- 连接未建立提示 -->
    <div
      v-else-if="!isConnectionAvailable"
      class="flex-1 flex items-center justify-center text-industrial-secondary"
    >
      <div class="text-center">
        <q-icon name="wifi_off" size="lg" class="text-industrial-tertiary mb-2" />
        <div>连接未建立</div>
        <div class="text-sm mt-1">请先建立网络连接</div>
        <q-btn color="primary" label="连接" class="mt-3" @click="handleConnect" />
      </div>
    </div>

    <!-- 测试工具界面 -->
    <div v-else class="flex-1 flex flex-col">
      <!-- 连接状态栏 -->
      <div class="mb-3 p-2 bg-industrial-table-header rounded border border-industrial">
        <div class="flex justify-between items-center">
          <div class="flex items-center">
            <q-icon name="wifi" color="green" size="sm" class="mr-2" />
            <span class="text-sm text-industrial-primary">
              {{
                selectedConnection?.name ||
                `${selectedConnection?.host}:${selectedConnection?.port}`
              }}
            </span>
          </div>
          <q-btn flat dense color="negative" label="断开" size="sm" @click="handleDisconnect" />
        </div>
      </div>

      <!-- 数据接收区域 -->
      <div class="mb-3 flex-1 flex flex-col">
        <div class="flex justify-between items-center mb-2">
          <h6 class="text-sm font-medium text-industrial-primary m-0">接收数据</h6>
          <div class="flex items-center gap-2">
            <q-select
              v-model="receiveFormat"
              :options="[
                { label: '十六进制', value: 'hex' },
                { label: '文本', value: 'text' },
              ]"
              dense
              outlined
              dark
              emit-value
              map-options
              bg-color="rgba(16, 24, 40, 0.6)"
              class="w-24"
            />
            <q-checkbox v-model="autoScroll" label="自动滚动" dark color="blue" size="sm" />
            <q-btn flat dense color="blue" icon="save" size="sm" @click="saveReceiveData">
              <q-tooltip>保存数据</q-tooltip>
            </q-btn>
            <q-btn flat dense color="grey" icon="clear" size="sm" @click="clearReceiveArea">
              <q-tooltip>清空</q-tooltip>
            </q-btn>
          </div>
        </div>

        <q-scroll-area class="flex-1 border border-industrial rounded bg-industrial-panel">
          <div class="p-2 font-mono text-xs text-industrial-primary whitespace-pre-wrap">
            <div
              v-if="receivedData.length === 0"
              class="text-industrial-secondary text-center py-4"
            >
              暂无数据
            </div>
            <div v-else>
              <div
                v-for="(line, index) in receivedData"
                :key="index"
                :class="{
                  'text-blue-400': line.startsWith('→'),
                  'text-green-400': line.startsWith('←'),
                  'text-red-400': line.startsWith('⚠'),
                }"
              >
                {{ formatDisplayData(line) }}
              </div>
            </div>
          </div>
        </q-scroll-area>
      </div>

      <!-- 数据发送区域 -->
      <div class="border-t border-industrial pt-3">
        <div class="flex justify-between items-center mb-2">
          <h6 class="text-sm font-medium text-industrial-primary m-0">发送数据</h6>
          <q-select
            v-model="sendFormat"
            :options="[
              { label: '十六进制', value: 'hex' },
              { label: '文本', value: 'text' },
            ]"
            dense
            outlined
            dark
            emit-value
            map-options
            bg-color="rgba(16, 24, 40, 0.6)"
            class="w-24"
          />
        </div>

        <!-- 快速发送预设 -->
        <div class="mb-2">
          <div class="text-xs text-industrial-secondary mb-1">快速发送:</div>
          <div class="flex flex-wrap gap-1">
            <q-btn
              v-for="preset in quickSendPresets"
              :key="preset.label"
              dense
              size="sm"
              color="blue"
              outline
              :label="preset.label"
              @click="usePreset(preset)"
            />
          </div>
        </div>

        <!-- 发送输入框 -->
        <div class="flex gap-2">
          <q-input
            v-model="sendData"
            :placeholder="sendFormat === 'hex' ? '例如: FF 00 01 02' : '输入文本内容'"
            outlined
            dense
            dark
            bg-color="rgba(16, 24, 40, 0.6)"
            class="flex-1"
            @keyup.enter="handleSendData"
          />
          <q-btn
            color="primary"
            label="发送"
            :loading="isSending"
            :disable="!sendData.trim() || !isConnectionAvailable"
            @click="handleSendData"
          >
            <template #loading>
              <q-spinner-dots />
            </template>
          </q-btn>
        </div>
      </div>
    </div>
  </div>
</template>
