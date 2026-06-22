/**
 * 系统API封装
 * 包含窗口控制、菜单、自动启动等系统级功能
 */

// 从window对象获取预加载脚本中注入的electron API基础对象
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
  autoLaunch: {
    getEnabled: () => false,
    setEnabled: () => console.warn('Electron API不可用: autoLaunch.setEnabled'),
  },
};

// 导出窗口控制API
export const windowAPI = {
  minimize: () => {
    if (window.electron?.window?.minimize) {
      return window.electron.window.minimize();
    }
    console.warn('Electron window API(minimize) 不可用');
  },

  maximize: () => {
    if (window.electron?.window?.maximize) {
      return window.electron.window.maximize();
    }
    console.warn('Electron window API(maximize) 不可用');
  },

  close: () => {
    if (window.electron?.window?.close) {
      return window.electron.window.close();
    }
    console.warn('Electron window API(close) 不可用');
  },

  isMaximized: () => {
    if (window.electron?.window?.isMaximized) {
      return window.electron.window.isMaximized();
    }
    return Promise.resolve(false);
  },
};

// 导出菜单API
export const menuAPI = {
  setMenuBarVisibility: (visible: boolean) => {
    if (window.electron?.menu?.setMenuBarVisibility) {
      return window.electron.menu.setMenuBarVisibility(visible);
    }
    console.warn('Electron menu API(setMenuBarVisibility) 不可用');
  },

  isMenuBarVisible: () => {
    if (window.electron?.menu?.isMenuBarVisible) {
      return window.electron.menu.isMenuBarVisible();
    }
    return Promise.resolve(false);
  },
};

// 导出自动启动API
export const autoLaunchAPI = {
  getEnabled: () => {
    if (window.electron?.autoLaunch?.getEnabled) {
      return window.electron.autoLaunch.getEnabled();
    }
    return false;
  },

  setEnabled: (enabled: boolean) => {
    if (window.electron?.autoLaunch?.setEnabled) {
      return window.electron.autoLaunch.setEnabled(enabled);
    }
    console.warn('Electron autoLaunch API(setEnabled) 不可用');
  },
};
