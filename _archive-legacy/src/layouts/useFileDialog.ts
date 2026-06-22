import { reactive, onMounted } from 'vue';
import { bus, EventType } from 'src/utils/common/EventBus';
import type { FileRecord } from 'src/types/files';

// 文件对话框打开请求类型
interface FileDialogOpenPayload {
  requestId: string;
  title: string;
  storageDir: string;
  operation: 'import' | 'export';
}

// 文件对话框状态类型
interface FileDialogState {
  isOpen: boolean;
  title: string;
  storageDir: string;
  operation: 'import' | 'export';
  requestId: string;
}

/**
 * 文件对话框 Composable
 * 处理全局文件对话框的状态和事件
 */
export function useFileDialog() {
  // 文件对话框状态
  const fileDialogState = reactive<FileDialogState>({
    isOpen: false,
    title: '',
    storageDir: '',
    operation: 'import',
    requestId: '',
  });

  // 文件选择处理
  const handleFileSelect = (file: FileRecord) => {
    bus.emit(EventType.FILE_DIALOG_RESULT, {
      requestId: fileDialogState.requestId,
      type: 'select',
      file,
    });
    fileDialogState.isOpen = false;
  };

  // 文件创建处理
  const handleFileCreate = (name: string) => {
    bus.emit(EventType.FILE_DIALOG_RESULT, {
      requestId: fileDialogState.requestId,
      type: 'create',
      name,
    });
    fileDialogState.isOpen = false;
  };

  // 对话框关闭处理
  const handleFileDialogClose = () => {
    bus.emit(EventType.FILE_DIALOG_RESULT, {
      requestId: fileDialogState.requestId,
      type: 'close',
    });
    fileDialogState.isOpen = false;
  };

  // 监听文件对话框打开事件
  onMounted(() => {
    bus.on(EventType.FILE_DIALOG_OPEN, (payload: FileDialogOpenPayload) => {
      console.log('打开文件对话框:', payload);
      fileDialogState.isOpen = true;
      fileDialogState.title = payload.title;
      fileDialogState.storageDir = payload.storageDir;
      fileDialogState.operation = payload.operation;
      fileDialogState.requestId = payload.requestId;
    });
  });

  return {
    fileDialogState,
    handleFileSelect,
    handleFileCreate,
    handleFileDialogClose,
  };
}
