<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useRewritePlatform } from '@/app/useRewritePlatform';
import { usePolling } from '@/shared/composables';
import SummaryMetricGrid from '@/widgets/SummaryMetricGrid.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { listFrameAssetSummaries } from '@/features/frame';
import type { ConnectionSummary } from '@/features/connection';
import { connectionStatusMap } from '@/features/connection/components/connectionStatusMap';

interface SummaryMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string | number;
  readonly caption?: string;
  readonly icon: string;
}

interface QuickAction {
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly to: string;
  readonly color: string;
}

const router = useRouter();
const runtime = useRewriteRuntime();
const platform = useRewritePlatform();

const frameService = runtime.features.frameService;
const connectionService = runtime.features.connectionService;
const taskService = runtime.features.taskService;
const sendService = runtime.features.sendService;

// ===== Business data =====
const frameCount = ref(0);
const fieldCount = ref(0);
const selectedFrameName = ref<string | null>(null);
const connectionSummaries = ref<readonly ConnectionSummary[]>([]);
const taskStats = ref({ totalCreated: 0, totalCompleted: 0, totalFailed: 0, totalStepsExecuted: 0 });
const sendStats = ref({ totalSent: 0, totalErrors: 0, totalBytesSent: 0 });

const bridgeLabel = computed(() => platform.bridgeInfo.value?.name ?? 'desktop bridge pending');

const connectedCount = computed(() =>
  connectionSummaries.value.filter((s) => s.lifecycle === 'connected').length,
);

const metrics = computed<SummaryMetric[]>(() => [
  {
    id: 'connections',
    label: '连接',
    value: `${connectedCount.value} / ${connectionSummaries.value.length}`,
    caption: connectedCount.value > 0 ? '已连接' : '无活跃连接',
    icon: 'link',
  },
  {
    id: 'frames',
    label: '帧资产',
    value: frameCount.value,
    caption: `字段 ${fieldCount.value}`,
    icon: 'view_agenda',
  },
  {
    id: 'tasks',
    label: '任务',
    value: taskStats.value.totalCreated,
    caption: `完成 ${taskStats.value.totalCompleted} · 失败 ${taskStats.value.totalFailed}`,
    icon: 'assignment',
  },
  {
    id: 'sends',
    label: '发送',
    value: sendStats.value.totalSent,
    caption: sendStats.value.totalErrors > 0 ? `错误 ${sendStats.value.totalErrors}` : '状态正常',
    icon: 'send',
  },
]);

const quickActions: readonly QuickAction[] = [
  { label: '连接管理', description: '新建串口或网络连接', icon: 'link', to: '/connection', color: 'primary' },
  { label: '帧定义', description: '管理帧结构与字段', icon: 'view_agenda', to: '/frames', color: 'primary' },
  { label: '帧发送', description: '编辑发送参数并执行', icon: 'send', to: '/send', color: 'primary' },
  { label: '任务管理', description: '创建和监控执行任务', icon: 'assignment', to: '/tasks', color: 'primary' },
  { label: '指令接入', description: 'SCOE 与外部指令配置', icon: 'settings_input_antenna', to: '/command-ingress', color: 'primary' },
  { label: '系统设置', description: '应用配置与串口参数', icon: 'settings', to: '/settings', color: 'primary' },
];

function refreshData(): void {
  const summaries = listFrameAssetSummaries(frameService.getSnapshot(), {});
  frameCount.value = summaries.length;
  fieldCount.value = summaries.reduce((sum, f) => sum + f.fieldCount, 0);
  selectedFrameName.value = frameService.getSelectedFrame()?.name ?? null;

  connectionSummaries.value = connectionService.listConnectionSummaries();

  const ts = taskService.getStatistics();
  taskStats.value = {
    totalCreated: ts.totalCreated,
    totalCompleted: ts.totalCompleted,
    totalFailed: ts.totalFailed,
    totalStepsExecuted: ts.totalStepsExecuted,
  };

  const ss = sendService.getStatistics();
  sendStats.value = {
    totalSent: ss.totalSent,
    totalErrors: ss.totalErrors,
    totalBytesSent: ss.totalBytesSent,
  };
}

const polling = usePolling(refreshData, 2000);

function navigateTo(to: string): void {
  void router.push(to);
}

onMounted(() => {
  refreshData();
  polling.start();
});
</script>

<template>
  <q-page class="home-page p-6 min-h-full">
    <section class="home-page__content gap-4 mx-auto">
      <!-- Header -->
      <div class="home-page__header gap-4">
        <q-btn flat round icon="refresh" aria-label="刷新" @click="refreshData" />
      </div>

      <!-- Metrics -->
      <SummaryMetricGrid :metrics="metrics" />

      <!-- Quick Actions -->
      <section class="home-page__section gap-2">
        <h2 class="home-page__section-title pb-1">快速入口</h2>
        <div class="home-page__actions gap-2">
          <q-card v-for="action in quickActions" :key="action.to" flat bordered clickable class="home-page__action-card"
            @click="navigateTo(action.to)">
            <q-card-section class="home-page__action-content gap-3">
              <q-icon :name="action.icon" size="24px" :color="action.color" />
              <div class="home-page__action-text">
                <div class="home-page__action-label">{{ action.label }}</div>
                <div class="home-page__action-desc mt-0.5">{{ action.description }}</div>
              </div>
              <q-icon name="chevron_right" color="grey" />
            </q-card-section>
          </q-card>
        </div>
      </section>

      <!-- Active Connections -->
      <section v-if="connectionSummaries.length > 0" class="home-page__section gap-2">
        <h2 class="home-page__section-title pb-1">连接状态</h2>
        <div class="home-page__conn-list">
          <div v-for="conn in connectionSummaries" :key="conn.connectionId"
            class="home-page__conn-item gap-3 py-2.5 px-4">
            <StatusBadge :status="conn.lifecycle" :status-map="connectionStatusMap" />
            <span class="home-page__conn-label">{{ conn.label }}</span>
            <span class="rw-text-desc">{{ conn.routeLabel }}</span>
          </div>
        </div>
      </section>

      <!-- Frame & Task Info -->
      <section class="home-page__section gap-2">
        <h2 class="home-page__section-title pb-1">系统快照</h2>
        <div class="home-page__snapshot">
          <div class="home-page__snapshot-item gap-1 py-3.5 px-4">
            <span>当前帧</span>
            <strong>{{ selectedFrameName ?? '--' }}</strong>
          </div>
          <div class="home-page__snapshot-item gap-1 py-3.5 px-4">
            <span>任务步骤执行</span>
            <strong>{{ taskStats.totalStepsExecuted }}</strong>
          </div>
          <div class="home-page__snapshot-item gap-1 py-3.5 px-4">
            <span>发送字节</span>
            <strong>{{ sendStats.totalBytesSent }}</strong>
          </div>
          <div class="home-page__snapshot-item gap-1 py-3.5 px-4">
            <span>连接总数</span>
            <strong>{{ connectionSummaries.length }}</strong>
          </div>
        </div>
      </section>
    </section>
  </q-page>
</template>

<style scoped lang="scss">
@use '../css/tokens' as tokens;

.home-page {
  background: var(--rw-color-surface-app);
}

.home-page__content {
  display: grid;
  margin: 0 auto;
  max-width: var(--rw-size-content-wide);
}

.home-page__header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
}

.home-page__eyebrow {
  color: var(--rw-color-text-muted);
  font-size: var(--rw-font-size-label);
  line-height: var(--rw-line-height-body);
}

.home-page__section {
  display: grid;
}

.home-page__section-title {
  color: var(--rw-color-text-secondary);
  font-size: var(--rw-font-size-label);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-body);
  border-bottom: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
}

// Quick Actions
.home-page__actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.home-page__action-card {
  border-radius: var(--rw-radius-panel);
  transition: background 0.15s ease;

  &:hover {
    background: var(--rw-color-surface-selected);
  }
}

.home-page__action-content {
  align-items: center;
  display: flex;
}

.home-page__action-text {
  flex: 1;
  min-width: 0;
}

.home-page__action-label {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-body);
  font-weight: var(--rw-font-weight-medium);
  line-height: var(--rw-line-height-body);
}

.home-page__action-desc {
  color: var(--rw-color-text-secondary);
  font-size: var(--rw-font-size-caption);
  line-height: var(--rw-line-height-caption);
}

// Connection list
.home-page__conn-list {
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.home-page__conn-item {
  align-items: center;
  border-bottom: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  display: flex;

  &:last-child {
    border-bottom: none;
  }
}

.home-page__conn-label {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-body);
  font-weight: var(--rw-font-weight-medium);
}

// Snapshot grid
.home-page__snapshot {
  background: var(--rw-color-surface-base);
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  display: grid;
  gap: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.home-page__snapshot-item {
  border-right: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  display: grid;
  min-width: 0;

  &:last-child {
    border-right: none;
  }

  span {
    color: var(--rw-color-text-muted);
    font-size: var(--rw-font-size-caption);
    line-height: var(--rw-line-height-caption);
  }

  strong {
    color: var(--rw-color-text-primary);
    font-size: var(--rw-font-size-body);
    font-weight: var(--rw-font-weight-semibold);
    line-height: var(--rw-line-height-body);
    overflow-wrap: anywhere;
  }
}

@media (max-width: tokens.rw-breakpoint('page-compact')) {
  .home-page {
    padding: var(--rw-space-4);
  }

  .home-page__header {
    display: grid;
  }

  .home-page__actions {
    grid-template-columns: 1fr;
  }

  .home-page__snapshot {
    grid-template-columns: 1fr;
  }

  .home-page__snapshot-item {
    border-bottom: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
    border-right: none;

    &:last-child {
      border-bottom: none;
    }
  }
}
</style>
