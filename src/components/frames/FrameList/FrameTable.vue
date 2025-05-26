<template>
  <q-table
    :rows="frames"
    :columns="qColumns"
    :loading="!!isLoading"
    row-key="id"
    v-model:selected="selectedRow"
    selection="single"
    virtual-scroll
    :virtual-scroll-slice-size="7"
    :rows-per-page-options="[0]"
    hide-pagination
    flat
    dark
    dense
    class="w-full h-full bg-industrial-panel text-industrial-primary rounded overflow-hidden flex flex-col"
    @row-click="onRowClick"
  >
    <!-- 自定义表头样式 -->
    <template v-slot:header="props">
      <q-tr
        :props="props"
        class="bg-[#1a3663] border-b border-[#334155] font-bold h-10 whitespace-nowrap sticky-header"
      >
        <q-th
          v-for="col in props.cols"
          :key="col.name"
          :props="props"
          :class="[
            col.align === 'center'
              ? 'text-center'
              : col.align === 'right'
                ? 'text-right'
                : 'text-left',
            'text-xs px-2',
          ]"
          :style="{
            width: col.width,
            minWidth: col.width,
          }"
        >
          {{ col.label }}
        </q-th>
      </q-tr>
    </template>

    <!-- 自定义行样式 -->
    <template v-slot:body="props">
      <q-tr
        :props="props"
        :class="[
          { 'bg-[#1d4ed8]': props.row.id === selectedFrameId },
          props.rowIndex % 2 === 1 ? 'bg-[#0f2744]' : '',
          'border-b border-[#1a3663] hover:bg-[#1e3a6a] transition-colors duration-200 cursor-pointer',
        ]"
        class="h-10 whitespace-nowrap"
        @click="onRowClick($event, props.row)"
      >
        <q-td
          v-for="col in props.cols"
          :key="col.name"
          :props="props"
          :class="[
            col.align === 'center'
              ? 'text-center'
              : col.align === 'right'
                ? 'text-right'
                : 'text-left',
            col.name === 'id' ? 'font-mono text-[#ffcb6b]' : '',
            'text-xs px-2 overflow-hidden text-ellipsis',
          ]"
          :style="{
            width: col.width,
            minWidth: col.width,
          }"
        >
          <!-- 序号列 -->
          <template v-if="col.name === 'index'">
            {{ props.rowIndex + 1 }}
          </template>

          <!-- 参数列 -->
          <template v-else-if="col.name === 'paramCount'">
            {{ props.row.paramCount }}参数
          </template>

          <!-- 时间列 -->
          <template v-else-if="col.name === 'timestamp'">
            <span class="text-[#94a3b8]">{{ formatTime(props.row.timestamp) }}</span>
          </template>

          <!-- 操作列 -->
          <template v-else-if="col.name === 'actions'">
            <div class="flex justify-center">
              <FrameOperations :frame="props.row" @action="handleAction" />
            </div>
          </template>

          <!-- 其他普通列 -->
          <template v-else>
            {{ props.row[col.name] }}
          </template>
        </q-td>
      </q-tr>
    </template>

    <!-- 空数据状态 -->
    <template v-slot:no-data>
      <div class="flex flex-col items-center justify-center p-10 text-industrial-secondary">
        <q-icon name="inventory_2" size="48px" color="grey-7" />
        <div class="mt-4">没有找到帧数据</div>
      </div>
    </template>

    <!-- 加载中状态 -->
    <template v-slot:loading>
      <div class="flex flex-col items-center justify-center h-full p-10 text-industrial-secondary">
        <q-spinner color="primary" size="40px" />
        <div class="mt-4">加载中...</div>
      </div>
    </template>
  </q-table>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import FrameOperations from './FrameOperations.vue';
import { formatDate } from '../../../utils/frames/frameUtils';

// 定义表格行数据的类型
export interface TableFrame {
  id: string;
  name: string;
  paramCount: number;
  value: string | number;
  timestamp: number;
  isFavorite?: boolean;
}

// 组件属性
const props = defineProps<{
  isLoading?: boolean;
  frames: TableFrame[];
}>();

const emit = defineEmits<{
  frameSelected: [frameId: string];
  action: [action: string, frameId: string];
}>();

// 选中的帧ID和行
const selectedFrameId = ref<string | null>(null);
const selectedRow = ref([]);

// QTable列定义 - 修复类型问题
const qColumns = [
  {
    name: 'index',
    label: '#',
    field: 'index',
    width: '50px',
    align: 'center' as const,
    sortable: true,
  },
  {
    name: 'id',
    label: '帧ID',
    field: 'id',
    width: '20%',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'name',
    label: '名称',
    field: 'name',
    width: '100%',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'paramCount',
    label: '参数',
    field: 'paramCount',
    width: '100px',
    align: 'center' as const,
    sortable: true,
  },
  {
    name: 'timestamp',
    label: '时间',
    field: 'timestamp',
    width: '120px',
    align: 'center' as const,
    sortable: true,
  },
  {
    name: 'actions',
    label: '操作',
    field: 'actions',
    width: '140px',
    align: 'center' as const,
    sortable: false,
  },
];

// 处理行点击 - 添加console.log以便调试
const onRowClick = (_evt: Event, row: TableFrame) => {
  console.log('行点击事件触发:', row.id);
  selectedFrameId.value = row.id;
  emit('frameSelected', row.id);
};

// 处理操作按钮事件
const handleAction = (action: string, frameId: string) => {
  console.log('操作按钮被点击:', action, frameId);
  emit('action', action, frameId);
};

// 格式化时间戳，使用formatDate工具函数
const formatTime = (timestamp: number): string => {
  return formatDate(timestamp);
};

// 组件挂载后打印一些信息以便调试
onMounted(() => {
  console.log('FrameTable组件已挂载, 行数:', props.frames.length);
});
</script>

<style lang="scss">
// 自定义滚动条样式
.q-table__virtual-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.q-table__virtual-content::-webkit-scrollbar-track {
  background: #1e293b;
  border-radius: 4px;
}

.q-table__virtual-content::-webkit-scrollbar-thumb {
  background: #475569;
  border-radius: 4px;
}

.q-table__virtual-content::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

// 确保表格充满容器和内容区域可滚动
.q-table {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.q-table__container {
  height: 100%;
}

.q-table__middle {
  flex: 1;
  overflow: hidden;
}

// 修复行高度
.q-table tbody tr {
  height: 40px;
}
</style>
