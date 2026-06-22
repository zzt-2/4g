<script setup lang="ts">
// Tab1 顶部 KPI bar：原 5×2 统计卡片网格瘦身成两行紧凑「label: value」。
// 计数器类 5 项第一行；状态类 3 项第二行。「最后功能码」「错误原因」收进命令日志表表头（见 CommandLogTable）。
// 省 ~140px 纵向空间给下方表格。

import StatusBadge from '@/widgets/StatusBadge.vue';
import { formatElapsed } from '@/shared/utils/format';
import type { ScoeStatisticsSnapshot, ScoeRuntimeStatus } from '@/features/command-ingress/core';
import { healthStatusMap, linkTestStatusMap } from '@/features/command-ingress/components/scoeStatusMap';

interface Props {
  statistics: ScoeStatisticsSnapshot;
  runtimeStatus: ScoeRuntimeStatus;
}

const props = defineProps<Props>();

// 计数器行：累计秒 / 卫星运行秒 / 接收总数 / 成功总数 / 出错数
// 秒数用 formatElapsed 转可读时长（输入 ms），数字用千分位。空值（0 且语义为"无数据"）显 —。
function formatSeconds(sec: number): string {
  if (!sec) return '—';
  return formatElapsed(sec * 1000);
}
function formatCount(n: number): string {
  return n.toLocaleString();
}
</script>

<template>
  <div class="stats-kpi-bar flex items-center flex-wrap gap-x-6 gap-y-2 px-6 py-2 rw-divider-b">
    <!-- 全部 8 项压一行（窄屏 flex-wrap 兜底，不挤碎） -->
    <div class="stats-kpi-bar__item">
      <span class="rw-text-label">累计</span>
      <strong class="rw-text-value">{{ formatSeconds(props.statistics.runtimeSeconds) }}</strong>
    </div>
    <div class="stats-kpi-bar__item">
      <span class="rw-text-label">卫星运行</span>
      <strong class="rw-text-value">{{ formatSeconds(props.statistics.satelliteIdRuntimeSeconds) }}</strong>
    </div>
    <div class="stats-kpi-bar__item">
      <span class="rw-text-label">接收总数</span>
      <strong class="rw-text-value">{{ formatCount(props.statistics.commandReceiveCount) }}</strong>
    </div>
    <div class="stats-kpi-bar__item">
      <span class="rw-text-label">成功总数</span>
      <strong class="rw-text-value">{{ formatCount(props.statistics.commandSuccessCount) }}</strong>
    </div>
    <div class="stats-kpi-bar__item">
      <span class="rw-text-label">出错数</span>
      <strong class="rw-text-value">{{ formatCount(props.statistics.commandErrorCount) }}</strong>
    </div>
    <div class="stats-kpi-bar__item">
      <span class="rw-text-label">已加载卫星ID</span>
      <strong class="rw-text-value">{{ props.runtimeStatus.loadedSatelliteId || '—' }}</strong>
    </div>
    <div class="flex items-center gap-2">
      <span class="rw-text-label">健康状态</span>
      <StatusBadge :status="props.runtimeStatus.healthStatus" :status-map="healthStatusMap" />
    </div>
    <div class="flex items-center gap-2">
      <span class="rw-text-label">链路自检</span>
      <StatusBadge :status="props.runtimeStatus.linkTestResult" :status-map="linkTestStatusMap" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.stats-kpi-bar {
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
  }
}
</style>
