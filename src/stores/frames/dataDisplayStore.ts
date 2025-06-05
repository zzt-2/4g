/**
 * 数据显示状态管理Store
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  TableConfig,
  DisplaySettings,
  DataRecord,
  CSVBatchData,
  RecordingStatus,
  TableRowData,
} from '../../types/frames/dataDisplay';
import { useReceiveFramesStore } from './receiveFramesStore';
import { convertToHex } from '../../utils/frames/hexCovertUtils';
import { getHourKey, isNewHour } from '../../utils/common/dateUtils';
import { generateCSVContent } from '../../utils/csv/csvUtils';
import { csvAPI } from '../../utils/electronApi';
import { useStorage } from '@vueuse/core';

export const useDataDisplayStore = defineStore('dataDisplay', () => {
  // 表格配置
  const table1Config = useStorage<TableConfig>('table1Config', {
    selectedGroupId: null,
    displayMode: 'table',
    chartSelectedItems: [],
  });

  const table2Config = useStorage<TableConfig>('table2Config', {
    selectedGroupId: null,
    displayMode: 'table',
    chartSelectedItems: [],
  });

  // 显示设置
  const displaySettings = useStorage<DisplaySettings>('displaySettings', {
    updateInterval: 1000, // 1秒更新间隔
    csvSaveInterval: 5 * 60 * 1000, // 5分钟保存间隔
    maxHistoryHours: 24, // 24小时历史记录
    enableAutoSave: true,
    enableRecording: false,
  });

  // 历史数据（用于折线图，内存中保持连续）
  const historyRecords = ref<DataRecord[]>([]);

  // CSV批量数据（按小时分组）
  const csvBatches = ref<Map<string, CSVBatchData>>(new Map());

  // 记录状态
  const recordingStatus = ref<RecordingStatus>({
    isRecording: false,
    startTime: null,
    recordCount: 0,
    lastRecordTime: 0,
    currentHour: '',
  });

  // 定时器管理
  const timers = ref<{
    update: NodeJS.Timeout | null;
    csvSave: NodeJS.Timeout | null;
    cleanup: NodeJS.Timeout | null;
  }>({
    update: null,
    csvSave: null,
    cleanup: null,
  });

  // 获取接收帧Store
  const receiveFramesStore = useReceiveFramesStore();

  // 计算属性：可用分组列表
  const availableGroups = computed(() => {
    return receiveFramesStore.groups.map((group) => ({
      id: group.id,
      label: group.label,
      itemCount: group.dataItems.length,
    }));
  });

  // 方法：获取表格数据
  const getTableData = (groupId: number): TableRowData[] => {
    const group = receiveFramesStore.groups.find((g) => g.id === groupId);
    if (!group) return [];

    // 只返回可见的数据项
    const visibleItems = group.dataItems.filter((item) => item.isVisible);

    return visibleItems.map((item, index) => ({
      index: index + 1, // 重新编号，从1开始
      label: item.label,
      displayValue: item.displayValue || '-',
      hexValue: convertToHex(String(item.value || ''), item.dataType),
      dataItemId: item.id,
      isVisible: item.isVisible,
      isFavorite: item.isFavorite || false,
    }));
  };

  // 方法：收集当前数据
  const collectCurrentData = (): void => {
    const timestamp = Date.now();
    const currentHour = getHourKey(timestamp);

    // 检查是否跨越小时边界
    if (
      recordingStatus.value.lastRecordTime > 0 &&
      isNewHour(recordingStatus.value.lastRecordTime, timestamp)
    ) {
      console.log(`小时边界检测：从 ${recordingStatus.value.currentHour} 切换到 ${currentHour}`);

      // 保存上一小时的剩余数据到CSV文件
      if (recordingStatus.value.isRecording) {
        saveCurrentCSVBatch(recordingStatus.value.currentHour);
      }
    }

    // 更新记录状态
    recordingStatus.value.currentHour = currentHour;
    recordingStatus.value.lastRecordTime = timestamp;

    // 只有在记录时才增加计数
    if (recordingStatus.value.isRecording) {
      recordingStatus.value.recordCount++;
    }

    // 为每个有数据的分组创建记录
    receiveFramesStore.groups.forEach((group) => {
      if (group.dataItems.length === 0) return;

      const dataRecord: DataRecord = {
        timestamp,
        groupId: group.id,
        dataItems: group.dataItems.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          displayValue: item.displayValue || '-',
          hexValue: convertToHex(String(item.value || ''), item.dataType),
        })),
      };

      // 总是添加到历史记录（用于折线图显示）
      historyRecords.value.push(dataRecord);

      // 只有在记录时才添加到CSV批次数据
      if (recordingStatus.value.isRecording) {
        if (!csvBatches.value.has(currentHour)) {
          csvBatches.value.set(currentHour, {
            hourKey: currentHour,
            records: [],
            lastSaveTime: timestamp,
          });
        }

        csvBatches.value.get(currentHour)!.records.push(dataRecord);
      }
    });

    if (recordingStatus.value.isRecording) {
      console.log(
        `数据收集完成：记录数 ${recordingStatus.value.recordCount}，当前小时 ${currentHour}`,
      );
    }
  };

  // 方法：启动数据收集定时器（常开）
  const startDataCollection = (): void => {
    if (timers.value.update) return; // 避免重复启动

    // 数据收集定时器（每秒执行，常开）
    timers.value.update = setInterval(() => {
      collectCurrentData();
    }, displaySettings.value.updateInterval);

    console.log('数据收集定时器已启动（常开模式）');
  };

  // 方法：停止数据收集定时器
  const stopDataCollection = (): void => {
    if (timers.value.update) {
      clearInterval(timers.value.update);
      timers.value.update = null;
      console.log('数据收集定时器已停止');
    }
  };

  // 方法：启动记录相关定时器
  const startRecordingTimers = (): void => {
    // 清理现有记录定时器
    stopRecordingTimers();

    // CSV保存定时器（每5分钟执行）
    timers.value.csvSave = setInterval(() => {
      if (recordingStatus.value.isRecording) {
        // 批量保存CSV数据
        saveAllCSVBatches();
      }
    }, displaySettings.value.csvSaveInterval);

    // 清理定时器（每小时执行一次，清理过期数据）
    timers.value.cleanup = setInterval(
      () => {
        cleanHistoryRecords();
      },
      60 * 60 * 1000,
    ); // 1小时

    console.log('记录相关定时器已启动');
  };

  // 方法：停止记录相关定时器
  const stopRecordingTimers = (): void => {
    if (timers.value.csvSave) {
      clearInterval(timers.value.csvSave);
      timers.value.csvSave = null;
    }
    if (timers.value.cleanup) {
      clearInterval(timers.value.cleanup);
      timers.value.cleanup = null;
    }
    console.log('记录相关定时器已停止');
  };

  // 方法：更新表格1配置
  const updateTable1Config = (config: Partial<TableConfig>): void => {
    Object.assign(table1Config.value, config);
  };

  // 方法：更新表格2配置
  const updateTable2Config = (config: Partial<TableConfig>): void => {
    Object.assign(table2Config.value, config);
  };

  // 方法：更新显示设置
  const updateDisplaySettings = (settings: Partial<DisplaySettings>): void => {
    Object.assign(displaySettings.value, settings);
  };

  // 方法：开始记录
  const startRecording = (): void => {
    if (recordingStatus.value.isRecording) return;

    const now = Date.now();
    recordingStatus.value.isRecording = true;
    recordingStatus.value.startTime = now;
    recordingStatus.value.recordCount = 0;
    recordingStatus.value.lastRecordTime = 0;
    recordingStatus.value.currentHour = getHourKey(now);

    // 启动记录相关定时器
    startRecordingTimers();

    console.log('开始数据记录，当前小时：', recordingStatus.value.currentHour);
  };

  // 方法：停止记录
  const stopRecording = (): void => {
    if (!recordingStatus.value.isRecording) return;

    // 保存剩余的CSV数据
    saveAllCSVBatches();

    recordingStatus.value.isRecording = false;
    recordingStatus.value.startTime = null;

    // 停止记录相关定时器（但保持数据收集定时器运行）
    stopRecordingTimers();

    console.log('停止数据记录');
  };

  // 方法：获取当前小时键（保留原有方法以保持兼容性）
  const getCurrentHourKey = (): string => {
    return getHourKey();
  };

  // 方法：清理过期历史数据
  const cleanHistoryRecords = (): void => {
    const cutoff = Date.now() - displaySettings.value.maxHistoryHours * 60 * 60 * 1000;
    const beforeCount = historyRecords.value.length;
    historyRecords.value = historyRecords.value.filter((record) => record.timestamp > cutoff);
    const afterCount = historyRecords.value.length;

    if (beforeCount !== afterCount) {
      console.log(`清理过期历史数据：${beforeCount} -> ${afterCount}`);
    }
  };

  // 方法：清空指定分组的历史数据
  const clearGroupHistoryRecords = (groupId: number): void => {
    const beforeCount = historyRecords.value.length;
    historyRecords.value = historyRecords.value.filter((record) => record.groupId !== groupId);
    const afterCount = historyRecords.value.length;

    console.log(`清空分组 ${groupId} 历史数据：${beforeCount} -> ${afterCount}`);
  };

  // 方法：清空表格1的历史数据
  const clearTable1History = (): void => {
    if (table1Config.value.selectedGroupId) {
      clearGroupHistoryRecords(table1Config.value.selectedGroupId);
    }
  };

  // 方法：清空表格2的历史数据
  const clearTable2History = (): void => {
    if (table2Config.value.selectedGroupId) {
      clearGroupHistoryRecords(table2Config.value.selectedGroupId);
    }
  };

  // 方法：保存当前CSV批次数据
  const saveCurrentCSVBatch = async (hourKey: string): Promise<void> => {
    const batch = csvBatches.value.get(hourKey);
    if (!batch || batch.records.length === 0) {
      console.log(`没有数据需要保存：${hourKey}`);
      return;
    }

    try {
      // 创建分组标签映射
      const groupLabels = new Map<number, string>();
      receiveFramesStore.groups.forEach((group) => {
        groupLabels.set(group.id, group.label);
      });

      // 生成CSV内容
      const csvContent = generateCSVContent(batch.records, groupLabels);

      // 保存到文件
      const result = await csvAPI.save(hourKey, csvContent, true);

      if (result.success) {
        console.log(`CSV批次保存成功：${hourKey}，记录数：${batch.records.length}`);

        // 清空已保存的批次数据
        csvBatches.value.delete(hourKey);
      } else {
        console.error(`CSV批次保存失败：${hourKey}，错误：${result.error}`);
      }
    } catch (error) {
      console.error(`CSV批次保存异常：${hourKey}`, error);
    }
  };

  // 方法：批量保存所有CSV数据
  const saveAllCSVBatches = async (): Promise<void> => {
    const hourKeys = Array.from(csvBatches.value.keys());

    if (hourKeys.length === 0) {
      console.log('没有CSV批次数据需要保存');
      return;
    }

    console.log(`开始批量保存CSV数据，批次数：${hourKeys.length}`);

    // 并行保存所有批次
    const savePromises = hourKeys.map((hourKey) => saveCurrentCSVBatch(hourKey));

    try {
      await Promise.all(savePromises);
      console.log('CSV批量保存完成');
    } catch (error) {
      console.error('CSV批量保存异常', error);
    }
  };

  // 方法：获取记录统计信息
  const getRecordingStats = () => {
    return computed(() => ({
      totalRecords: historyRecords.value.length,
      csvBatchCount: csvBatches.value.size,
      isRecording: recordingStatus.value.isRecording,
      recordCount: recordingStatus.value.recordCount,
      currentHour: recordingStatus.value.currentHour,
      runningTime: recordingStatus.value.startTime
        ? Date.now() - recordingStatus.value.startTime
        : 0,
    }));
  };

  return {
    // 状态
    table1Config,
    table2Config,
    displaySettings,
    historyRecords,
    csvBatches,
    recordingStatus,
    timers,

    // 计算属性
    availableGroups,

    // 方法
    updateTable1Config,
    updateTable2Config,
    updateDisplaySettings,
    startRecording,
    stopRecording,
    getCurrentHourKey,
    cleanHistoryRecords,
    getTableData,
    collectCurrentData,
    getRecordingStats,
    saveCurrentCSVBatch,
    saveAllCSVBatches,
    startDataCollection,
    stopDataCollection,
    clearGroupHistoryRecords,
    clearTable1History,
    clearTable2History,
  };
});
