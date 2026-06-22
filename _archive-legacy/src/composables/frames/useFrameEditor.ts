/**
 * 帧编辑器Composable
 *
 * 处理帧编辑相关的复杂业务逻辑，主要负责跨Store协调操作，如初始化编辑器、保存帧等功能
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  useFrameEditorStore,
  useFrameFieldsStore,
  useFrameTemplateStore,
} from '../../stores/framesStore';
import type { Frame } from '../../types/frames';
import { validateFrame as validateFrameUtil } from '../../utils/frames/frameUtils';

/**
 * 帧编辑器组合式函数
 * 提供帧编辑初始化、保存等跨Store协调功能
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

  /**
   * 初始化编辑器
   * @param frameId 要编辑的帧ID，为空则创建新帧
   */
  function initEditor(frameId?: string) {
    // 重置编辑器状态
    editorStore.resetEditor();
    validationErrors.value = [];
    editorStore.setHasChanges(false);
    isSubmitting.value = false;

    if (frameId) {
      // 编辑已有帧
      const frame = templateStore.frames.find((f) => f.id === frameId);
      if (frame) {
        editorStore.setEditorFrame(frame);
        editorStore.editorFrame.lastId = frame.id;
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
   * 验证当前帧
   */
  function validateFrame(): { valid: boolean; errors: string[] } {
    if (!editorStore.editorFrame) {
      validationErrors.value = ['无有效帧数据'];
      return { valid: false, errors: ['无有效帧数据'] };
    }

    // 使用工具函数进行验证
    const validationResult = validateFrameUtil(editorStore.editorFrame);
    validationErrors.value = validationResult.errors;

    return validationResult;
  }

  /**
   * 保存当前帧
   */
  async function saveFrame(): Promise<Frame | { valid: boolean; errors: string[] }> {
    if (!editorStore.editorFrame) return { valid: false, errors: ['无有效帧数据'] };
    if (
      templateStore.frames.find((f) => f.id === editorStore.editorFrame.id) &&
      editorStore.editorFrame.lastId !== editorStore.editorFrame.id
    )
      return { valid: false, errors: ['已存在该帧Id'] };

    const validationResult = validateFrame();

    // 验证帧
    if (!validationResult.valid) {
      return { valid: false, errors: validationResult.errors };
    }

    isSubmitting.value = true;

    try {
      const frameToSave: Frame = { ...editorStore.editorFrame, fields: fieldStore.fields };

      // 更新时间戳
      frameToSave.timestamp = Date.now();

      if (editorStore.editMode === 'create') {
        // 创建新帧
        await templateStore.createFrame(frameToSave);
      } else {
        // 更新现有帧
        await templateStore.updateFrame(frameToSave);
        if (editorStore.editorFrame.lastId !== editorStore.editorFrame.id)
          templateStore.deleteFrame(editorStore.editorFrame.lastId);
      }

      // 重置状态
      editorStore.setHasChanges(false);

      return { valid: true, errors: [] };
    } catch (error) {
      editorStore.setError(error instanceof Error ? error.message : '保存帧时发生错误');
      return { valid: false, errors: ['保存帧时发生错误'] };
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
  }

  /**
   * 取消编辑并返回
   */
  function cancelAndReturn() {
    resetEditor();
    router.push({ name: 'frames-list' });
  }

  return {
    // 本地状态
    isSubmitting,
    validationErrors,

    // 复杂业务逻辑方法
    initEditor,
    validateFrame,
    saveFrame,
    saveAndReturn,
    resetEditor,
    cancelAndReturn,
  };
}
