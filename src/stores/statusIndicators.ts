/**
 * 状态指示灯独立Store
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { useReceiveFramesStore } from './frames/receiveFramesStore';
import type {
  StatusIndicatorConfig,
  StatusIndicatorSettings,
  ValueColorMapping,
} from '../types/frames/receive';

export const useStatusIndicatorStore = defineStore('statusIndicators', () => {
  // 持久化设置
  const settings = useStorage<StatusIndicatorSettings>('statusIndicatorSettings', {
    indicators: [],
    isEnabled: true,
  });

  // 内部状态
  const updateTimer = ref<NodeJS.Timeout | null>(null);
  const lastDataSnapshot = ref<Map<string, unknown>>(new Map());

  // 获取接收帧Store
  const receiveFramesStore = useReceiveFramesStore();

  // 计算属性：活跃的指示灯状态
  const activeIndicators = computed(() => {
    if (!settings.value.isEnabled) return [];

    return settings.value.indicators.map((indicator) => ({
      ...indicator,
      isActive: getIndicatorStatus(indicator).isActive,
      currentColor: getIndicatorStatus(indicator).currentColor,
    }));
  });

  // 方法：解析值类型（数值范围或普通值）
  const parseValueType = (
    value: string,
  ): { type: 'range' | 'value'; min?: number; max?: number; value?: string } => {
    // 检查是否为数值范围格式 (如: "10-20", "0.5-1.5")
    const rangeMatch = value.match(/^(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)$/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]!);
      const max = parseFloat(rangeMatch[2]!);
      return { type: 'range', min: Math.min(min, max), max: Math.max(min, max) };
    }

    return { type: 'value', value };
  };

  // 方法：检查值是否匹配映射
  const isValueMatch = (dataValue: unknown, mappingValue: string): boolean => {
    const stringValue = String(dataValue);
    const parsed = parseValueType(mappingValue);

    if (parsed.type === 'range') {
      const numValue = parseFloat(stringValue);
      if (isNaN(numValue)) return false;
      return numValue >= parsed.min! && numValue <= parsed.max!;
    }

    return stringValue === parsed.value;
  };

  // 方法：获取指示灯状态
  const getIndicatorStatus = (
    indicator: StatusIndicatorConfig,
  ): { isActive: boolean; currentColor: string } => {
    const group = receiveFramesStore.groups.find((g) => g.id === indicator.groupId);
    const dataItem = group?.dataItems.find((item) => item.id === indicator.dataItemId);

    if (!dataItem || dataItem.value === null || dataItem.value === undefined) {
      return { isActive: false, currentColor: indicator.defaultColor };
    }

    // 查找匹配的值映射
    for (const mapping of indicator.valueMappings || []) {
      if (isValueMatch(dataItem.value, mapping.value)) {
        return { isActive: true, currentColor: mapping.color };
      }
    }

    return { isActive: false, currentColor: indicator.defaultColor };
  };

  // 方法：检查数据是否发生变化
  const hasDataChanged = (): boolean => {
    const currentSnapshot = new Map<string, unknown>();

    // 创建当前数据快照
    settings.value.indicators.forEach((indicator) => {
      const group = receiveFramesStore.groups.find((g) => g.id === indicator.groupId);
      const dataItem = group?.dataItems.find((item) => item.id === indicator.dataItemId);
      const key = `${indicator.groupId}-${indicator.dataItemId}`;
      currentSnapshot.set(key, dataItem?.value);
    });

    // 比较快照
    if (currentSnapshot.size !== lastDataSnapshot.value.size) {
      lastDataSnapshot.value = currentSnapshot;
      return true;
    }

    for (const [key, value] of currentSnapshot) {
      if (lastDataSnapshot.value.get(key) !== value) {
        lastDataSnapshot.value = currentSnapshot;
        return true;
      }
    }

    return false;
  };

  // 方法：开始自动更新
  const startAutoUpdate = (): void => {
    if (updateTimer.value) return;

    updateTimer.value = setInterval(() => {
      if (settings.value.isEnabled && hasDataChanged()) {
        // 触发响应式更新（通过访问计算属性）
        void activeIndicators.value;
      }
    }, 1000);
  };

  // 方法：停止自动更新
  const stopAutoUpdate = (): void => {
    if (updateTimer.value) {
      clearInterval(updateTimer.value);
      updateTimer.value = null;
    }
  };

  // 方法：添加指示灯
  const addIndicator = (config: {
    label: string;
    groupId: number;
    dataItemId: number;
    valueMappings: ValueColorMapping[];
    defaultColor?: string;
  }): string => {
    const id = `indicator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newIndicator: StatusIndicatorConfig = {
      id,
      label: config.label,
      groupId: config.groupId,
      dataItemId: config.dataItemId,
      valueMappings: config.valueMappings,
      defaultColor: config.defaultColor || '#6b7280',
    };

    settings.value.indicators.push(newIndicator);
    return id;
  };

  // 方法：更新指示灯
  const updateIndicator = (id: string, updates: Partial<StatusIndicatorConfig>): void => {
    const index = settings.value.indicators.findIndex((indicator) => indicator.id === id);
    if (index !== -1) {
      settings.value.indicators[index] = {
        ...settings.value.indicators[index],
        ...updates,
      } as StatusIndicatorConfig;
    }
  };

  // 方法：删除指示灯
  const removeIndicator = (id: string): void => {
    const index = settings.value.indicators.findIndex((indicator) => indicator.id === id);
    if (index !== -1) {
      settings.value.indicators.splice(index, 1);
    }
  };

  // 方法：获取可用数据项
  const getAvailableDataItems = () => {
    const items: Array<{
      groupId: number;
      groupLabel: string;
      dataItemId: number;
      dataItemLabel: string;
      currentValue: unknown;
      currentDisplayValue: string;
      useLabel: boolean;
      labelOptions?: Array<{ value: string; label: string }>;
    }> = [];

    receiveFramesStore.groups.forEach((group) => {
      group.dataItems.forEach((dataItem) => {
        items.push({
          groupId: group.id,
          groupLabel: group.label,
          dataItemId: dataItem.id,
          dataItemLabel: dataItem.label,
          currentValue: dataItem.value,
          currentDisplayValue: dataItem.displayValue,
          useLabel: dataItem.useLabel,
          labelOptions: dataItem.labelOptions || [],
        });
      });
    });

    return items;
  };

  // 方法：切换启用状态
  const toggleEnabled = (): void => {
    settings.value.isEnabled = !settings.value.isEnabled;
  };

  // 初始化时开始自动更新
  startAutoUpdate();

  // 清理函数（当store被销毁时）
  const cleanup = (): void => {
    stopAutoUpdate();
  };

  return {
    // 状态
    settings,
    activeIndicators,

    // 方法
    addIndicator,
    updateIndicator,
    removeIndicator,
    getAvailableDataItems,
    getIndicatorStatus,
    toggleEnabled,
    startAutoUpdate,
    stopAutoUpdate,
    cleanup,
  };
});
