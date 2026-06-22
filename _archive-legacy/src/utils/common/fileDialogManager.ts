import { bus, EventType } from './EventBus';
import { filesAPI } from '../../api/common';
import type { FileRecord } from '../../types/files';

// 文件对话框结果类型
interface FileDialogResult {
  requestId: string;
  type: 'select' | 'create' | 'close';
  file?: FileRecord;
  name?: string;
}

/**
 * 使用 EventBus 打开文件对话框
 *
 * @param options 文件对话框选项
 * @returns Promise，返回用户操作结果
 */
export function createFileDialog(options: {
  title: string;
  storageDir: string;
  operation: 'import' | 'export';
}) {
  return new Promise<{ canceled: boolean; filePath?: string; fileData?: unknown }>((resolve) => {
    const requestId = `file-dialog-${Date.now()}`;
    console.log(
      `创建${options.operation}文件对话框:`,
      options.title,
      options.storageDir,
      requestId,
    );

    // 监听结果事件（一次性）
    const resultHandler = async (result: FileDialogResult) => {
      if (result.requestId !== requestId) return;

      console.log('收到文件对话框结果:', result);
      bus.off(EventType.FILE_DIALOG_RESULT, resultHandler);

      // 处理关闭事件
      if (result.type === 'close') {
        resolve({ canceled: true });
        return;
      }

      // 处理选择文件事件
      if (result.type === 'select' && result.file?.path) {
        const filePath = result.file.path;
        if (options.operation === 'import') {
          try {
            console.log('正在读取文件内容:', filePath);
            const loadResult = await filesAPI.loadJsonFromFile(filePath);
            console.log('文件读取结果:', loadResult);
            if (loadResult.success && 'data' in loadResult) {
              const response: { canceled: boolean; filePath?: string; fileData?: unknown } = {
                canceled: false,
                filePath,
                fileData: loadResult.data,
              };
              resolve(response);
            } else {
              resolve({ canceled: true });
            }
          } catch (error) {
            console.error('读取文件失败:', error);
            resolve({ canceled: true });
          }
        } else {
          const response: { canceled: boolean; filePath?: string; fileData?: unknown } = {
            canceled: false,
            filePath,
          };
          resolve(response);
        }
        return;
      }

      // 处理创建文件事件
      if (result.type === 'create' && result.name) {
        try {
          const fileName = result.name.endsWith('.json') ? result.name : `${result.name}.json`;
          console.log('获取完整文件路径:', options.storageDir, fileName);
          const filePath = await filesAPI.getFullPath(options.storageDir, fileName);
          console.log('完整文件路径:', filePath);
          const response: { canceled: boolean; filePath?: string; fileData?: unknown } = {
            canceled: false,
            filePath,
          };
          resolve(response);
        } catch (error) {
          console.error('获取文件路径失败:', error);
          const fallbackPath = `${options.storageDir}/${result.name}.json`;
          console.log('使用备用路径:', fallbackPath);
          const response: { canceled: boolean; filePath?: string; fileData?: unknown } = {
            canceled: false,
            filePath: fallbackPath,
          };
          resolve(response);
        }
        return;
      }

      // 其他情况视为取消
      resolve({ canceled: true });
    };

    bus.on(EventType.FILE_DIALOG_RESULT, resultHandler);

    // 发送打开对话框事件
    bus.emit(EventType.FILE_DIALOG_OPEN, {
      requestId,
      title: options.title,
      storageDir: options.storageDir,
      operation: options.operation,
    });
  });
}

/**
 * 文件对话框管理器
 * 提供导入导出文件的便捷方法
 */
export const fileDialogManager = {
  /**
   * 打开文件导入对话框
   * @param title 对话框标题
   * @param directory 存储目录
   * @returns 包含导入结果的Promise
   */
  async importFile(title: string, directory: string) {
    console.log('打开导入对话框:', title, directory);
    return createFileDialog({
      title,
      storageDir: directory,
      operation: 'import',
    });
  },

  /**
   * 打开文件导出对话框
   * @param title 对话框标题
   * @param directory 存储目录
   * @param data 要导出的数据
   * @returns 包含导出结果的Promise
   */
  async exportFile(title: string, directory: string, data: unknown) {
    console.log('打开导出对话框:', title, directory);
    const result = await createFileDialog({
      title,
      storageDir: directory,
      operation: 'export',
    });

    console.log('导出对话框结果:', result);
    if (!result.canceled && result.filePath) {
      try {
        console.log('正在写入文件:', result.filePath);
        // 写入文件内容到主进程
        const saveResult = await filesAPI.saveJsonToFile(result.filePath, data);
        console.log('文件写入结果:', saveResult);
        if (saveResult.success) {
          return { success: true, filePath: result.filePath };
        } else {
          return { success: false, error: saveResult.message };
        }
      } catch (error) {
        console.error('写入文件失败:', error);
        return { success: false, error };
      }
    }

    return { success: false, canceled: true };
  },
};
