<script setup lang="ts">
import type { ReadonlyFrameAsset } from '../core';

interface FrameDetailPanelProps {
  frame?: ReadonlyFrameAsset;
}

defineProps<FrameDetailPanelProps>();


const PREVIEW_FIELD_COUNT = 5;
</script>

<template>
  <div v-if="frame" class="flex flex-col h-full rw-panel-base rw-divider-l">
    <div class="flex items-center justify-between p-4 rw-divider-b">
      <span class="text-sm font-semibold rw-text-value">帧详情</span>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div class="grid gap-3">
        <div class="grid gap-1">
          <span class="text-xs rw-text-label">ID</span>
          <span class="text-sm rw-text-value">{{ frame.id }}</span>
        </div>
        <div class="grid gap-1">
          <span class="text-xs rw-text-label">名称</span>
          <span class="text-sm rw-text-value">{{ frame.name }}</span>
        </div>
        <div class="grid gap-1">
          <span class="text-xs rw-text-label">方向</span>
          <q-chip dense :color="frame.direction === 'receive' ? 'positive' : 'info'" text-color="white"
            :label="frame.direction === 'receive' ? '接收' : '发送'" />
        </div>
        <div class="grid gap-1">
          <span class="text-xs rw-text-label">类型</span>
          <span class="text-sm rw-text-value">{{ frame.frameType || '--' }}</span>
        </div>
        <div class="grid gap-1">
          <span class="text-xs rw-text-label">字段数</span>
          <span class="text-sm rw-text-value">{{ frame.fields.length }}</span>
        </div>
        <div v-if="frame.description" class="grid gap-1">
          <span class="text-xs rw-text-label">描述</span>
          <span class="text-sm rw-text-desc">{{ frame.description }}</span>
        </div>
      </div>

      <div class="mt-6">
        <span class="text-xs rw-text-label">字段预览（前 {{ PREVIEW_FIELD_COUNT }} 个）</span>
        <div class="mt-2 grid gap-2">
          <div v-for="field in frame.fields.slice(0, PREVIEW_FIELD_COUNT)" :key="field.id"
            class="flex items-center gap-2 text-xs">
            <span class="rw-text-value min-w-20">{{ field.name }}</span>
            <span class="rw-text-desc">{{ field.dataType }}</span>
            <span class="rw-text-label">{{ field.length }}B</span>
          </div>
          <div v-if="frame.fields.length > PREVIEW_FIELD_COUNT" class="text-xs rw-text-label">
            ...还有 {{ frame.fields.length - PREVIEW_FIELD_COUNT }} 个字段
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
