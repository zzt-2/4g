/**
 * 帧编辑状态Store
 *
 * 负责管理帧编辑状态、维护编辑中的帧数据、处理变更标记
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Frame } from '../../types/frames';
import { deepClone } from '../../utils/frames/frameUtils';
import { createEmptyFrame } from '../../types/frames/factories';

export const useFrameEditorStore = defineStore('frameEditor', () => {
  // 核心状态
  const editorFrame = ref<Frame>(createEmptyFrame());
  const hasChanges = ref(false);
  const editMode = ref<'create' | 'edit'>('create');
  const error = ref<string | null>(null);
  const initialFrameState = ref<string>('');

  // 深度监听editorFrame的变化
  watch(
    () => editorFrame.value,
    (newValue) => {
      if (initialFrameState.value) {
        // 将当前状态转换为字符串进行比较
        const currentState = JSON.stringify(newValue);
        // 只有当初始状态不为空且与当前状态不同时，才标记为有变更
        hasChanges.value = initialFrameState.value !== currentState;
      }
    },
    { deep: true }, // 开启深度监听
  );

  // 计算属性
  const isValid = computed(() => {
    if (!editorFrame.value) return false;

    // 基本验证：必须有名称，且至少有一个字段
    return editorFrame.value.name.trim() !== '' && editorFrame.value.fields.length > 0;
  });

  // 方法
  function setEditorFrame(frame: Frame | null) {
    // 创建深拷贝，避免直接修改store外部的对象
    editorFrame.value = frame ? deepClone(frame) : createEmptyFrame();
    // 保存初始状态的副本用于比较
    initialFrameState.value = JSON.stringify(editorFrame.value);
    hasChanges.value = false;
  }

  function updateEditorFrame(updates: Partial<Frame>) {
    if (!editorFrame.value) return;

    editorFrame.value = {
      ...editorFrame.value,
      ...updates,
      updatedAt: new Date(),
    };

    hasChanges.value = true;
  }

  function initNewFrame() {
    setEditorFrame(null);
    editMode.value = 'create';
  }

  function resetEditor() {
    editorFrame.value = createEmptyFrame();
    // 重置初始状态
    initialFrameState.value = JSON.stringify(editorFrame.value);
    hasChanges.value = false;
    error.value = null;
  }

  function setHasChanges(value: boolean) {
    hasChanges.value = value;
  }

  function setEditMode(mode: 'create' | 'edit') {
    editMode.value = mode;
  }

  function setError(message: string | null) {
    error.value = message;
  }

  return {
    // 状态
    editorFrame,
    hasChanges,
    editMode,
    error,
    isValid,

    // 方法
    setEditorFrame,
    updateEditorFrame,
    initNewFrame,
    resetEditor,
    setHasChanges,
    setEditMode,
    setError,
  };
});
