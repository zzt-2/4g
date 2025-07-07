<script setup lang="ts">
import type { TableConfig } from '../../../../types/frames/dataDisplay';

const props = defineProps<{
  displayMode: TableConfig['displayMode'];
}>();

const emit = defineEmits<{
  'update:displayMode': [mode: TableConfig['displayMode']];
  openSettings: [];
}>();

const handleModeChange = (mode: TableConfig['displayMode']) => {
  emit('update:displayMode', mode);
};

const handleOpenSettings = () => {
  emit('openSettings');
};
</script>

<template>
  <div class="flex items-center space-x-2">
    <!-- 模式切换按钮组 -->
    <div class="flex items-center space-x-1">
      <button
        :class="[
          'px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center space-x-1',
          displayMode === 'table'
            ? 'btn-industrial-primary'
            : 'btn-industrial-secondary hover:bg-industrial-highlight',
        ]"
        @click="handleModeChange('table')"
      >
        <i class="q-icon notranslate material-icons text-sm">table_view</i>
        <span>表格</span>
      </button>

      <button
        :class="[
          'px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center space-x-1',
          displayMode === 'chart'
            ? 'btn-industrial-primary'
            : 'btn-industrial-secondary hover:bg-industrial-highlight',
        ]"
        @click="handleModeChange('chart')"
      >
        <i class="q-icon notranslate material-icons text-sm">show_chart</i>
        <span>图表</span>
      </button>
    </div>

    <!-- 设置按钮（仅在图表模式下显示） -->
    <button
      v-if="displayMode === 'chart'"
      class="btn-industrial-secondary px-2 py-1.5 text-xs rounded transition-colors flex items-center"
      @click="handleOpenSettings"
      title="图表设置"
    >
      <i class="q-icon notranslate material-icons text-sm">tune</i>
    </button>
  </div>
</template>
