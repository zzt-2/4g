/**
 * CSV 操作 API
 */

import { ipcRenderer } from 'electron';

// CSV API 接口定义
export const csvAPI = {
  /**
   * 保存CSV数据到文件
   * @param hourKey 小时键
   * @param csvContent CSV内容
   * @param append 是否追加模式
   */
  save: (hourKey: string, csvContent: string, append = true) =>
    ipcRenderer.invoke('csv:save', hourKey, csvContent, append),

  /**
   * 读取CSV文件内容
   * @param hourKey 小时键
   */
  read: (hourKey: string) => ipcRenderer.invoke('csv:read', hourKey),

  /**
   * 获取CSV文件信息
   * @param hourKey 小时键
   */
  getInfo: (hourKey: string) => ipcRenderer.invoke('csv:info', hourKey),

  /**
   * 列出所有CSV文件
   */
  list: () => ipcRenderer.invoke('csv:list'),

  /**
   * 删除CSV文件
   * @param hourKey 小时键
   */
  delete: (hourKey: string) => ipcRenderer.invoke('csv:delete', hourKey),
};
