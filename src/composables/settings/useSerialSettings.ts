/**
 * 串口设置相关的组合式API
 */
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settingsStore';
import { storeToRefs } from 'pinia';
import type { SerialSettings } from '../../types/settings';

export const useSerialSettings = () => {
  const settingsStore = useSettingsStore();

  // 从store中提取响应式状态
  const { serialSettings, isLoading, hasChanges, lastError } = storeToRefs(settingsStore);

  // 本地状态
  const editingSettings = ref<Partial<SerialSettings>>({});
  const isEditing = ref(false);

  // 计算属性：默认波特率
  const defaultBaudRate = computed(() => serialSettings.value.defaultBaudRate);

  // 计算属性：默认数据位
  const defaultDataBits = computed(() => serialSettings.value.defaultDataBits);

  // 计算属性：默认校验位
  const defaultParity = computed(() => serialSettings.value.defaultParity);

  // 计算属性：默认停止位
  const defaultStopBits = computed(() => serialSettings.value.defaultStopBits);

  // 计算属性：默认流控制
  const defaultFlowControl = computed(() => serialSettings.value.defaultFlowControl);

  // 计算属性：最大缓冲区大小
  const maxBufferSize = computed(() => serialSettings.value.maxBufferSize);

  // 计算属性：默认自动滚动
  const defaultAutoScroll = computed(() => serialSettings.value.defaultAutoScroll);

  // 计算属性：自动重连
  const autoReconnect = computed(() => serialSettings.value.autoReconnect);

  // 开始编辑
  const startEditing = () => {
    editingSettings.value = { ...serialSettings.value };
    isEditing.value = true;
  };

  // 取消编辑
  const cancelEditing = () => {
    editingSettings.value = {};
    isEditing.value = false;
  };

  // 保存设置
  const saveSettings = async () => {
    try {
      await settingsStore.updateSerialSettings(editingSettings.value);
      isEditing.value = false;
    } catch (error) {
      console.error('保存串口设置失败:', error);
    }
  };

  // 更新波特率
  const updateBaudRate = async (baudRate: number) => {
    try {
      await settingsStore.updateSerialSettings({
        defaultBaudRate: baudRate,
      });
    } catch (error) {
      console.error('更新波特率失败:', error);
    }
  };

  // 更新数据位
  const updateDataBits = async (dataBits: 5 | 6 | 7 | 8) => {
    try {
      await settingsStore.updateSerialSettings({
        defaultDataBits: dataBits,
      });
    } catch (error) {
      console.error('更新数据位失败:', error);
    }
  };

  // 更新校验位
  const updateParity = async (parity: string) => {
    try {
      await settingsStore.updateSerialSettings({
        defaultParity: parity,
      });
    } catch (error) {
      console.error('更新校验位失败:', error);
    }
  };

  // 更新停止位
  const updateStopBits = async (stopBits: 1 | 2 | 1.5) => {
    try {
      await settingsStore.updateSerialSettings({
        defaultStopBits: stopBits,
      });
    } catch (error) {
      console.error('更新停止位失败:', error);
    }
  };

  // 更新流控制
  const updateFlowControl = async (flowControl: string) => {
    try {
      await settingsStore.updateSerialSettings({
        defaultFlowControl: flowControl,
      });
    } catch (error) {
      console.error('更新流控制失败:', error);
    }
  };

  // 更新最大缓冲区大小
  const updateMaxBufferSize = async (size: number) => {
    try {
      await settingsStore.updateSerialSettings({
        maxBufferSize: size,
      });
    } catch (error) {
      console.error('更新最大缓冲区大小失败:', error);
    }
  };

  // 更新自动滚动
  const updateAutoScroll = async (autoScroll: boolean) => {
    try {
      await settingsStore.updateSerialSettings({
        defaultAutoScroll: autoScroll,
      });
    } catch (error) {
      console.error('更新自动滚动失败:', error);
    }
  };

  // 更新自动重连
  const updateAutoReconnect = async (autoReconnect: boolean) => {
    try {
      await settingsStore.updateSerialSettings({
        autoReconnect,
      });
    } catch (error) {
      console.error('更新自动重连失败:', error);
    }
  };

  return {
    // 状态
    serialSettings,
    editingSettings,
    isEditing,
    isLoading,
    hasChanges,
    lastError,
    defaultBaudRate,
    defaultDataBits,
    defaultParity,
    defaultStopBits,
    defaultFlowControl,
    maxBufferSize,
    defaultAutoScroll,
    autoReconnect,

    // 方法
    startEditing,
    cancelEditing,
    saveSettings,
    updateBaudRate,
    updateDataBits,
    updateParity,
    updateStopBits,
    updateFlowControl,
    updateMaxBufferSize,
    updateAutoScroll,
    updateAutoReconnect,
  };
};
