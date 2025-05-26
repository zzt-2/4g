<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { TaskType, TaskStatus } from '../../../stores/frames/sendTasksStore';

// 定义props
const props = defineProps<{
  // 控制是否折叠面板
  collapsed?: boolean;
  // 控制是否显示任务类型筛选
  showFilters?: boolean;
}>();

// 任务管理器
const { activeTasks, isProcessing, processingError, stopTask, startTask, pauseTask, resumeTask } =
  useSendTaskManager();

// 状态
const isExpanded = ref(!props.collapsed);
const selectedTaskId = ref<string | null>(null);

// 筛选条件
const typeFilter = ref<TaskType | 'all'>('all');
const statusFilter = ref<TaskStatus | 'all'>('all');

// 计算属性：筛选后的任务列表
const filteredTasks = computed(() => {
  let tasks = activeTasks.value;

  if (typeFilter.value !== 'all') {
    tasks = tasks.filter((task) => task.type === typeFilter.value);
  }

  if (statusFilter.value !== 'all') {
    tasks = tasks.filter((task) => task.status === statusFilter.value);
  }

  return tasks;
});

// 任务类型显示
const taskTypeLabels: Record<TaskType, string> = {
  sequential: '顺序发送',
  'timed-single': '定时发送',
  'timed-multiple': '多实例定时',
  'triggered-single': '触发发送',
  'triggered-multiple': '多实例触发',
};

// 任务状态显示
const taskStatusLabels: Record<TaskStatus, string> = {
  idle: '空闲',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  error: '错误',
  'waiting-trigger': '等待触发',
};

// 任务状态颜色
const taskStatusColors: Record<TaskStatus, string> = {
  idle: 'blue-grey',
  running: 'blue',
  paused: 'orange',
  completed: 'positive',
  error: 'negative',
  'waiting-trigger': 'purple',
};

// 任务类型图标
const taskTypeIcons: Record<TaskType, string> = {
  sequential: 'queue_play_next',
  'timed-single': 'schedule',
  'timed-multiple': 'schedule_send',
  'triggered-single': 'sensors',
  'triggered-multiple': 'device_hub',
};

// 任务操作
function handleTaskAction(action: string, taskId: string) {
  switch (action) {
    case 'stop':
      stopTask(taskId);
      break;
    case 'start':
      startTask(taskId);
      break;
    case 'pause':
      pauseTask(taskId);
      break;
    case 'resume':
      resumeTask(taskId);
      break;
    case 'select':
      selectedTaskId.value = taskId;
      break;
    default:
      console.log('未知操作:', action);
  }
}

// 格式化时间戳为可读时间
function formatTime(timestamp: number): string {
  if (!timestamp) return '未知时间';

  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

// 计算任务的剩余时间（用于定时任务）
function calculateRemainingTime(task: any): string {
  if (
    task.type.includes('timed') &&
    task.status === 'running' &&
    task.progress?.nextExecutionTime
  ) {
    const remaining = task.progress.nextExecutionTime - Date.now();
    if (remaining <= 0) return '即将执行';

    const seconds = Math.floor(remaining / 1000);
    return `${seconds}秒后`;
  }
  return '';
}

// 计算任务执行时长
function calculateDuration(task: any): string {
  if (!task.createdAt) return '';

  const startTime = new Date(task.createdAt).getTime();
  const now = Date.now();
  const durationMs = now - startTime;

  const seconds = Math.floor(durationMs / 1000) % 60;
  const minutes = Math.floor(durationMs / (1000 * 60)) % 60;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));

  if (hours > 0) {
    return `${hours}时${minutes}分${seconds}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  } else {
    return `${seconds}秒`;
  }
}

// 刷新计时器
const refreshTimer = ref<number | null>(null);

// 组件挂载
onMounted(() => {
  // 每秒更新一次显示
  refreshTimer.value = window.setInterval(() => {
    // 这个空操作会触发计算属性重新计算
  }, 1000);
});

// 组件卸载前清理
onBeforeUnmount(() => {
  if (refreshTimer.value !== null) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
});
</script>

<template>
  <div
    class="active-tasks-monitor bg-industrial-panel border border-industrial rounded-md shadow-lg"
    :class="{ collapsed: !isExpanded }"
  >
    <!-- 标题栏 -->
    <div
      class="header flex justify-between items-center px-3 py-2 border-b border-industrial cursor-pointer"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center">
        <q-icon name="task_alt" class="text-blue-5 mr-2" size="sm" />
        <h3 class="text-industrial-primary text-sm font-medium m-0">
          活动任务监视器
          <span v-if="filteredTasks.length > 0" class="text-blue-5 ml-2">
            ({{ filteredTasks.length }})
          </span>
        </h3>
      </div>
      <div class="flex items-center">
        <q-badge v-if="isProcessing" color="blue" text-color="white" class="q-mr-sm text-2xs">
          处理中
        </q-badge>
        <q-btn
          flat
          dense
          round
          :icon="isExpanded ? 'expand_less' : 'expand_more'"
          color="blue-grey"
          size="sm"
        />
      </div>
    </div>

    <!-- 展开的内容区 -->
    <div v-if="isExpanded" class="content">
      <!-- 筛选器 -->
      <div
        v-if="props.showFilters && activeTasks.length > 0"
        class="filters p-2 border-b border-industrial flex flex-wrap gap-2"
      >
        <div class="flex items-center space-x-2">
          <span class="text-industrial-secondary text-xs">类型筛选:</span>
          <q-btn-toggle
            v-model="typeFilter"
            :options="[
              { label: '全部', value: 'all' },
              { label: '顺序', value: 'sequential' },
              { label: '定时', value: 'timed-single' },
              { label: '多实例定时', value: 'timed-multiple' },
              { label: '触发', value: 'triggered-single' },
              { label: '多实例触发', value: 'triggered-multiple' },
            ]"
            push
            glossy
            rounded
            dense
            unelevated
            class="text-2xs"
            toggle-color="primary"
            color="grey-9"
            text-color="white"
          />
        </div>

        <div class="flex items-center space-x-2">
          <span class="text-industrial-secondary text-xs">状态筛选:</span>
          <q-btn-toggle
            v-model="statusFilter"
            :options="[
              { label: '全部', value: 'all' },
              { label: '运行中', value: 'running' },
              { label: '已暂停', value: 'paused' },
              { label: '等待触发', value: 'waiting-trigger' },
              { label: '错误', value: 'error' },
            ]"
            push
            glossy
            rounded
            dense
            unelevated
            class="text-2xs"
            toggle-color="primary"
            color="grey-9"
            text-color="white"
          />
        </div>
      </div>

      <!-- 任务列表 -->
      <div class="task-list overflow-auto" style="max-height: 300px">
        <div v-if="filteredTasks.length === 0" class="empty-state p-4 text-center">
          <q-icon name="info" color="blue-grey" size="sm" class="mb-2" />
          <p class="text-industrial-secondary text-xs m-0">
            {{ activeTasks.length > 0 ? '没有匹配筛选条件的任务' : '没有活动的发送任务' }}
          </p>
        </div>

        <div
          v-for="task in filteredTasks"
          :key="task.id"
          class="task-item p-2 border-b border-industrial hover:bg-industrial-highlight"
          :class="{ 'bg-industrial-highlight': selectedTaskId === task.id }"
          @click="handleTaskAction('select', task.id)"
        >
          <div class="flex justify-between items-start">
            <!-- 任务信息 -->
            <div class="flex-1 min-w-0">
              <!-- 任务标题行 -->
              <div class="flex items-center">
                <q-icon :name="taskTypeIcons[task.type]" class="text-blue-5 mr-1" size="sm" />
                <span class="text-industrial-primary text-xs font-medium truncate">
                  {{ task.name }}
                </span>
                <q-badge :color="taskStatusColors[task.status]" class="ml-2 text-2xs">
                  {{ taskStatusLabels[task.status] }}
                </q-badge>
                <q-badge color="grey-8" class="ml-2 text-2xs">
                  {{ taskTypeLabels[task.type] }}
                </q-badge>
              </div>

              <!-- 进度信息 -->
              <div class="mt-1 flex items-center">
                <template v-if="task.progress">
                  <!-- 通用进度信息 -->
                  <div
                    v-if="task.status === 'running' || task.status === 'paused'"
                    class="flex-1 mr-2"
                  >
                    <q-linear-progress
                      :value="task.progress.percentage / 100"
                      :color="task.status === 'paused' ? 'orange' : 'primary'"
                      size="xs"
                      class="mb-1"
                    />
                    <div class="flex justify-between">
                      <span class="text-2xs text-industrial-secondary">
                        <template
                          v-if="
                            task.type.includes('timed') &&
                            task.config &&
                            'isInfinite' in task.config &&
                            task.config.isInfinite
                          "
                        >
                          已执行 {{ task.progress.currentCount }} 次
                        </template>
                        <template v-else>
                          {{ task.progress.currentCount }}/{{ task.progress.totalCount }}
                        </template>
                      </span>
                      <span class="text-2xs text-industrial-secondary">
                        {{ task.progress.percentage }}%
                      </span>
                    </div>
                  </div>

                  <!-- 定时任务特有信息 -->
                  <div
                    v-if="task.type.includes('timed') && task.status === 'running'"
                    class="text-2xs text-blue-400"
                  >
                    下次发送: {{ calculateRemainingTime(task) }}
                  </div>

                  <!-- 触发任务特有信息 -->
                  <div
                    v-if="task.type.includes('triggered') && task.status === 'waiting-trigger'"
                    class="text-2xs text-purple-400"
                  >
                    等待触发条件满足
                  </div>
                </template>

                <!-- 运行时长 -->
                <div
                  v-if="task.status === 'running' || task.status === 'waiting-trigger'"
                  class="text-2xs text-industrial-secondary ml-auto"
                >
                  运行: {{ calculateDuration(task) }}
                </div>

                <!-- 错误信息 -->
                <div v-if="task.errorInfo" class="text-2xs text-negative">
                  错误: {{ task.errorInfo }}
                </div>
              </div>
            </div>

            <!-- 任务操作 -->
            <div class="ml-2 flex items-center">
              <!-- 运行中任务的操作 -->
              <template v-if="task.status === 'running'">
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="pause"
                  color="orange"
                  @click.stop="handleTaskAction('pause', task.id)"
                >
                  <q-tooltip>暂停</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="stop"
                  color="negative"
                  @click.stop="handleTaskAction('stop', task.id)"
                >
                  <q-tooltip>停止</q-tooltip>
                </q-btn>
              </template>

              <!-- 暂停任务的操作 -->
              <template v-else-if="task.status === 'paused'">
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="play_arrow"
                  color="positive"
                  @click.stop="handleTaskAction('resume', task.id)"
                >
                  <q-tooltip>继续</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="stop"
                  color="negative"
                  @click.stop="handleTaskAction('stop', task.id)"
                >
                  <q-tooltip>停止</q-tooltip>
                </q-btn>
              </template>

              <!-- 等待触发任务的操作 -->
              <template v-else-if="task.status === 'waiting-trigger'">
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="stop"
                  color="negative"
                  @click.stop="handleTaskAction('stop', task.id)"
                >
                  <q-tooltip>停止监听</q-tooltip>
                </q-btn>
              </template>

              <!-- 错误任务的操作 -->
              <template v-else-if="task.status === 'error'">
                <q-btn
                  flat
                  dense
                  round
                  size="xs"
                  icon="refresh"
                  color="blue"
                  @click.stop="handleTaskAction('start', task.id)"
                >
                  <q-tooltip>重试</q-tooltip>
                </q-btn>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部错误提示 -->
      <div v-if="processingError" class="p-2 bg-red-900 bg-opacity-20 border-t border-red-800">
        <div class="flex items-start">
          <q-icon name="error" color="negative" size="xs" class="mt-0.5 mr-1" />
          <div class="text-2xs text-red-400">
            {{ processingError }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.active-tasks-monitor {
  transition: all 0.3s ease;
}

.active-tasks-monitor.collapsed .content {
  display: none;
}

.text-2xs {
  font-size: 0.65rem;
}

.task-item {
  transition: background-color 0.2s ease;
}

.task-item:last-child {
  border-bottom: none;
}
</style>
