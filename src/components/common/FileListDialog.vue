<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useFileStorage } from '../../stores/common/fileStorageStore';
import type { FileRecord } from '../../types/files';
import { filesAPI } from '../../api/common';
import type { QTableColumn } from 'quasar';

const props = defineProps<{
  title: string;
  isOpen: boolean;
  storageDir: string;
  operation: 'import' | 'export';
}>();

const emit = defineEmits<{
  select: [file: FileRecord];
  create: [name: string];
  close: [];
}>();

const fileStorage = useFileStorage();
const searchText = ref('');
const newFileName = ref('');
const isLoading = ref(true);
const showDeleteConfirm = ref(false);
const fileToDelete = ref<FileRecord | null>(null);

onMounted(async () => {
  if (props.isOpen) {
    isLoading.value = true;
    await fileStorage.loadFileRecords(props.storageDir);
    isLoading.value = false;
  }
});

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      isLoading.value = true;
      await fileStorage.loadFileRecords(props.storageDir);
      isLoading.value = false;
    } else {
      // 关闭对话框时重置状态
      searchText.value = '';
      newFileName.value = '';
    }
  },
);

const filteredRecords = computed(() => {
  if (!searchText.value) return fileStorage.fileRecords;

  const search = searchText.value.toLowerCase();
  return fileStorage.fileRecords.filter((record) => record.name.toLowerCase().includes(search));
});

const handleSelect = (file: FileRecord) => {
  emit('select', file);
};

const handleCreate = () => {
  if (!newFileName.value.trim()) return;
  emit('create', newFileName.value.trim());
  newFileName.value = '';
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const confirmDelete = (file: FileRecord, event: Event) => {
  event.stopPropagation(); // 阻止点击事件冒泡导致选择文件
  fileToDelete.value = file;
  showDeleteConfirm.value = true;
};

const cancelDelete = () => {
  showDeleteConfirm.value = false;
  fileToDelete.value = null;
};

const executeDelete = async () => {
  if (!fileToDelete.value?.path) {
    showDeleteConfirm.value = false;
    return;
  }

  try {
    isLoading.value = true;
    const result = await filesAPI.deleteFile(fileToDelete.value.path);
    if (result.success) {
      // 删除成功后刷新文件列表
      await fileStorage.loadFileRecords(props.storageDir);
    }
  } catch (error) {
    console.error('删除文件失败:', error);
  } finally {
    showDeleteConfirm.value = false;
    fileToDelete.value = null;
    isLoading.value = false;
  }
};

// q-table 列定义
const columns: QTableColumn[] = [
  {
    name: 'index',
    label: '#',
    field: 'index',
    align: 'left',
    sortable: false,
    style: 'width: 50px',
    headerStyle: 'width: 50px',
  },
  {
    name: 'name',
    label: '文件名称',
    field: 'name',
    align: 'left',
    sortable: true,
    style: 'min-width: 200px',
  },
  {
    name: 'createTime',
    label: '创建时间',
    field: 'createTime',
    align: 'left',
    sortable: true,
    style: 'width: 180px',
    format: (val: string) => formatDate(val),
  },
  {
    name: 'lastModified',
    label: '最后修改',
    field: 'lastModified',
    align: 'left',
    sortable: true,
    style: 'width: 180px',
    format: (val: string) => formatDate(val),
  },
  {
    name: 'actions',
    label: '操作',
    field: 'actions',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
    headerStyle: 'width: 80px',
  },
];

// 添加行序号
const tableData = computed(() => {
  return filteredRecords.value.map((record, index) => ({
    ...record,
    index: index + 1,
  }));
});

// 使用 computed 来代理 isOpen，支持 q-dialog 的 v-model
const dialogModel = computed({
  get: () => props.isOpen,
  set: (value: boolean) => {
    if (!value) {
      emit('close');
    }
  },
});
</script>

<template>
  <q-dialog v-model="dialogModel">
    <q-card class="file-dialog-card">
      <!-- 对话框标题栏 -->
      <q-card-section class="dialog-header">
        <div class="text-base font-medium flex items-center gap-2" style="color: #ffffff;">
          <q-icon :name="props.operation === 'import' ? 'folder_open' : 'save'" color="blue-4" size="sm" />
          <span>{{ title }}</span>
        </div>
      </q-card-section>

      <!-- 对话框内容区域 -->
      <q-card-section class="q-pt-md">
        <!-- 搜索输入框 -->
        <q-input v-model="searchText" placeholder="搜索文件..." dense outlined clearable class="q-mb-md file-search-input">
          <template v-slot:prepend>
            <q-icon name="search" color="grey-6" />
          </template>
        </q-input>

        <!-- 文件列表表格 -->
        <q-table :rows="tableData" :columns="columns" row-key="id" :loading="isLoading" :rows-per-page-options="[0]"
          hide-pagination flat bordered dense dark class="file-table" virtual-scroll
          :virtual-scroll-sticky-size-start="48" style="max-height: 60vh">
          <!-- 序号列 -->
          <template v-slot:body-cell-index="props">
            <q-td :props="props">
              <span class="font-mono text-sm" style="color: #ffcb6b;">{{ props.value }}</span>
            </q-td>
          </template>

          <!-- 文件名列 -->
          <template v-slot:body-cell-name="props">
            <q-td :props="props" class="cursor-pointer" @click="handleSelect(props.row)">
              <div class="flex items-center gap-2">
                <q-icon name="description" color="blue-4" size="xs" />
                <span class="text-sm" style="color: #ffffff;">{{ props.value }}</span>
              </div>
            </q-td>
          </template>

          <!-- 创建时间列 -->
          <template v-slot:body-cell-createTime="props">
            <q-td :props="props" class="cursor-pointer" @click="handleSelect(props.row)">
              <span class="text-sm" style="color: #94a3b8;">{{ props.value }}</span>
            </q-td>
          </template>

          <!-- 最后修改列 -->
          <template v-slot:body-cell-lastModified="props">
            <q-td :props="props" class="cursor-pointer" @click="handleSelect(props.row)">
              <span class="text-sm" style="color: #94a3b8;">{{ props.value }}</span>
            </q-td>
          </template>

          <!-- 操作列 -->
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense round icon="delete" color="red-5" size="sm"
                @click.stop="confirmDelete(props.row, $event)">
                <q-tooltip>删除文件</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <!-- 加载中提示 -->
          <template v-slot:loading>
            <q-inner-loading showing color="blue-4">
              <div class="text-industrial-secondary">加载中...</div>
            </q-inner-loading>
          </template>

          <!-- 无数据提示 -->
          <template v-slot:no-data>
            <div class="full-width row flex-center q-gutter-sm text-industrial-secondary">
              <q-icon name="folder_open" size="sm" />
              <span>没有找到匹配的文件</span>
            </div>
          </template>
        </q-table>

        <!-- 导出模式下的新建文件输入区域 -->
        <div v-if="operation === 'export'" class="q-mt-md">
          <div class="flex items-center gap-2">
            <q-input v-model="newFileName" placeholder="输入文件名" dense outlined class="flex-1 file-name-input"
              @keyup.enter="handleCreate">
              <template v-slot:prepend>
                <q-icon name="description" color="grey-6" />
              </template>
            </q-input>
            <q-btn label="保存" color="primary" unelevated :disable="!newFileName.trim()" @click="handleCreate"
              class="btn-save" />
          </div>
        </div>
      </q-card-section>

      <!-- 对话框底部操作栏 -->
      <q-card-actions align="right" class="dialog-footer">
        <q-btn label="取消" flat @click="emit('close')" class="btn-industrial-secondary" />
        <q-btn v-if="operation === 'import' && filteredRecords.length > 0" label="选择" unelevated
          @click="filteredRecords.length > 0 && handleSelect(filteredRecords[0]!)" class="btn-industrial-primary" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- 删除确认对话框 -->
  <q-dialog v-model="showDeleteConfirm" persistent>
    <q-card class="delete-confirm-card" style="min-width: 400px">
      <q-card-section class="dialog-header">
        <div class="text-base font-medium flex items-center gap-2" style="color: #ffffff;">
          <q-icon name="warning" color="red-5" size="sm" />
          <span>确认删除</span>
        </div>
      </q-card-section>

      <q-card-section style="color: #94a3b8; background-color: #0d1117;">
        确定要删除文件
        <span class="font-medium" style="color: #ffffff;">{{ fileToDelete?.name }}</span>
        吗？此操作不可恢复。
      </q-card-section>

      <!-- 对话框底部 -->
      <q-card-actions class="bg-industrial-secondary border-t border-industrial justify-end gap-2 p-4">
        <q-btn flat label="取消" class="btn-industrial-secondary" @click="cancelDelete" />
        <q-btn label="删除" unelevated @click="executeDelete" class="btn-industrial-primary" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.file-dialog-card {
  min-width: 800px;
  max-width: 60vw;
}

.dialog-header {
  background-color: #1a1e2e;
  border-bottom: 1px solid #2a2f45;
  padding: 12px 16px;
}

.dialog-footer {
  background-color: #131725;
  border-top: 1px solid #2a2f45;
  padding: 12px 16px;
}

.delete-confirm-card {
  background-color: #0d1117;
  border: 1px solid #2a2f45;
}
</style>
