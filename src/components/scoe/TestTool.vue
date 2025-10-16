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
                ? 'border-negative bg-red-900/20'
                : 'border-industrial'
            ]">
              <div class="text-industrial-secondary mb-1">
                {{ item.timestamp }}
                <span v-if="item.checksumValid === false" class="text-negative ml-2">
                  [校验失败]
                </span>
              </div>
              <div :class="[
                'font-mono break-all',
                item.checksumValid === false ? 'text-negative' : 'text-industrial-primary'
              ]">
                {{ item.data }}
              </div>
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
              <div class="text-industrial-primary font-mono break-all">{{ item.data }}</div>
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useScoeStore } from '../../stores/scoeStore';
import { useQuasar } from 'quasar';

const $q = useQuasar();
const scoeStore = useScoeStore();
const { sendDataList, receiveDataList, sendStopped, receiveStopped } = storeToRefs(scoeStore);

// 发送输入框内容
const sendInput = ref('');

// 发送数据
const handleSendData = () => {
  if (!sendInput.value.trim()) return;

  scoeStore.addSendData(sendInput.value.trim());
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
</script>
