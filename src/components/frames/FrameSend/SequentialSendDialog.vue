<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSerialStore } from '../../../stores/serialStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useConnectionTargets } from '../../../composables/useConnectionTargets';
import { useSendTaskManager } from '../../../composables/frames/sendFrame/useSendTaskManager';
import { FrameInstanceInTask } from '../../../stores/frames/sendTasksStore';
import { QTable } from 'quasar';
import { fileDialogManager } from '../../../utils/common/fileDialogManager';
import { pathAPI } from 'src/utils/electronApi';
import { useStorage } from '@vueuse/core';

// 获取store实例
const serialStore = useSerialStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 使用连接目标管理composable - 使用专用的存储键
const { availableTargets, refreshTargets, parseTargetPath } =
  useConnectionTargets('sequential-send-targets');

// 使用任务管理器
const {
  createSequentialTask,
  startTask,
  saveTaskConfigToFile,
  loadTaskConfigFromFile,
  isProcessing,
  processingError,
} = useSendTaskManager();

const emit = defineEmits<{
  close: [];
}>();

// 顺序发送设置
const defaultInterval = ref(1000); // 默认间隔1000ms
const isSending = ref(false);
const progress = ref(0);
const currentStepIndex = ref(0);
const totalSteps = ref(0);
const sequenceError = ref('');
const selectedInstanceForAdd = ref(''); // 添加被选中的实例ID
const currentTaskId = ref<string | null>(null);

// 选中的实例列表
const selectedInstances = useStorage<FrameInstanceInTask[]>('sequential-send-instances', []);

// 表格列定义
const columns = [
  {
    name: 'order',
    required: true,
    label: '序号',
    align: 'center' as const,
    field: (row: any) => {
      // 使用数组索引代替i参数
      const index = selectedInstances.value.findIndex((item) => item.id === row.id);
      return index + 1;
    },
    sortable: false,
    style: 'width: 50px; min-width: 50px',
    classes: 'text-blue-grey-4',
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
    style: 'width: 150px; min-width: 150px',
  },
  {
    name: 'interval',
    required: true,
    label: '延时(ms)',
    align: 'center' as const,
    field: 'interval',
    style: 'width: 100px; min-width: 100px',
    classes: 'text-blue-300',
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
    field: (row: any) => '',
    style: 'width: 110px; min-width: 110px',
  },
];

// 分页设置
const pagination = ref({
  rowsPerPage: 11,
  page: 1,
});

// 可用的帧实例
const availableInstances = computed(() => {
  return sendFrameInstancesStore.instances;
});

// 计算属性：是否可以开始发送
const canStartSequence = computed(() => {
  return !isSending.value && selectedInstances.value.length > 0 && !isProcessing.value;
});

// 添加实例到序列
function addInstanceToSequence(instanceId: string) {
  const instance = availableInstances.value.find((i) => i.id === instanceId);
  if (!instance) return;

  // 获取默认目标ID（首选已连接的）
  const connectedTarget = availableTargets.value.find((t) => t.status === 'connected');
  const defaultTargetId = connectedTarget?.id || availableTargets.value[0]?.id || '';

  // 允许添加相同的实例多次
  selectedInstances.value.push({
    id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    instanceId,
    targetId: defaultTargetId,
    interval: defaultInterval.value,
  });

  // 添加后清空选择，方便下次选择
  selectedInstanceForAdd.value = '';
}

// 从序列中移除实例
function removeInstanceFromSequence(index: number) {
  if (isSending.value) return;
  if (index >= 0 && index < selectedInstances.value.length) {
    selectedInstances.value.splice(index, 1);
  }
}

// 上移实例
function moveInstanceUp(index: number) {
  if (isSending.value || index <= 0) return;
  const temp = selectedInstances.value[index];
  const prevInstance = selectedInstances.value[index - 1];

  if (temp && prevInstance) {
    selectedInstances.value[index] = prevInstance;
    selectedInstances.value[index - 1] = temp;
  }
}

// 下移实例
function moveInstanceDown(index: number) {
  if (isSending.value || index >= selectedInstances.value.length - 1) return;
  const temp = selectedInstances.value[index];
  const nextInstance = selectedInstances.value[index + 1];

  if (temp && nextInstance) {
    selectedInstances.value[index] = nextInstance;
    selectedInstances.value[index + 1] = temp;
  }
}

// 更新实例延时
function updateInstanceInterval(index: number, value: number) {
  if (isSending.value) return;
  if (index >= 0 && index < selectedInstances.value.length) {
    const intervalValue = typeof value === 'number' ? value : 0;
    const instance = selectedInstances.value[index];
    if (instance) {
      instance.interval = intervalValue < 0 ? 0 : intervalValue;
    }
  }
}

// 更新实例目标
function updateInstanceTarget(index: number, targetId: string) {
  if (isSending.value) return;
  if (index >= 0 && index < selectedInstances.value.length) {
    const instance = selectedInstances.value[index];
    if (instance) {
      instance.targetId = targetId;
    }
  }
}

// 关闭对话框
function handleClose() {
  emit('close');
}

// 开始顺序发送
async function startSequence() {
  if (!canStartSequence.value) return;

  isSending.value = true;
  currentStepIndex.value = 0;
  totalSteps.value = selectedInstances.value.length;
  progress.value = 0;
  sequenceError.value = '';

  try {
    // 使用任务管理器创建并启动任务
    const taskId = createSequentialTask(
      selectedInstances.value,
      '顺序发送任务',
      `包含${selectedInstances.value.length}个帧实例的顺序发送配置`,
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
    console.error('启动顺序发送失败:', error);
    isSending.value = false;
    sequenceError.value = error instanceof Error ? error.message : '发送失败';
  }
}

// 保存序列
async function saveSequence() {
  try {
    if (selectedInstances.value.length === 0) {
      console.warn('没有可保存的序列');
      return;
    }

    // 先创建任务但不启动
    const taskId = createSequentialTask(
      selectedInstances.value,
      '顺序发送配置',
      `包含${selectedInstances.value.length}个帧实例的顺序发送配置`,
    );

    if (taskId) {
      // 保存任务配置到文件
      const saved = await saveTaskConfigToFile(taskId);
      if (!saved) {
        throw new Error(processingError.value || '保存配置失败');
      }
    }
  } catch (error) {
    console.error('保存序列过程发生错误:', error);
  }
}

// 加载序列
async function loadSequence() {
  try {
    // 使用任务管理器加载配置
    const taskId = await loadTaskConfigFromFile();
    if (taskId) {
      emit('close');
    }
  } catch (error) {
    console.error('加载序列过程发生错误:', error);
  }
}

// 页面加载时刷新可用目标
refreshTargets();
</script>

<template>
  <div class="sequential-send-dialog h-full w-full">
    <div class="flex flex-col h-full bg-industrial-panel p-4">
      <!-- 标题信息 -->
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-industrial-primary text-base font-medium flex items-center">
              <q-icon name="queue_play_next" size="sm" class="mr-2 text-blue-5" />
              顺序发送设置
            </h2>
            <div class="text-xs text-industrial-secondary mt-1 ml-6">
              按照设定的顺序依次发送多个帧实例
            </div>
          </div>
          <div>
            <q-btn
              flat
              dense
              icon="save"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 mr-2 rounded-md"
              @click="saveSequence"
              :disable="isSending || selectedInstances.length === 0 || isProcessing"
            >
              <q-tooltip>保存当前顺序</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="folder_open"
              color="blue-grey"
              class="bg-industrial-secondary bg-opacity-60 hover:bg-opacity-100 rounded-md"
              @click="loadSequence"
              :disable="isSending || isProcessing"
            >
              <q-tooltip>加载顺序</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>

      <!-- 表格区域：顺序列表 -->
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
            <!-- 添加这个表头模板 -->
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
                class="text-center text-xs font-mono text-blue-400"
                :style="props.col.style"
              >
                {{ props.value }}
              </q-td>
            </template>

            <!-- 实例名称列 -->
            <template #body-cell-label="props">
              <q-td :props="props" :style="props.col.style">
                <div class="flex items-center text-xs">
                  <q-icon name="list_alt" size="xs" class="mr-2 text-blue-5" />
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
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-full max-w-[180px]"
                  :disable="isSending || isProcessing"
                  @update:model-value="updateInstanceTarget(props.rowIndex, $event)"
                  input-class="py-0.5 px-1 text-xs"
                  hide-bottom-space
                >
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label class="text-xs">{{ scope.opt.name }}</q-item-label>
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
                          class="text-blue-5"
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
                  bg-color="rgba(18, 35, 63, 0.7)"
                  class="w-20"
                  :disable="isSending || isProcessing"
                  @update:model-value="updateInstanceInterval(props.rowIndex, $event as number)"
                  input-class="py-0.5 px-1 text-xs"
                  hide-bottom-space
                />
              </q-td>
            </template>

            <!-- 状态列 -->
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-badge
                  :color="
                    props.row.status === 'idle' || !props.row.status
                      ? 'blue-grey'
                      : props.row.status === 'running'
                        ? 'blue'
                        : props.row.status === 'completed'
                          ? 'positive'
                          : 'negative'
                  "
                  class="text-2xs"
                >
                  {{
                    props.row.status === 'idle' || !props.row.status
                      ? '等待中'
                      : props.row.status === 'running'
                        ? '发送中'
                        : props.row.status === 'completed'
                          ? '已发送'
                          : '发送失败'
                  }}
                </q-badge>
                <div v-if="props.row.errorMessage" class="text-2xs text-negative mt-1">
                  {{ props.row.errorMessage }}
                </div>
              </q-td>
            </template>

            <!-- 操作列 -->
            <template #body-cell-actions="props">
              <q-td :props="props">
                <div class="flex justify-center">
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
                bg-color="rgba(18, 35, 63, 0.7)"
                class="flex-1"
                :disable="isSending || isProcessing"
                placeholder="选择要添加的帧实例"
                input-class="py-0.5 px-1 text-xs"
                hide-bottom-space
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label class="text-xs">{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption class="text-2xs">
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
        class="bg-industrial-secondary rounded-md p-3 shadow-md border border-red-800 mb-3"
      >
        <div class="flex items-start">
          <q-icon name="error" color="negative" size="sm" class="mt-0.5 mr-2" />
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
            icon="play_arrow"
            label="开始顺序发送"
            class="rounded-md px-4 text-xs"
            @click="startSequence"
            :disable="!canStartSequence"
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

/* 加宽对话框 */
.sequential-send-dialog {
  min-width: 720px;
  max-width: 90vw;
}
</style>
