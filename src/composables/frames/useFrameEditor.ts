/**
 * 帧编辑器Composable
 *
 * 处理帧编辑相关的业务逻辑，连接编辑器Store和字段Store，提供编辑初始化、保存等功能
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  useFrameEditorStore,
  useFrameFieldsStore,
  useFrameTemplateStore,
} from '../../stores/framesStore';
import type { Frame, FrameField } from '../../types/frames';
import {
  validateFrame as validateFrameUtil,
  getFieldBitWidth,
  getFieldShortType,
  getFieldBitsText,
} from '../../utils/frames/frameUtils';

/**
 * 帧编辑器组合式函数
 * 提供帧编辑初始化、保存等功能
 */
export function useFrameEditor() {
  // 获取相关的Store
  const editorStore = useFrameEditorStore();
  const fieldStore = useFrameFieldsStore();
  const templateStore = useFrameTemplateStore();
  const router = useRouter();

  // 本地状态
  const isSubmitting = ref(false);
  const validationErrors = ref<string[]>([]);
  const localHasChanges = ref(false);

  // 编辑器状态
  const currentFrame = computed(() => editorStore.editorFrame);
  const isNewFrame = computed(() => editorStore.editMode === 'create');
  const hasChanges = computed(() => editorStore.hasChanges || localHasChanges.value);
  const isValid = computed(() => editorStore.isValid && validationErrors.value.length === 0);
  const editMode = computed(() => editorStore.editMode);

  // 字段相关计算属性
  const fields = computed(() => currentFrame.value?.fields || []);
  const selectedField = computed(() => fieldStore.selectedField);
  const fieldCount = computed(() => fieldStore.fieldCount);
  const totalBits = computed(() => fieldStore.totalBits);

  /**
   * 初始化编辑器
   * @param frameId 要编辑的帧ID，为空则创建新帧
   */
  function initEditor(frameId?: string) {
    // 重置编辑器状态
    editorStore.resetEditor();
    validationErrors.value = [];
    localHasChanges.value = false;
    isSubmitting.value = false;

    if (frameId) {
      // 编辑已有帧
      const frame = templateStore.frames.find((f) => f.id === frameId);
      if (frame) {
        editorStore.setEditorFrame(frame);
        editorStore.setEditMode('edit');
        fieldStore.setFields(frame.fields);
      } else {
        editorStore.setError('未找到指定的帧配置');
        return false;
      }
    } else {
      // 创建新帧
      editorStore.initNewFrame();
      fieldStore.setFields([]);
    }

    return true;
  }

  /**
   * 更新帧基本信息
   * @param updates 更新内容
   */
  function updateFrameInfo(updates: Partial<Frame>) {
    if (!currentFrame.value) return;

    editorStore.updateEditorFrame(updates);
    localHasChanges.value = true;
  }

  /**
   * 添加新字段
   * @param fieldData 字段数据
   */
  function addField(fieldData: Partial<FrameField> = {}) {
    if (!currentFrame.value) return;

    const newFieldId = fieldStore.addField(fieldData);

    // 更新编辑器中的帧对象
    const updatedFields = [...fields.value, fieldStore.fields.find((f) => f.id === newFieldId)!];
    editorStore.updateEditorFrame({ fields: updatedFields });
    localHasChanges.value = true;

    return newFieldId;
  }

  /**
   * 更新字段
   * @param index 字段索引
   * @param updates 更新内容
   */
  function updateField(index: number, updates: Partial<FrameField>) {
    if (!currentFrame.value) return false;

    const success = fieldStore.updateField(index, updates);
    if (success) {
      // 更新编辑器中的帧对象
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
      localHasChanges.value = true;
    }

    return success;
  }

  /**
   * 删除字段
   * @param index 字段索引
   */
  function removeField(index: number) {
    if (!currentFrame.value) return false;

    const success = fieldStore.removeField(index);
    if (success) {
      // 更新编辑器中的帧对象
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
      localHasChanges.value = true;
    }

    return success;
  }

  /**
   * 复制字段
   * @param index 字段索引
   */
  function duplicateField(index: number) {
    if (!currentFrame.value) return null;

    const newIndex = fieldStore.duplicateField(index);
    if (newIndex !== null) {
      // 更新编辑器中的帧对象
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
      localHasChanges.value = true;
    }

    return newIndex;
  }

  /**
   * 移动字段
   * @param fromIndex 源索引
   * @param toIndex 目标索引
   */
  function moveField(fromIndex: number, toIndex: number) {
    if (!currentFrame.value) return false;

    const success = fieldStore.moveField(fromIndex, toIndex);
    if (success) {
      // 更新编辑器中的帧对象
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
      localHasChanges.value = true;
    }

    return success;
  }

  /**
   * 选择字段
   * @param index 字段索引
   */
  function selectField(index: number | null) {
    fieldStore.setSelectedFieldIndex(index);
  }

  /**
   * 验证当前帧
   */
  function validateFrame(): boolean {
    if (!currentFrame.value) {
      validationErrors.value = ['无有效帧数据'];
      return false;
    }

    // 使用工具函数进行验证
    const validationResult = validateFrameUtil(currentFrame.value);
    validationErrors.value = validationResult.errors;

    return validationResult.valid;
  }

  /**
   * 保存当前帧
   */
  async function saveFrame(): Promise<Frame | null> {
    if (!currentFrame.value) return null;

    // 验证帧
    if (!validateFrame()) {
      return null;
    }

    isSubmitting.value = true;

    try {
      let savedFrame: Frame;
      const frameToSave: Frame = { ...currentFrame.value, fields: fieldStore.fields };

      // 更新时间戳
      frameToSave.timestamp = Date.now();

      if (isNewFrame.value) {
        // 创建新帧
        savedFrame = await templateStore.createFrame(frameToSave);
      } else {
        // 更新现有帧
        savedFrame = await templateStore.updateFrame(frameToSave);
      }

      // 重置状态
      editorStore.setHasChanges(false);
      localHasChanges.value = false;

      return savedFrame;
    } catch (error) {
      editorStore.setError(error instanceof Error ? error.message : '保存帧时发生错误');
      return null;
    } finally {
      isSubmitting.value = false;
    }
  }

  /**
   * 保存并返回列表
   */
  async function saveAndReturn(): Promise<boolean> {
    const savedFrame = await saveFrame();
    if (savedFrame) {
      router.push({ name: 'frames-list' });
      return true;
    }
    return false;
  }

  /**
   * 重置编辑器
   */
  function resetEditor() {
    editorStore.resetEditor();
    fieldStore.resetFieldsState();
    validationErrors.value = [];
    localHasChanges.value = false;
  }

  /**
   * 取消编辑并返回
   */
  function cancelAndReturn() {
    resetEditor();
    router.push({ name: 'frames-list' });
  }

  // 监听字段变化
  watch(fieldStore.fields, () => {
    if (currentFrame.value) {
      // 确保编辑器中的帧对象和字段保持同步
      editorStore.updateEditorFrame({ fields: fieldStore.fields });
    }
  });

  return {
    // 状态
    currentFrame,
    isNewFrame,
    hasChanges,
    isValid,
    editMode,
    fields,
    selectedField,
    fieldCount,
    totalBits,
    isSubmitting,
    validationErrors,

    // 方法
    initEditor,
    updateFrameInfo,
    addField,
    updateField,
    removeField,
    duplicateField,
    moveField,
    selectField,
    validateFrame,
    saveFrame,
    saveAndReturn,
    resetEditor,
    cancelAndReturn,

    // 辅助方法
    getFieldBitWidth,
    getFieldShortType,
    getFieldBitsText,
  };
}
