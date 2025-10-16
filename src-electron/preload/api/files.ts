import { ipcRenderer } from 'electron';

export const filesAPI = {
  // 获取目录下的文件元数据
  async listWithMetadata(dirPath: string): Promise<any[]> {
    return ipcRenderer.invoke('files:listWithMetadata', dirPath);
  },

  // 获取完整文件路径
  async getFullPath(directory: string, filename: string): Promise<string> {
    return ipcRenderer.invoke('files:getFullPath', directory, filename);
  },

  // 确保目录存在
  async ensureDirectory(dirPath: string): Promise<{ success: boolean; message?: string }> {
    return ipcRenderer.invoke('files:ensureDirectory', dirPath);
  },

  // 保存JSON数据到文件
  async saveJsonToFile(
    filePath: string,
    data: any,
  ): Promise<{ success: boolean; filePath?: string; message?: string }> {
    return ipcRenderer.invoke('files:saveJsonToFile', filePath, data);
  },

  // 从文件加载JSON数据
  async loadJsonFromFile(
    filePath: string,
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    return ipcRenderer.invoke('files:loadJsonFromFile', filePath);
  },

  // 删除文件
  async deleteFile(filePath: string): Promise<{ success: boolean; message?: string }> {
    return ipcRenderer.invoke('files:deleteFile', filePath);
  },

  // 读取文本文件
  async readTextFile(
    filePath: string,
  ): Promise<{ success: boolean; content?: string; message?: string }> {
    return ipcRenderer.invoke('files:readTextFile', filePath);
  },
};
