import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { dataStorageAPI } from '../api/common/dataStorageApi';
import type { ScoeSatelliteConfig, ScoeStatus, ScoeGlobalConfig, ScoeData } from '../types/scoe';
import {
  defaultScoeGlobalConfig,
  defaultScoeSatelliteConfig,
  defaultScoeStatus,
  defaultScoeStatusUpdate,
} from '../types/scoe';
import { useTimerManager } from 'src/composables/common/useTimerManager';
import { useNetworkStore } from './netWorkStore';
import { useScoeFrameInstancesStore } from './frames/scoeFrameInstancesStore';
import { useUnifiedSender } from 'src/composables/frames/sendFrame/useUnifiedSender';
import { useScoeTestTool } from 'src/composables/scoe/useScoeTestTool';

export const useScoeStore = defineStore('scoe', () => {
  // ==================== 依赖注入 ====================
  const timerManager = useTimerManager();
  const networkStore = useNetworkStore();
  const scoeFrameInstancesStore = useScoeFrameInstancesStore();
  const { sendFrameInstance } = useUnifiedSender();
  const {
    addSendData,
    addReceiveData,
    setMaxRecordLines,
    initialize: initializeTestTool,
    sendDataList,
    receiveDataList,
    maxRecordLines,
    sendStopped,
    receiveStopped,
  } = useScoeTestTool();

  // ==================== 配置相关状态 ====================
  // 全局配置
  const globalConfig = ref<ScoeGlobalConfig>(defaultScoeGlobalConfig);

  // 卫星配置列表
  const satelliteConfigs = ref<ScoeSatelliteConfig[]>([]);

  // 当前选中的卫星配置ID
  const selectedConfigId = ref<string>('');

  // ==================== 状态相关 ====================
  // SCOE状态信息
  const status = ref<ScoeStatus>(defaultScoeStatus);
  const statusUpdate = defaultScoeStatusUpdate;
  const tcpConnected = ref(false);
  const udpConnected = ref(false);

  // ==================== 计算属性 ====================
  // 当前选中的卫星配置
  const selectedConfig = computed(() => {
    return satelliteConfigs.value.find(
      (config: ScoeSatelliteConfig) => config.id === selectedConfigId.value,
    );
  });

  // 已加载的卫星配置
  const loadedConfig = computed(() => {
    return satelliteConfigs.value.find(
      (config: ScoeSatelliteConfig) => config.satelliteId === status.value.loadedSatelliteId,
    );
  });

  // 当前选中的卫星ID
  const selectedSatelliteId = computed(() => {
    return selectedConfig.value?.satelliteId || '';
  });

  // ==================== 配置管理方法 ====================
  /**
   * 加载卫星配置数据
   */
  const loadSatelliteConfigs = async () => {
    try {
      const result = await dataStorageAPI.scoeSatelliteConfigs.list();
      const configsData = (result as unknown as ScoeData) || {
        satelliteConfigs: [],
        globalConfig: defaultScoeGlobalConfig,
      };

      satelliteConfigs.value = configsData.satelliteConfigs || [];
      globalConfig.value = configsData.globalConfig || defaultScoeGlobalConfig;

      // 如果有配置且没有选中项，选中第一个
      if (satelliteConfigs.value.length > 0 && !selectedConfigId.value) {
        selectedConfigId.value = satelliteConfigs.value[0]?.id || '';
      }

      return configsData;
    } catch (error) {
      console.error('加载卫星配置失败:', error);
      return {
        satelliteConfigs: [],
        globalConfig: defaultScoeGlobalConfig,
      };
    }
  };

  /**
   * 保存所有配置到文件
   */
  const saveAllConfigs = async () => {
    try {
      const dataToSave = {
        satelliteConfigs: satelliteConfigs.value,
        globalConfig: globalConfig.value,
      };
      await dataStorageAPI.scoeSatelliteConfigs.saveAll(dataToSave as unknown as unknown[]);
      return { success: true };
    } catch (error) {
      console.error('保存卫星配置失败:', error);
      return { success: false, message: error instanceof Error ? error.message : '保存失败' };
    }
  };

  /**
   * 保存当前配置
   */
  const saveCurrentConfig = async () => {
    return await saveAllConfigs();
  };

  /**
   * 添加新的卫星配置
   */
  const addSatelliteConfig = async (configId?: string) => {
    // 生成新ID
    const existingIds = satelliteConfigs.value
      .map((c) => parseInt(c.id))
      .filter((id) => !isNaN(id));
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newId = (maxId + 1).toString();

    if (configId) {
      const config = satelliteConfigs.value.find((c: ScoeSatelliteConfig) => c.id === configId);
      if (config) {
        satelliteConfigs.value.push({
          ...config,
          id: newId,
        });
      } else {
        return { success: false, message: '该ID配置不存在' };
      }
    } else {
      satelliteConfigs.value.push({
        ...defaultScoeSatelliteConfig,
        id: newId,
      });
    }

    selectedConfigId.value = newId;
    await saveAllConfigs();

    return { success: true };
  };

  /**
   * 删除卫星配置
   */
  const deleteSatelliteConfig = async (configId: string) => {
    const index = satelliteConfigs.value.findIndex(
      (config: ScoeSatelliteConfig) => config.id === configId,
    );
    if (index !== -1) {
      satelliteConfigs.value.splice(index, 1);

      // 如果删除的是当前选中的配置，清空选中状态
      if (selectedConfigId.value === configId) {
        selectedConfigId.value =
          satelliteConfigs.value.length > 0 ? satelliteConfigs.value[0]?.id || '' : '';
      }

      await saveAllConfigs();
    }
  };

  /**
   * 更新卫星配置
   */
  const updateSatelliteConfig = (configId: string, updates: Partial<ScoeSatelliteConfig>) => {
    const config = satelliteConfigs.value.find((c: ScoeSatelliteConfig) => c.id === configId);
    if (config) {
      Object.assign(config, updates);
    }
  };

  /**
   * 选择配置
   */
  const selectConfig = (configId: string) => {
    selectedConfigId.value = configId;
  };

  // ==================== 网络连接管理 ====================
  /**
   * 检查卫星加载状态并管理UDP连接
   */
  const checkSatelliteLoad = async () => {
    if (status.value.scoeFramesLoaded && !udpConnected.value) {
      status.value.loadedSatelliteId = selectedSatelliteId.value;
      await networkStore
        .connect({
          id: 'scoe-udp',
          name: 'SCOE UDP',
          type: 'udp',
          host: globalConfig.value.udpIpAddress || '',
          port: globalConfig.value.udpPort || 0,
          remoteHosts: [
            {
              id: 'scoe-udp-remote',
              name: '卫星ID:' + status.value.loadedSatelliteId,
              host: selectedConfig.value?.sendConfig.udpIpAddress || '',
              port: selectedConfig.value?.sendConfig.udpPort || 0,
            },
          ],
        })
        .then((result) => {
          if (result.success) {
            udpConnected.value = true;
          } else {
            udpConnected.value = false;
          }
        });
    } else if (!status.value.scoeFramesLoaded && udpConnected.value) {
      status.value.loadedSatelliteId = '';
      udpConnected.value = false;
      await networkStore.disconnect('scoe-udp');
    }
  };

  /**
   * 检查TCP连接状态并管理TCP连接
   */
  const checkTcpConnection = async () => {
    if (!tcpConnected.value) {
      await networkStore
        .connect({
          id: 'scoe-tcp-server',
          name: 'SCOE TCP Server',
          type: 'tcp-server',
          host: globalConfig.value.tcpServerIp,
          port: globalConfig.value.tcpServerPort,
        })
        .then((result) => {
          if (result.success) {
            tcpConnected.value = true;
          } else {
            tcpConnected.value = false;
          }
        });
    } else if (tcpConnected.value) {
      await networkStore.disconnect('scoe-tcp-server');
      tcpConnected.value = false;
    }
  };

  /**
   * 发送SCOE帧
   */
  const sendScoeFrames = async () => {
    if (udpConnected.value) {
      scoeFrameInstancesStore.sendInstances.forEach(async (instance) => {
        const result = await sendFrameInstance('network:scoe-udp:scoe-udp-remote', instance);
        if (!result.success) {
          console.warn('发送帧实例失败');
        }
      });
    }
  };

  // ==================== 状态更新 ====================
  /**
   * 更新状态信息
   */
  const updateStatus = async () => {
    status.value.runtimeSeconds++;
    if (status.value.scoeFramesLoaded) {
      status.value.satelliteIdRuntimeSeconds++;
    } else {
      status.value.satelliteIdRuntimeSeconds = 0;
    }

    await checkSatelliteLoad();
    await sendScoeFrames();
  };

  // ==================== 初始化 ====================
  /**
   * 初始化SCOE系统
   */
  const initialize = async () => {
    await loadSatelliteConfigs();
    if (globalConfig.value.tcpServerAutoConnect) {
      await checkTcpConnection();
    }
    timerManager
      .registerTimer(
        {
          id: 'SCOE_UPDATE_STATUS',
          type: 'interval',
          interval: 1000,
          autoStart: true,
        },
        () => {
          updateStatus();
        },
      )
      .then((result) => {
        if (result.success) {
          console.log('SCOE状态更新定时器已启动（常开模式）');
        } else {
          console.error('启动SCOE状态更新定时器失败:', result.message);
        }
      });
  };

  return {
    // ==================== 状态 ====================
    globalConfig,
    satelliteConfigs,
    selectedConfigId,
    status,
    statusUpdate,
    tcpConnected,
    udpConnected,

    // ==================== 计算属性 ====================
    selectedConfig,
    loadedConfig,
    selectedSatelliteId,

    // ==================== 配置管理 ====================
    loadSatelliteConfigs,
    saveAllConfigs,
    saveCurrentConfig,
    addSatelliteConfig,
    deleteSatelliteConfig,
    updateSatelliteConfig,
    selectConfig,
    checkTcpConnection,

    // ==================== 状态更新 ====================
    updateStatus,

    // ==================== 测试工具 ====================
    sendDataList,
    receiveDataList,
    maxRecordLines,
    sendStopped,
    receiveStopped,
    addSendData,
    addReceiveData,
    setMaxRecordLines,
    initializeTestTool,

    // ==================== 初始化 ====================
    initialize,
  };
});
