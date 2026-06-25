<script setup lang="ts">
// 任务管理页顶部 toolbar：一级分段控件（左）+ 搜索框（中）+ 按当前 tab 动态切换的操作按钮（右）。
// 砍掉原 H1「任务管理」（左侧导航已标当前页），单行约 48px，左右 px-6 padding。
// 按钮按 tab 切换解决"按钮脱离作用对象"——按钮天然带上下文（S010 CiToolbar 范式）。
// templates → 新建/编辑/导入/导出/批量管理；executions → 从模板创建/空白任务/全部停止。

type TaskTab = 'templates' | 'executions';

interface Props {
  /** 当前激活的一级 tab */
  modelValue: TaskTab;
  /** 搜索文本（搜索作用域随 tab 切换：模板名 / 任务名） */
  searchText: string;
  /** 搜索框 placeholder（随 tab 切换文案） */
  searchPlaceholder: string;
  // --- templates tab 按钮状态 ---
  /** 是否有选中行（编辑按钮 enable 用） */
  hasSelectedRow: boolean;
  isImporting: boolean;
  isExporting: boolean;
  /** templates tab 批量模式开关 */
  templatesBatchMode: boolean;
  // --- executions tab 按钮状态 ---
  /** 活动任务数（全部停止按钮 enable 用） */
  activeTaskCount: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [tab: TaskTab];
  'update:searchText': [text: string];
  // templates actions
  'new-template': [];
  'edit-template': [];
  'import-templates': [];
  'export-templates': [];
  'toggle-templates-batch': [];
  // executions actions
  'create-from-template': [];
  'new-blank-task': [];
  'stop-all': [];
}>();

const TABS: ReadonlyArray<{ value: TaskTab; label: string; icon: string }> = [
  { value: 'templates', label: '模板管理', icon: 'o_inventory_2' },
  { value: 'executions', label: '执行监控', icon: 'o_play_circle' },
];

function onSearchInput(value: string | number | null): void {
  emit('update:searchText', String(value ?? ''));
}
</script>

<template>
  <div class="task-toolbar flex items-center gap-4 px-6 py-2 rw-divider-b">
    <!-- 左：一级分段控件 -->
    <div class="rw-segmented flex-shrink-0" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :class="['rw-segmented__btn', { 'rw-segmented__btn--active': modelValue === tab.value }]"
        @click="emit('update:modelValue', tab.value)"
      >
        <q-icon :name="tab.icon" size="xs" class="q-mr-1" />
        {{ tab.label }}
      </button>
    </div>

    <!-- 中：搜索框（随 tab 切换 placeholder） -->
    <q-input
      :model-value="props.searchText"
      dense outlined debounce="200"
      :placeholder="props.searchPlaceholder"
      class="task-toolbar__search"
      @update:model-value="onSearchInput"
    >
      <template #prepend>
        <q-icon name="o_search" size="xs" />
      </template>
    </q-input>

    <div class="flex-1" />

    <!-- 右：按当前 tab 动态切换的操作按钮 -->
    <div class="flex items-center gap-2">
      <!-- 模板管理 tab -->
      <template v-if="modelValue === 'templates'">
        <q-btn unelevated no-caps color="primary" icon="o_add" label="新建模板" @click="emit('new-template')" />
        <q-btn flat no-caps icon="o_edit" label="编辑" :disable="!hasSelectedRow" @click="emit('edit-template')" />
        <q-btn flat no-caps icon="o_file_upload" label="导入" :loading="isImporting" @click="emit('import-templates')" />
        <q-btn flat no-caps icon="o_file_download" label="导出" :loading="isExporting" @click="emit('export-templates')" />
        <q-btn
          flat no-caps
          :icon="templatesBatchMode ? 'o_close' : 'o_checklist'"
          :label="templatesBatchMode ? '退出批量' : '批量管理'"
          :color="templatesBatchMode ? 'negative' : 'grey'"
          @click="emit('toggle-templates-batch')"
        />
      </template>

      <!-- 执行监控 tab -->
      <template v-else>
        <q-btn unelevated no-caps color="primary" icon="o_library_add" label="从模板创建" @click="emit('create-from-template')" />
        <q-btn flat no-caps icon="o_add" label="空白任务" @click="emit('new-blank-task')" />
        <q-btn flat no-caps icon="o_stop_circle" label="全部停止" :disable="activeTaskCount === 0" @click="emit('stop-all')" />
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-toolbar {
  background: var(--rw-color-surface-header);
  flex-shrink: 0;
}

// 搜索框宽度限制，不抢占按钮空间
.task-toolbar__search {
  width: 240px;
  flex-shrink: 0;
}
</style>
