<script setup lang="ts">
// Tab3 顶部 toolbar（页面内部的二级头）：状态徽章组（左）+ 二级分段控件（右）。
// 操作按钮（对接配置/断开/上报）归 CiToolbar 统一管理，这里不重复。
// 消灭原「状态条一行 + 二级 tab 一行」的双行头。

import StatusBadge from '@/widgets/StatusBadge.vue';
import {
  DOCKING_HTTPS_STATUS_MAP,
  DOCKING_HEARTBEAT_STATUS_MAP,
  DOCKING_DEVICE_STATUS_MAP,
} from '@/features/command-ingress/components/docking-labels';
import type { DockingConnectionState } from '@/features/command-ingress/composables/use-central-docking';

type DockingInnerTab = 'tasks' | 'devices' | 'catalog';

interface Props {
  connectionState: DockingConnectionState;
  modelValue: DockingInnerTab;
}

defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [tab: DockingInnerTab];
}>();

const INNER_TABS: ReadonlyArray<{ value: DockingInnerTab; label: string }> = [
  { value: 'tasks', label: '任务列表' },
  { value: 'devices', label: '设备列表' },
  { value: 'catalog', label: '用例目录' },
];
</script>

<template>
  <div class="docking-toolbar flex items-center justify-between px-6 py-2 rw-divider-b">
    <!-- 左：状态徽章组 -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="rw-text-label text-sm">HTTPS</span>
        <StatusBadge :status="connectionState.https" :status-map="DOCKING_HTTPS_STATUS_MAP" />
      </div>
      <div class="flex items-center gap-2">
        <span class="rw-text-label text-sm">心跳</span>
        <StatusBadge :status="connectionState.heartbeat" :status-map="DOCKING_HEARTBEAT_STATUS_MAP" />
      </div>
      <div class="flex items-center gap-2">
        <span class="rw-text-label text-sm">设备</span>
        <StatusBadge :status="connectionState.device" :status-map="DOCKING_DEVICE_STATUS_MAP" />
      </div>
    </div>

    <!-- 右：二级分段控件（视觉重量弱于一级，用 --sub 修饰） -->
    <div class="rw-segmented rw-segmented--sub" role="tablist">
      <button
        v-for="tab in INNER_TABS"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :class="['rw-segmented__btn', { 'rw-segmented__btn--active': modelValue === tab.value }]"
        @click="emit('update:modelValue', tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.docking-toolbar {
  background: var(--rw-color-surface-header);
  flex-shrink: 0;
}
</style>
