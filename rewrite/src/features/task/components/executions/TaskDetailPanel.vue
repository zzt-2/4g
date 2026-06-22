<script setup lang="ts">
// 执行监控页右栏任务详情面板：卡片化 created 态（手写信息块）+ 运行态/终态（调 TaskExecutionDetail）。
// 拓宽右栏 + gap-6 后，本面板 ~400px。卡片化分区治「平淡灰扑扑」痛点。
// TaskExecutionDetail 滚动修复（S009 续接5 用户亲改：no-wrap + h-full）保留——本组件只套卡片壳，不动 TaskExecutionDetail 内部。

import StatusBadge from '@/widgets/StatusBadge.vue';
import TaskExecutionDetail from '@/widgets/TaskExecutionDetail.vue';
import { isTerminal, type ReadonlyTaskInstanceState, type TaskProgress } from '@/features/task/core';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import { SCHEDULE_KIND_MAP } from '@/features/task/components/scheduleKindMap';

interface Props {
  /** 当前选中实例（null 显示占位） */
  instance: ReadonlyTaskInstanceState | null;
  progress: TaskProgress | null;
  displayStatus: string;
  statusInfo: { label: string; color: string };
  /** 来源模板可读名（无则 '--'） */
  templateLabel: string;
  /** 操作 loading 查询函数（父级 useAsyncAction.isOperating 注入，子组件只读不持锁） */
  isOperating: (id: string) => boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  edit: [];
  start: [id: string];
  pause: [id: string];
  resume: [id: string];
  stop: [id: string];
  retry: [id: string];
  remove: [id: string];
}>();
</script>

<template>
  <div class="task-detail-panel flex flex-col h-full rw-panel-base">
    <!-- 无选中：占位 -->
    <div v-if="!instance" class="flex flex-col items-center justify-center flex-1 rw-text-desc p-6">
      <q-icon name="o_assignment" size="48px" color="grey" class="mb-2" />
      <p>请选择一个任务</p>
    </div>

    <template v-else>
      <!-- created 态：手写信息卡 + 操作按钮（可编辑可启动） -->
      <template v-if="instance.lifecycle === 'created'">
        <div class="flex-1 min-h-0 overflow-y-auto p-4 no-wrap">
          <div class="task-detail-panel__field">
            <span class="rw-text-label text-xs">任务名称</span>
            <div class="rw-text-value">{{ instance.definitionRef.name }}</div>
          </div>
          <div class="task-detail-panel__field">
            <span class="rw-text-label text-xs">来源模板</span>
            <div class="rw-text-value">{{ templateLabel }}</div>
          </div>
          <div class="task-detail-panel__field">
            <span class="rw-text-label text-xs">调度类型</span>
            <div class="mt-1">
              <q-chip dense outline :color="(SCHEDULE_KIND_MAP[instance.definitionRef.schedule.kind] ?? { color: 'grey' }).color"
                :label="(SCHEDULE_KIND_MAP[instance.definitionRef.schedule.kind] ?? { label: instance.definitionRef.schedule.kind }).label" />
            </div>
          </div>
          <div class="task-detail-panel__field">
            <span class="rw-text-label text-xs">状态</span>
            <div class="mt-1">
              <StatusBadge :status="displayStatus" :status-map="TASK_STATUS_MAP" />
            </div>
          </div>
          <div class="task-detail-panel__field">
            <span class="rw-text-label text-xs">步骤数</span>
            <div class="rw-text-value">{{ instance.definitionRef.steps.length }}</div>
          </div>
        </div>

        <div class="flex-shrink-0 p-4 rw-divider-t">
          <div class="flex items-center gap-2">
            <q-btn unelevated no-caps color="primary" icon="o_edit" label="编辑" @click="emit('edit')" />
            <q-btn unelevated no-caps color="positive" icon="o_play_arrow" label="启动"
              :loading="props.isOperating(`start-${instance.instanceId}`)"
              @click="emit('start', instance.instanceId)" />
          </div>
        </div>
      </template>

      <!-- 运行态/终态：调 TaskExecutionDetail（滚动修复保留） -->
      <template v-else>
        <div class="flex-1 min-h-0 p-4 flex flex-col no-wrap">
          <TaskExecutionDetail :instance="instance" :progress="progress"
            :display-status="displayStatus" :status-info="statusInfo"
            @pause="emit('pause', instance.instanceId)"
            @resume="emit('resume', instance.instanceId)"
            @stop="emit('stop', instance.instanceId)" />
        </div>

        <!-- 终态：重新执行/删除按钮 -->
        <div v-if="isTerminal(instance.lifecycle)" class="flex-shrink-0 p-4 rw-divider-t">
          <div class="flex items-center gap-2">
            <q-btn flat no-caps icon="o_replay" label="重新执行" color="primary"
              :loading="props.isOperating(`retry-${instance.instanceId}`)"
              @click="emit('retry', instance.instanceId)" />
            <q-btn flat no-caps icon="o_delete" label="删除" color="negative"
              @click="emit('remove', instance.instanceId)" />
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.task-detail-panel {
  // 卡片壳（rw-panel-base 已给背景），高度链：h-full 拿满父级，内部 overflow 滚动
  width: 100%;
}

.task-detail-panel__field {
  margin-bottom: var(--rw-space-3);
}
</style>
