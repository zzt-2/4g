<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';

import { useHistoryAnalysisStore } from '../../stores/historyAnalysis';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatDateTime } from '../../utils/common/dateUtils';
import type { CSVExportConfig } from '../../types/storage/historyData';

// Props
interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'export-success': [filePath: string];
  'export-error': [error: string];
}>();

const $q = useQuasar();
const historyStore = useHistoryAnalysisStore();
const settingsStore = useSettingsStore();

// 本地状态
const fileName = ref('history_data');
const includeHeaders = ref(true);
const includeTimestamp = ref(true);
const usePresetPath = ref(true);
const dateFormat = ref('YYYY-MM-DD HH:mm:ss');
const isExporting = ref(false);

// 计算属性
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const timeRange = computed(() => historyStore.timeRange);
const selectedDataItems = computed(() =>
  historyStore.dataItemSelections.filter((item) => item.selected),
);
const filteredData = computed(() => historyStore.filteredData);

// 时间范围文本
const timeRangeText = computed(() => {
  const range = timeRange.value;
  return `${formatDateTime(range.startTime)} - ${formatDateTime(range.endTime)}`;
});

// 导出统计信息
const exportStats = computed(() => {
  const stats = {
    totalRecords: filteredData.value.length,
    selectedItems: selectedDataItems.value.length,
    estimatedFileSize: 0,
  };

  // 估算文件大小（粗略计算）
  if (stats.totalRecords > 0 && stats.selectedItems > 0) {
    // 每行大约：时间戳(20) + 数据项数量*10 + 分隔符
    const bytesPerRow = includeTimestamp.value ? 20 : 0;
    const dataBytes = stats.selectedItems * 10; // 每个数据项约10字节
    const separators = stats.selectedItems + (includeTimestamp.value ? 1 : 0);

    stats.estimatedFileSize = stats.totalRecords * (bytesPerRow + dataBytes + separators);

    if (includeHeaders.value) {
      stats.estimatedFileSize += 200; // 表头大约200字节
    }
  }

  return stats;
});

// 日期格式选项
const dateFormatOptions = [
  { label: 'YYYY-MM-DD HH:mm:ss', value: 'YYYY-MM-DD HH:mm:ss' },
  { label: 'YYYY/MM/DD HH:mm:ss', value: 'YYYY/MM/DD HH:mm:ss' },
  { label: 'MM/DD/YYYY HH:mm:ss', value: 'MM/DD/YYYY HH:mm:ss' },
  { label: 'DD.MM.YYYY HH:mm:ss', value: 'DD.MM.YYYY HH:mm:ss' },
  { label: 'ISO 8601', value: 'ISO' },
  { label: 'Unix 时间戳', value: 'UNIX' },
];

// 验证表单
const validateForm = (): boolean => {
  if (!fileName.value.trim()) {
    $q.notify({
      type: 'negative',
      message: '请输入文件名',
      position: 'top',
    });
    return false;
  }

  if (selectedDataItems.value.length === 0) {
    $q.notify({
      type: 'negative',
      message: '请先选择要导出的数据项',
      position: 'top',
    });
    return false;
  }

  if (filteredData.value.length === 0) {
    $q.notify({
      type: 'negative',
      message: '当前时间范围内没有数据',
      position: 'top',
    });
    return false;
  }

  return true;
};

// 执行导出
const executeExport = async (): Promise<void> => {
  if (!validateForm()) return;

  try {
    isExporting.value = true;

    // 构建导出配置
    const config: CSVExportConfig = {
      fileName: fileName.value.trim(),
      timeRange: timeRange.value,
      selectedItems: selectedDataItems.value,
      includeHeaders: includeHeaders.value,
      includeTimestamp: includeTimestamp.value,
      usePresetPath: usePresetPath.value,
      ...(usePresetPath.value && settingsStore.csvDefaultOutputPath
        ? { outputDirectory: settingsStore.csvDefaultOutputPath }
        : {}),
    };

    await historyStore.exportCSV(config);

    emit('export-success', '');
    isOpen.value = false;

    $q.notify({
      type: 'positive',
      message: 'CSV导出成功',
      caption: '文件已成功导出',
      position: 'top',
      timeout: 5000,
      actions: [
        {
          label: '打开文件夹',
          color: 'white',
          handler: () => {
            // 可以添加打开文件夹的功能
          },
        },
      ],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '导出失败';
    emit('export-error', errorMessage);

    $q.notify({
      type: 'negative',
      message: 'CSV导出失败',
      caption: errorMessage,
      position: 'top',
    });
  } finally {
    isExporting.value = false;
  }
};

// 生成建议的文件名
const generateSuggestedFileName = (): void => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');

  fileName.value = `history_data_${dateStr}_${timeStr}`;
};

// 监听对话框打开状态
watch(isOpen, (newValue) => {
  if (newValue) {
    // 对话框打开时生成建议文件名
    generateSuggestedFileName();
  }
});
</script>

<template>
  <q-dialog v-model="isOpen" persistent maximized-mobile class="csv-export-dialog">
    <q-card class="bg-industrial-panel border border-industrial w-full max-w-2xl">
      <!-- 对话框标题 -->
      <q-card-section class="bg-industrial-secondary border-b border-industrial">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <q-icon name="download" size="md" class="text-industrial-accent" />
            <div>
              <div class="text-industrial-primary text-lg font-medium">导出CSV文件</div>
              <div class="text-industrial-tertiary text-sm">将选中的历史数据导出为CSV格式</div>
            </div>
          </div>
          <q-btn
            flat
            dense
            round
            icon="close"
            class="text-industrial-secondary hover:bg-industrial-highlight"
            @click="isOpen = false"
          />
        </div>
      </q-card-section>

      <q-card-section>
        <!-- 导出概览 -->
        <div class="bg-industrial-secondary rounded p-4">
          <div class="grid grid-cols-5 gap-4 text-sm h-12">
            <div class="space-y-1 col-span-2">
              <div class="text-industrial-tertiary">时间范围</div>
              <div class="text-industrial-primary text-xs font-mono w-36">
                {{ timeRangeText }}
              </div>
            </div>
            <div class="space-y-1">
              <div class="text-industrial-tertiary">数据记录</div>
              <div class="text-industrial-primary">
                {{ exportStats.totalRecords.toLocaleString() }} 条
              </div>
            </div>
            <div class="space-y-1 col-span-2">
              <div class="text-industrial-tertiary">输出方式</div>
              <div class="text-industrial-primary text-xs">
                <div v-if="usePresetPath">
                  <div>预设路径</div>
                  <div class="text-industrial-tertiary text-2xs mt-1">
                    {{ settingsStore.csvDefaultOutputPath || 'data/exports/csv' }}
                  </div>
                </div>
                <div v-else>手动选择</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 文件设置 -->
        <div class="space-y-4">
          <h3 class="text-industrial-primary text-sm font-medium flex items-center gap-2">
            <q-icon name="settings" size="sm" />
            文件设置
          </h3>

          <!-- 文件名 -->
          <div class="space-y-2">
            <label class="text-industrial-secondary text-xs">文件名</label>
            <div class="flex gap-2">
              <q-input
                v-model="fileName"
                placeholder="请输入文件名"
                dense
                outlined
                class="flex-1"
                input-class="text-industrial-primary"
                :disable="isExporting"
              >
                <template #append>
                  <span class="text-industrial-tertiary text-xs">.csv</span>
                </template>
              </q-input>
              <q-btn
                flat
                dense
                icon="auto_awesome"
                class="text-industrial-accent hover:bg-industrial-highlight"
                :disable="isExporting"
                @click="generateSuggestedFileName"
              >
                <q-tooltip>生成建议文件名</q-tooltip>
              </q-btn>
            </div>
          </div>

          <!-- 导出选项 -->
          <div class="space-y-3">
            <label class="text-industrial-secondary text-xs">导出选项</label>
            <!-- 基本选项 -->
            <div class="flex space-x-2">
              <q-checkbox
                v-model="includeHeaders"
                label="包含表头"
                size="sm"
                class="text-industrial-primary"
                :disable="isExporting"
              />
              <q-checkbox
                v-model="includeTimestamp"
                label="包含时间戳"
                size="sm"
                class="text-industrial-primary"
                :disable="isExporting"
              />
              <q-checkbox
                v-model="usePresetPath"
                label="使用预设路径"
                size="sm"
                class="text-industrial-primary"
                :disable="isExporting"
              />
            </div>
          </div>

          <!-- 时间格式 -->
          <div v-if="includeTimestamp" class="space-y-2">
            <label class="text-industrial-secondary text-xs">时间格式</label>
            <q-select
              v-model="dateFormat"
              :options="dateFormatOptions"
              option-label="label"
              option-value="value"
              emit-value
              map-options
              dense
              outlined
              class="text-xs"
              input-class="text-industrial-primary"
              :disable="isExporting"
            />
          </div>
        </div>

        <!-- 数据项预览 -->
        <div class="space-y-4">
          <h3 class="text-industrial-primary text-sm font-medium flex items-center gap-2 mt-4 mb-1">
            <q-icon name="preview" size="sm" />
            数据项预览 ({{ selectedDataItems.length }})
          </h3>

          <div class="max-h-60 overflow-y-auto space-y-1">
            <div
              v-for="item in selectedDataItems"
              :key="`${item.groupId}-${item.dataItemId}`"
              class="flex items-center gap-2 p-2 bg-industrial-highlight rounded text-xs"
            >
              <div class="w-3 h-3 rounded-full bg-industrial-accent"></div>
              <span class="text-industrial-primary">
                {{ historyStore.getDataItemLabel(item.groupId, item.dataItemId) }}
              </span>
            </div>

            <div
              v-if="selectedDataItems.length === 0"
              class="text-center text-industrial-tertiary text-xs py-4"
            >
              暂未选择数据项
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- 对话框操作 -->
      <q-card-actions class="bg-industrial-secondary border-t border-industrial justify-end gap-2">
        <q-btn
          flat
          label="取消"
          class="text-industrial-secondary hover:bg-industrial-highlight"
          :disable="isExporting"
          @click="isOpen = false"
        />
        <q-btn
          flat
          label="导出"
          icon="download"
          class="btn-industrial-primary"
          :loading="isExporting"
          :disable="selectedDataItems.length === 0 || filteredData.length === 0"
          @click="executeExport"
        >
          <template #loading>
            <q-spinner-hourglass class="mr-2" />
            导出中...
          </template>
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
/* 对话框样式 */
:deep(.q-dialog__inner) {
  padding: 16px;
}

:deep(.q-card) {
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
</style>
