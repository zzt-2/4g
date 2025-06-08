<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useSendFrameInstancesStore } from '../../../../stores/frames/sendFrameInstancesStore';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';
import { useConnectionTargets } from '../../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../../composables/frames/sendFrame/useSendTaskManager';
import type {
  InstanceStrategyConfig,
  TriggerStrategyConfig,
  TriggerCondition,
  TriggerType,
} from '../../../../types/frames/sendInstances';
import type { ConnectionTarget } from '../../../../types/common/connectionTarget';
import type { FrameFieldMapping } from '../../../../types/frames/receive';

const props = defineProps<{
  instanceId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();
const receiveFramesStore = useReceiveFramesStore();

// 连接目标相关状态 - 使用ref手动管理以响应instanceId变化
const sourceTargets = ref<ConnectionTarget[]>([]);
const targetTargets = ref<ConnectionTarget[]>([]);
const selectedTargetId = ref<string>('');
const refreshSourceTargets = ref<(() => void) | null>(null);
const refreshTargets = ref<(() => void) | null>(null);

// 使用任务管理器composable
const {
  createTriggeredSingleTask,
  createTimedTriggeredSingleTask,
  startTask,
  isProcessing,
  processingError,
} = useSendTaskManager();

// 本地状态
const isMonitoring = ref(false);
const triggerError = ref('');
const currentTaskId = ref<string | null>(null);

// 当前选中的实例
const currentInstance = computed(() => {
  if (!props.instanceId) return null;
  return sendFrameInstancesStore.instances.find((i) => i.id === props.instanceId) || null;
});

// 当前实例的策略配置
const currentStrategyConfig = computed((): InstanceStrategyConfig => {
  return (
    currentInstance.value?.strategyConfig ||
    ({
      type: 'none',
      updatedAt: new Date().toISOString(),
    } as InstanceStrategyConfig)
  );
});

// 本地触发配置状态
const triggerType = ref<TriggerType>('condition');
const responseDelay = ref<number>(0);

// 条件触发配置
const sourceId = ref<string>('');
const triggerFrameId = ref<string>('');
const conditions = ref<TriggerCondition[]>([]);
const continueListening = ref<boolean>(true);

// 时间触发配置
const executeTime = ref<string>(new Date().toISOString());
const isRecurring = ref<boolean>(false);
const recurringType = ref<'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly'>('daily');
const recurringInterval = ref<number>(1);
const endTime = ref<string>('');

// 防止初始化时的循环更新
const isInitializing = ref(true);

// 使用watch监听instanceId变化，重新初始化连接目标管理
watch(
  () => props.instanceId,
  (newInstanceId) => {
    if (!newInstanceId) return;

    // 当instanceId变化时，重新创建连接目标管理
    const { availableTargets: newSourceTargets, refreshTargets: newRefreshSourceTargets } =
      useConnectionTargets(`trigger-send-source-targets-${newInstanceId}`);

    const {
      availableTargets: newTargetTargets,
      selectedTargetId: newSelectedTargetId,
      refreshTargets: newRefreshTargets,
    } = useConnectionTargets(`trigger-send-dest-targets-${newInstanceId}`);

    // 更新本地引用
    sourceTargets.value = newSourceTargets.value;
    targetTargets.value = newTargetTargets.value;
    selectedTargetId.value = newSelectedTargetId.value;
    refreshSourceTargets.value = newRefreshSourceTargets;
    refreshTargets.value = newRefreshTargets;

    // 监听目标列表变化
    watch(newSourceTargets, (targets) => {
      sourceTargets.value = targets;
    });

    watch(newTargetTargets, (targets) => {
      targetTargets.value = targets;
    });

    // 初始刷新
    if (newRefreshSourceTargets) newRefreshSourceTargets();
    if (newRefreshTargets) newRefreshTargets();
  },
  { immediate: true },
);

// 使用watch监听实例配置变化，同步到本地状态
watch(
  [() => props.instanceId, currentStrategyConfig],
  ([instanceId, config]) => {
    if (!instanceId) return;

    // 设置初始化标志，防止触发配置保存
    isInitializing.value = true;

    if (config.type === 'triggered' && config.triggeredConfig) {
      const triggeredConfig = config.triggeredConfig;
      triggerType.value = triggeredConfig.triggerType || 'condition';
      responseDelay.value = triggeredConfig.responseDelay || 0;

      // 条件触发配置
      sourceId.value = triggeredConfig.sourceId || '';
      triggerFrameId.value = triggeredConfig.triggerFrameId || '';
      conditions.value = triggeredConfig.conditions || [];
      continueListening.value = triggeredConfig.continueListening ?? true;

      // 时间触发配置
      executeTime.value = triggeredConfig.executeTime || new Date().toISOString();
      isRecurring.value = triggeredConfig.isRecurring || false;
      recurringType.value = triggeredConfig.recurringType || 'daily';
      recurringInterval.value = triggeredConfig.recurringInterval || 1;
      endTime.value = triggeredConfig.endTime || '';

      // 同步目标选择
      if (config.targetId) {
        selectedTargetId.value = config.targetId;
      }
    } else {
      // 如果没有触发配置，使用默认值
      triggerType.value = 'condition';
      responseDelay.value = 0;
      sourceId.value = '';
      triggerFrameId.value = '';
      conditions.value = [];
      continueListening.value = true;
      executeTime.value = new Date().toISOString();
      isRecurring.value = false;
      recurringType.value = 'daily';
      recurringInterval.value = 1;
      endTime.value = '';

      // 清空目标选择或使用默认目标
      if (!selectedTargetId.value && targetTargets.value.length > 0) {
        selectedTargetId.value = targetTargets.value[0]?.id || '';
      }
    }

    // 在下个tick中重置初始化标志
    nextTick(() => {
      isInitializing.value = false;
    });
  },
  { immediate: true, deep: true },
);

// 更新实例策略配置
function updateInstanceStrategyConfig(config: Partial<InstanceStrategyConfig>) {
  if (!currentInstance.value) return;

  if (!currentInstance.value.strategyConfig) {
    currentInstance.value.strategyConfig = {
      type: 'none',
      updatedAt: new Date().toISOString(),
    };
  }

  // 直接修改实例配置
  Object.assign(currentInstance.value.strategyConfig, config, {
    updatedAt: new Date().toISOString(),
  });

  // 触发实例更新（会自动保存）
  sendFrameInstancesStore.updateInstance(currentInstance.value);
}

// 设置触发配置
function setTriggerConfig() {
  // 如果正在初始化，不执行保存
  if (isInitializing.value) return;

  const triggeredConfig: TriggerStrategyConfig = {
    type: 'triggered',
    triggerType: triggerType.value,
    responseDelay: responseDelay.value,
  };

  if (triggerType.value === 'condition') {
    triggeredConfig.sourceId = sourceId.value;
    triggeredConfig.triggerFrameId = triggerFrameId.value;
    triggeredConfig.conditions = conditions.value;
    triggeredConfig.continueListening = continueListening.value;
  } else if (triggerType.value === 'time') {
    triggeredConfig.executeTime = executeTime.value;
    triggeredConfig.isRecurring = isRecurring.value;
    if (isRecurring.value) {
      triggeredConfig.recurringType = recurringType.value;
      triggeredConfig.recurringInterval = recurringInterval.value;
      if (endTime.value) {
        triggeredConfig.endTime = endTime.value;
      }
    }
  }

  updateInstanceStrategyConfig({
    type: 'triggered',
    triggeredConfig,
    targetId: selectedTargetId.value,
  });
}

// 监听配置变化自动保存 - 只在非初始化时触发
watch(
  [
    triggerType,
    responseDelay,
    sourceId,
    triggerFrameId,
    conditions,
    continueListening,
    executeTime,
    isRecurring,
    recurringType,
    recurringInterval,
    endTime,
    selectedTargetId,
  ],
  () => {
    // 只在非初始化时保存配置
    if (!isInitializing.value) {
      setTriggerConfig();
    }
  },
  { deep: true },
);

// 连接来源选项（用于触发配置）
const sourceOptions = computed(() =>
  sourceTargets.value.map((target) => ({
    id: target.id,
    name: target.name,
    ...(target.description ? { description: target.description } : {}),
  })),
);

// 帧选项（用于触发配置）- 只显示接收帧
const frameOptions = computed(() =>
  receiveFramesStore.receiveFrames.map((frame) => ({
    id: frame.id,
    name: frame.name,
    fields:
      frame.fields?.map((field) => ({
        id: field.id,
        name: field.name,
      })) || [],
  })),
);

// 获取指定帧中存在映射关系的字段选项
const getMappedFieldOptions = computed(() => (frameId: string) => {
  if (!frameId) return [];

  // 获取该帧的所有映射关系
  const frameMappings = receiveFramesStore.mappings.filter(
    (mapping) => mapping.frameId === frameId,
  );

  // 获取该帧的字段定义
  const frame = receiveFramesStore.receiveFrames.find((f) => f.id === frameId);
  if (!frame || !frame.fields) return [];

  // 只返回存在映射关系的字段
  return frame.fields
    .filter((field) => frameMappings.some((mapping) => mapping.fieldId === field.id))
    .map((field) => ({
      id: field.id,
      name: field.name,
      // 可以添加映射信息用于显示
      mappingInfo: frameMappings.find((mapping) => mapping.fieldId === field.id),
    }));
});

// 获取映射数据项的显示信息
function getMappedDataItemInfo(mappingInfo: FrameFieldMapping | undefined) {
  if (!mappingInfo) return '未知';

  // 查找对应的数据分组和数据项
  const group = receiveFramesStore.groups.find((g) => g.id === mappingInfo.groupId);
  const dataItem = group?.dataItems.find((item) => item.id === mappingInfo.dataItemId);

  if (group && dataItem) {
    return `${group.label} - ${dataItem.label}`;
  }

  return `分组${mappingInfo.groupId} - 项目${mappingInfo.dataItemId}`;
}

// 计算属性：是否可以开始监听
const canStartMonitor = computed(() => {
  if (isMonitoring.value || isProcessing.value || !selectedTargetId.value) return false;

  if (triggerType.value === 'condition') {
    // 检查条件触发的必要字段
    return !!(sourceId.value && triggerFrameId.value && conditions.value.length);
  } else if (triggerType.value === 'time') {
    // 检查时间触发的必要字段
    return !!executeTime.value;
  }

  return false;
});

// 关闭对话框
function handleClose() {
  emit('close');
}

// 开始监听触发条件
async function startMonitoring() {
  if (!canStartMonitor.value || !currentInstance.value) return;

  isMonitoring.value = true;
  triggerError.value = '';

  try {
    // 先保存当前配置到实例
    setTriggerConfig();

    let taskId: string | null = null;

    if (triggerType.value === 'condition') {
      // 条件触发
      if (!sourceId.value || !triggerFrameId.value || !conditions.value.length) {
        throw new Error('条件触发配置不完整');
      }

      taskId = createTriggeredSingleTask(
        props.instanceId,
        selectedTargetId.value,
        sourceId.value,
        triggerFrameId.value,
        conditions.value,
        `触发发送-${currentInstance.value.label}`,
        continueListening.value,
      );
    } else if (triggerType.value === 'time') {
      // 时间触发
      if (!executeTime.value) {
        throw new Error('时间触发配置不完整：缺少执行时间');
      }

      // 确保 recurringType 与 createTimedTriggeredSingleTask 方法参数类型匹配
      const validRecurringTypes = ['daily', 'weekly', 'monthly'] as const;
      type ValidRecurringType = (typeof validRecurringTypes)[number];

      const recurringTypeValue =
        recurringType.value &&
        validRecurringTypes.includes(recurringType.value as ValidRecurringType)
          ? (recurringType.value as ValidRecurringType)
          : undefined;

      taskId = createTimedTriggeredSingleTask(
        props.instanceId,
        selectedTargetId.value,
        executeTime.value,
        isRecurring.value,
        recurringTypeValue,
        recurringInterval.value,
        endTime.value,
        `时间触发发送-${currentInstance.value.label}`,
      );
    }

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
    console.error('启动触发监听失败:', error);
    isMonitoring.value = false;
    triggerError.value = error instanceof Error ? error.message : '操作失败';
  }
}

// 添加条件
function addCondition() {
  conditions.value.push({
    id: `condition_${Date.now()}`,
    fieldId: '',
    condition: 'equals',
    value: '',
    logicOperator: conditions.value.length > 0 ? 'and' : undefined,
  } as TriggerCondition);
}

// 删除条件
function removeCondition(index: number) {
  conditions.value.splice(index, 1);
}
</script>

<template>
  <div class="trigger-send-dialog h-full w-full">
    <div class="flex flex-col h-full bg-industrial-panel p-4">
      <!-- 标题信息 -->
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-industrial-primary text-base font-medium flex items-center">
              <q-icon name="sensors" size="sm" class="mr-2 text-blue-5" />
              触发发送设置
            </h2>
            <div class="text-xs text-industrial-secondary mt-1 ml-6">
              {{ currentInstance?.label || '选中帧实例' }} - 设置触发条件，当条件满足时发送帧实例
            </div>
          </div>
        </div>
      </div>

      <!-- 触发配置面板 -->
      <div class="flex-1 overflow-auto space-y-3">
        <!-- 触发类型选择 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="settings" size="xs" class="mr-1 text-blue-5" />
              <span>触发类型</span>
            </div>

            <q-select
              v-model="triggerType"
              :options="[
                { label: '条件触发', value: 'condition' },
                { label: '时间触发', value: 'time' },
              ]"
              option-label="label"
              option-value="value"
              emit-value
              map-options
              dense
              outlined
              dark
              bg-color="rgba(18, 35, 63, 0.7)"
              class="w-full"
              :disable="isMonitoring || isProcessing"
              input-class="py-0.5 px-1"
              hide-bottom-space
            />
          </div>
        </div>

        <!-- 响应延时配置 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="schedule" size="xs" class="mr-1 text-blue-5" />
              <span>响应延时</span>
            </div>

            <div class="flex items-center">
              <q-input
                v-model.number="responseDelay"
                type="number"
                min="0"
                step="10"
                dense
                outlined
                dark
                bg-color="rgba(18, 35, 63, 0.7)"
                class="w-24"
                :disable="isMonitoring || isProcessing"
                input-class="py-0.5 px-1"
                hide-bottom-space
              />
              <span class="ml-2 text-xs text-industrial-secondary">毫秒</span>
            </div>
          </div>
        </div>

        <!-- 条件触发配置 -->
        <div v-if="triggerType === 'condition'" class="space-y-3">
          <!-- 监听来源 -->
          <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
            <div class="flex flex-row items-center mb-2">
              <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
                <q-icon name="radio" size="xs" class="mr-1 text-blue-5" />
                <span>监听来源</span>
              </div>

              <q-select
                v-model="sourceId"
                :options="sourceOptions"
                option-value="id"
                option-label="name"
                dense
                outlined
                emit-value
                map-options
                dark
                bg-color="rgba(18, 35, 63, 0.7)"
                class="w-full"
                :disable="isMonitoring || isProcessing"
                input-class="py-0.5 px-1"
                hide-bottom-space
              />
            </div>
          </div>

          <!-- 触发帧 -->
          <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
            <div class="flex flex-row items-center mb-2">
              <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
                <q-icon name="data_object" size="xs" class="mr-1 text-blue-5" />
                <span>触发帧</span>
              </div>

              <q-select
                v-model="triggerFrameId"
                :options="frameOptions"
                option-value="id"
                option-label="name"
                dense
                outlined
                emit-value
                map-options
                dark
                bg-color="rgba(18, 35, 63, 0.7)"
                class="w-full"
                :disable="isMonitoring || isProcessing"
                input-class="py-0.5 px-1"
                hide-bottom-space
              />
            </div>
          </div>

          <!-- 触发条件 -->
          <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
            <div class="flex justify-between items-center mb-2">
              <div class="text-xs font-medium text-industrial-primary flex items-center">
                <q-icon name="rule" size="xs" class="mr-1 text-blue-5" />
                <span>触发条件</span>
              </div>
              <q-btn
                dense
                flat
                icon="add"
                color="blue-5"
                size="sm"
                @click="addCondition"
                :disable="isMonitoring || isProcessing"
              >
                <q-tooltip>添加条件</q-tooltip>
              </q-btn>
            </div>

            <div
              v-if="conditions.length === 0"
              class="text-xs text-industrial-tertiary text-center py-4"
            >
              暂无触发条件，点击上方按钮添加
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="(condition, index) in conditions"
                :key="condition.id"
                class="bg-industrial-primary rounded p-2 border border-industrial"
              >
                <div class="flex items-center gap-2">
                  <!-- 逻辑操作符 -->
                  <div v-if="index > 0" class="text-xs text-industrial-accent w-8">
                    {{ condition.logicOperator === 'or' ? '或' : '且' }}
                  </div>
                  <div v-else class="w-8"></div>

                  <!-- 字段选择 -->
                  <q-select
                    v-model="condition.fieldId"
                    :options="getMappedFieldOptions(triggerFrameId)"
                    option-value="id"
                    option-label="name"
                    dense
                    outlined
                    emit-value
                    map-options
                    dark
                    bg-color="rgba(18, 35, 63, 0.7)"
                    class="flex-1"
                    placeholder="选择已映射字段"
                    :disable="isMonitoring || isProcessing"
                    input-class="py-0.5 px-1"
                    hide-bottom-space
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>
                          <q-item-label class="text-xs text-industrial-primary">
                            {{ scope.opt.name }}
                          </q-item-label>
                          <q-item-label caption class="text-2xs text-industrial-tertiary">
                            映射到: {{ getMappedDataItemInfo(scope.opt.mappingInfo) }}
                          </q-item-label>
                        </q-item-section>
                        <q-item-section side>
                          <q-icon name="link" size="xs" class="text-blue-5" />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>

                  <!-- 条件操作符 -->
                  <q-select
                    v-model="condition.condition"
                    :options="[
                      { label: '等于', value: 'equals' },
                      { label: '不等于', value: 'not_equals' },
                      { label: '大于', value: 'greater' },
                      { label: '小于', value: 'less' },
                      { label: '包含', value: 'contains' },
                    ]"
                    option-label="label"
                    option-value="value"
                    emit-value
                    map-options
                    dense
                    outlined
                    dark
                    bg-color="rgba(18, 35, 63, 0.7)"
                    class="w-20"
                    :disable="isMonitoring || isProcessing"
                    input-class="py-0.5 px-1"
                    hide-bottom-space
                  />

                  <!-- 值输入 -->
                  <q-input
                    v-model="condition.value"
                    dense
                    outlined
                    dark
                    bg-color="rgba(18, 35, 63, 0.7)"
                    class="w-24"
                    placeholder="值"
                    :disable="isMonitoring || isProcessing"
                    input-class="py-0.5 px-1"
                    hide-bottom-space
                  />

                  <!-- 删除按钮 -->
                  <q-btn
                    dense
                    flat
                    icon="delete"
                    color="negative"
                    size="sm"
                    @click="removeCondition(index)"
                    :disable="isMonitoring || isProcessing"
                  >
                    <q-tooltip>删除条件</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </div>
          </div>

          <!-- 继续监听选项 -->
          <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
            <q-checkbox
              v-model="continueListening"
              dark
              dense
              :disable="isMonitoring || isProcessing"
              label="触发后继续监听"
              class="text-xs text-industrial-primary"
            />
          </div>
        </div>

        <!-- 时间触发配置 -->
        <div v-else-if="triggerType === 'time'" class="space-y-3">
          <!-- 执行时间 -->
          <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
            <div class="flex flex-row items-center mb-2">
              <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
                <q-icon name="event" size="xs" class="mr-1 text-blue-5" />
                <span>执行时间</span>
              </div>

              <q-input
                v-model="executeTime"
                type="datetime-local"
                dense
                outlined
                dark
                bg-color="rgba(18, 35, 63, 0.7)"
                class="w-full"
                :disable="isMonitoring || isProcessing"
                input-class="py-0.5 px-1"
                hide-bottom-space
              />
            </div>
          </div>

          <!-- 重复设置 -->
          <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
            <q-checkbox
              v-model="isRecurring"
              dark
              dense
              :disable="isMonitoring || isProcessing"
              label="重复执行"
              class="text-xs text-industrial-primary mb-2"
            />

            <div v-if="isRecurring" class="space-y-2 ml-6">
              <div class="flex items-center gap-2">
                <span class="text-xs text-industrial-secondary">每</span>
                <q-input
                  v-model.number="recurringInterval"
                  type="number"
                  min="1"
                  dense
                  outlined
                  dark
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-16"
                  :disable="isMonitoring || isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                />
                <q-select
                  v-model="recurringType"
                  :options="[
                    { label: '秒', value: 'second' },
                    { label: '分钟', value: 'minute' },
                    { label: '小时', value: 'hour' },
                    { label: '天', value: 'daily' },
                    { label: '周', value: 'weekly' },
                    { label: '月', value: 'monthly' },
                  ]"
                  option-label="label"
                  option-value="value"
                  emit-value
                  map-options
                  dense
                  outlined
                  dark
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-20"
                  :disable="isMonitoring || isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                />
              </div>

              <div class="flex items-center gap-2">
                <span class="text-xs text-industrial-secondary">结束时间:</span>
                <q-input
                  v-model="endTime"
                  type="datetime-local"
                  dense
                  outlined
                  dark
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="flex-1"
                  :disable="isMonitoring || isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 发送目标设置 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="send_to_mobile" size="xs" class="mr-1 text-blue-5" />
              <span>发送目标</span>
            </div>

            <q-select
              v-model="selectedTargetId"
              :options="targetTargets"
              option-value="id"
              option-label="name"
              dense
              outlined
              emit-value
              map-options
              dark
              bg-color="rgba(18, 35, 63, 0.7)"
              class="w-full"
              :disable="isMonitoring || isProcessing"
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

        <!-- 错误信息 -->
        <div
          v-if="triggerError || processingError"
          class="bg-industrial-secondary rounded-md p-3 shadow-md border border-red-800"
        >
          <div class="flex items-start">
            <q-icon name="error" color="negative" size="sm" class="mt-0.5 mr-2" />
            <div class="text-xs text-red-400">
              {{ triggerError || processingError }}
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
            icon="sensors"
            label="开始监听"
            class="rounded-md px-4 text-xs"
            @click="startMonitoring"
            :disable="!canStartMonitor || isProcessing"
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
