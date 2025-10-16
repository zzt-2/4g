<script setup lang="ts">
import { computed } from 'vue';
import type { SendInstanceField } from '../../../types/frames/sendInstances';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import {
  formatHexWithSpaces,
  getFullHexString,
  getFieldHexValue,
} from '../../../utils/frames/hexCovertUtils';

// 获取store实例
const sendFrameInstancesStore = useSendFrameInstancesStore();

// 优化的可配置字段计算，减少重复访问 store
const configurableFields = computed(() => {
  const currentInstance = sendFrameInstancesStore.currentInstance;
  if (!currentInstance?.fields) return [];

  return currentInstance.fields.filter(
    (field: SendInstanceField) => field.configurable,
  );
});

// 优化的完整帧十六进制计算
const fullHexString = computed(() => {
  const currentInstance = sendFrameInstancesStore.currentInstance;
  if (!currentInstance?.fields) return '';

  const hexValues = getFullHexString(currentInstance.fields);
  return formatHexWithSpaces(hexValues);
});

// 优化的格式化可配置字段计算，避免不必要的对象展开
const formattedConfigurableFields = computed(() => {
  const configFields = configurableFields.value;
  if (!configFields.length) return [];

  // 使用更高效的映射方式，避免对象展开
  return configFields.map((field: SendInstanceField) => ({
    ...field,
    label: field.bigEndian !== false ? field.label : field.label + ' (小端序)',
    hexValue: getFieldHexValue(field),
  }));
});

// 格式化日期
const formatDate = (date: Date | undefined | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleString();
};
</script>

<template>
  <div class="flex flex-col no-wrap h-full w-full">
    <!-- 实例信息头部 -->
    <div class="flex flex-col p-3 border-b border-solid border-[#2A2F45]"
      v-if="sendFrameInstancesStore.currentInstance">
      <h5 class="m-0 text-white font-medium text-base">
        {{ sendFrameInstancesStore.currentInstance.label }}
      </h5>

      <!-- 创建和更新时间 -->
      <div class="mt-2 flex flex-col gap-2 text-xs">
        <div class="text-blue-grey-5">
          <span class="text-blue-grey-4">创建时间: </span>
          {{ formatDate(sendFrameInstancesStore.currentInstance.createdAt) }}
        </div>
        <div class="text-blue-grey-5">
          <span class="text-blue-grey-4">更新时间: </span>
          {{ formatDate(sendFrameInstancesStore.currentInstance.updatedAt) }}
        </div>
      </div>

      <!-- 备注 -->
      <div class="break-all text-blue-grey-4 text-xs mt-2" v-if="sendFrameInstancesStore.currentInstance.description">
        <span class="text-blue-grey-5">备注: </span>
        {{ sendFrameInstancesStore.currentInstance.description }}
      </div>

      <!-- 完整帧十六进制显示 -->
      <div class="mt-3 bg-[#0d1117] rounded-md border border-[#1E293B]" v-if="fullHexString">
        <div class="text-xs text-blue-grey-4 mb-1">完整帧十六进制:</div>
        <div class="font-mono text-blue-400 text-sm break-all select-all  overflow-y-auto max-h-300px">
          {{ fullHexString }}
        </div>
      </div>
    </div>

    <!-- 帧数据主体 - 只显示可配置字段 -->
    <div class="flex-1 overflow-y-auto" v-if="sendFrameInstancesStore.currentInstance">
      <!-- 可配置字段数量为0时的提示 -->
      <div v-if="configurableFields.length === 0"
        class="flex items-center justify-center p-4 text-blue-grey-4 bg-[#1a1e2e] rounded-lg">
        <q-icon name="info" color="info" size="sm" class="mr-2" />
        <span class="text-sm">该帧实例没有可配置字段</span>
      </div>

      <!-- 帧数据预览表格 - 只显示可配置字段 -->
      <div v-else class="bg-[#1a1e2e] rounded-lg shadow-md border border-[#2A2F45]">
        <q-table flat dense :rows="formattedConfigurableFields" :columns="[
          {
            name: 'label',
            label: '字段',
            field: 'label',
            align: 'left',
            sortable: true,
            style: 'width: 120px',
          },
          {
            name: 'hex',
            label: '十六进制值',
            field: 'hexValue',
            align: 'right',
            sortable: true,
            style: 'width: 100%; min-width: 100%',
          },
        ]" row-key="id" hide-pagination :rows-per-page-options="[0]" dark class="shadow-sm" virtual-scroll
          :virtual-scroll-slice-size="10" :virtual-scroll-sticky-size-start="48" :virtual-scroll-sticky-size-end="0">
          <template v-slot:body="props">
            <q-tr :props="props" class="hover:bg-[#232b3f] transition-colors">
              <q-td key="label" :props="props" class="text-left">
                <div class="flex items-center">
                  <div class="truncate max-w-full" :title="props.row.label">
                    {{ props.row.label }}
                  </div>
                </div>
              </q-td>
              <q-td key="hex" :props="props" class="text-right">
                <span v-if="props.row.hexValue" class="font-mono text-blue-400 truncate max-w-full inline-block"
                  :title="props.row.hexValue">
                  {{ props.row.hexValue }}
                </span>
                <span v-else class="text-blue-grey-6">-</span>
              </q-td>
            </q-tr>
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
        </q-table>
      </div>
    </div>

    <!-- 空状态提示 -->
    <div class="flex-1 flex flex-col items-center justify-center p-8 bg-[#131725]"
      v-if="!sendFrameInstancesStore.currentInstance">
      <q-icon name="visibility" color="blue-grey-7" size="3rem" class="opacity-70" />
      <div class="text-blue-grey-4 mt-4 text-center">请选择帧实例以查看预览</div>
    </div>
  </div>
</template>

<style>
/* 使用UnoCSS，移除SCSS样式 */
.q-table {
  width: 100%;
  table-layout: fixed;
}

.q-table th,
.q-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.q-table th.text-left,
.q-table td.text-left {
  padding-left: 8px;
}

.q-table th.text-right,
.q-table td.text-right {
  padding-right: 8px;
}

/* 粘性表头样式 */
.q-table thead tr th {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: #111827 !important;
}
</style>
