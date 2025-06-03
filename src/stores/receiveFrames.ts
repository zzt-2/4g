/**
 * 接收帧状态管理Store
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  DataGroup,
  FrameFieldMapping,
  ReceiveFrameStats,
  ReceiveConfig,
  ValidationResult,
  DataItem,
  ReceivedDataPacket,
  DataReceiveStats,
} from '../types/frames/receive';
import type { Frame } from '../types/frames/frames';
import { useFrameTemplateStore } from './frames/frameTemplateStore';
import {
  validateMappings as validateMappingsUtil,
  createDataPacket,
  matchDataToFrame,
  processReceivedData,
  applyDataProcessResult,
} from '../utils/receive';

export const useReceiveFramesStore = defineStore('receiveFrames', () => {
  // 核心状态
  const groups = ref<DataGroup[]>([]);
  const mappings = ref<FrameFieldMapping[]>([]);
  const frameStats = ref<Map<string, ReceiveFrameStats>>(new Map());
  const selectedFrameId = ref<string>('');
  const selectedGroupId = ref<number>(0);
  const isLoading = ref<boolean>(false);

  // 数据接收统计
  const receiveStats = ref<DataReceiveStats>({
    totalPackets: 0,
    matchedPackets: 0,
    unmatchedPackets: 0,
    errorPackets: 0,
    bytesReceived: 0,
  });

  // 最近接收的数据包（用于调试和监控）
  const recentPackets = ref<ReceivedDataPacket[]>([]);
  const maxRecentPackets = 100; // 最多保留100个最近数据包

  // 获取帧模板Store
  const frameTemplateStore = useFrameTemplateStore();

  // 计算属性：筛选接收帧
  const receiveFrames = computed(() => {
    return frameTemplateStore.frames.filter((frame: Frame) => frame.direction === 'receive');
  });

  // 计算属性：选中帧的关联数据项
  const selectedFrameDataItems = computed(() => {
    if (!selectedFrameId.value) return [];

    const frameMapping = mappings.value.filter(
      (mapping: FrameFieldMapping) => mapping.frameId === selectedFrameId.value,
    );

    return frameMapping.map((mapping: FrameFieldMapping) => {
      const group = groups.value.find((g: DataGroup) => g.id === mapping.groupId);
      const dataItem = group?.dataItems.find((item) => item.id === mapping.dataItemId);
      return {
        mapping,
        dataItem,
        group,
      };
    });
  });

  // 计算属性：选中分组
  const selectedGroup = computed(() => {
    return groups.value.find((group: DataGroup) => group.id === selectedGroupId.value);
  });

  // 方法：加载配置
  const loadConfig = async (): Promise<void> => {
    try {
      isLoading.value = true;
      // TODO: 使用dataStorageAPI.receiveConfig.list()
      // const result = await dataStorageAPI.receiveConfig.list();

      // 临时模拟数据
      const mockConfig: ReceiveConfig = {
        groups: [],
        mappings: [],
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      groups.value = mockConfig.groups;
      mappings.value = mockConfig.mappings;

      // 验证映射关系
      validateMappings();
    } catch (error) {
      console.error('加载接收配置失败:', error);
    } finally {
      isLoading.value = false;
    }
  };

  // 方法：保存配置
  const saveConfig = async (): Promise<void> => {
    try {
      isLoading.value = true;
      const config: ReceiveConfig = {
        groups: groups.value,
        mappings: mappings.value,
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // TODO: 使用dataStorageAPI.receiveConfig.save()
      // await dataStorageAPI.receiveConfig.save(config);

      console.log('接收配置已保存:', config);
    } catch (error) {
      console.error('保存接收配置失败:', error);
    } finally {
      isLoading.value = false;
    }
  };

  // 方法：验证映射关系
  const validateMappings = (): ValidationResult => {
    return validateMappingsUtil(mappings.value, frameTemplateStore.frames, groups.value);
  };

  // 方法：选择帧
  const selectFrame = (frameId: string): void => {
    selectedFrameId.value = frameId;
  };

  // 方法：选择分组
  const selectGroup = (groupId: number): void => {
    selectedGroupId.value = groupId;
  };

  // 方法：添加数据分组
  const addGroup = (label: string): DataGroup => {
    const newId = Math.max(...groups.value.map((g: DataGroup) => g.id), 0) + 1;
    const newGroup: DataGroup = {
      id: newId,
      label,
      dataItems: [],
    };
    groups.value.push(newGroup);
    return newGroup;
  };

  // 方法：删除数据分组
  const removeGroup = (groupId: number): void => {
    const index = groups.value.findIndex((g: DataGroup) => g.id === groupId);
    if (index !== -1) {
      groups.value.splice(index, 1);
      // 清理相关映射
      mappings.value = mappings.value.filter((m: FrameFieldMapping) => m.groupId !== groupId);
    }
  };

  // 方法：更新帧统计
  const updateFrameStats = (frameId: string, stats: Partial<ReceiveFrameStats>): void => {
    const current = frameStats.value.get(frameId) || {
      frameId,
      totalReceived: 0,
      lastReceiveTime: new Date(),
      checksumFailures: 0,
      errorCount: 0,
    };

    frameStats.value.set(frameId, { ...current, ...stats });
  };

  // 方法：添加数据项到分组
  const addDataItemToGroup = (groupId: number, dataItem: Omit<DataItem, 'id'>): DataItem => {
    const group = groups.value.find((g: DataGroup) => g.id === groupId);
    if (!group) {
      throw new Error(`分组ID ${groupId} 不存在`);
    }

    const newId = Math.max(...group.dataItems.map((item) => item.id), 0) + 1;
    const newDataItem: DataItem = {
      ...dataItem,
      id: newId,
    };

    group.dataItems.push(newDataItem);
    return newDataItem;
  };

  // 方法：更新数据项
  const updateDataItem = (
    groupId: number,
    dataItemId: number,
    updates: Partial<DataItem>,
  ): void => {
    const group = groups.value.find((g: DataGroup) => g.id === groupId);
    if (!group) return;

    const dataItem = group.dataItems.find((item) => item.id === dataItemId);
    if (!dataItem) return;

    Object.assign(dataItem, updates);
  };

  // 方法：删除数据项
  const removeDataItem = (groupId: number, dataItemId: number): void => {
    const group = groups.value.find((g: DataGroup) => g.id === groupId);
    if (!group) return;

    const index = group.dataItems.findIndex((item) => item.id === dataItemId);
    if (index !== -1) {
      group.dataItems.splice(index, 1);
    }
  };

  // 方法：删除映射关系
  const removeMapping = (
    frameId: string,
    fieldId: string,
    groupId: number,
    dataItemId: number,
  ): void => {
    const index = mappings.value.findIndex(
      (mapping: FrameFieldMapping) =>
        mapping.frameId === frameId &&
        mapping.fieldId === fieldId &&
        mapping.groupId === groupId &&
        mapping.dataItemId === dataItemId,
    );

    if (index !== -1) {
      mappings.value.splice(index, 1);
    }
  };

  // 方法：添加映射关系
  const addMapping = (mapping: FrameFieldMapping): void => {
    // 检查是否已存在相同映射
    const exists = mappings.value.some(
      (m: FrameFieldMapping) =>
        m.frameId === mapping.frameId &&
        m.fieldId === mapping.fieldId &&
        m.groupId === mapping.groupId &&
        m.dataItemId === mapping.dataItemId,
    );

    if (!exists) {
      mappings.value.push(mapping);
    }
  };

  // 方法：更新分组
  const updateGroup = (groupId: number, updates: Partial<DataGroup>): void => {
    const group = groups.value.find((g: DataGroup) => g.id === groupId);
    if (!group) return;

    Object.assign(group, updates);
  };

  // 方法：切换数据项可见性
  const toggleDataItemVisibility = (groupId: number, dataItemId: number): void => {
    const group = groups.value.find((g: DataGroup) => g.id === groupId);
    if (!group) return;

    const dataItem = group.dataItems.find((item) => item.id === dataItemId);
    if (!dataItem) return;

    dataItem.isVisible = !dataItem.isVisible;
  };

  /**
   * 统一数据接收处理入口
   * @param source 数据来源
   * @param sourceId 来源标识
   * @param data 接收数据
   */
  const handleReceivedData = (
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
  ): void => {
    try {
      // 创建数据包
      const packet = createDataPacket(source, sourceId, data);

      // 添加到最近数据包列表
      recentPackets.value.unshift(packet);
      if (recentPackets.value.length > maxRecentPackets) {
        recentPackets.value.splice(maxRecentPackets);
      }

      // 更新接收统计
      receiveStats.value.totalPackets++;
      receiveStats.value.bytesReceived += packet.size;
      receiveStats.value.lastReceiveTime = new Date();

      // 匹配帧格式
      const matchResult = matchDataToFrame(packet, frameTemplateStore.frames);

      if (!matchResult.isMatched) {
        // 未匹配的数据包
        receiveStats.value.unmatchedPackets++;
        console.warn('接收到未匹配的数据包:', {
          source,
          sourceId,
          size: packet.size,
          errors: matchResult.errors,
        });
        return;
      }

      // 匹配成功
      receiveStats.value.matchedPackets++;

      // 处理数据并更新数据项
      const processResult = processReceivedData(packet, matchResult, mappings.value, groups.value);

      if (!processResult.success) {
        // 处理失败
        receiveStats.value.errorPackets++;
        console.error('数据处理失败:', {
          frameId: processResult.frameId,
          errors: processResult.errors,
        });
        return;
      }

      // 应用处理结果
      const applied = applyDataProcessResult(processResult, groups.value);
      if (!applied) {
        receiveStats.value.errorPackets++;
        console.error('应用数据处理结果失败');
        return;
      }

      // 更新帧统计
      if (matchResult.frameId) {
        updateFrameStats(matchResult.frameId, {
          totalReceived: (frameStats.value.get(matchResult.frameId)?.totalReceived || 0) + 1,
          lastReceiveTime: new Date(),
        });
      }

      console.log('数据处理成功:', {
        frameId: matchResult.frameId,
        frameName: matchResult.frame?.name,
        updatedItems: processResult.updatedDataItems?.length || 0,
      });
    } catch (error) {
      receiveStats.value.errorPackets++;
      console.error('数据接收处理异常:', error);
    }
  };

  /**
   * 清空接收统计
   */
  const clearReceiveStats = (): void => {
    receiveStats.value = {
      totalPackets: 0,
      matchedPackets: 0,
      unmatchedPackets: 0,
      errorPackets: 0,
      bytesReceived: 0,
    };
    recentPackets.value = [];
    frameStats.value.clear();
  };

  /**
   * 获取指定来源的最近数据包
   * @param source 数据来源
   * @param sourceId 来源标识
   * @returns 最近数据包列表
   */
  const getRecentPackets = (
    source?: 'serial' | 'network',
    sourceId?: string,
  ): ReceivedDataPacket[] => {
    if (!source && !sourceId) {
      return recentPackets.value;
    }

    return recentPackets.value.filter((packet) => {
      if (source && packet.source !== source) return false;
      if (sourceId && packet.sourceId !== sourceId) return false;
      return true;
    });
  };

  return {
    // 状态
    groups,
    mappings,
    frameStats,
    selectedFrameId,
    selectedGroupId,
    isLoading,
    receiveStats,
    recentPackets,

    // 计算属性
    receiveFrames,
    selectedFrameDataItems,
    selectedGroup,

    // 方法
    loadConfig,
    saveConfig,
    validateMappings,
    selectFrame,
    selectGroup,
    addGroup,
    removeGroup,
    updateFrameStats,
    addDataItemToGroup,
    updateDataItem,
    removeDataItem,
    removeMapping,
    addMapping,
    updateGroup,
    toggleDataItemVisibility,

    // 数据接收处理
    handleReceivedData,
    clearReceiveStats,
    getRecentPackets,
  };
});
