/**
 * 接收帧状态管理Store
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type {
  DataGroup,
  FrameFieldMapping,
  ReceiveFrameStats,
  ReceiveConfig,
  ValidationResult,
  DataItem,
  ReceivedDataPacket,
  DataReceiveStats,
} from '../../types/frames/receive';
import type { Frame } from '../../types/frames/frames';
import { useFrameTemplateStore } from './frameTemplateStore';
import { dataStorageAPI, receiveAPI } from 'src/utils/electronApi';

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

  // 获取发送任务Store（动态导入避免循环依赖）
  const getSendTasksStore = async () => {
    const { useSendTasksStore } = await import('./sendTasksStore');
    return useSendTasksStore();
  };

  // 防抖保存函数
  let saveTimeout: NodeJS.Timeout | null = null;
  const debouncedSaveConfig = (): void => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveConfig();
    }, 1000); // 1秒防抖
  };

  // 创建用于监听的计算属性（排除value和displayValue）
  const configForWatch = computed(() => {
    // 过滤掉value和displayValue字段的groups副本
    const filteredGroups = groups.value.map((group) => ({
      ...group,
      dataItems: group.dataItems.map((item) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { value: _value, displayValue: _displayValue, ...configItem } = item;
        return configItem;
      }),
    }));

    return {
      groups: filteredGroups,
      mappings: mappings.value,
    };
  });

  // 监听配置变化并自动保存
  watch(
    configForWatch,
    () => {
      // 避免在初始加载时触发保存
      if (!isLoading.value) {
        console.log('检测到接收帧配置变化，将在1秒后自动保存...');
        debouncedSaveConfig();
      }
    },
    { deep: true },
  );

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
      const result = (await dataStorageAPI.receiveConfig.list())[0] as ReceiveConfig | undefined;

      // 临时模拟数据
      const mockConfig: ReceiveConfig = {
        groups: [],
        mappings: [],
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      groups.value = result?.groups ? result.groups : mockConfig.groups;
      mappings.value = result?.mappings ? result.mappings : mockConfig.mappings;

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
      await dataStorageAPI.receiveConfig.save(config);

      console.log('接收配置已保存:', config);
    } catch (error) {
      console.error('保存接收配置失败:', error);
    } finally {
      isLoading.value = false;
    }
  };

  // 方法：导出配置（用于文件导出）
  const exportConfig = (): ReceiveConfig => {
    return {
      groups: groups.value,
      mappings: mappings.value,
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  // 方法：导入配置（用于文件导入）
  const importConfig = async (config: ReceiveConfig): Promise<void> => {
    try {
      isLoading.value = true;

      // 验证导入的配置数据
      if (!config || typeof config !== 'object') {
        throw new Error('无效的配置数据格式');
      }

      if (!Array.isArray(config.groups) || !Array.isArray(config.mappings)) {
        throw new Error('配置数据缺少必要的分组或映射信息');
      }

      // 清空当前配置
      groups.value = [];
      mappings.value = [];

      // 导入分组数据
      groups.value = config.groups.map((group) => ({
        ...group,
        dataItems: group.dataItems.map((item) => ({
          ...item,
          // 确保isFavorite字段存在，如果不存在则设置默认值
          isFavorite: item.isFavorite ?? false,
          // 重置运行时值，只保留配置信息
          value: null,
          displayValue: '-',
        })),
      }));

      // 导入映射数据
      mappings.value = [...config.mappings];

      // 验证映射关系
      validateMappings();

      console.log('接收配置导入成功:', config);
    } catch (error) {
      console.error('导入接收配置失败:', error);
      throw error; // 重新抛出错误，让调用方处理
    } finally {
      isLoading.value = false;
    }
  };

  // 方法：验证映射关系
  const validateMappings = async (): Promise<ValidationResult> => {
    try {
      return await receiveAPI.validateMappings(
        mappings.value,
        frameTemplateStore.frames,
        groups.value,
      );
    } catch (error) {
      console.error('验证映射关系失败:', error);
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : '验证过程发生未知错误'],
      };
    }
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

  // 方法：切换数据项收藏状态
  const toggleDataItemFavorite = (groupId: number, dataItemId: number): void => {
    const group = groups.value.find((g: DataGroup) => g.id === groupId);
    if (!group) return;

    const dataItem = group.dataItems.find((item) => item.id === dataItemId);
    if (!dataItem) return;

    dataItem.isFavorite = !dataItem.isFavorite;
  };

  /**
   * 清空所有数据项的值
   */
  const clearDataItemValues = (): void => {
    groups.value.forEach((group) => {
      group.dataItems.forEach((dataItem) => {
        dataItem.value = null;
        dataItem.displayValue = '';
      });
    });
  };

  /**
   * 统一数据接收处理入口
   * @param source 数据来源
   * @param sourceId 来源标识
   * @param data 接收数据
   */
  const handleReceivedData = async (
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
  ): Promise<void> => {
    try {
      // 调用主进程的统一数据处理接口
      const result = await receiveAPI.handleReceivedData(
        source,
        sourceId,
        data,
        frameTemplateStore.frames,
        mappings.value,
        groups.value,
      );

      // 处理返回结果
      if (!result.success) {
        // 处理失败的情况
        if (result.recentPacket) {
          // 添加到最近数据包列表
          recentPackets.value.unshift(result.recentPacket);
          if (recentPackets.value.length > maxRecentPackets) {
            recentPackets.value.splice(maxRecentPackets);
          }
        }

        // 更新接收统计
        if (result.receiveStats) {
          receiveStats.value.totalPackets += result.receiveStats.totalPackets || 0;
          receiveStats.value.unmatchedPackets += result.receiveStats.unmatchedPackets || 0;
          receiveStats.value.matchedPackets += result.receiveStats.matchedPackets || 0;
          receiveStats.value.errorPackets += result.receiveStats.errorPackets || 0;
          receiveStats.value.bytesReceived += result.receiveStats.bytesReceived || 0;
          receiveStats.value.lastReceiveTime = new Date();
        }

        // 输出错误信息
        if (result.errors && result.errors.length > 0) {
          console.warn('数据处理失败:', result.errors);
        }
        return;
      }

      // 处理成功的情况

      // 添加最近数据包
      if (result.recentPacket) {
        recentPackets.value.unshift(result.recentPacket);
        if (recentPackets.value.length > maxRecentPackets) {
          recentPackets.value.splice(maxRecentPackets);
        }
      }

      // 更新数据分组
      if (result.updatedGroups) {
        groups.value = result.updatedGroups;
      }

      // 更新帧统计
      if (result.frameStats && result.frameStats.frameId) {
        const currentStats = frameStats.value.get(result.frameStats.frameId) || {
          frameId: result.frameStats.frameId,
          totalReceived: 0,
          lastReceiveTime: new Date(),
          checksumFailures: 0,
          errorCount: 0,
        };

        frameStats.value.set(result.frameStats.frameId, {
          ...currentStats,
          totalReceived: currentStats.totalReceived + (result.frameStats.totalReceived || 0),
          lastReceiveTime: result.frameStats.lastReceiveTime || new Date(),
          ...(result.frameStats.lastReceivedFrame && {
            lastReceivedFrame: result.frameStats.lastReceivedFrame,
          }),
        });
      }

      // 更新接收统计
      if (result.receiveStats) {
        receiveStats.value.totalPackets += result.receiveStats.totalPackets || 0;
        receiveStats.value.matchedPackets += result.receiveStats.matchedPackets || 0;
        receiveStats.value.bytesReceived += result.receiveStats.bytesReceived || 0;
        receiveStats.value.lastReceiveTime = new Date();
      }

      console.log('数据处理成功:', {
        frameId: result.frameStats?.frameId,
        updatedGroups: result.updatedGroups ? result.updatedGroups.length : 0,
      });

      // 检查触发条件（异步处理，不阻塞当前流程）
      if (result.frameStats?.frameId && result.updatedGroups) {
        // 从更新的分组中提取数据项信息用于触发条件检查
        const updatedDataItems: {
          groupId: number;
          dataItemId: number;
          value: unknown;
          displayValue: string;
        }[] = [];

        result.updatedGroups.forEach((group) => {
          group.dataItems.forEach((dataItem) => {
            if (dataItem.value !== null && dataItem.value !== undefined) {
              updatedDataItems.push({
                groupId: group.id,
                dataItemId: dataItem.id,
                value: dataItem.value,
                displayValue: dataItem.displayValue,
              });
            }
          });
        });

        if (updatedDataItems.length > 0) {
          checkTriggerConditions(
            result.frameStats.frameId,
            source + ':' + sourceId,
            updatedDataItems,
          );
        }
      }
    } catch (error) {
      receiveStats.value.errorPackets++;
      receiveStats.value.totalPackets++;
      receiveStats.value.bytesReceived += data.length;
      receiveStats.value.lastReceiveTime = new Date();
      console.error('数据接收处理异常:', error);
    }
  };

  /**
   * 检查触发条件
   */
  const checkTriggerConditions = async (
    frameId: string,
    sourceId: string,
    updatedDataItems: {
      groupId: number;
      dataItemId: number;
      value: unknown;
      displayValue: string;
    }[],
  ): Promise<void> => {
    try {
      const sendTasksStore = await getSendTasksStore();

      // 将简化的数据项转换为DataItem格式
      const dataItems: DataItem[] = updatedDataItems.map((item) => {
        // 从对应的分组中查找完整的DataItem信息
        const group = groups.value.find((g) => g.id === item.groupId);
        const dataItem = group?.dataItems.find((di) => di.id === item.dataItemId);

        if (dataItem) {
          // 返回带有更新值的DataItem
          return {
            ...dataItem,
            value: item.value,
            displayValue: item.displayValue,
          };
        } else {
          // 如果找不到原始DataItem，创建一个最小的DataItem对象
          return {
            id: item.dataItemId,
            label: `数据项${item.dataItemId}`,
            isVisible: true,
            isFavorite: false,
            dataType: 'uint8' as const,
            value: item.value,
            displayValue: item.displayValue,
            useLabel: false,
          };
        }
      });

      sendTasksStore.handleFrameReceived(frameId, sourceId, dataItems);
    } catch (error) {
      console.error('触发条件检查异常:', error);
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
    exportConfig,
    importConfig,
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
    toggleDataItemFavorite,

    // 数据接收处理
    handleReceivedData,
    clearReceiveStats,
    getRecentPackets,

    // 新方法
    clearDataItemValues,
    debouncedSaveConfig,
  };
});
