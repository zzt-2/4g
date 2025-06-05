<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { TableRowData } from '../../../../types/frames/dataDisplay';
import OrderControls from './OrderControls.vue';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';
import { convertToHex } from '../../../../utils/frames/hexCovertUtils';

// Props
const props = defineProps<{
  groupId: number | null;
  tableId: string;
}>();

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const updateTimer = ref<NodeJS.Timeout | null>(null);
const tableReady = ref(false);
const tableRef = ref<{ $el?: HTMLElement } | null>(null);

// 动态值存储（以dataItemId为键）
const dynamicValues = ref<Map<number, { displayValue: string; hexValue: string }>>(new Map());

// 表格列定义 - 对标DataItemList.vue格式
const columns = [
  {
    name: 'index',
    label: '编号',
    field: 'index',
    align: 'center' as const,
    sortable: false,
    style: 'width: 60px; min-width: 60px',
    classes: 'text-blue-grey-4',
  },
  {
    name: 'label',
    label: '数据名称',
    field: 'label',
    align: 'left' as const,
    sortable: false,
    style: 'width: 100%; min-width: 100%',
  },
  {
    name: 'displayValue',
    label: '值',
    field: 'displayValue',
    align: 'center' as const,
    sortable: false,
    style: 'width: 140px; min-width: 140px',
    classes: 'text-blue-grey-5',
  },
  {
    name: 'hexValue',
    label: '十六进制',
    field: 'hexValue',
    align: 'center' as const,
    sortable: false,
    style: 'width: 110px; min-width: 110px',
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

// 计算属性：基础表格数据（静态属性）
const baseTableData = computed(() => {
  if (!props.groupId) return [];

  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  if (!group) return [];

  // 只返回可见的数据项，仅包含静态属性
  const visibleItems = group.dataItems.filter((item) => item.isVisible);

  return visibleItems.map((item, index) => ({
    index: index + 1, // 重新编号，从1开始
    label: item.label,
    dataItemId: item.id,
    isVisible: item.isVisible,
    isFavorite: item.isFavorite,
  }));
});

// 计算属性：完整表格数据（合并静态和动态数据）
const tableData = computed((): TableRowData[] => {
  return baseTableData.value.map((baseRow) => {
    const dynamicValue = dynamicValues.value.get(baseRow.dataItemId);
    return {
      ...baseRow,
      displayValue: dynamicValue?.displayValue || '-',
      hexValue: dynamicValue?.hexValue || '0x00',
    };
  });
});

// 方法：更新动态值
const updateDynamicValues = (): void => {
  if (!props.groupId) {
    dynamicValues.value.clear();
    return;
  }

  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  if (!group) {
    dynamicValues.value.clear();
    return;
  }

  // 只更新可见数据项的动态值
  const visibleItems = group.dataItems.filter((item) => item.isVisible);

  // 清理不再需要的动态值
  const currentDataItemIds = new Set(visibleItems.map((item) => item.id));
  for (const [dataItemId] of dynamicValues.value) {
    if (!currentDataItemIds.has(dataItemId)) {
      dynamicValues.value.delete(dataItemId);
    }
  }

  // 更新或添加动态值
  visibleItems.forEach((item) => {
    dynamicValues.value.set(item.id, {
      displayValue: item.displayValue || '-',
      hexValue: '0x' + convertToHex(String(item.value || '0'), item.dataType),
    });
  });
};

// 监听groupId变化，清理动态值
watch(
  () => props.groupId,
  () => {
    dynamicValues.value.clear();
    updateDynamicValues();
  },
);

// 确保表格布局稳定 - 对标DataItemList.vue
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
  updateDynamicValues(); // 初始更新动态值
  initializeTable(); // 初始化表格
  // 启动定时器，只更新动态值
  updateTimer.value = setInterval(() => {
    updateDynamicValues();
  }, 1000);
});

onUnmounted(() => {
  if (updateTimer.value) {
    clearInterval(updateTimer.value);
    updateTimer.value = null;
  }
});
</script>

<template>
  <div class="h-full w-full">
    <!-- 表格 -->
    <q-table
      ref="tableRef"
      class="data-display-table h-full w-full transition-[width] duration-200 box-border"
      :rows="tableData"
      :columns="columns"
      row-key="dataItemId"
      :pagination="pagination"
      :loading="!tableReady"
      dark
      dense
      flat
      :selected-rows-label="() => ''"
      :rows-per-page-options="[0]"
      virtual-scroll
      :virtual-scroll-slice-size="10"
      binary-state-sort
    >
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
            <span
              class="font-mono text-sm px-2 py-1 rounded bg-industrial-secondary text-industrial-primary"
            >
              {{ props.row.displayValue }}
            </span>
          </div>
        </q-td>
      </template>

      <!-- 十六进制值列 -->
      <template #body-cell-hexValue="props">
        <q-td :props="props" class="text-center">
          <div class="truncate max-w-full" :title="props.row.hexValue">
            <span
              class="font-mono text-sm px-2 py-1 rounded bg-industrial-highlight text-industrial-accent"
            >
              {{ props.row.hexValue }}
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
          <OrderControls
            :group-id="groupId"
            :data-item-id="props.row.dataItemId"
            :current-index="props.row.index - 1"
            :total-items="tableData.length"
          />
        </q-td>
      </template>

      <!-- 自定义行样式 -->
      <template #header="props">
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
