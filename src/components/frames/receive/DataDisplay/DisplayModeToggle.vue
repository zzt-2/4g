<script setup lang="ts">
type DisplayMode = 'table' | 'special' | 'chart';

defineProps<{
  displayMode: DisplayMode;
}>();

const emit = defineEmits<{
  'update:displayMode': [mode: DisplayMode];
  openSettings: [];
}>();

const handleModeChange = (mode: DisplayMode) => {
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
      <button :class="[
        'px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center space-x-1',
        displayMode === 'table'
          ? 'btn-industrial-primary'
          : 'btn-industrial-secondary hover:bg-industrial-highlight',
      ]" @click="handleModeChange('table')">
        <i class="q-icon notranslate material-icons text-sm">table_view</i>
        <span>表格</span>
      </button>

      <button :class="[
        'px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center space-x-1',
        displayMode === 'special'
          ? 'btn-industrial-primary'
          : 'btn-industrial-secondary hover:bg-industrial-highlight',
      ]" @click="handleModeChange('special')">
        <i class="q-icon notranslate material-icons text-sm">auto_awesome</i>
        <span>特殊图</span>
      </button>

      <button :class="[
        'px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center space-x-1',
        displayMode === 'chart'
          ? 'btn-industrial-primary'
          : 'btn-industrial-secondary hover:bg-industrial-highlight',
      ]" @click="handleModeChange('chart')">
        <i class="q-icon notranslate material-icons text-sm">show_chart</i>
        <span>图表</span>
      </button>
    </div>

    <!-- 设置按钮（图表/特殊图模式下显示） -->
    <button v-if="displayMode === 'chart' || displayMode === 'special'"
      class="btn-industrial-secondary px-2 py-1.5 text-xs rounded transition-colors flex items-center"
      @click="handleOpenSettings" title="设置">
      <i class="q-icon notranslate material-icons text-sm">tune</i>
    </button>
  </div>
</template>
