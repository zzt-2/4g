import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import { dataStorageAPI } from '../../api/common/dataStorageApi';
import { useFrameTemplateStore } from '../framesStore';
import type { SendFrameInstance } from '../../types/frames/sendInstances';
import type { Frame, FrameDirection } from '../../types/frames';
import { deepClone } from '../../utils/frames/frameUtils';
import { createSendFrameInstance } from '../../types/frames/sendInstanceFactories';
import type {
  ScoeReceiveCommand,
  ChecksumConfig,
  ScoeCommandParams,
  ScoeCommandParamsOption,
} from '../../types/scoe';
import { createDefaultReceiveCommand } from '../../types/scoe';

/**
 * SCOE 帧实例 Store
 * 独立管理 SCOE 帧实例的发送和接收
 */
export const useScoeFrameInstancesStore = defineStore('scoeFrameInstances', () => {
  const frameTemplateStore = useFrameTemplateStore();

  const direction = ref<FrameDirection>('send');

  // 发送帧实例列表
  const sendInstances = ref<SendFrameInstance[]>([]);

  // 接收指令列表
  const receiveCommands = shallowRef<ScoeReceiveCommand[]>([]);

  // 当前选中的发送帧实例ID
  const selectedSendInstanceId = ref<string>('');

  // 当前选中的接收指令ID
  const selectedReceiveCommandId = ref<string>('');

  // 本地编辑中的发送帧实例
  const localSendInstance = ref<SendFrameInstance | null>(null);

  // 本地编辑中的接收指令
  const localReceiveCommand = ref<ScoeReceiveCommand | null>(null);

  // 编辑中的ID和描述（发送帧）
  const editedId = ref<string>('');
  const editedDescription = ref<string>('');

  // UI 展开状态
  const expandedParamIds = ref<Set<string>>(new Set());
  const expandedInstanceIds = ref<Set<string>>(new Set());

  // 计算属性：可用的 SCOE 帧（发送方向）
  const availableSendFrames = computed(() => {
    return frameTemplateStore.frames.filter(
      (frame: Frame) => frame.isSCOEFrame && frame.direction === 'send',
    );
  });

  // 计算属性：可用的 SCOE 帧（接收方向）
  const availableReceiveFrames = computed(() => {
    return frameTemplateStore.frames.filter(
      (frame: Frame) => frame.isSCOEFrame && frame.direction === 'receive',
    );
  });

  // 计算属性：当前选中的发送帧实例
  const selectedSendInstance = computed(() => {
    return sendInstances.value.find((inst) => inst.id === selectedSendInstanceId.value);
  });

  // 计算属性：当前选中的接收指令
  const selectedReceiveCommand = computed(() => {
    return receiveCommands.value.find((cmd) => cmd.id === selectedReceiveCommandId.value);
  });

  // 加载发送帧实例
  const loadSendInstances = async () => {
    try {
      const result = await dataStorageAPI.scoeFramesSendInstances.list();
      sendInstances.value = (result as SendFrameInstance[]) || [];
      return { success: true };
    } catch (error) {
      console.error('加载 SCOE 发送帧实例失败:', error);
      return { success: false, message: error instanceof Error ? error.message : '加载失败' };
    }
  };

  // 保存所有发送帧实例
  const saveSendInstances = async () => {
    try {
      await dataStorageAPI.scoeFramesSendInstances.saveAll(
        sendInstances.value as unknown as unknown[],
      );
      return { success: true };
    } catch (error) {
      console.error('保存 SCOE 发送帧实例失败:', error);
      return { success: false, message: error instanceof Error ? error.message : '保存失败' };
    }
  };

  // 添加发送帧实例
  const addSendInstance = (frameId: string) => {
    const frame = frameTemplateStore.frames.find((f: Frame) => f.id === frameId);
    if (!frame) {
      return { success: false, message: '未找到对应的帧模板' };
    }

    // 生成新ID
    const existingIds = sendInstances.value
      .map((inst) => parseInt(inst.id))
      .filter((id) => !isNaN(id));
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newId = (maxId + 1).toString();

    // 创建新实例
    const newInstance = createSendFrameInstance(frame, newId);
    sendInstances.value.push(newInstance);
    selectedSendInstanceId.value = newId;

    // 更新本地编辑实例
    selectSendInstance(newId);

    return { success: true, instanceId: newId };
  };

  // 复制发送帧实例
  const duplicateSendInstance = (instanceId: string) => {
    const instance = sendInstances.value.find((inst) => inst.id === instanceId);
    if (!instance) return { success: false, message: '未找到对应的实例' };
    const newInstance = deepClone(instance);
    newInstance.id = (sendInstances.value.length + 1).toString();
    sendInstances.value.push(newInstance);
  };

  // 删除发送帧实例
  const deleteSendInstance = (instanceId: string) => {
    const index = sendInstances.value.findIndex((inst) => inst.id === instanceId);
    if (index !== -1) {
      sendInstances.value.splice(index, 1);

      // 如果删除的是当前选中的实例，清空选中状态
      if (selectedSendInstanceId.value === instanceId) {
        selectedSendInstanceId.value = '';
        localSendInstance.value = null;
      }
    }
  };

  // 选择发送帧实例
  const selectSendInstance = (instanceId: string) => {
    const instance = sendInstances.value.find((inst) => inst.id === instanceId);
    if (instance) {
      selectedSendInstanceId.value = instanceId;
      localSendInstance.value = deepClone(instance);
      editedId.value = instance.id;
      editedDescription.value = instance.description;
    }
  };

  // 更新字段值
  const updateFieldValue = (fieldId: string, value: string | number | null) => {
    if (!localSendInstance.value) return;

    const field = localSendInstance.value.fields.find((f) => f.id === fieldId);
    if (field) {
      field.value = value !== null ? String(value) : '';
    }
  };

  // 应用本地编辑到实例列表
  const applyLocalEdit = () => {
    if (!localSendInstance.value) return { success: false, message: '没有正在编辑的实例' };

    const instance = sendInstances.value.find((inst) => inst.id === selectedSendInstanceId.value);
    if (!instance) return { success: false, message: '未找到对应的实例' };

    // 更新ID和描述
    instance.id = editedId.value;
    instance.description = editedDescription.value;

    // 更新字段值
    instance.fields = deepClone(localSendInstance.value.fields);
    instance.updatedAt = new Date();

    // 如果ID变更，更新选中ID
    if (selectedSendInstanceId.value !== editedId.value) {
      selectedSendInstanceId.value = editedId.value;
    }

    return { success: true };
  };

  // 取消编辑
  const cancelEdit = () => {
    if (selectedSendInstanceId.value) {
      selectSendInstance(selectedSendInstanceId.value);
    } else {
      localSendInstance.value = null;
    }
  };

  // 保存当前实例
  const saveCurrentInstance = async () => {
    const applyResult = applyLocalEdit();
    if (!applyResult.success) return applyResult;

    return await saveSendInstances();
  };

  // 清空选中
  const clearSelection = () => {
    selectedSendInstanceId.value = '';
    selectedReceiveCommandId.value = '';
    localSendInstance.value = null;
    localReceiveCommand.value = null;
  };

  // ==================== 接收指令相关方法 ====================

  // 加载接收指令
  const loadReceiveCommands = async () => {
    try {
      const result = await dataStorageAPI.scoeFramesReceiveCommands.list();
      receiveCommands.value = (result as ScoeReceiveCommand[]) || [];
      return { success: true };
    } catch (error) {
      console.error('加载 SCOE 接收指令失败:', error);
      return { success: false, message: error instanceof Error ? error.message : '加载失败' };
    }
  };

  // 保存所有接收指令
  const saveReceiveCommands = async () => {
    try {
      await dataStorageAPI.scoeFramesReceiveCommands.saveAll(
        receiveCommands.value as unknown as unknown[],
      );
      return { success: true };
    } catch (error) {
      console.error('保存 SCOE 接收指令失败:', error);
      return { success: false, message: error instanceof Error ? error.message : '保存失败' };
    }
  };

  // 添加接收指令
  const addReceiveCommand = () => {
    // 生成新ID
    const existingIds = receiveCommands.value
      .map((cmd) => parseInt(cmd.id))
      .filter((id) => !isNaN(id));
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newId = (maxId + 1).toString();

    // 创建新指令
    const newCommand = createDefaultReceiveCommand(newId);
    receiveCommands.value.push(newCommand);
    selectedReceiveCommandId.value = newId;

    // 更新本地编辑指令
    selectReceiveCommand(newId);

    return { success: true, commandId: newId };
  };

  // 复制接收指令
  const duplicateReceiveCommand = (commandId: string) => {
    const command = receiveCommands.value.find((cmd) => cmd.id === commandId);
    if (!command) return { success: false, message: '未找到对应的指令' };
    const newCommand = deepClone(command);
    newCommand.id = (receiveCommands.value.length + 1).toString();
    receiveCommands.value = [...receiveCommands.value, newCommand];
  };

  // 删除接收指令
  const deleteReceiveCommand = (commandId: string) => {
    const index = receiveCommands.value.findIndex((cmd) => cmd.id === commandId);
    if (index !== -1) {
      receiveCommands.value.splice(index, 1);

      // 如果删除的是当前选中的指令，清空选中状态
      if (selectedReceiveCommandId.value === commandId) {
        selectedReceiveCommandId.value = '';
        localReceiveCommand.value = null;
      }
    }
  };

  // 选择接收指令
  const selectReceiveCommand = (commandId: string) => {
    const command = receiveCommands.value.find((cmd) => cmd.id === commandId);
    if (command) {
      selectedReceiveCommandId.value = commandId;
      localReceiveCommand.value = deepClone(command);
      expandedParamIds.value.clear();
      expandedInstanceIds.value.clear();
    }
  };

  // 更新接收指令字段
  const updateReceiveCommandField = (
    field: keyof ScoeReceiveCommand,
    value: string | number | undefined,
  ) => {
    if (!localReceiveCommand.value) return;
    // @ts-expect-error - 动态字段更新，类型检查会在运行时保证
    localReceiveCommand.value[field] = value;
  };

  // 应用接收指令编辑
  const applyReceiveCommandEdit = () => {
    if (!localReceiveCommand.value) return { success: false, message: '没有正在编辑的指令' };

    const command = receiveCommands.value.find((cmd) => cmd.id === selectedReceiveCommandId.value);
    if (!command) return { success: false, message: '未找到对应的指令' };

    // 更新所有字段
    Object.assign(command, {
      ...localReceiveCommand.value,
      updatedAt: new Date(),
    });

    // 如果ID变更，更新选中ID
    if (selectedReceiveCommandId.value !== localReceiveCommand.value.id) {
      selectedReceiveCommandId.value = localReceiveCommand.value.id;
    }

    receiveCommands.value = [...receiveCommands.value];

    return { success: true };
  };

  // 保存当前接收指令
  const saveCurrentReceiveCommand = async () => {
    const applyResult = applyReceiveCommandEdit();
    await saveReceiveCommands();
    return applyResult;
  };

  // 取消接收指令编辑
  const cancelReceiveCommandEdit = () => {
    if (selectedReceiveCommandId.value) {
      selectReceiveCommand(selectedReceiveCommandId.value);
    } else {
      localReceiveCommand.value = null;
    }
  };

  // 初始化
  const initialize = async () => {
    await loadSendInstances();
    await loadReceiveCommands();
  };

  // ==================== 校验和管理 ====================
  const addChecksum = () => {
    if (!localReceiveCommand.value) return;
    if (!localReceiveCommand.value.checksums) {
      localReceiveCommand.value.checksums = [];
    }
    localReceiveCommand.value.checksums.push({
      enabled: true,
      offset: 0,
      length: 0,
      checksumOffset: 0,
    });
  };

  const deleteChecksum = (checksumIndex: number) => {
    if (!localReceiveCommand.value?.checksums) return;
    localReceiveCommand.value.checksums.splice(checksumIndex, 1);
  };

  const updateChecksum = (checksumIndex: number, updates: Partial<ChecksumConfig>) => {
    if (!localReceiveCommand.value?.checksums?.[checksumIndex]) return;
    Object.assign(localReceiveCommand.value.checksums[checksumIndex], updates);
  };

  // ==================== 参数管理 ====================
  const addParam = () => {
    if (!localReceiveCommand.value) return;
    if (!localReceiveCommand.value.params) {
      localReceiveCommand.value.params = [];
    }
    const newId = `param_${Date.now()}`;
    localReceiveCommand.value.params.push({
      id: newId,
      label: '新参数',
      value: '',
      type: 'string',
      offset: 0,
      length: 1,
      options: [],
    });
  };

  const deleteParam = (paramId: string) => {
    if (!localReceiveCommand.value?.params) return;
    const index = localReceiveCommand.value.params.findIndex((p) => p.id === paramId);
    if (index !== -1) {
      localReceiveCommand.value.params.splice(index, 1);
      expandedParamIds.value.delete(paramId);
    }
  };

  const updateParam = (paramId: string, updates: Partial<ScoeCommandParams>) => {
    if (!localReceiveCommand.value?.params) return;
    const param = localReceiveCommand.value.params.find((p) => p.id === paramId);
    if (param) {
      Object.assign(param, updates);
    }
  };

  const toggleParamExpansion = (paramId: string) => {
    if (expandedParamIds.value.has(paramId)) {
      expandedParamIds.value.delete(paramId);
    } else {
      expandedParamIds.value.add(paramId);
    }
  };

  // ==================== 选项管理 ====================
  const addParamOption = (paramId: string) => {
    if (!localReceiveCommand.value?.params) return;
    const param = localReceiveCommand.value.params.find((p) => p.id === paramId);
    if (param) {
      param.options.push({
        label: '新选项',
        value: '',
        receiveCode: '00',
      });
    }
  };

  const deleteParamOption = (paramId: string, optionIndex: number) => {
    if (!localReceiveCommand.value?.params) return;
    const param = localReceiveCommand.value.params.find((p) => p.id === paramId);
    if (param?.options) {
      param.options.splice(optionIndex, 1);
    }
  };

  const updateParamOption = (
    paramId: string,
    optionIndex: number,
    updates: Partial<ScoeCommandParamsOption>,
  ) => {
    if (!localReceiveCommand.value?.params) return;
    const param = localReceiveCommand.value.params.find((p) => p.id === paramId);
    if (param?.options?.[optionIndex]) {
      Object.assign(param.options[optionIndex], updates);
    }
  };

  // ==================== 帧实例管理（接收指令用） ====================
  const addFrameInstanceToCommand = (frameId: string) => {
    if (!localReceiveCommand.value) return { success: false, message: '没有正在编辑的指令' };
    const frame = frameTemplateStore.frames.find((f: Frame) => f.id === frameId);
    if (!frame) {
      return { success: false, message: '未找到对应的帧模板' };
    }

    if (!localReceiveCommand.value.frameInstances) {
      localReceiveCommand.value.frameInstances = [];
    }

    const newInstance = createSendFrameInstance(frame, `${Date.now()}`);
    localReceiveCommand.value.frameInstances.push(newInstance);

    return { success: true, instanceIndex: localReceiveCommand.value.frameInstances.length - 1 };
  };

  const deleteFrameInstanceFromCommand = (instanceIndex: number) => {
    if (!localReceiveCommand.value?.frameInstances) return;
    localReceiveCommand.value.frameInstances.splice(instanceIndex, 1);
    expandedInstanceIds.value.delete(String(instanceIndex));
  };

  const duplicateFrameInstance = (instanceIndex: number) => {
    if (!localReceiveCommand.value?.frameInstances?.[instanceIndex]) return;
    const original = localReceiveCommand.value.frameInstances[instanceIndex];
    const duplicate = deepClone(original);
    duplicate.id = `${Date.now()}`;
    localReceiveCommand.value.frameInstances.push(duplicate);
  };

  const updateFrameInstanceField = (
    instanceIndex: number,
    fieldId: string,
    value: string | number | null,
  ) => {
    if (!localReceiveCommand.value?.frameInstances?.[instanceIndex]) return;
    const instance = localReceiveCommand.value.frameInstances[instanceIndex];
    const field = instance.fields.find((f) => f.id === fieldId);
    if (field) {
      field.value = value !== null ? String(value) : '';
    }
  };

  const toggleInstanceExpansion = (instanceIndex: number) => {
    const key = String(instanceIndex);
    if (expandedInstanceIds.value.has(key)) {
      expandedInstanceIds.value.delete(key);
    } else {
      expandedInstanceIds.value.add(key);
    }
  };

  return {
    // 状态
    direction,
    sendInstances,
    receiveCommands,
    selectedSendInstanceId,
    selectedReceiveCommandId,
    localSendInstance,
    localReceiveCommand,
    editedId,
    editedDescription,

    // 计算属性
    availableSendFrames,
    availableReceiveFrames,
    selectedSendInstance,
    selectedReceiveCommand,

    // 初始化
    initialize,

    // 发送帧方法
    loadSendInstances,
    saveSendInstances,
    addSendInstance,
    duplicateSendInstance,
    deleteSendInstance,
    selectSendInstance,
    updateFieldValue,
    applyLocalEdit,
    cancelEdit,
    saveCurrentInstance,

    // 接收指令方法
    loadReceiveCommands,
    saveReceiveCommands,
    addReceiveCommand,
    duplicateReceiveCommand,
    deleteReceiveCommand,
    selectReceiveCommand,
    updateReceiveCommandField,
    applyReceiveCommandEdit,
    saveCurrentReceiveCommand,
    cancelReceiveCommandEdit,

    // 通用方法
    clearSelection,

    // 展开状态
    expandedParamIds,
    expandedInstanceIds,

    // 校验和管理
    addChecksum,
    deleteChecksum,
    updateChecksum,

    // 参数管理
    addParam,
    deleteParam,
    updateParam,
    toggleParamExpansion,

    // 选项管理
    addParamOption,
    deleteParamOption,
    updateParamOption,

    // 帧实例管理（接收指令用）
    addFrameInstanceToCommand,
    deleteFrameInstanceFromCommand,
    duplicateFrameInstance,
    updateFrameInstanceField,
    toggleInstanceExpansion,
  };
});
