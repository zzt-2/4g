<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 从store直接获取实例数据
const instances = computed(() => sendFrameInstancesStore.instances);
const selectedInstanceId = computed(() => sendFrameInstancesStore.currentInstanceId);

// 表格列定义
const columns = [
  {
    name: 'index',
    label: '#',
    field: 'index',
    align: 'center' as const,
    sortable: false,
    style: 'width: 40px; min-width: 40px',
    classes: 'text-blue-grey-4',
  },
  {
    name: 'id',
    label: '编号',
    field: 'id',
    align: 'center' as const,
    sortable: true,
    style: 'width: 60px; min-width: 60px',
    classes: 'font-mono text-blue-300',
  },
  {
    name: 'label',
    label: '名称',
    field: 'label',
    align: 'left' as const,
    sortable: true,
    style: 'width: 180px; min-width: 180px',
  },
  {
    name: 'paramCount',
    label: '参数数',
    field: 'paramCount',
    align: 'center' as const,
    sortable: true,
    style: 'width: 70px; min-width: 70px',
    classes: 'text-blue-300',
  },
  {
    name: 'timestamp',
    label: '更新时间',
    field: 'timestamp',
    align: 'center' as const,
    sortable: true,
    style: 'width: 130px; min-width: 130px',
    classes: 'text-blue-grey-5',
  },
  {
    name: 'description',
    label: '备注',
    field: 'description',
    align: 'left' as const,
    sortable: true,
    style: 'width: 220px; min-width: 220px',
    classes: 'text-blue-grey-5',
  },
  {
    name: 'operations',
    label: '操作',
    field: 'operations',
    align: 'center' as const,
    sortable: false,
    style: 'width: 90px; min-width: 90px',
  },
];

// 表格分页设置
const pagination = ref({
  rowsPerPage: 0, // 0表示不分页，显示所有数据
});

// 表格控制相关
const tableReady = ref(false);
const tableRef = ref<{ $el?: HTMLElement } | null>(null);

// 确保表格布局稳定
onMounted(async () => {
  await nextTick();
  setTimeout(() => {
    tableReady.value = true;
    // 强制更新表格布局
    if (tableRef.value?.$el) {
      tableRef.value.$el.style.width = '100%';
      // 触发重排
      void tableRef.value.$el.offsetWidth;
    }
  }, 100);
});

// 当选择行时触发select-instance事件
function onRowClick(evt: Event, row: SendFrameInstance) {
  sendFrameInstancesStore.setCurrentInstance(row.id);
}

// 处理双击实例的方法 - 直接在组件中实现
function onRowDblClick(evt: Event, row: SendFrameInstance) {
  // 设置当前实例
  sendFrameInstancesStore.setCurrentInstance(row.id);
  // 设置为非新建模式
  sendFrameInstancesStore.isCreatingNewInstance = false;
  // 打开编辑对话框
  sendFrameInstancesStore.showEditorDialog = true;
}

// 添加复制帧的处理函数
async function copyFrame(frame: SendFrameInstance) {
  try {
    const copiedInstance = await sendFrameInstancesStore.copyInstance(frame.id);
    if (copiedInstance) {
      // 选中复制的实例
      sendFrameInstancesStore.setCurrentInstance(copiedInstance.id);
    }
  } catch (error) {
    console.error('复制实例失败:', error);
  }
}

// 处理删除帧
function deleteFrame(frame: SendFrameInstance) {
  try {
    // 使用Quasar确认对话框
    const $q = window.$q;

    if ($q) {
      $q.dialog({
        title: '确认删除',
        message: '确定要删除这个发送实例吗？',
        cancel: true,
        persistent: true,
      }).onOk(() => {
        void sendFrameInstancesStore.deleteInstance(frame.id);
      });
    } else {
      // 如果$q不可用，直接删除
      if (confirm('确定要删除这个发送实例吗？')) {
        void sendFrameInstancesStore.deleteInstance(frame.id);
      }
    }
  } catch (error) {
    console.error('删除实例失败:', error);
  }
}

// 格式化实例数据用于表格显示
interface TableRow extends SendFrameInstance {
  index: number;
  timestamp: string;
}

const tableData = computed<TableRow[]>(() => {
  return instances.value.map((instance, index) => ({
    ...instance,
    index: index + 1,
    timestamp: new Date(instance.updatedAt).toLocaleString(), // 格式化时间戳
  }));
});

// 行样式
function rowClass(row: SendFrameInstance) {
  return row.id === selectedInstanceId.value
    ? 'cursor-pointer border-b border-[#2A2F45] bg-blue-800/30 border-l-4 border-l-blue-500'
    : 'cursor-pointer border-b border-[#2A2F45]';
}

// 声明window.$q类型，以便TypeScript识别
declare global {
  interface Window {
    $q?: {
      dialog: (options: {
        title: string;
        message: string;
        cancel?: boolean;
        persistent?: boolean;
      }) => { onOk: (callback: () => void) => void };
    };
  }
}
</script>

<template>
  <div class="h-full w-full">
    <q-table
      ref="tableRef"
      class="frame-instance-table h-full min-w-[800px] w-full transition-[width] duration-200 box-border"
      :rows="tableData"
      :columns="columns"
      row-key="id"
      :pagination="pagination"
      :loading="sendFrameInstancesStore.isLoading || !tableReady"
      :row-class="rowClass"
      dark
      dense
      flat
      :selected-rows-label="() => ''"
      :rows-per-page-options="[0]"
      @row-click="onRowClick"
      @row-dblclick="onRowDblClick"
      virtual-scroll
      :virtual-scroll-slice-size="10"
      binary-state-sort
    >
      <!-- 名称列 -->
      <template v-slot:body-cell-label="props">
        <q-td :props="props">
          <div class="truncate max-w-full" :title="props.value">{{ props.value }}</div>
        </q-td>
      </template>

      <!-- 备注列 -->
      <template v-slot:body-cell-description="props">
        <q-td :props="props" class="text-[#A9B1D6]">
          <div class="truncate max-w-full" :title="props.value || '-'">
            {{ props.value || '-' }}
          </div>
        </q-td>
      </template>

      <!-- 只保留操作列的自定义模板 -->
      <template v-slot:body-cell-operations="props">
        <q-td :props="props">
          <div class="flex justify-center gap-2">
            <q-btn
              flat
              round
              dense
              size="xs"
              icon="content_copy"
              color="green-5"
              class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors"
              @click.stop="copyFrame(props.row)"
            >
              <q-tooltip>复制实例</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              size="xs"
              icon="delete"
              color="red-5"
              class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors"
              @click.stop="deleteFrame(props.row)"
            >
              <q-tooltip>删除实例</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>

      <!-- 自定义行样式 -->
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

      <!-- 空状态显示 -->
      <template v-slot:no-data>
        <div class="flex flex-col items-center justify-center p-10 text-[#A9B1D6]">
          <q-icon name="assignment" size="48px" color="blue-grey-7" class="opacity-70" />
          <div class="mt-4">暂无帧实例</div>
          <div class="text-xs mt-2 text-[#8294c4] max-w-xs text-center">
            选择左侧帧格式后，点击上方"+"按钮创建新的实例
          </div>
        </div>
      </template>

      <!-- 加载状态 -->
      <template v-slot:loading>
        <div class="flex flex-col items-center justify-center h-full p-10 text-[#A9B1D6]">
          <q-spinner-gears color="blue-5" size="40px" />
          <div class="mt-4">加载中...</div>
        </div>
      </template>
    </q-table>
  </div>
</template>

<style>
.frame-instance-table {
  /* 使用表格固定布局，确保列宽稳定 */
  table-layout: fixed;
  /* 强制渲染层 */
  transform: translateZ(0);
  will-change: width;
}

.frame-instance-table thead tr th {
  /* 粘性表头 */
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #111827 !important;
  color: #a9b1d6;
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
  font-weight: 500;
  border-bottom: 1px solid #2a2f45;
}

/* 隐藏表格默认的顶部和底部 */
.frame-instance-table .q-table__top,
.frame-instance-table .q-table__bottom {
  display: none;
}

/* 表格行样式 */
.frame-instance-table .q-tr {
  height: 40px;
  width: 100%;
}

/* 交替行颜色 */
.frame-instance-table tbody tr:nth-child(odd) {
  background-color: #131725;
}

.frame-instance-table tbody tr:nth-child(even) {
  background-color: #1a1e2e;
}

.frame-instance-table tbody tr:hover {
  background-color: #232b3f;
}

/* 表格单元格样式 */
.frame-instance-table .q-td {
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
}

/* 自定义滚动条样式 */
.frame-instance-table .q-virtual-scroll__content::-webkit-scrollbar,
.frame-instance-table .q-table__middle::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.frame-instance-table .q-virtual-scroll__content::-webkit-scrollbar-track,
.frame-instance-table .q-table__middle::-webkit-scrollbar-track {
  background: #1a1e2e;
  border-radius: 4px;
}

.frame-instance-table .q-virtual-scroll__content::-webkit-scrollbar-thumb,
.frame-instance-table .q-table__middle::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
}

.frame-instance-table .q-virtual-scroll__content::-webkit-scrollbar-thumb:hover,
.frame-instance-table .q-table__middle::-webkit-scrollbar-thumb:hover {
  background: #3b82f6;
}
</style>
