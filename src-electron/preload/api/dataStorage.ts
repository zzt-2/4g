/**
 * 数据存储API
 * 提供统一的数据存储访问接口
 */
import { ipcRenderer } from 'electron';
import { DATA_PATH_MAP } from '../../../src/config/configDefaults';
import path from 'path';

// 创建动态的数据存储API
type DataType = keyof typeof DATA_PATH_MAP;

// 创建数据存储API
export const dataStorageAPI = Object.fromEntries(
  Object.entries(DATA_PATH_MAP).map(([key]) => {
    // 使用文件名作为IPC通道前缀
    const name = path.basename(key);

    return [
      key,
      {
        // 获取数据列表
        list: () => ipcRenderer.invoke(`${name}:list`),

        // 保存单个数据项
        save: (item: any) => ipcRenderer.invoke(`${name}:save`, item),

        // 删除数据项
        delete: (id: string) => ipcRenderer.invoke(`${name}:delete`, id),

        // 保存所有数据
        saveAll: (items: any[]) => ipcRenderer.invoke(`${name}:saveAll`, items),

        // 导出数据到文件
        export: (items: any[], filePath?: string) =>
          ipcRenderer.invoke(`${name}:export`, items, filePath),

        // 从文件导入数据
        import: (filePath?: string) => ipcRenderer.invoke(`${name}:import`, filePath),
      },
    ];
  }),
) as {
  [K in DataType]: {
    list: () => Promise<any[]>;
    save: (item: any) => Promise<{ success: boolean; message?: string }>;
    delete: (id: string) => Promise<{ success: boolean; message?: string }>;
    saveAll: (items: any[]) => Promise<{ success: boolean; message?: string }>;
    export: (
      items: any[],
      filePath?: string,
    ) => Promise<{ success: boolean; filePath?: string; message?: string }>;
    import: (filePath?: string) => Promise<{ success: boolean; data?: any[]; message?: string }>;
  };
};
