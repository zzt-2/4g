<template>
  <div class="flex justify-between items-center px-4 py-2 bg-[#0f2744] border-b border-[#1a3663] flex-shrink-0">
    <h1 class="text-base font-medium text-[#93c5fd]">
      {{ isNewFrame ? '创建帧配置' : '编辑帧配置' }}
    </h1>

    <div class="flex gap-2">
      <button
        class="flex items-center bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] py-1 px-2 rounded transition-colors duration-200 text-xs"
        @click="goBack">
        <span class="material-icons text-xs mr-1">arrow_back</span>
        返回
      </button>

      <button
        class="flex items-center bg-[#3b82f6] hover:bg-[#2563eb] text-white py-1 px-2 rounded transition-colors duration-200 text-xs"
        @click="saveFrame" :disabled="!hasChanges || !isFrameValid"
        :class="{ 'opacity-50 cursor-not-allowed': !hasChanges || !isFrameValid }">
        <span class="material-icons text-xs mr-1">save</span>
        保存
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">

defineProps<{
  isNewFrame: boolean;
  hasChanges: boolean;
  isFrameValid: boolean;
}>();

const emit = defineEmits<{
  goBack: [];
  save: [];
}>();

const goBack = () => {
  emit('goBack');
};

const saveFrame = () => {
  emit('save');
};
</script>
