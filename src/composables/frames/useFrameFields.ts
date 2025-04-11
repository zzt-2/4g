/**
 * 帧字段操作Composable
 *
 * 处理字段操作相关的业务逻辑，提供字段添加、编辑、验证等功能
 */
import { computed } from 'vue';
import { useFrameFieldsStore } from '../../stores/frames/frameFieldsStore';
import type { ExtendedFrameField } from '../../types/frames/index';
import { FIELD_TYPE_OPTIONS } from '../../config/frameDefaults';
import {
  getFieldBitWidth,
  getFieldShortType,
  getFieldBitsText,
  getFieldHexPreview,
} from '../../utils/frames/frameUtils';
import { useNotification } from './useNotification';

/**
 * 帧字段操作组合式函数
 * 不再存储状态，改为包装store方法并添加通知
 */
export function useFrameFields() {
  // 获取相关的Store
  const fieldStore = useFrameFieldsStore();
  const { notifyFieldSuccess, notifyError } = useNotification();

  // 从store中获取状态的计算属性
  const fields = computed(() => fieldStore.fields);
  const selectedField = computed(() => fieldStore.selectedField);
  const fieldCount = computed(() => fieldStore.fieldCount);
  const totalBits = computed(() => fieldStore.totalBits);
  const totalBytes = computed(() => Math.ceil(totalBits.value / 8));

  // 编辑状态
  const isEditingField = computed(() => fieldStore.isEditingField);
  const editingFieldIndex = computed(() => fieldStore.editingFieldIndex);
  const tempField = computed(() => fieldStore.tempField);

  /**
   * 开始编辑字段 - 包装store方法
   */
  function startEditField(index: number | null = null) {
    fieldStore.startEditField(index);
  }

  /**
   * 取消编辑字段 - 包装store方法
   */
  function cancelEditField() {
    fieldStore.cancelEditField();
  }

  /**
   * 保存字段 - 包装store方法并添加通知
   */
  function saveField(): string | null {
    // 检查是否有临时字段
    if (!isEditingField.value || Object.keys(tempField.value).length === 0) return null;

    // 调用store的方法保存字段
    const newFieldId = fieldStore.saveField();

    if (newFieldId) {
      // 成功保存，发送通知
      const fieldName = tempField.value.name || '';
      const isNew = editingFieldIndex.value === null;
      notifyFieldSuccess(isNew ? '添加' : '更新', fieldName);
    } else {
      // 验证失败
      notifyError('字段验证失败，请检查字段数据');
    }

    return newFieldId;
  }

  /**
   * 删除字段 - 包装store方法并添加通知
   */
  function removeField(index: number): boolean {
    const field = fields.value[index];
    const success = fieldStore.removeField(index);

    if (success && field) {
      notifyFieldSuccess('删除', field.name);
    }

    return success;
  }

  /**
   * 复制字段 - 包装store方法并添加通知
   */
  function duplicateField(index: number): number | null {
    const sourceField = fields.value[index];
    if (!sourceField) return null;

    const newFieldId = fieldStore.duplicateField(index);

    if (newFieldId) {
      // 找到新字段的索引
      const newIndex = fields.value.findIndex((f) => f.id === newFieldId);
      const newField = fields.value[newIndex];

      if (newField) {
        notifyFieldSuccess('添加', newField.name);
      }

      return newIndex;
    }

    return null;
  }

  /**
   * 移动字段 - 包装store方法
   */
  function moveField(fromIndex: number, toIndex: number): boolean {
    return fieldStore.moveField(fromIndex, toIndex);
  }

  /**
   * 更新临时字段属性 - 包装store方法
   */
  function updateTempField<K extends keyof ExtendedFrameField>(
    key: K,
    value: ExtendedFrameField[K],
  ) {
    fieldStore.updateTempField(key, value);
  }

  /**
   * 添加枚举选项 - 包装store方法
   */
  function addEnumOption(option: string) {
    fieldStore.addEnumOption(option);
  }

  /**
   * 删除枚举选项 - 包装store方法
   */
  function removeEnumOption(index: number) {
    fieldStore.removeEnumOption(index);
  }

  /**
   * 重置所有字段 - 包装store方法
   */
  function resetFields() {
    fieldStore.resetFieldsState();
  }

  // 导出相关的计算属性和方法
  return {
    // 状态 - 现在是从store获取的计算属性
    fields,
    selectedField,
    isEditingField,
    editingFieldIndex,
    tempField,
    fieldCount,
    totalBits,
    totalBytes,

    // 操作方法 - 包装了store方法并添加通知
    startEditField,
    cancelEditField,
    saveField,
    removeField,
    duplicateField,
    moveField,
    updateTempField,
    addEnumOption,
    removeEnumOption,
    resetFields,

    // 工具函数
    getFieldBitWidth,
    getFieldShortType,
    getFieldBitsText,
    getFieldHexPreview,

    // 常量
    fieldTypeOptions: FIELD_TYPE_OPTIONS,
  };
}
