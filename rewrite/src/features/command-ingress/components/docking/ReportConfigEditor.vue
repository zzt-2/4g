<script setup lang="ts">
// 报告配置编辑器(D008):用例展开区里,在「可覆盖字段」下方内联配置三类
// (checkPoints/statisticsItems/attachItems),每类一个 ReportCategoryEditor。
// config 由父注入(undefined 表示该用例还没配过);任何改动 emit update-config,
// 父(CommandIngressPage)负责持久化进 reportConfigStorage。

import type { ReportConfig, ReportItem } from '../../core/report-config';
import { moveReportItem } from '../../core/report-config';
import type { FrameAssetService } from '@/features/frame';
import ReportCategoryEditor from './ReportCategoryEditor.vue';

type CategoryKey = 'checkPoints' | 'statisticsItems' | 'attachItems';

const props = defineProps<{
  readonly templateId: string;
  readonly config: ReportConfig | undefined;
  readonly frameService: FrameAssetService;
}>();

const emit = defineEmits<{ 'update-config': [config: ReportConfig] }>();

const categories: { readonly key: CategoryKey; readonly label: string }[] = [
  { key: 'checkPoints', label: '检查点' },
  { key: 'statisticsItems', label: '统计项' },
  { key: 'attachItems', label: '附加项' },
];

function ensureConfig(): ReportConfig {
  return (
    props.config ?? {
      templateId: props.templateId,
      checkPoints: [],
      statisticsItems: [],
      attachItems: [],
    }
  );
}

// 对某一类做变更(纯函数式:基于当前 config 派生新 config),emit 给父持久化。
function mutate(key: CategoryKey, fn: (items: readonly ReportItem[]) => readonly ReportItem[]): void {
  const base = ensureConfig();
  const next: ReportConfig = { ...base, [key]: fn(base[key]) };
  emit('update-config', next);
}

function onAdd(key: CategoryKey, item: ReportItem): void {
  mutate(key, (items) => [...items, item]);
}
function onUpdateItem(key: CategoryKey, item: ReportItem): void {
  mutate(key, (items) => items.map((i) => (i.id === item.id ? item : i)));
}
function onRemove(key: CategoryKey, id: string): void {
  mutate(key, (items) => items.filter((i) => i.id !== id));
}
function onMove(key: CategoryKey, id: string, direction: 'up' | 'down'): void {
  mutate(key, (items) => moveReportItem(items, id, direction));
}
</script>

<template>
  <div class="report-config-editor q-pa-sm">
    <div class="rw-text-label text-sm mb-2">报告配置（task 跑完按这里取接收帧字段的值填进甲方报告三类）</div>

    <ReportCategoryEditor
      v-for="cat in categories"
      :key="cat.key"
      :label="cat.label"
      :items="config?.[cat.key] ?? []"
      :frame-service="frameService"
      @add="(item: ReportItem) => onAdd(cat.key, item)"
      @update-item="(item: ReportItem) => onUpdateItem(cat.key, item)"
      @remove="(id: string) => onRemove(cat.key, id)"
      @move="(p: { id: string; direction: 'up' | 'down' }) => onMove(cat.key, p.id, p.direction)"
    />
  </div>
</template>
