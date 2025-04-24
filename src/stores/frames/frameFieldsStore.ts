/**
 * 帧字段管理Store
 *
 * 负责字段状态管理、提供基础CRUD操作
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FrameField } from '../../types/frames/index';
import { nanoid } from 'nanoid';
import {
  getFieldBitWidth,
  deepClone,
  validateFields as validateFieldsUtil,
  validateField as validateFieldUtil,
  getFieldTypeConfig,
} from '../../utils/frames/frameUtils';
import { createEmptyField } from '../../types/frames/factories';
import {
  DEFAULT_VALID_OPTION,
  DEFAULT_SELECT_OPTIONS,
  DEFAULT_RADIO_OPTIONS,
} from '../../config/frameDefaults';
import { useFrameEditorStore } from './frameEditorStore';
export const useFrameFieldsStore = defineStore('frameFields', () => {
  // 核心状态
  const editorStore = useFrameEditorStore();
  const fields = ref<FrameField[]>([]);
  const selectedFieldIndex = ref<number | null>(null);

  // 编辑状态 - 从composable移至store
  const isEditingField = ref(false);
  const editingFieldIndex = ref<number | null>(null);
  const tempField = ref<Partial<FrameField>>(createEmptyField());

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

  function updateField(index: number): boolean {
    if (index < 0 || index >= fields.value.length) {
      return false;
    }

    const existingField = fields.value[index];
    if (!existingField) {
      return false;
    }

    fields.value[index] = {
      ...existingField,
      ...tempField.value,
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
    tempField.value = createEmptyField();
  }

  // 新增编辑相关方法 - 从composable移至store
  /**
   * 开始编辑字段 - 统一的编辑方法，支持新建和编辑现有字段
   * @param index 字段索引，null 表示新建字段
   */
  function startEditField(index: number | null = null) {
    if (index === null) {
      // 新建字段
      tempField.value = createEmptyField();
      editingFieldIndex.value = null;
      selectedFieldIndex.value = null;
    } else if (index >= 0 && index < fields.value.length) {
      // 编辑现有字段
      const field = fields.value[index];
      if (field) {
        tempField.value = deepClone(field);

        // 确保validOption存在
        if (!tempField.value.validOption) {
          tempField.value.validOption = { ...DEFAULT_VALID_OPTION };
        }

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
    tempField.value = createEmptyField();
  }

  /**
   * 保存字段
   * @returns 新创建的字段ID或null
   */
  function saveField(): { newFieldId: string | null; newFieldName: string | null } | null {
    // 检查是否有临时字段
    if (!isEditingField.value || Object.keys(tempField.value).length === 0) return null;

    // 如果是需要选项的输入类型，确保有一个默认选项
    if (
      ['select', 'radio'].includes(tempField.value.inputType || '') &&
      tempField.value.options &&
      tempField.value.options.length > 0
    ) {
      // 检查是否有默认选项
      const hasDefault = tempField.value.options.some((opt) => opt.isDefault);

      if (!hasDefault && tempField.value.options[0]) {
        // 没有默认选项时，设置第一个为默认
        tempField.value.options[0].isDefault = true;
        tempField.value.defaultValue = tempField.value.options[0].value;
      } else {
        tempField.value.defaultValue = tempField.value.options.filter(
          (opt) => opt.isDefault,
        )[0]!.value;
      }
    }

    // 验证字段
    const validation = validateFieldUtil(tempField.value);
    if (!validation.valid) {
      return null;
    }

    let newFieldId: string | null = null;
    let newFieldName: string | null = null;

    if (editingFieldIndex.value === null) {
      // 添加新字段
      fields.value.push(tempField.value as FrameField);
      newFieldId = tempField.value.id || null;
      newFieldName = tempField.value.name || null;

      if (newFieldId) {
        // 找到新字段的索引并选中它
        const newIndex = fields.value.findIndex((f) => f.id === newFieldId);
        if (newIndex !== -1) {
          selectedFieldIndex.value = newIndex;
          // updateField(newIndex);
        }
      }
    } else {
      // 更新现有字段
      const index = editingFieldIndex.value;
      const success = updateField(index);

      if (success) {
        newFieldId = fields.value[index]?.id || null;
        newFieldName = fields.value[index]?.name || null;
      }
    }

    // 重置编辑状态
    isEditingField.value = false;
    editingFieldIndex.value = null;
    editorStore.updateEditorFrame({ fields: fields.value });
    tempField.value = {};

    return { newFieldId, newFieldName };
  }

  /**
   * 更新临时字段属性
   * @param key 属性名
   * @param value 属性值
   */
  function updateTempField<K extends keyof FrameField>(key: K) {
    if (key === 'dataType') {
      // 在更改类型时更新相关设置
      const typeConfig = getFieldTypeConfig(tempField.value.dataType);

      if (typeConfig.fixedLength !== null) {
        tempField.value.length = typeConfig.fixedLength;
      }
    } else if (key === 'inputType') {
      // 当输入类型变更为下拉菜单或单选框时，确保有默认选项
      if (
        tempField.value.inputType === 'select' &&
        (!tempField.value.options || tempField.value.options.length === 0)
      ) {
        tempField.value.options = [...DEFAULT_SELECT_OPTIONS];
      } else if (
        tempField.value.inputType === 'radio' &&
        (!tempField.value.options || tempField.value.options.length === 0)
      ) {
        tempField.value.options = [...DEFAULT_RADIO_OPTIONS];
      } else if (tempField.value.inputType === 'input') {
        // 如果切换回输入框，重置选项
        tempField.value.options = [];
        tempField.value.defaultValue = '0x00';
      }
    }
  }

  /**
   * 添加枚举选项
   * @param option 选项值
   */
  function addEnumOption(option: { value: string; label: string; isDefault?: boolean }) {
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
