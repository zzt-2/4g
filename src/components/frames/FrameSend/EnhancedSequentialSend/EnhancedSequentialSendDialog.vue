<template>
  <div class="enhanced-sequential-send-dialog h-full w-full">
    <div class="flex flex-col h-full bg-industrial-panel p-4">
      <!-- 标题信息 -->
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-industrial-primary text-base font-medium flex items-center">
              <q-icon name="queue_play_next" size="sm" class="mr-2 text-blue-5" />
              多帧发送设置
            </h2>
            <div class="text-xs text-industrial-secondary mt-1 ml-6">
              支持立即、定时、触发三种发送策略的多帧配置
            </div>
          </div>
          <div class="flex gap-2">
            <ImportExportActions
              :getData="handleGetTaskConfigData"
              :setData="handleSetTaskConfigData"
              storageDir="data/frames/taskConfigs"
              exportTitle="导出任务配置"
              importTitle="导入任务配置"
            />
          </div>
        </div>
      </div>

      <!-- 策略选择区域 -->
      <StrategySelector
        v-model:strategy="sendStrategy"
        :preview-text="getStrategyPreview()"
        :is-disabled="isSending || isProcessing"
        @open-config="openStrategyConfig"
      />

      <!-- 实例列表区域 -->
      <InstanceSequenceTable
        :instances="selectedInstances"
        :available-targets="availableTargets"
        :available-instances="availableInstancesForTable"
        v-model:selected-instance-for-add="selectedInstanceForAdd"
        :is-loading="isSending || isProcessing"
        @update-target="updateInstanceTarget"
        @update-interval="updateInstanceInterval"
        @move-up="moveInstanceUp"
        @move-down="moveInstanceDown"
        @remove-instance="removeInstanceFromSequence"
        @add-instance="addInstanceToSequence"
      />

      <!-- 任务状态和进度显示 -->
      <TaskStatusPanel
        :task="currentTask"
        :error-message="sequenceError || processingError || ''"
      />

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
          <q-btn
            v-if="currentTask && currentTask.status === 'running'"
            color="negative"
            icon="stop"
            label="停止任务"
            class="rounded-md px-4 text-xs"
            @click="stopCurrentTask"
            :disable="isProcessing"
          />
          <q-btn
            v-else
            color="primary"
            :icon="getStartButtonIcon()"
            :label="getStartButtonLabel()"
            class="rounded-md px-4 text-xs"
            @click="startSendingTask"
            :disable="!canStartTask"
            :loading="isProcessing"
          />
        </div>
      </div>
    </div>

    <!-- 独立的策略配置对话框 -->
    <TimedConfigDialog
      v-if="sendStrategy === 'timed'"
      v-model="showTimedConfig"
      :initial-config="timedConfig"
      @confirm="onTimedConfigConfirm"
      @cancel="showTimedConfig = false"
    />

    <TriggerConfigDialog
      v-if="sendStrategy === 'triggered'"
      v-model="showTriggerConfig"
      :initial-config="sendFrameInstancesStore.triggerStrategyConfig"
      :source-options="sourceOptions"
      :frame-options="frameOptions"
      @confirm="onTriggerConfigConfirm"
      @cancel="showTriggerConfig = false"
    />

    <!-- 任务继续确认对话框 -->
    <q-dialog v-model="showTaskDialog">
      <q-card>
        <q-card-section>
          <div class="text-h6">任务继续确认</div>
          <p>任务正在运行中，您希望停止任务并关闭，还是让任务在后台继续运行？</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="停止任务并关闭" color="negative" @click="stopTaskAndClose" />
          <q-btn
            flat
            label="让任务在后台继续运行"
            color="primary"
            @click="continueTaskInBackground"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSendFrameInstancesStore } from '../../../../stores/frames/sendFrameInstancesStore';
import { useSendTasksStore } from '../../../../stores/frames/sendTasksStore';
import { useConnectionTargets } from '../../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../../composables/frames/sendFrame/useSendTaskManager';
import { useStrategyConfig } from '../../../../composables/frames/useStrategyConfig';
import { useTaskConfigManager } from '../../../../composables/frames/sendFrame/useTaskConfigManager';
import {
  extractInstancesFromConfig,
  validateInstanceReferences,
  validateTaskConfigFile,
} from '../../../../utils/frames/taskConfigUtils';
import type { FrameInstanceInTask } from '../../../../stores/frames/sendTasksStore';
import type {
  TimedStrategyConfig,
  TriggerStrategyConfig,
} from '../../../../types/frames/sendInstances';
import { useStorage } from '@vueuse/core';
import TimedConfigDialog from '../TimedSend/TimedConfigDialog.vue';
import TriggerConfigDialog from '../TriggerSend/TriggerConfigDialog.vue';
import ImportExportActions from '../../../common/ImportExportActions.vue';
import StrategySelector from './StrategySelector.vue';
import InstanceSequenceTable from './InstanceSequenceTable.vue';
import TaskStatusPanel from './TaskStatusPanel.vue';
import { TaskConfigFile } from 'src/types/frames/taskConfig';

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();
const sendTasksStore = useSendTasksStore();

// 使用连接目标管理
const { availableTargets, refreshTargets } = useConnectionTargets(
  'enhanced-sequential-send-targets',
);

// 使用任务管理器
const {
  createSequentialTask,
  createTimedMultipleTask,
  createTriggeredMultipleTask,
  createTimedTriggeredMultipleTask,
  startTask,
  stopTask,
  isProcessing,
  processingError,
} = useSendTaskManager();

// 使用策略配置管理
const { timedConfig, currentStrategyType, setStrategyType, updateTimedConfig, validation } =
  useStrategyConfig();

// 使用任务配置管理器
const { createTaskConfigData, parseTaskConfigData } = useTaskConfigManager();

const emit = defineEmits<{
  close: [];
}>();

// 基础状态
const isSending = ref(false);
const sequenceError = ref('');
const selectedInstanceForAdd = ref('');
const showTimedConfig = ref(false);
const showTriggerConfig = ref(false);
const currentTaskId = ref<string | null>(null);
const showTaskDialog = ref(false);

// 发送策略状态
const sendStrategy = computed({
  get: () => currentStrategyType.value,
  set: (value) => setStrategyType(value),
});

// 当前任务信息
const currentTask = computed(() => {
  if (!currentTaskId.value) return null;
  return sendTasksStore.getTaskById(currentTaskId.value) || null;
});

// 选中的实例列表
const selectedInstances = useStorage<FrameInstanceInTask[]>(
  'enhanced-sequential-send-instances',
  [],
);

// 可用的帧实例（用于表格显示）
const availableInstancesForTable = computed(() =>
  sendFrameInstancesStore.instances.map((instance) => ({
    id: instance.id,
    label: instance.label,
    description: instance.description || '',
  })),
);

// 连接来源选项（用于触发配置）
const sourceOptions = computed(() =>
  availableTargets.value.map((target) => ({
    id: target.id,
    name: target.name,
    ...(target.description ? { description: target.description } : {}),
  })),
);

// 帧选项（用于触发配置）
const frameOptions = computed(() =>
  sendFrameInstancesStore.instances.map((instance) => ({
    id: instance.id,
    name: instance.label,
    fields:
      instance.fields?.map((field) => ({
        id: field.id,
        name: field.label,
      })) || [],
  })),
);

// 计算属性：是否可以开始任务
const canStartTask = computed(() => {
  return (
    !isSending.value &&
    selectedInstances.value.length > 0 &&
    !isProcessing.value &&
    validation.value.valid
  );
});

/**
 * 获取开始按钮图标
 */
function getStartButtonIcon(): string {
  switch (sendStrategy.value) {
    case 'timed':
      return 'schedule';
    case 'triggered':
      return 'sensors';
    default:
      return 'play_arrow';
  }
}

/**
 * 获取开始按钮标签
 */
function getStartButtonLabel(): string {
  switch (sendStrategy.value) {
    case 'timed':
      return '开始定时发送';
    case 'triggered':
      return '开始触发发送';
    default:
      return '开始立即发送';
  }
}

/**
 * 获取策略预览文本
 */
function getStrategyPreview(): string {
  if (sendStrategy.value === 'timed' && timedConfig.value) {
    const { sendInterval, repeatCount, isInfinite } = timedConfig.value;
    return `每${sendInterval}ms发送一次，${isInfinite ? '无限循环' : `重复${repeatCount}次`}`;
  } else if (sendStrategy.value === 'triggered') {
    const config = sendFrameInstancesStore.triggerStrategyConfig;
    if (config.triggerType === 'condition') {
      const sourceName =
        sourceOptions.value.find((s) => s.id === config.sourceId)?.name || '未选择';
      const frameName =
        frameOptions.value.find((f) => f.id === config.triggerFrameId)?.name || '未选择';
      const conditionCount = config.conditions?.length || 0;
      return `监听来源: ${sourceName}，触发帧: ${frameName}，条件数: ${conditionCount}`;
    } else if (config.triggerType === 'time') {
      const executeTime = config.executeTime
        ? new Date(config.executeTime).toLocaleString('zh-CN')
        : '未设置';
      return `时间触发: ${executeTime}${config.isRecurring ? ' (重复执行)' : ''}`;
    }
  }
  return '立即发送';
}

/**
 * 添加实例到序列
 */
function addInstanceToSequence(instanceId: string) {
  const instance = sendFrameInstancesStore.instances.find((i) => i.id === instanceId);
  if (!instance) return;

  const connectedTarget = availableTargets.value.find((t) => t.status === 'connected');
  const defaultTargetId = connectedTarget?.id || availableTargets.value[0]?.id || '';

  selectedInstances.value.push({
    id: `seq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    instanceId,
    targetId: defaultTargetId,
    interval: 1000,
  });

  selectedInstanceForAdd.value = '';
}

/**
 * 从序列中移除实例
 */
function removeInstanceFromSequence(index: number) {
  if (isSending.value || index < 0 || index >= selectedInstances.value.length) return;
  selectedInstances.value.splice(index, 1);
}

/**
 * 上移实例
 */
function moveInstanceUp(index: number) {
  if (isSending.value || index <= 0) return;
  const temp = selectedInstances.value[index];
  const prevInstance = selectedInstances.value[index - 1];

  if (temp && prevInstance) {
    selectedInstances.value[index] = prevInstance;
    selectedInstances.value[index - 1] = temp;
  }
}

/**
 * 下移实例
 */
function moveInstanceDown(index: number) {
  if (isSending.value || index >= selectedInstances.value.length - 1) return;
  const temp = selectedInstances.value[index];
  const nextInstance = selectedInstances.value[index + 1];

  if (temp && nextInstance) {
    selectedInstances.value[index] = nextInstance;
    selectedInstances.value[index + 1] = temp;
  }
}

/**
 * 更新实例延时
 */
function updateInstanceInterval(index: number, value: number) {
  if (isSending.value || index < 0 || index >= selectedInstances.value.length) return;
  const intervalValue = typeof value === 'number' ? value : 0;
  const instance = selectedInstances.value[index];
  if (instance) {
    instance.interval = intervalValue < 0 ? 0 : intervalValue;
  }
}

/**
 * 更新实例目标
 */
function updateInstanceTarget(index: number, targetId: string) {
  if (isSending.value || index < 0 || index >= selectedInstances.value.length) return;
  const instance = selectedInstances.value[index];
  if (instance) {
    instance.targetId = targetId;
  }
}

/**
 * 打开策略配置对话框
 */
function openStrategyConfig() {
  if (sendStrategy.value === 'timed') {
    showTimedConfig.value = true;
  } else if (sendStrategy.value === 'triggered') {
    showTriggerConfig.value = true;
  }
}

/**
 * 定时配置确认
 */
function onTimedConfigConfirm(config: TimedStrategyConfig) {
  updateTimedConfig(config);
  showTimedConfig.value = false;
}

/**
 * 触发配置确认
 */
function onTriggerConfigConfirm(config: TriggerStrategyConfig) {
  sendFrameInstancesStore.loadFromStrategyConfig(config);
  showTriggerConfig.value = false;
}

/**
 * 获取任务配置数据用于导出
 */
function handleGetTaskConfigData() {
  if (selectedInstances.value.length === 0) {
    throw new Error('没有可导出的配置');
  }

  const instances = selectedInstances.value
    .map((item) => {
      const instance = sendFrameInstancesStore.instances.find((i) => i.id === item.instanceId);
      return instance!;
    })
    .filter(Boolean);

  const targets = selectedInstances.value.map((item) => ({
    instanceId: item.instanceId,
    targetId: item.targetId,
    interval: item.interval || 1000,
  }));

  const strategy =
    sendStrategy.value === 'triggered'
      ? sendFrameInstancesStore.triggerStrategyConfig
      : timedConfig.value || { type: 'immediate' };
  const configName = `多帧发送配置`;

  return createTaskConfigData(instances, targets, strategy, configName);
}

/**
 * 设置任务配置数据用于导入
 */
async function handleSetTaskConfigData(configFileContent: unknown) {
  try {
    // 先验证配置文件格式
    if (!validateTaskConfigFile(configFileContent)) {
      throw new Error('无效的配置文件格式');
    }

    // 验证引用的实例是否在当前系统中存在
    const extractedData = extractInstancesFromConfig(configFileContent as TaskConfigFile);
    if (extractedData.instanceRefs) {
      const validation = validateInstanceReferences(
        extractedData.instanceRefs,
        sendFrameInstancesStore.instances,
      );
      if (!validation.valid) {
        sequenceError.value = `配置验证失败:\n${validation.errors.join('\n')}`;
        throw new Error(sequenceError.value);
      }
    }

    // 解析配置数据
    const configData = parseTaskConfigData(configFileContent);

    selectedInstances.value = configData.targets.map((target) => ({
      id: `loaded_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      instanceId: target.instanceId,
      targetId: target.targetId,
      interval: target.interval || 1000,
    }));

    // 应用导入的策略配置，包括具体的配置参数
    if (configData.strategy) {
      // 根据策略类型应用配置
      if (configData.strategy.type === 'triggered') {
        setStrategyType('triggered');
        sendFrameInstancesStore.loadFromStrategyConfig(configData.strategy);
      } else if (configData.strategy.type === 'timed') {
        setStrategyType('timed');
        updateTimedConfig(configData.strategy);
      } else {
        setStrategyType('immediate');
      }
    } else {
      setStrategyType('immediate');
    }

    sequenceError.value = '';
  } catch (error) {
    console.error('导入配置失败:', error);
    sequenceError.value = error instanceof Error ? error.message : '导入失败';
    throw error;
  }
}

/**
 * 开始发送任务
 */
async function startSendingTask() {
  if (!canStartTask.value) return;

  isSending.value = true;
  sequenceError.value = '';

  try {
    let taskId: string | null = null;

    switch (sendStrategy.value) {
      case 'immediate':
        taskId = createSequentialTask(
          selectedInstances.value,
          '多帧立即发送',
          `包含${selectedInstances.value.length}个帧实例的立即发送任务`,
        );
        break;

      case 'timed':
        if (!timedConfig.value) {
          throw new Error('定时配置不完整');
        }
        taskId = createTimedMultipleTask(
          selectedInstances.value,
          timedConfig.value.sendInterval,
          timedConfig.value.repeatCount,
          timedConfig.value.isInfinite,
          '多帧定时发送',
        );
        break;

      case 'triggered': {
        const config = sendFrameInstancesStore.triggerStrategyConfig;
        if (config.triggerType === 'condition') {
          // 确保条件触发的必要字段存在
          if (!config.sourceId || !config.triggerFrameId || !config.conditions) {
            throw new Error('条件触发配置不完整');
          }
          taskId = createTriggeredMultipleTask(
            selectedInstances.value,
            config.sourceId,
            config.triggerFrameId,
            config.conditions,
            '多帧条件触发发送',
            `包含${selectedInstances.value.length}个帧实例的条件触发任务`,
            config.continueListening ?? true,
          );
        } else if (config.triggerType === 'time') {
          // 时间触发逻辑
          if (!config.executeTime) {
            throw new Error('时间触发配置不完整：缺少执行时间');
          }
          taskId = createTimedTriggeredMultipleTask(
            selectedInstances.value,
            config.executeTime,
            config.isRecurring || false,
            config.recurringType,
            config.recurringInterval,
            config.endTime,
            '多帧时间触发发送',
            `包含${selectedInstances.value.length}个帧实例的时间触发任务`,
          );
        } else {
          throw new Error('未知的触发类型');
        }
        break;
      }
    }

    if (taskId) {
      currentTaskId.value = taskId;
      const started = await startTask(taskId);
      if (!started) {
        throw new Error(processingError.value || '启动任务失败');
      }
      console.log('多帧发送任务已启动，任务ID:', taskId);
    } else {
      throw new Error(processingError.value || '创建任务失败');
    }
  } catch (error) {
    console.error('启动发送任务失败:', error);
    sequenceError.value = error instanceof Error ? error.message : '任务启动失败';
  } finally {
    isSending.value = false;
  }
}

/**
 * 关闭对话框
 */
function handleClose() {
  if (currentTask.value && currentTask.value.status === 'running') {
    showTaskDialog.value = true;
  } else {
    emit('close');
  }
}

/**
 * 用户选择停止任务并关闭
 */
function stopTaskAndClose() {
  if (currentTaskId.value) {
    stopTask(currentTaskId.value);
  }
  showTaskDialog.value = false;
  emit('close');
}

/**
 * 用户选择让任务在后台继续运行
 */
function continueTaskInBackground() {
  showTaskDialog.value = false;
  emit('close');
}

/**
 * 停止当前任务
 */
function stopCurrentTask() {
  if (!currentTaskId.value) return;

  const success = stopTask(currentTaskId.value);
  if (success) {
    currentTaskId.value = null;
    isSending.value = false;
    console.log('任务已停止');
  } else {
    sequenceError.value = processingError.value || '停止任务失败';
  }
}

// 页面加载时刷新可用目标
refreshTargets();
</script>

<style scoped>
.enhanced-sequential-send-dialog {
  min-width: 800px;
  max-width: 95vw;
}
</style>
