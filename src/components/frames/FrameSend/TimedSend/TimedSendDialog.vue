<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSendFrameInstancesStore } from '../../../../stores/frames/sendFrameInstancesStore';
import { useSendTasksStore } from '../../../../stores/frames/sendTasksStore';
import { useConnectionTargets } from '../../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../../composables/frames/sendFrame/useSendTaskManager';
import { useTaskConfigManager } from '../../../../composables/frames/sendFrame/useTaskConfigManager';
import type { StrategyConfig } from '../../../../types/frames/sendInstances';

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();
const sendTasksStore = useSendTasksStore();

// 使用连接目标管理composable - 使用专用的存储键
const { availableTargets, selectedTargetId, refreshTargets } =
  useConnectionTargets('timed-send-targets');

// 使用任务管理器
const { createTimedSingleTask, startTask, stopTask, isProcessing, processingError } =
  useSendTaskManager();

// 使用任务配置管理器
const { saveConfigToUserFile, loadConfigFromUserFile } = useTaskConfigManager();

const props = defineProps<{
  instanceId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 定时发送设置
const interval = ref(1000); // 默认1000ms
const repeatCount = ref(1); // 默认1次
const isInfinite = ref(false); // 是否无限循环
const isSending = ref(false);
const progress = ref(0);
const currentCount = ref(0);
const sendError = ref('');
const currentTaskId = ref<string | null>(null);

// 计算属性：是否可以开始发送
const canStartSend = computed(() => {
  return (
    !isSending.value &&
    interval.value > 0 &&
    (isInfinite.value || repeatCount.value > 0) &&
    selectedTargetId.value !== ''
  );
});

// 当前选中的实例
const currentInstance = computed(() => {
  if (!props.instanceId) return null;
  return sendFrameInstancesStore.instances.find((i) => i.id === props.instanceId) || null;
});

// 监听当前任务状态
const currentTask = computed(() => {
  if (!currentTaskId.value) return null;
  return sendTasksStore.getTaskById(currentTaskId.value);
});

// 监听任务状态变化，同步本地状态
watch(
  currentTask,
  (task) => {
    if (!task) {
      isSending.value = false;
      progress.value = 0;
      currentCount.value = 0;
      return;
    }

    // 根据任务状态更新本地状态
    switch (task.status) {
      case 'running':
        isSending.value = true;
        break;
      case 'completed':
      case 'error':
      case 'idle':
        isSending.value = false;
        break;
    }

    // 更新进度信息
    if (task.progress) {
      currentCount.value = task.progress.currentCount || 0;
      progress.value = task.progress.percentage || 0;
    }
  },
  { immediate: true, deep: true },
);

// 添加任务继续确认对话框的状态
const showTaskDialog = ref(false);

// 关闭对话框
function handleClose() {
  // 如果有正在运行的任务，显示确认对话框
  if (currentTaskId.value && isSending.value) {
    showTaskContinueDialog();
  } else {
    emit('close');
  }
}

// 显示任务继续确认对话框
function showTaskContinueDialog() {
  showTaskDialog.value = true;
}

// 用户选择停止任务并关闭
function stopTaskAndClose() {
  if (currentTaskId.value) {
    stopTask(currentTaskId.value);
  }
  showTaskDialog.value = false;
  emit('close');
}

// 用户选择让任务在后台继续运行
function continueTaskInBackground() {
  showTaskDialog.value = false;
  emit('close');
}

// 开始定时发送
async function startTimedSend() {
  if (!canStartSend.value || !currentInstance.value) return;

  isSending.value = true;
  currentCount.value = 0;
  progress.value = 0;
  sendError.value = '';

  console.log('TimedSendDialog - 开始创建定时发送任务，用户设置:', {
    interval: interval.value,
    repeatCount: repeatCount.value,
    isInfinite: isInfinite.value,
    selectedTargetId: selectedTargetId.value,
    instanceId: props.instanceId,
    instanceLabel: currentInstance.value.label,
  });

  try {
    // 使用任务管理器创建并启动任务
    const taskId = createTimedSingleTask(
      props.instanceId,
      selectedTargetId.value,
      interval.value,
      repeatCount.value,
      isInfinite.value,
      `定时发送-${currentInstance.value.label}`,
    );

    console.log('TimedSendDialog - 创建任务结果:', { taskId });

    if (taskId) {
      currentTaskId.value = taskId;
      const started = await startTask(taskId);

      console.log('TimedSendDialog - 启动任务结果:', { started, taskId });

      if (!started) {
        throw new Error(processingError.value || '启动任务失败');
      }

      // 任务启动成功，保持对话框打开以便用户查看发送进度
      console.log('定时发送任务已启动，任务ID:', taskId);
    } else {
      throw new Error(processingError.value || '创建任务失败');
    }
  } catch (error) {
    console.error('启动定时发送失败:', error);
    isSending.value = false;
    sendError.value = error instanceof Error ? error.message : '发送失败';
  }
}

// 停止定时发送
function stopTimedSend() {
  if (currentTaskId.value) {
    stopTask(currentTaskId.value);
  }
  emit('close');
}

/**
 * 保存当前配置到文件
 */
async function saveCurrentConfig() {
  if (!currentInstance.value) {
    sendError.value = '没有可保存的实例';
    return;
  }

  try {
    // 构建策略配置
    const strategyConfig: StrategyConfig = {
      type: 'timed',
      sendInterval: interval.value,
      repeatCount: repeatCount.value,
      isInfinite: isInfinite.value,
    };

    // 构建目标配置
    const targets = [
      {
        instanceId: props.instanceId,
        targetId: selectedTargetId.value,
        interval: 0, // 单帧发送不需要间隔
      },
    ];

    const configName = `单帧定时发送配置-${currentInstance.value.label}`;
    const result = await saveConfigToUserFile(
      [currentInstance.value],
      targets,
      strategyConfig,
      configName,
      `定时发送配置：每${interval.value}ms发送一次，${isInfinite.value ? '无限循环' : `重复${repeatCount.value}次`}`,
    );

    if (!result.success) {
      throw new Error(result.message || '保存配置失败');
    }
  } catch (error) {
    console.error('保存配置失败:', error);
    sendError.value = error instanceof Error ? error.message : '保存失败';
  }
}

/**
 * 从文件加载配置
 */
async function loadSavedConfig() {
  try {
    const result = await loadConfigFromUserFile();

    if (!result.success || !result.data) {
      if (result.message && !result.message.includes('取消')) {
        throw new Error(result.message);
      }
      return;
    }

    const { strategy } = result.data;

    // 如果是定时策略配置，恢复设置
    if (strategy && strategy.type === 'timed') {
      interval.value = strategy.sendInterval;
      repeatCount.value = strategy.repeatCount;
      isInfinite.value = strategy.isInfinite;
    }

    sendError.value = '';
  } catch (error) {
    console.error('加载配置失败:', error);
    sendError.value = error instanceof Error ? error.message : '加载失败';
  }
}

// 页面加载时刷新可用目标
refreshTargets();
</script>

<template>
  <div class="timed-send-dialog h-full">
    <div class="flex flex-col space-y-3 h-full bg-industrial-panel p-4">
      <!-- 标题信息 -->
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-industrial-primary text-base font-medium flex items-center">
              <q-icon name="schedule" size="sm" class="mr-2 text-blue-5" />
              定时发送设置
            </h2>
            <div class="text-xs text-industrial-secondary mt-1 ml-6">
              {{ currentInstance?.label || '选中帧实例' }} - 设置定时重复发送参数
            </div>
          </div>
          <div class="flex gap-2">
            <q-btn
              flat
              dense
              icon="save"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md text-xs"
              @click="saveCurrentConfig"
              :disable="isSending || isProcessing"
            >
              <q-tooltip>保存配置</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="folder_open"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md text-xs"
              @click="loadSavedConfig"
              :disable="isSending || isProcessing"
            >
              <q-tooltip>加载配置</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>

      <!-- 配置区域 -->
      <div class="flex-1 overflow-auto">
        <!-- 发送目标选择 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="send_to_mobile" size="xs" class="mr-1 text-blue-5" />
              <span>发送目标</span>
            </div>

            <q-select
              v-model="selectedTargetId"
              :options="availableTargets"
              option-value="id"
              option-label="name"
              dense
              outlined
              emit-value
              map-options
              dark
              bg-color="rgba(18, 35, 63, 0.7)"
              class="w-full"
              :disable="isSending || isProcessing"
              input-class="py-0.5 px-1"
              hide-bottom-space
            >
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label>{{ scope.opt.name }}</q-item-label>
                    <q-item-label caption>
                      <span
                        :class="
                          scope.opt.status === 'connected' ? 'text-positive' : 'text-negative'
                        "
                      >
                        {{ scope.opt.status === 'connected' ? '已连接' : '未连接' }}
                      </span>
                      <span v-if="scope.opt.description" class="ml-2 text-industrial-tertiary">
                        {{ scope.opt.description }}
                      </span>
                    </q-item-label>
                  </q-item-section>

                  <q-item-section side>
                    <q-icon
                      :name="
                        scope.opt.type === 'serial'
                          ? 'usb'
                          : scope.opt.type === 'network'
                            ? 'lan'
                            : 'device_hub'
                      "
                      size="xs"
                      class="text-blue-5"
                    />
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>
        </div>

        <!-- 时间间隔设置 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="timer" size="xs" class="mr-1 text-blue-5" />
              <span>时间间隔</span>
            </div>

            <div class="flex items-center">
              <q-input
                v-model.number="interval"
                type="number"
                min="100"
                max="60000"
                dense
                outlined
                dark
                bg-color="rgba(18, 35, 63, 0.7)"
                class="w-24"
                :rules="[(val) => val > 0 || '必须大于0']"
                :disable="isSending || isProcessing"
                input-class="py-0.5 px-1"
                hide-bottom-space
              />
              <span class="ml-2 text-xs text-industrial-secondary">毫秒</span>
            </div>
          </div>
        </div>

        <!-- 重复次数设置 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="repeat" size="xs" class="mr-1 text-blue-5" />
              <span>重复次数</span>
            </div>

            <div class="flex items-center h-[40px]">
              <q-checkbox
                v-model="isInfinite"
                dark
                dense
                :disable="isSending || isProcessing"
                label="无限循环"
                class="text-xs text-industrial-primary mr-4"
              />

              <div v-if="!isInfinite" class="flex items-center">
                <q-input
                  v-model.number="repeatCount"
                  type="number"
                  min="1"
                  max="10000"
                  dense
                  outlined
                  dark
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-24"
                  :rules="[(val) => val > 0 || '必须大于0']"
                  :disable="isSending || isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                />
                <span class="ml-2 text-xs text-industrial-secondary">次</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 错误信息 -->
        <div
          v-if="sendError || processingError"
          class="bg-industrial-secondary rounded-md p-3 shadow-md border border-red-800 mb-3"
        >
          <div class="flex items-start">
            <q-icon name="error" color="negative" size="sm" class="mt-0.5 mr-2" />
            <div class="text-xs text-red-400">
              {{ sendError || processingError }}
            </div>
          </div>
        </div>

        <!-- 发送进度 -->
        <div
          v-if="isSending || currentTask"
          class="bg-industrial-secondary rounded-md p-3 shadow-md border border-blue-800 mb-3"
        >
          <div class="text-xs font-medium text-industrial-primary mb-2 flex items-center">
            <q-icon name="trending_up" size="xs" class="mr-1 text-blue-5" />
            发送进度
          </div>

          <div class="space-y-2">
            <!-- 进度条 -->
            <div v-if="!isInfinite" class="flex items-center">
              <div class="text-xs text-industrial-secondary w-16">进度:</div>
              <div class="flex-1 bg-industrial-primary rounded-full h-2 mx-2">
                <div
                  class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${progress}%` }"
                ></div>
              </div>
              <div class="text-xs text-industrial-accent w-12">{{ progress }}%</div>
            </div>

            <!-- 发送计数 -->
            <div class="flex items-center">
              <div class="text-xs text-industrial-secondary w-16">计数:</div>
              <div class="text-xs text-industrial-primary">
                {{ currentCount }}{{ isInfinite ? '' : ` / ${repeatCount}` }}
              </div>
            </div>

            <!-- 任务状态 -->
            <div class="flex items-center">
              <div class="text-xs text-industrial-secondary w-16">状态:</div>
              <div
                class="text-xs"
                :class="{
                  'text-blue-400': currentTask?.status === 'running',
                  'text-green-400': currentTask?.status === 'completed',
                  'text-red-400': currentTask?.status === 'error',
                  'text-gray-400': currentTask?.status === 'idle',
                }"
              >
                {{
                  currentTask?.status === 'running'
                    ? '运行中'
                    : currentTask?.status === 'completed'
                      ? '已完成'
                      : currentTask?.status === 'error'
                        ? '错误'
                        : '空闲'
                }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 按钮区域 -->
      <div class="flex justify-between mt-3 pt-3 border-t border-industrial">
        <q-btn
          flat
          label="关闭"
          color="blue-grey"
          class="rounded-md px-4 bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 text-xs"
          @click="handleClose"
          :disable="isProcessing"
        />
        <div class="flex gap-2">
          <!-- 停止按钮 -->
          <q-btn
            v-if="isSending"
            color="negative"
            icon="stop"
            label="停止发送"
            class="rounded-md px-4 text-xs"
            @click="stopTimedSend"
            :disable="isProcessing"
          />
          <!-- 开始按钮 -->
          <q-btn
            v-else
            color="primary"
            icon="schedule"
            label="开始定时发送"
            class="rounded-md px-4 text-xs"
            @click="startTimedSend"
            :disable="!canStartSend || isProcessing"
            :loading="isProcessing"
          />
        </div>
      </div>
    </div>

    <!-- 任务继续确认对话框 -->
    <q-dialog v-model="showTaskDialog" persistent>
      <q-card class="bg-industrial-panel border border-industrial">
        <q-card-section class="row items-center">
          <q-icon name="task_alt" color="primary" size="md" class="q-mr-sm" />
          <div>
            <div class="text-h6 text-industrial-primary">任务正在运行</div>
            <div class="text-industrial-secondary text-sm mt-1">
              定时发送任务仍在后台运行，您希望如何处理？
            </div>
          </div>
        </q-card-section>

        <q-card-section class="pt-0">
          <div class="text-xs text-industrial-secondary bg-industrial-secondary p-2 rounded">
            <q-icon name="info" size="xs" class="mr-1" />
            任务将继续在后台执行，您可以随时通过任务监控查看进度和状态
          </div>
        </q-card-section>

        <q-card-actions align="right" class="bg-industrial-secondary">
          <q-btn flat label="停止任务" color="negative" @click="stopTaskAndClose" class="text-xs" />
          <q-btn
            label="后台运行"
            color="primary"
            @click="continueTaskInBackground"
            class="text-xs"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style>
.text-2xs {
  font-size: 0.65rem;
}

/* 修改Quasar的样式，消除底部空间 */
.q-field--with-bottom.q-field--hide-bottom-space .q-field__bottom {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>
