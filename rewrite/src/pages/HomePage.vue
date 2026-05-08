<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useRewritePlatform } from '@/app/useRewritePlatform';
import SummaryMetricGrid from '@/widgets/SummaryMetricGrid.vue';

interface SummaryMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string | number;
  readonly caption?: string;
  readonly icon: string;
}

const runtime = useRewriteRuntime();
const platform = useRewritePlatform();
const overview = ref(runtime.getOverviewSnapshot());
const operationMessage = ref('');

const bridgeLabel = computed(() => platform.bridgeInfo.value?.name ?? 'desktop bridge pending');
const metrics = computed<SummaryMetric[]>(() => [
  {
    id: 'frame-count',
    label: '帧资产',
    value: overview.value.frame.totalFrames,
    caption: `字段 ${overview.value.frame.totalFields}`,
    icon: 'view_agenda',
  },
  {
    id: 'selected-frame',
    label: '当前帧',
    value: overview.value.frame.selectedFrameName ?? '未选择',
    icon: 'fact_check',
  },
  {
    id: 'recording',
    label: '自动记录',
    value: overview.value.settings.autoStartRecording ? '开启' : '关闭',
    caption: `CSV 间隔 ${overview.value.settings.csvSaveIntervalMinutes} 分钟`,
    icon: 'settings',
  },
  {
    id: 'storage-material',
    label: '本地材料',
    value:
      overview.value.storage.localRecordCount +
      overview.value.storage.historyHourCount +
      overview.value.storage.csvMaterialCount +
      overview.value.storage.legacyMaterialCount,
    caption: overview.value.storage.lastIssue?.message ?? '状态正常',
    icon: 'inventory_2',
  },
]);

function refreshOverviewSnapshot(): void {
  overview.value = runtime.getOverviewSnapshot();
}

function refreshOverview(): void {
  refreshOverviewSnapshot();
  operationMessage.value = '已刷新';
}

function resetRecordingSettings(): void {
  const result = runtime.resetSettings('recording');
  refreshOverviewSnapshot();
  operationMessage.value = result.ok ? '记录设置已复位' : '记录设置未更新';
}
</script>

<template>
  <q-page class="overview-page">
    <section class="overview-page__content">
      <div class="overview-page__header">
        <div>
          <p class="overview-page__eyebrow">{{ bridgeLabel }}</p>
          <h1 class="overview-page__title">运行总览</h1>
        </div>
        <div class="overview-page__actions">
          <q-btn flat round icon="refresh" aria-label="刷新" @click="refreshOverview" />
          <q-btn outline color="primary" icon="restart_alt" label="记录复位" @click="resetRecordingSettings" />
        </div>
      </div>

      <SummaryMetricGrid :metrics="metrics" />

      <div class="overview-page__snapshot">
        <div class="overview-page__snapshot-item">
          <span>CSV 路径</span>
          <strong>{{ overview.settings.csvDefaultOutputPath || '未设置' }}</strong>
        </div>
        <div class="overview-page__snapshot-item">
          <span>本地记录</span>
          <strong>{{ overview.storage.localRecordCount }}</strong>
        </div>
        <div class="overview-page__snapshot-item">
          <span>历史小时</span>
          <strong>{{ overview.storage.historyHourCount }}</strong>
        </div>
        <div class="overview-page__snapshot-item">
          <span>CSV 材料</span>
          <strong>{{ overview.storage.csvMaterialCount }}</strong>
        </div>
      </div>

      <q-banner v-if="operationMessage" dense rounded class="overview-page__message">
        {{ operationMessage }}
      </q-banner>
    </section>
  </q-page>
</template>

<style scoped lang="scss">
@use '../css/tokens' as tokens;

.overview-page {
  background: var(--rw-color-surface-app);
  min-height: 100%;
  padding: var(--rw-space-page);
}

.overview-page__content {
  display: grid;
  gap: var(--rw-space-4);
  margin: var(--rw-space-0) auto;
  max-width: var(--rw-size-content-wide);
}

.overview-page__header {
  align-items: flex-start;
  display: flex;
  gap: var(--rw-space-4);
  justify-content: space-between;
}

.overview-page__eyebrow {
  color: var(--rw-color-text-muted);
  font-size: var(--rw-font-size-label);
  line-height: var(--rw-line-height-body);
  margin: var(--rw-space-0) var(--rw-space-0) var(--rw-space-1);
}

.overview-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
  margin: var(--rw-space-0);
}

.overview-page__actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--rw-space-2);
  justify-content: flex-end;
}

.overview-page__snapshot {
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  display: grid;
  gap: var(--rw-space-0);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.overview-page__snapshot-item {
  border-right: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  display: grid;
  gap: var(--rw-space-1);
  min-width: 0;
  padding: var(--rw-space-3-5) var(--rw-space-4);
}

.overview-page__snapshot-item:last-child {
  border-right: var(--rw-border-width-none);
}

.overview-page__snapshot-item span {
  color: var(--rw-color-text-muted);
  font-size: var(--rw-font-size-caption);
  line-height: var(--rw-line-height-caption);
}

.overview-page__snapshot-item strong {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-body);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-body);
  overflow-wrap: anywhere;
}

.overview-page__message {
  background: var(--rw-color-surface-selected);
  color: var(--rw-color-action-primary);
}

@media (max-width: tokens.rw-breakpoint('page-compact')) {
  .overview-page {
    padding: var(--rw-space-page-compact);
  }

  .overview-page__header {
    display: grid;
  }

  .overview-page__actions {
    justify-content: flex-start;
  }

  .overview-page__snapshot {
    grid-template-columns: 1fr;
  }

  .overview-page__snapshot-item {
    border-bottom: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
    border-right: var(--rw-border-width-none);
  }

  .overview-page__snapshot-item:last-child {
    border-bottom: var(--rw-border-width-none);
  }
}
</style>
