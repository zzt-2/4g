import type { SettingsPatch, SettingsSnapshot } from '../core';

export const defaultSettingsFixture: SettingsSnapshot = {
  schemaVersion: 1,
  recording: {
    autoStartRecording: true,
    csvDefaultOutputPath: '',
    csvSaveIntervalMinutes: 5,
  },
  storage: {
    maxHistoryHours: 24,
    enableAutoSave: true,
    enableHistoryStorage: true,
  },
  general: {
    updateInterval: 1000,
  },
};

export const partialSettingsInputSample = {
  recording: {
    csvDefaultOutputPath: 'D:/dongfanghong/csv',
  },
  storage: {
    maxHistoryHours: 48,
  },
} as const;

export const legacyLikeSettingsInputSample = {
  'settings.autoStartRecording': false,
  'settings.csvDefaultOutputPath': 'D:/legacy/csv',
  'settings.csvSaveInterval': 0.5,
  maxHistoryHours: 12,
  enableAutoSave: false,
  updateInterval: 500,
  statusIndicatorSettings: {
    isEnabled: true,
    indicators: [
      {
        id: 'indicator_voltage',
        label: 'Voltage',
        groupId: 1,
        dataItemId: 2,
        defaultColor: '#6b7280',
      },
    ],
  },
  'chart-performance-config': {
    maxPoints: 500,
    refreshInterval: 200,
  },
  historyAnalysis_chartSettings: {
    charts: [],
  },
  'default-serial-options': {
    baudRate: 115200,
  },
  'last-used-port': 'COM3',
} as const;

export const invalidSettingsInputSample = {
  recording: {
    autoStartRecording: 'yes',
    csvDefaultOutputPath: 42,
    csvSaveIntervalMinutes: -1,
    transientRuntimeFlag: true,
  },
  storage: {
    maxHistoryHours: -5,
    enableAutoSave: 'no',
    enableHistoryStorage: 1,
  },
  general: {
    updateInterval: 0,
  },
  statusRuntime: {
    currentColor: 'green',
  },
} as const;

export const updateSettingsPatchSample: SettingsPatch = {
  recording: {
    autoStartRecording: false,
    csvDefaultOutputPath: 'E:/exports',
    csvSaveIntervalMinutes: 2.5,
  },
  storage: {
    maxHistoryHours: 72,
    enableAutoSave: false,
  },
  general: {
    updateInterval: 200,
  },
};
