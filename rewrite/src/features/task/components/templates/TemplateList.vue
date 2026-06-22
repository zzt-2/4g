<script setup lang="ts">
// 模板管理页主体（Tab1）：单表全屏 + 批量模式工具条。
// 顶部 toolbar（搜索 + actions）已上移到 TaskManageToolbar，本组件只渲染表格 + 批量工具条。
// 编辑/批量设置弹窗已抽成 TemplateEditDialog / BatchSetTargetDialog，由 page 持有显隐。
// container-height 走 "100%" + flex 高度链（D007），禁 calc(100vh - Npx) magic number。

import DataTable from '@/widgets/DataTable.vue';
import { formatDateTime } from '@/shared/utils/format';
import type { TaskTemplate } from '@/features/task/core';
import type { TemplateTableRow } from '@/features/task/components/template-columns';
import { templateColumns } from '@/features/task/components/template-columns';

interface Props {
  rows: readonly TemplateTableRow[];
  selectedRow: readonly TemplateTableRow[];
  /** 批量模式开关 */
  batchMode: boolean;
  batchSelectedRows: readonly TemplateTableRow[];
  /** targetId → 可读 label 查找表（默认发送目标列展示） */
  targetLabelMap: Record<string, string>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'row-click': [row: TemplateTableRow];
  'selection-change': [selected: TemplateTableRow[]];
  'update:batchSelectedRows': [rows: TemplateTableRow[]];
  instantiate: [tpl: TaskTemplate];
  edit: [tpl: TaskTemplate];
  delete: [tpl: TaskTemplate];
  'batch-delete': [];
  'open-batch-set-target': [];
  'toggle-batch-mode': [];
}>();

function onRowClick(row: TemplateTableRow): void {
  if (!props.batchMode) emit('row-click', row);
}
</script>

<template>
  <div class="template-list flex flex-col h-full min-h-0">
    <!-- 批量模式工具条 -->
    <div v-if="batchMode" class="flex items-center gap-2 px-6 py-2 rw-divider-b flex-shrink-0">
      <q-btn flat dense no-caps icon="o_delete" label="删除选中" color="negative" size="sm"
        :disable="batchSelectedRows.length === 0" @click="emit('batch-delete')" />
      <q-btn flat dense no-caps icon="o_send" label="设置发送目标" color="primary" size="sm"
        :disable="batchSelectedRows.length === 0" @click="emit('open-batch-set-target')" />
      <span class="rw-text-desc text-xs">{{ batchSelectedRows.length }} 项已选中</span>
      <div class="flex-1" />
      <q-btn flat dense no-caps label="退出批量模式" size="sm" @click="emit('toggle-batch-mode')" />
    </div>

    <!-- 主表 -->
    <DataTable
      :columns="templateColumns"
      :rows="rows"
      row-key="templateId"
      :selection="batchMode ? 'multiple' : 'none'"
      :selected="batchMode ? batchSelectedRows : selectedRow"
      container-height="100%"
      class="flex-1 min-h-0"
      @row-click="onRowClick"
      @update:selected="batchMode ? emit('update:batchSelectedRows', $event as TemplateTableRow[]) : emit('selection-change', $event as TemplateTableRow[])"
    >
      <template #no-data>
        <div class="text-center w-full p-4 rw-text-label">暂无模板，点击"新建模板"开始</div>
      </template>

      <template #body-cell-scheduleKind="props">
        <q-td :props="props">
          <q-chip dense outline :color="props.row.scheduleKindDisplay.color"
            :label="props.row.scheduleKindDisplay.label" class="m-0" />
        </q-td>
      </template>

      <template #body-cell-tags="props">
        <q-td :props="props">
          <div class="flex items-center gap-1 flex-wrap">
            <q-chip v-for="tag in props.row.tags" :key="tag" dense color="grey-3" text-color="grey-8" class="m-0"
              :label="tag" />
            <span v-if="props.row.tags.length === 0" class="rw-text-desc text-xs">--</span>
          </div>
        </q-td>
      </template>

      <template #body-cell-updatedAt="props">
        <q-td :props="props">
          <span class="rw-text-value text-xs">{{ formatDateTime(props.row.updatedAt) }}</span>
        </q-td>
      </template>

      <template #body-cell-defaultTargetId="props">
        <q-td :props="props">
          <span v-if="props.row.defaultTargetId" class="rw-text-value text-xs">
            {{ targetLabelMap[props.row.defaultTargetId] ?? props.row.defaultTargetId.slice(0, 8) + '…' }}
          </span>
          <span v-else class="rw-text-desc text-xs">未设置</span>
        </q-td>
      </template>

      <template #body-cell-_actions="props">
        <q-td :props="props">
          <div v-if="!batchMode" class="flex items-center justify-center gap-1">
            <q-btn flat round dense icon="o_play_arrow" size="sm" color="positive"
              @click.stop="emit('instantiate', props.row._original)">
              <q-tooltip>实例化</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="o_edit" size="sm" color="primary"
              @click.stop="emit('edit', props.row._original)">
              <q-tooltip>编辑</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="o_delete" size="sm" color="negative"
              @click.stop="emit('delete', props.row._original)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </DataTable>
  </div>
</template>
