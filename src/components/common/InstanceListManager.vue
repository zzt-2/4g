<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSendFrameInstancesStore } from '../../stores/frames/sendFrameInstancesStore';
import { useConnectionTargets } from '../../composables/useConnectionTargets';
import { QTable } from 'quasar';
import { FrameInstanceInTask } from '../../stores/frames/sendTasksStore';

// 定义props
const props = defineProps<{
  // 是否禁用编辑功能
  disabled?: boolean;
  // 用于存储连接目标的唯一键
  targetStorageKey?: string;
  // 默认的实例间延迟
  defaultInterval?: number;
  // 允许编辑延迟
  allowIntervalEdit?: boolean;
}>();

// 定义事件
const emit = defineEmits<{
  // 实例列表变更时触发
  'update:instances': [instances: FrameInstanceInTask[]];
  // 选中实例后触发
  select: [instanceId: string];
}>();

// 默认值
const defaultInterval = props.defaultInterval ?? 1000;
const targetStorageKey = props.targetStorageKey ?? 'instance-list-targets';

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 使用连接目标管理composable
const { availableTargets, refreshTargets, parseTargetPath } =
  useConnectionTargets(targetStorageKey);

// 状态
const selectedInstanceForAdd = ref(''); // 添加被选中的实例ID
const selectedInstances = ref<FrameInstanceInTask[]>([]);
const isLoading = ref(false);

// 观察selectedInstances变化，向父组件发射更新事件
watch(
  selectedInstances,
  (newInstances) => {
    emit('update:instances', newInstances);
  },
  { deep: true },
);

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
      const instance = sendFrameInstancesStore.instances.find((inst) => inst.id === row.instanceId);
      return instance ? instance.label : '未知实例';
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
    required: props.allowIntervalEdit !== false,
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

/**
 * 添加实例到序列
 */
function addInstanceToSequence(instanceId: string) {
  if (props.disabled) return;

  const instance = availableInstances.value.find((i) => i.id === instanceId);
  if (!instance) return;

  // 获取默认目标ID（首选已连接的）
  const connectedTarget = availableTargets.value.find((t) => t.status === 'connected');
  const defaultTargetId = connectedTarget?.id || availableTargets.value[0]?.id || '';

  // 允许添加相同的实例多次
  selectedInstances.value.push({
    id: `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    instanceId: instance.id,
    targetId: defaultTargetId,
    interval: defaultInterval,
    status: 'idle',
  });

  // 添加后清空选择，方便下次选择
  selectedInstanceForAdd.value = '';
}

/**
 * 从序列中移除实例
 */
function removeInstanceFromSequence(index: number) {
  if (props.disabled) return;

  if (index >= 0 && index < selectedInstances.value.length) {
    selectedInstances.value.splice(index, 1);
  }
}

/**
 * 上移实例
 */
function moveInstanceUp(index: number) {
  if (props.disabled || index <= 0) return;

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
  if (props.disabled || index >= selectedInstances.value.length - 1) return;

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
  if (props.disabled || props.allowIntervalEdit === false) return;

  if (index >= 0 && index < selectedInstances.value.length) {
    const intervalValue = typeof value === 'number' ? value : 0;
    const instance = selectedInstances.value[index];
    if (instance) {
      instance.interval = intervalValue < 0 ? 0 : intervalValue;
    }
  }
}

/**
 * 更新实例目标
 */
function updateInstanceTarget(index: number, targetId: string) {
  if (props.disabled) return;

  if (index >= 0 && index < selectedInstances.value.length) {
    const instance = selectedInstances.value[index];
    if (instance) {
      instance.targetId = targetId;
    }
  }
}

/**
 * 设置实例列表
 */
function setInstances(instances: FrameInstanceInTask[]) {
  selectedInstances.value = [...instances];
}

/**
 * 清空实例列表
 */
function clearInstances() {
  selectedInstances.value = [];
}

/**
 * 初始化组件
 */
onMounted(async () => {
  isLoading.value = true;
  try {
    await refreshTargets();
  } catch (error) {
    console.error('刷新目标失败:', error);
  } finally {
    isLoading.value = false;
  }
});

// 暴露给父组件的方法
defineExpose({
  setInstances,
  clearInstances,
  selectedInstances,
});
</script>

<template>
  <div class="instance-list-manager">
    <!-- 表格区域：实例列表 -->
    <div
      class="flex-1 flex flex-col bg-industrial-secondary rounded-md shadow-md border border-industrial p-2 overflow-hidden"
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
          :loading="isLoading"
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
                :disable="disabled"
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
            <q-td :props="props" v-if="allowIntervalEdit !== false">
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
                :disable="disabled"
                @update:model-value="updateInstanceInterval(props.rowIndex, $event as number)"
                input-class="py-0.5 px-1 text-xs"
                hide-bottom-space
              />
            </q-td>
            <q-td :props="props" v-else class="text-xs text-center">
              {{ props.value }}
            </q-td>
          </template>

          <!-- 状态列 -->
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge
                :color="
                  props.row.status === 'idle' || props.row.status === 'pending'
                    ? 'blue-grey'
                    : props.row.status === 'running' || props.row.status === 'sending'
                      ? 'blue'
                      : props.row.status === 'completed' || props.row.status === 'success'
                        ? 'positive'
                        : props.row.status === 'error'
                          ? 'negative'
                          : props.row.status === 'paused'
                            ? 'orange'
                            : 'blue-grey'
                "
                class="text-2xs"
              >
                {{
                  props.row.status === 'idle' || props.row.status === 'pending'
                    ? '等待中'
                    : props.row.status === 'running' || props.row.status === 'sending'
                      ? '发送中'
                      : props.row.status === 'completed' || props.row.status === 'success'
                        ? '已发送'
                        : props.row.status === 'error'
                          ? '发送失败'
                          : props.row.status === 'paused'
                            ? '已暂停'
                            : props.row.status
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
                  :disable="disabled || props.rowIndex === 0"
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
                  :disable="disabled || props.rowIndex === selectedInstances.length - 1"
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
                  :disable="disabled"
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
              尚未添加任何帧实例
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
              :disable="disabled"
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
              :disable="!selectedInstanceForAdd || disabled"
              @click="addInstanceToSequence(selectedInstanceForAdd)"
            >
              <q-tooltip>添加到序列</q-tooltip>
            </q-btn>
          </div>
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
