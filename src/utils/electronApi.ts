/**
 * Electron API 桥接
 * 在渲染进程中访问主进程API的安全方式
 */

import { deepClone } from './frames/frameUtils';

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
    list: () => Promise.resolve([]),
    connect: () => Promise.resolve(false),
    disconnect: () => Promise.resolve(false),
    send: () => Promise.resolve(false),
  },
  frames: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    save: (_frame: unknown) => Promise.reject(new Error('Electron API 不可用')),
    list: () => Promise.resolve([]),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    delete: (_id: string) => Promise.reject(new Error('Electron API 不可用')),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onUpdate: (_callback: unknown) => () => {}, // 返回一个取消监听的函数
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
};

// 暴露帧相关IPC方法供存储使用
export const framesAPI = {
  save: (frame: unknown) => {
    if (window.electron?.frames?.save) {
      return window.electron.frames.save(deepClone(frame));
    }
    return Promise.reject(new Error('Electron frames API 不可用'));
  },

  list: () => {
    if (window.electron?.frames?.list) {
      return window.electron.frames.list();
    }
    return Promise.resolve([]);
  },

  delete: (id: string) => {
    if (window.electron?.frames?.delete) {
      return window.electron.frames.delete(id);
    }
    return Promise.reject(new Error('Electron frames API 不可用'));
  },

  // 新增方法 - 批量保存所有帧
  saveAll: (frames: unknown[]) => {
    if (window.electron?.frames?.saveAll) {
      return window.electron.frames.saveAll(deepClone(frames));
    }
    return Promise.reject(new Error('Electron frames API(saveAll) 不可用'));
  },

  // 新增方法 - 导出帧到文件
  export: (frames: unknown[], filePath: string) => {
    if (window.electron?.frames?.export) {
      return window.electron.frames.export(frames, filePath);
    }
    return Promise.reject(new Error('Electron frames API(export) 不可用'));
  },

  // 新增方法 - 从文件导入帧
  import: (filePath: string) => {
    if (window.electron?.frames?.import) {
      return window.electron.frames.import(filePath);
    }
    return Promise.reject(new Error('Electron frames API(import) 不可用'));
  },
};
