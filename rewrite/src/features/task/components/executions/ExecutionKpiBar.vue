<script setup lang="ts">
// 执行监控页 KPI bar：单行紧凑「label: value」，治「缺总览/全是表格」痛点。
// 活动任务计数（活动/运行中/暂停/待启动）+ 历史计数（完成/失败）。
// 视觉沿用 S010 StatsKpiBar：flex + gap-x-6 + flex-wrap 兜底窄屏，全部压一行。

import type { TaskTableRow } from '@/features/task/components/task-columns';
import type { HistoryTableRow } from '@/features/task/components/history-columns';

interface Props {
  activeRows: readonly TaskTableRow[];
  historyRows: readonly HistoryTableRow[];
}

const props = defineProps<Props>();

// 活动任务计数：按 displayStatus（resolveDisplayStatus 输出）聚合。
// displayStatus 可能值：created / running / waiting-trigger / waiting-schedule / paused
// running 衍生的 waiting-* 也算"在跑"，这里按 lifecycle 维度统计更直观。
function countByLifecycle(rows: readonly TaskTableRow[], lifecycle: string): number {
  return rows.reduce((acc, r) => (r.lifecycle === lifecycle ? acc + 1 : acc), 0);
}

function formatCount(n: number): string {
  return n.toLocaleString();
}
</script>

<template>
  <div class="exec-kpi-bar flex items-center flex-wrap gap-x-6 gap-y-2 px-6 py-2 rw-divider-b">
    <!-- 活动任务区（左侧，与历史区用分隔点区分） -->
    <div class="exec-kpi-bar__item">
      <span class="rw-text-label">活动</span>
      <strong class="rw-text-value">{{ formatCount(props.activeRows.length) }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--running">
      <span class="rw-text-label">运行中</span>
      <strong class="rw-text-value">{{ formatCount(countByLifecycle(props.activeRows, 'running')) }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--paused">
      <span class="rw-text-label">已暂停</span>
      <strong class="rw-text-value">{{ formatCount(countByLifecycle(props.activeRows, 'paused')) }}</strong>
    </div>
    <div class="exec-kpi-bar__item">
      <span class="rw-text-label">待启动</span>
      <strong class="rw-text-value">{{ formatCount(countByLifecycle(props.activeRows, 'created')) }}</strong>
    </div>

    <span class="exec-kpi-bar__divider" aria-hidden="true" />

    <!-- 历史区 -->
    <div class="exec-kpi-bar__item exec-kpi-bar__item--done">
      <span class="rw-text-label">已完成</span>
      <strong class="rw-text-value">{{ formatCount(historyRows.filter((r) => r.lifecycle === 'completed').length) }}</strong>
    </div>
    <div class="exec-kpi-bar__item exec-kpi-bar__item--failed">
      <span class="rw-text-label">失败</span>
      <strong class="rw-text-value">{{ formatCount(historyRows.filter((r) => r.lifecycle === 'failed').length) }}</strong>
    </div>
    <div class="exec-kpi-bar__item">
      <span class="rw-text-label">历史总计</span>
      <strong class="rw-text-value">{{ formatCount(props.historyRows.length) }}</strong>
    </div>
  </div>
</template>

<style scoped lang="scss">
.exec-kpi-bar {
  background: var(--rw-color-surface-header);
  flex-shrink: 0;

  // 单个指标项：label + value 紧凑横排，value 加粗
  &__item {
    display: inline-flex;
    align-items: baseline;
    gap: var(--rw-space-2);
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

    // 状态色点：运行中/暂停/完成/失败用色点强化语义（走 status token，非硬编码）
    &--running strong { color: var(--rw-color-status-success); }
    &--paused strong { color: var(--rw-color-status-warning); }
    &--done strong { color: var(--rw-color-status-success); }
    &--failed strong { color: var(--rw-color-status-danger); }
  }

  // 活动区与历史区的视觉分隔（竖线，走 token，不用硬编码颜色）
  &__divider {
    width: 1px;
    height: 20px;
    background: var(--rw-color-border-subtle);
    flex-shrink: 0;
  }
}
</style>
