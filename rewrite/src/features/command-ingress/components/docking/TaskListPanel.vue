<script setup lang="ts">
// 中心对接「任务批次历史面板」(spec: 中心对接任务批次历史面板,方案 B + B1)。
//
// 从「活跃实例表」改造成「按任务批次(T_xxx)分组、可收放、带历史」的列表:
//  - 一级 = 任务批次(q-expansion-item),按 receivedAt 倒序,进行中默认展开。
//  - 二级(展开)= 该批次下的用例,用 TaskCaseRow 渲染(四状态)。
//
// 数据源 + 控制动作走 use-docking-task-history composable(historyStorage + taskService + router)。
// 停止/暂停走二次确认($q.dialog, conventions Q5),与执行监控页一致。
//
// 规范 D007:外层容器 flex:1 1 0; min-height:0; overflow-y:auto(不靠 max-height:100%),
// q-expansion-item 全量渲染会撑开,必须钳制。

import { computed, onBeforeUnmount } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { usePolling } from '@/shared/composables';
import { useDockingTaskHistory } from '@/features/command-ingress/composables/use-docking-task-history';
import type { PersistedTaskBatch, PersistedTaskCase } from '@/features/command-ingress/services/docking-task-history-storage';
import TaskCaseRow from './TaskCaseRow.vue';

// ===== Service 引用 =====
const $q = useQuasar();
const router = useRouter();
const runtime = useRewriteRuntime();

// ===== 数据源 + 控制动作 =====
const { sortedBatches, progressOf, pauseCase, stopCase, viewDetail, refresh } = useDockingTaskHistory({
  historyStorage: runtime.features.dockingTaskHistoryStorage,
  taskService: runtime.features.taskService,
  router,
});

// 批次列表 + 进行中用例进度需要周期性刷新(storage 在接入点更新,面板读最新缓存)。
// 用 usePolling(rAF 节流 + 自动 onUnmounted 清理,conventions CM2),与 TaskManagePage 同频。
const polling = usePolling(refresh, 1000);
polling.start();
onBeforeUnmount(() => {
  polling.stop();
});

// ===== 派生 =====
const hasBatches = computed(() => sortedBatches.value.length > 0);

/** 批次状态徽章配色(●进行中 / ✓完成 / ⚠部分失败 / ✗失败)。模块级映射,不放 setup(O4)。 */
function batchStatusDisplay(status: PersistedTaskBatch['status']): { label: string; color: 'primary' | 'positive' | 'warning' | 'negative' } {
  switch (status) {
    case 'running': return { label: '进行中', color: 'primary' };
    case 'completed': return { label: '完成', color: 'positive' };
    case 'partial-failed': return { label: '部分失败', color: 'warning' };
    case 'failed': return { label: '失败', color: 'negative' };
  }
}

/** 批次完成计数(完成数/总数)。 */
function batchProgress(batch: PersistedTaskBatch): string {
  const finished = batch.cases.filter(c => c.status === 'passed' || c.status === 'failed').length;
  return `${finished}/${batch.cases.length}`;
}

/** taskId 截断显示(完整值在 tooltip)。 */
function shortTaskId(taskId: string): string {
  return taskId.length > 14 ? `${taskId.slice(0, 12)}…` : taskId;
}

/** receivedAt 简短显示(MM-DD HH:mm)。 */
function shortReceivedAt(receivedAt: number): string {
  const d = new Date(receivedAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

// ===== 操作(进行中用例控制 + 详情跳转) =====
function onPauseCase(c: PersistedTaskCase): void {
  pauseCase(c);
}

function onStopCase(c: PersistedTaskCase): void {
  $q.dialog({
    title: '确认停止',
    message: '确定要停止该用例吗？',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    stopCase(c);
  });
}

function onViewDetail(c: PersistedTaskCase): void {
  viewDetail(c);
}
</script>

<template>
  <div class="task-list-panel docking-task-history flex flex-col h-full min-h-0">
    <!-- 批次列表(外层容器 D007: flex:1 1 0; min-height:0; overflow-y:auto 钳制 q-expansion-item 撑开) -->
    <div v-if="hasBatches" class="docking-task-history__scroll flex-1 min-h-0 overflow-y-auto px-4 py-2">
      <q-expansion-item
        v-for="batch in sortedBatches"
        :key="batch.taskId"
        :default-opened="batch.status === 'running'"
        dense
        switch-toggle-side
        :label="batch.taskName"
      >
        <template #header>
          <div class="row items-center justify-between full-width no-wrap q-pr-sm">
            <div class="row items-center gap-2 no-wrap">
              <q-badge
                :color="batchStatusDisplay(batch.status).color"
                :label="batchStatusDisplay(batch.status).label"
              />
              <span class="rw-text-value text-sm">{{ batch.taskName }}</span>
              <span class="rw-text-label text-xs">{{ shortTaskId(batch.taskId) }}</span>
              <q-tooltip>{{ batch.taskId }}</q-tooltip>
            </div>
            <span class="rw-text-label text-xs">{{ batchProgress(batch) }} · {{ shortReceivedAt(batch.receivedAt) }}</span>
          </div>
        </template>

        <!-- 用例列表(平铺,不分 layer) -->
        <div class="flex flex-col">
          <TaskCaseRow
            v-for="c in batch.cases"
            :key="c.testCaseId"
            :case-row="c"
            :progress="progressOf(c)"
            @pause="onPauseCase(c)"
            @stop="onStopCase(c)"
            @view-detail="onViewDetail(c)"
          />
        </div>
      </q-expansion-item>
    </div>

    <!-- 空态 -->
    <div v-else class="flex-1 min-h-0 flex items-center justify-center">
      <div class="text-center rw-text-label">暂无中心下发任务</div>
    </div>
  </div>
</template>
