/**
 * 设置相关的类型定义
 */

// 应用设置
export interface AppSettings {
  theme: string;
  language: string;
  dataPath: string;
  autoSave: boolean;
  autoDarkMode: boolean;
  checkForUpdates: boolean;
  startWithOS: boolean;
  minimizeToTray: boolean;
  saveWindowPosition: boolean;
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// 串口设置
export interface SerialSettings {
  defaultBaudRate: number;
  defaultDataBits: 5 | 6 | 7 | 8;
  defaultParity: string;
  defaultStopBits: 1 | 2 | 1.5;
  defaultFlowControl: string;
  maxBufferSize: number;
  defaultAutoScroll: boolean;
  autoReconnect: boolean;
  reconnectAttempts: number;
  reconnectDelay: number;
  commandTimeout: number;
  loggingEnabled: boolean;
  logRotation: 'daily' | 'weekly' | 'monthly' | 'none';
  maxLogSize: number;
}

// 主题定义
export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'system';
  backgroundColor: string;
  headerColor: string;
  sidebarColor: string;
  contentColor: string;
  textColor: string;
  accentColor: string;
  borderColor: string;
  statusBarColor: string;
  buttonColor: string;
  buttonTextColor: string;
  inputBackgroundColor: string;
  inputTextColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  infoColor: string;
}

// 语言选项
export interface LanguageOption {
  id: string;
  name: string;
  code: string;
  flag: string;
}

// 窗口设置
export interface WindowSettings {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// 快捷键配置
export interface ShortcutConfig {
  connect: string;
  disconnect: string;
  clearData: string;
  saveData: string;
  reloadPorts: string;
}

// 导出设置
export interface ExportSettings {
  defaultFormat: 'csv' | 'txt' | 'json' | 'xlsx';
  defaultPath: string;
  includeTimestamps: boolean;
  includeHeaders: boolean;
  dateFormat: string;
}

// 网络设置
export interface NetworkSettings {
  proxyEnabled: boolean;
  proxyAddress?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
  timeout: number;
}
