<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNotify } from '@/shared/composables';
import type { StorageLocalService, StorageRecordQuery } from '@/features/storage-local-baseline';
import type { FileFacade } from '@/platform/files';

interface Props {
  modelValue: boolean;
  storageService: StorageLocalService;
  filesFacade: FileFacade;
  timeRange: { start: Date; end: Date };
  selectedItems: Set<string>;
  recordCount: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const notify = useNotify();
const loading = ref(false);

const fileName = ref(generateFileName());
const includeHeaders = ref(true);
const includeTimestamp = ref(true);
const timeFormat = ref('iso');
const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const TIME_FORMAT_OPTIONS = [
  { label: 'YYYY-MM-DD HH:mm:ss', value: 'iso' },
  { label: 'YYYY/MM/DD HH:mm:ss', value: 'slash' },
  { label: 'MM/DD/YYYY HH:mm:ss', value: 'us' },
  { label: 'DD.MM.YYYY HH:mm:ss', value: 'eu' },
  { label: 'ISO 8601', value: 'raw' },
  { label: 'Unix 时间戳', value: 'unix' },
] as const;

const selectedCount = computed(() => props.selectedItems.size);

function generateFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `history_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
}

async function exportCsv(): Promise<void> {
  if (props.selectedItems.size === 0) {
    notify.error('请先选择数据项');
    return;
  }

  loading.value = true;
  try {
    const channels = new Set<string>();
    const fieldKeys: string[] = [];
    for (const fieldId of props.selectedItems) {
      const [channel, key] = fieldId.split(':');
      channels.add(channel);
      fieldKeys.push(key);
    }

    const query: StorageRecordQuery = {
      from: props.timeRange.start.toISOString(),
      to: props.timeRange.end.toISOString(),
      fieldKeys,
    };

    const result = await props.storageService.createCsvFromLocalRecords({
      name: fileName.value,
      query,
    });

    if (!result.ok || !result.material) {
      notify.error('CSV 生成失败');
      return;
    }

    const path = await props.filesFacade.showSaveDialog({
      title: '保存 CSV 文件',
      defaultPath: fileName.value,
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
    });

    if (path) {
      await props.filesFacade.writeTextFile(path, result.material.content);
      notify.success(`已导出 ${result.material.recordCount} 条记录`);
    }

    show.value = false;
  } catch (err) {
    console.error('[CSVExportDialog] export error:', err);
    notify.error('导出失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="show" @hide="fileName = generateFileName()">
    <q-card class="rw-dialog-md">
      <q-card-section class="rw-divider-b">
        <div class="rw-text-value">导出 CSV</div>
      </q-card-section>
      <q-card-section class="q-gutter-md">
        <q-input v-model="fileName" dense outlined label="文件名" />
        <div class="flex gap-4">
          <q-toggle v-model="includeHeaders" label="包含列头" dense />
          <q-toggle v-model="includeTimestamp" label="包含时间戳" dense />
        </div>
        <q-select
          v-model="timeFormat"
          :options="TIME_FORMAT_OPTIONS"
          dense outlined
          emit-value map-options
          label="时间格式"
        />
        <div class="rw-text-desc text-xs">
          已选 {{ selectedCount }} 个数据项 · {{ recordCount }} 条记录
        </div>
      </q-card-section>
      <q-card-actions align="right" class="rw-divider-t">
        <q-btn flat no-caps label="取消" @click="show = false" />
        <q-btn color="primary" no-caps label="导出" :loading="loading" @click="exportCsv" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
