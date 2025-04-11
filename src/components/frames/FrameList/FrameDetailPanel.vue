<template>
  <div
    class="flex flex-col h-full w-full overflow-hidden bg-industrial-panel text-industrial-primary rounded"
  >
    <div class="flex justify-between items-center px-4 py-3 bg-[#1a3663] border-b border-[#334155]">
      <div class="flex items-center text-sm font-medium">
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
          <div class="flex-1">{{ frame.name }}</div>
        </div>
        <div class="flex">
          <div class="w-[70px] text-xs text-industrial-secondary">时间戳:</div>
          <div class="flex-1">{{ formatTime(frame.timestamp) }}</div>
        </div>
      </div>

      <q-separator color="grey-8" />

      <!-- 使用DataTable组件显示参数列表 -->
      <div class="px-4 py-3 text-sm font-medium bg-[#1a3663] flex items-center">
        <q-icon name="tune" size="18px" class="mr-2" />
        参数列表
      </div>

      <div class="flex-1 max-h-[570px]">
        <DataTable
          :columns="paramColumns"
          :data="formattedParams"
          rowHeight="36px"
          emptyText="没有参数信息"
        />
      </div>
    </template>

    <div
      v-else
      class="flex flex-col items-center justify-center py-10 text-[#64748b] text-center gap-4"
    >
      <q-icon name="info" size="36px" color="grey-7" />
      <div>请选择一个帧查看详情</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DataTable from '../../common/DataTable.vue';
import { formatDate } from '../../../utils/frames/frameUtils';
import type { FrameParam } from '../../../types/frames/index';

// 使用组件内部的DetailFrame类型定义，添加params属性
interface DetailFrameWithParams {
  id: string;
  name: string;
  status: string;
  timestamp: number;
  params: FrameParam[];
  category?: string;
  categoryName?: string;
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

// 参数表格列定义
const paramColumns = [
  { field: 'name', title: '参数名称', width: '140px' },
  { field: 'type', title: '类型', width: '100px', align: 'center' as const },
  { field: 'value', title: '值', minWidth: '120px' },
];

// 格式化时间戳，使用工具函数
const formatTime = (timestamp: number): string => {
  return formatDate(timestamp, 'HH:mm:ss.SSS');
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
  if (param.type === 'hex') {
    return `0x${param.value.toString().toUpperCase()}`;
  } else if (param.type === 'boolean') {
    return param.value ? '是' : '否';
  } else if (param.type === 'bitmap') {
    const value = parseInt(param.value as string, 10);
    return value.toString(2).padStart(8, '0');
  }
  return param.value.toString();
};

const formattedParams = computed(() => {
  return (
    props.frame?.params?.map((param) => ({
      name: param.name,
      type: getTypeName(param.type),
      value: formatParamValue(param),
    })) || []
  );
});
</script>
