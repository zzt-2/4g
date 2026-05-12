import type { FileBridge, SaveDialogOptions, OpenDialogOptions } from '@/shared/platform-bridge';

export type { FileBridge, SaveDialogOptions, OpenDialogOptions };

export interface FileFacade {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  showSaveDialog(opts: SaveDialogOptions): Promise<string | null>;
  showOpenDialog(opts: OpenDialogOptions): Promise<string | null>;
}

export function createFileFacade(bridge: FileBridge): FileFacade {
  return {
    readTextFile: (path) => bridge.readTextFile(path),
    writeTextFile: (path, content) => bridge.writeTextFile(path, content),
    showSaveDialog: (opts) => bridge.showSaveDialog(opts),
    showOpenDialog: (opts) => bridge.showOpenDialog(opts),
  };
}
