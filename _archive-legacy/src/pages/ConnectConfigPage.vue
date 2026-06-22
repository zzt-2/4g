<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSerialStore } from '../stores/serialStore';
import ConnectionList from '../components/connect/ConnectionList.vue';
import ConnectionContentPanel from '../components/connect/ConnectionContentPanel.vue';

const serialStore = useSerialStore();

// 布局相关
const layoutReady = ref(false);

// 右侧面板内容模式: 'network' | 'serial' | 'test'
const contentMode = ref<'network' | 'serial' | 'test'>('network');

// 切换右侧面板内容模式
const toggleContentMode = (mode: 'network' | 'serial' | 'test') => {
  contentMode.value = mode;
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
    <div class="grid grid-cols-[24vw_1fr] h-full gap-2">
      <!-- 左侧连接列表面板 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg">
        <div class="flex-1 overflow-auto">
          <ConnectionList />
        </div>
      </div>

      <!-- 右侧内容面板 -->
      <div
        class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg"
        :class="{ invisible: !layoutReady, visible: layoutReady }">
        <div class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-table-header">
          <h6 class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center">
            <q-icon :name="contentMode === 'network' ? 'wifi' : contentMode === 'serial' ? 'usb' : 'build'
              " size="xs" class="mr-1 text-blue-5" />
            {{
              contentMode === 'network'
                ? '网口配置'
                : contentMode === 'serial'
                  ? '串口配置'
                  : '测试工具'
            }}
          </h6>
          <div class="flex">
            <q-btn flat dense size="sm" :color="contentMode === 'network' ? 'blue' : 'grey'" label="网口配置"
              class="text-xs mr-2" @click="toggleContentMode('network')" />
            <q-btn flat dense size="sm" :color="contentMode === 'serial' ? 'blue' : 'grey'" label="串口配置"
              class="text-xs mr-2" @click="toggleContentMode('serial')" />
            <q-btn flat dense size="sm" :color="contentMode === 'test' ? 'blue' : 'grey'" label="测试" class="text-xs"
              @click="toggleContentMode('test')" />
          </div>
        </div>
        <div class="flex-1 overflow-auto p-3">
          <ConnectionContentPanel :mode="contentMode" />
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
