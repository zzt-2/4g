<script setup lang="ts">
import { computed } from 'vue';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';

// Props
const props = defineProps<{
  groupId: number | null;
  dataItemId: number;
}>();

// Store
const receiveFramesStore = useReceiveFramesStore();

// 计算属性：获取可见项列表用于判断是否可以移动
const visibleItems = computed(() => {
  if (!props.groupId) return [];
  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  return group ? group.dataItems.filter(item => item.isVisible) : [];
});

// 计算属性：当前数据项在可见项中的索引
const visibleItemIndex = computed(() => {
  return visibleItems.value.findIndex(item => item.id === props.dataItemId);
});

// 计算属性：是否可以上移
const canMoveUp = computed(() => visibleItemIndex.value > 0);

// 计算属性：是否可以下移
const canMoveDown = computed(() => {
  return visibleItemIndex.value >= 0 && visibleItemIndex.value < visibleItems.value.length - 1;
});

// 方法：上移数据项
const moveUp = (): void => {
  if (!props.groupId || !canMoveUp.value) return;
  receiveFramesStore.moveVisibleDataItemUp(props.groupId, props.dataItemId);
};

// 方法：下移数据项
const moveDown = (): void => {
  if (!props.groupId || !canMoveDown.value) return;
  receiveFramesStore.moveVisibleDataItemDown(props.groupId, props.dataItemId);
};
</script>

<template>
  <div class="flex justify-center gap-1">
    <!-- 上移按钮 -->
    <q-btn flat round dense size="xs" icon="keyboard_arrow_up" :disable="!canMoveUp" color="blue-5"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors" :class="{
        'opacity-50': !canMoveUp,
      }" @click="moveUp">
      <q-tooltip v-if="canMoveUp" class="text-xs">上移</q-tooltip>
    </q-btn>

    <!-- 下移按钮 -->
    <q-btn flat round dense size="xs" icon="keyboard_arrow_down" :disable="!canMoveDown" color="blue-5"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors" :class="{
        'opacity-50': !canMoveDown,
      }" @click="moveDown">
      <q-tooltip v-if="canMoveDown" class="text-xs">下移</q-tooltip>
    </q-btn>
  </div>
</template>

<style scoped>
/* 使用预定义的工业主题CSS类，无需自定义样式 */
</style>
