<script setup lang="ts">
import { computed } from 'vue';
import type { TaskInstanceState, TaskProgress, TaskStepDefinition, TaskStepResult } from '@/features/task';
import { STEP_KIND_LABELS } from '@/features/task/components/task-labels';
import StatusBadge from './StatusBadge.vue';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import { isStepResultFailed } from '@/features/task';
import { formatElapsed } from '@/shared/utils/format';

const props = defineProps<{
  readonly instance: TaskInstanceState;
  readonly progress: TaskProgress | null;
  readonly displayStatus: string;
  readonly statusInfo: { label: string; color: string };
}>();

const emit = defineEmits<{
  pause: [];
  resume: [];
  stop: [];
}>();

const stepStatuses = computed(() => {
  const steps = props.instance.definitionRef.steps;
  const results = props.instance.stepResults;
  const currentIter = props.instance.currentIteration;
  const currentStepIdx = props.instance.currentStepIndex;

  const currentIterResults = results.filter((r) => r.iteration === currentIter);
  const resultMap = new Map<number, TaskStepResult>();
  for (const r of currentIterResults) {
    resultMap.set(r.stepIndex, r);
  }

  return steps.map((step, idx) => {
    const result = resultMap.get(idx);
    let status: 'o_pending' | 'running' | 'done' | 'failed' | 'skipped' = 'o_pending';
    if (result) {
      if (result.appliedPolicy === 'skip-step') {
        status = 'skipped';
      } else if (isStepResultFailed(result)) {
        status = 'failed';
      } else {
        status = 'done';
      }
    } else if (idx === currentStepIdx) {
      status = 'running';
    }
    return { step, index: idx, status, result };
  });
});

function formatStepResult(step: TaskStepDefinition, result: TaskStepResult | undefined): string {
  if (!result) return '';
  switch (step.kind) {
    case 'send':
      return result.kind === 'send'
        ? result.sendResult.kind === 'sent' ? '发送成功' : '发送失败'
        : '';
    case 'wait-condition':
      return result.kind === 'wait-condition'
        ? result.matched ? '条件匹配' : result.timedOut ? '超时' : ''
        : '';
    case 'delay':
      return result.kind === 'delay'
        ? result.completed ? '完成' : '中断'
        : '';
  }
}

const isRunning = computed(() => props.instance.lifecycle === 'running');
const isPaused = computed(() => props.instance.lifecycle === 'paused');

const progressPct = computed(() => {
  if (!props.progress) return 0;
  const total = props.progress.stepsTotal || 1;
  return Math.round((props.progress.stepsCompleted / total) * 100);
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <StatusBadge :status="displayStatus" :status-map="TASK_STATUS_MAP" />
        <span class="rw-text-value text-sm">{{ instance.definitionRef.name }}</span>
      </div>
    </div>

    <!-- Progress -->
    <div v-if="progress" class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <span class="rw-text-label text-xs">进度</span>
        <span class="rw-text-value text-xs">{{ progress.stepsCompleted }}/{{ progress.stepsTotal }} ({{ progressPct }}%)</span>
      </div>
      <q-linear-progress :value="progressPct / 100" color="primary" size="6px" rounded />
    </div>

    <!-- Elapsed -->
    <div v-if="progress" class="flex items-center justify-between">
      <span class="rw-text-label text-xs">耗时</span>
      <span class="rw-text-value text-xs">{{ formatElapsed(progress.elapsedMs) }}</span>
    </div>

    <!-- Iteration info -->
    <div v-if="progress && progress.iterationsTotal !== null" class="flex items-center justify-between">
      <span class="rw-text-label text-xs">迭代</span>
      <span class="rw-text-value text-xs">{{ progress.iterationsCompleted }}/{{ progress.iterationsTotal }}</span>
    </div>

    <!-- Step status list -->
    <q-separator />
    <div class="flex flex-col gap-1">
      <span class="rw-text-label text-xs">步骤状态</span>
      <div
        v-for="item in stepStatuses"
        :key="item.index"
        class="flex items-center gap-2"
      >
        <q-icon
          :name="item.status === 'running' ? 'o_pending' : item.status === 'done' ? 'o_check_circle' : item.status === 'failed' ? 'o_error' : item.status === 'skipped' ? 'o_skip_next' : 'o_radio_button_unchecked'"
          :color="item.status === 'done' ? 'positive' : item.status === 'failed' ? 'negative' : item.status === 'running' ? 'primary' : 'grey'"
          size="xs"
        />
        <span class="rw-text-value text-xs flex-1">
          {{ item.step.name ?? STEP_KIND_LABELS[item.step.kind].label }} #{{ item.index + 1 }}
        </span>
        <span v-if="item.result" class="rw-text-desc text-xs">
          {{ formatStepResult(item.step, item.result) }}
        </span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="instance.error" class="rw-text-error text-xs p-2 rounded rw-surface-elevated">
      {{ instance.error }}
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <q-btn
        v-if="isRunning"
        flat
        no-caps
        dense
        icon="o_pause"
        label="暂停"
        color="warning"
        size="sm"
        @click="emit('pause')"
      />
      <q-btn
        v-if="isPaused"
        flat
        no-caps
        dense
        icon="o_play_arrow"
        label="恢复"
        color="primary"
        size="sm"
        @click="emit('resume')"
      />
      <q-btn
        v-if="isRunning || isPaused"
        flat
        no-caps
        dense
        icon="o_stop"
        label="停止"
        color="negative"
        size="sm"
        @click="emit('stop')"
      />
    </div>
  </div>
</template>
