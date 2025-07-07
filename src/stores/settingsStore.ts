/**
 * 应用设置状态管理Store
 */

import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';

export const useSettingsStore = defineStore('settings', () => {
  // 自动开始记录设置
  const autoStartRecording = useStorage('settings.autoStartRecording', true);

  // CSV导出默认路径
  const csvDefaultOutputPath = useStorage('settings.csvDefaultOutputPath', '');

  // CSV保存间隔
  const csvSaveInterval = useStorage('settings.csvSaveInterval', 5);

  return {
    autoStartRecording,
    csvDefaultOutputPath,
    csvSaveInterval,
  };
});
