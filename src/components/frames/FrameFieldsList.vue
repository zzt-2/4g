<template>
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center">
      <h3 class="text-xs font-medium text-[#e2e8f0] uppercase mr-3">字段定义</h3>

      <!-- 总字段数和总长度信息 -->
      <div class="flex items-center text-xs">
        <div class="text-[10px] text-[#94a3b8] mr-2 flex items-center">
          <span class="w-1.5 h-1.5 bg-[#3b82f6] rounded-full mr-0.5"></span>
          <span>总字段数: {{ fields.length }}</span>
        </div>
        <div class="text-[10px] text-[#94a3b8] flex items-center">
          <span class="w-1.5 h-1.5 bg-[#3b82f6] rounded-full mr-0.5"></span>
          <span>总长度: {{ totalBits }}b ({{ Math.ceil(totalBits / 8) }}B)</span>
        </div>
      </div>
    </div>

    <button
      class="flex items-center bg-[#3b82f6] hover:bg-[#2563eb] text-white py-0.5 px-2 rounded text-xs transition-colors duration-200"
      @click="addField"
    >
      <span class="material-icons text-xs mr-0.5">add</span>
      添加字段
    </button>
  </div>

  <div class="w-48 border-r border-[#1a3663] overflow-y-auto bg-[#0f2744] flex-shrink-0">
    <div class="p-1">
      <div
        v-for="(field, index) in fields"
        :key="field.id"
        class="flex items-center mb-1 bg-[#0a1929] rounded border border-[#1a3663] hover:border-[#3b82f6] cursor-pointer transition-colors duration-200 overflow-hidden h-9"
        :class="{ 'border-[#3b82f6] bg-[#1e3a6a]': selectedIndex === index }"
        @click="selectField(index)"
      >
        <div class="flex-shrink-0 h-full flex items-center px-1 text-[#64748b]">
          <span class="material-icons text-[10px]">drag_indicator</span>
        </div>

        <div class="flex-grow h-full py-0.5 px-1 overflow-hidden flex flex-col justify-center">
          <div class="font-medium text-[10px] text-[#e2e8f0] truncate">
            {{ field.name || '未命名字段' }}
          </div>
          <div class="flex items-center">
            <span class="text-[8px] text-[#94a3b8] bg-[#1e3a6a] px-0.5 rounded">{{
              getFieldShortType(field.type)
            }}</span>
            <span class="text-[8px] text-[#94a3b8] ml-1">{{ getFieldBitsText(field) }}</span>
          </div>
        </div>

        <div class="flex flex-shrink-0 h-full">
          <button
            class="h-full flex items-center justify-center w-5 text-[#94a3b8] hover:bg-[#1e3a6a] hover:text-white transition-colors duration-200"
            @click.stop="duplicateField(index)"
            title="复制"
          >
            <span class="material-icons text-[10px]">content_copy</span>
          </button>
          <button
            class="h-full flex items-center justify-center w-5 text-[#ef4444] hover:bg-[#991b1b] hover:text-white transition-colors duration-200"
            @click.stop="removeField(index)"
            title="删除"
          >
            <span class="material-icons text-[10px]">delete</span>
          </button>
        </div>
      </div>

      <div
        v-if="fields.length === 0"
        class="flex flex-col items-center justify-center p-2 rounded border border-dashed border-[#1a3663] text-[#64748b] text-[10px] text-center"
      >
        <span class="material-icons text-sm mb-0.5">layers</span>
        <p>请添加字段</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type FrameField } from '../../types/frames';

const props = defineProps<{
  fields: FrameField[];
  selectedIndex: number | null;
}>();

const emit = defineEmits<{
  select: [index: number];
  add: [];
  duplicate: [index: number];
  remove: [index: number];
}>();

const selectField = (index: number) => {
  emit('select', index);
};

const addField = () => {
  emit('add');
};

const duplicateField = (index: number) => {
  emit('duplicate', index);
};

const removeField = (index: number) => {
  emit('remove', index);
};

// 工具函数
const getFieldShortType = (type: string): string => {
  const shortTypes: Record<string, string> = {
    bit: 'bit',
    uint8: 'u8',
    int8: 'i8',
    uint16: 'u16',
    int16: 'i16',
    uint32: 'u32',
    int32: 'i32',
    float: 'f32',
    bytes: 'byte[]',
    string: 'str',
  };

  return shortTypes[type] || type;
};

const getFieldBitsText = (field: FrameField): string => {
  if (field.type === 'bit') {
    return `${field.bits || 1}b`;
  }

  const typeSizes: Record<string, number> = {
    uint8: 8,
    int8: 8,
    uint16: 16,
    int16: 16,
    uint32: 32,
    int32: 32,
    float: 32,
  };

  if (field.type === 'bytes' || field.type === 'string') {
    return `${field.length * 8}b`;
  }

  return `${typeSizes[field.type] || 8}b`;
};

const getFieldBits = (field: FrameField): number => {
  if (field.type === 'bit') {
    return field.bits || 1;
  }

  if (field.type === 'bytes' || field.type === 'string') {
    return field.length * 8;
  } else {
    const typeSizes: Record<string, number> = {
      uint8: 8,
      int8: 8,
      uint16: 16,
      int16: 16,
      uint32: 32,
      int32: 32,
      float: 32,
    };
    return typeSizes[field.type] || 8;
  }
};

const totalBits = computed(() => {
  let total = 0;

  for (const field of props.fields) {
    total += getFieldBits(field);
  }

  return total;
});
</script>
