/**
 * 窗口控制相关的组合式API
 */
// import { reactive } from 'vue';

// 定义窗口控制接口
export interface WindowControls {
  minimize: () => void;
  toggleMaximize: () => Promise<void>;
  close: () => void;
}

// 使用项目中已定义的ElectronAPI类型
// 不再重复定义Window.electron，因为项目中已经有了全局定义

export const useWindowControls = () => {
  // 检查electron API是否可用
  const win = window?.electron?.window;
  if (!win) {
    console.error('Electron window API not available');
  }

  // 使用reactive创建响应式控制对象
  const controls: WindowControls = {
    minimize: () => {
      try {
        win?.minimize();
      } catch (error) {
        console.error('Error minimizing window:', error);
      }
    },

    toggleMaximize: async () => {
      try {
        const isMaximized = await win?.isMaximized();
        if (isMaximized) {
          win?.unmaximize();
        } else {
          win?.maximize();
        }
      } catch (error) {
        console.error('Error toggling maximize:', error);
      }
    },

    close: () => {
      try {
        win?.close();
      } catch (error) {
        console.error('Error closing window:', error);
      }
    },
  };

  return controls;
};
