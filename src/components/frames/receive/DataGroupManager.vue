<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/frames/receiveFramesStore';
import type { DataGroup } from '../../../types/frames/receive';
import type { ContentMode } from '../../../types/frames/receive';

// 定义 props 和 emits
defineProps<{
  contentMode: ContentMode;
}>();

const emit = defineEmits<{
  'toggle-mode': [mode: ContentMode];
}>();

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const showAddDialog = ref<boolean>(false);
const showEditDialog = ref<boolean>(false);
const newGroupLabel = ref<string>('');
const editingGroup = ref<DataGroup | null>(null);

// 计算属性：所有分组
const groups = computed(() => receiveFramesStore.groups);

// 方法：选择分组
const selectGroup = (group: DataGroup): void => {
  receiveFramesStore.selectGroup(group.id);
};

// 方法：检查是否为选中分组
const isSelected = (group: DataGroup): boolean => {
  return receiveFramesStore.selectedGroupId === group.id;
};

// 方法：添加新分组
const addGroup = (): void => {
  if (!newGroupLabel.value.trim()) return;

  receiveFramesStore.addGroup(newGroupLabel.value.trim());
  newGroupLabel.value = '';
  showAddDialog.value = false;
};

// 方法：编辑分组
const editGroup = (group: DataGroup): void => {
  editingGroup.value = { ...group };
  showEditDialog.value = true;
};

// 方法：保存编辑
const saveEdit = (): void => {
  if (!editingGroup.value) return;

  receiveFramesStore.updateGroup(editingGroup.value.id, {
    label: editingGroup.value.label,
  });

  showEditDialog.value = false;
  editingGroup.value = null;
};

// 方法：删除分组
const deleteGroup = (group: DataGroup): void => {
  if (group.dataItems.length > 0) {
    // 有数据项时需要确认
    if (!confirm(`分组"${group.label}"包含 ${group.dataItems.length} 个数据项，确定要删除吗？`)) {
      return;
    }
  }

  receiveFramesStore.removeGroup(group.id);
};

// 方法：取消编辑
const cancelEdit = (): void => {
  showEditDialog.value = false;
  editingGroup.value = null;
};

// 方法：取消添加
const cancelAdd = (): void => {
  showAddDialog.value = false;
  newGroupLabel.value = '';
};

// 方法：切换内容模式
const toggleContentMode = (mode: ContentMode): void => {
  emit('toggle-mode', mode);
};

// 方法：清理孤立数据项
const cleanupOrphanedDataItems = (): void => {
  // 先检查有多少孤立数据项
  const orphanedItems = receiveFramesStore.findOrphanedDataItems();

  if (orphanedItems.length === 0) {
    alert('没有发现孤立的数据项。');
    return;
  }

  // 显示确认对话框
  const itemsList = orphanedItems
    .map((item) => `• ${item.groupLabel} - ${item.dataItem.label}`)
    .join('\n');

  const confirmMessage = `发现 ${orphanedItems.length} 个没有对应接收帧的孤立数据项：\n\n${itemsList}\n\n确定要删除这些数据项吗？`;

  if (!confirm(confirmMessage)) {
    return;
  }

  // 执行清理
  const result = receiveFramesStore.removeOrphanedDataItems();

  if (result.removedCount > 0) {
    const removedList = result.removedItems
      .map((item) => `• ${item.groupLabel} - ${item.dataItemLabel}`)
      .join('\n');

    alert(`成功删除 ${result.removedCount} 个孤立数据项：\n\n${removedList}`);
  } else {
    alert('没有删除任何数据项。');
  }
};
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-secondary min-w-[240px] max-w-[240px]">
    <!-- 标题栏 -->
    <div
      class="flex justify-between items-center p-3 border-b border-industrial bg-industrial-table-header"
    >
      <h6
        class="m-0 text-sm font-medium uppercase tracking-wider text-industrial-primary flex items-center"
      >
        <q-icon name="folder" size="xs" class="mr-1 text-blue-5" />
        数据分组
      </h6>

      <div class="flex items-center space-x-2">
        <!-- 清理孤立数据项按钮 -->
        <q-btn
          v-if="contentMode === 'display'"
          flat
          dense
          size="sm"
          icon="cleaning_services"
          color="orange"
          class="text-xs"
          @click="cleanupOrphanedDataItems"
        >
          <q-tooltip class="bg-industrial-panel text-industrial-primary">
            清理没有对应接收帧的孤立数据项
          </q-tooltip>
        </q-btn>

        <!-- 编辑/显示模式切换按钮 -->
        <div class="flex bg-industrial-secondary rounded">
          <q-btn
            flat
            dense
            size="sm"
            :color="contentMode === 'edit' ? 'blue' : 'grey'"
            label="编辑"
            class="text-xs px-3 py-1"
            @click="toggleContentMode('edit')"
          />
          <q-btn
            flat
            dense
            size="sm"
            :color="contentMode === 'display' ? 'blue' : 'grey'"
            label="显示"
            class="text-xs px-3 py-1"
            @click="toggleContentMode('display')"
          />
        </div>
      </div>
    </div>

    <!-- 分组列表 - 表格形式 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 无分组时的提示 -->
      <div v-if="groups.length === 0" class="p-4 text-center text-industrial-secondary">
        <q-icon name="folder_open" size="24px" class="mb-2" />
        <p>暂无数据分组</p>
        <p v-if="contentMode === 'display'" class="text-xs mt-1">点击下方按钮添加分组</p>
      </div>

      <!-- 分组表格 -->
      <div v-else class="divide-y divide-industrial">
        <div
          v-for="group in groups"
          :key="group.id"
          class="px-3 py-2 cursor-pointer transition-colors duration-200 hover:bg-industrial-highlight relative group"
          :class="{
            'bg-blue-800 bg-opacity-30 border-l-4 border-l-blue-500 pl-2': isSelected(group),
          }"
          @click="selectGroup(group)"
          @dblclick="editGroup(group)"
        >
          <!-- 分组名称 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 min-w-0 flex-1">
              <q-icon name="folder" :color="isSelected(group) ? 'blue' : 'grey-5'" size="14px" />
              <span
                class="text-industrial-primary text-sm font-medium truncate"
                :title="group.label"
              >
                {{ group.label }}
              </span>
            </div>

            <!-- 操作按钮（编辑模式下显示） -->
            <div
              v-if="contentMode === 'display'"
              class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <q-btn
                flat
                dense
                size="xs"
                icon="edit"
                color="blue"
                class="text-xs"
                @click.stop="editGroup(group)"
              />
              <q-btn
                flat
                dense
                size="xs"
                icon="delete"
                color="red"
                class="text-xs"
                @click.stop="deleteGroup(group)"
              />
            </div>

            <!-- 数据项数量（仅在编辑模式且不悬停时显示） -->
            <div v-if="contentMode === 'display'" class="flex-shrink-0 group-hover:hidden">
              <span class="text-industrial-secondary text-xs">
                {{ group.dataItems.filter((item) => item.isVisible).length }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部添加按钮区域 -->
    <div
      v-if="contentMode === 'display'"
      class="p-3 border-t border-industrial bg-industrial-panel"
    >
      <q-btn
        flat
        dense
        size="sm"
        icon="add"
        color="blue"
        label="添加分组"
        class="w-full text-xs"
        @click="showAddDialog = true"
      />
    </div>

    <!-- 添加分组对话框 -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card class="bg-industrial-panel" style="min-width: 300px">
        <q-card-section class="bg-industrial-table-header">
          <div class="text-h6 text-industrial-primary">添加数据分组</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-input
            v-model="newGroupLabel"
            autofocus
            label="分组名称"
            outlined
            class="bg-industrial-secondary text-industrial-primary"
            @keyup.enter="addGroup"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="grey" @click="cancelAdd" />
          <q-btn
            flat
            label="添加"
            color="blue"
            :disable="!newGroupLabel.trim()"
            @click="addGroup"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- 编辑分组对话框 -->
    <q-dialog v-model="showEditDialog" persistent>
      <q-card class="bg-industrial-panel" style="min-width: 300px">
        <q-card-section class="bg-industrial-table-header">
          <div class="text-h6 text-industrial-primary">编辑数据分组</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-input
            v-model="editingGroup!.label"
            autofocus
            label="分组名称"
            outlined
            class="bg-industrial-secondary text-industrial-primary"
            @keyup.enter="saveEdit"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="grey" @click="cancelEdit" />
          <q-btn
            flat
            label="保存"
            color="blue"
            :disable="!editingGroup?.label.trim()"
            @click="saveEdit"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
