<script setup lang="ts">
import { defineProps, computed, watch } from 'vue';
import { useSerialStore } from '../../stores/serialStore';
import SerialOptionsForm from './SerialOptionsForm.vue';
import SerialTestTools from './SerialTestTools.vue';
import { useStorage } from '@vueuse/core';
defineProps<{
  // 面板显示模式：'config' | 'test'
  mode: 'config' | 'test';
}>();

const serialStore = useSerialStore();

// 选中的串口路径
const selectedPort = useStorage<string>('selected-serial-port-test', '');

// 计算可用串口列表（包括连接和未连接的）
const availablePorts = computed(() => {
  const ports = serialStore.availablePorts
    .map((port) => port.path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
  return ports;
});

// 当没有选中串口但有可用串口时，自动选择第一个
if (!selectedPort.value && availablePorts.value.length > 0) {
  // 使用非空断言，因为我们已经检查了数组长度
  selectedPort.value = availablePorts.value[0]!;
}

// 监听availablePorts变化，自动选择第一个
watch(availablePorts, (newPorts) => {
  if (!selectedPort.value && newPorts.length > 0) {
    // 使用非空断言，因为我们已经检查了数组长度
    selectedPort.value = newPorts[0]!;
  } else if (newPorts.length === 0) {
    selectedPort.value = '';
  }
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 串口选择 -->
    <div class="mb-3">
      <q-select
        v-model="selectedPort"
        :options="availablePorts"
        label="选择串口"
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
            <q-icon
              v-if="serialStore.isPortConnected(selectedPort)"
              name="check_circle"
              color="green"
              class="ml-1"
              size="xs"
            />
          </div>
        </template>
      </q-select>
    </div>

    <!-- 根据mode属性和是否有选中的串口动态切换显示内容 -->
    <div
      v-if="!selectedPort"
      class="flex-1 flex items-center justify-center text-industrial-secondary"
    >
      <div class="text-center">
        <q-icon name="usb_off" size="lg" class="text-industrial-tertiary mb-2" />
        <div>未选择串口设备</div>
        <div class="text-sm mt-1">请先选择一个串口设备</div>
      </div>
    </div>
    <transition v-else name="fade" mode="out-in">
      <SerialOptionsForm v-if="mode === 'config'" class="flex-1" :port-path="selectedPort" />
      <SerialTestTools v-else class="flex-1" :port-path="selectedPort" />
    </transition>
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
