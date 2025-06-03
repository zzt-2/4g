<script setup lang="ts">
import { ref, computed } from 'vue';
import { useReceiveFramesStore } from '../../../stores/receiveFrames';
import type { DataItem, FrameFieldMapping } from '../../../types/frames/receive';
import type { Frame } from '../../../types/frames/frames';

// Store
const receiveFramesStore = useReceiveFramesStore();

// 本地状态
const editingItem = ref<DataItem | null>(null);
const showEditDialog = ref<boolean>(false);

// 计算属性：选中帧信息
const selectedFrame = computed((): Frame | undefined => {
  if (!receiveFramesStore.selectedFrameId) return undefined;
  return receiveFramesStore.receiveFrames.find(
    (frame: Frame) => frame.id === receiveFramesStore.selectedFrameId,
  );
});

// 计算属性：选中帧的数据项
const frameDataItems = computed(() => {
  return receiveFramesStore.selectedFrameDataItems;
});

// 方法：编辑数据项
const editDataItem = (item: DataItem): void => {
  editingItem.value = { ...item };
  showEditDialog.value = true;
};

// 方法：删除数据项映射
const removeDataItemMapping = (mapping: FrameFieldMapping): void => {
  if (!confirm('确定要删除这个数据项映射吗？')) return;

  receiveFramesStore.removeMapping(
    mapping.frameId,
    mapping.fieldId,
    mapping.groupId,
    mapping.dataItemId,
  );
};

// 方法：保存编辑
const saveEdit = (): void => {
  if (!editingItem.value) return;

  // 找到对应的映射关系来获取分组ID
  const mapping = frameDataItems.value.find(
    (item) => item.dataItem?.id === editingItem.value?.id,
  )?.mapping;

  if (!mapping) return;

  receiveFramesStore.updateDataItem(mapping.groupId, editingItem.value.id, editingItem.value);

  showEditDialog.value = false;
  editingItem.value = null;
};

// 方法：取消编辑
const cancelEdit = (): void => {
  showEditDialog.value = false;
  editingItem.value = null;
};

// 方法：切换可见性
const toggleVisibility = (item: DataItem): void => {
  // 找到对应的映射关系来获取分组ID
  const mapping = frameDataItems.value.find(
    (frameItem) => frameItem.dataItem?.id === item.id,
  )?.mapping;

  if (!mapping) return;

  receiveFramesStore.toggleDataItemVisibility(mapping.groupId, item.id);
};

// 方法：获取字段信息
const getFieldInfo = (mapping: FrameFieldMapping) => {
  if (!selectedFrame.value) return null;
  return selectedFrame.value.fields.find((f) => f.id === mapping.fieldId);
};

// 方法：检查数据项是否有验证错误
const hasValidationError = (item: any): boolean => {
  // 检查映射关系是否有效
  const mapping = item.mapping;
  const dataItem = item.dataItem;
  const group = item.group;

  // 检查分组是否存在
  if (!group) return true;

  // 检查数据项是否存在
  if (!dataItem) return true;

  // 检查字段是否存在
  const field = getFieldInfo(mapping);
  if (!field) return true;

  // 检查数据类型是否匹配
  if (dataItem.dataType !== field.dataType) return true;

  return false;
};
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-panel">
    <!-- 标题栏 -->
    <div class="p-4 border-b border-industrial">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-industrial-primary text-lg font-medium">数据项列表</h3>
        <div class="text-xs text-industrial-secondary">
          <span v-if="selectedFrame">{{ selectedFrame.name }}</span>
          <span v-else>未选择帧</span>
        </div>
      </div>

      <div v-if="selectedFrame" class="text-sm text-industrial-secondary">
        <span>{{ frameDataItems.length }} 个关联数据项</span>
      </div>
    </div>

    <!-- 数据项列表 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 未选择帧时的提示 -->
      <div v-if="!selectedFrame" class="p-4 text-center text-industrial-secondary">
        <q-icon name="info" size="24px" class="mb-2" />
        <p>请先选择一个接收帧</p>
      </div>

      <!-- 无数据项时的提示 -->
      <div
        v-else-if="frameDataItems.length === 0"
        class="p-4 text-center text-industrial-secondary"
      >
        <q-icon name="inbox" size="24px" class="mb-2" />
        <p>该帧暂无关联的数据项</p>
        <p class="text-xs mt-1">请在分组管理中添加数据项映射</p>
      </div>

      <!-- 数据项列表 -->
      <div v-else class="space-y-2 p-3">
        <div
          v-for="(item, index) in frameDataItems"
          :key="`${item.mapping.groupId}-${item.mapping.dataItemId}`"
          class="rounded-lg p-3 transition-colors"
          :class="{
            'bg-industrial-secondary border border-industrial hover:border-blue-500':
              !hasValidationError(item),
            'bg-red-500/10 border border-red-500/50 hover:border-red-500': hasValidationError(item),
          }"
        >
          <!-- 数据项头部 -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <!-- 可见性切换 -->
              <q-btn
                flat
                dense
                size="sm"
                :icon="item.dataItem?.isVisible ? 'visibility' : 'visibility_off'"
                :color="item.dataItem?.isVisible ? 'blue' : 'grey'"
                @click="toggleVisibility(item.dataItem!)"
              />

              <!-- 数据项标签 -->
              <span
                class="font-medium text-sm"
                :class="hasValidationError(item) ? 'text-red-400' : 'text-industrial-primary'"
              >
                {{ item.dataItem?.label || '未命名数据项' }}
              </span>

              <!-- 数据项ID -->
              <span
                class="text-xs font-mono"
                :class="hasValidationError(item) ? 'text-red-300' : 'text-industrial-id'"
              >
                #{{ item.dataItem?.id }}
              </span>

              <!-- 验证错误指示器 -->
              <q-icon v-if="hasValidationError(item)" name="error" color="red" size="14px" />
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center space-x-1">
              <q-btn
                flat
                dense
                size="sm"
                icon="edit"
                color="blue"
                @click="editDataItem(item.dataItem!)"
              >
                <q-tooltip>编辑数据项</q-tooltip>
              </q-btn>

              <q-btn
                flat
                dense
                size="sm"
                icon="delete"
                color="red"
                @click="removeDataItemMapping(item.mapping)"
              >
                <q-tooltip>删除映射</q-tooltip>
              </q-btn>
            </div>
          </div>

          <!-- 映射信息 -->
          <div class="grid grid-cols-2 gap-3 text-xs">
            <!-- 字段信息 -->
            <div class="space-y-1">
              <div class="text-industrial-secondary">映射字段:</div>
              <div class="text-industrial-primary">
                {{ getFieldInfo(item.mapping)?.name || item.mapping.fieldName }}
              </div>
              <div class="text-industrial-tertiary">
                {{ getFieldInfo(item.mapping)?.dataType || 'unknown' }}
              </div>
            </div>

            <!-- 分组信息 -->
            <div class="space-y-1">
              <div class="text-industrial-secondary">所属分组:</div>
              <div class="text-industrial-primary">
                {{ item.group?.label || '未知分组' }}
              </div>
              <div class="text-industrial-tertiary">分组 #{{ item.mapping.groupId }}</div>
            </div>
          </div>

          <!-- 数据类型和值信息 -->
          <div class="mt-2 pt-2 border-t border-industrial-primary/20">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center space-x-3">
                <span class="text-industrial-secondary">
                  类型: <span class="text-industrial-primary">{{ item.dataItem?.dataType }}</span>
                </span>

                <span class="text-industrial-secondary">
                  标签:
                  <span class="text-industrial-primary">{{
                    item.dataItem?.useLabel ? '启用' : '禁用'
                  }}</span>
                </span>
              </div>

              <div class="text-industrial-secondary">
                当前值:
                <span class="text-industrial-primary">{{
                  item.dataItem?.displayValue || '-'
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div
      v-if="selectedFrame && frameDataItems.length > 0"
      class="p-3 border-t border-industrial bg-industrial-secondary"
    >
      <div class="flex items-center justify-between text-xs text-industrial-secondary">
        <span>拖拽可调整顺序</span>
        <div class="flex items-center space-x-2">
          <span>{{ frameDataItems.filter((item) => item.dataItem?.isVisible).length }} 个可见</span>
          <span>•</span>
          <span>{{ frameDataItems.length }} 个总计</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 编辑对话框 -->
  <q-dialog v-model="showEditDialog" persistent>
    <q-card class="bg-industrial-panel" style="min-width: 400px">
      <q-card-section class="bg-industrial-secondary">
        <div class="text-lg text-industrial-primary">编辑数据项</div>
      </q-card-section>

      <q-card-section v-if="editingItem" class="space-y-4">
        <!-- 标签 -->
        <q-input
          v-model="editingItem.label"
          label="数据项标签"
          outlined
          dense
          bg-color="industrial-secondary"
          color="blue"
          class="text-industrial-primary"
        />

        <!-- 数据类型 -->
        <q-select
          v-model="editingItem.dataType"
          :options="[
            { label: '8位无符号整数', value: 'uint8' },
            { label: '16位无符号整数', value: 'uint16' },
            { label: '32位无符号整数', value: 'uint32' },
            { label: '32位浮点数', value: 'float' },
            { label: '字节数组', value: 'bytes' },
          ]"
          label="数据类型"
          outlined
          dense
          emit-value
          map-options
          bg-color="industrial-secondary"
          color="blue"
        />

        <!-- 可见性 -->
        <q-checkbox
          v-model="editingItem.isVisible"
          label="在显示页面中可见"
          color="blue"
          class="text-industrial-primary"
        />

        <!-- 使用标签 -->
        <q-checkbox
          v-model="editingItem.useLabel"
          label="使用标签显示值"
          color="blue"
          class="text-industrial-primary"
        />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn flat label="取消" color="grey" @click="cancelEdit" />
        <q-btn flat label="保存" color="blue" @click="saveEdit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
