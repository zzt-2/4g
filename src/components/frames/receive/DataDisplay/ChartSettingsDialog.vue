<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';

const props = defineProps<{
  modelValue: boolean;
  groupId: number | null;
  selectedItems: number[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:selectedItems': [items: number[]];
}>();

const receiveFramesStore = useReceiveFramesStore();

// 本地选择状态
const localSelectedItems = ref<number[]>([...props.selectedItems]);

// 监听props变化，同步本地状态
watch(
  () => props.selectedItems,
  (newItems) => {
    localSelectedItems.value = [...newItems];
  },
  { immediate: true },
);

// 计算属性：当前分组的数据项
const currentGroupItems = computed(() => {
  if (!props.groupId) return [];
  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  return group?.dataItems.filter((item) => item.isVisible) || [];
});

// 处理对话框关闭
const handleClose = () => {
  emit('update:modelValue', false);
};

// 处理确认
const handleConfirm = () => {
  emit('update:selectedItems', [...localSelectedItems.value]);
  emit('update:modelValue', false);
};

// 处理取消
const handleCancel = () => {
  // 恢复原始选择
  localSelectedItems.value = [...props.selectedItems];
  emit('update:modelValue', false);
};

// 切换数据项选择
const toggleItem = (itemId: number) => {
  const index = localSelectedItems.value.indexOf(itemId);
  if (index > -1) {
    localSelectedItems.value.splice(index, 1);
  } else {
    localSelectedItems.value.push(itemId);
  }
};

// 全选
const selectAll = () => {
  localSelectedItems.value = currentGroupItems.value.map((item) => item.id);
};

// 清空选择
const clearAll = () => {
  localSelectedItems.value = [];
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    position="standard"
  >
    <q-card
      class="bg-industrial-panel border border-industrial"
      style="min-width: 400px; max-width: 600px"
    >
      <!-- 对话框标题 -->
      <q-card-section class="bg-industrial-table-header border-b border-industrial">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium text-industrial-primary flex items-center space-x-2">
            <i class="q-icon notranslate material-icons text-lg">tune</i>
            <span>图表数据项设置</span>
          </div>
          <button class="btn-industrial-secondary p-1 rounded" @click="handleClose">
            <i class="q-icon notranslate material-icons text-sm">close</i>
          </button>
        </div>
      </q-card-section>

      <!-- 对话框内容 -->
      <q-card-section class="p-4">
        <div v-if="!groupId" class="text-center text-industrial-secondary py-8">
          <i class="q-icon notranslate material-icons text-4xl opacity-50 mb-2">warning</i>
          <div class="text-sm">请先选择数据分组</div>
        </div>

        <div
          v-else-if="currentGroupItems.length === 0"
          class="text-center text-industrial-secondary py-8"
        >
          <i class="q-icon notranslate material-icons text-4xl opacity-50 mb-2">hourglass_empty</i>
          <div class="text-sm">当前分组暂无可见数据项</div>
        </div>

        <div v-else>
          <!-- 操作按钮 -->
          <div class="flex items-center justify-between mb-4">
            <div class="text-xs text-industrial-secondary">
              选择要在图表中显示的数据项 ({{ localSelectedItems.length }}/{{
                currentGroupItems.length
              }})
            </div>
            <div class="flex items-center space-x-2">
              <button class="btn-industrial-secondary px-2 py-1 text-xs rounded" @click="selectAll">
                全选
              </button>
              <button class="btn-industrial-secondary px-2 py-1 text-xs rounded" @click="clearAll">
                清空
              </button>
            </div>
          </div>

          <!-- 数据项列表 -->
          <div class="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
            <div
              v-for="item in currentGroupItems"
              :key="item.id"
              :class="[
                'flex items-center justify-between p-3 rounded border cursor-pointer transition-colors',
                localSelectedItems.includes(item.id)
                  ? 'bg-industrial-highlight border-industrial-accent'
                  : 'bg-industrial-secondary border-industrial hover:bg-industrial-highlight',
              ]"
              @click="toggleItem(item.id)"
            >
              <div class="flex items-center space-x-3">
                <div class="relative">
                  <div
                    :class="[
                      'w-4 h-4 rounded border-2 flex items-center justify-center',
                      localSelectedItems.includes(item.id)
                        ? 'bg-industrial-accent border-industrial-accent'
                        : 'border-industrial-primary',
                    ]"
                  >
                    <i
                      v-if="localSelectedItems.includes(item.id)"
                      class="q-icon notranslate material-icons text-white text-xs"
                    >
                      check
                    </i>
                  </div>
                </div>
                <div>
                  <div class="text-sm text-industrial-primary font-medium">{{ item.label }}</div>
                  <div class="text-xs text-industrial-secondary">ID: {{ item.id }}</div>
                </div>
              </div>
              <div class="text-xs text-industrial-secondary">
                {{ item.displayValue || '-' }}
              </div>
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- 对话框操作按钮 -->
      <q-card-actions class="bg-industrial-secondary border-t border-industrial px-4 py-3">
        <div class="flex items-center justify-end space-x-2 w-full">
          <button class="btn-industrial-secondary px-4 py-2 text-xs rounded" @click="handleCancel">
            取消
          </button>
          <button class="btn-industrial-primary px-4 py-2 text-xs rounded" @click="handleConfirm">
            确定
          </button>
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
