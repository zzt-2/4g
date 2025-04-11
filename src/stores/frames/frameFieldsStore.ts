/**
 * 帧字段管理Store
 *
 * 负责字段状态管理、提供基础CRUD操作
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FrameField, ExtendedFrameField } from '../../types/frames/index';
import { nanoid } from 'nanoid';
import {
  getFieldBitWidth,
  deepClone,
  validateFields as validateFieldsUtil,
  validateField as validateFieldUtil,
  getFieldTypeConfig,
} from '../../utils/frames/frameUtils';
import { createEmptyField } from '../../types/frames/factories';
import { DEFAULT_ENUM_OPTIONS } from '../../config/frameDefaults';

export const useFrameFieldsStore = defineStore('frameFields', () => {
  // 核心状态
  const fields = ref<FrameField[]>([]);
  const selectedFieldIndex = ref<number | null>(null);

  // 编辑状态 - 从composable移至store
  const isEditingField = ref(false);
  const editingFieldIndex = ref<number | null>(null);
  const tempField = ref<Partial<ExtendedFrameField>>({});

  // 计算属性
  const selectedField = computed(() => {
    if (selectedFieldIndex.value === null || !fields.value.length) {
      return null;
    }
    const index = selectedFieldIndex.value;
    if (index >= 0 && index < fields.value.length) {
      return fields.value[index];
    }
    return null;
  });

  const fieldCount = computed(() => fields.value.length);

  // 计算总位数
  const totalBits = computed(() => {
    return fields.value.reduce((sum, field) => {
      return sum + getFieldBitWidth(field);
    }, 0);
  });

  // 基本方法
  function setFields(newFields: FrameField[]) {
    fields.value = [...newFields];
    selectedFieldIndex.value = null;
  }

  function addField(fieldData: Partial<FrameField>): string {
    const newField: FrameField = {
      id: fieldData.id || nanoid(),
      name: fieldData.name || '新字段',
      type: fieldData.type || 'uint8',
      length: fieldData.length || 1,
      description: fieldData.description || '',
      isChecksum: fieldData.isChecksum || false,
      hasDefaultValue: fieldData.hasDefaultValue || false,
      defaultValue: fieldData.defaultValue || '',
      options: fieldData.options || [],
      ...fieldData,
    };

    fields.value.push(newField);
    return newField.id;
  }

  function updateField(index: number, updates: Partial<FrameField>): boolean {
    if (index < 0 || index >= fields.value.length) {
      return false;
    }

    const existingField = fields.value[index];
    if (!existingField) {
      return false;
    }

    fields.value[index] = {
      ...existingField,
      ...updates,
    };

    return true;
  }

  function removeField(index: number): boolean {
    if (index < 0 || index >= fields.value.length) {
      return false;
    }

    fields.value.splice(index, 1);

    // 更新选中索引
    if (selectedFieldIndex.value === index) {
      selectedFieldIndex.value = null;
    } else if (selectedFieldIndex.value !== null && selectedFieldIndex.value > index) {
      selectedFieldIndex.value--;
    }

    return true;
  }

  function duplicateField(index: number): string | null {
    if (index < 0 || index >= fields.value.length) {
      return null;
    }

    const sourceField = fields.value[index];
    if (!sourceField) {
      return null;
    }

    const newField: FrameField = {
      ...deepClone(sourceField),
      id: nanoid(),
      name: `${sourceField.name} (副本)`,
    };

    fields.value.splice(index + 1, 0, newField);
    return newField.id;
  }

  function moveField(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= fields.value.length ||
      toIndex < 0 ||
      toIndex >= fields.value.length
    ) {
      return false;
    }

    // 移动字段
    const fieldToMove = fields.value[fromIndex];
    if (!fieldToMove) {
      return false;
    }

    fields.value.splice(fromIndex, 1);
    fields.value.splice(toIndex, 0, fieldToMove);

    // 更新选中索引
    if (selectedFieldIndex.value === fromIndex) {
      selectedFieldIndex.value = toIndex;
    }

    return true;
  }

  // 验证所有字段
  function validateFields() {
    return validateFieldsUtil(fields.value);
  }

  // 选中字段
  function setSelectedFieldIndex(index: number | null) {
    selectedFieldIndex.value = index;
  }

  function resetFieldsState() {
    fields.value = [];
    selectedFieldIndex.value = null;
    isEditingField.value = false;
    editingFieldIndex.value = null;
    tempField.value = {};
  }

  // 新增编辑相关方法 - 从composable移至store
  /**
   * 开始编辑字段 - 统一的编辑方法，支持新建和编辑现有字段
   * @param index 字段索引，null 表示新建字段
   */
  function startEditField(index: number | null = null) {
    // 清空之前的临时字段
    tempField.value = {};

    if (index === null) {
      // 新建字段
      tempField.value = createEmptyField();
      editingFieldIndex.value = null;
      selectedFieldIndex.value = null;
    } else if (index >= 0 && index < fields.value.length) {
      // 编辑现有字段
      const field = fields.value[index];
      if (field) {
        tempField.value = { ...field };
        editingFieldIndex.value = index;
        selectedFieldIndex.value = index;
      }
    }

    // 设置为编辑模式
    isEditingField.value = true;
  }

  /**
   * 取消编辑字段
   */
  function cancelEditField() {
    isEditingField.value = false;
    editingFieldIndex.value = null;
    tempField.value = {};
  }

  /**
   * 保存字段
   * @returns 新创建的字段ID或null
   */
  function saveField(): string | null {
    // 检查是否有临时字段
    if (!isEditingField.value || Object.keys(tempField.value).length === 0) return null;

    // 验证字段
    const validation = validateFieldUtil(tempField.value);
    if (!validation.valid) {
      return null;
    }

    // 准备要保存的字段数据
    const now = new Date();
    const fieldToSave = {
      ...tempField.value,
      updatedAt: now,
    };

    let newFieldId: string | null = null;

    if (editingFieldIndex.value === null) {
      // 添加新字段
      fieldToSave.createdAt = now;
      newFieldId = addField(fieldToSave);

      if (newFieldId) {
        // 找到新字段的索引并选中它
        const newIndex = fields.value.findIndex((f) => f.id === newFieldId);
        if (newIndex !== -1) {
          selectedFieldIndex.value = newIndex;
        }
      }
    } else {
      // 更新现有字段
      const index = editingFieldIndex.value;
      const success = updateField(index, fieldToSave);

      if (success) {
        newFieldId = fields.value[index]?.id || null;
      }
    }

    // 重置编辑状态
    isEditingField.value = false;
    editingFieldIndex.value = null;
    tempField.value = {};

    return newFieldId;
  }

  /**
   * 更新临时字段属性
   * @param key 属性名
   * @param value 属性值
   */
  function updateTempField<K extends keyof ExtendedFrameField>(
    key: K,
    value: ExtendedFrameField[K],
  ) {
    if (key === 'type') {
      // 在更改类型时更新相关设置
      const typeConfig = getFieldTypeConfig(value as string);

      if (typeConfig.fixedLength !== null) {
        tempField.value.length = typeConfig.fixedLength;
      }

      // 如果是需要选项的类型且没有选项，添加默认选项
      if (
        typeConfig.needsOptions &&
        (!tempField.value.options || tempField.value.options.length === 0)
      ) {
        tempField.value.options = [...DEFAULT_ENUM_OPTIONS];
      }
    }

    tempField.value[key] = value;
  }

  /**
   * 添加枚举选项
   * @param option 选项值
   */
  function addEnumOption(option: string) {
    if (!tempField.value.options) {
      tempField.value.options = [];
    }
    tempField.value.options.push(option);
  }

  /**
   * 删除枚举选项
   * @param index 选项索引
   */
  function removeEnumOption(index: number) {
    if (tempField.value.options && index >= 0 && index < tempField.value.options.length) {
      tempField.value.options.splice(index, 1);
    }
  }

  return {
    // 状态
    fields,
    selectedFieldIndex,
    selectedField,
    fieldCount,
    totalBits,

    // 编辑状态
    isEditingField,
    editingFieldIndex,
    tempField,

    // 基本CRUD方法
    setFields,
    addField,
    updateField,
    removeField,
    duplicateField,
    moveField,
    validateFields,

    // 编辑方法
    startEditField,
    cancelEditField,
    saveField,
    updateTempField,
    addEnumOption,
    removeEnumOption,

    // 辅助方法
    setSelectedFieldIndex,
    resetFieldsState,
  };
});
