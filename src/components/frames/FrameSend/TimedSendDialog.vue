<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSerialStore } from '../../../stores/serialStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useConnectionTargets } from '../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { useTaskConfigManager } from '../../../composables/frames/sendFrame/useTaskConfigManager';
import type { StrategyConfig } from '../../../types/frames/sendInstances';

// 获取store实例
const serialStore = useSerialStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 使用连接目标管理composable - 使用专用的存储键
const { availableTargets, selectedTargetId, refreshTargets, parseTargetPath } =
  useConnectionTargets('timed-send-targets');

// 使用任务管理器
const { createTimedSingleTask, startTask, isProcessing, processingError } = useSendTaskManager();

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

// 关闭对话框
function handleClose() {
  emit('close');
}

// 开始定时发送
async function startTimedSend() {
  if (!canStartSend.value || !currentInstance.value) return;

  isSending.value = true;
  currentCount.value = 0;
  progress.value = 0;
  sendError.value = '';

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

    if (taskId) {
      currentTaskId.value = taskId;
      const started = await startTask(taskId);

      if (!started) {
        throw new Error(processingError.value || '启动任务失败');
      }

      // 启动成功，关闭对话框
      emit('close');
    } else {
      throw new Error(processingError.value || '创建任务失败');
    }
  } catch (error) {
    console.error('启动定时发送失败:', error);
    isSending.value = false;
    sendError.value = error instanceof Error ? error.message : '发送失败';
  }
}

// 停止定时发送 - 现在不再需要直接在组件里处理，由任务管理器管理
function stopTimedSend() {
  isSending.value = false;
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
        <div>
          <q-btn
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
