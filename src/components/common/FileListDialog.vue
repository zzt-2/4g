<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useFileStorage } from '../../stores/common/fileStorageStore';
import type { FileRecord } from '../../types/files';
import { filesAPI } from '../../utils/electronApi';

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
  return new Date(dateString).toLocaleString('zh-CN');
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
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div
      class="bg-industrial-panel border border-industrial rounded-md w-full max-w-2xl shadow-lg"
      @click.stop
    >
      <!-- 对话框标题栏 -->
      <div
        class="p-3 border-b border-industrial flex justify-between items-center bg-industrial-secondary"
      >
        <h3 class="text-industrial-primary text-base font-medium flex items-center">
          <i class="q-icon material-icons mr-2 text-blue-400">{{
            props.operation === 'import' ? 'folder_open' : 'save'
          }}</i>
          {{ title }}
        </h3>
      </div>

      <!-- 对话框内容区域 -->
      <div class="p-4">
        <!-- 搜索输入框 -->
        <div
          class="flex items-center bg-industrial-secondary border border-industrial rounded mb-4 focus-within:border-blue-500"
        >
          <i class="q-icon material-icons mx-2 text-industrial-secondary">search</i>
          <input
            v-model="searchText"
            @input="console.log($event)"
            type="text"
            placeholder="搜索文件..."
            class="flex-1 bg-transparent border-0 outline-none p-2 text-industrial-primary"
          />
        </div>

        <!-- 文件列表 - 添加最大高度限制 -->
        <div class="border border-industrial rounded overflow-hidden mb-4">
          <div class="max-h-[40vh] overflow-y-auto">
            <table class="w-full text-sm border-collapse">
              <thead class="bg-industrial-table-header sticky top-0 z-10">
                <tr>
                  <th class="p-2 text-industrial-primary text-left font-medium">#</th>
                  <th class="p-2 text-industrial-primary text-left font-medium">文件名称</th>
                  <th class="p-2 text-industrial-primary text-left font-medium">创建时间</th>
                  <th class="p-2 text-industrial-primary text-left font-medium">最后修改</th>
                  <th class="p-2 text-industrial-primary text-center font-medium w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(record, index) in filteredRecords"
                  :key="record.id"
                  @click="handleSelect(record)"
                  class="border-t border-industrial hover:bg-industrial-highlight cursor-pointer"
                >
                  <td class="p-2 text-industrial-id">{{ index + 1 }}</td>
                  <td class="p-2 text-industrial-primary">{{ record.name }}</td>
                  <td class="p-2 text-industrial-secondary">{{ formatDate(record.createTime) }}</td>
                  <td class="p-2 text-industrial-secondary">
                    {{ formatDate(record.lastModified) }}
                  </td>
                  <td class="p-2 text-center">
                    <button
                      @click="confirmDelete(record, $event)"
                      class="btn-industrial-danger p-1 rounded"
                      title="删除文件"
                    >
                      <i class="q-icon material-icons text-sm">delete</i>
                    </button>
                  </td>
                </tr>
                <tr v-if="filteredRecords.length === 0 && !isLoading">
                  <td colspan="5" class="p-4 text-center text-industrial-secondary">
                    没有找到匹配的文件
                  </td>
                </tr>
                <tr v-if="isLoading">
                  <td colspan="5" class="p-4 text-center text-industrial-secondary">
                    <div class="flex justify-center items-center gap-2">
                      <span
                        class="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                      ></span>
                      加载中...
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 导出模式下的新建文件输入区域 -->
        <div v-if="operation === 'export'" class="mt-4">
          <div class="flex items-center gap-2">
            <div
              class="flex-1 flex items-center bg-industrial-secondary border border-industrial rounded focus-within:border-blue-500"
            >
              <i class="q-icon material-icons mx-2 text-industrial-secondary">description</i>
              <input
                v-model="newFileName"
                placeholder="输入文件名"
                class="flex-1 bg-transparent border-0 outline-none p-2 text-industrial-primary"
              />
            </div>
            <button
              @click="handleCreate"
              class="btn-industrial-primary px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!newFileName.trim()"
            >
              保存
            </button>
          </div>
        </div>
      </div>

      <!-- 对话框底部操作栏 -->
      <div class="p-3 border-t border-industrial flex justify-end gap-2 bg-industrial-primary">
        <button
          @click="emit('close')"
          class="btn-industrial-secondary px-4 py-2 rounded hover:bg-industrial-highlight"
        >
          取消
        </button>
        <button
          v-if="operation === 'import' && filteredRecords.length > 0"
          @click="filteredRecords.length > 0 && handleSelect(filteredRecords[0]!)"
          class="btn-industrial-primary px-4 py-2 rounded"
        >
          选择
        </button>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]"
      @click.self="cancelDelete"
    >
      <div class="bg-industrial-panel border border-industrial rounded-md w-full max-w-md p-5">
        <h3 class="text-industrial-primary text-base font-medium mb-4">确认删除</h3>
        <p class="text-industrial-secondary mb-6">
          确定要删除文件
          <span class="text-industrial-primary">{{ fileToDelete?.name }}</span> 吗？此操作不可恢复。
        </p>
        <div class="flex justify-end gap-3">
          <button @click="cancelDelete" class="btn-industrial-secondary px-4 py-2 rounded">
            取消
          </button>
          <button @click="executeDelete" class="btn-industrial-danger px-4 py-2 rounded">
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 确保输入框可以正常交互 */

/* .border-industrial {
  border-color: #2a2f45;
} */

.text-industrial-primary {
  color: #ffffff;
}

.text-industrial-secondary {
  color: #94a3b8;
}

.text-industrial-id {
  color: #ffcb6b;
}

.btn-industrial-primary {
  background-color: #3b82f6;
  color: #ffffff;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-industrial-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-industrial-secondary {
  background-color: #475569;
  color: #ffffff;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-industrial-secondary:hover {
  background-color: #334155;
}

.btn-industrial-danger {
  background-color: #ef4444;
  color: #ffffff;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-industrial-danger:hover {
  background-color: #dc2626;
}

/* 修复输入框样式 */
input {
  color: #ffffff !important;
  background-color: transparent !important;
  border: none !important;
  outline: none !important;
  width: 100%;
}

input::placeholder {
  color: #64748b !important;
}
</style>
