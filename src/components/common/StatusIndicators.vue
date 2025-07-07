<template>
  <div v-if="statusStore.settings.isEnabled" class="flex items-center space-x-2 mr-4">
    <div
      v-for="indicator in statusStore.activeIndicators"
      :key="indicator.id"
      class="flex items-center space-x-1 gap-1"
      :title="`${indicator.label}: ${getIndicatorStatusText(indicator)}`"
    >
      <!-- 简单指示灯 -->
      <div
        class="w-4 h-4 rounded-full border"
        :style="{
          backgroundColor: indicator.currentColor,
          borderColor: indicator.currentColor,
        }"
      />

      <!-- 标签 -->
      <span class="text-xs text-industrial-secondary">
        {{ indicator.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStatusIndicatorStore } from '../../stores/statusIndicators';
import { useReceiveFramesStore } from '../../stores/frames/receiveFramesStore';

// Stores
const statusStore = useStatusIndicatorStore();
const receiveFramesStore = useReceiveFramesStore();

// 方法：获取指示灯状态文本
const getIndicatorStatusText = (indicator: any): string => {
  const group = receiveFramesStore.groups.find((g) => g.id === indicator.groupId);
  const dataItem = group?.dataItems.find((item) => item.id === indicator.dataItemId);

  if (!dataItem) {
    return '数据项不存在';
  }

  return indicator.isActive ? `激活 (${dataItem.value})` : `未激活 (${dataItem.value})`;
};
</script>

<style scoped>
/* 简单样式，无需额外样式 */
</style>
