<script setup lang="ts">
// 执行监控页二级 toolbar（对齐 S010 DockingToolbar 范式）：
// 二级分段控件「活动任务 / 历史记录」（左）+ 状态筛选 chip 行或清空历史按钮（右）。
// 操作按钮（从模板创建/空白任务/全部停止/批量管理）归 TaskManageToolbar 一级统一管理，这里不重复。

type InnerTab = 'active' | 'history';

interface Props {
  modelValue: InnerTab;
  statusFilter: string;
  hasHistory: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [tab: InnerTab];
  'update:statusFilter': [value: string];
  'clear-history': [];
}>();

const INNER_TABS: ReadonlyArray<{ value: InnerTab; label: string }> = [
  { value: 'active', label: '活动任务' },
  { value: 'history', label: '历史记录' },
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'created', label: '待启动' },
  { value: 'running', label: '运行中' },
  { value: 'paused', label: '已暂停' },
];
</script>

<template>
  <div class="exec-toolbar flex items-center justify-between px-6 py-2 rw-divider-b">
    <!-- 左：二级分段控件（视觉弱于一级，rw-segmented--sub） -->
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

    <!-- 右：active tab 显状态筛选 chip 行；history tab 显清空历史按钮 -->
    <div v-if="modelValue === 'active'" class="flex items-center gap-1">
      <q-chip v-for="opt in STATUS_FILTER_OPTIONS" :key="opt.value" dense clickable
        :color="statusFilter === opt.value ? 'primary' : 'grey-4'"
        :text-color="statusFilter === opt.value ? 'white' : 'grey-8'"
        @click="emit('update:statusFilter', opt.value)">
        {{ opt.label }}
      </q-chip>
    </div>
    <q-btn v-else-if="modelValue === 'history' && hasHistory" flat no-caps dense
      icon="o_delete_sweep" label="清空历史" size="sm" color="negative"
      @click="emit('clear-history')" />
  </div>
</template>

<style scoped lang="scss">
.exec-toolbar {
  background: var(--rw-color-surface-header);
  flex-shrink: 0;
}
</style>
