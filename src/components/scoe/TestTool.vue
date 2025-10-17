<template>
  <div class="flex flex-col gap-3 h-full">
    <div class="flex-1 flex gap-2 min-h-0">
      <!-- 左侧：接收区 -->
      <div class="flex-1 flex flex-col no-wrap h-full border border-industrial rounded">
        <!-- 接收标题和操作 -->
        <div class="flex items-center justify-between p-1 border-b border-industrial">
          <h4 class="flex items-center m-2 text-industrial-primary text-sm font-medium">
            <q-icon name="download" class="mt-1 mr-2" />
            接收数据
          </h4>
          <div class="flex gap-2">
            <q-btn size="sm" icon="settings" flat round dense @click="handleOpenHighlightConfig('receive')" />
            <q-btn size="sm" :class="receiveStopped ? 'btn-industrial-primary' : 'btn-industrial-danger'"
              @click="handleToggleReceive">
              <q-icon :name="receiveStopped ? 'play_arrow' : 'pause'" class="mr-1" />
              {{ receiveStopped ? '开始' : '停止' }}
            </q-btn>
            <q-btn size="sm" class="btn-industrial-secondary" @click="handleClearReceiveData">
              <q-icon name="clear" class="mr-1" />
              清空
            </q-btn>
          </div>
        </div>

        <!-- 接收记录列表 -->
        <div class="flex-1 flex flex-col no-wrap min-h-0 overflow-y-auto bg-industrial-panel p-2">
          <div v-if="receiveDataList.length === 0"
            class="flex items-center justify-center h-full text-industrial-tertiary">
            暂无接收记录
          </div>
          <template v-else>
            <div v-for="(item, index) in receiveDataList" :key="index" :class="[
              'p-1 border border-dashed rounded text-xs',
              item.checksumValid === false
                ? 'border-negative'
                : 'border-industrial'
            ]">
              <div class="text-industrial-secondary mb-1">
                {{ item.timestamp }}
                <span v-if="item.checksumValid === false" class="text-negative ml-2">
                  [{{ item.failedReason }}]
                </span>
              </div>
              <div class="font-mono break-all leading-relaxed text-industrial-primary"><span
                  v-for="(segment, segIndex) in item.segments" :key="segIndex"
                  :style="segment.highlight && segment.color ? { backgroundColor: segment.color } : {}">{{ segment.text
                  }}<q-tooltip v-if="segment.highlight && segment.color" :offset="[0, 8]">{{ segment.label
                  }}</q-tooltip></span></div>
            </div>
          </template>
        </div>
      </div>

      <q-separator vertical class="h-full w-1px bg-gray-700" />

      <!-- 右侧：发送区 -->
      <div class="flex-1 flex flex-col no-wrap h-full border border-industrial rounded">
        <!-- 发送标题和操作 -->
        <div class="flex items-center justify-between p-1 border-b border-industrial">
          <h4 class="flex items-center m-2 text-industrial-primary text-sm font-medium">
            <q-icon name="upload" class="mt-1 mr-2" />
            发送数据
          </h4>
          <div class="flex gap-2">
            <q-btn size="sm" icon="settings" flat round dense @click="handleOpenHighlightConfig('send')" />
            <q-btn size="sm" :class="sendStopped ? 'btn-industrial-primary' : 'btn-industrial-danger'"
              @click="handleToggleSend">
              <q-icon :name="sendStopped ? 'play_arrow' : 'pause'" class="mr-1" />
              {{ sendStopped ? '开始' : '停止' }}
            </q-btn>
            <q-btn size="sm" class="btn-industrial-secondary" @click="handleClearSendData">
              <q-icon name="clear" class="mr-1" />
              清空
            </q-btn>
          </div>
        </div>

        <!-- 发送记录列表 -->
        <div class="flex-1 flex flex-col no-wrap min-h-0 overflow-y-auto bg-industrial-panel p-2">
          <div v-if="sendDataList.length === 0"
            class="flex items-center justify-center h-full text-industrial-tertiary">
            暂无发送记录
          </div>
          <template v-else>
            <div v-for="(item, index) in sendDataList" :key="index"
              class="p-1 border border-dashed border-industrial rounded text-xs">
              <div class="text-industrial-secondary mb-1">{{ item.timestamp }}</div>
              <div class="text-industrial-primary font-mono break-all leading-relaxed"><span
                  v-for="(segment, segIndex) in item.segments" :key="segIndex"
                  :style="segment.highlight && segment.color ? { backgroundColor: segment.color } : {}">{{ segment.text
                  }}<q-tooltip v-if="segment.highlight && segment.color" :offset="[0, 8]">{{ segment.label
                  }}</q-tooltip></span></div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <!-- 发送输入框 -->
    <div class="w-full flex p-3 gap-6">
      <div class="flex justify-between gap-6 h-0">
        <q-input v-model="maxRecordLines" label="最大记录行数" outlined dense />
        <q-btn label="确定" size="md" class="btn-industrial-secondary w-16" color="primary" outlined dense
          @click="handleMaxRecordLines" />
      </div>
      <q-input v-model="sendInput" dense outlined bg-color="industrial-panel" class="flex-1"
        input-class="text-industrial-primary text-sm" placeholder="输入要发送的数据（HEX格式）" @keyup.enter="handleSendData" />
      <q-btn size="sm" class="btn-industrial-primary" :disable="!sendInput" @click="handleSendData">
        <q-icon name="send" class="mr-1" />
        发送
      </q-btn>
    </div>

    <!-- 高亮配置弹窗 -->
    <HighlightConfigDialog ref="highlightConfigDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useScoeStore } from '../../stores/scoeStore';
import { useQuasar } from 'quasar';
import HighlightConfigDialog from './HighlightConfigDialog.vue';
import { useConnectionTargetsStore } from '../../stores/connectionTargetsStore';
import { useUnifiedSender } from '../../composables/frames/sendFrame/useUnifiedSender';

const $q = useQuasar();
const scoeStore = useScoeStore();
const connectionTargetsStore = useConnectionTargetsStore();
const { sendDataList, receiveDataList, sendStopped, receiveStopped } = storeToRefs(scoeStore);
const { sendToNetwork } = useUnifiedSender();

// 发送输入框内容
const sendInput = ref('');

// 高亮配置弹窗引用
const highlightConfigDialogRef = ref<InstanceType<typeof HighlightConfigDialog> | null>(null);

// 发送数据
const handleSendData = async () => {
  if (!sendInput.value.trim()) return;

  const targetId = 'network:scoe-udp:scoe-udp-remote';

  // 确保十六进制字符串长度为偶数
  const paddedHex = sendInput.value.trim().length % 2 ? sendInput.value.trim() + '0' : sendInput.value.trim();

  // 计算要写入的字节数
  const bytesCount = paddedHex.length / 2;

  const data = new Uint8Array(bytesCount);
  let newOffset = 0;
  // 将十六进制字符串转换为字节并写入
  for (let i = 0; i < bytesCount; i++) {
    const byteValue = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
    data[newOffset++] = byteValue;
  }

  const targetPath = connectionTargetsStore.getValidatedTargetPath(targetId);

  if (targetPath) {
    const parts = targetPath.split(':');
    const connectionId = parts[0];
    const targetHost = parts[1] + ':' + parts[2];
    if (connectionId && targetHost) {
      const result = await sendToNetwork(connectionId, data, targetId, targetHost);
      if (result.success) {
        scoeStore.addSendData(sendInput.value.trim(), false);
      }
    }
  }
};

// 清空发送记录
const handleClearSendData = () => {
  sendDataList.value = [];
};

// 清空接收记录
const handleClearReceiveData = () => {
  receiveDataList.value = [];
};

// 最大记录行数
const maxRecordLines = ref(scoeStore.maxRecordLines)

// 设置最大记录行数
const handleMaxRecordLines = () => {
  const lines = parseInt(maxRecordLines.value.toString())
  if (!isNaN(lines)) {
    scoeStore.setMaxRecordLines(lines)
    $q.notify({
      type: 'positive',
      message: `最大记录行数已设置为 ${lines}`,
      position: 'top-right'
    })
  }
}

// 切换发送状态
const handleToggleSend = () => {
  sendStopped.value = !sendStopped.value
  $q.notify({
    type: 'info',
    message: sendStopped.value ? '发送记录已停止' : '发送记录已开始',
    position: 'top-right'
  })
}

// 切换接收状态
const handleToggleReceive = () => {
  receiveStopped.value = !receiveStopped.value
  $q.notify({
    type: 'info',
    message: receiveStopped.value ? '接收记录已停止' : '接收记录已开始',
    position: 'top-right'
  })
}

// 打开高亮配置弹窗
const handleOpenHighlightConfig = (type: 'send' | 'receive') => {
  if (highlightConfigDialogRef.value) {
    highlightConfigDialogRef.value.open(type)
  }
}
</script>
