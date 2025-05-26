<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSerialStore } from '../../stores/serialStore';

// 新增props，接收要操作的端口路径
const props = defineProps<{
  portPath: string;
}>();

const serialStore = useSerialStore();

// 发送数据相关
const dataToSend = ref('');
const isHexMode = ref(false);
const isSending = ref(false);
const sendError = ref('');

// 回显选项
const showSentData = ref(true);
const autoScroll = ref(true);

// 计算当前端口是否已连接
const isConnected = computed(() => {
  return serialStore.isPortConnected(props.portPath);
});

// 计算当前端口的接收消息
const receivedMessages = computed(() => {
  return serialStore.getReceivedMessages(props.portPath) || [];
});

// 计算当前端口的发送消息
const sentMessages = computed(() => {
  return serialStore.getSentMessages(props.portPath) || [];
});

// 发送数据
const handleSend = async () => {
  if (!dataToSend.value.trim() || isSending.value) return;

  isSending.value = true;
  sendError.value = '';

  try {
    if (!isConnected.value) {
      throw new Error('串口未连接，请先连接串口');
    }

    const success = await serialStore.sendText(props.portPath, dataToSend.value, isHexMode.value);
    if (!success) {
      throw new Error('发送数据失败');
    }

    // 发送成功后清空数据
    dataToSend.value = '';
  } catch (err) {
    console.error('发送数据错误:', err);
    sendError.value = err instanceof Error ? err.message : '发送失败';
  } finally {
    isSending.value = false;
  }
};

// 清空接收缓冲区
const clearReceivedData = () => {
  serialStore.clearReceivedHistory(props.portPath);
};

// 清空发送记录
const clearSentData = () => {
  serialStore.clearSentHistory(props.portPath);
};

// 格式化二进制数据为十六进制字符串
const formatHex = (data: Uint8Array) => {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
};

// 格式化二进制数据为ASCII文本
const formatText = (data: Uint8Array) => {
  return Array.from(data)
    .map((byte) => {
      // 可打印ASCII字符范围 (32-126)
      if (byte >= 32 && byte <= 126) {
        return String.fromCharCode(byte);
      }
      return '.'; // 不可打印字符显示为点
    })
    .join('');
};

// 计算是否可以发送
const canSend = computed(() => {
  return isConnected.value && dataToSend.value.trim() !== '' && !isSending.value;
});

// 测试命令示例
const testCommands = [
  { label: '查询版本', value: '56455253494F4E', isHex: true },
  { label: '读取状态', value: '52454144', isHex: true },
  { label: '测试连接', value: 'AT', isHex: false },
  { label: '复位设备', value: '52455345540D0A', isHex: true },
];

// 使用预设命令
const useTestCommand = (command: { label: string; value: string; isHex: boolean }) => {
  dataToSend.value = command.value;
  isHexMode.value = command.isHex;
};

// 同步autoScroll到store
watch(autoScroll, (val) => {
  serialStore.autoScroll = val;
});

// 初始化同步store的autoScroll到本地
autoScroll.value = serialStore.autoScroll;
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="bg-industrial-panel rounded-lg p-3 border border-industrial flex-1 flex flex-col">
      <!-- 配置项 -->
      <div class="flex mb-3">
        <q-toggle v-model="isHexMode" label="HEX模式" color="blue-5" class="mr-4" />
        <q-toggle v-model="showSentData" label="显示发送数据" color="blue-5" class="mr-4" />
        <q-toggle v-model="autoScroll" label="自动滚动" color="blue-5" />
      </div>

      <!-- 错误提示 -->
      <div class="text-red-500 text-xs mb-2" v-if="sendError">{{ sendError }}</div>

      <!-- 将数据监控区域改为flex-1以占满剩余空间 -->
      <div class="flex-1 flex flex-col min-h-0">
        <!-- 数据监控面板区域 - 左右分栏 -->
        <div class="grid grid-cols-2 gap-3 flex-1 mb-3">
          <!-- 接收数据区域 -->
          <div class="flex flex-col h-full">
            <div class="text-xs text-industrial-accent mb-1 flex justify-between">
              <span>接收数据</span>
              <div class="flex items-center">
                <span class="text-xs text-industrial-secondary mr-2">
                  {{ serialStore.portReceivedBytes(props.portPath) }} 字节
                </span>
                <q-btn
                  flat
                  dense
                  size="xs"
                  color="blue-grey"
                  label="清空"
                  class="text-xs"
                  @click="clearReceivedData"
                />
              </div>
            </div>
            <div
              class="flex-1 overflow-auto bg-industrial-table-header rounded border border-industrial p-2 font-mono text-xs max-h-[50vh]"
            >
              <div v-for="message in receivedMessages" :key="message.id" class="mb-1">
                <span class="text-green-500">&gt;&gt; </span>
                <span class="text-industrial-secondary">
                  {{ new Date(message.timestamp).toLocaleTimeString() }}:
                </span>
                <span class="text-green-300">{{ formatHex(message.data) }}</span>
                <span class="text-industrial-tertiary ml-2">[{{ formatText(message.data) }}]</span>
              </div>
            </div>
          </div>

          <!-- 发送数据区域 -->
          <div class="flex flex-col h-full">
            <div class="text-xs text-industrial-accent mb-1 flex justify-between">
              <span>发送数据</span>
              <div class="flex items-center">
                <span class="text-xs text-industrial-secondary mr-2">
                  {{ serialStore.portSentBytes(props.portPath) }} 字节
                </span>
                <q-btn
                  flat
                  dense
                  size="xs"
                  color="blue-grey"
                  label="清空"
                  class="text-xs"
                  @click="clearSentData"
                />
              </div>
            </div>
            <div
              class="flex-1 overflow-auto bg-industrial-table-header rounded border border-industrial p-2 font-mono text-xs max-h-[50vh]"
            >
              <div
                v-if="showSentData"
                v-for="message in sentMessages"
                :key="message.id"
                class="mb-1"
              >
                <span class="text-blue-500">&lt;&lt; </span>
                <span class="text-industrial-secondary">
                  {{ new Date(message.timestamp).toLocaleTimeString() }}:
                </span>
                <span class="text-blue-300">{{ formatHex(message.data) }}</span>
                <span class="text-industrial-tertiary ml-2">[{{ formatText(message.data) }}]</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 发送控制区域 -->
        <div>
          <!-- 输入框与发送按钮 -->
          <div class="flex mb-3">
            <q-input
              v-model="dataToSend"
              outlined
              dense
              dark
              placeholder="输入要发送的数据..."
              bg-color="rgba(16, 24, 40, 0.6)"
              class="flex-1 mr-2"
              :disable="!isConnected"
              @keyup.enter="handleSend"
            />

            <q-btn
              color="primary"
              icon="send"
              label="发送"
              :disable="!canSend"
              :loading="isSending"
              @click="handleSend"
            >
              <template #loading>
                <q-spinner-dots />
              </template>
            </q-btn>
          </div>

          <!-- 快捷测试命令 -->
          <div>
            <div class="text-xs text-industrial-secondary mb-2">快捷测试命令:</div>
            <div class="flex flex-wrap gap-2">
              <q-btn
                v-for="command in testCommands"
                :key="command.label"
                color="blue-grey"
                :label="command.label"
                size="sm"
                outline
                class="text-xs"
                :disable="!isConnected"
                @click="useTestCommand(command)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
