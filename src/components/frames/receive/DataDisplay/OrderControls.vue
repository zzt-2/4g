<script setup lang="ts">
import { computed } from 'vue';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';

// Props
const props = defineProps<{
  groupId: number | null;
  dataItemId: number;
  currentIndex: number;
  totalItems: number;
}>();

// Store
const receiveFramesStore = useReceiveFramesStore();

// 计算属性：是否可以上移
const canMoveUp = computed(() => props.currentIndex > 0);

// 计算属性：是否可以下移
const canMoveDown = computed(() => props.currentIndex < props.totalItems - 1);

// 方法：上移数据项
const moveUp = (): void => {
  if (!props.groupId || !canMoveUp.value) return;

  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  if (!group) return;

  const currentIndex = props.currentIndex;
  if (currentIndex > 0 && currentIndex < group.dataItems.length) {
    // 交换当前项和上一项的位置
    const item = group.dataItems[currentIndex];
    if (item) {
      group.dataItems.splice(currentIndex, 1);
      group.dataItems.splice(currentIndex - 1, 0, item);
    }
  }
};

// 方法：下移数据项
const moveDown = (): void => {
  if (!props.groupId || !canMoveDown.value) return;

  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  if (!group) return;

  const currentIndex = props.currentIndex;
  if (currentIndex >= 0 && currentIndex < group.dataItems.length - 1) {
    // 交换当前项和下一项的位置
    const item = group.dataItems[currentIndex];
    if (item) {
      group.dataItems.splice(currentIndex, 1);
      group.dataItems.splice(currentIndex + 1, 0, item);
    }
  }
};
</script>

<template>
  <div class="flex justify-center gap-1">
    <!-- 上移按钮 -->
    <q-btn
      flat
      round
      dense
      size="xs"
      icon="keyboard_arrow_up"
      :disable="!canMoveUp"
      color="blue-5"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors"
      :class="{
        'opacity-50': !canMoveUp,
      }"
      @click="moveUp"
    >
      <q-tooltip v-if="canMoveUp" class="text-xs">上移</q-tooltip>
    </q-btn>

    <!-- 下移按钮 -->
    <q-btn
      flat
      round
      dense
      size="xs"
      icon="keyboard_arrow_down"
      :disable="!canMoveDown"
      color="blue-5"
      class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors"
      :class="{
        'opacity-50': !canMoveDown,
      }"
      @click="moveDown"
    >
      <q-tooltip v-if="canMoveDown" class="text-xs">下移</q-tooltip>
    </q-btn>
  </div>
</template>

<style scoped>
/* 使用预定义的工业主题CSS类，无需自定义样式 */
</style>
