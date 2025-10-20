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
} from '../../types/frames/receive';
import type { Frame } from '../../types/frames/frames';
import { useFrameTemplateStore } from './frameTemplateStore';
import { dataStorageAPI, receiveAPI } from '../../api/common';
import { useGlobalStatsStore } from '../globalStatsStore';
import { useFrameExpressionManager } from '../../composables/frames/useFrameExpressionManager';
import {
  extractAndResolveParams,
  isScoeFrame,
  validateChecksums,
} from '../../utils/receive/scoeFrame';
import { useScoeStore } from '../scoeStore';
import { useScoeFrameInstancesStore } from './scoeFrameInstancesStore';
import { useScoeCommandExecutor } from '../../composables/scoe/useScoeCommandExecutor';
import { ScoeErrorReason } from 'src/types/scoe';

// 辅助函数：数据项查找
const findGroupById = (groups: DataGroup[], groupId: number): DataGroup | undefined => {
  return groups.find((g) => g.id === groupId);
};

const findDataItemInGroup = (group: DataGroup, dataItemId: number): DataItem | undefined => {
  return group.dataItems.find((item) => item.id === dataItemId);
};

const findDataItem = (
  groups: DataGroup[],
  groupId: number,
  dataItemId: number,
): { group: DataGroup; dataItem: DataItem } | null => {
  const group = findGroupById(groups, groupId);
  if (!group) return null;

  const dataItem = findDataItemInGroup(group, dataItemId);
  if (!dataItem) return null;

  return { group, dataItem };
};

// 辅助函数：ID生成
const generateNewGroupId = (groups: DataGroup[]): number => {
  return Math.max(...groups.map((g) => g.id), 0) + 1;
};

const generateNewDataItemId = (group: DataGroup): number => {
  return Math.max(...group.dataItems.map((item) => item.id), 0) + 1;
};

// 辅助函数：配置构建
const buildConfig = (groups: DataGroup[], mappings: FrameFieldMapping[]): ReceiveConfig => {
  return {
    groups,
    mappings,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

// 辅助函数：映射查找
const findMappingsByFrame = (
  mappings: FrameFieldMapping[],
  frameId: string,
): FrameFieldMapping[] => {
  return mappings.filter((mapping) => mapping.frameId === frameId);
};

export const useReceiveFramesStore = defineStore('receiveFrames', () => {
  // 核心状态
  const groups = ref<DataGroup[]>([]);
  const mappings = ref<FrameFieldMapping[]>([]);
  const frameStats = ref<Map<string, ReceiveFrameStats>>(new Map());
  const selectedFrameId = ref<string>('');
  const selectedGroupId = ref<number>(0);
  const isLoading = ref<boolean>(false);

  const globalStatsStore = useGlobalStatsStore();
  const frameExpressionManager = useFrameExpressionManager();
  const frameTemplateStore = useFrameTemplateStore();

  // SCOE 相关依赖（延迟初始化，避免循环依赖）
  let scoeStore: ReturnType<typeof useScoeStore> | null = null;
  let scoeFrameInstancesStore: ReturnType<typeof useScoeFrameInstancesStore> | null = null;
  let scoeCommandExecutor: ReturnType<typeof useScoeCommandExecutor> | null = null;

  const initializeScoeComponents = () => {
    if (!scoeStore) {
      scoeStore = useScoeStore();
    }
    if (!scoeFrameInstancesStore) {
      scoeFrameInstancesStore = useScoeFrameInstancesStore();
    }
    if (!scoeCommandExecutor) {
      scoeCommandExecutor = useScoeCommandExecutor();
    }
  };

  // 最近接收的数据包（用于调试和监控）
  const recentPackets = ref<ReceivedDataPacket[]>([]);
  const maxRecentPackets = 100; // 最多保留100个最近数据包

  // 内部辅助函数：添加最近数据包
  const addRecentPacket = (packet: ReceivedDataPacket): void => {
    recentPackets.value.unshift(packet);
    if (recentPackets.value.length > maxRecentPackets) {
      recentPackets.value.splice(maxRecentPackets);
    }
  };

  // 内部辅助函数：加载状态管理
  const withLoading = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      isLoading.value = true;
      return await operation();
    } finally {
      isLoading.value = false;
    }
  };

  // 获取发送任务Store（动态导入避免循环依赖）
  const getSendTasksStore = async () => {
    const { useSendTasksStore } = await import('./sendTasksStore');
    return useSendTasksStore();
  };

  // 获取数据显示Store（动态导入避免循环依赖）
  const getDataDisplayStore = async () => {
    const { useDataDisplayStore } = await import('./dataDisplayStore');
    return useDataDisplayStore();
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

  // 上一次的配置状态（用于比较）
  const lastConfigState = ref<string>('');

  // 防抖同步到主进程缓存
  let syncCacheTimeout: NodeJS.Timeout | null = null;
  const debouncedSyncCache = (): void => {
    if (syncCacheTimeout) {
      clearTimeout(syncCacheTimeout);
    }
    syncCacheTimeout = setTimeout(() => {
      syncConfigToMainProcess();
    }, 500); // 500ms防抖，比保存更快
  };

  // 同步配置到主进程缓存
  const syncConfigToMainProcess = async (): Promise<void> => {
    try {
      // 过滤出接收帧（包含直接和间接数据字段的完整帧）
      const receiveFrames = frameTemplateStore.frames.filter(
        (frame: Frame) => frame.direction === 'receive',
      );

      const result = await receiveAPI.updateConfigCache(
        receiveFrames,
        mappings.value,
        groups.value,
      );

      if (result.success && result.status) {
        console.log('✅ 配置已同步到主进程缓存:', result.status);
      } else {
        console.warn('⚠️ 同步配置到主进程失败');
      }
    } catch (error) {
      console.error('❌ 同步配置到主进程异常:', error);
    }
  };

  // 监听配置变化并自动保存 + 同步到主进程
  watch(
    configForWatch,
    (newConfig) => {
      // 避免在初始加载时触发保存
      if (!isLoading.value) {
        const newConfigString = JSON.stringify(newConfig);

        // 只有当配置真正发生变化时才保存
        if (lastConfigState.value !== newConfigString) {
          console.log('检测到接收帧配置变化，将在1秒后自动保存...');
          lastConfigState.value = newConfigString;
          debouncedSaveConfig();
          debouncedSyncCache(); // 同步到主进程缓存
        }
      } else {
        // 初始加载时记录配置状态，但不触发保存
        lastConfigState.value = JSON.stringify(newConfig);
      }
    },
    { deep: true },
  );

  // 监听帧模板变化，同步到主进程
  watch(
    () => frameTemplateStore.frames,
    () => {
      if (!isLoading.value) {
        console.log('检测到帧模板变化，同步到主进程缓存...');
        debouncedSyncCache();
      }
    },
    { deep: true },
  );

  // 计算属性：筛选接收帧
  const receiveFrames = computed(() => {
    return frameTemplateStore.frames.filter((frame: Frame) => frame.direction === 'receive');
  });

  const receiveFrameOptions = computed(() =>
    receiveFrames.value.map((frame) => ({
      id: frame.id,
      name: frame.name,
      fields:
        frame.fields?.map((field) => ({
          id: field.id,
          name: field.name,
        })) || [],
    })),
  );

  // 计算属性：选中帧的关联数据项
  const selectedFrameDataItems = computed(() => {
    if (!selectedFrameId.value) return [];

    const frameMapping = findMappingsByFrame(mappings.value, selectedFrameId.value);

    return frameMapping.map((mapping: FrameFieldMapping) => {
      const group = findGroupById(groups.value, mapping.groupId);
      const dataItem = group ? findDataItemInGroup(group, mapping.dataItemId) : undefined;
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

  // 计算属性：获取可用的接收帧选项（用于表达式配置等）
  const availableReceiveFrameOptions = computed(() =>
    receiveFrames.value.map((frame) => ({
      label: frame.name,
      value: frame.id,
    })),
  );

  // 计算属性：根据帧ID获取可用字段选项（只返回有映射关系的字段）
  const getAvailableFrameFieldOptions = computed(() => (frameId: string) => {
    if (!frameId) return [];

    // 获取该帧的所有映射关系
    const frameMappings = mappings.value.filter((mapping) => mapping.frameId === frameId);

    // 获取该帧的字段定义
    const frame = receiveFrames.value.find((f) => f.id === frameId);
    if (!frame || !frame.fields) return [];

    // 只返回存在映射关系的字段
    return frame.fields
      .filter((field) => frameMappings.some((mapping) => mapping.fieldId === field.id))
      .map((field) => ({
        label: `${field.name} (${field.dataType})`,
        value: field.id,
        frameId: frameId,
      }));
  });

  // 计算属性：获取所有接收帧的当前数据值（用于表达式计算）
  const allReceiveFrameData = computed(() => {
    const result = new Map<string, Map<string, unknown>>();

    // 遍历所有接收帧
    receiveFrames.value.forEach((frame) => {
      const frameData = new Map<string, unknown>();

      // 获取该帧的映射关系
      const frameMappings = mappings.value.filter((mapping) => mapping.frameId === frame.id);

      // 根据映射关系获取字段值
      frameMappings.forEach((mapping) => {
        const dataItem = findDataItem(groups.value, mapping.groupId, mapping.dataItemId);
        if (dataItem?.dataItem) {
          frameData.set(mapping.fieldId, dataItem.dataItem.value);
        }
      });

      result.set(frame.id, frameData);
    });

    return result;
  });

  // 方法：加载配置
  const loadConfig = async (): Promise<void> => {
    await withLoading(async () => {
      const configList = (await dataStorageAPI.receiveConfig.list()) as ReceiveConfig[];
      const result = configList[0] as ReceiveConfig | undefined;

      // 临时模拟数据
      const mockConfig = buildConfig([], []);

      groups.value = result?.groups ? result.groups : mockConfig.groups;
      mappings.value = result?.mappings ? result.mappings : mockConfig.mappings;

      // 验证映射关系
      await validateMappings();

      // 加载完成后立即同步到主进程缓存
      await syncConfigToMainProcess();
    });
  };

  // 方法：保存配置
  const saveConfig = async (): Promise<void> => {
    await withLoading(async () => {
      const config = buildConfig(groups.value, mappings.value);
      await dataStorageAPI.receiveConfig.save(config);
      console.log('接收配置已保存:', config);
    });
  };

  // 方法：导出配置（用于文件导出）
  const exportConfig = (): ReceiveConfig => {
    return buildConfig(groups.value, mappings.value);
  };

  // 方法：导入配置（用于文件导入）
  const importConfig = async (config: ReceiveConfig): Promise<void> => {
    await withLoading(async () => {
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
      await validateMappings();

      // 导入完成后立即同步到主进程缓存
      await syncConfigToMainProcess();

      console.log('接收配置导入成功:', config);
    });
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
    const newId = generateNewGroupId(groups.value);
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
    const group = findGroupById(groups.value, groupId);
    if (!group) {
      throw new Error(`分组ID ${groupId} 不存在`);
    }

    const newId = generateNewDataItemId(group);
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
    console.log(`📝 updateDataItem被调用: groupId=${groupId}, dataItemId=${dataItemId}`, updates);

    const result = findDataItem(groups.value, groupId, dataItemId);
    if (!result) {
      console.error(`❌ 找不到数据项: groupId=${groupId}, dataItemId=${dataItemId}`);
      return;
    }

    const beforeValue = result.dataItem.value;
    Object.assign(result.dataItem, updates);
    const afterValue = result.dataItem.value;

    console.log(
      `📝 数据项更新完成: ${result.dataItem.label} 从 ${beforeValue} 更新为 ${afterValue}`,
    );
  };

  // 方法：删除数据项
  const removeDataItem = (groupId: number, dataItemId: number): void => {
    const group = findGroupById(groups.value, groupId);
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
    const result = findDataItem(groups.value, groupId, dataItemId);
    if (!result) return;

    result.dataItem.isVisible = !result.dataItem.isVisible;
  };

  // 方法：切换数据项收藏状态
  const toggleDataItemFavorite = (groupId: number, dataItemId: number): void => {
    const result = findDataItem(groups.value, groupId, dataItemId);
    if (!result) return;

    result.dataItem.isFavorite = !result.dataItem.isFavorite;
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
   * 查找没有对应接收帧映射的孤立数据项
   * @returns 孤立数据项列表
   */
  const findOrphanedDataItems = (): Array<{
    groupId: number;
    groupLabel: string;
    dataItem: DataItem;
  }> => {
    const orphanedItems: Array<{
      groupId: number;
      groupLabel: string;
      dataItem: DataItem;
    }> = [];

    // 获取所有接收帧的ID
    const receiveFrameIds = new Set(receiveFrames.value.map((frame) => frame.id));

    groups.value.forEach((group) => {
      group.dataItems.forEach((dataItem) => {
        // 检查该数据项是否有对应的映射关系
        const hasMapping = mappings.value.some((mapping) => {
          // 检查映射关系是否指向该数据项
          const isTargetDataItem =
            mapping.groupId === group.id && mapping.dataItemId === dataItem.id;

          // 检查映射关系指向的帧是否存在且为接收帧
          const hasValidFrame = receiveFrameIds.has(mapping.frameId);

          return isTargetDataItem && hasValidFrame;
        });

        if (!hasMapping) {
          orphanedItems.push({
            groupId: group.id,
            groupLabel: group.label,
            dataItem,
          });
        }
      });
    });

    return orphanedItems;
  };

  /**
   * 删除没有对应接收帧映射的孤立数据项
   * @returns 删除结果统计
   */
  const removeOrphanedDataItems = (): {
    removedCount: number;
    removedItems: Array<{
      groupLabel: string;
      dataItemLabel: string;
    }>;
  } => {
    const orphanedItems = findOrphanedDataItems();
    const removedItems: Array<{
      groupLabel: string;
      dataItemLabel: string;
    }> = [];

    // 按分组分类孤立数据项
    const itemsByGroup = new Map<number, DataItem[]>();
    orphanedItems.forEach(({ groupId, dataItem }) => {
      if (!itemsByGroup.has(groupId)) {
        itemsByGroup.set(groupId, []);
      }
      itemsByGroup.get(groupId)!.push(dataItem);
    });

    // 删除孤立数据项
    itemsByGroup.forEach((dataItems, groupId) => {
      const group = groups.value.find((g) => g.id === groupId);
      if (!group) return;

      dataItems.forEach((dataItem) => {
        const index = group.dataItems.findIndex((item) => item.id === dataItem.id);
        if (index !== -1) {
          group.dataItems.splice(index, 1);
          removedItems.push({
            groupLabel: group.label,
            dataItemLabel: dataItem.label,
          });
        }
      });
    });

    return {
      removedCount: removedItems.length,
      removedItems,
    };
  };

  // 数据处理锁，防止并发处理导致的竞态条件
  const processingLock = ref(false);
  const pendingProcessQueue = ref<
    Array<{
      source: 'serial' | 'network';
      sourceId: string;
      data: Uint8Array;
      resolve: () => void;
      reject: (error: unknown) => void;
    }>
  >([]);

  /**
   * 过滤出包含直接数据字段的接收帧（computed缓存优化）
   * 间接数据字段不参与帧匹配，因为它们通过表达式计算得出
   * 返回只包含直接数据字段的帧副本，移除间接数据字段
   * 只有当帧模板发生变化时才重新计算，提高性能
   */
  const directDataFrames = computed(() => {
    return frameTemplateStore.frames
      .filter((frame) => frame.direction === 'receive')
      .map((frame) => {
        // 过滤出直接数据字段
        const directFields = frame.fields?.filter(
          (field) => (field.dataParticipationType || 'direct') === 'direct',
        );

        // 如果没有直接数据字段，排除此帧
        if (!directFields || directFields.length === 0) {
          return null;
        }

        // 返回只包含直接数据字段的帧副本
        return {
          ...frame,
          fields: directFields,
        };
      })
      .filter((frame): frame is Frame => frame !== null); // 移除null值并提供类型保护
  });

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
    // 如果正在处理数据，将当前请求加入队列
    if (processingLock.value) {
      return new Promise((resolve, reject) => {
        pendingProcessQueue.value.push({
          source,
          sourceId,
          data,
          resolve,
          reject,
        });
      });
    }

    // 设置处理锁
    processingLock.value = true;

    try {
      await processDataInternal(source, sourceId, data);

      // 处理队列中的待处理请求
      while (pendingProcessQueue.value.length > 0) {
        const nextRequest = pendingProcessQueue.value.shift();
        if (nextRequest) {
          try {
            await processDataInternal(nextRequest.source, nextRequest.sourceId, nextRequest.data);
            nextRequest.resolve();
          } catch (error) {
            nextRequest.reject(error);
          }
        }
      }
    } finally {
      // 释放处理锁
      processingLock.value = false;
    }
  };

  /**
   * 处理 SCOE 帧
   * @param data 接收到的数据包
   * @returns 是否成功处理为 SCOE 帧
   */
  const handleScoeFrame = async (data: Uint8Array): Promise<boolean> => {
    try {
      // 初始化 SCOE 组件
      initializeScoeComponents();

      if (!scoeStore || !scoeFrameInstancesStore || !scoeCommandExecutor) {
        console.warn('[SCOE] SCOE 组件未初始化');
        return false;
      }

      // 检查是否为 SCOE 帧
      const checkResult = isScoeFrame(
        data,
        scoeStore.loadedConfig,
        scoeStore.globalConfig,
        scoeStore.status.scoeFramesLoaded,
        scoeFrameInstancesStore.receiveCommands,
      );

      if (!checkResult.isScoe) {
        // 不是 SCOE 帧，记录详细信息用于调试
        console.log('[SCOE] 不是有效的 SCOE 帧:', checkResult.error);
        scoeStore.addReceiveData(
          Array.from(data)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
            .join(''),
          false, // 校验失败
          '不是有效的 SCOE 帧',
        );
        return false;
      }

      scoeStore.status.commandReceiveCount++;

      if (!checkResult.commandCode) {
        scoeStore.status.commandErrorCount++;
        scoeStore.status.lastErrorReason = ScoeErrorReason.COMMAND_CODE_NOT_FOUND;
        console.log('[SCOE] 识别到 SCOE 帧，但未找到对应指令码');
        scoeStore.addReceiveData(
          Array.from(data)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
            .join(''),
          false, // 校验失败
          '未找到对应指令码',
        );
        return false;
      }

      console.log('[SCOE] 识别到 SCOE 帧，指令码:', checkResult.commandCode);

      // 1. 校验和检查
      const checksumResult = validateChecksums(data, checkResult.commandCode.checksums);
      if (!checksumResult.valid) {
        console.warn('[SCOE] 校验和错误:', checksumResult.error);
        scoeStore.status.commandErrorCount++;
        scoeStore.status.lastErrorReason = ScoeErrorReason.CHECKSUM_ERROR;
        scoeStore.addReceiveData(
          Array.from(data)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
            .join(''),
          false, // 校验失败
          '校验和错误',
        );
        return true;
      }

      // 2. 参数解析
      const params: Record<string, unknown> = {};
      if (checkResult.commandCode.params?.length) {
        const paramValues = extractAndResolveParams(data, checkResult.commandCode.params);
        params.resolvedParams = paramValues;
      }

      // 3. 添加卫星ID
      if (checkResult.extractedSatelliteId) {
        params.satelliteId = checkResult.extractedSatelliteId;
      }

      // 4. 执行对应的指令（统计信息会在 useScoeCommandExecutor 中更新 scoeStore.status）
      const result = await scoeCommandExecutor.executeCommand(checkResult.commandCode, params);

      // 5. 记录接收数据
      scoeStore.addReceiveData(
        Array.from(data)
          .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
          .join(''),
        result.success, // 校验成功
        result.message,
      );

      return true; // 已作为 SCOE 帧处理
    } catch (error) {
      console.error('[SCOE] SCOE 帧处理异常:', error);
      // 异常情况下增加错误计数
      if (scoeStore) {
        scoeStore.status.commandErrorCount++;
      }
      return false;
    }
  };

  /**
   * 内部数据处理函数
   */
  const processDataInternal = async (
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
  ): Promise<void> => {
    try {
      // 更新全局接收统计
      globalStatsStore.incrementReceivedPackets();
      globalStatsStore.addReceivedBytes(data.length);

      // ⭐ SCOE 帧检测和处理（仅处理来自 scoe-tcp-server 的数据）
      if (sourceId === 'scoe-tcp-server') {
        const scoeHandled = await handleScoeFrame(data);
        if (scoeHandled) {
          return; // SCOE 帧处理完毕，直接返回
        }
      }

      // 调用主进程的统一数据处理接口（优化版：只传输数据，配置从缓存读取）
      const result = await receiveAPI.handleReceivedData(source, sourceId, data);

      // 处理返回结果
      if (!result.success) {
        // 更新全局统计：未匹配帧
        globalStatsStore.incrementUnmatchedFrames();

        // 检查是否是解析错误
        if (result.errors?.some((error) => error.includes('解析') || error.includes('parse'))) {
          globalStatsStore.incrementFrameParseErrors();
        }

        // 处理失败的情况
        if (result.recentPacket) {
          addRecentPacket(result.recentPacket);
        }

        // 输出错误信息
        if (result.errors && result.errors.length > 0) {
          console.warn('数据处理失败:', result.errors);
        }
        return;
      }

      // 处理成功的情况

      // 更新全局统计：匹配成功的帧
      globalStatsStore.incrementMatchedFrames();

      // 添加最近数据包
      if (result.recentPacket) {
        addRecentPacket(result.recentPacket);
      }

      // 智能更新数据分组（保留表达式计算结果）
      if (result.updatedGroups) {
        // 保存当前所有表达式字段的计算结果
        const preservedExpressionValues = new Map<
          string,
          { value: unknown; displayValue: string }
        >();
        groups.value.forEach((group) => {
          group.dataItems.forEach((item) => {
            // 找到对应的映射，检查字段是否是表达式字段
            const mapping = mappings.value.find(
              (m) => m.groupId === group.id && m.dataItemId === item.id,
            );
            if (mapping) {
              const frame = frameTemplateStore.frames.find((f) => f.id === mapping.frameId);
              const field = frame?.fields?.find((f) => f.id === mapping.fieldId);

              // 如果是表达式字段且有值，则保存
              if (
                field?.expressionConfig &&
                field.expressionConfig.expressions.length > 0 &&
                item.value !== null &&
                item.value !== undefined
              ) {
                const key = `${group.id}-${item.id}`;
                preservedExpressionValues.set(key, {
                  value: item.value,
                  displayValue: item.displayValue,
                });
              }
            }
          });
        });

        // 更新groups
        groups.value = result.updatedGroups;

        // 恢复表达式字段的计算结果
        if (preservedExpressionValues.size > 0) {
          groups.value.forEach((group) => {
            group.dataItems.forEach((item) => {
              const key = `${group.id}-${item.id}`;
              const preserved = preservedExpressionValues.get(key);
              if (preserved) {
                item.value = preserved.value;
                item.displayValue = preserved.displayValue;
              }
            });
          });
        }
      }

      // 立即计算表达式（同步执行，确保数据一致性）
      if (result.frameStats?.frameId) {
        const frameId = result.frameStats.frameId;
        try {
          frameExpressionManager.calculateAndApplyReceiveFrame(frameId);
        } catch (error) {
          console.error('接收帧表达式计算失败:', error);
        }
      }

      // 收集星座图数据（异步处理）
      if (result.frameStats?.frameId && result.updatedGroups) {
        collectConstellationData(result.frameStats.frameId, result.updatedGroups);
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
      console.error('数据接收处理异常:', error);
      throw error; // 重新抛出错误，让调用者处理
    }
  };

  /**
   * 收集星座图数据
   */
  const collectConstellationData = async (
    frameId: string,
    updatedGroups: DataGroup[],
  ): Promise<void> => {
    try {
      const dataDisplayStore = await getDataDisplayStore();

      // 遍历更新的分组和数据项
      updatedGroups.forEach((group) => {
        group.dataItems.forEach((dataItem) => {
          // 查找该数据项对应的映射关系
          const mapping = mappings.value.find(
            (m) => m.groupId === group.id && m.dataItemId === dataItem.id,
          );

          if (
            mapping &&
            mapping.frameId === frameId &&
            dataItem.value &&
            dataItem.dataType === 'bytes'
          ) {
            dataDisplayStore.collectConstellationFieldData(
              frameId,
              mapping.fieldId,
              dataItem.value as string,
            );
          }
        });
      });
    } catch (error) {
      console.error('星座图数据收集异常:', error);
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
   * 清空数据包记录和帧统计
   */
  const clearReceiveStats = (): void => {
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

  /**
   * 在可见项中上移数据项
   * @param groupId 分组ID
   * @param dataItemId 数据项ID
   */
  const moveVisibleDataItemUp = (groupId: number, dataItemId: number): void => {
    const group = findGroupById(groups.value, groupId);
    if (!group) return;

    // 获取所有可见项的索引
    const visibleItems = group.dataItems.filter((item) => item.isVisible);
    const visibleItemIndex = visibleItems.findIndex((item) => item.id === dataItemId);

    if (visibleItemIndex <= 0) return; // 已经是第一个或不存在

    // 在原数组中找到当前项和目标项的索引
    const currentItemIndex = group.dataItems.findIndex((item) => item.id === dataItemId);
    const targetItem = visibleItems[visibleItemIndex - 1];
    if (!targetItem) return;

    const targetItemIndex = group.dataItems.findIndex((item) => item.id === targetItem.id);

    if (currentItemIndex === -1 || targetItemIndex === -1) return;

    // 交换两个项目的位置
    const currentItem = group.dataItems[currentItemIndex];
    if (!currentItem) return;

    group.dataItems.splice(currentItemIndex, 1);
    group.dataItems.splice(targetItemIndex, 0, currentItem);

    // 保存配置
    debouncedSaveConfig();
  };

  /**
   * 在可见项中下移数据项
   * @param groupId 分组ID
   * @param dataItemId 数据项ID
   */
  const moveVisibleDataItemDown = (groupId: number, dataItemId: number): void => {
    const group = findGroupById(groups.value, groupId);
    if (!group) return;

    // 获取所有可见项的索引
    const visibleItems = group.dataItems.filter((item) => item.isVisible);
    const visibleItemIndex = visibleItems.findIndex((item) => item.id === dataItemId);

    if (visibleItemIndex === -1 || visibleItemIndex >= visibleItems.length - 1) return; // 已经是最后一个或不存在

    // 在原数组中找到当前项和目标项的索引
    const currentItemIndex = group.dataItems.findIndex((item) => item.id === dataItemId);
    const targetItem = visibleItems[visibleItemIndex + 1];
    if (!targetItem) return;

    const targetItemIndex = group.dataItems.findIndex((item) => item.id === targetItem.id);

    if (currentItemIndex === -1 || targetItemIndex === -1) return;

    // 交换两个项目的位置
    const currentItem = group.dataItems[currentItemIndex];
    if (!currentItem) return;

    group.dataItems.splice(currentItemIndex, 1);
    group.dataItems.splice(targetItemIndex, 0, currentItem);

    // 保存配置
    debouncedSaveConfig();
  };

  return {
    // 状态
    groups,
    mappings,
    frameStats,
    selectedFrameId,
    selectedGroupId,
    isLoading,
    recentPackets,

    // 计算属性
    receiveFrames,
    receiveFrameOptions,
    selectedFrameDataItems,
    selectedGroup,
    availableReceiveFrameOptions,
    getAvailableFrameFieldOptions,
    allReceiveFrameData,
    directDataFrames,

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
    findOrphanedDataItems,
    removeOrphanedDataItems,
    moveVisibleDataItemUp,
    moveVisibleDataItemDown,
  };
});
