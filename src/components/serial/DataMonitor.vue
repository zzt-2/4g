<template>
  <div class="flex flex-col h-full bg-dark rounded-md overflow-hidden">
    <!-- 监控头部 -->
    <div class="flex justify-between items-center p-3 bg-dark-2 border-b border-dark-3">
      <div class="text-base font-medium">数据监控</div>
      <div class="flex gap-1">
        <q-btn
          flat
          round
          dense
          icon="delete"
          color="red-5"
          :disable="monitorData.length === 0"
          @click="clearMonitorData"
        >
          <q-tooltip>清除数据</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          icon="save"
          color="blue-5"
          :disable="monitorData.length === 0"
          @click="saveData"
        >
          <q-tooltip>保存数据</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          :icon="autoScrollEnabled ? 'vertical_align_bottom' : 'vertical_align_center'"
          :color="autoScrollEnabled ? 'green-5' : 'grey-7'"
          @click="toggleAutoScroll"
        >
          <q-tooltip>{{ autoScrollEnabled ? '自动滚动已启用' : '自动滚动已禁用' }}</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- 监控主体 -->
    <div class="flex-1 overflow-y-auto p-2 text-sm" ref="monitorBodyRef">
      <template v-if="monitorData.length > 0">
        <div
          v-for="(item, index) in monitorData"
          :key="`${index}-${item.timestamp}`"
          class="flex mb-1 items-start"
          :class="{
            'bg-blue-900/15 border-l-2 border-blue-600': item.direction === 'rx',
            'bg-teal-900/15 border-l-2 border-teal-600': item.direction === 'tx',
          }"
        >
          <div v-if="showTimestamp" class="text-xs text-gray-400 w-28 shrink-0 mr-2">
            {{ formatTime(item.timestamp) }}
          </div>
          <div
            class="w-10 text-center shrink-0 mr-2"
            :class="{
              'text-blue-500': item.direction === 'rx',
              'text-teal-500': item.direction === 'tx',
            }"
          >
            {{ item.direction === 'rx' ? '接收' : '发送' }}
          </div>
          <div class="break-all">{{ getDisplayData(item) }}</div>
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col items-center justify-center h-full text-gray-500">
          <q-icon name="inbox" size="48px" class="mb-3" />
          <div>暂无数据</div>
        </div>
      </template>
    </div>

    <!-- 发送面板 -->
    <div class="bg-dark-2 border-t border-dark-3 p-3">
      <div class="flex justify-between items-center mb-2">
        <div class="flex gap-2">
          <q-radio v-model="sendMode" val="text" label="文本" dense color="primary" />
          <q-radio v-model="sendMode" val="hex" label="十六进制" dense color="primary" />
          <q-radio v-model="sendMode" val="command" label="指令" dense color="primary" />
        </div>
        <div class="flex gap-3 items-center">
          <q-checkbox v-model="appendNewLine" label="追加换行" dense color="teal-5" />
          <q-checkbox v-model="sendWithInterval" label="定时发送" dense color="teal-5" />
          <q-input
            v-if="sendWithInterval"
            v-model.number="sendInterval"
            type="number"
            dense
            min="100"
            suffix="ms"
            class="w-24"
          />
        </div>
      </div>
      <div class="mb-2">
        <q-input
          v-model="dataToSend"
          :type="sendMode === 'hex' ? 'text' : 'textarea'"
          bordered
          dense
          :hint="sendMode === 'hex' ? '使用空格分隔字节, 如: FF 01 03' : ''"
          :placeholder="sendModePlaceholder"
          autogrow
          clearable
          @keydown.ctrl.enter="sendData"
        />
      </div>
      <div class="flex justify-end">
        <q-btn
          :label="sendWithInterval && isSending ? '停止' : '发送'"
          color="primary"
          :icon="sendWithInterval && isSending ? 'stop' : 'send'"
          :loading="isLoadingSend"
          @click="sendData"
          :disable="!isConnected || !dataToSend"
        />
      </div>
    </div>

    <!-- 显示设置 -->
    <div class="flex justify-between p-2 bg-dark-3 border-t border-dark-4">
      <div class="flex items-center">
        <span class="text-sm text-gray-400 mr-2">显示模式</span>
        <q-btn-toggle
          v-model="displayMode"
          :options="[
            { label: 'HEX', value: 'hex' },
            { label: 'ASCII', value: 'ascii' },
            { label: 'UTF8', value: 'utf8' },
          ]"
          dense
          unelevated
          class="ml-2"
        />
      </div>

      <div class="flex items-center">
        <q-checkbox v-model="showTimestamp" label="显示时间戳" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useSerialData, type MonitorDataItem } from '../../composables/serial/useSerialData';
import { formatTimestamp } from '../../utils/dateUtils';

// 引用
const monitorBodyRef = ref<HTMLElement | null>(null);

// 从组合式API获取数据和方法
const { monitorData, isConnected, clearMonitorData, saveMonitorData, sendDataToPort } =
  useSerialData();

// 显示设置
const displayMode = ref<'hex' | 'ascii' | 'utf8'>('hex');
const showTimestamp = ref(true);
const autoScrollEnabled = ref(true);

// 发送设置
const sendMode = ref<'text' | 'hex' | 'command'>('text');
const dataToSend = ref('');
const isLoadingSend = ref(false);
const appendNewLine = ref(true);
const sendWithInterval = ref(false);
const sendInterval = ref(1000);
const isSending = ref(false);
let sendIntervalId: number | null = null;

// 发送模式选项
const sendModeOptions = [
  { label: '文本', value: 'text' },
  { label: '十六进制', value: 'hex' },
  { label: '命令', value: 'command' },
];

// 计算属性：占位符文本
const sendModePlaceholder = computed(() => {
  switch (sendMode.value) {
    case 'text':
      return '输入要发送的文本内容';
    case 'hex':
      return '输入要发送的十六进制数据，如: FF 01 03';
    case 'command':
      return '输入要发送的指令';
    default:
      return '';
  }
});

// 显示数据
const getDisplayData = (item: MonitorDataItem) => {
  switch (displayMode.value) {
    case 'hex':
      return item.hexData;
    case 'ascii':
      return item.asciiData;
    case 'utf8':
      return item.utf8Data;
    default:
      return item.hexData;
  }
};

// 格式化时间戳
const formatTime = (timestamp: number) => {
  return formatTimestamp(timestamp);
};

// 清除数据
const clearData = () => {
  clearMonitorData();
};

// 保存数据
const saveData = () => {
  if (monitorData.value.length === 0) return;

  const mode = sendMode.value === 'text' ? 'utf8' : 'hex';
  saveMonitorData(mode);
};

// 切换自动滚动
const toggleAutoScroll = () => {
  autoScrollEnabled.value = !autoScrollEnabled.value;
};

// 发送数据到串口
const sendData = () => {
  if (!dataToSend.value || !isConnected.value) return;

  if (sendWithInterval.value) {
    if (isSending.value) {
      // 停止发送
      if (sendIntervalId !== null) {
        window.clearInterval(sendIntervalId);
        sendIntervalId = null;
      }
      isSending.value = false;
    } else {
      // 开始发送
      isSending.value = true;
      performSend();
      sendIntervalId = window.setInterval(() => {
        performSend();
      }, sendInterval.value);
    }
  } else {
    // 一次性发送
    performSend();
  }
};

const performSend = async () => {
  try {
    isLoadingSend.value = true;
    let data = dataToSend.value;

    // 追加换行
    if (appendNewLine.value && sendMode.value === 'text') {
      data += '\r\n';
    }

    // 发送数据
    await sendDataToPort(data, sendMode.value === 'hex');
  } finally {
    isLoadingSend.value = false;
  }
};

// 监听数据变化并滚动到底部
watch(
  () => monitorData.value.length,
  () => {
    if (autoScrollEnabled.value) {
      nextTick(() => {
        if (monitorBodyRef.value) {
          monitorBodyRef.value.scrollTop = monitorBodyRef.value.scrollHeight;
        }
      });
    }
  },
);

// 组件挂载时
onMounted(() => {
  // 初始化滚动
  nextTick(() => {
    if (monitorBodyRef.value) {
      monitorBodyRef.value.scrollTop = monitorBodyRef.value.scrollHeight;
    }
  });
});

onBeforeUnmount(() => {
  // 清除定时器
  if (sendIntervalId !== null) {
    window.clearInterval(sendIntervalId);
    sendIntervalId = null;
  }
});
</script>

<style scoped>
.data-monitor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.title {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.actions {
  display: flex;
  gap: 4px;
}

.monitor-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.data-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Consolas', monospace;
  font-size: 14px;
  background-color: #f8f9fa;
}

.data-content.hex-mode {
  word-spacing: 5px;
}

.data-item {
  display: flex;
  margin-bottom: 4px;
  align-items: flex-start;
}

.timestamp {
  flex-shrink: 0;
  color: #666;
  margin-right: 8px;
  font-size: 12px;
  width: 100px;
}

.direction {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  font-weight: bold;
  margin-right: 8px;
}

.direction.rx {
  color: #1976d2;
}

.direction.tx {
  color: #c62828;
}

.data {
  word-break: break-all;
  flex: 1;
}

.send-panel {
  border-top: 1px solid #e0e0e0;
  padding: 12px;
  background-color: #f5f5f5;
}

.send-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.send-modes {
  display: flex;
  gap: 8px;
}

.send-options {
  display: flex;
  gap: 12px;
}

.send-content {
  margin-bottom: 8px;
}

.send-footer {
  display: flex;
  justify-content: flex-end;
}

.display-settings {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #f0f0f0;
  border-top: 1px solid #e0e0e0;
}

.setting-item {
  display: flex;
  align-items: center;
}

.setting-label {
  font-size: 14px;
  color: #555;
}

.empty-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #757575;
}

.empty-icon {
  margin-bottom: 12px;
}

.empty-text {
  margin-top: 12px;
}
</style>
