<template>
  <DataTable
    :columns="columns"
    :data="frames"
    :loading="!!isLoading"
    :selected-id="selectedFrameId || ''"
    row-height="40px"
    emptyText="没有找到帧数据"
    emptyIcon="inventory_2"
    @row-click="handleRowClick"
  >
    <!-- 参数列自定义 -->
    <template #cell-paramCount="{ row }"> {{ row.paramCount }}参数 </template>

    <!-- 时间列自定义 -->
    <template #cell-timestamp="{ row }">
      <span class="text-[#94a3b8]">{{ formatTime(row.timestamp) }}</span>
    </template>

    <!-- 操作列自定义 -->
    <template #cell-actions="{ row }">
      <FrameOperations :frame="row" @action="handleAction" />
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DataTable from '../../common/DataTable.vue';
import FrameOperations from './FrameOperations.vue';
import type { FrameStatus } from '../../../types/frames/index';
import { formatDate } from '../../../utils/frames/frameUtils';
import type { TableColumn } from '../../common/DataTable.vue';

// 定义表格行数据的类型
export interface TableFrame {
  id: string;
  name: string;
  status?: FrameStatus; // 使用类型定义，并且淡化状态字段，设为可选
  paramCount: number;
  value: string | number;
  timestamp: number;
  isFavorite?: boolean;
}

const props = defineProps<{
  isLoading?: boolean;
  frames: TableFrame[];
}>();

const emit = defineEmits<{
  frameSelected: [frameId: string];
  action: [action: string, frameId: string];
}>();

// 选中的帧ID
const selectedFrameId = ref<string | null>(null);

// 列定义 - 移除状态列
const columns: TableColumn[] = [
  {
    field: 'index',
    title: '#',
    width: '50px',
    align: 'center',
    formatter: (_: unknown, row: unknown) => {
      // 类型断言
      const typedRow = row as TableFrame;
      const index = props.frames.findIndex((f) => f.id === typedRow.id);
      return String(index + 1);
    },
  },
  {
    field: 'id',
    title: '帧ID',
    width: '100px',
    class: 'font-mono text-[#ffcb6b]',
  },
  {
    field: 'name',
    title: '名称',
    width: '350px',
  },
  // 移除状态列
  {
    field: 'paramCount',
    title: '参数',
    width: '100px',
    align: 'center',
  },
  {
    field: 'timestamp',
    title: '时间',
    width: '120px',
    align: 'center',
  },
  {
    field: 'actions',
    title: '操作',
    width: '140px',
    align: 'center',
  },
];

// 处理行点击
const handleRowClick = (row: TableFrame) => {
  selectedFrameId.value = row.id;
  emit('frameSelected', row.id);
};

// 处理操作按钮事件
const handleAction = (action: string, frameId: string) => {
  emit('action', action, frameId);
};

// 格式化时间戳，使用formatDate工具函数
const formatTime = (timestamp: number): string => {
  return formatDate(timestamp, 'HH:mm:ss');
};
</script>
