<template>
  <div
    class="flex-1 flex flex-col bg-industrial-secondary rounded-md shadow-md border border-industrial p-2 overflow-hidden mb-3">
    <div class="flex-1 overflow-auto">
      <q-table :rows="instances" :columns="columns" row-key="id" dark flat dense :pagination="pagination"
        :loading="isLoading" binary-state-sort class="bg-transparent" table-style="table-layout: fixed; width: 100%">
        <!-- 表头模板 -->
        <template v-slot:header="props">
          <q-tr :props="props">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" :style="col.style" :class="[
              col.classes,
              {
                'text-left': col.align === 'left',
                'text-right': col.align === 'right',
                'text-center': col.align === 'center',
              },
            ]">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- 序号列 -->
        <template #body-cell-order="props">
          <q-td :props="props" class="text-center text-xs font-mono text-industrial-id" :style="props.col.style">
            {{ props.rowIndex + 1 }}
          </q-td>
        </template>

        <!-- 实例名称列 -->
        <template #body-cell-label="props">
          <q-td :props="props" :style="props.col.style">
            <div class="flex items-center text-xs text-industrial-primary">
              <q-icon name="list_alt" size="xs" class="mr-2 text-industrial-accent" />
              {{ getInstanceLabel(props.row.instanceId) }}
            </div>
          </q-td>
        </template>

        <!-- 可变参数列 -->
        <template #body-cell-variableFields="props">
          <q-td :props="props" class="px-2">
            <div class="flex flex-col h-10 overflow-y-auto no-wrap">
              <!-- 可变参数列表区域 -->
              <div v-for="(fieldVar, varIndex) in props.row.fieldVariations" :key="`${props.row.id}-${varIndex}`"
                class="flex items-center gap-1 bg-industrial-highlight rounded text-xs pb-1">
                <!-- 字段选择 -->
                <q-select :model-value="fieldVar.fieldId" :options="getFieldOptionsForInstance(props.row.instanceId)"
                  option-value="id" option-label="label" dense outlined emit-value map-options dark
                  class="bg-industrial-panel w-36" :disable="isLoading" placeholder="选择字段"
                  @update:model-value="$emit('update-field-selection', props.rowIndex, varIndex, $event)"
                  input-class="py-0.5 px-1 text-xs text-industrial-primary" hide-bottom-space>
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label class="text-xs text-industrial-primary">{{ scope.opt.label }}</q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>

                <!-- 参数值输入 -->
                <q-input :model-value="fieldVar.values?.join(',') || ''" dense outlined dark
                  class="bg-industrial-panel flex-1 min-w-20" :disable="isLoading" placeholder="逗号分隔"
                  @update:model-value="$emit('update-variable-values', props.rowIndex, fieldVar.fieldId, String($event || ''))"
                  input-class="py-0.5 px-1 text-xs text-industrial-primary" hide-bottom-space />

                <!-- 加载文件按钮 -->
                <q-btn flat dense round size="xs" icon="folder_open" color="accent" :disable="isLoading"
                  @click="$emit('load-variable-file', props.rowIndex, fieldVar.fieldId)">
                  <q-tooltip>加载文件</q-tooltip>
                </q-btn>

                <!-- 删除按钮 -->
                <q-btn flat dense round size="xs" icon="delete_outline" color="negative" :disable="isLoading"
                  @click="$emit('remove-field-variation', props.rowIndex, varIndex)">
                  <q-tooltip>删除此字段</q-tooltip>
                </q-btn>
              </div>

              <!-- 添加按钮 -->
              <q-btn flat dense class="justify-center text-xs h-10" icon="add" color="positive" :disable="isLoading"
                @click="$emit('add-field-variation', props.rowIndex)">
                添加参数
              </q-btn>
            </div>
          </q-td>
        </template>

        <!-- 发送目标列 -->
        <template #body-cell-targetId="props">
          <q-td :props="props" :style="props.col.style">
            <q-select :model-value="props.row.targetId" :options="availableTargets" option-value="id"
              option-label="name" dense outlined emit-value map-options dark
              class="bg-industrial-panel w-full max-w-[180px]" :disable="isLoading"
              @update:model-value="$emit('update-target', props.rowIndex, $event)"
              input-class="py-0.5 px-1 text-xs text-industrial-primary" hide-bottom-space>
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label class="text-xs text-industrial-primary">{{
                      scope.opt.name
                      }}</q-item-label>
                    <q-item-label caption class="text-2xs">
                      <span :class="scope.opt.status === 'connected' ? 'text-positive' : 'text-negative'
                        ">
                        {{ scope.opt.status === 'connected' ? '已连接' : '未连接' }}
                      </span>
                      <span v-if="scope.opt.description" class="ml-2 text-industrial-tertiary">
                        {{ scope.opt.description }}
                      </span>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon :name="scope.opt.type === 'serial'
                      ? 'usb'
                      : scope.opt.type === 'network'
                        ? 'lan'
                        : 'device_hub'
                      " size="xs" class="text-industrial-accent" />
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </q-td>
        </template>

        <!-- 延时列 -->
        <template #body-cell-interval="props">
          <q-td :props="props">
            <q-input :model-value="props.row.interval" type="number" min="0" max="60000" dense outlined dark
              class="bg-industrial-panel w-20" :disable="isLoading" @update:model-value="
                (value) => $emit('update-interval', props.rowIndex, Number(value) || 0)
              " input-class="py-0.5 px-1 text-xs text-industrial-primary" hide-bottom-space />
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
              <q-btn flat dense round size="xs" icon="arrow_upward" color="blue-grey"
                :disable="isLoading || props.rowIndex === 0" @click="$emit('move-up', props.rowIndex)">
                <q-tooltip>上移</q-tooltip>
              </q-btn>
              <q-btn flat dense round size="xs" icon="arrow_downward" color="blue-grey"
                :disable="isLoading || props.rowIndex === instances.length - 1"
                @click="$emit('move-down', props.rowIndex)">
                <q-tooltip>下移</q-tooltip>
              </q-btn>
              <q-btn flat dense round size="xs" icon="delete_outline" color="negative" :disable="isLoading"
                @click="$emit('remove-instance', props.rowIndex)">
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
          <q-select :model-value="selectedInstanceForAdd" :options="availableInstances" option-value="id"
            option-label="label" dense outlined emit-value map-options dark class="bg-industrial-panel flex-1"
            :disable="isLoading" placeholder="选择要添加的帧实例" input-class="py-0.5 px-1 text-xs text-industrial-primary"
            hide-bottom-space @update:model-value="$emit('update:selected-instance-for-add', $event)">
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
          <q-btn flat round dense icon="add" color="positive" class="ml-2"
            :disable="!selectedInstanceForAdd || isLoading" @click="$emit('add-instance', selectedInstanceForAdd)">
            <q-tooltip>添加到序列</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FrameInstanceInTask } from '../../../../stores/frames/sendTasksStore';
import { useSendFrameInstancesStore } from 'src/stores/framesStore';

export interface ConnectionTarget {
  id: string;
  name: string;
  type: string;
  status: string;
  description?: string;
}

export interface FrameInstance {
  id: string;
  frameId?: string;
  label: string;
  description?: string;
  fields?: {
    id: string;
    label: string;
  }[];
}

const props = defineProps<{
  instances: FrameInstanceInTask[];
  availableTargets: ConnectionTarget[];
  availableInstances: FrameInstance[];
  selectedInstanceForAdd: string;
  isLoading?: boolean;
  showVariableFields?: boolean; // 是否显示可变参数列
}>();

defineEmits<{
  'update-target': [index: number, targetId: string];
  'update-interval': [index: number, interval: number];
  'move-up': [index: number];
  'move-down': [index: number];
  'remove-instance': [index: number];
  'add-instance': [instanceId: string];
  'update:selected-instance-for-add': [value: string];
  'update-variable-values': [index: number, fieldId: string, values: string];
  'load-variable-file': [index: number, fieldId: string];
  'add-field-variation': [index: number];
  'remove-field-variation': [index: number, varIndex: number];
  'update-field-selection': [index: number, varIndex: number, fieldId: string];
}>();

// 表格列定义
const columns = computed(() => {
  const baseColumns = [
    {
      name: 'order',
      required: true,
      label: '序号',
      align: 'center' as const,
      field: 'order',
      sortable: false,
      style: 'width: 60px; min-width: 60px',
      classes: 'text-industrial-id',
    },
    {
      name: 'label',
      required: true,
      label: '实例名称',
      align: 'left' as const,
      field: 'label',
      sortable: true,
      style: 'width: 100%',
      classes: '',
    },
  ];

  // 可变参数列
  if (props.showVariableFields) {
    baseColumns.push({
      name: 'variableFields',
      required: true,
      label: '参数变化',
      align: 'center' as const,
      field: 'variableFields',
      sortable: false,
      style: 'width: 400px; min-width: 400px',
      classes: '',
    });
  }

  // 其他列
  baseColumns.push(
    {
      name: 'targetId',
      required: true,
      label: '发送目标',
      align: 'left' as const,
      field: 'targetId',
      sortable: false,
      style: 'width: 180px; min-width: 180px',
      classes: '',
    },
    {
      name: 'interval',
      required: true,
      label: '延时(ms)',
      align: 'center' as const,
      field: 'interval',
      sortable: false,
      style: 'width: 100px; min-width: 100px',
      classes: '',
    },
    {
      name: 'status',
      required: true,
      label: '状态',
      align: 'center' as const,
      field: 'status',
      sortable: false,
      style: 'width: 100px; min-width: 100px',
      classes: '',
    },
    {
      name: 'actions',
      required: true,
      label: '操作',
      align: 'center' as const,
      field: 'actions',
      sortable: false,
      style: 'width: 140px; min-width: 140px',
      classes: '',
    }
  );

  return baseColumns;
});

// 分页设置
const pagination = {
  rowsPerPage: 10,
  page: 1,
};

const sendFrameInstancesStore = useSendFrameInstancesStore();

/**
 * 获取实例标签
 */
function getInstanceLabel(instanceId: string): string {
  const instance = props.availableInstances.find((i) => i.id === instanceId);
  return instance?.label || '未知实例';
}

/**
 * 获取实例的字段选项
 */
function getFieldOptionsForInstance(instanceId: string) {
  if (!props.showVariableFields || !instanceId) return [];

  const fieldOptions = sendFrameInstancesStore.sendFrameOptions.find((instance) => instance.id === instanceId)?.fields?.map((field) => ({
    id: field.id,
    label: field.name,
  }));
  return fieldOptions
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
</script>

<style scoped>
.text-2xs {
  font-size: 0.65rem;
}

/* 修改Quasar的样式，消除底部空间 */
:deep(.q-field--with-bottom.q-field--hide-bottom-space .q-field__bottom) {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>
