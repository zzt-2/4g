import { ipcRenderer } from 'electron';

/**
 * 帧配置API
 * 提供渲染进程与主进程通信的桥接
 */
export const framesAPI = {
  /**
   * 保存帧配置
   * @param frame 帧配置对象
   */
  save: (frame: unknown) => ipcRenderer.invoke('frames:save', frame),

  /**
   * 获取所有帧配置
   */
  list: () => ipcRenderer.invoke('frames:list'),

  /**
   * 删除帧配置
   * @param id 帧ID
   */
  delete: (id: string) => ipcRenderer.invoke('frames:delete', id),

  /**
   * 批量保存所有帧
   * @param frames 所有帧配置
   */
  saveAll: (frames: unknown[]) => ipcRenderer.invoke('frames:saveAll', frames),

  /**
   * 导出帧到文件
   * @param frames 要导出的帧配置
   * @param filePath 文件路径
   */
  export: (frames: unknown[], filePath: string) =>
    ipcRenderer.invoke('frames:export', frames, filePath),

  /**
   * 从文件导入帧
   * @param filePath 文件路径
   */
  import: (filePath: string) => ipcRenderer.invoke('frames:import', filePath),

  /**
   * 监听帧配置更改
   * @param callback 回调函数
   */
  onUpdate: (callback: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.on('frames:updated', callback);
    return () => {
      ipcRenderer.off('frames:updated', callback);
    };
  },
};
