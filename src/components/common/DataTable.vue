<template>
  <div
    class="w-full h-full bg-industrial-panel text-industrial-primary rounded overflow-hidden flex flex-col"
  >
    <!-- 表格头部 - 固定部分 -->
    <div
      class="flex bg-[#1a3663] border-b border-[#334155] font-bold h-10 whitespace-nowrap shrink-0"
    >
      <div
        v-for="(column, colIndex) in columns"
        :key="colIndex"
        :style="{
          width: column.width || 'auto',
          minWidth: column.minWidth || 'auto',
          maxWidth: column.maxWidth,
        }"
        class="flex items-center px-2 relative text-xs"
        :class="[
          column.align === 'center'
            ? 'justify-center'
            : column.align === 'right'
              ? 'justify-end'
              : 'justify-start',
        ]"
      >
        {{ column.title }}
      </div>
    </div>

    <!-- 数据加载中 -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center h-full p-10 text-industrial-secondary"
    >
      <q-spinner color="primary" size="40px" />
      <div class="mt-4">加载中...</div>
    </div>

    <!-- 无数据状态 -->
    <div
      v-else-if="!data || data.length === 0"
      class="flex flex-col items-center justify-center p-10 text-industrial-secondary"
    >
      <q-icon :name="emptyIcon" size="48px" color="grey-7" />
      <div class="mt-4">{{ emptyText }}</div>
    </div>

    <!-- 数据行 - 可滚动部分 -->
    <div v-else class="flex-1 overflow-y-auto">
      <div
        v-for="(row, rowIndex) in data"
        :key="rowIndex"
        class="flex border-b border-[#1a3663] whitespace-nowrap transition-colors duration-200 hover:bg-[#1e3a6a]"
        :class="[
          { 'bg-[#1d4ed8]': row.id === selectedId },
          alternateRows && rowIndex % 2 === 1 ? 'bg-[#0f2744]' : '',
        ]"
        :style="{ height: rowHeight }"
        @click="handleRowClick(row, rowIndex)"
      >
        <div
          v-for="(column, colIndex) in columns"
          :key="colIndex"
          :style="{
            width: column.width || 'auto',
            minWidth: column.minWidth || 'auto',
            maxWidth: column.maxWidth,
          }"
          class="flex items-center px-2 overflow-hidden text-ellipsis whitespace-nowrap text-xs"
          :class="[
            column.align === 'center'
              ? 'justify-center'
              : column.align === 'right'
                ? 'justify-end'
                : 'justify-start',
            column.field === 'id' ? 'font-mono text-[#ffcb6b]' : '',
            column.class || '',
          ]"
        >
          <slot :name="`cell-${column.field}`" :row="row" :column="column" :index="rowIndex">
            <template v-if="column.formatter">
              <span v-html="column.formatter(getCellValue(row, column.field), row, column)"></span>
            </template>
            <template v-else-if="column.field === 'actions'">
              <slot name="actions" :row="row" :index="rowIndex"></slot>
            </template>
            <template v-else>
              {{ getCellValue(row, column.field) }}
            </template>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface TableColumn {
  field: string; // 字段名
  title: string; // 列标题
  width?: string; // 列宽，例如：'120px', '20%'
  minWidth?: string; // 最小宽度
  maxWidth?: string; // 最大宽度
  align?: 'left' | 'center' | 'right'; // 对齐方式
  formatter?: (value: unknown, row: unknown, column: TableColumn) => string; // 单元格格式化函数
  class?: string; // 列自定义类名
}

interface Props {
  // 必需参数
  columns: TableColumn[]; // 列定义
  data: any[]; // 表格数据

  // 可选参数
  rowHeight?: string; // 行高，默认'40px'
  loading?: boolean; // 加载状态
  emptyText?: string; // 空数据文本
  emptyIcon?: string; // 空数据图标
  alternateRows?: boolean; // 是否使用交替行颜色
  selectedId?: string | number; // 选中行的ID
}

const props = withDefaults(defineProps<Props>(), {
  rowHeight: '40px',
  loading: false,
  emptyText: '没有找到数据',
  emptyIcon: 'inventory_2',
  alternateRows: true,
  selectedId: '',
});

const emit = defineEmits<{
  'row-click': [row: any, index: number];
}>();

// 处理行点击
function handleRowClick(row: any, index: number) {
  emit('row-click', row, index);
}

// 获取单元格值
function getCellValue(row: any, field: string): any {
  if (!field) return '';

  // 处理嵌套属性
  if (field.includes('.')) {
    return field.split('.').reduce((obj, key) => {
      return obj && obj[key] !== undefined ? obj[key] : '';
    }, row);
  }

  return row[field] !== undefined ? row[field] : '';
}
</script>
