/**
 * 文件操作API封装
 * 提供文件和目录操作的统一接口
 */

import { deepClone } from '../../utils/frames/frameUtils';

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

  // 读取文本文件
  readTextFile: (filePath: string) => {
    if (window.electron?.files?.readTextFile) {
      return window.electron.files.readTextFile(filePath);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron files API(readTextFile) 不可用',
      content: '',
    });
  },
};
