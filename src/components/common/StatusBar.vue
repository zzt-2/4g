<template>
  <div class="status-bar">
    <div class="status-item connection-status">
      <q-icon
        :name="isConnected ? 'link' : 'link_off'"
        :color="isConnected ? 'positive' : 'negative'"
        size="16px"
      />
      <span>{{ isConnected ? '已连接' : '未连接' }}</span>
      <span v-if="isConnected && selectedPort" class="port-info">{{ selectedPort }}</span>
      <span v-if="isConnecting" class="connecting-text">
        <q-spinner color="primary" size="14px" />
        连接中...
      </span>
    </div>

    <div class="status-item tx-count">
      <q-icon name="arrow_upward" color="blue-5" size="16px" />
      <span>发送: {{ formatNumber(txCount) }} 字节</span>
    </div>

    <div class="status-item rx-count">
      <q-icon name="arrow_downward" color="teal-5" size="16px" />
      <span>接收: {{ formatNumber(rxCount) }} 字节</span>
    </div>

    <div class="status-item error-status" v-if="lastError">
      <q-icon name="error" color="negative" size="16px" />
      <span class="error-text">{{ lastError }}</span>
    </div>

    <div class="status-item spacer"></div>

    <div class="status-item app-version">
      <span>版本: {{ appVersion }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import { storeToRefs } from 'pinia';

// 从 Store 获取状态
const serialStore = useSerialStore();
const { isConnected, isConnecting, selectedPort, lastError } = storeToRefs(serialStore);

// 模拟的数据计数，实际应用中可能从 store 中获取
const txCount = ref(0);
const rxCount = ref(0);

// 假设的应用版本
const appVersion = ref('v1.0.0');

// 格式化数字，添加千分位分隔符
const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 在实际应用中，可以添加一个定时器来模拟数据传输
setInterval(() => {
  if (isConnected.value) {
    // 模拟数据传输，随机增加收发数据计数
    txCount.value += Math.floor(Math.random() * 10);
    rxCount.value += Math.floor(Math.random() * 20);
  }
}, 2000);
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  height: 28px;
  background-color: #1e1e1e;
  border-top: 1px solid #424242;
  padding: 0 12px;
  font-size: 0.8rem;
  color: #e0e0e0;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 16px;
}

.connection-status {
  border-right: 1px solid #424242;
  padding-right: 16px;
}

.port-info {
  color: #90caf9;
  margin-left: 4px;
}

.connecting-text {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #90caf9;
}

.error-text {
  color: #ef5350;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spacer {
  flex: 1;
  margin: 0;
}

.app-version {
  color: #9e9e9e;
  margin-right: 0;
}
</style>
