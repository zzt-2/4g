<script setup lang="ts">
import NetworkConnectionList from './NetworkConnectionList.vue';
import SerialPortList from './SerialPortList.vue';
import { useNetworkStore } from '../../stores/netWorkStore';
import { useSerialStore } from '../../stores/serialStore';

const networkStore = useNetworkStore();
const serialStore = useSerialStore();

// 刷新所有连接
const refreshAllConnections = () => {
  networkStore.refreshConnections();
  serialStore.refreshPorts(true);
};
</script>

<template>
  <div class="flex flex-col no-wrap h-full max-w-[25vw] bg-industrial-panel">
    <!-- 网络连接部分 -->
    <div class="mb-4">
      <div
        class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-secondary"
      >
        <h6
          class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
        >
          <q-icon name="wifi" size="xs" class="mr-1 text-industrial-accent" />
          网络连接
        </h6>
        <q-btn
          flat
          round
          size="sm"
          icon="refresh"
          class="text-industrial-secondary hover:text-industrial-primary hover:bg-industrial-highlight"
          :loading="Object.values(networkStore.isConnecting).some((connecting) => connecting)"
          @click="networkStore.refreshConnections"
        >
          <q-tooltip class="bg-industrial-panel text-industrial-primary">刷新网络连接</q-tooltip>
        </q-btn>
      </div>
      <div class="p-3 max-h-64 overflow-auto bg-industrial-panel">
        <NetworkConnectionList />
      </div>
    </div>

    <!-- 串口连接部分 -->
    <div class="flex-1 flex flex-col max-h-[70vh]">
      <div
        class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-secondary"
      >
        <h6
          class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
        >
          <q-icon name="usb" size="xs" class="mr-1 text-industrial-accent" />
          串口设备
        </h6>
        <q-btn
          flat
          round
          size="sm"
          icon="refresh"
          class="text-industrial-secondary hover:text-industrial-primary hover:bg-industrial-highlight"
          :loading="serialStore.isLoading"
          @click="serialStore.refreshPorts(true)"
        >
          <q-tooltip class="bg-industrial-panel text-industrial-primary">刷新串口列表</q-tooltip>
        </q-btn>
      </div>
      <div class="flex-1 overflow-auto p-3 bg-industrial-panel">
        <SerialPortList />
      </div>
    </div>

    <!-- 全局刷新按钮 -->
    <div class="mt-3 pt-3 border-t border-industrial bg-industrial-panel">
      <q-btn
        label="刷新所有连接"
        class="w-full btn-industrial-primary"
        outline
        :loading="serialStore.isLoading"
        @click="refreshAllConnections"
      >
        <template #loading>
          <q-spinner-dots class="text-industrial-accent" />
        </template>
      </q-btn>
    </div>
  </div>
</template>
