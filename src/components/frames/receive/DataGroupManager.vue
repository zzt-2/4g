<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/receiveFrames';
import type { DataGroup, DataItem } from '../../../types/frames/receive';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const showAddDialog = ref<boolean>(false);
const showEditDialog = ref<boolean>(false);
const newGroupLabel = ref<string>('');
const editingGroup = ref<DataGroup | null>(null);

// 计算属性：所有分组
const groups = computed(() => receiveFramesStore.groups);

// 计算属性：选中分组
const selectedGroup = computed(() => receiveFramesStore.selectedGroup);

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

// 方法：获取分组统计信息
const getGroupStats = (group: DataGroup) => {
  const totalItems = group.dataItems.length;
  const visibleItems = group.dataItems.filter((item: DataItem) => item.isVisible).length;
  return { totalItems, visibleItems };
};
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-secondary">
    <!-- 标题栏 -->
    <div class="p-4 border-b border-industrial">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-industrial-primary text-lg font-medium">数据分组管理</h3>
        <q-btn flat dense size="sm" icon="add" color="blue" @click="showAddDialog = true">
          <q-tooltip>添加分组</q-tooltip>
        </q-btn>
      </div>

      <div class="text-sm text-industrial-secondary">
        <span>{{ groups.length }} 个分组</span>
        <span v-if="selectedGroup" class="ml-2"> • 已选择: {{ selectedGroup.label }} </span>
      </div>
    </div>

    <!-- 分组列表 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 无分组时的提示 -->
      <div v-if="groups.length === 0" class="p-4 text-center text-industrial-secondary">
        <q-icon name="folder_open" size="24px" class="mb-2" />
        <p>暂无数据分组</p>
        <p class="text-xs mt-1">点击右上角按钮添加分组</p>
      </div>

      <!-- 分组列表 -->
      <div v-else class="space-y-2 p-3">
        <div
          v-for="group in groups"
          :key="group.id"
          class="rounded-lg p-3 cursor-pointer transition-colors duration-200"
          :class="{
            'bg-industrial-highlight border border-blue-500': isSelected(group),
            'bg-industrial-panel hover:bg-industrial-highlight': !isSelected(group),
          }"
          @click="selectGroup(group)"
        >
          <!-- 分组头部 -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <q-icon name="folder" :color="isSelected(group) ? 'blue' : 'grey-5'" size="16px" />

              <span class="text-industrial-primary font-medium text-sm">
                {{ group.label }}
              </span>

              <span class="text-industrial-id text-xs font-mono"> #{{ group.id }} </span>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center space-x-1" @click.stop>
              <q-btn flat dense size="sm" icon="edit" color="blue" @click="editGroup(group)">
                <q-tooltip>编辑分组</q-tooltip>
              </q-btn>

              <q-btn flat dense size="sm" icon="delete" color="red" @click="deleteGroup(group)">
                <q-tooltip>删除分组</q-tooltip>
              </q-btn>
            </div>
          </div>

          <!-- 分组统计 -->
          <div class="text-xs text-industrial-secondary">
            <div class="flex items-center justify-between">
              <span> {{ getGroupStats(group).totalItems }} 个数据项 </span>
              <span> {{ getGroupStats(group).visibleItems }} 个可见 </span>
            </div>
          </div>

          <!-- 数据项预览 -->
          <div
            v-if="group.dataItems.length > 0"
            class="mt-2 pt-2 border-t border-industrial-primary/20"
          >
            <div class="flex flex-wrap gap-1">
              <span
                v-for="item in group.dataItems.slice(0, 3)"
                :key="item.id"
                class="inline-block px-2 py-1 rounded text-xs"
                :class="{
                  'bg-blue-500/20 text-blue-300': item.isVisible,
                  'bg-grey-500/20 text-grey-400': !item.isVisible,
                }"
              >
                {{ item.label }}
              </span>

              <span
                v-if="group.dataItems.length > 3"
                class="inline-block px-2 py-1 rounded text-xs bg-grey-500/20 text-grey-400"
              >
                +{{ group.dataItems.length - 3 }}
              </span>
            </div>
          </div>

          <!-- 选中指示器 -->
          <div v-if="isSelected(group)" class="mt-2 flex items-center justify-center">
            <q-icon name="check_circle" color="blue" size="16px" />
          </div>
        </div>
      </div>
    </div>

    <!-- 底部统计信息 -->
    <div class="p-3 border-t border-industrial bg-industrial-panel">
      <div class="text-xs text-industrial-secondary text-center">
        <div v-if="selectedGroup">
          当前分组: {{ selectedGroup.label }} ({{ selectedGroup.dataItems.length }} 项)
        </div>
        <div v-else>请选择一个分组进行管理</div>
      </div>
    </div>
  </div>

  <!-- 添加分组对话框 -->
  <q-dialog v-model="showAddDialog" persistent>
    <q-card class="bg-industrial-panel" style="min-width: 350px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">添加数据分组</div>
      </q-card-section>

      <q-card-section class="space-y-4">
        <q-input
          v-model="newGroupLabel"
          label="分组名称"
          outlined
          dense
          bg-color="industrial-secondary"
          color="blue"
          class="text-industrial-primary"
          autofocus
          @keyup.enter="addGroup"
        />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="cancelAdd" />
        <q-btn flat label="添加" color="blue" :disable="!newGroupLabel.trim()" @click="addGroup" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- 编辑分组对话框 -->
  <q-dialog v-model="showEditDialog" persistent>
    <q-card class="bg-industrial-panel" style="min-width: 350px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">编辑数据分组</div>
      </q-card-section>

      <q-card-section v-if="editingGroup" class="space-y-4">
        <q-input
          v-model="editingGroup.label"
          label="分组名称"
          outlined
          dense
          bg-color="industrial-secondary"
          color="blue"
          class="text-industrial-primary"
          autofocus
        />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="cancelEdit" />
        <q-btn
          flat
          label="保存"
          color="blue"
          :disable="!editingGroup?.label?.trim()"
          @click="saveEdit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
