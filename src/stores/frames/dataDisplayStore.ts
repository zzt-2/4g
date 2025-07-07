/**
 * 数据显示状态管理Store
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  TableConfig,
  DisplaySettings,
  DataRecord,
  RecordingStatus,
  TableRowData,
} from '../../types/frames/dataDisplay';
import type { HourlyDataFile, HistoryDataRecord } from '../../types/storage/historyData';
import { useReceiveFramesStore } from './receiveFramesStore';
import { useSettingsStore } from '../settingsStore';
import { useTimerManager } from '../../composables/common/useTimerManager';
import { convertToHex } from '../../utils/frames/hexCovertUtils';
import { getHourKey, isNewHour } from '../../utils/common/dateUtils';
import { historyDataAPI } from '../../api/common';
import { useStorage } from '@vueuse/core';
import type { TimerConfig } from '../../types/common/timerManager';

export const useDataDisplayStore = defineStore('dataDisplay', () => {
  const settingsStore = useSettingsStore();

  // 定时器管理器
  const timerManager = useTimerManager();

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
  const displaySettings = ref<DisplaySettings>({
    updateInterval: 1000, // 1秒更新间隔
    csvSaveInterval: settingsStore.csvSaveInterval * 60 * 1000, // 5分钟保存间隔
    maxHistoryHours: 24, // 24小时历史记录
    enableAutoSave: true,
    enableRecording: false,
    enableHistoryStorage: true, // 启用历史数据存储
  });

  // 历史数据（用于折线图，内存中保持连续）
  const historyRecords = ref<DataRecord[]>([]);

  // JSON历史数据批量（按小时分组）
  const historyBatches = ref<Map<string, HourlyDataFile>>(new Map());

  // 记录状态
  const recordingStatus = ref<RecordingStatus>({
    isRecording: false,
    startTime: null,
    recordCount: 0,
    lastRecordTime: 0,
    currentHour: '',
  });

  // 定时器ID常量
  const TIMER_IDS = {
    DATA_COLLECTION: 'dataDisplay_dataCollection',
    HISTORY_SAVE: 'dataDisplay_historySave',
    CLEANUP: 'dataDisplay_cleanup',
  } as const;

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
      hexValue: '0x' + convertToHex(String(item.value || '0'), item.dataType),
      dataItemId: item.id,
      isVisible: item.isVisible,
      isFavorite: item.isFavorite || false,
    }));
  };

  // 方法：获取当前数据项元数据
  const getCurrentDataItemsMetadata = () => {
    const now = Date.now();
    const currentHour = getHourKey(now);

    // 计算总数据项数量和创建索引映射
    let totalDataItems = 0;
    const groups = receiveFramesStore.groups.map((group) => {
      const groupDataItems = group.dataItems.map((item) => ({
        id: item.id,
        label: item.label,
        dataType: item.dataType,
        groupId: group.id,
        index: totalDataItems++, // 全局索引
      }));

      return {
        id: group.id,
        label: group.label,
        dataItems: groupDataItems,
      };
    });

    return {
      version: '1.0.0',
      hourKey: currentHour,
      groups,
      totalDataItems,
      createdAt: now,
      updatedAt: now,
    };
  };

  // 方法：创建历史数据记录（所有分组的数据合并为一条记录）
  const createHistoryDataRecord = (timestamp: number): HistoryDataRecord => {
    // 创建一个按索引排序的数据数组
    const data: unknown[] = [];

    receiveFramesStore.groups.forEach((group) => {
      group.dataItems.forEach((item) => {
        data.push(item.value || 0);
      });
    });

    return {
      timestamp,
      data,
    };
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

      // 保存上一小时的剩余数据
      if (recordingStatus.value.isRecording && displaySettings.value.enableHistoryStorage) {
        saveCurrentHistoryBatch(recordingStatus.value.currentHour);
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
    });

    // 只有在记录时才添加到JSON历史数据批次（每秒一条记录，包含所有分组的数据）
    if (recordingStatus.value.isRecording && displaySettings.value.enableHistoryStorage) {
      if (!historyBatches.value.has(currentHour)) {
        historyBatches.value.set(currentHour, {
          metadata: getCurrentDataItemsMetadata(),
          records: [],
        });
      }

      const batch = historyBatches.value.get(currentHour)!;
      batch.metadata.updatedAt = timestamp;
      batch.records.push(createHistoryDataRecord(timestamp));
    }

    if (recordingStatus.value.isRecording) {
      console.log(
        `数据收集完成：记录数 ${recordingStatus.value.recordCount}，当前小时 ${currentHour}`,
      );
    }
  };

  // 方法：启动数据收集定时器（常开）
  const startDataCollection = async (): Promise<void> => {
    try {
      // 检查定时器是否已经在运行
      const existingTimer = await timerManager.getTimerInfo(TIMER_IDS.DATA_COLLECTION);
      if (existingTimer && existingTimer.status === 'running') {
        await stopDataCollection();
      }

      // 注册数据收集定时器
      const dataCollectionConfig: TimerConfig = {
        id: TIMER_IDS.DATA_COLLECTION,
        type: 'interval',
        interval: displaySettings.value.updateInterval,
        autoStart: true,
      };

      const result = await timerManager.registerTimer(dataCollectionConfig, () => {
        collectCurrentData();
      });

      if (result.success) {
        console.log('数据收集定时器已启动（常开模式）');
      } else {
        console.error('启动数据收集定时器失败:', result.message);
      }
    } catch (error) {
      console.error('启动数据收集定时器异常:', error);
    }
  };

  // 方法：停止数据收集定时器
  const stopDataCollection = async (): Promise<void> => {
    const result = await timerManager.unregisterTimer(TIMER_IDS.DATA_COLLECTION);

    if (result.success) {
      console.log('数据收集定时器已停止');
    } else {
      console.error('停止数据收集定时器失败:', result.message);
    }
  };

  // 方法：启动记录相关定时器
  const startRecordingTimers = async (): Promise<void> => {
    // 先停止现有记录定时器
    await stopRecordingTimers();

    // 注册历史数据保存定时器（每5分钟执行）
    if (displaySettings.value.enableHistoryStorage) {
      const historySaveConfig: TimerConfig = {
        id: TIMER_IDS.HISTORY_SAVE,
        type: 'interval',
        interval: displaySettings.value.csvSaveInterval,
        autoStart: true,
      };

      await timerManager.registerTimer(historySaveConfig, () => {
        if (recordingStatus.value.isRecording) {
          saveAllHistoryBatches();
        }
      });
    }

    // 注册清理定时器（每小时执行）
    const cleanupConfig: TimerConfig = {
      id: TIMER_IDS.CLEANUP,
      type: 'interval',
      interval: 60 * 60 * 1000, // 1小时
      autoStart: true,
    };

    await timerManager.registerTimer(cleanupConfig, () => {
      cleanHistoryRecords();
    });

    console.log('记录相关定时器已启动');
  };

  // 方法：停止记录相关定时器
  const stopRecordingTimers = async (): Promise<void> => {
    await Promise.all([
      timerManager.unregisterTimer(TIMER_IDS.HISTORY_SAVE),
      timerManager.unregisterTimer(TIMER_IDS.CLEANUP),
    ]);

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
  const startRecording = async (): Promise<void> => {
    if (recordingStatus.value.isRecording) return;

    const now = Date.now();
    recordingStatus.value.isRecording = true;
    recordingStatus.value.startTime = now;
    recordingStatus.value.recordCount = 0;
    recordingStatus.value.lastRecordTime = 0;
    recordingStatus.value.currentHour = getHourKey(now);

    // 启动记录相关定时器
    await startRecordingTimers();

    console.log('开始数据记录，当前小时：', recordingStatus.value.currentHour);
  };

  // 方法：停止记录
  const stopRecording = async (): Promise<void> => {
    if (!recordingStatus.value.isRecording) return;

    // 保存剩余的历史数据
    if (displaySettings.value.enableHistoryStorage) {
      await saveAllHistoryBatches();
    }

    recordingStatus.value.isRecording = false;
    recordingStatus.value.startTime = null;

    // 停止记录相关定时器（但保持数据收集定时器运行）
    await stopRecordingTimers();

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

  // 方法：保存当前JSON历史数据批次（使用增量保存）
  const saveCurrentHistoryBatch = async (hourKey: string): Promise<void> => {
    const batch = historyBatches.value.get(hourKey);
    if (!batch || batch.records.length === 0) {
      console.log(`没有历史数据需要保存：${hourKey}`);
      return;
    }

    try {
      // 使用新的批量增量保存API
      const result = await historyDataAPI.appendBatchRecords({
        hourKey,
        records: batch.records,
        metadata: {
          version: batch.metadata.version,
          groups: batch.metadata.groups,
          totalDataItems: batch.metadata.totalDataItems,
        },
      });

      if (result.success) {
        console.log(
          `历史数据批次增量保存成功：${hourKey}，追加记录数：${result.appendedCount}，总记录数：${result.totalRecords}`,
        );

        // 清空已保存的批次数据（只清空records，保留metadata）
        batch.records = [];
      } else {
        console.error(`历史数据批次增量保存失败：${hourKey}，错误：${result.error}`);
      }
    } catch (error) {
      console.error(`历史数据批次增量保存异常：${hourKey}`, error);
    }
  };

  // 方法：批量保存所有JSON历史数据
  const saveAllHistoryBatches = async (): Promise<void> => {
    const hourKeys = Array.from(historyBatches.value.keys());

    if (hourKeys.length === 0) {
      console.log('没有历史数据批次需要保存');
      return;
    }

    console.log(`开始批量保存历史数据，批次数：${hourKeys.length}`);

    // 并行保存所有批次
    const savePromises = hourKeys.map((hourKey) => saveCurrentHistoryBatch(hourKey));

    try {
      await Promise.all(savePromises);
      console.log('历史数据批量保存完成');
    } catch (error) {
      console.error('历史数据批量保存异常', error);
    }
  };

  // 方法：获取记录统计信息
  const getRecordingStats = () => {
    return computed(() => ({
      totalRecords: historyRecords.value.length,
      historyBatchCount: historyBatches.value.size,
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
    historyBatches,
    recordingStatus,

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
    saveCurrentHistoryBatch,
    saveAllHistoryBatches,
    startDataCollection,
    stopDataCollection,
    clearGroupHistoryRecords,
    clearTable1History,
    clearTable2History,
  };
});
