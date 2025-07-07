<template>
  <div
    class="flex-1 flex flex-col bg-industrial-secondary rounded-md shadow-md border border-industrial p-2 overflow-hidden mb-3"
  >
    <div class="flex-1 overflow-auto">
      <q-table
        :rows="instances"
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
              :model-value="props.row.targetId"
              :options="availableTargets"
              option-value="id"
              option-label="name"
              dense
              outlined
              emit-value
              map-options
              dark
              class="bg-industrial-panel w-full max-w-[180px]"
              :disable="isLoading"
              @update:model-value="$emit('update-target', props.rowIndex, $event)"
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
              :model-value="props.row.interval"
              type="number"
              min="0"
              max="60000"
              dense
              outlined
              dark
              class="bg-industrial-panel w-20"
              :disable="isLoading"
              @update:model-value="
                (value) => $emit('update-interval', props.rowIndex, Number(value) || 0)
              "
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
                :disable="isLoading || props.rowIndex === 0"
                @click="$emit('move-up', props.rowIndex)"
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
                :disable="isLoading || props.rowIndex === instances.length - 1"
                @click="$emit('move-down', props.rowIndex)"
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
                :disable="isLoading"
                @click="$emit('remove-instance', props.rowIndex)"
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
            :model-value="selectedInstanceForAdd"
            :options="availableInstances"
            option-value="id"
            option-label="label"
            dense
            outlined
            emit-value
            map-options
            dark
            class="bg-industrial-panel flex-1"
            :disable="isLoading"
            placeholder="选择要添加的帧实例"
            input-class="py-0.5 px-1 text-xs text-industrial-primary"
            hide-bottom-space
            @update:model-value="$emit('update:selected-instance-for-add', $event)"
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
            :disable="!selectedInstanceForAdd || isLoading"
            @click="$emit('add-instance', selectedInstanceForAdd)"
          >
            <q-tooltip>添加到序列</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FrameInstanceInTask } from '../../../../stores/frames/sendTasksStore';

export interface ConnectionTarget {
  id: string;
  name: string;
  type: string;
  status: string;
  description?: string;
}

export interface FrameInstance {
  id: string;
  label: string;
  description?: string;
}

const props = defineProps<{
  instances: FrameInstanceInTask[];
  availableTargets: ConnectionTarget[];
  availableInstances: FrameInstance[];
  selectedInstanceForAdd: string;
  isLoading?: boolean;
}>();

defineEmits<{
  'update-target': [index: number, targetId: string];
  'update-interval': [index: number, interval: number];
  'move-up': [index: number];
  'move-down': [index: number];
  'remove-instance': [index: number];
  'add-instance': [instanceId: string];
  'update:selected-instance-for-add': [value: string];
}>();

// 表格列定义
const columns = [
  {
    name: 'order',
    required: true,
    label: '序号',
    align: 'center' as const,
    field: (row: FrameInstanceInTask) => {
      const index = props.instances.findIndex((item) => item.id === row.id);
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
    field: (row: FrameInstanceInTask) => {
      const instance = props.availableInstances.find((i) => i.id === row.instanceId);
      return instance?.label || '未知实例';
    },
    style: 'width: 100%; min-width: 100%',
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
const pagination = {
  rowsPerPage: 10,
  page: 1,
};

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
