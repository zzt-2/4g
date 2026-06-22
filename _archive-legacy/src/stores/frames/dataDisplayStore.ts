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

// 导入星座图配置类型
export interface ConstellationConfig {
  bitWidth: number;
  sampleCount: number;
  pointSize?: number;

  // 数据源配置
  iDataSource?: {
    frameId: string;
    fieldId: string;
  };
  qDataSource?: {
    frameId: string;
    fieldId: string;
  };

  // 刷新间隔（毫秒）
  refreshInterval?: number;
}

export const useDataDisplayStore = defineStore('dataDisplay', () => {
  const settingsStore = useSettingsStore();

  // 定时器管理器
  const timerManager = useTimerManager();

  // 循环缓冲区类，用于高效的数据存储和清理
  class CircularBuffer<T> {
    private buffer: T[] = [];
    private head = 0;
    private size = 0;
    private capacity: number;

    constructor(capacity: number) {
      this.capacity = capacity;
      this.buffer = new Array(capacity);
    }

    push(item: T): void {
      if (this.size < this.capacity) {
        this.buffer[this.size] = item;
        this.size++;
      } else {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
      }
    }

    toArray(): T[] {
      if (this.size < this.capacity) {
        return this.buffer.slice(0, this.size);
      }

      const result = new Array(this.capacity);
      let writeIndex = 0;

      // 从head开始复制到数组末尾
      for (let i = this.head; i < this.capacity; i++) {
        result[writeIndex++] = this.buffer[i];
      }

      // 从数组开头复制到head
      for (let i = 0; i < this.head; i++) {
        result[writeIndex++] = this.buffer[i];
      }

      return result;
    }

    clear(): void {
      this.head = 0;
      this.size = 0;
    }

    length(): number {
      return this.size;
    }

    setCapacity(newCapacity: number): void {
      if (newCapacity !== this.capacity) {
        const currentData = this.toArray();
        this.capacity = newCapacity;
        this.buffer = new Array(newCapacity);
        this.head = 0;
        this.size = 0;

        // 重新添加数据，如果新容量小于当前数据量，只保留最新的数据
        const dataToKeep = currentData.slice(-newCapacity);
        dataToKeep.forEach((item) => this.push(item));
      }
    }
  }

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

  // 星座图配置（持久化）
  const table1ScatterConfig = useStorage<ConstellationConfig>('table1ScatterConfig', {
    bitWidth: 12,
    sampleCount: 16,
    pointSize: 3,
    refreshInterval: 1000,
    iDataSource: { frameId: '', fieldId: '' },
    qDataSource: { frameId: '', fieldId: '' },
  });

  const table2ScatterConfig = useStorage<ConstellationConfig>('table2ScatterConfig', {
    bitWidth: 12,
    sampleCount: 16,
    pointSize: 3,
    refreshInterval: 1000,
    iDataSource: { frameId: '', fieldId: '' },
    qDataSource: { frameId: '', fieldId: '' },
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

  // 非响应式历史数据存储 - 性能优化，使用循环缓冲区
  const historyRecordsCache = new Map<number, CircularBuffer<DataRecord>>(); // groupId -> CircularBuffer<DataRecord>
  const historyUpdateCounter = ref(0); // 更新计数器，用于触发图表刷新

  // 缓存清理状态
  let lastCleanupTime = 0;
  const CLEANUP_INTERVAL = 10000; // 10秒清理一次，避免每次都清理

  // hex转换缓存，避免重复计算
  const hexConversionCache = new Map<string, string>();
  const MAX_HEX_CACHE_SIZE = 1000;

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

  // 星座图数据缓存
  const constellationData = ref<{
    table1: {
      iValues: number[];
      qValues: number[];
      lastUpdate: number;
    };
    table2: {
      iValues: number[];
      qValues: number[];
      lastUpdate: number;
    };
  }>({
    table1: { iValues: [], qValues: [], lastUpdate: 0 },
    table2: { iValues: [], qValues: [], lastUpdate: 0 },
  });

  // 星座图当前显示数据（供组件使用）
  const constellationDisplayData = ref<{
    table1: [number, number][];
    table2: [number, number][];
  }>({
    table1: [],
    table2: [],
  });

  // 定时器ID常量
  const TIMER_IDS = {
    DATA_COLLECTION: 'dataDisplay_dataCollection',
    HISTORY_SAVE: 'dataDisplay_historySave',
    CLEANUP: 'dataDisplay_cleanup',
    CONSTELLATION_REFRESH_TABLE1: 'dataDisplay_constellationRefreshTable1',
    CONSTELLATION_REFRESH_TABLE2: 'dataDisplay_constellationRefreshTable2',
  } as const;

  // 获取接收帧Store
  const receiveFramesStore = useReceiveFramesStore();

  // 优化的hex转换函数，带缓存
  const cachedConvertToHex = (value: string, dataType: string, isASCII?: boolean): string => {
    const cacheKey = `${value}_${dataType}`;

    // 检查缓存
    if (hexConversionCache.has(cacheKey)) {
      return hexConversionCache.get(cacheKey)!;
    }

    // 计算hex值
    const hexValue = convertToHex(value, dataType, undefined, isASCII, true);

    // 添加到缓存，控制缓存大小
    if (hexConversionCache.size >= MAX_HEX_CACHE_SIZE) {
      // 清理一半的缓存
      const entries = Array.from(hexConversionCache.entries());
      const keepEntries = entries.slice(-MAX_HEX_CACHE_SIZE / 2);
      hexConversionCache.clear();
      keepEntries.forEach(([key, value]) => hexConversionCache.set(key, value));
    }

    hexConversionCache.set(cacheKey, hexValue);
    return hexValue;
  };

  // 延迟清理函数
  const performDelayedCleanup = (): void => {
    const now = Date.now();
    if (now - lastCleanupTime < CLEANUP_INTERVAL) {
      return; // 还没到清理时间
    }

    lastCleanupTime = now;

    // 根据活跃图表数量动态调整最大记录数
    const activeChartCount = [table1Config.value, table2Config.value].filter(
      (config) => config.displayMode === 'chart' && config.selectedGroupId,
    ).length;

    const getMaxRecords = () => {
      if (activeChartCount === 0) return 1000;
      if (activeChartCount === 1) return 5000;
      return 3000;
    };

    const maxRecords = getMaxRecords();

    // 调整循环缓冲区容量
    historyRecordsCache.forEach((buffer) => {
      buffer.setCapacity(maxRecords);
    });

    console.log(`延迟清理完成，活跃图表数: ${activeChartCount}, 最大记录数: ${maxRecords}`);
  };

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

  // 优化的数据收集方法 - 高性能版本
  const collectCurrentData = (): void => {
    // const perfStart = performance.now();
    // const perfTimes: Record<string, number> = {};

    const timestamp = Date.now();
    const currentHour = getHourKey(timestamp);

    // 步骤1：小时边界检查
    // const step1Start = performance.now();
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
    // perfTimes['1_hourBoundaryCheck'] = performance.now() - step1Start;

    // 步骤2：状态更新
    // const step2Start = performance.now();
    const newRecordingStatus = {
      ...recordingStatus.value,
      currentHour,
      lastRecordTime: timestamp,
    };

    newRecordingStatus.recordCount = recordingStatus.value.isRecording
      ? recordingStatus.value.recordCount + 1
      : 0;
    recordingStatus.value = newRecordingStatus;

    // perfTimes['2_statusUpdate'] = performance.now() - step2Start;

    // 步骤3：模式检查
    // const step3Start = performance.now();
    const isChartMode1 =
      table1Config.value.displayMode === 'chart' && table1Config.value.selectedGroupId;
    const isChartMode2 =
      table2Config.value.displayMode === 'chart' && table2Config.value.selectedGroupId;

    if (!isChartMode1 && !isChartMode2 && !recordingStatus.value.isRecording) {
      // perfTimes['3_modeCheck'] = performance.now() - step3Start;
      // perfTimes['total'] = performance.now() - perfStart;
      // console.log('collectCurrentData性能统计（早期退出）:', perfTimes);
      return; // 没有需要数据的地方，直接返回
    }
    // perfTimes['3_modeCheck'] = performance.now() - step3Start;

    // 步骤4：预计算选中项
    // const step4Start = performance.now();
    const table1SelectedIds = new Set(
      table1Config.value.displayMode === 'chart' ? table1Config.value.chartSelectedItems : [],
    );
    const table2SelectedIds = new Set(
      table2Config.value.displayMode === 'chart' ? table2Config.value.chartSelectedItems : [],
    );
    // perfTimes['4_precomputeSelected'] = performance.now() - step4Start;

    // 步骤5：数据收集
    // const step5Start = performance.now();
    // let processedGroups = 0;
    // let processedItems = 0;
    // let hexConversions = 0;

    receiveFramesStore.groups.forEach((group) => {
      if (group.dataItems.length === 0) return;

      // 检查这个分组是否被使用
      const isGroupUsed =
        (group.id === table1Config.value.selectedGroupId && isChartMode1) ||
        (group.id === table2Config.value.selectedGroupId && isChartMode2) ||
        recordingStatus.value.isRecording;

      if (!isGroupUsed) return;

      // processedGroups++;

      // 获取需要存储的数据项
      const shouldStoreAllItems = recordingStatus.value.isRecording;
      const needsTable1Items = group.id === table1Config.value.selectedGroupId;
      const needsTable2Items = group.id === table2Config.value.selectedGroupId;

      // 预分配数组，避免动态扩容
      const dataItems: Array<{
        id: number;
        label: string;
        value: unknown;
        displayValue: string;
        hexValue: string;
      }> = [];

      // 一次遍历完成过滤和转换
      for (const item of group.dataItems) {
        const shouldInclude =
          shouldStoreAllItems ||
          (needsTable1Items && table1SelectedIds.has(item.id)) ||
          (needsTable2Items && table2SelectedIds.has(item.id));

        if (!shouldInclude) continue;

        // processedItems++;

        // 使用缓存的hex转换
        const hexValue = cachedConvertToHex(String(item.value || ''), item.dataType);
        // hexConversions++;

        dataItems.push({
          id: item.id,
          label: item.label,
          value: item.value,
          displayValue: item.displayValue || '-',
          hexValue,
        });
      }

      // 如果没有需要存储的数据项，跳过
      if (dataItems.length === 0) return;

      const dataRecord: DataRecord = {
        timestamp,
        groupId: group.id,
        dataItems,
      };

      // 使用循环缓冲区存储，自动处理容量限制
      if (!historyRecordsCache.has(group.id)) {
        // 根据当前模式设置初始容量
        const activeChartCount = [table1Config.value, table2Config.value].filter(
          (config) => config.displayMode === 'chart' && config.selectedGroupId,
        ).length;

        const initialCapacity =
          activeChartCount === 0 ? 1000 : activeChartCount === 1 ? 5000 : 3000;

        historyRecordsCache.set(group.id, new CircularBuffer<DataRecord>(initialCapacity));
      }

      historyRecordsCache.get(group.id)!.push(dataRecord);
    });
    // perfTimes['5_dataCollection'] = performance.now() - step5Start;

    // 步骤6：延迟清理
    // const step6Start = performance.now();
    performDelayedCleanup();
    // perfTimes['6_delayedCleanup'] = performance.now() - step6Start;

    // 步骤7：更新计数器
    // const step7Start = performance.now();
    historyUpdateCounter.value++;
    // perfTimes['7_updateCounter'] = performance.now() - step7Start;

    // 步骤8：历史数据保存
    // const step8Start = performance.now();
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
    // perfTimes['8_historyDataSave'] = performance.now() - step8Start;

    // 总耗时统计
    // perfTimes['total'] = performance.now() - perfStart;

    // 每100次调用输出一次详细统计
    // if (historyUpdateCounter.value % 100 === 0) {
    //   const stats = {
    //     processedGroups,
    //     processedItems,
    //     hexConversions,
    //     cacheSize: hexConversionCache.size,
    //     bufferCount: historyRecordsCache.size,
    //   };

    //   console.log('collectCurrentData性能统计:', {
    //     耗时详情: Object.entries(perfTimes)
    //       .map(([step, time]) => `${step}: ${time.toFixed(3)}ms`)
    //       .join(', '),
    //     处理统计: stats,
    //     最耗时步骤: Object.entries(perfTimes)
    //       .filter(([key]) => key !== 'total')
    //       .sort(([, a], [, b]) => b - a)
    //       .slice(0, 3)
    //       .map(([step, time]) => `${step}(${time.toFixed(3)}ms)`)
    //       .join(', '),
    //   });
    // }
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
    const oldDisplayMode = table1Config.value.displayMode;
    Object.assign(table1Config.value, config);

    // 处理显示模式切换
    if (config.displayMode !== undefined && config.displayMode !== oldDisplayMode) {
      if (config.displayMode === 'special') {
        // 切换到星座图模式，启动定时器
        startConstellationRefreshTimer('table1');
      } else {
        // 切换到其他模式，停止定时器
        stopConstellationRefreshTimer('table1');
      }
    }
  };

  // 方法：更新表格2配置
  const updateTable2Config = (config: Partial<TableConfig>): void => {
    const oldDisplayMode = table2Config.value.displayMode;
    Object.assign(table2Config.value, config);

    // 处理显示模式切换
    if (config.displayMode !== undefined && config.displayMode !== oldDisplayMode) {
      if (config.displayMode === 'special') {
        // 切换到星座图模式，启动定时器
        startConstellationRefreshTimer('table2');
      } else {
        // 切换到其他模式，停止定时器
        stopConstellationRefreshTimer('table2');
      }
    }
  };

  // 方法：更新显示设置
  const updateDisplaySettings = (settings: Partial<DisplaySettings>): void => {
    Object.assign(displaySettings.value, settings);
  };

  // 方法：更新表格1星座图配置
  const updateTable1ScatterConfig = (config: Partial<ConstellationConfig>): void => {
    Object.assign(table1ScatterConfig.value, config);
    // 如果刷新间隔改变且当前是星座图模式，重启定时器
    if (config.refreshInterval !== undefined && table1Config.value.displayMode === 'special') {
      startConstellationRefreshTimer('table1');
    }
  };

  // 方法：更新表格2星座图配置
  const updateTable2ScatterConfig = (config: Partial<ConstellationConfig>): void => {
    Object.assign(table2ScatterConfig.value, config);
    // 如果刷新间隔改变且当前是星座图模式，重启定时器
    if (config.refreshInterval !== undefined && table2Config.value.displayMode === 'special') {
      startConstellationRefreshTimer('table2');
    }
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

  // 方法：清理过期历史数据（循环缓冲区会自动处理容量，这里主要处理时间过期）
  const cleanHistoryRecords = (): void => {
    const cutoff = Date.now() - displaySettings.value.maxHistoryHours * 60 * 60 * 1000;
    let totalCleanedRecords = 0;

    historyRecordsCache.forEach((buffer) => {
      const records = buffer.toArray();
      const beforeCount = records.length;

      // 过滤出未过期的记录
      const validRecords = records.filter((record) => record.timestamp > cutoff);

      if (validRecords.length !== beforeCount) {
        // 重建缓冲区
        buffer.clear();
        validRecords.forEach((record) => buffer.push(record));
        totalCleanedRecords += beforeCount - validRecords.length;
      }
    });

    if (totalCleanedRecords > 0) {
      console.log(`清理过期历史数据：清理了 ${totalCleanedRecords} 条记录`);
      historyUpdateCounter.value++;
    }
  };

  // 方法：清空指定分组的历史数据
  const clearGroupHistoryRecords = (groupId: number): void => {
    const buffer = historyRecordsCache.get(groupId);
    const beforeCount = buffer ? buffer.length() : 0;

    // 清空循环缓冲区
    if (buffer) {
      buffer.clear();
    }

    // 触发更新
    historyUpdateCounter.value++;

    if (beforeCount > 0) {
      console.log(`清空分组 ${groupId} 历史数据：${beforeCount} 条记录`);
    }
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

  // 性能优化：获取特定分组的历史数据（非响应式）
  const getGroupHistoryRecords = (groupId: number): DataRecord[] => {
    const buffer = historyRecordsCache.get(groupId);
    return buffer ? buffer.toArray() : [];
  };

  // 性能优化：获取更新计数器
  const getHistoryUpdateCounter = () => historyUpdateCounter.value;

  // 从hex字符串中根据位宽提取数值
  const extractValuesFromHex = (hex: string, bitWidth: number): number[] => {
    if (!hex || bitWidth <= 0 || bitWidth > 32) return [];

    const values: number[] = [];
    const hexCharsPerValue = Math.ceil(bitWidth / 4);
    const maxValueCount = Math.floor(hex.length / hexCharsPerValue);

    for (let i = 0; i < maxValueCount; i++) {
      const start = i * hexCharsPerValue;
      const end = start + hexCharsPerValue;
      const hexChunk = hex.slice(start, end);

      if (hexChunk.length < hexCharsPerValue) break;

      let value = parseInt(hexChunk, 16);

      // 处理有符号数
      const signBit = 1 << (bitWidth - 1);
      if (value & signBit) {
        value = value - (1 << bitWidth);
      }

      values.push(value);
    }

    return values;
  };

  // 星座图数据管理
  const collectConstellationFieldData = (
    frameId: string,
    fieldId: string,
    hexData: string,
  ): void => {
    const timestamp = Date.now();

    ['table1', 'table2'].forEach((tableId) => {
      const config = tableId === 'table1' ? table1Config.value : table2Config.value;
      const scatterConfig =
        tableId === 'table1' ? table1ScatterConfig.value : table2ScatterConfig.value;

      if (config.displayMode !== 'special') return;

      const data = constellationData.value[tableId as 'table1' | 'table2'];

      // 提取所有数值
      const allValues = extractValuesFromHex(hexData, scatterConfig.bitWidth);
      if (allValues.length === 0) return;

      // 根据sampleCount限制数量
      const actualSampleCount =
        scatterConfig.sampleCount > 0
          ? Math.min(scatterConfig.sampleCount, allValues.length)
          : allValues.length;

      if (
        scatterConfig.iDataSource?.frameId === frameId &&
        scatterConfig.iDataSource?.fieldId === fieldId
      ) {
        // I路数据：前一半
        const halfCount = Math.floor(actualSampleCount / 2);
        const iData = allValues.slice(0, halfCount);
        data.iValues.push(...iData);
        data.lastUpdate = timestamp;
      }

      if (
        scatterConfig.qDataSource?.frameId === frameId &&
        scatterConfig.qDataSource?.fieldId === fieldId
      ) {
        // Q路数据：后一半
        const halfCount = Math.floor(actualSampleCount / 2);
        const qData = allValues.slice(halfCount, halfCount * 2);
        data.qValues.push(...qData);
        data.lastUpdate = timestamp;
      }
    });
  };

  const getConstellationData = (tableId: 'table1' | 'table2'): [number, number][] => {
    const { iValues, qValues } = constellationData.value[tableId];
    const minLength = Math.min(iValues.length, qValues.length);
    return Array.from({ length: minLength }, (_, i) => [iValues[i]!, qValues[i]!]);
  };

  const clearConstellationData = (tableId: 'table1' | 'table2'): void => {
    const data = constellationData.value[tableId];
    data.iValues = [];
    data.qValues = [];
    data.lastUpdate = 0;
  };

  const refreshConstellationData = (tableId: 'table1' | 'table2'): void => {
    const constellationData = getConstellationData(tableId);
    if (constellationData.length > 0) {
      constellationDisplayData.value[tableId] = constellationData;
      clearConstellationData(tableId);
    }
  };

  const manageConstellationTimer = async (
    tableId: 'table1' | 'table2',
    action: 'start' | 'stop',
  ): Promise<void> => {
    const timerId =
      tableId === 'table1'
        ? TIMER_IDS.CONSTELLATION_REFRESH_TABLE1
        : TIMER_IDS.CONSTELLATION_REFRESH_TABLE2;

    if (action === 'stop') {
      await timerManager.unregisterTimer(timerId);
      return;
    }

    const config = tableId === 'table1' ? table1ScatterConfig.value : table2ScatterConfig.value;
    await timerManager.unregisterTimer(timerId);

    const result = await timerManager.registerTimer(
      {
        id: timerId,
        type: 'interval',
        interval: config.refreshInterval || 1000,
        autoStart: true,
      },
      () => refreshConstellationData(tableId),
    );

    if (!result.success) {
      console.error(`星座图${tableId}定时器操作失败:`, result.message);
    }
  };

  const startConstellationRefreshTimer = (tableId: 'table1' | 'table2') =>
    manageConstellationTimer(tableId, 'start');

  const stopConstellationRefreshTimer = (tableId: 'table1' | 'table2') =>
    manageConstellationTimer(tableId, 'stop');

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
    return computed(() => {
      // 使用循环缓冲区计算总记录数
      let totalRecords = 0;
      historyRecordsCache.forEach((buffer) => {
        totalRecords += buffer.length();
      });

      return {
        totalRecords,
        historyBatchCount: historyBatches.value.size,
        isRecording: recordingStatus.value.isRecording,
        recordCount: recordingStatus.value.recordCount,
        currentHour: recordingStatus.value.currentHour,
        runningTime: recordingStatus.value.startTime
          ? Date.now() - recordingStatus.value.startTime
          : 0,
      };
    });
  };

  return {
    // 状态
    table1Config,
    table2Config,
    table1ScatterConfig,
    table2ScatterConfig,
    displaySettings,
    historyBatches,
    recordingStatus,
    constellationData,
    constellationDisplayData,
    historyUpdateCounter,

    // 计算属性
    availableGroups,

    // 方法
    updateTable1Config,
    updateTable2Config,
    updateTable1ScatterConfig,
    updateTable2ScatterConfig,
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

    // 性能优化方法
    getGroupHistoryRecords,
    getHistoryUpdateCounter,

    // 星座图数据管理
    collectConstellationFieldData,
    getConstellationData,
    clearConstellationData,
    refreshConstellationData,
    startConstellationRefreshTimer,
    stopConstellationRefreshTimer,
  };
});
