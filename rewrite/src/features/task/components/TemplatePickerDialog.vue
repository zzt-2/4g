<script setup lang="ts">
// 从模板创建任务弹窗（S011 从 ExecutionListPage 内联抽出）。
// 列出所有模板（可搜索），点击某行 emit pick（父级调 instanciateTemplate + 切 tab + 选中新实例）。

import { computed } from 'vue';
import type { TaskTemplate } from '@/features/task/core';
import { SCHEDULE_KIND_MAP } from '@/features/task/components/scheduleKindMap';

interface Props {
  modelValue: boolean;
  rows: readonly TaskTemplate[];
  search: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:search': [value: string];
  pick: [tpl: TaskTemplate];
}>();

const filteredRows = computed(() => {
  const q = props.search.trim().toLowerCase();
  if (!q) return props.rows;
  return props.rows.filter((t) => t.name.toLowerCase().includes(q));
});
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6">从模板创建任务</div>
      </q-card-section>
      <q-card-section class="pt-0">
        <q-input :model-value="search" dense outlined placeholder="搜索模板名称..." class="mb-2"
          @update:model-value="emit('update:search', String($event ?? ''))">
          <template #prepend>
            <q-icon name="o_search" size="xs" />
          </template>
        </q-input>
        <q-list bordered separator class="rounded">
          <q-item v-for="tpl in filteredRows" :key="tpl.templateId" clickable @click="emit('pick', tpl)">
            <q-item-section>
              <q-item-label class="rw-text-value">{{ tpl.name }}</q-item-label>
              <q-item-label caption>
                {{ SCHEDULE_KIND_MAP[tpl.definition.schedule.kind]?.label ?? tpl.definition.schedule.kind }}
                · {{ tpl.definition.steps.length }} 步
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="o_chevron_right" color="grey" />
            </q-item-section>
          </q-item>
          <q-item v-if="filteredRows.length === 0">
            <q-item-section class="text-center rw-text-desc">没有匹配的模板</q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="取消" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
