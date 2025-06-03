<script setup lang="ts">
import { ref } from 'vue';
import type { ContentMode } from '../types/frames/receive';

// 组件导入
import ReceiveFrameSelector from '../components/frames/receive/ReceiveFrameSelector.vue';
import DataItemList from '../components/frames/receive/DataItemList.vue';
import DataGroupManager from '../components/frames/receive/DataGroupManager.vue';
import FrameStatsPanel from '../components/frames/receive/FrameStatsPanel.vue';
import FrameMappingConfig from '../components/frames/receive/FrameMappingConfig.vue';
// import FrameStructureViewer from '../components/frames/receive/FrameStructureViewer.vue';
// import DataDisplayPlaceholder from '../components/frames/receive/DataDisplayPlaceholder.vue';

// 状态管理
const contentMode = ref<ContentMode>('edit');

// 方法：切换内容模式
const toggleContentMode = (mode: ContentMode): void => {
  contentMode.value = mode;
};
</script>

<template>
  <div class="bg-industrial-primary h-full flex flex-col">
    <!-- 顶部切换按钮 - 优化布局 -->
    <div class="flex justify-end p-2 border-b border-industrial">
      <div class="flex bg-industrial-secondary rounded">
        <q-btn
          flat
          dense
          size="sm"
          :color="contentMode === 'edit' ? 'blue' : 'grey'"
          label="编辑"
          class="text-xs px-3 py-1"
          @click="toggleContentMode('edit')"
        />
        <q-btn
          flat
          dense
          size="sm"
          :color="contentMode === 'display' ? 'blue' : 'grey'"
          label="显示"
          class="text-xs px-3 py-1"
          @click="toggleContentMode('display')"
        />
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 flex">
      <!-- 编辑模式：三栏布局 -->
      <template v-if="contentMode === 'edit'">
        <div class="w-1/4 border-r border-industrial bg-industrial-secondary">
          <ReceiveFrameSelector />
        </div>

        <div class="w-2/4 border-r border-industrial bg-industrial-panel">
          <DataItemList />
        </div>

        <div class="w-1/4 flex flex-col">
          <!-- 统计信息面板 - 压缩高度 -->
          <div class="h-2/5 border-b border-industrial bg-industrial-secondary">
            <FrameStatsPanel />
          </div>

          <!-- 映射配置面板 - 占用更多空间 -->
          <div class="h-3/5 bg-industrial-panel">
            <FrameMappingConfig />
          </div>
        </div>
      </template>

      <!-- 显示模式：两栏布局 -->
      <template v-else>
        <div class="flex-1 bg-industrial-secondary">
          <DataGroupManager />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
