import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  SerialSettings,
  AppearanceSettings,
  AdvancedSettings,
  Theme,
} from "../types/settings";

export const useSettingsStore = defineStore("settings", () => {
  // 预定义主题
  const availableThemes: Theme[] = [
    {
      id: "dark",
      name: "深色主题",
      backgroundColor: "#121212",
      headerColor: "#1E1E1E",
      sidebarColor: "#1A1A1A",
      contentColor: "#232323",
      textColor: "#E2E8F0",
      accentColor: "#3B82F6",
    },
    {
      id: "blue",
      name: "蓝色主题",
      backgroundColor: "#0A1929",
      headerColor: "#0D2341",
      sidebarColor: "#0B1C33",
      contentColor: "#0E2A4B",
      textColor: "#E2E8F0",
      accentColor: "#3B82F6",
    },
    {
      id: "green",
      name: "绿色主题",
      backgroundColor: "#0A1F1A",
      headerColor: "#0D3325",
      sidebarColor: "#0B1F15",
      contentColor: "#0E382A",
      textColor: "#E2E8F0",
      accentColor: "#10B981",
    },
    {
      id: "light",
      name: "浅色主题",
      backgroundColor: "#F5F5F5",
      headerColor: "#FFFFFF",
      sidebarColor: "#EEEEEE",
      contentColor: "#FFFFFF",
      textColor: "#1E293B",
      accentColor: "#3B82F6",
    },
  ];

  // 串口默认设置
  const defaultSerialSettings: SerialSettings = {
    defaultBaudRate: 9600,
    defaultDataBits: 8,
    defaultParity: "none",
    defaultStopBits: 1,
    defaultFlowControl: "none",
    maxBufferSize: 1000,
    defaultAutoScroll: true,
    autoReconnect: true,
  };

  // 外观默认设置
  const defaultAppearanceSettings: AppearanceSettings = {
    theme: "dark",
    fontSize: 14,
    showStatusBar: true,
    showTooltips: true,
    compactMode: false,
  };

  // 高级默认设置
  const defaultAdvancedSettings: AdvancedSettings = {
    frameUpdateInterval: 64,
    logLevel: "info",
    hardwareAcceleration: true,
    dataStoragePath: "/users/data",
    autoBackupInterval: 30,
  };

  // 状态
  const serialSettings = ref<SerialSettings>({ ...defaultSerialSettings });
  const appearanceSettings = ref<AppearanceSettings>({
    ...defaultAppearanceSettings,
  });
  const advancedSettings = ref<AdvancedSettings>({
    ...defaultAdvancedSettings,
  });
  const isLoading = ref(false);
  const hasChanges = ref(false);
  const lastError = ref<string | null>(null);

  // 计算属性
  const currentTheme = computed(
    () =>
      availableThemes.find(
        (theme) => theme.id === appearanceSettings.value.theme
      ) || availableThemes[0]
  );

  const cssVariables = computed(() => {
    const theme = currentTheme.value;
    return {
      "--background-color": theme.backgroundColor,
      "--header-color": theme.headerColor,
      "--sidebar-color": theme.sidebarColor,
      "--content-color": theme.contentColor,
      "--text-color": theme.textColor,
      "--accent-color": theme.accentColor,
      "--font-size": `${appearanceSettings.value.fontSize}px`,
      "--spacing-factor": appearanceSettings.value.compactMode ? "0.8" : "1",
    };
  });

  // 方法
  const loadSettings = async () => {
    try {
      isLoading.value = true;
      lastError.value = null;

      // 在实际应用中，这里会从数据存储加载设置
      // 模拟加载过程
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 在实际应用中，这里会设置加载的设置
      // 目前只使用默认设置

      isLoading.value = false;
      hasChanges.value = false;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      isLoading.value = false;
    }
  };

  const updateSerialSettings = (updates: Partial<SerialSettings>) => {
    serialSettings.value = { ...serialSettings.value, ...updates };
    hasChanges.value = true;
  };

  const updateAppearanceSettings = (updates: Partial<AppearanceSettings>) => {
    appearanceSettings.value = { ...appearanceSettings.value, ...updates };
    hasChanges.value = true;
  };

  const updateAdvancedSettings = (updates: Partial<AdvancedSettings>) => {
    advancedSettings.value = { ...advancedSettings.value, ...updates };
    hasChanges.value = true;
  };

  const saveSettings = async () => {
    try {
      isLoading.value = true;
      lastError.value = null;

      // 在实际应用中，这里会将设置保存到数据存储
      // 模拟保存过程
      await new Promise((resolve) => setTimeout(resolve, 300));

      hasChanges.value = false;
      isLoading.value = false;
      return true;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      isLoading.value = false;
      return false;
    }
  };

  const resetSettings = async () => {
    serialSettings.value = { ...defaultSerialSettings };
    appearanceSettings.value = { ...defaultAppearanceSettings };
    advancedSettings.value = { ...defaultAdvancedSettings };
    hasChanges.value = true;

    return await saveSettings();
  };

  const setDataStoragePath = (path: string) => {
    advancedSettings.value.dataStoragePath = path;
    hasChanges.value = true;
  };

  const backupSettings = async () => {
    try {
      isLoading.value = true;
      lastError.value = null;

      // 在实际应用中，这里会将设置备份到指定位置
      // 模拟备份过程
      await new Promise((resolve) => setTimeout(resolve, 500));

      isLoading.value = false;
      return true;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      isLoading.value = false;
      return false;
    }
  };

  // 初始化：应用CSS变量
  const applyTheme = () => {
    const variables = cssVariables.value;
    Object.entries(variables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  };

  return {
    // 状态
    serialSettings,
    appearanceSettings,
    advancedSettings,
    availableThemes,
    isLoading,
    hasChanges,
    lastError,

    // 计算属性
    currentTheme,
    cssVariables,

    // 方法
    loadSettings,
    updateSerialSettings,
    updateAppearanceSettings,
    updateAdvancedSettings,
    saveSettings,
    resetSettings,
    setDataStoragePath,
    backupSettings,
    applyTheme,
  };
});
