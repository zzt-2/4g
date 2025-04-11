<template>
  <div class="w-full bg-industrial-panel text-industrial-primary rounded">
    <!-- 标题区域 -->
    <slot name="header">
      <div
        v-if="title"
        class="px-4 py-3 text-sm font-medium bg-[#1a3663] flex items-center border-b border-industrial"
      >
        <q-icon v-if="icon" :name="icon" size="18px" class="mr-2" />
        {{ title }}
        <span v-if="showCount" class="ml-1 text-xs text-industrial-secondary"
          >({{ items.length }})</span
        >
        <slot name="header-extra"></slot>
      </div>
    </slot>

    <!-- 列表内容 -->
    <div class="relative">
      <!-- 加载状态 -->
      <div v-if="loading" class="w-full py-4 flex justify-center items-center">
        <q-spinner color="primary" size="24px" />
        <span class="ml-2 text-industrial-secondary text-sm">加载中...</span>
      </div>

      <!-- 空数据状态 -->
      <slot name="empty" v-bind:empty="items.length === 0 && !loading">
        <div
          v-if="items.length === 0 && !loading"
          class="flex flex-col items-center justify-center py-6 text-industrial-secondary text-center gap-2"
        >
          <q-icon name="info" size="24px" />
          <div class="text-sm">{{ emptyText || '没有数据' }}</div>
        </div>
      </slot>

      <!-- 数据列表 -->
      <div v-if="items.length > 0 && !loading" :class="['overflow-y-auto', heightClass]">
        <q-list class="p-2 flex flex-col gap-2">
          <template v-for="(item, index) in items" :key="index">
            <!-- 使用作用域插槽允许自定义项目渲染 -->
            <slot name="item" :item="item" :index="index">
              <q-item
                class="bg-industrial-secondary rounded border border-industrial p-0 flex"
                :class="{ 'cursor-pointer hover:border-primary': clickable }"
                @click="clickable ? $emit('click', item, index) : null"
              >
                <q-item-section>
                  <div class="p-2">
                    <!-- 默认项目布局 -->
                    <div class="flex justify-between items-center mb-1">
                      <div class="font-medium text-industrial-primary">
                        {{ getLabelText(item) }}
                      </div>
                      <div
                        v-if="getTypeText(item)"
                        class="text-xs text-industrial-secondary px-1.5 py-0.5 bg-industrial-highlight rounded"
                      >
                        {{ getTypeText(item) }}
                      </div>
                    </div>

                    <div v-if="getValueText(item)" class="flex items-center">
                      <div class="text-xs text-industrial-secondary mr-2">值:</div>
                      <div
                        class="font-mono bg-industrial-primary px-2 py-1 rounded text-sm overflow-x-auto max-w-full text-industrial-id"
                      >
                        {{ getValueText(item) }}
                      </div>
                    </div>
                  </div>
                </q-item-section>

                <!-- 操作按钮区 -->
                <q-item-section side v-if="$slots.actions">
                  <slot name="actions" :item="item" :index="index"></slot>
                </q-item-section>
              </q-item>
            </slot>
          </template>
        </q-list>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  items: any[]; // 列表数据
  loading?: boolean; // 是否加载中
  title?: string; // 列表标题
  icon?: string; // 标题图标
  showCount?: boolean; // 是否显示数量
  clickable?: boolean; // 是否可点击
  emptyText?: string; // 空数据文本
  maxHeight?: string | number; // 最大高度
  labelField?: string; // 标签字段名
  typeField?: string; // 类型字段名
  valueField?: string; // 值字段名
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  title: '',
  icon: '',
  showCount: true,
  clickable: false,
  emptyText: '没有数据',
  maxHeight: 'auto',
  labelField: 'name',
  typeField: 'type',
  valueField: 'value',
});

const emit = defineEmits<{
  click: [item: any, index: number];
}>();

// 计算高度类
const heightClass = computed(() => {
  if (props.maxHeight === 'auto') {
    return 'max-h-[calc(100vh-300px)]';
  }
  if (typeof props.maxHeight === 'number') {
    return `max-h-[${props.maxHeight}px]`;
  }
  return `max-h-[${props.maxHeight}]`;
});

// 获取标签文本
function getLabelText(item: any): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return item.toString();
  if (typeof item === 'object') {
    // 如果是对象，尝试获取指定字段
    if (props.labelField) {
      const value = getNestedValue(item, props.labelField);
      if (value !== undefined) return value.toString();
    }

    // 尝试获取通用名称字段
    for (const field of ['name', 'title', 'label', 'id']) {
      if (item[field] !== undefined) return item[field].toString();
    }
  }
  return '';
}

// 获取类型文本
function getTypeText(item: any): string {
  if (!props.typeField) return '';
  const value = getNestedValue(item, props.typeField);
  return value !== undefined ? value.toString() : '';
}

// 获取值文本
function getValueText(item: any): string {
  if (!props.valueField) return '';
  const value = getNestedValue(item, props.valueField);
  if (value === undefined) return '';

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[Object]';
    }
  }

  return value.toString();
}

// 获取嵌套属性值
function getNestedValue(obj: any, path: string): any {
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((o, key) => o && o[key], obj);
}
</script>
