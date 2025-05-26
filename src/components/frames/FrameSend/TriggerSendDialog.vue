<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSerialStore } from '../../../stores/serialStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useFrameTemplateStore } from '../../../stores/frames/frameTemplateStore';
import { useConnectionTargets } from '../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { useTaskConfigManager } from '../../../composables/frames/sendFrame/useTaskConfigManager';
import type { StrategyConfig } from '../../../types/frames/sendInstances';

// 获取store实例
const serialStore = useSerialStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();
const frameTemplateStore = useFrameTemplateStore();

// 使用连接目标管理composable - 使用不同的存储键区分监听来源和发送目标
const {
  availableTargets: sourceTargets,
  selectedTargetId: selectedSourceId,
  refreshTargets: refreshSourceTargets,
} = useConnectionTargets('trigger-send-source-targets');

const {
  availableTargets: targetTargets,
  selectedTargetId: selectedTargetId,
  refreshTargets: refreshTargetTargets,
} = useConnectionTargets('trigger-send-dest-targets');

// 使用任务管理器composable
const { createTriggeredSingleTask, startTask, isProcessing, processingError } =
  useSendTaskManager();

// 使用任务配置管理器
const { saveConfigToUserFile, loadConfigFromUserFile } = useTaskConfigManager();

const props = defineProps<{
  instanceId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 触发设置
const selectedTriggerType = ref('frame'); // frame, time, condition
const isMonitoring = ref(false);
const triggerError = ref('');
const currentTaskId = ref<string | null>(null);

// 触发帧设置
const selectedFrameId = ref('');
const triggerConditions = ref<
  Array<{
    id: string;
    fieldId: string;
    condition: string;
    value: string;
    logicOperator?: 'and' | 'or'; // 与条件之间的逻辑关系
  }>
>([]);

// 添加一个默认的空条件
function addNewCondition() {
  // 如果已有条件，默认添加"与"逻辑
  const newCondition: any = {
    id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    fieldId: '',
    condition: 'equals', // 默认等于
    value: '',
  };

  // 如果不是第一个条件，添加逻辑操作符
  if (triggerConditions.value.length > 0) {
    newCondition.logicOperator = 'and'; // 默认使用"与"逻辑
  }

  triggerConditions.value.push(newCondition);
}

// 初始化一个默认条件
if (triggerConditions.value.length === 0) {
  addNewCondition();
}

// 删除条件
function removeCondition(conditionId: string) {
  const index = triggerConditions.value.findIndex((c) => c.id === conditionId);
  if (index !== -1) {
    triggerConditions.value.splice(index, 1);
  }
  // 如果删除后没有条件了，添加一个空条件
  if (triggerConditions.value.length === 0) {
    addNewCondition();
  }
}

// 更新条件的逻辑操作符
function updateLogicOperator(conditionId: string, operator: 'and' | 'or') {
  const condition = triggerConditions.value.find((c) => c.id === conditionId);
  if (condition) {
    condition.logicOperator = operator;
  }
}

// 可选的帧模板
const availableFrames = computed(() => {
  return frameTemplateStore.frames.map((frame) => ({
    id: frame.id,
    label: frame.name,
    description: frame.description || '',
  }));
});

// 当前选中帧的可选字段
const availableFields = computed(() => {
  if (!selectedFrameId.value) return [];

  const frame = frameTemplateStore.frames.find((f) => f.id === selectedFrameId.value);
  if (!frame) return [];

  return frame.fields.map((field) => ({
    id: field.id,
    label: field.name,
    dataType: field.dataType,
  }));
});

// 当前选中的实例
const currentInstance = computed(() => {
  if (!props.instanceId) return null;
  return sendFrameInstancesStore.instances.find((i) => i.id === props.instanceId) || null;
});

// 计算属性：是否可以开始监听
const canStartMonitor = computed(() => {
  if (isMonitoring.value || isProcessing.value) return false;

  if (selectedTriggerType.value === 'frame') {
    // 检查是否有有效的触发条件
    const hasValidConditions =
      triggerConditions.value.length > 0 &&
      triggerConditions.value.every(
        (condition) =>
          condition.fieldId &&
          condition.value &&
          selectedFrameId.value &&
          selectedSourceId.value &&
          selectedTargetId.value,
      );
    return hasValidConditions;
  }

  return false; // 其他触发类型待实现
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
    // 使用任务管理器创建并启动任务
    const taskId = createTriggeredSingleTask(
      props.instanceId,
      selectedTargetId.value,
      selectedSourceId.value,
      selectedFrameId.value,
      triggerConditions.value,
      `触发发送-${currentInstance.value.label}`,
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
    console.error('启动触发监听失败:', error);
    isMonitoring.value = false;
    triggerError.value = error instanceof Error ? error.message : '操作失败';
  }
}

// 停止监听 - 现在由任务管理器统一管理
function stopMonitoring() {
  isMonitoring.value = false;
  emit('close');
}

/**
 * 保存当前配置到文件
 */
async function saveCurrentConfig() {
  if (!currentInstance.value) {
    triggerError.value = '没有可保存的实例';
    return;
  }

  try {
    // 构建策略配置
    const strategyConfig: StrategyConfig = {
      type: 'triggered',
      sourceId: selectedSourceId.value,
      triggerFrameId: selectedFrameId.value,
      conditions: triggerConditions.value.map((condition) => ({
        id: condition.id,
        fieldId: condition.fieldId,
        condition: condition.condition as 'equals' | 'not_equals' | 'greater' | 'less' | 'contains',
        value: condition.value,
        ...(condition.logicOperator ? { logicOperator: condition.logicOperator } : {}),
      })),
    };

    // 构建目标配置
    const targets = [
      {
        instanceId: props.instanceId,
        targetId: selectedTargetId.value,
        interval: 0, // 单帧发送不需要间隔
      },
    ];

    const configName = `单帧触发发送配置-${currentInstance.value.label}`;
    const conditionsDesc = triggerConditions.value
      .filter((c) => c.fieldId && c.value)
      .map((c) => `${c.fieldId} ${c.condition} ${c.value}`)
      .join(` ${triggerConditions.value[0]?.logicOperator || 'and'} `);

    const result = await saveConfigToUserFile(
      [currentInstance.value],
      targets,
      strategyConfig,
      configName,
      `触发发送配置：监听来源 ${selectedSourceId.value}，触发帧 ${selectedFrameId.value}，条件：${conditionsDesc}`,
    );

    if (!result.success) {
      throw new Error(result.message || '保存配置失败');
    }
  } catch (error) {
    console.error('保存配置失败:', error);
    triggerError.value = error instanceof Error ? error.message : '保存失败';
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

    // 如果是触发策略配置，恢复设置
    if (strategy && strategy.type === 'triggered') {
      selectedSourceId.value = strategy.sourceId;
      selectedFrameId.value = strategy.triggerFrameId;

      // 恢复触发条件
      triggerConditions.value = strategy.conditions.map((condition) => ({
        id: condition.id,
        fieldId: condition.fieldId,
        condition: condition.condition,
        value: condition.value,
        ...(condition.logicOperator ? { logicOperator: condition.logicOperator } : {}),
      }));
    }

    triggerError.value = '';
  } catch (error) {
    console.error('加载配置失败:', error);
    triggerError.value = error instanceof Error ? error.message : '加载失败';
  }
}

// 页面加载时刷新可用目标
refreshSourceTargets();
refreshTargetTargets();
</script>

<template>
  <div class="trigger-send-dialog h-full">
    <div class="flex flex-col space-y-3 h-full bg-industrial-panel p-4">
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
          <div class="flex gap-2">
            <q-btn
              flat
              dense
              icon="save"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md text-xs"
              @click="saveCurrentConfig"
              :disable="isMonitoring || isProcessing"
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
              :disable="isMonitoring || isProcessing"
            >
              <q-tooltip>加载配置</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>

      <!-- 配置区域 -->
      <div class="flex-1 overflow-auto">
        <!-- 触发类型选择 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
          <div class="flex flex-row items-center">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="category" size="xs" class="mr-1 text-blue-5" />
              <span>触发类型</span>
            </div>

            <div class="flex items-center justify-between flex-1">
              <q-radio
                v-model="selectedTriggerType"
                val="frame"
                label="帧数据触发"
                color="primary"
                dark
                dense
                :disable="isMonitoring || isProcessing"
                class="text-xs text-blue-500"
              />
              <q-radio
                v-model="selectedTriggerType"
                val="time"
                label="时间触发"
                color="primary"
                dark
                dense
                :disable="true"
                class="text-xs text-blue-500"
              />
              <q-radio
                v-model="selectedTriggerType"
                val="condition"
                label="条件触发"
                color="primary"
                dark
                dense
                :disable="true"
                class="text-xs text-blue-500"
              />
            </div>
          </div>
        </div>

        <!-- 帧触发设置 -->
        <div
          class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3"
          v-if="selectedTriggerType === 'frame'"
        >
          <div
            class="text-xs font-medium text-industrial-primary mb-2 flex items-center justify-between"
          >
            <div class="flex items-center">
              <q-icon name="settings_suggest" size="xs" class="mr-1 text-blue-5" />
              <span>帧触发设置</span>
            </div>

            <q-btn
              flat
              dense
              round
              icon="add_circle"
              color="positive"
              size="sm"
              @click="addNewCondition"
              :disable="isMonitoring || isProcessing"
            >
              <q-tooltip>添加条件</q-tooltip>
            </q-btn>
          </div>

          <!-- 选择触发帧 -->
          <div class="pl-6 mb-3">
            <div class="flex items-center mb-1">
              <div class="text-2xs text-industrial-secondary w-20">选择触发帧</div>
              <q-select
                v-model="selectedFrameId"
                :options="availableFrames"
                option-value="id"
                option-label="label"
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
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption v-if="scope.opt.description">
                        {{ scope.opt.description }}
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
          </div>

          <!-- 触发条件列表 -->
          <div
            v-for="(condition, index) in triggerConditions"
            :key="condition.id"
            class="pl-6 mb-2"
          >
            <!-- 逻辑操作符选择 (从第二个条件开始显示) -->
            <div v-if="index > 0" class="ml-20 mb-1 flex items-center">
              <div class="w-20 text-center border-t border-dashed border-industrial my-2"></div>
              <div class="flex-1 flex items-center justify-start ml-2">
                <q-btn-toggle
                  v-model="condition.logicOperator"
                  :options="[
                    { label: '与', value: 'and' },
                    { label: '或', value: 'or' },
                  ]"
                  push
                  glossy
                  rounded
                  no-caps
                  unelevated
                  dense
                  class="text-2xs"
                  toggle-color="primary"
                  color="grey-9"
                  text-color="white"
                  :disable="isMonitoring || isProcessing"
                  @update:model-value="updateLogicOperator(condition.id, $event)"
                />
              </div>
            </div>

            <div class="flex items-center mb-1">
              <div class="text-2xs text-industrial-secondary w-20">条件 #{{ index + 1 }}</div>
              <div class="flex items-center w-full gap-2">
                <!-- 字段选择 -->
                <q-select
                  v-model="condition.fieldId"
                  :options="availableFields"
                  option-value="id"
                  option-label="label"
                  dense
                  outlined
                  emit-value
                  map-options
                  dark
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-1/3"
                  :disable="isMonitoring || !selectedFrameId || isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                  placeholder="选择字段"
                >
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label>{{ scope.opt.label }}</q-item-label>
                        <q-item-label caption>
                          {{ scope.opt.dataType }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>

                <!-- 条件选择 -->
                <q-select
                  v-model="condition.condition"
                  :options="[
                    { label: '等于', value: 'equals' },
                    { label: '不等于', value: 'not_equals' },
                    { label: '大于', value: 'greater' },
                    { label: '小于', value: 'less' },
                    { label: '包含', value: 'contains' },
                  ]"
                  dense
                  outlined
                  emit-value
                  map-options
                  dark
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-1/4"
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
                  class="flex-1"
                  :disable="isMonitoring || isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                  placeholder="输入值"
                />

                <!-- 删除按钮 -->
                <q-btn
                  flat
                  dense
                  round
                  icon="remove_circle_outline"
                  color="negative"
                  size="xs"
                  @click="removeCondition(condition.id)"
                  :disable="isMonitoring || triggerConditions.length <= 1 || isProcessing"
                >
                  <q-tooltip>删除条件</q-tooltip>
                </q-btn>
              </div>
            </div>
          </div>
        </div>

        <!-- 监听来源设置 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
          <div class="flex flex-row items-center mb-2">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="developer_board" size="xs" class="mr-1 text-blue-5" />
              <span>监听来源</span>
            </div>

            <q-select
              v-model="selectedSourceId"
              :options="sourceTargets"
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

        <!-- 发送目标设置 -->
        <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
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
          class="bg-industrial-secondary rounded-md p-3 shadow-md border border-red-800 mb-3"
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
