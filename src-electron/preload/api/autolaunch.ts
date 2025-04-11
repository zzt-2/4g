import { app } from "electron";

export const getAutoLaunchEnabled = (): boolean => {
  return app.getLoginItemSettings().openAtLogin;
};

export const setAutoLaunchEnabled = (enabled: boolean): void => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // 可选：在开发环境中使用当前执行文件路径
    path: app.getPath("exe"),
    // 在开发环境中，我们需要指定应用程序目录作为参数
    args: process.env.NODE_ENV === "development" ? [app.getAppPath()] : [],
  });
};

// 导出到 preload
export const autoLaunchApi = {
  getEnabled: getAutoLaunchEnabled,
  setEnabled: setAutoLaunchEnabled,
};
