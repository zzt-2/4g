<template>
  <div class="flex flex-col flex-nowrap h-full max-h-full w-full overflow-hidden">
    <div class="flex items-center justify-between mb-1 flex-shrink-0">
      <div class="flex items-center">
        <h3 class="text-xs font-medium text-[#e2e8f0] uppercase mr-2 pl-2">字段列表</h3>
        <div class="text-[9px] text-[#94a3b8]">
          {{ fieldStore.fields.length }}项/总长度: {{ totalBits }}b ({{
            Math.ceil(totalBits / 8)
          }}B)
        </div>
      </div>
    </div>

    <!-- 字段列表容器 - 使用 min-h-0 确保可以正确滚动 -->
    <div
      class="flex-grow min-h-0 border border-[#3b82f6]/30 rounded-md bg-[#0f172a]/50 overflow-auto"
    >
      <template v-if="fieldStore.fields.length > 0">
        <!-- 字段列表 -->
        <TransitionGroup name="field-list" tag="div" class="p-1.5">
          <div
            v-for="(field, index) in fieldStore.fields"
            :key="field.id"
            class="flex items-center mb-1 bg-[#0f172a]/70 rounded-md border border-[#1e3a8a]/30 h-8 cursor-pointer select-none transition-colors duration-200 hover:border-[#3b82f6]/50"
            :class="{ 'border-[#3b82f6] bg-[#1e3a8a]/30': selectedFieldIndex === index }"
            @click="startEditField(index)"
          >
            <!-- 字段内容区域 -->
            <div
              class="flex-grow max-w-[250px] w-[calc(100%-50px)] h-[32px] overflow-hidden flex flex-col justify-center py-0.5 px-1.5"
            >
              <div class="font-medium text-[10px] text-[#e2e8f0] truncate w-full">
                {{ field.name || '未命名字段' }}
              </div>
              <div class="flex items-center overflow-hidden">
                <span
                  class="text-[8px] text-[#94a3b8] bg-[#1e3a6a] px-0.5 rounded mr-1 flex-shrink-0"
                >
                  {{ getFieldShortType(field.dataType) }}
                </span>
                <span class="text-[8px] text-[#94a3b8] flex-shrink-0">
                  {{ getFieldBitsText(field) }}
                </span>
                <span
                  v-if="field.validOption && field.validOption.isChecksum"
                  class="text-[8px] text-amber-300 ml-1 bg-amber-900 px-0.5 rounded flex-shrink-0"
                >
                  {{ UI_LABELS.CHECKSUM }}
                </span>
              </div>
            </div>

            <!-- 操作按钮区域 - 使简洁紧凑 -->
            <div class="flex h-full flex-shrink-0">
              <button
                class="h-full w-6 flex-shrink-0 flex items-center justify-center transition-colors duration-200 text-[#94a3b8] hover:text-white hover:bg-[#1e4094]/50"
                @click.stop="handleDuplicate(index)"
                title="复制"
              >
                <span class="material-icons text-[10px]">content_copy</span>
              </button>
              <button
                class="h-full w-6 flex-shrink-0 flex items-center justify-center transition-colors duration-200 text-[#94a3b8] hover:text-white hover:bg-[#991b1b]/50 hover:text-[#ef4444]"
                @click.stop="removeFieldDirect(index)"
                title="删除"
              >
                <span class="material-icons text-[10px]">delete</span>
              </button>
            </div>
          </div>
        </TransitionGroup>
      </template>

      <div
        v-else
        class="flex flex-col items-center justify-center h-full min-h-20 text-[#64748b] text-xs text-center p-2"
      >
        <span class="material-icons text-sm mb-1">layers</span>
        <p>请添加字段</p>
      </div>
    </div>

    <!-- 添加字段按钮 -->
    <div class="p-2 border-t border-[#1a3663] mt-2 flex-shrink-0">
      <button
        class="w-full py-1 px-2 bg-blue-500/30 hover:bg-blue-500/50 rounded flex items-center justify-center text-xs text-[#e2e8f0] transition-colors"
        @click="startEditField(null)"
      >
        <span class="material-icons text-sm mr-1">add</span>
        添加字段
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import { useFrameEditorStore } from '../../../stores/frames/frameEditorStore';
import { getFieldShortType, getFieldBitsText } from '../../../utils/frames/frameUtils';
import { UI_LABELS } from '../../../config/frameDefaults';
import { useNotification } from '../../../composables/frames/useNotification';
import { storeToRefs } from 'pinia';

const { notifySuccess, notifyError } = useNotification();
const fieldStore = useFrameFieldsStore();
const editorStore = useFrameEditorStore();

// 计算属性 - 直接从store获取状态
const { fields, totalBits, selectedFieldIndex } = storeToRefs(fieldStore);

// 定义emit事件
const emit = defineEmits<{
  'edit-field': [index: number | null];
}>();

// 开始编辑字段 - 触发事件而不是直接调用store方法
function startEditField(index: number | null) {
  // 设置选中索引仍由field store处理
  fieldStore.setSelectedFieldIndex(index);
  // 触发编辑事件，让父组件处理编辑逻辑
  emit('edit-field', index);
}

function handleDuplicate(index: number) {
  try {
    const newIndex = fieldStore.duplicateField(index);
    if (newIndex !== null) {
      // 更新编辑器中的帧对象
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
      notifySuccess(`字段复制成功`);
    }
  } catch (error) {
    notifyError(`字段复制失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 直接删除字段，不显示确认提示
function removeFieldDirect(index: number) {
  try {
    const field = fields.value[index];
    if (!field) return;

    const success = fieldStore.removeField(index);
    if (success) {
      // 更新编辑器中的帧对象
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
      editorStore.setHasChanges(true);
    }
  } catch (error) {
    notifyError(`字段删除失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
</script>

<style>
/* 过渡效果 */
.field-list-enter-active,
.field-list-leave-active {
  transition: all 0.3s;
}

.field-list-enter-from,
.field-list-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.field-list-move {
  transition: transform 0.2s;
}
</style>
