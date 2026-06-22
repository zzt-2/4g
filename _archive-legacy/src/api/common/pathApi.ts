/**
 * 路径处理API封装
 * 提供路径操作的统一接口
 */

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
