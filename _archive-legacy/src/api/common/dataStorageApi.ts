/**
 * 数据存储API封装
 * 提供统一的数据存储访问接口
 */

import { deepClone } from '../../utils/frames/frameUtils';
import { DATA_PATH_MAP } from '../../config/configDefaults';

// 简单实现获取路径的最后一部分（basename）
function getBasename(fullPath: string): string {
  // 处理不同操作系统的路径分隔符
  const normalized = fullPath.replace(/\\/g, '/');
  // 取最后一段作为basename
  const parts = normalized.split('/');
  return parts[parts.length - 1] || fullPath;
}

// 导出数据存储API
type DataType = keyof typeof DATA_PATH_MAP;

// 创建类型安全的数据存储API
export const dataStorageAPI = {} as {
  [K in DataType]: {
    list: () => Promise<unknown[] | unknown>;
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
