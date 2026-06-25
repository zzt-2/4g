<script setup lang="ts">
// 任务批次历史面板的「用例行」子组件(spec: 任务批次历史面板「用例行子组件」)。
// 四状态(pending/running/passed/failed),进行中内联进度条 + 控制按钮,完成显示耗时 + 详情跳转。
// 进度/标签复用纯函数 formatProgressPct/formatProgressLabel(D004 进度双维度)。
// 状态→图标/颜色用模块级映射 task-case-display(O4:不变数据定义在模块级)。

import { computed } from 'vue';
import type { TaskProgress } from '@/features/task';
import type { DockingCaseView } from '../../composables/use-docking-task-history';
import { formatProgressPct, formatProgressLabel } from '@/shared/utils/task-progress-format';
import { formatElapsed } from '@/shared/utils/format';
import { resolveCaseStatusDisplay, isCaseFinished } from './task-case-display';

const props = defineProps<{
  readonly caseRow: DockingCaseView;
  /** running 用例的实时进度(父组件从 taskService.getProgress 注入);非 running 传 null。 */
  readonly progress: TaskProgress | null;
}>();

const emit = defineEmits<{
  pause: [];
  resume: [];
  stop: [];
  'view-detail': [];
}>();

const display = computed(() => resolveCaseStatusDisplay(props.caseRow.status));
const finished = computed(() => isCaseFinished(props.caseRow.status));
const progressPct = computed(() => formatProgressPct(props.progress));
const progressLabel = computed(() => formatProgressLabel(props.progress));
const durationLabel = computed(() => {
  const ms = props.caseRow.durationMs;
  return ms !== null ? formatElapsed(ms) : '—';
});
</script>

<template>
  <q-item dense class="task-case-row">
    <q-item-section avatar>
      <q-icon :name="display.icon" :color="display.color" size="xs" />
    </q-item-section>

    <q-item-section>
      <q-item-label class="rw-text-value text-sm">{{ caseRow.caseName }}</q-item-label>

      <!-- 进行中:内联进度条 + n/m 标签 -->
      <q-item-label v-if="caseRow.status === 'running'" caption class="task-case-row__progress">
        <div class="flex items-center gap-2">
          <q-linear-progress :value="progressPct / 100" color="primary" size="4px" class="flex-1" />
          <span class="rw-text-label text-xs">{{ progressLabel }} ({{ progressPct }}%)</span>
        </div>
      </q-item-label>

      <!-- 已暂停:文案 -->
      <q-item-label v-else-if="caseRow.status === 'paused'" caption class="rw-text-label text-xs">
        已暂停
      </q-item-label>

      <!-- 终态:耗时 -->
      <q-item-label v-else-if="finished" caption class="rw-text-label text-xs">
        耗时 {{ durationLabel }}
      </q-item-label>

      <!-- pending:无副文本 -->
    </q-item-section>

    <q-item-section side>
      <!-- 进行中/已暂停:控制按钮(running→暂停+停止;paused→恢复+停止) -->
      <div v-if="caseRow.status === 'running' || caseRow.status === 'paused'" class="flex items-center no-wrap">
        <q-btn v-if="caseRow.status === 'running'" flat round dense icon="o_pause" color="warning" size="sm" @click="emit('pause')">
          <q-tooltip>暂停</q-tooltip>
        </q-btn>
        <q-btn v-else flat round dense icon="o_play_arrow" color="primary" size="sm" @click="emit('resume')">
          <q-tooltip>恢复</q-tooltip>
        </q-btn>
        <q-btn flat round dense icon="o_stop" color="negative" size="sm" @click="emit('stop')">
          <q-tooltip>停止</q-tooltip>
        </q-btn>
      </div>

      <!-- 终态:详情跳转 -->
      <q-btn v-else-if="finished" flat dense no-caps icon="o_open_in_new" color="primary" size="sm" label="详情" @click="emit('view-detail')" />

      <!-- pending:无操作 -->
    </q-item-section>
  </q-item>
</template>

<style scoped lang="scss">
.task-case-row {
  // 紧凑行高,不撑开批次面板。
  min-height: 0;
}

.task-case-row__progress {
  // 进度条区域不换行,宽度撑满。
  width: 100%;
}
</style>
