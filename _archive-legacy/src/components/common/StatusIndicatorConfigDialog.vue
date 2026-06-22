<template>
  <q-dialog v-model="isOpen">
    <q-card class="bg-industrial-panel" style="min-width: 600px; max-width: 800px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">状态指示灯配置</div>
      </q-card-section>

      <q-card-section class="space-y-4" style="max-height: 70vh; overflow-y: auto">
        <!-- 指示灯列表 -->
        <div v-for="(indicator, index) in localIndicators" :key="indicator.id"
          class="bg-industrial-secondary border border-industrial rounded-lg p-4 space-y-4">
          <!-- 指示灯头部 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-4 h-4 rounded-full border" :style="{
                backgroundColor: getIndicatorPreviewColor(indicator),
                borderColor: getIndicatorPreviewColor(indicator),
              }" />
              <span class="text-sm font-medium text-industrial-primary">
                {{ indicator.label || `指示灯 ${index + 1}` }}
              </span>
            </div>
            <q-btn flat dense round size="sm" icon="delete" class="text-red-400 hover:text-red-300"
              @click="removeIndicator(indicator.id)" />
          </div>

          <!-- 基础配置 -->
          <div class="space-y-4">
            <!-- 指示灯标签 -->
            <q-input v-model="indicator.label" label="指示灯标签" outlined dense bg-color="industrial-secondary" color="blue"
              class="text-industrial-primary" />

            <!-- 关联数据项 -->
            <q-select :model-value="getDataItemDisplayValue(indicator)" :options="availableDataItemOptions"
              label="关联数据项" emit-value map-options outlined dense bg-color="industrial-secondary" color="blue"
              @update:model-value="updateDataItemBinding(indicator, $event)" />

            <!-- 默认颜色 -->
            <div>
              <div class="text-sm text-industrial-secondary mb-2">默认颜色 (无匹配时显示)</div>
              <div class="flex items-center space-x-3">
                <input v-model="indicator.defaultColor" type="color"
                  class="w-12 h-8 rounded border border-industrial cursor-pointer" />
                <q-input v-model="indicator.defaultColor" outlined dense bg-color="industrial-secondary" color="blue"
                  class="flex-1" placeholder="#6b7280" />
              </div>
            </div>

            <!-- 值-颜色映射 -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <div class="text-sm text-industrial-primary font-medium">值-颜色映射</div>
                <q-btn flat dense icon="add" label="添加映射" size="sm" color="blue" @click="addMappingValue(indicator)" />
              </div>

              <div class="space-y-3">
                <div v-for="(mapping, mappingIndex) in indicator.valueMappings" :key="mappingIndex"
                  class="flex items-center space-x-3">
                  <!-- 值输入 -->
                  <div class="flex-1">
                    <q-select v-if="shouldUseSelect(indicator)" v-model="mapping.value"
                      :options="getLabelOptions(indicator)" emit-value map-options outlined dense
                      bg-color="industrial-secondary" color="blue" placeholder="选择值" />
                    <q-input v-else v-model="mapping.value" outlined dense bg-color="industrial-secondary" color="blue"
                      placeholder="输入值或范围(如: 10-20)" :hint="getCurrentValueHint(indicator)" />
                  </div>

                  <!-- 颜色选择 -->
                  <input v-model="mapping.color" type="color"
                    class="w-10 h-8 rounded border border-industrial cursor-pointer" />

                  <!-- 删除按钮 -->
                  <q-btn flat dense round size="sm" icon="remove" class="text-red-400 hover:text-red-300"
                    :disable="indicator.valueMappings.length <= 1"
                    @click="removeMappingValue(indicator, mappingIndex)" />
                </div>

                <!-- 无映射提示 -->
                <div v-if="indicator.valueMappings.length === 0" class="text-center py-4">
                  <div class="text-industrial-secondary text-sm">还没有值映射</div>
                  <div class="text-industrial-secondary text-xs">点击"添加映射"按钮创建映射</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 添加指示灯按钮 -->
        <div v-if="localIndicators.length === 0" class="text-center py-8">
          <div class="text-industrial-secondary mb-4">还没有配置指示灯</div>
          <q-btn unelevated icon="add" label="添加第一个指示灯" color="blue" @click="addNewIndicator" />
        </div>

        <q-btn v-else flat icon="add" label="添加指示灯"
          class="w-full p-4 border-2 border-dashed border-industrial hover:border-blue-500 text-industrial-accent"
          @click="addNewIndicator" />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="handleCancel" />
        <q-btn flat label="保存" color="blue" @click="handleSave" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStatusIndicatorStore } from '../../stores/statusIndicators';
import type { StatusIndicatorConfig, ValueColorMapping } from '../../types/frames/receive';

// Props
const props = defineProps<{
  modelValue: boolean;
}>();

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

// Stores
const statusStore = useStatusIndicatorStore();

// 本地状态
const localIndicators = ref<StatusIndicatorConfig[]>([]);

// 计算属性
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const availableDataItemOptions = computed(() => {
  return statusStore.getAvailableDataItems().map((item) => ({
    label: `${item.groupLabel} / ${item.dataItemLabel}`,
    value: `${item.groupId}-${item.dataItemId}`,
    groupId: item.groupId,
    dataItemId: item.dataItemId,
    currentValue: item.currentValue,
    currentDisplayValue: item.currentDisplayValue,
    useLabel: item.useLabel,
    labelOptions: item.labelOptions,
  }));
});

// 监听对话框打开，加载数据
watch(isOpen, (newValue) => {
  if (newValue) {
    loadIndicators();
  }
});

// 方法
const loadIndicators = (): void => {
  localIndicators.value = statusStore.settings.indicators.map((indicator) => ({
    ...indicator,
    valueMappings: [...indicator.valueMappings],
  }));
};

const addNewIndicator = (): void => {
  const newIndicator: StatusIndicatorConfig = {
    id: `temp_${Date.now()}`,
    label: `指示灯${localIndicators.value.length + 1}`,
    groupId: 0,
    dataItemId: 0,
    valueMappings: [{ value: '', color: '#00ff00' }],
    defaultColor: '#6b7280',
  };
  localIndicators.value.push(newIndicator);
};

const removeIndicator = (id: string): void => {
  const index = localIndicators.value.findIndex((indicator) => indicator.id === id);
  if (index !== -1) {
    localIndicators.value.splice(index, 1);
  }
};

const getDataItemDisplayValue = (indicator: StatusIndicatorConfig): string => {
  if (indicator.groupId === 0 || indicator.dataItemId === 0) {
    return '';
  }
  return `${indicator.groupId}-${indicator.dataItemId}`;
};

const updateDataItemBinding = (indicator: StatusIndicatorConfig, value: string): void => {
  if (!value) {
    indicator.groupId = 0;
    indicator.dataItemId = 0;
    return;
  }

  const parts = value.split('-');
  const groupId = Number(parts[0]) || 0;
  const dataItemId = Number(parts[1]) || 0;

  indicator.groupId = groupId;
  indicator.dataItemId = dataItemId;
};

const shouldUseSelect = (indicator: StatusIndicatorConfig): boolean => {
  const dataItem = availableDataItemOptions.value.find(
    (item) => item.groupId === indicator.groupId && item.dataItemId === indicator.dataItemId,
  );
  return dataItem?.useLabel === true && (dataItem?.labelOptions?.length || 0) > 0;
};

const getLabelOptions = (indicator: StatusIndicatorConfig) => {
  const dataItem = availableDataItemOptions.value.find(
    (item) => item.groupId === indicator.groupId && item.dataItemId === indicator.dataItemId,
  );
  if (!dataItem?.labelOptions) {
    return [];
  }
  return dataItem.labelOptions.map((option) => ({
    label: `${option.label} (${option.value})`,
    value: option.value,
  }));
};

const getCurrentValueHint = (indicator: StatusIndicatorConfig): string => {
  const dataItem = availableDataItemOptions.value.find(
    (item) => item.groupId === indicator.groupId && item.dataItemId === indicator.dataItemId,
  );

  if (!dataItem) {
    return '请先选择数据项';
  }

  return `当前值: ${dataItem.currentValue}`;
};

const addMappingValue = (indicator: StatusIndicatorConfig): void => {
  indicator.valueMappings.push({
    value: '',
    color: '#00ff00',
  });
};

const removeMappingValue = (indicator: StatusIndicatorConfig, index: number): void => {
  if (indicator.valueMappings.length > 1) {
    indicator.valueMappings.splice(index, 1);
  }
};

const getIndicatorPreviewColor = (indicator: StatusIndicatorConfig): string => {
  if (indicator.valueMappings.length > 0 && indicator.valueMappings[0].color) {
    return indicator.valueMappings[0].color;
  }
  return indicator.defaultColor;
};

const handleSave = (): void => {
  // 清空现有指示灯
  statusStore.settings.indicators.splice(0);

  // 添加配置的指示灯
  localIndicators.value.forEach((indicator) => {
    if (indicator.groupId > 0 && indicator.dataItemId > 0 && indicator.valueMappings.length > 0) {
      if (indicator.id.startsWith('temp_')) {
        // 新增的指示灯
        statusStore.addIndicator({
          label: indicator.label,
          groupId: indicator.groupId,
          dataItemId: indicator.dataItemId,
          valueMappings: indicator.valueMappings.filter((mapping) => mapping.value.trim() !== ''),
          defaultColor: indicator.defaultColor,
        });
      } else {
        // 现有指示灯的更新
        statusStore.settings.indicators.push({
          ...indicator,
          valueMappings: indicator.valueMappings.filter((mapping) => mapping.value.trim() !== ''),
        });
      }
    }
  });

  isOpen.value = false;
};

const handleCancel = (): void => {
  isOpen.value = false;
};
</script>

<style scoped>
/* 工业主题样式已通过预定义CSS类应用 */
</style>
