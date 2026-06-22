<template>
  <div class="relative flex flex-col h-full w-full">
    <div class="flex w-full justify-between items-center mb-2">
      <h3 class="text-xs font-medium text-[#e2e8f0] uppercase">字段结构预览</h3>
      <div class="text-[10px] text-[#94a3b8]">
        总大小: {{ fieldStore.totalBits }}b ({{ Math.ceil(fieldStore.totalBits / 8) }}B)
      </div>
    </div>

    <div class="flex-1 w-full overflow-y-auto border border-blue-500/30 rounded bg-[#0f172a]/50 p-2">
      <div v-if="fieldStore.fields.length > 0" class="h-full w-full">
        <!-- 多列容器：使用grid自动调整列数并平均分配宽度 -->
        <div class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(10px,1fr))` }">
          <!-- 每一列 -->
          <div v-for="(column, colIndex) in fieldColumns" :key="colIndex" class="flex flex-col max-w-[250px]">
            <!-- 每列中的字段项 -->
            <div v-for="field in column" :key="field.id"
              class="flex items-center text-[#e2e8f0] px-1 py-1 border-b border-b-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
              :class="{
                'bg-blue-900/40': fieldStore.selectedFieldIndex === getOriginalIndex(field.id),
              }" @click="startEditField(getOriginalIndex(field.id))">
              <!-- 序号 -->
              <div class="w-7 flex-shrink-0 text-right">
                <span class="text-[10px] text-[#94a3b8] font-mono mr-1">[{{ getOriginalIndex(field.id) + 1 }}]</span>
              </div>

              <!-- 字段ID与名称 -->
              <div class="w-16 min-w-0 flex-shrink-0 ml-1">
                <div class="text-[10px] text-[#94a3b8] font-mono">
                  D{{ getPaddedIndex(getOriginalIndex(field.id) + 1) }}
                </div>
                <div class="text-[10px] text-[#e2e8f0] truncate max-w-full">{{ field.name }}</div>
              </div>

              <!-- 类型与位长 -->
              <div class="flex items-center space-x-1 ml-1 shrink-0">
                <span class="text-[9px] bg-[#1e3a6a] px-1 py-0.5 rounded">
                  {{ getFieldShortType(field.dataType) }}
                </span>
                <span class="text-[9px] text-[#94a3b8]">{{ getFieldBitsB(field) }}</span>
                <span v-if="field.validOption!.isChecksum"
                  class="text-[9px] text-amber-300 bg-amber-900/70 px-1 py-0.5 rounded">
                  校验
                </span>
              </div>

              <!-- 十六进制预览 -->
              <div class="ml-auto text-right overflow-auto text-ellipsis">
                <span class="text-[10px] font-mono text-[#cbd5e1] whitespace-nowrap"
                  :class="{ 'text-amber-300': field.validOption!.isChecksum }">
                  {{ getFieldHexPreview(field) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center h-full min-h-40 text-[#64748b] text-xs text-center">
        <span class="material-icons text-2xl mb-2">preview</span>
        <p>添加字段后在此处预览帧结构</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import {
  getFieldShortType,
  getFieldBitWidth,
  getFieldHexPreview,
} from '../../../utils/frames/frameUtils';
import type { FrameField } from '../../../types/frames';

// 获取store和composable
const fieldStore = useFrameFieldsStore();

// 每列最大字段数量
const MAX_FIELDS_PER_COLUMN = 18;

// 计算列数
const columnCount = computed(() => {
  return Math.max(1, Math.ceil(fieldStore.fields.length / MAX_FIELDS_PER_COLUMN));
});

// 将字段分割成多列
const fieldColumns = computed(() => {
  const columns: FrameField[][] = [];

  for (let i = 0; i < columnCount.value; i++) {
    const startIndex = i * MAX_FIELDS_PER_COLUMN;
    const endIndex = Math.min(startIndex + MAX_FIELDS_PER_COLUMN, fieldStore.fields.length);

    columns.push(fieldStore.fields.slice(startIndex, endIndex));
  }

  return columns;
});

// 获取字段在原始数组中的索引
function getOriginalIndex(fieldId: string): number {
  return fieldStore.fields.findIndex((field: FrameField) => field.id === fieldId);
}

// 获取带有前导零的索引，用于显示 DXX 编号
function getPaddedIndex(index: number): string {
  return index.toString().padStart(3, '0');
}

// 将字段位宽显示为字节数
function getFieldBitsB(field: FrameField): string {
  const bits = getFieldBitWidth(field);
  const bytes = Math.ceil(bits / 8);
  return bits % 8 === 0 ? `${bytes}B` : `${bits}b`;
}

// 开始编辑字段 - 使用composable调用方法以获取通知功能
function startEditField(index: number) {
  fieldStore.startEditField(index);
}
</script>
