<template>
  <div>
    <!-- 错误信息 -->
    <div v-if="errorMessage" class="bg-red-900/20 border border-red-500 rounded-md p-3 mb-3">
      <div class="flex items-start">
        <q-icon name="error" color="red" size="sm" class="mt-0.5 mr-2" />
        <div class="text-xs text-red-400">
          {{ errorMessage }}
        </div>
      </div>
    </div>

    <!-- 任务状态和进度显示 -->
    <div
      v-if="task"
      class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs font-medium text-industrial-primary flex items-center">
          <q-icon name="info" size="xs" class="mr-1 text-blue-5" />
          任务状态: {{ task.name }}
        </div>
        <q-badge :color="getStatusColor(task.status)" class="text-xs">
          {{ getStatusLabel(task.status) }}
        </q-badge>
      </div>

      <!-- 进度信息 -->
      <div v-if="task.progress" class="text-xs text-industrial-secondary">
        <div class="flex justify-between items-center">
          <span>
            进度: {{ task.progress.currentCount }}/{{
              task.progress.totalCount === Number.MAX_SAFE_INTEGER ? '∞' : task.progress.totalCount
            }}
          </span>
          <span>{{ (task.progress.percentage || 0).toFixed(0) }}%</span>
        </div>
        <q-linear-progress
          :value="(task.progress.percentage || 0) / 100"
          color="blue"
          class="mt-1"
        />
      </div>

      <!-- 错误信息 -->
      <div v-if="task.status === 'error' && task.errorInfo" class="text-xs text-red-400 mt-2">
        错误: {{ task.errorInfo }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SendTask } from '../../../../stores/frames/sendTasksStore';

defineProps<{
  task?: SendTask | null;
  errorMessage?: string;
}>();

/**
 * 获取状态颜色
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'blue';
    case 'completed':
      return 'positive';
    case 'error':
      return 'negative';
    default:
      return 'blue-grey';
  }
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return '运行中';
    case 'completed':
      return '已完成';
    case 'error':
      return '错误';
    default:
      return '等待中';
  }
}
</script>
