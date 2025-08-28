<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import type { Frame } from '../../../types/frames/frames';
import type { ContentMode } from '../../../types/frames/receive';
import { validateFrameFields } from '../../../utils/receive';

// 定义props和emits
defineProps<{
  contentMode: ContentMode;
}>();

const emit = defineEmits<{
  'toggle-mode': [mode: ContentMode];
}>();

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

// 计算收藏的帧格式
const favoriteFrames = computed(() => {
  return filteredFrames.value.filter((frame) => frame.isFavorite);
});

// 计算非收藏的帧格式
const regularFrames = computed(() => {
  return filteredFrames.value.filter((frame) => !frame.isFavorite);
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

// 切换收藏状态
function toggleFavorite(event: Event, frameId: string) {
  event.stopPropagation(); // 防止触发选择事件
  try {
    // 使用store的方法切换收藏状态（这里假设store有这个方法）
    // receiveFramesStore.toggleFavorite(frameId);
    console.log('切换收藏状态:', frameId);
  } catch (error) {
    console.error('更新收藏状态失败:', error);
  }
}

// 切换内容模式
const toggleContentMode = (mode: ContentMode): void => {
  emit('toggle-mode', mode);
};
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- 标题栏 -->
    <div class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-table-header">
      <h6 class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center">
        <q-icon name="sensors" size="xs" class="mr-1 text-blue-5" />
        接收帧选择
      </h6>

      <!-- 编辑/显示模式切换按钮 -->
      <div class="flex bg-industrial-secondary rounded">
        <q-btn flat dense size="sm" :color="contentMode === 'edit' ? 'blue' : 'grey'" label="编辑"
          class="text-xs px-3 py-1" @click="toggleContentMode('edit')" />
        <q-btn flat dense size="sm" :color="contentMode === 'display' ? 'blue' : 'grey'" label="显示"
          class="text-xs px-3 py-1" @click="toggleContentMode('display')" />
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="p-3 border-b border-industrial">
      <q-input v-model="searchText" dense placeholder="搜索帧格式..." outlined
        class="w-full bg-industrial-secondary text-industrial-primary" dark>
        <template #append>
          <q-icon name="search" class="text-blue-grey-6" />
        </template>
      </q-input>
    </div>

    <!-- 空状态提示 -->
    <div class="flex flex-col items-center justify-center h-full p-8 text-blue-grey-4"
      v-if="filteredFrames.length === 0">
      <q-icon name="sensors" color="blue-grey-7" size="3rem" class="opacity-70" />
      <div class="mt-4 text-center">暂无接收帧格式</div>
    </div>

    <div v-else class="p-2">
      <!-- 收藏的帧格式 -->
      <div class="mb-4" v-if="favoriteFrames.length > 0">
        <div class="text-blue-grey-4 text-xs uppercase font-medium px-2 py-1 flex items-center">
          <q-icon name="star" size="xs" class="mr-1 text-amber-400" />
          收藏
        </div>
        <div class="max-h-[200px] overflow-y-auto pr-1">
          <div v-for="frame in favoriteFrames" :key="frame.id"
            class="flex justify-between items-center px-3 py-2 rounded-md my-1 cursor-pointer transition-colors h-[34px] min-h-[34px]"
            :class="{
              'bg-blue-800 bg-opacity-30 border-l-4 border-l-blue-500 pl-2':
                isSelected(frame) && !hasValidationError(frame),
              'bg-red-800 bg-opacity-30 border-l-4 border-l-red-500 pl-2':
                isSelected(frame) && hasValidationError(frame),
              'hover:bg-industrial-highlight': !isSelected(frame),
            }" @click="selectFrame(frame)">
            <div class="text-white text-sm font-medium truncate max-w-[150px]">
              {{ frame.name }}
            </div>
            <div class="flex items-center space-x-1 flex-shrink-0">
              <!-- 验证错误指示器 -->
              <q-icon v-if="hasValidationError(frame)" name="error" color="red" size="12px" />

              <q-btn flat round dense size="xs" color="amber-5" icon="star"
                class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors"
                @click.stop="toggleFavorite($event, frame.id)" />
            </div>
          </div>
        </div>
      </div>

      <!-- 普通帧格式 -->
      <div>
        <div class="text-blue-grey-4 text-xs uppercase font-medium px-2 py-1 flex items-center">
          全部接收帧格式
        </div>
        <div class="overflow-auto pr-1">
          <div v-for="frame in regularFrames" :key="frame.id"
            class="flex justify-between items-center px-3 py-2 rounded-md my-1 cursor-pointer transition-colors h-[34px] min-h-[34px]"
            :class="{
              'bg-blue-800 bg-opacity-30 border-l-4 border-l-blue-500 pl-2':
                isSelected(frame) && !hasValidationError(frame),
              'bg-red-800 bg-opacity-30 border-l-4 border-l-red-500 pl-2':
                isSelected(frame) && hasValidationError(frame),
              'hover:bg-industrial-highlight': !isSelected(frame),
            }" @click="selectFrame(frame)">
            <div class="text-white text-sm font-medium truncate max-w-[150px]">
              {{ frame.name }}
            </div>
            <div class="flex items-center space-x-1 flex-shrink-0">
              <!-- 验证错误指示器 -->
              <q-icon v-if="hasValidationError(frame)" name="error" color="red" size="12px" />

              <q-btn flat round dense size="xs" color="blue-grey-5" icon="star_outline"
                class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors"
                @click.stop="toggleFavorite($event, frame.id)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 滚动条样式 */
.overflow-auto::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.overflow-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-auto::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
}

.overflow-auto::-webkit-scrollbar-thumb:hover {
  background: #3b82f6;
}
</style>
