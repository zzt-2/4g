<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { useFrameTemplateStore } from '../../../stores/frames/frameTemplateStore';
import { useConnectionTargets } from '../../../composables/useConnectionTargets';
import { FrameInstanceInTask } from '../../../stores/frames/sendTasksStore';
import InstanceListManager from './InstanceListManager.vue';

// Props定义
const props = defineProps<{
  // 任务类型: timed-multiple | triggered-multiple
  taskType: 'timed-multiple' | 'triggered-multiple';
  // 默认任务名称
  defaultName?: string;
}>();

// 事件定义
const emit = defineEmits<{
  // 关闭对话框
  close: [];
  // 保存成功
  saved: [taskId: string];
}>();

// 使用Store和Composables
const {
  createTimedMultipleTask,
  createTriggeredMultipleTask,
  startTask,
  saveTaskConfigToFile,
  loadTaskConfigFromFile,
  isProcessing,
  processingError,
} = useSendTaskManager();
const frameTemplateStore = useFrameTemplateStore();

// 使用连接目标管理composable - 用于触发监听的来源选择
const {
  availableTargets: sourceTargets,
  selectedTargetId: selectedSourceId,
  refreshTargets: refreshSourceTargets,
} = useConnectionTargets('trigger-multi-source-targets');

// 任务名称
const taskName = ref(
  props.defaultName || (props.taskType === 'timed-multiple' ? '多实例定时发送' : '多实例触发发送'),
);
const taskDescription = ref('');

// 实例列表
const selectedInstances = ref<FrameInstanceInTask[]>([]);

// 实例列表管理器引用
const instanceListManager = ref<InstanceRef | null>(null);
type InstanceRef = {
  selectedInstances: FrameInstanceInTask[];
  setInstances: (instances: FrameInstanceInTask[]) => void;
};

// 多实例定时发送特有配置
const sendInterval = ref(1000); // 默认1000ms
const repeatCount = ref(1); // 默认1次
const isInfinite = ref(false); // 是否无限循环

// 多实例触发发送特有配置
const selectedFrameId = ref('');
const triggerConditions = ref<
  Array<{
    id: string;
    fieldId: string;
    condition: string;
    value: string;
    logicOperator?: 'and' | 'or';
  }>
>([]);

// 添加一个默认的空条件
function addNewCondition() {
  const newCondition: any = {
    id: `condition_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    fieldId: '',
    condition: 'equals',
    value: '',
  };

  if (triggerConditions.value.length > 0) {
    newCondition.logicOperator = 'and';
  }

  triggerConditions.value.push(newCondition);
}

// 初始化一个默认条件(触发类型)
if (props.taskType === 'triggered-multiple' && triggerConditions.value.length === 0) {
  addNewCondition();
}

// 删除条件
function removeCondition(conditionId: string) {
  const index = triggerConditions.value.findIndex((c) => c.id === conditionId);
  if (index !== -1) {
    triggerConditions.value.splice(index, 1);
  }

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

// 计算属性：是否可以保存配置
const canSave = computed(() => {
  const hasInstances = selectedInstances.value.length > 0;

  if (props.taskType === 'timed-multiple') {
    return hasInstances && sendInterval.value > 0 && (isInfinite.value || repeatCount.value > 0);
  } else {
    const hasValidConditions =
      triggerConditions.value.length > 0 &&
      triggerConditions.value.every((condition) => condition.fieldId && condition.value);
    return hasInstances && selectedSourceId.value && selectedFrameId.value && hasValidConditions;
  }
});

// 计算属性：是否可以开始执行任务
const canStartTask = computed(() => {
  return canSave.value && !isProcessing.value;
});

// 关闭对话框
function handleClose() {
  emit('close');
}

// 保存配置
async function saveConfig() {
  if (!canSave.value || isProcessing.value) return;

  try {
    let taskId: string | null = null;

    if (props.taskType === 'timed-multiple') {
      taskId = createTimedMultipleTask(
        selectedInstances.value,
        sendInterval.value,
        repeatCount.value,
        isInfinite.value,
        taskName.value,
        taskDescription.value,
      );
    } else {
      taskId = createTriggeredMultipleTask(
        selectedInstances.value,
        selectedSourceId.value,
        selectedFrameId.value,
        triggerConditions.value,
        taskName.value,
        taskDescription.value,
      );
    }

    if (taskId) {
      // 保存到文件
      const saved = await saveTaskConfigToFile(taskId);
      if (saved) {
        emit('saved', taskId);
      }
    }
  } catch (error) {
    console.error('保存任务配置失败:', error);
  }
}

// 启动任务
async function startConfiguredTask() {
  if (!canStartTask.value) return;

  let taskId: string | null = null;

  if (props.taskType === 'timed-multiple') {
    taskId = createTimedMultipleTask(
      selectedInstances.value,
      sendInterval.value,
      repeatCount.value,
      isInfinite.value,
      taskName.value,
      taskDescription.value,
    );
  } else {
    taskId = createTriggeredMultipleTask(
      selectedInstances.value,
      selectedSourceId.value,
      selectedFrameId.value,
      triggerConditions.value,
      taskName.value,
      taskDescription.value,
    );
  }

  if (taskId) {
    const started = await startTask(taskId);
    if (started) {
      emit('close');
    }
  }
}

// 从文件加载配置
async function loadConfig() {
  try {
    const taskId = await loadTaskConfigFromFile();
    if (taskId) {
      emit('close');
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

// 将实例列表传递给子组件
watch(selectedInstances, (newInstances) => {
  if (instanceListManager.value) {
    instanceListManager.value.setInstances(newInstances);
  }
});

// 页面加载时刷新可用目标
onMounted(() => {
  if (props.taskType === 'triggered-multiple') {
    refreshSourceTargets();
  }
});
</script>

<template>
  <div class="multi-instance-send-dialog h-full w-full">
    <div class="flex flex-col h-full bg-industrial-panel p-4">
      <!-- 标题信息 -->
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-industrial-primary text-base font-medium flex items-center">
              <q-icon
                :name="taskType === 'timed-multiple' ? 'schedule_send' : 'device_hub'"
                size="sm"
                class="mr-2 text-blue-5"
              />
              {{ taskType === 'timed-multiple' ? '多实例定时发送' : '多实例触发发送' }}
            </h2>
            <div class="text-xs text-industrial-secondary mt-1 ml-6">
              {{
                taskType === 'timed-multiple'
                  ? '按设定的时间间隔定时发送多个帧实例'
                  : '当触发条件满足时顺序发送多个帧实例'
              }}
            </div>
          </div>
          <div>
            <q-btn
              flat
              dense
              icon="save"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 mr-2 rounded-md"
              @click="saveConfig"
              :disable="isProcessing || !canSave"
            >
              <q-tooltip>保存配置</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="folder_open"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md"
              @click="loadConfig"
              :disable="isProcessing"
            >
              <q-tooltip>加载配置</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>

      <!-- 任务基本信息配置 -->
      <div class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3">
        <div class="flex flex-col space-y-3">
          <!-- 任务名称 -->
          <div class="flex flex-row items-center">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="label" size="xs" class="mr-1 text-blue-5" />
              <span>任务名称</span>
            </div>
            <q-input
              v-model="taskName"
              dense
              outlined
              dark
              bg-color="rgba(18, 35, 63, 0.7)"
              class="w-full"
              :disable="isProcessing"
              placeholder="输入任务名称"
              input-class="py-0.5 px-1"
              hide-bottom-space
            />
          </div>

          <!-- 任务描述 -->
          <div class="flex flex-row items-start">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center pt-2">
              <q-icon name="description" size="xs" class="mr-1 text-blue-5" />
              <span>任务描述</span>
            </div>
            <q-input
              v-model="taskDescription"
              dense
              outlined
              dark
              bg-color="rgba(18, 35, 63, 0.7)"
              class="w-full"
              type="textarea"
              rows="2"
              :disable="isProcessing"
              placeholder="输入任务描述(可选)"
              input-class="py-0.5 px-1"
              hide-bottom-space
            />
          </div>
        </div>
      </div>

      <!-- 任务特有配置 -->
      <div
        v-if="taskType === 'timed-multiple'"
        class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3"
      >
        <div class="flex flex-col space-y-3">
          <h3 class="text-industrial-primary text-xs font-medium flex items-center">
            <q-icon name="schedule" size="xs" class="mr-1 text-blue-5" />
            <span>定时配置</span>
          </h3>

          <!-- 时间间隔设置 -->
          <div class="flex flex-row items-center ml-6">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="timer" size="xs" class="mr-1 text-blue-5" />
              <span>时间间隔</span>
            </div>

            <div class="flex items-center">
              <q-input
                v-model.number="sendInterval"
                type="number"
                min="100"
                max="60000"
                dense
                outlined
                dark
                bg-color="rgba(18, 35, 63, 0.7)"
                class="w-24"
                :rules="[(val) => val > 0 || '必须大于0']"
                :disable="isProcessing"
                input-class="py-0.5 px-1"
                hide-bottom-space
              />
              <span class="ml-2 text-xs text-industrial-secondary">毫秒</span>
            </div>
          </div>

          <!-- 重复次数设置 -->
          <div class="flex flex-row items-center ml-6">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="repeat" size="xs" class="mr-1 text-blue-5" />
              <span>重复次数</span>
            </div>

            <div class="flex items-center h-[40px]">
              <q-checkbox
                v-model="isInfinite"
                dark
                dense
                :disable="isProcessing"
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
                  :disable="isProcessing"
                  input-class="py-0.5 px-1"
                  hide-bottom-space
                />
                <span class="ml-2 text-xs text-industrial-secondary">次</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 触发任务特有配置 -->
      <div
        v-if="taskType === 'triggered-multiple'"
        class="bg-industrial-secondary rounded-md p-3 shadow-md border border-industrial mb-3"
      >
        <div class="flex flex-col space-y-3">
          <h3 class="text-industrial-primary text-xs font-medium flex items-center justify-between">
            <div class="flex items-center">
              <q-icon name="settings_suggest" size="xs" class="mr-1 text-blue-5" />
              <span>触发配置</span>
            </div>

            <q-btn
              flat
              dense
              round
              icon="add_circle"
              color="positive"
              size="sm"
              @click="addNewCondition"
              :disable="isProcessing"
            >
              <q-tooltip>添加条件</q-tooltip>
            </q-btn>
          </h3>

          <!-- 选择触发帧 -->
          <div class="flex flex-row items-center ml-6">
            <div class="text-xs font-medium text-industrial-primary w-24 flex items-center">
              <q-icon name="data_object" size="xs" class="mr-1 text-blue-5" />
              <span>触发帧</span>
            </div>
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
              :disable="isProcessing"
              placeholder="选择触发帧"
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

          <!-- 监听来源 -->
          <div class="flex flex-row items-center ml-6">
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
              :disable="isProcessing"
              placeholder="选择监听来源"
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
                  :disable="isProcessing"
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
                  :disable="isProcessing || !selectedFrameId"
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
                  :disable="isProcessing"
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
                  :disable="isProcessing"
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
                  :disable="isProcessing || triggerConditions.length <= 1"
                >
                  <q-tooltip>删除条件</q-tooltip>
                </q-btn>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 实例管理器 -->
      <div class="flex-1 mb-3 overflow-hidden">
        <h3 class="text-industrial-primary text-xs font-medium mb-2 flex items-center">
          <q-icon name="format_list_numbered" size="xs" class="mr-1 text-blue-5" />
          <span>帧实例列表</span>
        </h3>

        <InstanceListManager
          ref="instanceListManager"
          :disabled="isProcessing"
          :target-storage-key="
            taskType === 'timed-multiple' ? 'timed-multiple-targets' : 'triggered-multiple-targets'
          "
          :default-interval="1000"
          :allow-interval-edit="true"
          @update:instances="selectedInstances = $event"
        />
      </div>

      <!-- 错误信息 -->
      <div
        v-if="processingError"
        class="bg-industrial-secondary rounded-md p-3 shadow-md border border-red-800 mb-3"
      >
        <div class="flex items-start">
          <q-icon name="error" color="negative" size="sm" class="mt-0.5 mr-2" />
          <div class="text-xs text-red-400">
            {{ processingError }}
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
            :icon="taskType === 'timed-multiple' ? 'schedule_send' : 'device_hub'"
            :label="taskType === 'timed-multiple' ? '开始定时发送' : '开始监听触发'"
            class="rounded-md px-4 text-xs"
            @click="startConfiguredTask"
            :disable="!canStartTask"
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

/* 加宽对话框 */
.multi-instance-send-dialog {
  min-width: 720px;
  max-width: 90vw;
}
</style>
