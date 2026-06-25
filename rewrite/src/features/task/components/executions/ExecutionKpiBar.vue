<script setup lang="ts">
// 执行监控页 KPI bar：单行紧凑「label: value」，治「缺总览/全是表格」痛点。
// 活动（总数/运行中/暂停/待启动）+ 历史（完成/失败）。
// 视觉沿用 S010 StatsKpiBar：inline-flex 项 + margin-right，label 走 text-muted，value 走 text-primary。
// 不用 flex-wrap（7 项不多，固定一行；margin-right 控制间距，外层 nowrap 防换行）。

import type { TaskTableRow } from '@/features/task/components/task-columns';
import type { HistoryTableRow } from '@/features/task/components/history-columns';

interface Props {
  activeRows: readonly TaskTableRow[];
  historyRows: readonly HistoryTableRow[];
}

const props = defineProps<Props>();

// 按 lifecycle 聚合（displayStatus 衍生态 waiting-* 归 running 统计更直观）
function count(rows: readonly TaskTableRow[], lifecycle: string): number {
  return rows.reduce((acc, r) => (r.lifecycle === lifecycle ? acc + 1 : acc), 0);
}
</script>

<template>
  <div class="exec-kpi-bar flex items-center px-6 py-2 rw-divider-b">
    <div class="exec-kpi-bar__item">
      <span class="rw-text-label">活动</span>
      <strong class="rw-text-value">{{ props.activeRows.length }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--running">
      <span class="rw-text-label">运行中</span>
      <strong class="rw-text-value">{{ count(props.activeRows, 'running') }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--paused">
      <span class="rw-text-label">已暂停</span>
      <strong class="rw-text-value">{{ count(props.activeRows, 'paused') }}</strong>
    </div>
    <div class="exec-kpi-bar__item">
      <span class="rw-text-label">待启动</span>
      <strong class="rw-text-value">{{ count(props.activeRows, 'created') }}</strong>
    </div>
    <span class="exec-kpi-bar__divider" aria-hidden="true" />
    <div class="exec-kpi-bar__item exec-kpi-bar__item--done">
      <span class="rw-text-label">已完成</span>
      <strong class="rw-text-value">{{ props.historyRows.filter((r) => r.lifecycle === 'completed').length }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--failed">
      <span class="rw-text-label">失败</span>
      <strong class="rw-text-value">{{ props.historyRows.filter((r) => r.lifecycle === 'failed').length }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--stopped">
      <span class="rw-text-label">已停止</span>
      <strong class="rw-text-value">{{ props.historyRows.filter((r) => r.lifecycle === 'stopped').length }}</strong>
    </div>
  </div>
</template>

<style scoped lang="scss">
.exec-kpi-bar {
  background: var(--rw-color-surface-header);
  flex-shrink: 0;

  &__item {
    display: inline-flex;
    align-items: baseline;
    gap: var(--rw-space-2);
    margin-right: var(--rw-space-6);
    white-space: nowrap;

    span {
      font-size: var(--rw-font-size-caption);
      line-height: var(--rw-line-height-caption);
    }

    strong {
      font-size: var(--rw-font-size-body);
      font-weight: var(--rw-font-weight-semibold);
      line-height: var(--rw-line-height-body);
    }

    &--running strong { color: var(--rw-color-status-success); }
    &--paused strong { color: var(--rw-color-status-warning); }
    &--done strong { color: var(--rw-color-status-success); }
    &--failed strong { color: var(--rw-color-status-danger); }
    &--stopped strong { color: var(--rw-color-text-secondary); }
  }

  &__divider {
    width: 1px;
    height: 20px;
    background: var(--rw-color-border-subtle);
    margin-right: var(--rw-space-6);
    flex-shrink: 0;
  }
}
</style>
