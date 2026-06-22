<script setup lang="ts">
import { ref, computed, nextTick, onMounted, shallowRef } from 'vue';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useDragSort } from '../../../composables/common/useDragSort';
import { formatTimeOnly } from '../../../utils/common/dateUtils';
import { watchEffect } from 'vue';
import { useDebounceFn } from '@vueuse/core';

// 定义Props
const props = defineProps<{
  sortEnabled?: boolean;
  isBatchEdit?: boolean;
}>();

// 不需要emit，排序状态由父组件管理

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 从store直接获取实例数据
const selectedInstanceId = computed(() => sendFrameInstancesStore.currentInstanceId);

// 批量选择状态
const selectedInstanceIds = ref<Set<string>>(new Set());
const isAllSelected = computed(() => {
  return tableData.value.length > 0 && selectedInstanceIds.value.size === tableData.value.length;
});
const isSomeSelected = computed(() => {
  return selectedInstanceIds.value.size > 0 && selectedInstanceIds.value.size < tableData.value.length;
});

// 拖拽排序配置 - 修复响应式问题
const dragSortOptions = computed(() => ({
  enabled: props.sortEnabled ?? false,
  showPreview: true,
  previewClass: 'drag-preview',
  dropIndicatorClass: 'drop-indicator',
}));

// 使用拖拽排序 composable - 修复数据源和异步处理
const dragSort = useDragSort(
  computed(() => sendFrameInstancesStore.instances),
  (fromIndex: number, toIndex: number) => {
    // 使用同步方式处理，避免异步回调类型错误
    sendFrameInstancesStore.moveInstance(fromIndex, toIndex).then((result) => {
      if (result) {
        // 立即更新本地表格数据以确保UI实时响应
        forceRefreshTableData();
      }
    }).catch((error) => {
      console.error('移动实例失败:', error);
    });
    return true; // 立即返回true，让UI先响应
  },
  dragSortOptions,
);

// 表格列定义
const columns = computed(() => {
  const baseColumns = [
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
      sortable: false,
      style: 'width: 50px; min-width: 50px',
      classes: 'font-mono text-blue-300',
    },
    {
      name: 'label',
      label: '名称',
      field: 'label',
      align: 'left' as const,
      sortable: false,
      style: 'width: 240px; min-width: 240px',
    },
    {
      name: 'paramCount',
      label: '参数数',
      field: 'paramCount',
      align: 'center' as const,
      sortable: false,
      style: 'width: 60px; min-width: 60px',
      classes: 'text-blue-300',
    },
    {
      name: 'sendCount',
      label: '次数',
      field: 'sendCount',
      align: 'center' as const,
      sortable: false,
      style: 'width: 60px; min-width: 60px',
      classes: 'text-green-400',
    },
    {
      name: 'lastSentAt',
      label: '上次发送',
      field: 'lastSentAt',
      align: 'center' as const,
      sortable: false,
      style: 'width: 80px; min-width: 80px',
      classes: 'text-blue-grey-5',
    },
    {
      name: 'description',
      label: '备注',
      field: 'description',
      align: 'left' as const,
      sortable: false,
      style: 'width: 100%; min-width: 100%',
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

  // 如果是批量编辑模式，在开头添加复选框列
  if (props.isBatchEdit) {
    baseColumns.unshift({
      name: 'checkbox',
      label: '',
      field: 'checkbox',
      align: 'center' as const,
      sortable: false,
      style: 'width: 48px; min-width: 48px',
      classes: '',
    });
  }

  return baseColumns;
});

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

// 当选择行时触发select-instance事件 - 优化点击处理
function onRowClick(evt: Event, row: { id: string }) {
  // 在拖拽模式下，如果不是拖拽手柄区域的点击，仍然允许选择
  if (dragSort.options.value.enabled) {
    const target = evt.target as HTMLElement;
    // 如果点击的是拖拽手柄或其子元素，不处理选择
    if (target.closest('.cursor-grab, .cursor-grabbing')) {
      return;
    }
  }
  sendFrameInstancesStore.setCurrentInstance(row.id);
}

// 处理双击实例的方法 - 直接在组件中实现
function onRowDblClick(evt: Event, row: { id: string }) {
  if (dragSort.options.value.enabled) return; // 排序模式下不允许编辑

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
    sendFrameInstancesStore.isDeletingInstance = true;
    void sendFrameInstancesStore.deleteInstance(frame.id);
  } catch (error) {
    console.error('删除实例失败:', error);
  } finally {
    forceRefreshTableData();
  }
}

// 格式化实例数据用于表格显示
interface TableRow {
  id: string;
  label: string;
  frameId: string;
  description: string;
  paramCount: number;
  isFavorite: boolean;
  index: number;
  sendCount: number;
  lastSentAt: string;
}

// 使用 shallowRef 存储表格数据，以便手动控制更新时机
const tableData = shallowRef<TableRow[]>([]);

// 优化的表格数据生成函数，减少对象展开和函数调用
const generateTableData = (instancesArray: SendFrameInstance[]): TableRow[] => {
  const result: TableRow[] = [];
  for (let i = 0; i < instancesArray.length; i++) {
    const instance = instancesArray[i];
    if (instance) {
      result.push({
        id: instance.id,
        label: instance.label,
        frameId: instance.frameId,
        description: instance.description,
        paramCount: instance.paramCount,
        isFavorite: instance.isFavorite,
        index: i + 1,
        sendCount: instance.sendCount || 0,
        lastSentAt: formatTimeOnly(instance.lastSentAt),
      });
    }
  }
  return result;
};

// 优化的跟踪键创建，只关注必要字段
const createTrackingKey = (instancesArray: SendFrameInstance[]): string => {
  // 使用更高效的字符串拼接方式
  const keys: string[] = [];
  for (let i = 0; i < instancesArray.length; i++) {
    const instance = instancesArray[i];
    if (instance) {
      keys.push(
        `${instance.id}-${instance.sendCount || 0}-${instance.lastSentAt ? instance.lastSentAt : 0}`
      );
    }
  }
  return keys.join('|');
};

// 缓存上一次的表格数据，避免不必要的重新生成
let lastTrackingKey = '';
let lastInstancesLength = 0;

// 创建防抖函数用于更新表格数据 - 在排序模式下禁用防抖确保实时性
const debouncedUpdateTableData = useDebounceFn((currentInstances: SendFrameInstance[], currentLength: number) => {
  // 快速检查：如果长度变化，直接更新
  if (currentLength !== lastInstancesLength) {
    tableData.value = generateTableData(currentInstances);
    lastTrackingKey = createTrackingKey(currentInstances);
    lastInstancesLength = currentLength;
    return;
  }

  // 长度相同时，使用跟踪键检查内容变化
  const currentTrackingKey = createTrackingKey(currentInstances);
  if (currentTrackingKey !== lastTrackingKey) {
    tableData.value = generateTableData(currentInstances);
    lastTrackingKey = currentTrackingKey;
  }
}, computed(() => dragSortOptions.value.enabled ? 0 : 100)); // 排序模式下实时更新

// 使用 watchEffect 来监听特定变化并更新表格数据
watchEffect(() => {
  const currentInstances = sendFrameInstancesStore.instances;
  const currentLength = currentInstances.length;

  // 在排序模式下立即更新，否则使用防抖
  if (dragSortOptions.value.enabled) {
    // 排序模式下立即更新表格数据
    if (currentLength !== lastInstancesLength) {
      tableData.value = generateTableData(currentInstances);
      lastTrackingKey = createTrackingKey(currentInstances);
      lastInstancesLength = currentLength;
    } else {
      const currentTrackingKey = createTrackingKey(currentInstances);
      if (currentTrackingKey !== lastTrackingKey) {
        tableData.value = generateTableData(currentInstances);
        lastTrackingKey = currentTrackingKey;
      }
    }
  } else {
    // 普通模式下使用防抖
    debouncedUpdateTableData(currentInstances, currentLength);
  }
});

// 选中的行数据 - 用于 q-table 的 selected 属性
const selectedRows = computed(() => {
  const currentId = selectedInstanceId.value;
  if (!currentId) return [];
  const selectedRow = tableData.value.find(row => row.id === currentId);
  return selectedRow ? [selectedRow] : [];
});

// 行样式 - 基础样式
const rowClass = (() => {
  return 'cursor-pointer border-b border-industrial hover:bg-industrial-highlight transition-all duration-150';
});

// 拖拽模式下的行样式 - 增强选中效果
function getRowClass(row: { id: string }, index: number): string {
  const baseClass = 'drag-table-row transition-all duration-200 cursor-pointer';
  const selectedClass =
    row.id === selectedInstanceId.value
      ? 'bg-industrial-highlight border-l-4 border-l-blue-500 shadow-md'
      : index % 2 === 0
        ? 'bg-industrial-primary hover:bg-industrial-highlight'
        : 'bg-industrial-secondary hover:bg-industrial-highlight';

  const dragClass = dragSort.getItemClass(index);

  return `${baseClass} ${selectedClass} ${dragClass}`;
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

// 强制刷新表格数据的方法 - 优化同步性
function forceRefreshTableData() {
  const currentInstances = sendFrameInstancesStore.instances;
  // 重置缓存状态，强制重新生成
  lastTrackingKey = '';
  lastInstancesLength = -1;
  // 立即更新表格数据，确保拖拽排序的实时性
  tableData.value = generateTableData(currentInstances);
  lastTrackingKey = createTrackingKey(currentInstances);
  lastInstancesLength = currentInstances.length;
}

// 批量选择相关方法
function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedInstanceIds.value.clear();
  } else {
    selectedInstanceIds.value = new Set(tableData.value.map(row => row.id));
  }
}

function toggleSelectInstance(id: string) {
  if (selectedInstanceIds.value.has(id)) {
    selectedInstanceIds.value.delete(id);
  } else {
    selectedInstanceIds.value.add(id);
  }
}

function isInstanceSelected(id: string) {
  return selectedInstanceIds.value.has(id);
}

// 批量删除帧实例
async function batchDeleteFrames() {
  if (selectedInstanceIds.value.size === 0) return;

  try {
    const $q = window.$q;
    const selectedCount = selectedInstanceIds.value.size;

    if ($q) {
      $q.dialog({
        title: '确认批量删除',
        message: `确定要删除选中的 ${selectedCount} 个发送实例吗？`,
        cancel: true,
        persistent: true,
      }).onOk(async () => {
        const idsArray = Array.from(selectedInstanceIds.value);
        await sendFrameInstancesStore.deleteInstances(idsArray);
        selectedInstanceIds.value.clear();
        forceRefreshTableData();
      });
    } else {
      if (confirm(`确定要删除选中的 ${selectedCount} 个发送实例吗？`)) {
        const idsArray = Array.from(selectedInstanceIds.value);
        await sendFrameInstancesStore.deleteInstances(idsArray);
        selectedInstanceIds.value.clear();
        forceRefreshTableData();
      }
    }
  } catch (error) {
    console.error('批量删除实例失败:', error);
  }
}

defineExpose({
  forceRefreshTableData,
  batchDeleteFrames,
});
</script>

<template>
  <div class="h-full w-full">
    <!-- 排序模式下显示自定义拖拽表格 -->
    <div v-if="dragSort.options.value.enabled" class="h-full w-full flex flex-col">
      <!-- 可拖拽表格容器 -->
      <div class="flex-1 overflow-auto bg-industrial-secondary min-h-0">
        <template v-if="tableData.length > 0">
          <!-- 表头 -->
          <div class="sticky top-0 z-10 bg-industrial-table-header border-b border-industrial">
            <div class="flex items-center h-7 min-w-[700px] px-2">
              <!-- 拖拽手柄列 -->
              <div class="w-8 flex-shrink-0"></div>

              <!-- 批量编辑模式下的复选框列 -->
              <div v-if="props.isBatchEdit" class="w-12 flex-shrink-0 flex items-center justify-center">
                <q-checkbox :model-value="isAllSelected" :indeterminate="isSomeSelected"
                  @update:model-value="toggleSelectAll" size="xs" color="blue" />
              </div>

              <!-- 序号列 -->
              <div class="w-10 flex-shrink-0 text-center">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">#</span>
              </div>

              <!-- ID列 -->
              <div class="w-15 flex-shrink-0 text-center">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">编号</span>
              </div>

              <!-- 名称列 -->
              <div class="w-45 flex-shrink-0 text-left">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">名称</span>
              </div>

              <!-- 参数数列 -->
              <div class="w-15 flex-shrink-0 text-center">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">参数数</span>
              </div>

              <!-- 次数列 -->
              <div class="w-12.5 flex-shrink-0 text-center">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">次数</span>
              </div>

              <!-- 上次发送列 -->
              <div class="w-20 flex-shrink-0 text-center">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">上次发送</span>
              </div>

              <!-- 备注列 -->
              <div class="flex-1 text-left min-w-0">
                <span class="text-xs font-medium text-[#a9b1d6] uppercase">备注</span>
              </div>
            </div>
          </div>

          <!-- 表格主体 -->
          <TransitionGroup name="table-row" tag="div">
            <template v-for="(row, index) in tableData" :key="row.id">
              <!-- 插入位置指示器 - 之前 -->
              <div v-if="dragSort.shouldShowDropIndicator('before', index)"
                class="h-0.5 bg-blue-400 mx-2 rounded transition-all duration-200"></div>

              <!-- 表格行 -->
              <div :class="getRowClass(row, index)" :style="dragSort.getItemStyle(index)"
                @mousedown="dragSort.startDrag(index, $event)" @click="onRowClick($event, row)">
                <div class="flex items-center h-7 min-w-[700px] px-2">
                  <!-- 拖拽手柄 -->
                  <div
                    class="w-8 flex-shrink-0 flex items-center justify-center text-[#8294c4] cursor-grab active:cursor-grabbing">
                    <q-icon name="drag_indicator" size="sm" />
                  </div>

                  <!-- 批量编辑模式下的复选框列 -->
                  <div v-if="props.isBatchEdit" class="w-12 flex-shrink-0 flex items-center justify-center">
                    <q-checkbox :model-value="isInstanceSelected(row.id)"
                      @update:model-value="toggleSelectInstance(row.id)" @click.stop size="xs" color="blue" />
                  </div>

                  <!-- 序号列 -->
                  <div class="w-10 flex-shrink-0 text-center">
                    <span class="text-[#8294c4] text-xs">{{ row.index }}</span>
                  </div>

                  <!-- ID列 -->
                  <div class="w-15 flex-shrink-0 text-center">
                    <span class="font-mono text-blue-300 text-xs">{{ row.id }}</span>
                  </div>

                  <!-- 名称列 -->
                  <div class="w-45 flex-shrink-0 text-left">
                    <div class="truncate max-w-full font-medium text-sm text-[#e2e8f0]" :title="row.label">
                      {{ row.label }}
                    </div>
                  </div>

                  <!-- 参数数列 -->
                  <div class="w-15 flex-shrink-0 text-center">
                    <span class="text-blue-300 text-xs">{{ row.paramCount }}</span>
                  </div>

                  <!-- 次数列 -->
                  <div class="w-16 flex-shrink-0 text-center">
                    <span class="text-green-400 text-xs">{{ row.sendCount }}</span>
                  </div>

                  <!-- 上次发送列 -->
                  <div class="w-20 flex-shrink-0 text-center">
                    <span class="text-[#8294c4] text-xs">{{ row.lastSentAt }}</span>
                  </div>

                  <!-- 备注列 -->
                  <div class="flex-1 text-left min-w-0">
                    <div class="truncate max-w-full text-[#A9B1D6] text-xs" :title="row.description || '-'">
                      {{ row.description || '-' }}
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 列表末尾的插入指示器 -->
            <div v-if="dragSort.shouldShowDropIndicator('after', tableData.length - 1)"
              class="h-0.5 bg-blue-400 mx-2 rounded transition-all duration-200"></div>
          </TransitionGroup>
        </template>

        <!-- 空状态显示 -->
        <div v-else class="flex flex-col items-center justify-center p-10 text-[#A9B1D6]">
          <q-icon name="assignment" size="48px" color="blue-grey-7" class="opacity-70" />
          <div class="mt-4">暂无帧实例</div>
          <div class="text-xs mt-2 text-[#8294c4] max-w-xs text-center">
            选择左侧帧格式后，点击上方"+"按钮创建新的实例
          </div>
        </div>
      </div>

      <!-- 拖拽预览 -->
      <div v-if="dragSort.dragState.value.isDragging && dragSort.options.value.showPreview"
        class="fixed pointer-events-none z-50 opacity-80 bg-industrial-highlight border border-blue-400 rounded-md min-w-[700px]"
        :style="dragSort.previewStyle.value">
        <div class="flex items-center h-7 px-2">
          <div class="w-8 flex-shrink-0 flex items-center justify-center text-[#8294c4]">
            <q-icon name="drag_indicator" size="sm" />
          </div>
          <div class="w-10 flex-shrink-0 text-center">
            <span class="text-[#8294c4] text-xs">{{
              (dragSort.dragState.value.draggedIndex ?? -1) + 1
            }}</span>
          </div>
          <div class="w-15 flex-shrink-0 text-center">
            <span class="font-mono text-blue-300 text-xs">{{
              dragSort.draggedItem.value?.id || '-'
            }}</span>
          </div>
          <div class="w-45 flex-shrink-0 text-left">
            <span class="text-sm text-[#e2e8f0] font-medium truncate">
              {{ dragSort.draggedItem.value?.label || '未命名实例' }}
            </span>
          </div>
          <div class="w-15 flex-shrink-0 text-center">
            <span class="text-blue-300 text-xs">{{
              dragSort.draggedItem.value?.paramCount || 0
            }}</span>
          </div>
          <div class="w-12.5 flex-shrink-0 text-center">
            <span class="text-green-400 text-xs">{{
              dragSort.draggedItem.value?.sendCount || 0
            }}</span>
          </div>
          <div class="w-20 flex-shrink-0 text-center">
            <span class="text-[#8294c4] text-xs">{{
              formatTimeOnly(dragSort.draggedItem.value?.lastSentAt)
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 正常模式显示q-table -->
    <q-table v-else ref="tableRef"
      class="frame-instance-table h-full min-w-[700px] w-full transition-[width] duration-200 box-border"
      :rows="tableData" :columns="columns" row-key="id" :pagination="pagination"
      :loading="sendFrameInstancesStore.isLoading || !tableReady" :row-class="rowClass" :selected="selectedRows" dark
      dense flat :selected-rows-label="() => ''" :rows-per-page-options="[0]" @row-click="onRowClick"
      @row-dblclick="onRowDblClick" virtual-scroll :virtual-scroll-slice-size="10" binary-state-sort>

      <!-- 复选框列 -->
      <template v-if="props.isBatchEdit" v-slot:body-cell-checkbox="props">
        <q-td :props="props" class="text-center">
          <div class="flex items-center justify-center h-full">
            <q-checkbox :model-value="isInstanceSelected(props.row.id)"
              @update:model-value="toggleSelectInstance(props.row.id)" @click.stop size="sm" h-1 color="blue" />
          </div>
        </q-td>
      </template>

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
            <q-btn flat round dense size="xs" icon="content_copy" color="green-5"
              class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors" @click.stop="copyFrame(props.row)">
              <q-tooltip>复制实例</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="xs" icon="delete" color="red-5"
              class="bg-[#1a1e2e] hover:bg-[#232b3f] transition-colors" @click.stop="deleteFrame(props.row)">
              <q-tooltip>删除实例</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>

      <!-- 自定义行样式 -->
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
            <!-- 复选框列显示复选框，其他列显示标签 -->
            <div v-if="col.name === 'checkbox'" class="flex items-center justify-center h-full">
              <q-checkbox :model-value="isAllSelected" :indeterminate="isSomeSelected"
                @update:model-value="toggleSelectAll" size="sm" h-1 color="blue" />
            </div>
            <template v-else>
              {{ col.label }}
            </template>
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
  height: 28px;
  width: 100%;
}

/* 拖拽表格行样式 */
.drag-table-row {
  height: 28px;
  border-bottom: 1px solid #2a2f45;
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

/* 拖拽排序相关样式 */
.table-row-move,
.table-row-enter-active,
.table-row-leave-active {
  transition: all 0.3s ease;
}

.table-row-enter-from,
.table-row-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.table-row-leave-active {
  position: absolute;
  right: 0;
  left: 0;
}

.checkbox-compact .q-checkbox__inner {
  width: 8px !important;
  height: 8px !important;
}

.checkbox-compact .q-checkbox__bg {
  width: 8px !important;
  height: 8px !important;
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
