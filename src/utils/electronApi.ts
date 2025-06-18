/**
 * Electron API 桥接
 * 在渲染进程中访问主进程API的安全方式
 */

import { deepClone } from './frames/frameUtils';
import type { SerialPortOptions, SerialStatus } from '../types/serial/serial';
import type { Frame } from '../types/frames/frames';
import type {
  FrameFieldMapping,
  DataGroup,
  ValidationResult,
  ReceivedDataPacket,
  ReceiveFrameStats,
  DataReceiveStats,
} from '../types/frames/receive';
import type {
  NetworkConnectionConfig,
  NetworkConnection,
  NetworkStatus,
  NetworkOperationResult,
  NetworkConnectionOptions,
} from '../types/serial/network';
import type {
  StorageConfig,
  StorageStats,
  StorageOperationResult,
  FrameHeaderRule,
  RuleValidationResult,
} from '../types/serial/highSpeedStorage';
import type {
  HourlyDataFile,
  HistoryFileInfo,
  StorageStats as HistoryStorageStats,
  CSVExportConfig,
  CSVExportResult,
} from '../types/storage/historyData';
import { DATA_PATH_MAP } from '../config/configDefaults';

// 简单实现获取路径的最后一部分（basename）
function getBasename(fullPath: string): string {
  // 处理不同操作系统的路径分隔符
  const normalized = fullPath.replace(/\\/g, '/');
  // 取最后一段作为basename
  const parts = normalized.split('/');
  return parts[parts.length - 1] || fullPath;
}

// 从window对象获取预加载脚本中注入的electron API
export const electronAPI = window.electron || {
  // 提供默认实现，防止开发环境中没有electron时报错
  window: {
    minimize: () => console.warn('Electron API不可用: window.minimize'),
    maximize: () => console.warn('Electron API不可用: window.maximize'),
    close: () => console.warn('Electron API不可用: window.close'),
    isMaximized: () => Promise.resolve(false),
  },
  menu: {
    popup: () => console.warn('Electron API不可用: menu.popup'),
  },
  serial: {
    listPorts: () => Promise.resolve([]),
    open: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    close: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    closeAll: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    write: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    sendData: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    read: () => Promise.resolve({ portPath: '', data: new Uint8Array(), size: 0 }),
    onData: () => () => {}, // 返回一个取消监听的函数
    offData: () => {},
    onDataSent: () => () => {}, // 返回一个取消监听的函数
    offDataSent: () => {},
    onStatusChange: () => () => {}, // 返回一个取消监听的函数
    onAllStatusChange: () => () => {}, // 返回一个取消监听的函数
    getStatus: () => Promise.resolve({ isOpen: false, error: 'Electron API不可用' }),
    getAllStatus: () => Promise.resolve({}),
    setOptions: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    clearBuffer: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
  },
  network: {
    connect: () => Promise.resolve({ success: false, error: 'Electron API不可用' }),
    disconnect: () => Promise.resolve({ success: false, error: 'Electron API不可用' }),
    send: () => Promise.resolve({ success: false, error: 'Electron API不可用' }),
    getConnections: () => Promise.resolve([]),
    getStatus: () => Promise.resolve(null),
    onData: () => () => {}, // 返回一个取消监听的函数
    onConnectionEvent: () => () => {}, // 返回一个取消监听的函数
    onStatusChange: () => () => {}, // 返回一个取消监听的函数
  },
  files: {
    listWithMetadata: () => Promise.resolve([]),
    getFullPath: () => Promise.resolve(''),
    ensureDirectory: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    saveJsonToFile: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    loadJsonFromFile: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
    deleteFile: () => Promise.resolve({ success: false, message: 'Electron API不可用' }),
  },
  bookmark: {
    getAll: () => Promise.resolve([]),
    add: () => Promise.resolve(null),
    remove: () => Promise.resolve(false),
  },
  category: {
    getAll: () => Promise.resolve([]),
    add: () => Promise.resolve(null),
    update: () => Promise.resolve(false),
    remove: () => Promise.resolve(false),
  },
  autoLaunch: {
    isEnabled: () => Promise.resolve(false),
    enable: () => Promise.resolve(),
    disable: () => Promise.resolve(),
  },
  receive: {
    handleReceivedData: () =>
      Promise.resolve({
        success: false,
        errors: ['Electron API不可用'],
      }),
    validateMappings: () =>
      Promise.resolve({
        isValid: false,
        errors: ['Electron API不可用'],
      }),
  },
  dataStorage: {
    // 为每个存储类型创建模拟API
    ...Object.fromEntries(
      Object.keys(DATA_PATH_MAP).map((key) => [
        key,
        {
          list: () => Promise.resolve([]),
          save: () => Promise.reject(new Error('Electron API 不可用')),
          delete: () => Promise.reject(new Error('Electron API 不可用')),
          saveAll: () => Promise.reject(new Error('Electron API 不可用')),
          export: () => Promise.reject(new Error('Electron API 不可用')),
          import: () => Promise.reject(new Error('Electron API 不可用')),
        },
      ]),
    ),
  },
};

// 导出文件操作API
export const filesAPI = {
  // 列出目录中的文件
  listWithMetadata: (dirPath: string) => {
    if (window.electron?.files?.listWithMetadata) {
      return window.electron.files.listWithMetadata(dirPath);
    }
    return Promise.resolve([]);
  },

  // 获取完整文件路径
  getFullPath: (directory: string, filename: string) => {
    if (window.electron?.files?.getFullPath) {
      return window.electron.files.getFullPath(directory, filename);
    }
    return Promise.resolve('');
  },

  // 确保目录存在
  ensureDirectory: (dirPath: string) => {
    if (window.electron?.files?.ensureDirectory) {
      return window.electron.files.ensureDirectory(dirPath);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron files API(ensureDirectory) 不可用',
    });
  },

  // 保存JSON数据到文件
  saveJsonToFile: (filePath: string, data: unknown) => {
    if (window.electron?.files?.saveJsonToFile) {
      return window.electron.files.saveJsonToFile(filePath, deepClone(data));
    }
    return Promise.resolve({
      success: false,
      message: 'Electron files API(saveJsonToFile) 不可用',
    });
  },

  // 从文件加载JSON数据
  loadJsonFromFile: (filePath: string) => {
    if (window.electron?.files?.loadJsonFromFile) {
      return window.electron.files.loadJsonFromFile(filePath);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron files API(loadJsonFromFile) 不可用',
    });
  },

  // 删除文件
  deleteFile: (filePath: string) => {
    if (window.electron?.files?.deleteFile) {
      return window.electron.files.deleteFile(filePath);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron files API(deleteFile) 不可用',
    });
  },
};

// 导出串口API封装
export const serialAPI = {
  // 列出所有可用串口
  listPorts: (forceRefresh = false) => {
    if (window.electron?.serial?.listPorts) {
      return window.electron.serial.listPorts(forceRefresh);
    }
    return Promise.resolve([]);
  },

  // 打开串口连接
  open: (portPath: string, options?: SerialPortOptions) => {
    if (window.electron?.serial?.open) {
      return window.electron.serial.open(deepClone(portPath), deepClone(options));
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(open) 不可用' });
  },

  // 关闭串口连接
  close: (portPath: string) => {
    if (window.electron?.serial?.close) {
      return window.electron.serial.close(portPath);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(close) 不可用' });
  },

  // 关闭所有串口连接
  closeAll: () => {
    if (window.electron?.serial?.closeAll) {
      return window.electron.serial.closeAll();
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(closeAll) 不可用' });
  },

  // 写入数据到串口
  write: (portPath: string, data: Buffer | Uint8Array | string, isHex = false) => {
    if (window.electron?.serial?.write) {
      return window.electron.serial.write(portPath, data, isHex);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(write) 不可用' });
  },

  // 发送帧数据
  sendData: (portPath: string, data: Uint8Array) => {
    if (window.electron?.serial?.sendData) {
      return window.electron.serial.sendData(portPath, data);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(sendData) 不可用' });
  },

  // 从串口读取数据
  read: (portPath: string) => {
    if (window.electron?.serial?.read) {
      return window.electron.serial.read(portPath);
    }
    return Promise.resolve({ portPath, data: new Uint8Array(), size: 0 });
  },

  // 监听串口数据
  onData: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.onData) {
      return window.electron.serial.onData(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听串口发送的数据
  onDataSent: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.onDataSent) {
      return window.electron.serial.onDataSent(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 移除串口数据监听
  offData: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.offData) {
      window.electron.serial.offData(callback);
    }
  },

  // 移除串口发送的数据监听
  offDataSent: (callback: (data: { portPath: string; data: Buffer; size: number }) => void) => {
    if (window.electron?.serial?.offDataSent) {
      window.electron.serial.offDataSent(callback);
    }
  },

  // 监听串口状态变化
  onStatusChange: (callback: (data: { portPath: string; status: SerialStatus }) => void) => {
    if (window.electron?.serial?.onStatusChange) {
      return window.electron.serial.onStatusChange(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听所有串口状态变化
  onAllStatusChange: (callback: (statusMap: Record<string, SerialStatus>) => void) => {
    if (window.electron?.serial?.onAllStatusChange) {
      return window.electron.serial.onAllStatusChange(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 获取当前串口状态
  getStatus: (portPath: string) => {
    if (window.electron?.serial?.getStatus) {
      return window.electron.serial.getStatus(portPath);
    }
    return Promise.resolve({ isOpen: false, error: 'Electron serial API(getStatus) 不可用' });
  },

  // 获取所有串口状态
  getAllStatus: () => {
    if (window.electron?.serial?.getAllStatus) {
      return window.electron.serial.getAllStatus();
    }
    return Promise.resolve({});
  },

  // 设置串口参数
  setOptions: (portPath: string, options: SerialPortOptions) => {
    if (window.electron?.serial?.setOptions) {
      return window.electron.serial.setOptions(portPath, deepClone(options));
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(setOptions) 不可用' });
  },

  // 清除串口缓冲区
  clearBuffer: (portPath: string) => {
    if (window.electron?.serial?.clearBuffer) {
      return window.electron.serial.clearBuffer(portPath);
    }
    return Promise.resolve({ success: false, message: 'Electron serial API(clearBuffer) 不可用' });
  },
};

// 导出接收数据处理API
export const receiveAPI = {
  // 统一数据接收处理
  handleReceivedData: (
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
    frames: Frame[],
    mappings: FrameFieldMapping[],
    groups: DataGroup[],
  ): Promise<{
    success: boolean;
    updatedGroups?: DataGroup[];
    recentPacket?: ReceivedDataPacket;
    frameStats?: Partial<ReceiveFrameStats>;
    receiveStats?: Partial<DataReceiveStats>;
    errors?: string[];
  }> => {
    if (window.electron?.receive?.handleReceivedData) {
      return window.electron.receive.handleReceivedData(
        source,
        sourceId,
        data,
        deepClone(frames),
        deepClone(mappings),
        deepClone(groups),
      );
    }
    return Promise.resolve({
      success: false,
      errors: ['Electron receive API(handleReceivedData) 不可用'],
    });
  },

  // 验证映射关系
  validateMappings: (
    mappings: FrameFieldMapping[],
    frames: Frame[],
    groups: DataGroup[],
  ): Promise<ValidationResult> => {
    if (window.electron?.receive?.validateMappings) {
      return window.electron.receive.validateMappings(
        deepClone(mappings),
        deepClone(frames),
        deepClone(groups),
      );
    }
    return Promise.resolve({
      isValid: false,
      errors: ['Electron receive API(validateMappings) 不可用'],
    });
  },
};

// 导出数据存储API
type DataType = keyof typeof DATA_PATH_MAP;

// 创建类型安全的数据存储API
export const dataStorageAPI = {} as {
  [K in DataType]: {
    list: () => Promise<unknown[]>;
    save: (item: unknown) => Promise<{ success: boolean; message?: string }>;
    delete: (id: string) => Promise<{ success: boolean; message?: string }>;
    saveAll: (items: unknown[]) => Promise<{ success: boolean; message?: string }>;
    export: (
      items: unknown[],
      filePath?: string,
    ) => Promise<{ success: boolean; filePath?: string; message?: string }>;
    import: (
      filePath?: string,
    ) => Promise<{ success: boolean; data?: unknown[]; message?: string }>;
  };
};

// 为每个数据类型添加API方法
Object.entries(DATA_PATH_MAP).forEach(([key]) => {
  const typedKey = key as DataType;
  const fileName = getBasename(key);

  dataStorageAPI[typedKey] = {
    // 获取数据列表
    list: () => {
      const api = window.electron?.dataStorage?.[typedKey];
      return api ? api.list() : Promise.resolve([]);
    },

    // 保存单个数据项
    save: (item: unknown) => {
      const api = window.electron?.dataStorage?.[typedKey];
      return api
        ? api.save(deepClone(item))
        : Promise.reject(new Error(`Electron dataStorage API(${fileName}:save) 不可用`));
    },

    // 删除数据项
    delete: (id: string) => {
      const api = window.electron?.dataStorage?.[typedKey];
      return api
        ? api.delete(id)
        : Promise.reject(new Error(`Electron dataStorage API(${fileName}:delete) 不可用`));
    },

    // 保存所有数据
    saveAll: (items: unknown[]) => {
      const api = window.electron?.dataStorage?.[typedKey];
      return api
        ? api.saveAll(deepClone(items))
        : Promise.reject(new Error(`Electron dataStorage API(${fileName}:saveAll) 不可用`));
    },

    // 导出数据到文件
    export: (items: unknown[], filePath?: string) => {
      const api = window.electron?.dataStorage?.[typedKey];
      return api
        ? api.export(deepClone(items), filePath)
        : Promise.reject(new Error(`Electron dataStorage API(${fileName}:export) 不可用`));
    },

    // 从文件导入数据
    import: (filePath?: string) => {
      const api = window.electron?.dataStorage?.[typedKey];
      return api
        ? api.import(filePath)
        : Promise.reject(new Error(`Electron dataStorage API(${fileName}:import) 不可用`));
    },
  };
});

// 导出路径API
export const pathAPI = {
  getDataPath: () => {
    if (window.electron?.path?.getDataPath) {
      return window.electron.path.getDataPath();
    }
    return Promise.resolve('');
  },
  resolve: (...pathSegments: string[]) => {
    if (window.electron?.path?.resolve) {
      return window.electron.path.resolve(...pathSegments);
    }
    return Promise.resolve('');
  },
  isPackaged: () => {
    if (window.electron?.path?.isPackaged) {
      return window.electron.path.isPackaged();
    }
    return Promise.resolve(false);
  },
};

// 导出网络连接API
export const networkAPI = {
  // 连接网络
  connect: (
    config: NetworkConnectionConfig,
    options?: NetworkConnectionOptions,
  ): Promise<NetworkOperationResult> => {
    if (window.electron?.network?.connect) {
      return window.electron.network.connect(deepClone(config), deepClone(options));
    }
    return Promise.resolve({ success: false, error: 'Electron network API(connect) 不可用' });
  },

  // 断开网络连接
  disconnect: (connectionId: string): Promise<NetworkOperationResult> => {
    if (window.electron?.network?.disconnect) {
      return window.electron.network.disconnect(connectionId);
    }
    return Promise.resolve({ success: false, error: 'Electron network API(disconnect) 不可用' });
  },

  // 发送网络数据
  send: (
    connectionId: string,
    data: Uint8Array,
    targetHost?: string,
  ): Promise<NetworkOperationResult> => {
    if (window.electron?.network?.send) {
      return window.electron.network.send(connectionId, data, targetHost);
    }
    return Promise.resolve({ success: false, error: 'Electron network API(send) 不可用' });
  },

  // 获取所有网络连接
  getConnections: (): Promise<NetworkConnection[]> => {
    if (window.electron?.network?.getConnections) {
      return window.electron.network.getConnections();
    }
    return Promise.resolve([]);
  },

  // 获取网络连接状态
  getStatus: (connectionId: string): Promise<NetworkStatus | null> => {
    if (window.electron?.network?.getStatus) {
      return window.electron.network.getStatus(connectionId);
    }
    return Promise.resolve(null);
  },

  // 监听网络数据
  onData: (
    callback: (data: {
      connectionId: string;
      data: number[];
      size: number;
      timestamp: Date;
    }) => void,
  ) => {
    if (window.electron?.network?.onData) {
      return window.electron.network.onData(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听网络连接事件
  onConnectionEvent: (
    callback: (event: {
      connectionId: string;
      eventType: string;
      data?: unknown;
      timestamp: Date;
    }) => void,
  ) => {
    if (window.electron?.network?.onConnectionEvent) {
      return window.electron.network.onConnectionEvent(callback);
    }
    return () => {}; // 返回空的清理函数
  },

  // 监听网络状态变化
  onStatusChange: (callback: (data: { connectionId: string; status: NetworkStatus }) => void) => {
    if (window.electron?.network?.onStatusChange) {
      return window.electron.network.onStatusChange(callback);
    }
    return () => {}; // 返回空的清理函数
  },
};

// 导出高速存储API
export const highSpeedStorageAPI = {
  // 更新存储配置
  updateConfig: (config: StorageConfig): Promise<StorageOperationResult> => {
    if (window.electron?.highSpeedStorage?.updateConfig) {
      return window.electron.highSpeedStorage.updateConfig(deepClone(config));
    }
    return Promise.resolve({
      success: false,
      error: 'Electron highSpeedStorage API(updateConfig) 不可用',
    });
  },

  // 获取存储配置
  getConfig: (): Promise<StorageConfig> => {
    if (window.electron?.highSpeedStorage?.getConfig) {
      return window.electron.highSpeedStorage.getConfig();
    }
    return Promise.resolve({
      enabled: false,
      rules: [],
      filePath: '',
      maxFileSize: 100,
      enableRotation: true,
      rotationCount: 5,
    });
  },

  // 获取存储统计信息
  getStats: (): Promise<StorageStats> => {
    if (window.electron?.highSpeedStorage?.getStats) {
      return window.electron.highSpeedStorage.getStats();
    }
    return Promise.resolve({
      totalFramesStored: 0,
      totalBytesStored: 0,
      currentFileSize: 0,
      storageStartTime: null,
      lastStorageTime: null,
      frameTypeStats: {},
      currentFilePath: '',
      isStorageActive: false,
    });
  },

  // 验证规则
  validateRule: (rule: FrameHeaderRule): Promise<RuleValidationResult> => {
    if (window.electron?.highSpeedStorage?.validateRule) {
      return window.electron.highSpeedStorage.validateRule(deepClone(rule));
    }
    return Promise.resolve({
      isValid: false,
      errors: ['Electron highSpeedStorage API(validateRule) 不可用'],
    });
  },

  // 重置统计信息
  resetStats: (): Promise<StorageOperationResult> => {
    if (window.electron?.highSpeedStorage?.resetStats) {
      return window.electron.highSpeedStorage.resetStats();
    }
    return Promise.resolve({
      success: false,
      error: 'Electron highSpeedStorage API(resetStats) 不可用',
    });
  },
};

// 导出历史数据API
export const historyDataAPI = {
  // 获取可用小时键列表
  getAvailableHours: (): Promise<string[]> => {
    if (window.electron?.historyData?.getAvailableHours) {
      return window.electron.historyData.getAvailableHours();
    }
    return Promise.resolve([]);
  },

  // 加载指定小时的数据
  loadHourData: (hourKey: string): Promise<HourlyDataFile | null> => {
    if (window.electron?.historyData?.loadHourData) {
      return window.electron.historyData.loadHourData(hourKey);
    }
    return Promise.resolve(null);
  },

  // 保存小时数据到文件
  saveHourData: (
    hourKey: string,
    data: HourlyDataFile,
  ): Promise<{ success: boolean; message?: string }> => {
    if (window.electron?.historyData?.saveHourData) {
      return window.electron.historyData.saveHourData(hourKey, deepClone(data));
    }
    return Promise.resolve({
      success: false,
      message: 'Electron historyData API(saveHourData) 不可用',
    });
  },

  // 添加实时数据记录
  appendRecord: (
    hourKey: string,
    timestamp: number,
    data: unknown[],
  ): Promise<{ success: boolean; message?: string }> => {
    if (window.electron?.historyData?.appendRecord) {
      return window.electron.historyData.appendRecord(hourKey, timestamp, deepClone(data));
    }
    return Promise.resolve({
      success: false,
      message: 'Electron historyData API(appendRecord) 不可用',
    });
  },

  // 压缩小时数据文件
  compressHourData: (hourKey: string): Promise<{ success: boolean; message?: string }> => {
    if (window.electron?.historyData?.compressHourData) {
      return window.electron.historyData.compressHourData(hourKey);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron historyData API(compressHourData) 不可用',
    });
  },

  // 获取文件信息
  getFileInfo: (hourKey: string): Promise<HistoryFileInfo | null> => {
    if (window.electron?.historyData?.getFileInfo) {
      return window.electron.historyData.getFileInfo(hourKey);
    }
    return Promise.resolve(null);
  },

  // 获取存储统计信息
  getStorageStats: (): Promise<HistoryStorageStats> => {
    if (window.electron?.historyData?.getStorageStats) {
      return window.electron.historyData.getStorageStats();
    }
    return Promise.resolve({
      totalFiles: 0,
      totalSize: 0,
      totalRecords: 0,
      dateRange: { earliest: '', latest: '' },
      compressionRatio: 0,
    });
  },

  // 导出CSV文件
  exportCSV: (config: CSVExportConfig): Promise<CSVExportResult> => {
    if (window.electron?.historyData?.exportCSV) {
      return window.electron.historyData.exportCSV(deepClone(config));
    }
    return Promise.resolve({
      success: false,
      error: 'Electron historyData API(exportCSV) 不可用',
    });
  },

  // 删除小时数据文件
  deleteHourData: (hourKey: string): Promise<{ success: boolean; message?: string }> => {
    if (window.electron?.historyData?.deleteHourData) {
      return window.electron.historyData.deleteHourData(hourKey);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron historyData API(deleteHourData) 不可用',
    });
  },

  // 清理过期数据
  cleanupOldData: (
    daysToKeep: number,
  ): Promise<{ success: boolean; deletedFiles: number; message?: string }> => {
    if (window.electron?.historyData?.cleanupOldData) {
      return window.electron.historyData.cleanupOldData(daysToKeep);
    }
    return Promise.resolve({
      success: false,
      deletedFiles: 0,
      message: 'Electron historyData API(cleanupOldData) 不可用',
    });
  },

  // 批量加载多个小时的数据
  loadMultipleHours: (
    hourKeys: string[],
  ): Promise<{
    success: boolean;
    data: Record<string, HourlyDataFile>;
    errors?: string[];
  }> => {
    if (window.electron?.historyData?.loadMultipleHours) {
      return window.electron.historyData.loadMultipleHours(hourKeys);
    }
    return Promise.resolve({
      success: false,
      data: {},
      errors: ['Electron historyData API(loadMultipleHours) 不可用'],
    });
  },
};
