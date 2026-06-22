import { ref } from 'vue';
import { FileRecord } from '../../types/files';
import path from 'path';

export function useFileDialog() {
  const isDialogOpen = ref(false);
  const dialogTitle = ref('');
  const dialogOperation = ref<'import' | 'export'>('import');
  const storageDir = ref('');

  const openImportDialog = (title: string, directory: string) => {
    dialogTitle.value = title;
    dialogOperation.value = 'import';
    storageDir.value = directory;
    isDialogOpen.value = true;

    return new Promise<{ canceled: boolean; filePath?: string }>((resolve) => {
      const handleSelect = (file: FileRecord) => {
        isDialogOpen.value = false;
        if (file.path) {
          resolve({ canceled: false, filePath: file.path });
        } else {
          resolve({ canceled: false });
        }
      };

      const handleClose = () => {
        isDialogOpen.value = false;
        resolve({ canceled: true });
      };

      // 暂时注册这些事件处理器，当对话框关闭时会被移除
      onSelectCallback.value = handleSelect;
      onCloseCallback.value = handleClose;
    });
  };

  const openExportDialog = (title: string, directory: string, defaultName: string) => {
    dialogTitle.value = title;
    dialogOperation.value = 'export';
    storageDir.value = directory;
    isDialogOpen.value = true;

    return new Promise<{ canceled: boolean; filePath?: string }>((resolve) => {
      const handleCreate = async (name: string) => {
        isDialogOpen.value = false;
        if (name) {
          try {
            const filePath = await window.electron.files.getFullPath(directory, `${name}.json`);
            resolve({ canceled: false, filePath });
          } catch (error) {
            console.error('获取文件路径失败:', error);
            resolve({ canceled: false, filePath: path.join(directory, `${name}.json`) });
          }
        } else {
          resolve({ canceled: false });
        }
      };

      const handleClose = () => {
        isDialogOpen.value = false;
        resolve({ canceled: true });
      };

      onCreateCallback.value = handleCreate;
      onCloseCallback.value = handleClose;
    });
  };

  // 用于组件事件处理的回调引用
  const onSelectCallback = ref<(file: FileRecord) => void>(() => {});
  const onCreateCallback = ref<(name: string) => void>(() => {});
  const onCloseCallback = ref<() => void>(() => {});

  return {
    isDialogOpen,
    dialogTitle,
    dialogOperation,
    storageDir,
    openImportDialog,
    openExportDialog,
    onSelectCallback,
    onCreateCallback,
    onCloseCallback,
  };
}
