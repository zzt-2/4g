<template>
  <div class="frame-filter-panel">
    <div class="filter-header">
      <div class="filter-title">
        <q-icon name="filter_list" size="20px" class="q-mr-sm" />
        数据帧过滤
      </div>
      <q-btn flat round dense icon="close" size="sm" @click="emit('close')" v-if="closable" />
    </div>

    <div class="filter-body">
      <div class="filter-item">
        <div class="filter-label">帧ID:</div>
        <q-input
          v-model="localFilters.frameId"
          dense
          dark
          outlined
          placeholder="输入帧ID"
          class="filter-input"
          @update:model-value="applyLocalFilters"
        />
      </div>

      <div class="filter-item">
        <div class="filter-label">名称:</div>
        <q-input
          v-model="localFilters.name"
          dense
          dark
          outlined
          placeholder="输入名称关键词"
          class="filter-input"
          @update:model-value="applyLocalFilters"
        />
      </div>

      <div class="filter-item">
        <div class="filter-label">状态:</div>
        <q-select
          v-model="localFilters.status"
          :options="STATUS_OPTIONS"
          dense
          dark
          outlined
          emit-value
          map-options
          option-label="label"
          option-value="value"
          placeholder="选择状态"
          class="filter-input"
          @update:model-value="applyLocalFilters"
          clearable
        />
      </div>

      <div class="filter-item">
        <div class="filter-label">参数数:</div>
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
          class="filter-input"
          @update:model-value="applyLocalFilters"
          clearable
        />
      </div>

      <div class="filter-item time-filter">
        <div class="filter-label">时间范围:</div>
        <div class="time-range">
          <q-input
            v-model="localFilters.startTime"
            dense
            dark
            outlined
            type="time"
            class="time-input"
            @update:model-value="applyLocalFilters"
          />
          <div class="time-separator">至</div>
          <q-input
            v-model="localFilters.endTime"
            dense
            dark
            outlined
            type="time"
            class="time-input"
            @update:model-value="applyLocalFilters"
          />
        </div>
      </div>
    </div>

    <div class="filter-actions">
      <q-btn color="primary" label="应用过滤" @click="applyLocalFilters" size="sm" />
      <q-btn outline color="grey" label="重置" @click="resetLocalFilters" size="sm" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
// 目前没有直接使用useFrameFilters，暂时注释掉
// import { useFrameFilters } from '../../../composables/frames/useFrameFilters';
// 未使用的类型导入，暂时注释掉
// import type { FrameStatus } from '../../../types/frames/index';

// 暂时不使用frameFilters，如果需要全局过滤可以重新添加
// const frameFilters = useFrameFilters();

// 状态选项常量
const STATUS_OPTIONS = [
  { label: '处理中', value: 'processing' },
  { label: '完成', value: 'completed' },
  { label: '错误', value: 'error' },
  { label: '待处理', value: 'pending' },
];

interface LocalFilterValues {
  frameId: string;
  name: string;
  status: string | null; // 使用字符串而不是FrameStatus类型，避免类型错误
  paramCount: number | null;
  startTime: string;
  endTime: string;
}

const props = defineProps<{
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
  status: null,
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
  localFilters.status = null;
  localFilters.paramCount = null;
  localFilters.startTime = '';
  localFilters.endTime = '';
  applyLocalFilters();

  // 如果需要，也可以重置全局过滤器
  // frameFilters.resetFilters();
};
</script>

<style scoped>
.frame-filter-panel {
  background-color: #2c2c2c;
  color: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: #333;
  border-bottom: 1px solid #444;
}

.filter-title {
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
}

.filter-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 12px;
  color: #aaa;
}

.filter-input {
  width: 100%;
}

.time-filter {
  margin-top: 4px;
}

.time-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-input {
  flex: 1;
}

.time-separator {
  color: #aaa;
  font-size: 12px;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  gap: 8px;
  background-color: #333;
  border-top: 1px solid #444;
}
</style>
