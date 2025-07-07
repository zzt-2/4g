<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { TaskType, TaskStatus, SendTask } from '../../../stores/frames/sendTasksStore';

// 定义props
const props = defineProps<{
  // 控制对话框显示/隐藏
  modelValue?: boolean;
  // 控制是否显示任务类型筛选
  showFilters?: boolean;
}>();

// 定义emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

// 任务管理器
const { activeTasks, isProcessing, processingError, stopTask, startTask, pauseTask, resumeTask } =
  useSendTaskManager();

// 状态
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
  'waiting-schedule': '等待执行',
};

// 任务状态颜色
const taskStatusColors: Record<TaskStatus, string> = {
  idle: 'blue-grey',
  running: 'blue',
  paused: 'orange',
  completed: 'positive',
  error: 'negative',
  'waiting-trigger': 'purple',
  'waiting-schedule': 'indigo',
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

// 计算任务的剩余时间（用于定时任务和时间触发任务）
function calculateRemainingTime(task: SendTask): string {
  if (
    (task.type.includes('timed') || task.type.includes('triggered')) &&
    (task.status === 'running' || task.status === 'waiting-schedule') &&
    task.progress?.nextExecutionTime
  ) {
    const remaining = task.progress.nextExecutionTime - Date.now();
    if (remaining <= 0) return '即将执行';

    const seconds = Math.floor(remaining / 1000);
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}时${minutes}分后`;
    } else if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}分${remainingSeconds}秒后`;
    } else {
      return `${seconds}秒后`;
    }
  }
  return '';
}

// 计算任务执行时长
function calculateDuration(task: SendTask): string {
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

// 关闭对话框
function handleClose() {
  emit('update:modelValue', false);
  emit('close');
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
  <q-dialog
    :model-value="props.modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    persistent
  >
    <q-card
      style="width: 900px; max-width: 95vw"
      class="bg-industrial-secondary rounded-lg shadow-2xl border border-industrial"
    >
      <q-card-section class="bg-industrial-panel p-4">
        <div class="active-tasks-monitor-dialog h-full w-full">
          <div class="flex flex-col h-full bg-industrial-panel">
            <!-- 标题栏 -->
            <div class="mb-4">
              <div class="flex justify-between items-center">
                <div>
                  <h2 class="text-industrial-primary text-base font-medium flex items-center">
                    <q-icon name="task_alt" size="sm" class="mr-2 text-blue-5" />
                    活动任务监视器
                    <span v-if="filteredTasks.length > 0" class="text-blue-5 ml-2 text-sm">
                      ({{ filteredTasks.length }})
                    </span>
                  </h2>
                  <div class="text-xs text-industrial-secondary mt-1 ml-6">
                    监控所有正在执行的发送任务状态
                  </div>
                </div>
                <div class="flex items-center">
                  <q-badge
                    v-if="isProcessing"
                    color="blue"
                    text-color="white"
                    class="q-mr-sm text-2xs"
                  >
                    处理中
                  </q-badge>
                  <q-btn
                    flat
                    dense
                    icon="close"
                    color="blue-grey"
                    class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md text-xs"
                    @click="handleClose"
                  >
                    <q-tooltip>关闭</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </div>

            <!-- 筛选器 -->
            <div
              v-if="props.showFilters && activeTasks.length > 0"
              class="mb-4 p-3 bg-industrial-highlight rounded border border-industrial"
            >
              <div class="text-subtitle2 text-industrial-primary mb-3 flex items-center">
                <q-icon name="filter_list" class="mr-2" />
                任务筛选
              </div>

              <div class="flex flex-wrap gap-4">
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
                      { label: '等待执行', value: 'waiting-schedule' },
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
            </div>

            <!-- 任务列表 -->
            <div
              class="flex-1 bg-industrial-secondary rounded-md shadow-md border border-industrial overflow-hidden"
            >
              <div class="task-list overflow-auto" style="max-height: 400px">
                <div v-if="filteredTasks.length === 0" class="empty-state p-8 text-center">
                  <q-icon name="info" color="blue-grey" size="lg" class="mb-4" />
                  <p class="text-industrial-secondary text-sm m-0">
                    {{ activeTasks.length > 0 ? '没有匹配筛选条件的任务' : '没有活动的发送任务' }}
                  </p>
                </div>

                <div
                  v-for="task in filteredTasks"
                  :key="task.id"
                  class="task-item p-3 border-b border-industrial hover:bg-industrial-highlight"
                  :class="{ 'bg-industrial-highlight': selectedTaskId === task.id }"
                  @click="handleTaskAction('select', task.id)"
                >
                  <div class="flex justify-between items-start">
                    <!-- 任务信息 -->
                    <div class="flex-1 min-w-0">
                      <!-- 任务标题行 -->
                      <div class="flex items-center">
                        <q-icon
                          :name="taskTypeIcons[task.type]"
                          class="text-blue-5 mr-2"
                          size="sm"
                        />
                        <span class="text-industrial-primary text-sm font-medium truncate">
                          {{ task.name }}
                        </span>
                        <q-badge :color="taskStatusColors[task.status]" class="ml-2 text-xs">
                          {{ taskStatusLabels[task.status] }}
                        </q-badge>
                        <q-badge color="grey-8" class="ml-2 text-xs">
                          {{ taskTypeLabels[task.type] }}
                        </q-badge>
                      </div>

                      <!-- 进度信息 -->
                      <div class="mt-2 flex items-center">
                        <template v-if="task.progress">
                          <!-- 通用进度信息 -->
                          <div
                            v-if="task.status === 'running' || task.status === 'paused'"
                            class="flex-1 mr-4"
                          >
                            <q-linear-progress
                              :value="(task.progress.percentage || 0) / 100"
                              :color="task.status === 'paused' ? 'orange' : 'primary'"
                              size="sm"
                              class="mb-2"
                            />
                            <div class="flex justify-between">
                              <span class="text-xs text-industrial-secondary">
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
                              <span class="text-xs text-industrial-secondary">
                                {{ (task.progress.percentage || 0).toFixed(0) }}%
                              </span>
                            </div>
                          </div>

                          <!-- 定时任务特有信息 -->
                          <div
                            v-if="task.type.includes('timed') && task.status === 'running'"
                            class="text-xs text-blue-400"
                          >
                            下次发送: {{ calculateRemainingTime(task) }}
                          </div>

                          <!-- 触发任务特有信息 -->
                          <div
                            v-if="
                              task.type.includes('triggered') && task.status === 'waiting-trigger'
                            "
                            class="text-xs text-purple-400"
                          >
                            等待触发条件满足
                          </div>

                          <!-- 时间触发任务特有信息 -->
                          <div
                            v-if="
                              task.type.includes('triggered') && task.status === 'waiting-schedule'
                            "
                            class="text-xs text-indigo-400"
                          >
                            {{
                              calculateRemainingTime(task)
                                ? `将在 ${calculateRemainingTime(task)} 执行`
                                : '等待执行时间到达'
                            }}
                          </div>
                        </template>

                        <!-- 运行时长 -->
                        <div
                          v-if="
                            task.status === 'running' ||
                            task.status === 'waiting-trigger' ||
                            task.status === 'waiting-schedule'
                          "
                          class="text-xs text-industrial-secondary ml-auto"
                        >
                          运行: {{ calculateDuration(task) }}
                        </div>

                        <!-- 错误信息 -->
                        <div v-if="task.errorInfo" class="text-xs text-negative">
                          错误: {{ task.errorInfo }}
                        </div>
                      </div>
                    </div>

                    <!-- 任务操作 -->
                    <div class="ml-4 flex items-center">
                      <!-- 运行中任务的操作 -->
                      <template v-if="task.status === 'running'">
                        <q-btn
                          flat
                          dense
                          round
                          size="sm"
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
                          size="sm"
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
                          size="sm"
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
                          size="sm"
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
                          size="sm"
                          icon="stop"
                          color="negative"
                          @click.stop="handleTaskAction('stop', task.id)"
                        >
                          <q-tooltip>停止监听</q-tooltip>
                        </q-btn>
                      </template>

                      <!-- 等待时间触发任务的操作 -->
                      <template v-else-if="task.status === 'waiting-schedule'">
                        <q-btn
                          flat
                          dense
                          round
                          size="sm"
                          icon="stop"
                          color="negative"
                          @click.stop="handleTaskAction('stop', task.id)"
                        >
                          <q-tooltip>停止定时</q-tooltip>
                        </q-btn>
                      </template>

                      <!-- 错误任务的操作 -->
                      <template v-else-if="task.status === 'error'">
                        <q-btn
                          flat
                          dense
                          round
                          size="sm"
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
              <div
                v-if="processingError"
                class="p-3 bg-red-900 bg-opacity-20 border-t border-red-800"
              >
                <div class="flex items-start">
                  <q-icon name="error" color="negative" size="sm" class="mt-0.5 mr-2" />
                  <div class="text-xs text-red-400">
                    {{ processingError }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.text-2xs {
  font-size: 0.65rem;
}

.task-item {
  transition: background-color 0.2s ease;
}

.task-item:last-child {
  border-bottom: none;
}

.active-tasks-monitor-dialog {
  min-width: 600px;
  max-width: 95vw;
}
</style>
