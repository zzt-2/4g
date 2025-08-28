<script setup lang="ts">
import { computed } from 'vue';
import type { Frame } from '../../../types/frames';
import { useFrameTemplateStore } from '../../../stores/frames/frameTemplateStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';

// 使用props，因为这是一个纯展示组件，便于重用
const props = defineProps<{
  frames: Frame[];
}>();

// 获取store实例，以便可以直接使用其他功能
const frameTemplateStore = useFrameTemplateStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 直接从store获取selectedFrameId
const selectedFrameId = computed(() => frameTemplateStore.selectedFrameId);

// 处理帧选择
function handleSelectFrame(frameId: string) {
  // 直接调用store方法设置选中的帧ID
  frameTemplateStore.setSelectedFrameId(frameId);
  sendFrameInstancesStore.setCurrentInstance(null);
}

// 处理帧双击 - 直接在组件中实现逻辑，不再使用emit
async function handleDoubleClickFrame(frameId: string) {
  // 在双击时首先也选中该帧
  frameTemplateStore.setSelectedFrameId(frameId);

  // 创建新实例的逻辑
  sendFrameInstancesStore.isCreatingNewInstance = true;
  const newInstance = await sendFrameInstancesStore.createInstance(frameId);
  sendFrameInstancesStore.setCurrentInstance(newInstance!.id);
  sendFrameInstancesStore.showEditorDialog = true;
  sendFrameInstancesStore.isModifyingInstance = true;
}

// 计算收藏的帧格式
const favoriteFrames = computed(() => {
  return props.frames.filter((frame) => frame.isFavorite);
});

// 计算非收藏的帧格式
const regularFrames = computed(() => {
  return props.frames.filter((frame) => !frame.isFavorite);
});

// 切换收藏状态
function toggleFavorite(event: Event, frameId: string) {
  event.stopPropagation(); // 防止触发选择事件
  try {
    frameTemplateStore.toggleFavorite(frameId);
    console.log(
      `已${frameTemplateStore.frames.find((f) => f.id === frameId)?.isFavorite ? '添加到' : '从'}收藏夹${frameTemplateStore.frames.find((f) => f.id === frameId)?.isFavorite ? '' : '移除'}`,
    );
  } catch (error) {
    console.error('更新收藏状态失败:', error);
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- 空状态提示 -->
    <div class="flex flex-col items-center justify-center h-full p-8 text-blue-grey-4" v-if="frames.length === 0">
      <q-icon name="format_list_bulleted" color="blue-grey-7" size="3rem" class="opacity-70" />
      <div class="mt-4 text-center">暂无帧格式</div>
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
            class="flex justify-between items-center px-3 py-2 rounded-md my-1 cursor-pointer transition-colors h-[34px] min-h-[34px] hover:bg-[#232b3f]"
            :class="{
              'bg-blue-800 bg-opacity-30 border-l-4 border-l-blue-500 pl-2':
                frame.id === selectedFrameId,
            }" @click="handleSelectFrame(frame.id)" @dblclick="handleDoubleClickFrame(frame.id)">
            <div class="text-white text-sm font-medium truncate max-w-[150px]">
              {{ frame.name }}
            </div>
            <q-btn flat round dense size="xs" color="amber-5" icon="star"
              class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors"
              @click.stop="toggleFavorite($event, frame.id)" />
          </div>
        </div>
      </div>

      <!-- 普通帧格式 -->
      <div>
        <div class="text-blue-grey-4 text-xs uppercase font-medium px-2 py-1 flex items-center">
          <q-icon name="format_list_bulleted" size="xs" class="mr-1 text-blue-5" />
          全部帧格式
        </div>
        <div class="overflow-auto pr-1">
          <div v-for="frame in regularFrames" :key="frame.id"
            class="flex justify-between items-center px-3 py-2 rounded-md my-1 cursor-pointer transition-colors h-[34px] min-h-[34px] hover:bg-[#232b3f]"
            :class="{
              'bg-blue-800 bg-opacity-30 border-l-4 border-l-blue-500 pl-2':
                frame.id === selectedFrameId,
            }" @click="handleSelectFrame(frame.id)" @dblclick="handleDoubleClickFrame(frame.id)">
            <div class="text-white text-sm font-medium truncate max-w-[150px]">
              {{ frame.name }}
            </div>
            <q-btn flat round dense size="xs" color="blue-grey-5" icon="star_outline"
              class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors"
              @click.stop="toggleFavorite($event, frame.id)" />
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
