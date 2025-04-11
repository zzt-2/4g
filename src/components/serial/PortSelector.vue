<template>
  <div class="port-selector">
    <div class="selector-header">
      <div class="title">串口设置</div>
      <q-btn
        icon="refresh"
        flat
        round
        size="sm"
        :loading="isLoading"
        :disable="isConnected"
        @click="refreshPorts"
      />
    </div>

    <div class="selector-body">
      <div class="selector-row">
        <div class="label">端口</div>
        <q-select
          v-model="selectedPort"
          :options="availablePorts"
          option-label="path"
          option-value="path"
          emit-value
          map-options
          :disable="isConnected"
          placeholder="选择串口"
          outlined
          dense
          class="selector-control"
        />
      </div>

      <div class="selector-row">
        <div class="label">波特率</div>
        <q-select
          v-model="baudRate"
          :options="baudRateOptions"
          :disable="isConnected"
          outlined
          dense
          class="selector-control"
        />
      </div>

      <div class="selector-row">
        <div class="label">数据位</div>
        <q-select
          v-model="dataBits"
          :options="dataBitsOptions"
          :disable="isConnected"
          outlined
          dense
          class="selector-control"
        />
      </div>

      <div class="selector-row">
        <div class="label">校验位</div>
        <q-select
          v-model="parity"
          :options="parityOptions"
          :disable="isConnected"
          outlined
          dense
          class="selector-control"
        />
      </div>

      <div class="selector-row">
        <div class="label">停止位</div>
        <q-select
          v-model="stopBits"
          :options="stopBitsOptions"
          :disable="isConnected"
          outlined
          dense
          class="selector-control"
        />
      </div>

      <div class="selector-row">
        <div class="label">流控制</div>
        <q-select
          v-model="flowControl"
          :options="flowControlOptions"
          :disable="isConnected"
          outlined
          dense
          class="selector-control"
        />
      </div>
    </div>

    <div class="selector-footer">
      <q-btn
        :label="isConnected ? '断开连接' : '连接'"
        :color="isConnected ? 'negative' : 'primary'"
        :icon="isConnected ? 'link_off' : 'link'"
        :loading="connectLoading"
        @click="toggleConnection"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSerialPort } from '../../composables/serial/useSerialPort';

// 从组合式API获取状态和方法
const {
  availablePorts,
  selectedPort,
  baudRate,
  dataBits,
  parity,
  stopBits,
  flowControl,
  isConnected,
  isLoading,
  connectLoading,
  refreshPorts,
  connect,
  disconnect,
} = useSerialPort();

// 波特率选项
const baudRateOptions = [
  110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
];

// 数据位选项
const dataBitsOptions = [5, 6, 7, 8];

// 校验位选项
const parityOptions = [
  { label: '无', value: 'none' },
  { label: '奇校验', value: 'odd' },
  { label: '偶校验', value: 'even' },
  { label: '标记', value: 'mark' },
  { label: '空格', value: 'space' },
];

// 停止位选项
const stopBitsOptions = [
  { label: '1', value: 1 },
  { label: '1.5', value: 1.5 },
  { label: '2', value: 2 },
];

// 流控制选项
const flowControlOptions = [
  { label: '无', value: 'none' },
  { label: '硬件', value: 'hardware' },
  { label: '软件', value: 'software' },
];

// 切换连接状态
const toggleConnection = async () => {
  if (isConnected.value) {
    await disconnect();
  } else {
    await connect();
  }
};
</script>

<style scoped>
.port-selector {
  display: flex;
  flex-direction: column;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.selector-header {
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

.selector-body {
  padding: 16px;
}

.selector-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.selector-row:last-child {
  margin-bottom: 0;
}

.label {
  width: 80px;
  font-size: 14px;
  color: #555;
}

.selector-control {
  flex: 1;
}

.selector-footer {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
}
</style>
