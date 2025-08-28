<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-industrial-panel text-industrial-primary rounded">
    <div class="flex justify-between items-center px-4 py-3 bg-industrial-table-header border-b border-industrial">
      <div class="flex items-center text-sm font-medium text-industrial-primary">
        <q-icon name="description" size="20px" class="mr-2" />
        帧详情 - {{ frame ? frame.id : '未选择' }}
      </div>
      <q-btn flat round dense icon="close" size="sm" @click="$emit('close')" v-if="closable" />
    </div>

    <template v-if="frame">
      <div class="p-4">
        <div class="flex mb-2">
          <div class="w-[70px] text-xs text-industrial-secondary">帧ID:</div>
          <div class="flex-1 text-industrial-id font-mono">{{ frame.id }}</div>
        </div>
        <div class="flex mb-2">
          <div class="w-[70px] text-xs text-industrial-secondary">名称:</div>
          <div class="flex-1 text-industrial-primary">{{ frame.name }}</div>
        </div>
        <div class="flex">
          <div class="w-[70px] text-xs text-industrial-secondary">时间戳:</div>
          <div class="flex-1 text-industrial-primary">{{ formatTime(frame.timestamp) }}</div>
        </div>
      </div>

      <q-separator color="grey-8" />

      <!-- 使用QTable组件显示参数列表 -->
      <div class="px-4 py-3 text-sm font-medium bg-industrial-table-header flex items-center">
        <q-icon name="tune" size="18px" class="mr-2" />
        参数列表
      </div>
      <q-separator color="grey-8" />

      <div class="flex-1 h-full overflow-y-auto">
        <q-table v-if="formattedParams.length > 0" :rows="formattedParams" :columns="qColumns" row-key="name"
          virtual-scroll :virtual-scroll-slice-size="10" :rows-per-page-options="[0]" hide-pagination flat dark dense
          class="frame-detail-table">
          <!-- 自定义表头样式 -->
          <template v-slot:header="props">
            <q-tr :props="props" class="bg-industrial-table-header border-b border-industrial font-medium h-10">
              <q-th v-for="col in props.cols" :key="col.name" :props="props"
                :class="[col.align, 'text-xs px-2 text-industrial-primary']" :style="{
                  width: col.width,
                  minWidth: col.width,
                  maxWidth: col.maxWidth,
                }">
                {{ col.label }}
              </q-th>
            </q-tr>
          </template>

          <!-- 自定义行样式 -->
          <template v-slot:body="props">
            <q-tr :props="props" :class="[
              props.rowIndex % 2 === 1 ? 'bg-industrial-secondary' : 'bg-industrial-panel',
              'border-b border-industrial h-10',
            ]">
              <q-td v-for="col in props.cols" :key="col.name" :props="props"
                :class="[col.align, 'text-xs px-2 text-industrial-primary']" :style="{
                  width: col.width,
                  minWidth: col.width,
                  maxWidth: col.maxWidth,
                }">
                <div class="overflow-hidden text-ellipsis" :class="{ 'whitespace-nowrap': col.name !== 'value' }">
                  {{ props.row[col.field] }}
                </div>
              </q-td>
            </q-tr>
          </template>
        </q-table>
        <!-- 空数据状态 -->
        <template v-else>
          <div class="flex flex-col items-center justify-center p-10 text-industrial-secondary">
            <q-icon name="settings" size="48px" color="grey-7" />
            <div class="mt-4">没有参数信息</div>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="flex flex-col items-center justify-center py-10 text-industrial-secondary text-center gap-4">
      <q-icon name="info" size="36px" color="grey-7" />
      <div>请选择一个帧查看详情</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from '../../../utils/frames/frameUtils';
import type { FrameParam } from '../../../types/frames/index';

// 使用组件内部的DetailFrame类型定义，添加params属性
interface DetailFrameWithParams {
  id: string;
  name: string;
  timestamp: number;
  params: FrameParam[];
  direction?: string;
  protocol?: string;
  frameType?: string;
  fieldCount?: number;
  totalBytes?: number;
}

const props = defineProps<{
  frame?: DetailFrameWithParams;
  closable?: boolean;
}>();

defineEmits<{
  close: [];
}>();

// 参数表格列定义 - 使用QTable列格式，限制宽度
const qColumns = [
  {
    name: 'name',
    label: '参数名称',
    field: 'name',
    width: '160px',
    maxWidth: '160px',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'type',
    label: '类型',
    field: 'type',
    width: '90px',
    maxWidth: '90px',
    align: 'center' as const,
    sortable: true,
  },
  {
    name: 'value',
    label: '值',
    width: '100%',
    field: 'value',
    align: 'left' as const,
    sortable: true,
  },
];

// 格式化时间戳，使用工具函数
const formatTime = (timestamp: number): string => {
  return formatDate(timestamp);
};

// 获取类型名称，使用配置文件的类型选项
const getTypeName = (type: string): string => {
  // 使用类型映射
  const typeMap: Record<string, string> = {
    uint8: 'UInt8',
    uint16: 'UInt16',
    uint32: 'UInt32',
    uint64: 'UInt64',
    int8: 'Int8',
    int16: 'Int16',
    int32: 'Int32',
    int64: 'Int64',
    float: 'Float',
    double: 'Double',
    string: '字符串',
    hex: '十六进制',
    binary: '二进制',
    boolean: '布尔值',
    enum: '枚举',
    bitmap: '位图',
    timestamp: '时间戳',
    checksum: '校验和',
  };

  return typeMap[type] || type;
};

const formatParamValue = (param: FrameParam): string => {
  if (param.dataType === 'hex') {
    return `0x${param.value.toString().toUpperCase()}`;
  } else if (param.dataType === 'boolean') {
    return param.value ? '是' : '否';
  } else if (param.dataType === 'bitmap') {
    const value = parseInt(param.value as string, 10);
    return value.toString(2).padStart(8, '0');
  }
  return param.value.toString();
};

const formattedParams = computed(() => {
  return (
    props.frame?.params?.map((param) => ({
      name: param.name,
      type: getTypeName(param.dataType),
      value: formatParamValue(param),
    })) || []
  );
});
</script>

<style>
.frame-detail-table {
  max-height: 568px;
  overflow: auto;
}

/* 确保表格充满容器 */
.frame-detail-table .q-table {
  display: flex;
  flex-direction: column;
  width: 100%;
  table-layout: fixed;
}

.frame-detail-table .q-table__container {
  height: 100%;
}

/* 自定义滚动条样式 */
.frame-detail-table .q-table__virtual-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.frame-detail-table .q-table__virtual-content::-webkit-scrollbar-track {
  background: transparent;
}

.frame-detail-table .q-table__virtual-content::-webkit-scrollbar-thumb {
  background: #2a2f45;
  border-radius: 4px;
}

.frame-detail-table .q-table__virtual-content::-webkit-scrollbar-thumb:hover {
  background: #3b82f6;
}
</style>
