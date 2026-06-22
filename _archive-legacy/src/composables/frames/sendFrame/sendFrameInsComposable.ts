// 在文件顶部添加 API 响应类型
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * 发送帧实例组合式函数
 * 将发送帧实例管理功能拆分为可组合的逻辑单元
 */
import { ref, computed, shallowRef } from 'vue';
import { useFrameTemplateStore } from '../../../stores/frames/frameTemplateStore';
import {
  withErrorHandling,
  initializeFieldOptions,
  generateNextAvailableId,
  getNextAvailableNumber,
  calculateChecksum,
} from '../../../utils/frames/frameInstancesUtils';
import { convertToHex, initializeHexValues } from '../../../utils/frames/hexCovertUtils';
import type { SendFrameInstance, SendInstanceField } from '../../../types/frames/sendInstances';
import { createSendFrameInstance } from '../../../types/frames/sendInstanceFactories';
import type { Frame } from '../../../types/frames/frames';
import { dataStorageAPI } from '../../../api/common';
import { NUMBER_DATA_TYPES } from 'src/types/frames';

/**
 * 帧实例基本状态管理
 */
export function useInstancesState() {
  const instances = shallowRef<SendFrameInstance[]>([]);
  const currentInstanceId = ref<string | null>(null);
  const currentInstance = shallowRef<SendFrameInstance | null>(null);
  const sendFrameOptions = ref<
    { id: string; name: string; fields: { id: string; name: string }[] }[]
  >([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 计算属性
  // const currentInstance = computed(
  //   () => instances.value.find((instance) => instance.id === currentInstanceId.value) || null,
  // );

  const instancesByFrameId = computed(() => {
    const result: Record<string, SendFrameInstance[]> = {};
    instances.value.forEach((instance) => {
      if (!result[instance.frameId]) {
        result[instance.frameId] = [];
      }
      result[instance.frameId]!.push(instance);
    });
    return result;
  });

  const favoriteInstances = computed(() =>
    instances.value.filter((instance) => instance.isFavorite),
  );

  return {
    instances,
    sendFrameOptions,
    currentInstanceId,
    isLoading,
    error,
    currentInstance,
    instancesByFrameId,
    favoriteInstances,

    // 辅助方法 - 包装错误处理
    async withErrorHandling<T>(
      operation: () => Promise<T>,
      errorMessage: string,
    ): Promise<T | null> {
      return withErrorHandling(
        operation,
        errorMessage,
        (loading) => (isLoading.value = loading),
        (err) => (error.value = err),
      );
    },
  };
}

/**
 * 帧实例CRUD操作
 */
export function useInstancesCrud(state: ReturnType<typeof useInstancesState>) {
  // 数据获取方法
  async function fetchInstances() {
    return state.withErrorHandling(async () => {
      // 获取数据
      const result = await dataStorageAPI.sendInstances.list();

      // 处理返回结果
      let instancesData: SendFrameInstance[] = [];

      if (Array.isArray(result)) {
        // 如果直接返回数组
        instancesData = result as SendFrameInstance[];
      } else if (result && typeof result === 'object') {
        // 如果返回对象格式，尝试提取data字段
        const response = result as unknown as ApiResponse<SendFrameInstance[]>;
        if (response.success && Array.isArray(response.data)) {
          instancesData = response.data;
        }
      }

      state.instances.value = instancesData;

      // 🔧 修复：同时更新 sendFrameOptions
      const newSendFrameOptions = instancesData.map((instance: SendFrameInstance) => ({
        id: instance.id,
        name: instance.label,
        fields:
          instance.fields?.map((field: SendInstanceField) => ({
            id: field.id,
            name: field.label,
          })) || [],
      }));
      state.sendFrameOptions.value = newSendFrameOptions;

      return instancesData;
    }, '加载发送实例失败');
  }

  // 创建实例
  async function createInstance(
    frameId: string,
    label?: string,
    description?: string,
  ): Promise<SendFrameInstance | null> {
    return state.withErrorHandling(async () => {
      const frameStore = useFrameTemplateStore();
      const frame = frameStore.frames.find((f) => f.id === frameId);

      if (!frame) {
        throw new Error('找不到对应的帧定义');
      }

      // 生成下一个可用的数字ID
      const nextId = generateNextAvailableId(state.instances.value);

      // 使用生成的ID创建实例
      const newInstance = createSendFrameInstance(frame, nextId);

      // 获取下一个可用编号
      const nextNumber = getNextAvailableNumber(frameId, frame.name, state.instances.value);

      // 更新实例属性
      newInstance.label = label || `${frame.name} #${nextNumber}`;
      if (description) newInstance.description = description;

      await dataStorageAPI.sendInstances.save(newInstance);
      state.instances.value.push(newInstance);
      return newInstance;
    }, '创建发送实例失败');
  }

  // 更新实例
  async function updateInstance(instance: SendFrameInstance): Promise<SendFrameInstance | null> {
    return state.withErrorHandling(async () => {
      const updatedInstance = {
        ...instance,
        updatedAt: new Date(),
      };

      await dataStorageAPI.sendInstances.save(updatedInstance);

      // 更新本地数据
      const index = state.instances.value.findIndex((i) => i.id === instance.id);
      if (index !== -1) {
        state.instances.value[index] = updatedInstance;
      }

      return updatedInstance;
    }, '更新发送实例失败');
  }

  // 删除实例
  async function deleteInstance(id: string): Promise<boolean | null> {
    return state.withErrorHandling(async () => {
      await dataStorageAPI.sendInstances.delete(id);

      // 从本地数据中删除
      const index = state.instances.value.findIndex((instance) => instance.id === id);
      if (index !== -1) {
        state.instances.value.splice(index, 1);
      }

      // 如果删除的是当前选中的实例，清空选中状态
      if (state.currentInstanceId.value === id) {
        state.currentInstanceId.value = null;
      }

      return true;
    }, '删除发送实例失败');
  }

  // 批量删除实例
  async function deleteInstances(ids: string[]): Promise<boolean | null> {
    return state.withErrorHandling(async () => {
      // 批量调用dataStorageAPI.delete
      const deletePromises = ids.map((id) => dataStorageAPI.sendInstances.delete(id));
      await Promise.all(deletePromises);

      // 从本地数据中删除
      const idsSet = new Set(ids);
      state.instances.value = state.instances.value.filter((instance) => !idsSet.has(instance.id));

      // 如果删除的实例中包含当前选中的实例，清空选中状态
      if (state.currentInstanceId.value && idsSet.has(state.currentInstanceId.value)) {
        state.currentInstanceId.value = null;
      }

      return true;
    }, '批量删除发送实例失败');
  }

  // 复制实例
  async function copyInstance(id: string): Promise<SendFrameInstance | null> {
    return state.withErrorHandling(async () => {
      // 查找源实例
      const sourceInstance = state.instances.value.find((instance) => instance.id === id);
      if (!sourceInstance) {
        throw new Error('找不到要复制的实例');
      }

      // 生成新ID
      const nextId = generateNextAvailableId(state.instances.value);

      // 提取基础名称（移除#数字后缀）
      let baseName = sourceInstance.label;
      const hashNumMatch = baseName.match(/^(.+?)\s*#\d+$/);
      if (hashNumMatch && hashNumMatch[1]) {
        baseName = hashNumMatch[1].trim();
      }

      // 获取下一个可用编号
      const nextNumber = getNextAvailableNumber(
        sourceInstance.frameId,
        baseName,
        state.instances.value,
      );

      // 创建副本，使用新的命名格式
      const copyInstance: SendFrameInstance = {
        ...JSON.parse(JSON.stringify(sourceInstance)), // 深拷贝
        id: nextId,
        label: `${baseName} #${nextNumber}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 保存新实例
      await dataStorageAPI.sendInstances.save(copyInstance);
      state.instances.value.push(copyInstance);

      return copyInstance;
    }, '复制实例失败');
  }

  // 切换收藏状态
  async function toggleFavorite(id: string): Promise<void> {
    const instance = state.instances.value.find((instance) => instance.id === id);
    if (!instance) return;

    instance.isFavorite = !instance.isFavorite;
    await updateInstance(instance).catch((err) => console.error('切换收藏状态失败', err));
  }

  // 移动实例位置 - 修复并增强同步性
  async function moveInstance(fromIndex: number, toIndex: number): Promise<boolean> {
    const result = await state.withErrorHandling(async () => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.instances.value.length ||
        toIndex < 0 ||
        toIndex >= state.instances.value.length ||
        fromIndex === toIndex
      ) {
        return false;
      }

      // 移动实例
      const instanceToMove = state.instances.value[fromIndex];
      if (!instanceToMove) {
        return false;
      }

      // 执行数组移动操作
      const newInstances = [...state.instances.value];
      newInstances.splice(fromIndex, 1);
      newInstances.splice(toIndex, 0, instanceToMove);

      // 更新本地状态
      state.instances.value = newInstances;

      // 保存到后端（批量保存所有实例的新顺序）
      try {
        await dataStorageAPI.sendInstances.saveAll(newInstances);
        return true;
      } catch (error) {
        // 如果保存失败，回滚本地状态
        console.error('保存实例顺序失败:', error);
        // 重新获取数据以保证一致性
        await fetchInstances();
        return false;
      }
    }, '移动实例失败');

    return result ?? false;
  }

  return {
    fetchInstances,
    createInstance,
    updateInstance,
    deleteInstance,
    deleteInstances,
    copyInstance,
    toggleFavorite,
    moveInstance,
  };
}

/**
 * 帧实例编辑状态管理
 */
export function useInstanceEditing(state: ReturnType<typeof useInstancesState>) {
  // 编辑状态
  const localInstance = ref<SendFrameInstance | null>(null);
  const editedId = ref('');
  const editedDescription = ref('');
  const hexValues = ref<Record<string, string>>({});

  // 设置当前实例
  function setCurrentInstance(id: string | null): void {
    state.currentInstanceId.value = id;

    // 🔧 修复：同时更新 currentInstance 引用
    if (id) {
      const instance = state.instances.value.find((inst) => inst.id === id);
      if (instance) {
        // 更新当前实例引用（用于 FramePreview 等组件）
        state.currentInstance.value = instance;

        // 创建深拷贝，避免直接修改原始对象
        const instanceCopy = JSON.parse(JSON.stringify(instance));

        // 确保每个字段的选项正确性
        instanceCopy.fields = instanceCopy.fields.map(initializeFieldOptions);

        // 更新本地实例
        localInstance.value = instanceCopy;
        editedId.value = instance.id;
        editedDescription.value = instance.description || '';

        // 初始化十六进制值映射
        hexValues.value = initializeHexValues(instance);
      } else {
        // 如果找不到实例，清空当前实例
        state.currentInstance.value = null;
      }
    } else {
      // 清空当前实例和本地编辑状态
      state.currentInstance.value = null;
      localInstance.value = null;
      editedId.value = '';
      editedDescription.value = '';
      hexValues.value = {};
    }
  }

  // 更新字段值
  function updateFieldValue(fieldId: string, value: string | number | null): void {
    if (!localInstance.value) return;

    // 查找并更新字段值
    const targetField = localInstance.value.fields.find((f) => f.id === fieldId);
    if (targetField) {
      targetField.value = value !== null ? String(value) : '';

      // 更新十六进制显示
      if (NUMBER_DATA_TYPES.includes(targetField.dataType)) {
        if (targetField.isASCII) {
          hexValues.value[fieldId] = convertToHex(
            value || '0',
            targetField.dataType,
            targetField.length,
            targetField.isASCII,
          );
        } else {
          hexValues.value[fieldId] = `0x${convertToHex(
            value || '0',
            targetField.dataType,
            targetField.length,
          )}`;
        }
      }

      // 如果当前修改的不是校验字段，自动更新所有校验字段的值
      const isChecksumField =
        targetField.validOption && targetField.validOption.isChecksum === true;

      if (!isChecksumField) {
        // 计算所有校验字段的新值
        console.log('localInstance.value', localInstance.value);
        const checksumValues = calculateChecksum(localInstance.value);
        console.log('checksumValues', checksumValues);

        if (checksumValues.length > 0) {
          // 找出所有校验字段并更新它们的值
          const checksumFields = localInstance.value.fields.filter(
            (field) => field && field.validOption && field.validOption.isChecksum === true,
          );

          checksumFields.forEach((field, index) => {
            if (index < checksumValues.length) {
              // 去掉前缀0x，保存纯十六进制值
              field.value = checksumValues[index] || '';

              // 更新十六进制显示
              hexValues.value[field.id] = checksumValues[index] || '';
            }
          });
        }
      }
    }
  }

  // 准备保存数据
  function prepareForSave(): SendFrameInstance | null {
    if (!localInstance.value) return null;

    // 将编辑的ID和描述应用回实例对象
    const instanceToSave = { ...localInstance.value };
    instanceToSave.id = editedId.value;
    instanceToSave.description = editedDescription.value;
    instanceToSave.updatedAt = new Date();

    return instanceToSave;
  }

  // 保存本地编辑的实例
  async function saveEditedInstance(): Promise<SendFrameInstance | null> {
    return state.withErrorHandling(async () => {
      const instanceToSave = prepareForSave();
      if (!instanceToSave) {
        throw new Error('没有可保存的实例数据');
      }

      // 检查ID是否被修改
      const originalId = state.currentInstanceId.value;
      const newId = instanceToSave.id;

      // 如果ID发生了变化，先检查是否有ID冲突
      if (originalId !== newId) {
        // 检查新ID是否已存在
        const existingInstance = state.instances.value.find(
          (instance) => instance.id === newId && instance.id !== originalId,
        );
        if (existingInstance) {
          throw new Error(`ID '${newId}' 已存在，请更换其他ID`);
        }
      }

      // 更新实例，如果ID变化了，需要删除旧实例并添加新实例
      if (originalId !== newId && originalId) {
        // 修改ID
        instanceToSave.id = newId;

        // 保存新实例并添加到列表中
        await dataStorageAPI.sendInstances.save(instanceToSave);

        // 查找旧实例在数组中的位置
        const index = state.instances.value.findIndex((item) => item.id === originalId);
        if (index !== -1) {
          // 直接在原位置替换，保持列表顺序不变
          state.instances.value.splice(index, 1, instanceToSave);
        } else {
          // 如果找不到旧实例，则添加到列表末尾
          state.instances.value.push(instanceToSave);
        }

        // 删除旧ID的记录（虽然已被替换，但后端可能还需要这个操作）
        await dataStorageAPI.sendInstances.delete(originalId);

        // 更新当前选中的实例ID
        state.currentInstanceId.value = newId;

        return instanceToSave;
      } else {
        // 使用现有的更新逻辑
        const updatedInstance = {
          ...instanceToSave,
          updatedAt: new Date(),
        };

        await dataStorageAPI.sendInstances.save(updatedInstance);

        // 更新本地数据
        const index = state.instances.value.findIndex((i) => i.id === instanceToSave.id);
        if (index !== -1) {
          state.instances.value[index] = updatedInstance;
        }

        return updatedInstance;
      }
    }, '保存编辑实例失败');
  }

  return {
    localInstance,
    editedId,
    editedDescription,
    hexValues,
    setCurrentInstance,
    updateFieldValue,
    prepareForSave,
    saveEditedInstance,
  };
}

/**
 * 帧实例导入导出功能
 */
export function useInstancesImportExport(state: ReturnType<typeof useInstancesState>) {
  // 从JSON导入
  async function importFromJSON(json: string): Promise<boolean | null> {
    return state.withErrorHandling(async () => {
      const data = JSON.parse(json) as SendFrameInstance[];

      // 验证导入数据
      if (!Array.isArray(data)) {
        throw new Error('导入数据格式不正确');
      }

      // 使用批量保存API
      await dataStorageAPI.sendInstances.saveAll(data);

      // 更新本地数据
      state.instances.value = data;
      return true;
    }, '导入发送实例失败');
  }

  return {
    importFromJSON,
  };
}

/**
 * 帧相关更新功能
 */
export function useInstanceFrameUpdates(
  state: ReturnType<typeof useInstancesState>,
  crudFunctions: ReturnType<typeof useInstancesCrud>,
) {
  // 根据帧ID更新相关实例
  async function updateInstancesByFrameId(frameId: string): Promise<void | null> {
    return state.withErrorHandling(async () => {
      const frameStore = useFrameTemplateStore();
      const frame = frameStore.frames.find((f) => f.id === frameId);
      if (!frame) {
        throw new Error('找不到对应的帧定义');
      }

      // 找出所有与该帧相关的实例
      const relatedInstances = state.instances.value.filter(
        (instance) => instance.frameId === frameId,
      );

      // 批量更新实例
      const updatePromises = relatedInstances.map((instance) => {
        // 更新后的实例
        const updatedInstance = createUpdatedInstanceFromFrame(instance, frame);
        return crudFunctions.updateInstance(updatedInstance);
      });

      await Promise.all(updatePromises);
    }, '更新关联发送实例失败');
  }

  // 创建根据帧更新的实例
  function createUpdatedInstanceFromFrame(
    instance: SendFrameInstance,
    frame: Frame,
  ): SendFrameInstance {
    // 计算可配置字段数量
    const configurableFields = frame.fields.filter((field) => field.configurable);

    // 创建更新后的字段数组
    const updatedFields: SendInstanceField[] = frame.fields.map((field) => {
      // 从field.options构建选项数组
      let options = field.options
        ? field.options.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))
        : [];

      // 如果是select或radio类型且没有选项，创建默认选项
      if ((field.inputType === 'select' || field.inputType === 'radio') && options.length === 0) {
        if (NUMBER_DATA_TYPES.includes(field.dataType)) {
          options = [
            { value: '0', label: '0' },
            { value: '1', label: '1' },
          ];
        } else {
          options = [
            { value: 'option1', label: '选项1' },
            { value: 'option2', label: '选项2' },
          ];
        }
      }

      // 查找当前实例中是否有该字段
      const existingField = instance.fields.find((f) => f.id === field.id);

      // 如果有，保留其value，更新其他属性
      if (existingField) {
        return {
          id: field.id,
          label: field.name,
          dataType: field.dataType,
          configurable: field.configurable || false,
          inputType: field.inputType,
          value: existingField.value,
          length: field.length,
          options: options,
        };
      }

      // 如果没有，创建新字段
      return {
        id: field.id,
        label: field.name,
        dataType: field.dataType,
        configurable: field.configurable || false,
        inputType: field.inputType,
        value: field.defaultValue || '',
        length: field.length,
        options: options,
      };
    });

    // 更新实例
    return {
      ...instance,
      label: instance.label || `${frame.name} 实例`,
      paramCount: configurableFields.length,
      updatedAt: new Date(),
      fields: updatedFields,
    };
  }

  return {
    updateInstancesByFrameId,
  };
}
