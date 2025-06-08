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
      <!-- 排序切换按钮 -->
      <button
        class="px-2 py-1 text-xs bg-industrial-highlight text-industrial-secondary hover:text-industrial-primary hover:bg-industrial-highlight rounded transition-colors flex items-center gap-1"
        @click="toggleSortMode"
        title="切换排序模式"
      >
        <span class="material-icons text-xs">{{ isSortMode ? 'done' : 'sort' }}</span>
        {{ isSortMode ? '完成' : '排序' }}
      </button>
    </div>

    <!-- 字段列表容器 - 使用 min-h-0 确保可以正确滚动 -->
    <div
      class="flex-grow min-h-0 border border-[#3b82f6]/30 rounded-md bg-[#0f172a]/50 overflow-auto"
    >
      <template v-if="fieldStore.fields.length > 0">
        <!-- 字段列表 -->
        <TransitionGroup name="field-list" tag="div" class="p-1.5">
          <template v-for="(field, index) in fieldStore.fields" :key="field.id">
            <!-- 插入位置指示器 -->
            <div
              v-if="isDragging && dropIndex === index && draggedIndex !== index"
              class="h-1 bg-white rounded mb-1 transition-all duration-200"
              style="margin-left: 0; margin-right: 0"
            ></div>

            <div
              class="flex items-center mb-1 bg-industrial-secondary rounded-md border border-industrial h-8 cursor-pointer select-none transition-colors duration-200 hover:border-industrial-accent"
              :class="{
                'border-industrial-accent bg-industrial-highlight': selectedFieldIndex === index,
                'opacity-50': isDragging && draggedIndex === index,
                'cursor-grab': isSortMode && !isDragging,
                'cursor-grabbing': isSortMode && isDragging && draggedIndex === index,
              }"
              @click="!isSortMode && startEditField(index)"
              @mousedown="isSortMode && startDrag(index, $event)"
              :draggable="isSortMode"
              :style="{ transform: draggedIndex === index ? `translateY(${dragOffset}px)` : '' }"
            >
              <!-- 拖拽手柄（排序模式下显示） -->
              <div
                v-if="isSortMode"
                class="flex items-center justify-center w-6 h-full text-industrial-secondary cursor-grab active:cursor-grabbing"
              >
                <span class="material-icons text-xs">drag_indicator</span>
              </div>

              <!-- 字段内容区域 -->
              <div
                class="flex-grow h-[32px] overflow-hidden flex flex-col justify-center py-0.5 px-1.5"
                :class="{
                  'max-w-[250px] w-[calc(100%-50px)]': !isSortMode,
                  'w-[calc(100%-24px)]': isSortMode,
                }"
              >
                <div class="font-medium text-[10px] text-industrial-primary truncate w-full">
                  {{ field.name || '未命名字段' }}
                </div>
                <div class="flex items-center overflow-hidden">
                  <span
                    class="text-[8px] text-industrial-secondary bg-industrial-highlight px-0.5 rounded mr-1 flex-shrink-0"
                  >
                    {{ getFieldShortType(field.dataType) }}
                  </span>
                  <span class="text-[8px] text-industrial-secondary flex-shrink-0">
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

              <!-- 操作按钮区域 - 非排序模式下显示 -->
              <div v-if="!isSortMode" class="flex h-full flex-shrink-0">
                <button
                  class="h-full w-6 flex-shrink-0 flex items-center justify-center transition-colors duration-200 text-industrial-secondary hover:text-industrial-primary hover:bg-industrial-highlight"
                  @click.stop="handleDuplicate(index)"
                  title="复制"
                >
                  <span class="material-icons text-[10px]">content_copy</span>
                </button>
                <button
                  class="h-full w-6 flex-shrink-0 flex items-center justify-center transition-colors duration-200 text-industrial-secondary hover:text-industrial-primary hover:bg-red-900/50 hover:text-red-400"
                  @click.stop="removeFieldDirect(index)"
                  title="删除"
                >
                  <span class="material-icons text-[10px]">delete</span>
                </button>
              </div>
            </div>
          </template>

          <!-- 在列表末尾显示插入指示器 -->
          <div
            v-if="isDragging && dropIndex === fieldStore.fields.length"
            class="h-0.5 bg-industrial-accent rounded transition-all duration-200"
            style="margin-left: 0; margin-right: 0"
          ></div>
        </TransitionGroup>
      </template>

      <div
        v-else
        class="flex flex-col items-center justify-center h-full min-h-20 text-industrial-tertiary text-xs text-center p-2"
      >
        <span class="material-icons text-sm mb-1">layers</span>
        <p>请添加字段</p>
      </div>
    </div>

    <!-- 添加字段按钮 -->
    <div class="p-2 border-t border-industrial mt-2 flex-shrink-0">
      <button
        class="w-full py-1 px-2 btn-industrial-primary rounded flex items-center justify-center text-xs text-industrial-primary transition-colors"
        @click="startEditField(null)"
        :disabled="isSortMode"
        :class="{ 'opacity-50 cursor-not-allowed': isSortMode }"
      >
        <span class="material-icons text-sm mr-1">add</span>
        添加字段
      </button>
    </div>

    <!-- 拖拽时的占位符 -->
    <div
      v-if="isDragging && dropIndex !== null"
      class="fixed pointer-events-none z-50 opacity-50 bg-industrial-highlight border border-industrial-accent rounded-md"
      :style="dragPreviewStyle"
    >
      <div class="flex items-center h-8 px-1.5">
        <div class="flex items-center justify-center w-6 h-full text-industrial-secondary">
          <span class="material-icons text-xs">drag_indicator</span>
        </div>
        <div class="flex-grow h-[32px] overflow-hidden flex flex-col justify-center py-0.5 px-1.5">
          <div class="font-medium text-[10px] text-industrial-primary truncate w-full">
            {{ draggedField?.name || '未命名字段' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useFrameFieldsStore } from '../../../stores/frames/frameFieldsStore';
import { useFrameEditorStore } from '../../../stores/frames/frameEditorStore';
import { getFieldShortType, getFieldBitsText } from '../../../utils/frames/frameUtils';
import { UI_LABELS } from '../../../config/frameDefaults';
import { useNotification } from '../../../composables/frames/useNotification';
import { storeToRefs } from 'pinia';
import type { FrameField } from '../../../types/frames/index';

const { notifySuccess, notifyError } = useNotification();
const fieldStore = useFrameFieldsStore();
const editorStore = useFrameEditorStore();

// 计算属性 - 直接从store获取状态
const { fields, totalBits, selectedFieldIndex } = storeToRefs(fieldStore);

// 排序模式状态
const isSortMode = ref(false);

// 拖拽状态
const isDragging = ref(false);
const draggedIndex = ref<number | null>(null);
const draggedField = ref<FrameField | null>(null);
const dragOffset = ref(0);
const dropIndex = ref<number | null>(null);
const dragPreviewStyle = ref({});

// 定义emit事件
const emit = defineEmits<{
  'edit-field': [index: number | null];
}>();

// 切换排序模式
function toggleSortMode() {
  isSortMode.value = !isSortMode.value;
  if (!isSortMode.value) {
    // 退出排序模式时重置拖拽状态
    resetDragState();
  }
}

// 重置拖拽状态
function resetDragState() {
  isDragging.value = false;
  draggedIndex.value = null;
  draggedField.value = null;
  dragOffset.value = 0;
  dropIndex.value = null;
  dragPreviewStyle.value = {};
}

// 开始拖拽
function startDrag(index: number, event: MouseEvent) {
  if (!isSortMode.value) return;

  event.preventDefault();
  isDragging.value = true;
  draggedIndex.value = index;
  draggedField.value = fields.value[index] || null;

  const startY = event.clientY;
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();

  // 设置拖拽预览样式
  dragPreviewStyle.value = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return;

    const deltaY = e.clientY - startY;
    dragOffset.value = deltaY;

    // 更新拖拽预览位置
    dragPreviewStyle.value = {
      ...dragPreviewStyle.value,
      top: `${rect.top + deltaY}px`,
    };

    // 计算目标位置 - 改进的逻辑
    const container = element.parentElement;
    if (container) {
      const items = Array.from(container.children) as HTMLElement[];
      let targetIndex = index;

      // 遍历所有项目，找到鼠标位置对应的目标索引
      for (let i = 0; i < items.length; i++) {
        if (i === index) continue; // 跳过被拖拽的元素

        const item = items[i];
        if (item) {
          const itemRect = item.getBoundingClientRect();
          const itemTop = itemRect.top;
          const itemBottom = itemRect.bottom;
          const itemCenter = itemTop + (itemBottom - itemTop) / 2;

          // 如果鼠标在这个元素的上半部分
          if (e.clientY >= itemTop && e.clientY < itemCenter) {
            targetIndex = i;
            break;
          }
          // 如果鼠标在这个元素的下半部分
          else if (e.clientY >= itemCenter && e.clientY <= itemBottom) {
            targetIndex = i + 1;
            break;
          }
        }
      }

      // 确保targetIndex在有效范围内
      targetIndex = Math.max(0, Math.min(targetIndex, fields.value.length - 1));
      dropIndex.value = targetIndex;
    }
  };

  const handleMouseUp = () => {
    if (
      isDragging.value &&
      draggedIndex.value !== null &&
      dropIndex.value !== null &&
      dropIndex.value !== draggedIndex.value
    ) {
      // 执行移动操作
      const success = fieldStore.moveField(draggedIndex.value, dropIndex.value);
      if (success) {
        // 更新编辑器中的帧对象
        editorStore.updateEditorFrame({ fields: fieldStore.fields });
        notifySuccess('字段顺序已调整');
      } else {
        notifyError('字段移动失败');
      }
    }

    resetDragState();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

// 开始编辑字段 - 触发事件而不是直接调用store方法
function startEditField(index: number | null) {
  if (isSortMode.value) return; // 排序模式下不允许编辑

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

/* 拖拽时禁用过渡 */
.field-list-item.dragging {
  transition: none !important;
}
</style>
