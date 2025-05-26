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
            <q-btn
              flat
              dense
              icon="save"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md text-xs"
              @click="saveCurrentConfig"
              :disable="isSending || selectedInstances.length === 0 || isProcessing"
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

      <!-- 策略选择区域 -->
      <div class="mb-4 p-3 bg-industrial-highlight rounded border border-industrial">
        <div class="text-subtitle2 text-industrial-primary mb-3 flex items-center">
          <q-icon name="tune" class="mr-2" />
          发送策略
        </div>

        <div class="flex items-center gap-6 mb-3">
          <q-option-group
            v-model="sendStrategy"
            :options="strategyOptions"
            inline
            color="primary"
            class="text-industrial-primary"
          />

          <q-btn
            v-if="sendStrategy !== 'immediate'"
            size="sm"
            color="accent"
            outline
            @click="openStrategyConfig"
            :disable="isSending || isProcessing"
            class="ml-2"
          >
            <q-icon name="settings" class="mr-1" />
            配置{{ strategyLabels[sendStrategy] }}参数
          </q-btn>
        </div>

        <!-- 策略预览 -->
        <div v-if="sendStrategy !== 'immediate'" class="text-xs text-industrial-secondary">
          <q-icon name="visibility" size="14px" class="mr-1" />
          当前配置: {{ getStrategyPreview() }}
        </div>
      </div>

      <!-- 实例列表区域 - 复用现有的表格结构 -->
      <div
        class="flex-1 flex flex-col bg-industrial-secondary rounded-md shadow-md border border-industrial p-2 overflow-hidden mb-3"
      >
        <div class="flex-1 overflow-auto">
          <q-table
            :rows="selectedInstances"
            :columns="columns"
            row-key="id"
            dark
            flat
            dense
            :pagination="pagination"
            :loading="isSending || isProcessing"
            binary-state-sort
            class="bg-transparent"
            table-style="table-layout: fixed; width: 100%"
          >
            <!-- 表头模板 -->
            <template v-slot:header="props">
              <q-tr :props="props">
                <q-th
                  v-for="col in props.cols"
                  :key="col.name"
                  :props="props"
                  :style="col.style"
                  :class="[
                    col.classes,
                    {
                      'text-left': col.align === 'left',
                      'text-right': col.align === 'right',
                      'text-center': col.align === 'center',
                    },
                  ]"
                >
                  {{ col.label }}
                </q-th>
              </q-tr>
            </template>

            <!-- 序号列 -->
            <template #body-cell-order="props">
              <q-td
                :props="props"
                class="text-center text-xs font-mono text-industrial-id"
                :style="props.col.style"
              >
                {{ props.value }}
              </q-td>
            </template>

            <!-- 实例名称列 -->
            <template #body-cell-label="props">
              <q-td :props="props" :style="props.col.style">
                <div class="flex items-center text-xs text-industrial-primary">
                  <q-icon name="list_alt" size="xs" class="mr-2 text-industrial-accent" />
                  {{ props.value }}
                </div>
              </q-td>
            </template>

            <!-- 发送目标列 -->
            <template #body-cell-targetId="props">
              <q-td :props="props" :style="props.col.style">
                <q-select
                  v-model="props.row.targetId"
                  :options="availableTargets"
                  option-value="id"
                  option-label="name"
                  dense
                  outlined
                  emit-value
                  map-options
                  dark
                  class="bg-industrial-panel w-full max-w-[180px]"
                  :disable="isSending || isProcessing"
                  @update:model-value="updateInstanceTarget(props.rowIndex, $event)"
                  input-class="py-0.5 px-1 text-xs text-industrial-primary"
                  hide-bottom-space
                >
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label class="text-xs text-industrial-primary">{{
                          scope.opt.name
                        }}</q-item-label>
                        <q-item-label caption class="text-2xs">
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
                          class="text-industrial-accent"
                        />
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </q-td>
            </template>

            <!-- 延时列 -->
            <template #body-cell-interval="props">
              <q-td :props="props">
                <q-input
                  v-model.number="props.row.interval"
                  type="number"
                  min="0"
                  max="60000"
                  dense
                  outlined
                  dark
                  class="bg-industrial-panel w-20"
                  :disable="isSending || isProcessing"
                  @update:model-value="updateInstanceInterval(props.rowIndex, $event as number)"
                  input-class="py-0.5 px-1 text-xs text-industrial-primary"
                  hide-bottom-space
                />
              </q-td>
            </template>

            <!-- 状态列 -->
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-badge :color="getStatusColor(props.row.status)" class="text-2xs status-badge">
                  {{ getStatusLabel(props.row.status) }}
                </q-badge>
                <div v-if="props.row.errorMessage" class="text-2xs text-negative mt-1">
                  {{ props.row.errorMessage }}
                </div>
              </q-td>
            </template>

            <!-- 操作列 -->
            <template #body-cell-actions="props">
              <q-td :props="props">
                <div class="flex justify-center gap-1">
                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    icon="arrow_upward"
                    color="blue-grey"
                    :disable="isSending || props.rowIndex === 0 || isProcessing"
                    @click="moveInstanceUp(props.rowIndex)"
                  >
                    <q-tooltip>上移</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    icon="arrow_downward"
                    color="blue-grey"
                    :disable="
                      isSending || props.rowIndex === selectedInstances.length - 1 || isProcessing
                    "
                    @click="moveInstanceDown(props.rowIndex)"
                  >
                    <q-tooltip>下移</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    icon="delete_outline"
                    color="negative"
                    :disable="isSending || isProcessing"
                    @click="removeInstanceFromSequence(props.rowIndex)"
                  >
                    <q-tooltip>移除</q-tooltip>
                  </q-btn>
                </div>
              </q-td>
            </template>

            <template #no-data>
              <div class="full-width text-center text-industrial-secondary py-4 text-xs">
                <q-icon name="info" size="sm" class="q-mr-sm" />
                尚未添加任何帧实例到发送序列
              </div>
            </template>
          </q-table>
        </div>

        <!-- 添加实例 -->
        <div class="mt-3 p-2 bg-industrial-highlight rounded border border-industrial">
          <div class="flex items-center">
            <div class="flex-1 flex items-center">
              <q-select
                v-model="selectedInstanceForAdd"
                :options="availableInstances"
                option-value="id"
                option-label="label"
                dense
                outlined
                emit-value
                map-options
                dark
                class="bg-industrial-panel flex-1"
                :disable="isSending || isProcessing"
                placeholder="选择要添加的帧实例"
                input-class="py-0.5 px-1 text-xs text-industrial-primary"
                hide-bottom-space
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label class="text-xs text-industrial-primary">{{
                        scope.opt.label
                      }}</q-item-label>
                      <q-item-label caption class="text-2xs text-industrial-secondary">
                        {{ scope.opt.description }}
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
              <q-btn
                flat
                round
                dense
                icon="add"
                color="positive"
                class="ml-2"
                :disable="!selectedInstanceForAdd || isSending || isProcessing"
                @click="addInstanceToSequence(selectedInstanceForAdd)"
              >
                <q-tooltip>添加到序列</q-tooltip>
              </q-btn>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误信息 -->
      <div
        v-if="sequenceError || processingError"
        class="bg-red-900/20 border border-red-500 rounded-md p-3 mb-3"
      >
        <div class="flex items-start">
          <q-icon name="error" color="red" size="sm" class="mt-0.5 mr-2" />
          <div class="text-xs text-red-400">
            {{ sequenceError || processingError }}
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
      :initial-config="triggerConfig"
      :source-options="sourceOptions"
      :frame-options="frameOptions"
      @confirm="onTriggerConfigConfirm"
      @cancel="showTriggerConfig = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSerialStore } from '../../../stores/serialStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useConnectionTargets } from '../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { useStrategyConfig } from '../../../composables/frames/useStrategyConfig';
import { useTaskConfigManager } from '../../../composables/frames/sendFrame/useTaskConfigManager';
import type { FrameInstanceInTask } from '../../../stores/frames/sendTasksStore';
import type {
  TimedStrategyConfig,
  TriggerStrategyConfig,
} from '../../../types/frames/sendInstances';
import { useStorage } from '@vueuse/core';
import TimedConfigDialog from './TimedConfigDialog.vue';
import TriggerConfigDialog from './TriggerConfigDialog.vue';

// 获取store实例
const serialStore = useSerialStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 使用连接目标管理
const { availableTargets, refreshTargets } = useConnectionTargets(
  'enhanced-sequential-send-targets',
);

// 使用任务管理器
const {
  createSequentialTask,
  createTimedMultipleTask,
  createTriggeredMultipleTask,
  startTask,
  isProcessing,
  processingError,
} = useSendTaskManager();

// 使用策略配置管理
const {
  timedConfig,
  triggerConfig,
  currentStrategyType,
  currentStrategyConfig,
  setStrategyType,
  validation,
} = useStrategyConfig();

// 使用任务配置管理器
const { saveConfigToUserFile, loadConfigFromUserFile } = useTaskConfigManager();

const emit = defineEmits<{
  close: [];
}>();

// 基础状态
const isSending = ref(false);
const sequenceError = ref('');
const selectedInstanceForAdd = ref('');
const showTimedConfig = ref(false);
const showTriggerConfig = ref(false);

// 发送策略状态
const sendStrategy = computed({
  get: () => currentStrategyType.value,
  set: (value) => setStrategyType(value),
});

// 选中的实例列表
const selectedInstances = useStorage<FrameInstanceInTask[]>(
  'enhanced-sequential-send-instances',
  [],
);

// 策略选项
const strategyOptions = [
  { label: '立即发送', value: 'immediate' },
  { label: '定时发送', value: 'timed' },
  { label: '触发发送', value: 'triggered' },
];

const strategyLabels = {
  immediate: '立即',
  timed: '定时',
  triggered: '触发',
};

// 表格列定义
const columns = [
  {
    name: 'order',
    required: true,
    label: '序号',
    align: 'center' as const,
    field: (row: any) => {
      const index = selectedInstances.value.findIndex((item) => item.id === row.id);
      return index + 1;
    },
    sortable: false,
    style: 'width: 60px; min-width: 60px',
    classes: 'text-industrial-id',
  },
  {
    name: 'label',
    required: true,
    label: '实例名称',
    align: 'left' as const,
    field: (row: any) => {
      const instance = sendFrameInstancesStore.instances.find((i) => i.id === row.instanceId);
      return instance?.label || '未知实例';
    },
    sortable: true,
  },
  {
    name: 'targetId',
    required: true,
    label: '发送目标',
    align: 'left' as const,
    field: 'targetId',
    style: 'width: 180px; min-width: 180px',
  },
  {
    name: 'interval',
    required: true,
    label: '延时(ms)',
    align: 'center' as const,
    field: 'interval',
    style: 'width: 100px; min-width: 100px',
  },
  {
    name: 'status',
    required: true,
    label: '状态',
    align: 'center' as const,
    field: 'status',
    style: 'width: 100px; min-width: 100px',
  },
  {
    name: 'actions',
    required: true,
    label: '操作',
    align: 'center' as const,
    field: () => '',
    style: 'width: 140px; min-width: 140px',
  },
];

// 分页设置
const pagination = ref({
  rowsPerPage: 10,
  page: 1,
});

// 可用的帧实例
const availableInstances = computed(() => sendFrameInstancesStore.instances);

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
  } else if (sendStrategy.value === 'triggered' && triggerConfig.value) {
    const { sourceId, triggerFrameId, conditions } = triggerConfig.value;
    const sourceName = sourceOptions.value.find((s) => s.id === sourceId)?.name || '未选择';
    const frameName = frameOptions.value.find((f) => f.id === triggerFrameId)?.name || '未选择';
    return `监听来源: ${sourceName}，触发帧: ${frameName}，条件数: ${conditions.length}`;
  }
  return '立即发送';
}

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
      return '发送中';
    case 'completed':
      return '已发送';
    case 'error':
      return '发送失败';
    default:
      return '等待中';
  }
}

/**
 * 添加实例到序列
 */
function addInstanceToSequence(instanceId: string) {
  const instance = availableInstances.value.find((i) => i.id === instanceId);
  if (!instance) return;

  const connectedTarget = availableTargets.value.find((t) => t.status === 'connected');
  const defaultTargetId = connectedTarget?.id || availableTargets.value[0]?.id || '';

  selectedInstances.value.push({
    id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
  // 配置会自动通过useStrategyConfig更新
  showTimedConfig.value = false;
}

/**
 * 触发配置确认
 */
function onTriggerConfigConfirm(config: TriggerStrategyConfig) {
  // 配置会自动通过useStrategyConfig更新
  showTriggerConfig.value = false;
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

    // 根据策略创建对应的任务
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

      case 'triggered':
        if (!triggerConfig.value) {
          throw new Error('触发配置不完整');
        }
        taskId = createTriggeredMultipleTask(
          selectedInstances.value,
          triggerConfig.value.sourceId,
          triggerConfig.value.triggerFrameId,
          triggerConfig.value.conditions,
          '多帧触发发送',
        );
        break;
    }

    if (taskId) {
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
    console.error('启动发送任务失败:', error);
    sequenceError.value = error instanceof Error ? error.message : '任务启动失败';
  } finally {
    isSending.value = false;
  }
}

/**
 * 保存当前配置
 */
async function saveCurrentConfig() {
  if (selectedInstances.value.length === 0) {
    sequenceError.value = '没有可保存的配置';
    return;
  }

  try {
    // 构建完整配置
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

    const strategy = currentStrategyConfig.value;

    const configName = `多帧${strategyLabels[sendStrategy.value]}发送配置`;
    const result = await saveConfigToUserFile(instances, targets, strategy, configName);

    if (!result.success) {
      throw new Error(result.message || '保存配置失败');
    }
  } catch (error) {
    console.error('保存配置失败:', error);
    sequenceError.value = error instanceof Error ? error.message : '保存失败';
  }
}

/**
 * 加载保存的配置
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

    const { instances, targets, strategy, name } = result.data;

    // 恢复实例列表
    selectedInstances.value = targets.map((target) => ({
      id: `loaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      instanceId: target.instanceId,
      targetId: target.targetId,
      interval: target.interval || 1000,
    }));

    // 恢复策略配置
    if (strategy) {
      setStrategyType(strategy.type);
      // useStrategyConfig会自动处理配置的恢复
    } else {
      setStrategyType('immediate');
    }

    sequenceError.value = '';
  } catch (error) {
    console.error('加载配置失败:', error);
    sequenceError.value = error instanceof Error ? error.message : '加载失败';
  }
}

/**
 * 关闭对话框
 */
function handleClose() {
  emit('close');
}

// 页面加载时刷新可用目标
refreshTargets();
</script>

<style scoped>
.text-2xs {
  font-size: 0.65rem;
}

.enhanced-sequential-send-dialog {
  min-width: 800px;
  max-width: 95vw;
}

/* 修改Quasar的样式，消除底部空间 */
:deep(.q-field--with-bottom.q-field--hide-bottom-space .q-field__bottom) {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>
