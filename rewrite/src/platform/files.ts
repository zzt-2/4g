import type { FileBridge, SaveDialogOptions, OpenDialogOptions } from '@/shared/platform-bridge';

export type { FileBridge, SaveDialogOptions, OpenDialogOptions };

export interface FileFacade {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  showSaveDialog(opts: SaveDialogOptions): Promise<string | null>;
  showOpenDialog(opts: OpenDialogOptions): Promise<string | null>;
  getUserDataPath(): Promise<string>;
  /** 默认帧定义 JSON(main 进程打包资源,S012 根因 B seed 用)。 */
  getDefaultFrames(): Promise<string>;
}

export function createFileFacade(bridge: FileBridge): FileFacade {
  return {
    readTextFile: (path) => bridge.readTextFile(path),
    writeTextFile: (path, content) => bridge.writeTextFile(path, content),
    showSaveDialog: (opts) => bridge.showSaveDialog(opts),
    showOpenDialog: (opts) => bridge.showOpenDialog(opts),
    getUserDataPath: () => bridge.getUserDataPath(),
    getDefaultFrames: () => bridge.getDefaultFrames(),
  };
}
