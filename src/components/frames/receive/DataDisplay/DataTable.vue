<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { TableRowData } from '../../../../types/frames/dataDisplay';
import OrderControls from './OrderControls.vue';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';

// Props - 只需要知道是哪个表格
const props = defineProps<{
  tableId: 'table1' | 'table2';
}>();

// Store
const dataDisplayStore = useDataDisplayStore();

// 本地状态
const tableReady = ref(false);
const tableRef = ref<{ $el?: HTMLElement } | null>(null);
// 本地数据状态 - 用于定时更新
const tableData = ref<TableRowData[]>([]);
// 更新定时器
let updateTimer: NodeJS.Timeout | null = null;

// 计算属性：当前表格配置
const currentConfig = computed(() => {
  return props.tableId === 'table1' ? dataDisplayStore.table1Config : dataDisplayStore.table2Config;
});

// 计算属性：当前分组ID
const groupId = computed(() => currentConfig.value.selectedGroupId);

// 表格列定义
const columns = [
  {
    name: 'index',
    label: '编号',
    field: 'index',
    align: 'center' as const,
    sortable: false,
    style: 'width: 40px; min-width: 40px',
    classes: 'text-blue-grey-4',
  },
  {
    name: 'label',
    label: '数据名称',
    field: 'label',
    align: 'left' as const,
    sortable: false,
    style: 'width: 140px; max-width: 140px',
  },
  {
    name: 'displayValue',
    label: '值',
    field: 'displayValue',
    align: 'center' as const,
    sortable: false,
    style: 'width: 140px; max-width: 140px',
    classes: 'text-blue-grey-5',
  },
  {
    name: 'hexValue',
    label: '十六进制',
    field: 'hexValue',
    align: 'center' as const,
    sortable: false,
    style: 'width: 110px; max-width: 110px',
    classes: 'text-blue-300',
  },
  {
    name: 'favorite',
    label: '收藏',
    field: 'favorite',
    align: 'center' as const,
    sortable: false,
    style: 'width: 40px; min-width: 40px',
  },
  {
    name: 'actions',
    label: '操作',
    field: 'actions',
    align: 'center' as const,
    sortable: false,
    style: 'width: 80px; min-width: 80px',
  },
];

// 表格分页设置
const pagination = ref({
  rowsPerPage: 0, // 0表示不分页，显示所有数据
});

// 更新表格数据的方法
const updateTableData = () => {
  if (!groupId.value) {
    tableData.value = [];
    return;
  }
  tableData.value = dataDisplayStore.getTableData(groupId.value);
};

// 启动定时更新
const startUpdateTimer = () => {
  if (updateTimer) return; // 避免重复启动

  // 立即更新一次
  updateTableData();

  // 启动定时器，每1秒更新一次
  updateTimer = setInterval(() => {
    updateTableData();
  }, 500);
};

// 停止定时更新
const stopUpdateTimer = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
};

// 确保表格布局稳定
const initializeTable = async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  tableReady.value = true;
  // 强制更新表格布局
  if (tableRef.value?.$el) {
    tableRef.value.$el.style.width = '100%';
    // 触发重排
    void tableRef.value.$el.offsetWidth;
  }
};

// 生命周期
onMounted(() => {
  initializeTable(); // 初始化表格
  startUpdateTimer(); // 启动定时更新
});

onUnmounted(() => {
  stopUpdateTimer(); // 清理定时器
});
</script>

<template>
  <div class="w-full" style="height: calc(100vh - 198px);">
    <!-- 表格 -->
    <q-table ref="tableRef"
      class="data-display-table h-full w-full overflow-y-auto transition-[width] duration-200 box-border"
      :rows="tableData" :columns="columns" row-key="dataItemId" :pagination="pagination" :loading="!tableReady" dark
      dense flat :selected-rows-label="() => ''" :rows-per-page-options="[0]" virtual-scroll
      :virtual-scroll-slice-size="10" binary-state-sort>
      <!-- 编号列 -->
      <template #body-cell-index="props">
        <q-td :props="props" class="text-center text-industrial-primary">
          <span class="font-mono text-sm">{{ props.row.index }}</span>
        </q-td>
      </template>

      <!-- 数据名称列 -->
      <template #body-cell-label="props">
        <q-td :props="props" class="text-left">
          <div class="truncate max-w-full" :title="props.row.label">
            <span class="text-sm text-industrial-primary">{{ props.row.label }}</span>
          </div>
        </q-td>
      </template>

      <!-- 值列 -->
      <template #body-cell-displayValue="props">
        <q-td :props="props" class="text-center">
          <div class="truncate max-w-full" :title="props.row.displayValue || '-'">
            <span class="font-mono text-sm px-2 py-1 rounded bg-industrial-secondary text-industrial-primary">
              {{ props.row.displayValue.length > 10 ? props.row.displayValue.slice(0, 10) + '...' :
                props.row.displayValue }}
            </span>
          </div>
        </q-td>
      </template>

      <!-- 十六进制值列 -->
      <template #body-cell-hexValue="props">
        <q-td :props="props" class="text-center">
          <div class="truncate max-w-full" :title="props.row.hexValue">
            <span class="font-mono text-sm px-2 py-1 rounded bg-industrial-highlight text-industrial-accent">
              {{ props.row.hexValue.length > 10 ? props.row.hexValue.slice(0, 10) + '...' : props.row.hexValue }}
            </span>
          </div>
        </q-td>
      </template>

      <!-- 收藏列 -->
      <template #body-cell-favorite="props">
        <q-td :props="props" class="text-center">
          <q-icon v-if="props.row.isFavorite" name="star" size="16px" color="orange" />
          <span v-else class="text-blue-grey-6">-</span>
        </q-td>
      </template>

      <!-- 操作列 -->
      <template #body-cell-actions="props">
        <q-td :props="props" class="text-center">
          <OrderControls :group-id="groupId" :data-item-id="props.row.dataItemId" />
        </q-td>
      </template>

      <!-- 自定义行样式 -->
      <template #header="props">
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

      <!-- 空状态显示 -->
      <template #no-data>
        <div class="flex flex-col items-center justify-center p-10 text-blue-grey-4">
          <q-icon name="table_view" size="48px" color="blue-grey-7" class="opacity-70" />
          <div class="mt-4">
            {{ groupId ? '当前分组暂无数据' : '请选择一个分组以显示数据' }}
          </div>
          <div class="text-xs mt-2 text-blue-grey-5 max-w-xs text-center">
            选择左侧数据分组后，数据将显示在此处
          </div>
        </div>
      </template>

      <!-- 加载状态 -->
      <template #loading>
        <div class="flex flex-col items-center justify-center h-full p-10 text-blue-grey-4">
          <q-spinner-gears color="blue-5" size="40px" />
          <div class="mt-4">加载中...</div>
        </div>
      </template>
    </q-table>
  </div>
</template>

<style>
.data-display-table {
  /* 使用表格固定布局，确保列宽稳定 */
  table-layout: fixed;
  /* 强制渲染层 */
  transform: translateZ(0);
  will-change: width;
}

.data-display-table thead tr th {
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
.data-display-table .q-table__top,
.data-display-table .q-table__bottom {
  display: none;
}

/* 表格行样式 */
.data-display-table .q-tr {
  height: 40px;
  width: 100%;
}

/* 交替行颜色 */
.data-display-table tbody tr:nth-child(odd) {
  background-color: #131725;
}

.data-display-table tbody tr:nth-child(even) {
  background-color: #1a1e2e;
}

.data-display-table tbody tr:hover {
  background-color: #232b3f;
}

/* 表格单元格样式 */
.data-display-table .q-td {
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
}

/* 自定义滚动条样式 */
.data-display-table .q-virtual-scroll__content::-webkit-scrollbar,
.data-display-table .q-table__middle::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.data-display-table .q-virtual-scroll__content::-webkit-scrollbar-track,
.data-display-table .q-table__middle::-webkit-scrollbar-track {
  background: #1a1e2e;
  border-radius: 4px;
}

.data-display-table .q-virtual-scroll__content::-webkit-scrollbar-thumb,
.data-display-table .q-table__middle::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
}

.data-display-table .q-virtual-scroll__content::-webkit-scrollbar-thumb:hover,
.data-display-table .q-table__middle::-webkit-scrollbar-thumb:hover {
  background: #3b82f6;
}
</style>
