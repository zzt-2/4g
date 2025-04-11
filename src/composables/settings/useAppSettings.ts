/**
 * 应用设置相关的组合式API
 */
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settingsStore';
import { storeToRefs } from 'pinia';
import type { AppSettings } from '../../types/settings';

export const useAppSettings = () => {
  const settingsStore = useSettingsStore();

  // 从store中提取响应式状态
  const { appSettings, isLoading, hasChanges, lastError } = storeToRefs(settingsStore);

  // 本地状态
  const editingSettings = ref<Partial<AppSettings>>({});
  const isEditing = ref(false);

  // 计算属性：当前主题
  const currentTheme = computed(() => appSettings.value.theme);

  // 计算属性：当前语言
  const currentLanguage = computed(() => appSettings.value.language);

  // 计算属性：数据存储路径
  const dataPath = computed(() => appSettings.value.dataPath);

  // 开始编辑
  const startEditing = () => {
    editingSettings.value = { ...appSettings.value };
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
      await settingsStore.updateAppSettings(editingSettings.value);
      isEditing.value = false;
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  };

  // 更新主题
  const updateTheme = async (theme: string) => {
    try {
      await settingsStore.updateTheme(theme);
    } catch (error) {
      console.error('更新主题失败:', error);
    }
  };

  // 更新语言
  const updateLanguage = async (language: string) => {
    try {
      await settingsStore.updateLanguage(language);
    } catch (error) {
      console.error('更新语言失败:', error);
    }
  };

  // 更新数据存储路径
  const updateDataPath = async (path: string) => {
    try {
      await settingsStore.updateDataPath(path);
    } catch (error) {
      console.error('更新数据存储路径失败:', error);
    }
  };

  return {
    // 状态
    settings: appSettings,
    editingSettings,
    isEditing,
    isLoading,
    hasChanges,
    lastError,
    currentTheme,
    currentLanguage,
    dataPath,

    // 方法
    startEditing,
    cancelEditing,
    saveSettings,
    updateTheme,
    updateLanguage,
    updateDataPath,
  };
};
