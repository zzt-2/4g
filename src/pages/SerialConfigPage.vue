<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSerialStore } from '../stores/serialStore';
import SerialPortList from '../components/serial/SerialPortList.vue';
import SerialContentPanel from '../components/serial/SerialContentPanel.vue';

const serialStore = useSerialStore();

// 布局相关
const layoutReady = ref(false);

// 右侧面板内容模式: 'config' | 'test'
const contentMode = ref<'config' | 'test'>('config');

// 切换右侧面板内容模式
const toggleContentMode = (mode: 'config' | 'test') => {
  contentMode.value = mode;
};

// 刷新串口列表
const refreshPorts = () => {
  serialStore.refreshPorts(true);
};

onMounted(async () => {
  // 确保布局计算完成
  setTimeout(() => {
    layoutReady.value = true;
  }, 50);
});
</script>

<template>
  <q-page class="p-4 h-full overflow-hidden bg-industrial-primary">
    <div class="grid grid-cols-[300px_1fr] h-full gap-4">
      <!-- 左侧串口列表面板 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-industrial bg-industrial-panel shadow-lg"
      >
        <div
          class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-table-header"
        >
          <h6
            class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
          >
            <q-icon name="usb" size="xs" class="mr-1 text-blue-5" />
            串口设备
          </h6>
          <q-btn
            flat
            round
            size="sm"
            color="grey"
            icon="refresh"
            class="text-industrial-accent hover:bg-industrial-highlight"
            :loading="serialStore.isLoading"
            @click="refreshPorts"
          >
            <q-tooltip>刷新串口列表</q-tooltip>
          </q-btn>
        </div>
        <div class="flex-1 overflow-auto p-3">
          <SerialPortList />
        </div>
      </div>

      <!-- 右侧内容面板 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-industrial bg-industrial-panel shadow-lg"
        :class="{ invisible: !layoutReady, visible: layoutReady }"
      >
        <div
          class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-table-header"
        >
          <h6
            class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
          >
            <q-icon
              :name="contentMode === 'config' ? 'settings' : 'build'"
              size="xs"
              class="mr-1 text-blue-5"
            />
            {{ contentMode === 'config' ? '串口配置' : '测试工具' }}
          </h6>
          <div class="flex">
            <q-btn
              flat
              dense
              size="sm"
              :color="contentMode === 'config' ? 'blue' : 'grey'"
              label="配置"
              class="text-xs mr-2"
              @click="toggleContentMode('config')"
            />
            <q-btn
              flat
              dense
              size="sm"
              :color="contentMode === 'test' ? 'blue' : 'grey'"
              label="测试"
              class="text-xs"
              @click="toggleContentMode('test')"
            />
          </div>
        </div>
        <div class="flex-1 overflow-auto p-3">
          <SerialContentPanel :mode="contentMode" />
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <q-inner-loading :showing="serialStore.isLoading">
      <q-spinner-gears size="50px" color="primary" />
    </q-inner-loading>
  </q-page>
</template>

<style>
/* 使用UnoCSS，移除SCSS样式 */
.invisible {
  visibility: hidden;
}
.visible {
  visibility: visible;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
