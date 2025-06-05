<script setup lang="ts">
import { onMounted } from 'vue';
import type { ContentMode } from '../types/frames/receive';
import { useReceiveFramesStore } from '../stores/frames/receiveFramesStore';
// 组件导入
import ReceiveFrameSelector from '../components/frames/receive/ReceiveFrameSelector.vue';
import DataItemList from '../components/frames/receive/DataItemList.vue';
import DataGroupManager from '../components/frames/receive/DataGroupManager.vue';
import FrameStatsPanel from '../components/frames/receive/FrameStatsPanel.vue';
// import FrameMappingConfig from '../components/frames/receive/FrameMappingConfig.vue';
import DataDisplayContainer from '../components/frames/receive/DataDisplay/DataDisplayContainer.vue';
import { useStorage } from '@vueuse/core';

// 状态管理 - 保持模式状态
const contentMode = useStorage<ContentMode>('contentMode', 'edit');

// Store
const receiveFramesStore = useReceiveFramesStore();

// 方法：切换内容模式
const toggleContentMode = (mode: ContentMode): void => {
  contentMode.value = mode;
};

onMounted(() => {
  receiveFramesStore.loadConfig();
});
</script>

<template>
  <q-page class="p-4 h-full overflow-hidden bg-industrial-primary flex flex-col">
    <!-- 编辑模式：三栏布局 -->
    <template v-if="contentMode === 'edit'">
      <div class="grid grid-cols-[240px_1fr_300px] gap-4 flex-1 min-h-0">
        <!-- 左侧接收帧选择器 -->
        <div
          class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg"
        >
          <ReceiveFrameSelector :content-mode="contentMode" @toggle-mode="toggleContentMode" />
        </div>

        <!-- 中间数据项列表 -->
        <div
          class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg"
        >
          <DataItemList />
        </div>

        <!-- 右侧统计信息面板 -->
        <div class="flex flex-col space-y-4 overflow-y-auto h-full">
          <div
            class="rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg h-full"
          >
            <FrameStatsPanel />
          </div>
        </div>
      </div>
    </template>

    <!-- 显示模式：双栏布局 -->
    <template v-else>
      <div class="flex gap-4 flex-1 min-h-0">
        <!-- 左侧数据分组管理 -->
        <div
          class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg"
        >
          <DataGroupManager :content-mode="contentMode" @toggle-mode="toggleContentMode" />
        </div>

        <!-- 右侧数据显示区域 -->
        <div
          class="flex flex-col rounded-lg overflow-hidden border border-solid border-industrial bg-industrial-panel shadow-lg flex-1"
        >
          <DataDisplayContainer />
        </div>
      </div>
    </template>
  </q-page>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
