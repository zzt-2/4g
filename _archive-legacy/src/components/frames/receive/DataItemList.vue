<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import type { DataItem, FrameFieldMapping } from '../../../types/frames/receive';
import type { Frame } from '../../../types/frames/frames';
import { generateLabelOptionsFromField } from '../../../utils/receive';
import ImportExportActions from '../../common/ImportExportActions.vue';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const editingItem = ref<DataItem | null>(null);
const showEditDialog = ref<boolean>(false);
const showMappingDialog = ref<boolean>(false);
const selectedFieldId = ref<string>('');
const selectedGroupId = ref<number>(0);
const newDataItemLabel = ref<string>('');

// 表格控制相关
const tableReady = ref(false);
const tableRef = ref<{ $el?: HTMLElement } | null>(null);

// 计算属性：选中帧信息
const selectedFrame = computed((): Frame | undefined => {
  if (!receiveFramesStore.selectedFrameId) return undefined;
  return receiveFramesStore.receiveFrames.find(
    (frame: Frame) => frame.id === receiveFramesStore.selectedFrameId,
  );
});

// 计算属性：选中帧的数据项
const frameDataItems = computed(() => {
  return receiveFramesStore.selectedFrameDataItems;
});

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
    name: 'label',
    label: '数据项名称',
    field: 'label',
    align: 'left' as const,
    sortable: true,
    style: 'width: 100%; min-width: 100%',
  },
  {
    name: 'dataType',
    label: '数据类型',
    field: 'dataType',
    align: 'center' as const,
    sortable: false,
    style: 'width: 100px; min-width: 100px',
    classes: 'text-blue-300',
  },
  {
    name: 'fieldName',
    label: '映射字段',
    field: 'fieldName',
    align: 'center' as const,
    sortable: false,
    style: 'width: 140px; min-width: 140px',
  },
  {
    name: 'groupName',
    label: '所属分组',
    field: 'groupName',
    align: 'center' as const,
    sortable: true,
    style: 'width: 120px; min-width: 120px',
  },
  {
    name: 'currentValue',
    label: '当前值',
    field: 'currentValue',
    align: 'center' as const,
    sortable: false,
    style: 'width: 200px; max-width: 200px',
    classes: 'text-blue-grey-5',
  },
  {
    name: 'operations',
    label: '操作',
    field: 'operations',
    align: 'center' as const,
    sortable: false,
    style: 'width: 140px; min-width: 140px',
  },
];

// 表格分页设置
const pagination = ref({
  rowsPerPage: 0, // 0表示不分页，显示所有数据
});

// 格式化数据项数据用于表格显示
interface TableRow {
  index: number;
  id: string | number;
  label: string;
  dataType: string;
  fieldName: string;
  groupName: string;
  currentValue: string;
  isVisible: boolean;
  dataItem: DataItem;
  mapping: FrameFieldMapping;
  group: unknown;
}

const tableData = computed<TableRow[]>(() => {
  return frameDataItems.value.map((item, index) => ({
    index: index + 1,
    id: item.dataItem?.id || '',
    label: item.dataItem?.label || '未命名数据项',
    dataType: item.dataItem?.dataType || 'unknown',
    fieldName: getFieldInfo(item.mapping)?.name || item.mapping.fieldName,
    groupName: item.group?.label || '未知分组',
    currentValue: item.dataItem?.displayValue || '-',
    isVisible: item.dataItem?.isVisible || false,
    dataItem: item.dataItem!,
    mapping: item.mapping,
    group: item.group,
  }));
});

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

// 方法：编辑数据项
const editDataItem = (item: DataItem): void => {
  editingItem.value = { ...item };
  showEditDialog.value = true;
};

// 方法：删除数据项映射
const removeDataItemMapping = (mapping: FrameFieldMapping): void => {
  if (!confirm('确定要删除这个数据项映射吗？这将同时删除映射关系和对应的数据项。')) return;

  // 先删除映射关系
  receiveFramesStore.removeMapping(
    mapping.frameId,
    mapping.fieldId,
    mapping.groupId,
    mapping.dataItemId,
  );

  // 然后删除对应的数据项
  receiveFramesStore.removeDataItem(mapping.groupId, mapping.dataItemId);
};

// 方法：保存编辑
const saveEdit = (): void => {
  if (!editingItem.value) return;

  // 找到对应的映射关系来获取分组ID
  const mapping = frameDataItems.value.find(
    (item) => item.dataItem?.id === editingItem.value?.id,
  )?.mapping;

  if (!mapping) return;

  receiveFramesStore.updateDataItem(mapping.groupId, editingItem.value.id, editingItem.value);

  showEditDialog.value = false;
  editingItem.value = null;
};

// 方法：取消编辑
const cancelEdit = (): void => {
  showEditDialog.value = false;
  editingItem.value = null;
};

// 方法：获取字段信息
const getFieldInfo = (mapping: FrameFieldMapping) => {
  if (!selectedFrame.value) return null;
  return selectedFrame.value.fields.find((f) => f.id === mapping.fieldId);
};

// 方法：检查数据项是否有验证错误
const hasValidationError = (row: TableRow): boolean => {
  // 检查映射关系是否有效
  const mapping = row.mapping;
  const dataItem = row.dataItem;
  const group = row.group;

  // 检查分组是否存在
  if (!group) return true;

  // 检查数据项是否存在
  if (!dataItem) return true;

  // 检查字段是否存在
  const field = getFieldInfo(mapping);
  if (!field) return true;

  // 检查数据类型是否匹配
  if (dataItem.dataType !== field.dataType) return true;

  return false;
};

// 行样式
function rowClass(row: TableRow) {
  if (hasValidationError(row)) {
    return 'cursor-pointer border-b border-industrial bg-red-500/10 border-l-4 border-l-red-500';
  }
  return 'cursor-pointer border-b border-industrial hover:bg-industrial-highlight';
}

// 映射关系相关方法
const availableFields = computed(() => {
  if (!selectedFrame.value) return [];
  return selectedFrame.value.fields;
});

const selectedField = computed(() => {
  if (!selectedFrame.value || !selectedFieldId.value) return null;
  return selectedFrame.value.fields.find((f) => f.id === selectedFieldId.value);
});

// 开始创建映射
const startCreateMapping = (): void => {
  if (
    !selectedFrame.value ||
    !selectedFrame.value.fields ||
    selectedFrame.value.fields.length === 0
  )
    return;

  // 重置状态
  selectedFieldId.value = '';
  newDataItemLabel.value = '';

  showMappingDialog.value = true;
};

// 创建映射
const createMapping = (): void => {
  if (
    !selectedFrame.value ||
    !selectedFieldId.value ||
    !selectedGroupId.value ||
    !newDataItemLabel.value.trim()
  )
    return;

  const field = selectedField.value;
  if (!field) return;

  // 生成标签选项
  const labelOptions = generateLabelOptionsFromField(field);

  // 创建新数据项
  const newDataItem = receiveFramesStore.addDataItemToGroup(selectedGroupId.value, {
    label: newDataItemLabel.value.trim(),
    isVisible: true,
    isFavorite: false,
    dataType: field.dataType,
    value: null,
    displayValue: '-',
    useLabel: labelOptions.length > 0,
    labelOptions: labelOptions.length > 0 ? labelOptions : [],
  });

  // 创建映射关系
  const mapping: FrameFieldMapping = {
    frameId: selectedFrame.value.id,
    fieldId: selectedFieldId.value,
    fieldName: selectedField.value?.name || '',
    groupId: selectedGroupId.value,
    dataItemId: newDataItem.id,
  };

  receiveFramesStore.addMapping(mapping);

  // 关闭对话框
  showMappingDialog.value = false;
};

// 取消创建映射
const cancelCreateMapping = (): void => {
  showMappingDialog.value = false;
};

// 监听字段选择变化，自动生成数据项标签
import { watch } from 'vue';
watch(selectedFieldId, (newFieldId) => {
  if (newFieldId && selectedField.value) {
    newDataItemLabel.value = selectedField.value.name;
  }
});

// 数据处理函数：用于导入导出
const handleGetReceiveData = () => {
  return receiveFramesStore.exportConfig();
};

const handleSetReceiveData = async (data: unknown) => {
  await receiveFramesStore.importConfig(
    data as import('../../../types/frames/receive').ReceiveConfig,
  );
};
</script>

<template>
  <div class="h-full w-full">
    <!-- 标题栏 -->
    <div class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-table-header">
      <div class="flex items-center gap-2">
        <h6 class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center">
          <q-icon name="list_alt" size="xs" class="mr-1 text-blue-5" />
          数据项列表
        </h6>

        <!-- 导入导出按钮 -->
        <ImportExportActions :getData="handleGetReceiveData" :setData="handleSetReceiveData"
          storageDir="data/frames/receiveConfig" exportTitle="导出接收配置" importTitle="导入接收配置" />
      </div>

      <div class="flex items-center gap-2">
        <!-- 状态信息 -->
        <div class="text-xs text-industrial-secondary">
          <span v-if="selectedFrame">{{ selectedFrame.name }}</span>
          <span v-else>未选择帧</span>
        </div>

        <!-- 添加映射关系按钮 -->
        <q-btn flat dense round color="blue-grey-6" icon="add"
          :disable="!selectedFrame || !selectedFrame.fields || selectedFrame.fields.length === 0"
          @click="startCreateMapping">
          <q-tooltip>添加映射关系</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- 表格 -->
    <q-table ref="tableRef"
      class="data-item-table h-full min-w-[800px] w-full transition-[width] duration-200 box-border" :rows="tableData"
      :columns="columns" row-key="id" :pagination="pagination" :loading="!tableReady" :row-class="rowClass" dark dense
      flat :selected-rows-label="() => ''" :rows-per-page-options="[0]" virtual-scroll :virtual-scroll-slice-size="10"
      binary-state-sort>
      <!-- 名称列 -->
      <template v-slot:body-cell-label="props">
        <q-td :props="props">
          <div class="flex items-center space-x-2">
            <div class="truncate max-w-full" :title="props.value">{{ props.value }}</div>
            <!-- 验证错误指示器 -->
            <q-icon v-if="hasValidationError(props.row)" name="error" color="red" size="14px" />
          </div>
        </q-td>
      </template>

      <!-- 当前值列 -->
      <template v-slot:body-cell-currentValue="props">
        <q-td :props="props" class="text-blue-grey-5">
          <div class="truncate" :title="props.value || '-'">
            {{ props.value.length > 10 ? props.value.slice(0, 10) + '...' : props.value || '-' }}
          </div>
        </q-td>
      </template>

      <!-- 操作列 -->
      <template v-slot:body-cell-operations="props">
        <q-td :props="props">
          <div class="flex justify-center gap-1">
            <!-- 可见性按钮 -->
            <q-btn flat round dense size="xs" :icon="props.row.isVisible ? 'visibility' : 'visibility_off'"
              :color="props.row.isVisible ? 'blue' : 'grey'"
              class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors" @click.stop="
                receiveFramesStore.toggleDataItemVisibility(
                  props.row.group.id,
                  props.row.dataItem.id,
                )
                ">
              <q-tooltip>{{ props.row.isVisible ? '隐藏' : '显示' }}</q-tooltip>
            </q-btn>
            <!-- 收藏按钮 -->
            <q-btn flat round dense size="xs" :icon="props.row.dataItem.isFavorite ? 'star' : 'star_border'"
              :color="props.row.dataItem.isFavorite ? 'orange' : 'grey'"
              class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors" @click.stop="
                receiveFramesStore.toggleDataItemFavorite(props.row.group.id, props.row.dataItem.id)
                ">
              <q-tooltip>{{ props.row.dataItem.isFavorite ? '取消收藏' : '收藏' }}</q-tooltip>
            </q-btn>
            <!-- 编辑按钮 -->
            <q-btn flat round dense size="xs" icon="edit" color="blue-5"
              class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors"
              @click.stop="editDataItem(props.row.dataItem)">
              <q-tooltip>编辑数据项</q-tooltip>
            </q-btn>
            <!-- 删除按钮 -->
            <q-btn flat round dense size="xs" icon="delete" color="red-5"
              class="bg-industrial-secondary hover:bg-industrial-highlight transition-colors"
              @click.stop="removeDataItemMapping(props.row.mapping)">
              <q-tooltip>删除映射</q-tooltip>
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
            {{ col.label }}
          </q-th>
        </q-tr>
      </template>

      <!-- 空状态显示 -->
      <template v-slot:no-data>
        <div class="flex flex-col items-center justify-center p-10 text-blue-grey-4">
          <q-icon name="inbox" size="48px" color="blue-grey-7" class="opacity-70" />
          <div class="mt-4">暂无数据项</div>
          <div class="text-xs mt-2 text-blue-grey-5 max-w-xs text-center">
            选择左侧接收帧后，点击上方"+"按钮添加映射关系
          </div>
        </div>
      </template>

      <!-- 加载状态 -->
      <template v-slot:loading>
        <div class="flex flex-col items-center justify-center h-full p-10 text-blue-grey-4">
          <q-spinner-gears color="blue-5" size="40px" />
          <div class="mt-4">加载中...</div>
        </div>
      </template>
    </q-table>
  </div>

  <!-- 编辑对话框 -->
  <q-dialog v-model="showEditDialog" persistent>
    <q-card class="bg-industrial-panel" style="min-width: 400px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">编辑数据项</div>
      </q-card-section>

      <q-card-section v-if="editingItem" class="space-y-4">
        <!-- 标签 -->
        <q-input v-model="editingItem.label" label="数据项标签" outlined dense bg-color="industrial-secondary" color="blue"
          class="text-industrial-primary" />

        <!-- 数据类型 -->
        <q-select v-model="editingItem.dataType" :options="[
          { label: '8位无符号整数', value: 'uint8' },
          { label: '16位无符号整数', value: 'uint16' },
          { label: '32位无符号整数', value: 'uint32' },
          { label: '32位浮点数', value: 'float' },
          { label: '字节数组', value: 'bytes' },
        ]" label="数据类型" outlined dense emit-value map-options bg-color="industrial-secondary" color="blue" />

        <!-- 可见性 -->
        <q-checkbox v-model="editingItem.isVisible" label="在显示页面中可见" color="blue" class="text-industrial-primary" />

        <!-- 使用标签 -->
        <q-checkbox v-model="editingItem.useLabel" label="使用标签显示" color="blue" class="text-industrial-primary" />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="cancelEdit" />
        <q-btn flat label="保存" color="blue" @click="saveEdit" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- 添加映射关系对话框 -->
  <q-dialog v-model="showMappingDialog" persistent>
    <q-card class="bg-industrial-panel" style="min-width: 500px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">添加映射关系</div>
      </q-card-section>

      <q-card-section class="space-y-4">
        <!-- 字段选择 -->
        <q-select v-model="selectedFieldId" :options="availableFields.map((f) => ({ label: `${f.name} (${f.dataType})`, value: f.id }))
          " label="选择字段" outlined dense emit-value map-options bg-color="industrial-secondary" color="blue" />

        <!-- 分组选择 -->
        <q-select v-model="selectedGroupId"
          :options="receiveFramesStore.groups.map((g) => ({ label: g.label, value: g.id }))" label="选择分组" outlined dense
          emit-value map-options bg-color="industrial-secondary" color="blue" />

        <!-- 数据项标签 -->
        <q-input v-model="newDataItemLabel" label="数据项标签" outlined dense bg-color="industrial-secondary" color="blue"
          class="text-industrial-primary" />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="cancelCreateMapping" />
        <q-btn flat label="创建" color="blue" :disable="!selectedFieldId || !selectedGroupId || !newDataItemLabel.trim()"
          @click="createMapping" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style>
.data-item-table {
  /* 使用表格固定布局，确保列宽稳定 */
  table-layout: fixed;
  /* 强制渲染层 */
  transform: translateZ(0);
  will-change: width;
}

.data-item-table thead tr th {
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
.data-item-table .q-table__top,
.data-item-table .q-table__bottom {
  display: none;
}

/* 表格行样式 */
.data-item-table .q-tr {
  height: 40px;
  width: 100%;
}

/* 交替行颜色 */
.data-item-table tbody tr:nth-child(odd) {
  background-color: #131725;
}

.data-item-table tbody tr:nth-child(even) {
  background-color: #1a1e2e;
}

.data-item-table tbody tr:hover {
  background-color: #232b3f;
}

/* 表格单元格样式 */
.data-item-table .q-td {
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
}

/* 自定义滚动条样式 */
.data-item-table .q-virtual-scroll__content::-webkit-scrollbar,
.data-item-table .q-table__middle::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.data-item-table .q-virtual-scroll__content::-webkit-scrollbar-track,
.data-item-table .q-table__middle::-webkit-scrollbar-track {
  background: #1a1e2e;
  border-radius: 4px;
}

.data-item-table .q-virtual-scroll__content::-webkit-scrollbar-thumb,
.data-item-table .q-table__middle::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
}

.data-item-table .q-virtual-scroll__content::-webkit-scrollbar-thumb:hover,
.data-item-table .q-table__middle::-webkit-scrollbar-thumb:hover {
  background: #3b82f6;
}
</style>
