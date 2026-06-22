<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { TaskInstanceState, TaskProgress, TaskStepDefinition, TaskStepResult } from '@/features/task';
import { STEP_KIND_LABELS } from '@/features/task/components/task-labels';
import StatusBadge from './StatusBadge.vue';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import { isStepResultFailed } from '@/features/task';
import { SEND_RESULT_STATUS_MAP } from '@/features/send/components/sendStatusMap';
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

const nowMs = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval>;

onMounted(() => {
  tickTimer = setInterval(() => { nowMs.value = Date.now(); }, 1000);
});

onUnmounted(() => {
  clearInterval(tickTimer);
});

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

/**
 * 失败步骤的悬停提示文本:优先取 sendResult.error.message(具体报错),
 * 缺失时回退到 SEND_RESULT_STATUS_MAP 的失败 kind 标签(如"传输错误")。
 * 仅 send 失败有具体 message;wait-condition/delay 失败返回空(由 formatStepResult 兜底)。
 */
function failureTooltipText(result: TaskStepResult | undefined): string {
  if (!result || result.kind !== 'send') return '';
  if (result.sendResult.kind === 'sent') return '';
  const msg = result.sendResult.error?.message;
  if (msg) return msg;
  return SEND_RESULT_STATUS_MAP[result.sendResult.kind]?.label ?? '发送失败';
}

const isRunning = computed(() => props.instance.lifecycle === 'running');
const isPaused = computed(() => props.instance.lifecycle === 'paused');

function delayRemainingText(stepIndex: number): string | null {
  if (stepIndex !== props.instance.currentStepIndex) return null;
  const step = props.instance.definitionRef.steps[stepIndex];
  if (!step || step.kind !== 'delay') return null;
  if (!props.instance.currentStepStartedAt) return null;
  const startedAt = new Date(props.instance.currentStepStartedAt).getTime();
  const elapsed = nowMs.value - startedAt;
  const remaining = Math.max(0, step.config.durationMs - elapsed);
  if (remaining < 1000) return '即将完成';
  const secs = Math.ceil(remaining / 1000);
  if (secs < 60) return `剩余 ${secs}s`;
  const mins = Math.floor(secs / 60);
  return `剩余 ${mins}m${secs % 60}s`;
}

const progressPct = computed(() => {
  if (!props.progress) return 0;
  // 优先按"发送次数"(sendsTotal 非 null 时反映 repeat 细粒度),回退 step 完成维度。
  if (props.progress.sendsTotal !== null && props.progress.sendsTotal > 0) {
    return Math.round((props.progress.sendsCompleted / props.progress.sendsTotal) * 100);
  }
  const total = props.progress.stepsTotal || 1;
  return Math.round((props.progress.stepsCompleted / total) * 100);
});

// 进度 n/m 标签:优先 sends(发送次数),回退 steps(step 完成数)。
const progressLabel = computed(() => {
  if (!props.progress) return '';
  if (props.progress.sendsTotal !== null) {
    return `${props.progress.sendsCompleted}/${props.progress.sendsTotal}`;
  }
  return `${props.progress.stepsCompleted}/${props.progress.stepsTotal}`;
});
</script>

<template>
  <div class="task-detail flex flex-col gap-3 flex-1 min-h-0">
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
        <span class="rw-text-value text-xs">{{ progressLabel }} ({{ progressPct }}%)</span>
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

    <!-- Step status list — scrollable region occupying all remaining space -->
    <div class="flex flex-col flex-1 min-h-0 gap-1 no-wrap">
      <q-separator />
      <span class="rw-text-label text-xs">步骤状态</span>
      <div class="flex flex-col gap-1 min-h-0 overflow-y-auto no-wrap">
        <div v-for="item in stepStatuses" :key="item.index" class="flex items-center gap-2">
          <q-icon
            :name="item.status === 'running' ? 'o_pending' : item.status === 'done' ? 'o_check_circle' : item.status === 'failed' ? 'o_error' : item.status === 'skipped' ? 'o_skip_next' : 'o_radio_button_unchecked'"
            :color="item.status === 'done' ? 'positive' : item.status === 'failed' ? 'negative' : item.status === 'running' ? 'primary' : 'grey'"
            size="xs" />
          <span class="rw-text-value text-xs flex-1">
            {{ item.step.name ?? STEP_KIND_LABELS[item.step.kind].label }} #{{ item.index + 1 }}
          </span>
          <span v-if="item.result" class="rw-text-desc text-xs">
            {{ formatStepResult(item.step, item.result) }}
            <q-tooltip v-if="failureTooltipText(item.result)" :delay="300" max-width="320px">
              {{ failureTooltipText(item.result) }}
            </q-tooltip>
          </span>
          <span v-else-if="item.status === 'running' && delayRemainingText(item.index)" class="rw-text-desc text-xs">
            {{ delayRemainingText(item.index) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="instance.error" class="rw-text-error text-xs p-2 rounded rw-surface-elevated">
      {{ instance.error }}
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <q-btn v-if="isRunning" flat no-caps dense icon="o_pause" label="暂停" color="warning" size="sm"
        @click="emit('pause')" />
      <q-btn v-if="isPaused" flat no-caps dense icon="o_play_arrow" label="恢复" color="primary" size="sm"
        @click="emit('resume')" />
      <q-btn v-if="isRunning || isPaused" flat no-caps dense icon="o_stop" label="停止" color="negative" size="sm"
        @click="emit('stop')" />
    </div>
  </div>
</template>
