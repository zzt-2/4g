<template>
  <div class="bg-industrial-panel border border-industrial rounded overflow-hidden">
    <div
      class="flex justify-between items-center p-3 bg-industrial-table-header border-b border-industrial"
    >
      <div class="flex items-center text-sm font-medium text-industrial-primary">
        <q-icon name="filter_list" size="20px" class="mr-2" />
        数据帧过滤
      </div>
      <q-btn flat round dense icon="close" size="sm" @click="emit('close')" v-if="closable" />
    </div>

    <div class="p-4 space-y-4">
      <div class="space-y-2">
        <div class="text-xs text-industrial-secondary">帧ID:</div>
        <q-input
          v-model="localFilters.frameId"
          dense
          dark
          outlined
          placeholder="输入帧ID"
          bg-color="industrial-secondary"
          color="blue"
          class="text-industrial-primary"
          @update:model-value="applyLocalFilters"
        />
      </div>

      <div class="space-y-2">
        <div class="text-xs text-industrial-secondary">名称:</div>
        <q-input
          v-model="localFilters.name"
          dense
          dark
          outlined
          placeholder="输入名称关键词"
          bg-color="industrial-secondary"
          color="blue"
          class="text-industrial-primary"
          @update:model-value="applyLocalFilters"
        />
      </div>

      <div class="space-y-2">
        <div class="text-xs text-industrial-secondary">参数数:</div>
        <q-select
          v-model="localFilters.paramCount"
          :options="paramCountOptions"
          dense
          dark
          outlined
          emit-value
          map-options
          option-label="label"
          option-value="value"
          placeholder="选择参数数"
          bg-color="industrial-secondary"
          color="blue"
          @update:model-value="applyLocalFilters"
          clearable
        />
      </div>

      <div class="space-y-2">
        <div class="text-xs text-industrial-secondary">时间范围:</div>
        <div class="flex items-center gap-2">
          <q-input
            v-model="localFilters.startTime"
            dense
            dark
            outlined
            type="time"
            bg-color="industrial-secondary"
            color="blue"
            class="flex-1"
            @update:model-value="applyLocalFilters"
          />
          <div class="text-xs text-industrial-secondary">至</div>
          <q-input
            v-model="localFilters.endTime"
            dense
            dark
            outlined
            type="time"
            bg-color="industrial-secondary"
            color="blue"
            class="flex-1"
            @update:model-value="applyLocalFilters"
          />
        </div>
      </div>
    </div>

    <div
      class="flex justify-end items-center gap-2 p-3 bg-industrial-table-header border-t border-industrial"
    >
      <q-btn
        flat
        dense
        size="sm"
        color="blue"
        label="应用过滤"
        @click="applyLocalFilters"
        class="btn-industrial-primary"
      />
      <q-btn
        flat
        dense
        size="sm"
        color="grey"
        label="重置"
        @click="resetLocalFilters"
        class="btn-industrial-secondary"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

interface LocalFilterValues {
  frameId: string;
  name: string;
  paramCount: number | null;
  startTime: string;
  endTime: string;
}

defineProps<{
  closable?: boolean;
}>();

const emit = defineEmits<{
  filter: [filters: LocalFilterValues];
  close: [];
}>();

const paramCountOptions = [
  { label: '0参数', value: 0 },
  { label: '1参数', value: 1 },
  { label: '2参数', value: 2 },
  { label: '3参数', value: 3 },
  { label: '4参数', value: 4 },
  { label: '5参数', value: 5 },
  { label: '6参数', value: 6 },
  { label: '7参数', value: 7 },
  { label: '8参数', value: 8 },
  { label: '9参数', value: 9 },
];

const localFilters = reactive<LocalFilterValues>({
  frameId: '',
  name: '',
  paramCount: null,
  startTime: '',
  endTime: '',
});

const applyLocalFilters = () => {
  emit('filter', { ...localFilters });

  // 如果有必要，也可以调用全局过滤器的方法
  // 例如: frameFilters.setSearchQuery(localFilters.name);
};

const resetLocalFilters = () => {
  localFilters.frameId = '';
  localFilters.name = '';
  localFilters.paramCount = null;
  localFilters.startTime = '';
  localFilters.endTime = '';
  applyLocalFilters();

  // 如果需要，也可以重置全局过滤器
  // frameFilters.resetFilters();
};
</script>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
