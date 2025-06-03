<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/receiveFrames';
import type { Frame } from '../../../types/frames/frames';
import { validateFrameFields } from '../../../utils/receive';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const searchText = ref<string>('');

// 计算属性：过滤后的接收帧
const filteredFrames = computed(() => {
  if (!searchText.value.trim()) {
    return receiveFramesStore.receiveFrames;
  }

  const search = searchText.value.toLowerCase();
  return receiveFramesStore.receiveFrames.filter(
    (frame: Frame) =>
      frame.name.toLowerCase().includes(search) ||
      frame.description.toLowerCase().includes(search) ||
      frame.id.toLowerCase().includes(search),
  );
});

// 方法：选择帧
const selectFrame = (frame: Frame): void => {
  receiveFramesStore.selectFrame(frame.id);
};

// 方法：检查是否为选中帧
const isSelected = (frame: Frame): boolean => {
  return receiveFramesStore.selectedFrameId === frame.id;
};

// 方法：检查帧是否有验证错误
const hasValidationError = (frame: Frame): boolean => {
  // 检查帧字段验证
  const frameValidation = validateFrameFields(frame);
  if (!frameValidation.isValid) return true;

  // 检查映射关系验证
  const frameMappings = receiveFramesStore.mappings.filter((m) => m.frameId === frame.id);
  for (const mapping of frameMappings) {
    // 检查映射的分组和数据项是否存在
    const group = receiveFramesStore.groups.find((g) => g.id === mapping.groupId);
    if (!group) return true;

    const dataItem = group.dataItems.find((item) => item.id === mapping.dataItemId);
    if (!dataItem) return true;

    // 检查字段是否存在
    const field = frame.fields.find((f) => f.id === mapping.fieldId);
    if (!field) return true;
  }

  return false;
};
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-secondary">
    <!-- 标题栏 -->
    <div class="p-4 border-b border-industrial">
      <h3 class="text-industrial-primary text-lg font-medium mb-3">接收帧选择器</h3>

      <!-- 搜索框 -->
      <q-input
        v-model="searchText"
        dense
        outlined
        placeholder="搜索帧名称、描述或ID..."
        class="text-sm"
        bg-color="industrial-panel"
        color="blue"
        clearable
      >
        <template #prepend>
          <q-icon name="search" color="grey-5" />
        </template>
      </q-input>
    </div>

    <!-- 帧列表 -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredFrames.length === 0" class="p-4 text-center text-industrial-secondary">
        <p v-if="searchText.trim()">未找到匹配的接收帧</p>
        <p v-else>暂无接收帧</p>
      </div>

      <div v-else class="space-y-1 p-2">
        <div
          v-for="frame in filteredFrames"
          :key="frame.id"
          class="rounded cursor-pointer transition-colors duration-200 px-2 py-1 h-6 flex items-center justify-between"
          :class="{
            'bg-industrial-highlight border border-blue-500':
              isSelected(frame) && !hasValidationError(frame),
            'bg-red-500/20 border border-red-500': isSelected(frame) && hasValidationError(frame),
            'bg-industrial-panel hover:bg-industrial-highlight':
              !isSelected(frame) && !hasValidationError(frame),
            'bg-red-500/10 border border-red-500/50 hover:bg-red-500/20':
              !isSelected(frame) && hasValidationError(frame),
          }"
          @click="selectFrame(frame)"
        >
          <!-- 帧名称和ID -->
          <div class="flex items-center space-x-2 min-w-0 flex-1">
            <span
              class="text-sm font-medium truncate"
              :class="hasValidationError(frame) ? 'text-red-400' : 'text-industrial-primary'"
            >
              {{ frame.name }}
            </span>
            <span
              class="text-xs font-mono flex-shrink-0"
              :class="hasValidationError(frame) ? 'text-red-300' : 'text-industrial-id'"
            >
              #{{ frame.id }}
            </span>
          </div>

          <!-- 状态指示器 -->
          <div class="flex items-center space-x-1 flex-shrink-0">
            <!-- 验证错误指示器 -->
            <q-icon v-if="hasValidationError(frame)" name="error" color="red" size="12px" />

            <!-- 选中指示器 -->
            <q-icon
              v-if="isSelected(frame)"
              name="check_circle"
              :color="hasValidationError(frame) ? 'red' : 'blue'"
              size="14px"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 底部统计信息 -->
    <div class="p-2 border-t border-industrial bg-industrial-panel">
      <div class="text-xs text-industrial-secondary text-center">
        {{ filteredFrames.length }} 个接收帧
        <span v-if="searchText.trim()"> • 搜索结果</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
