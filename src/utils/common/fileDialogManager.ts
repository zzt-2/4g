import { createApp, h } from 'vue';
import FileListDialog from '../../components/common/FileListDialog.vue';
import type { FileRecord } from '../../types/files';
import { filesAPI } from '../../utils/electronApi';

/**
 * 隐藏所有以q-portal--dialog--开头的DOM元素
 * @returns 被隐藏元素的原始显示状态数组，用于后续恢复
 */
function hideQuasarDialogs() {
  console.log('正在隐藏Quasar对话框');
  const dialogs = document.querySelectorAll('[id^="q-portal--dialog--"]');
  const originalStates: Array<{ element: Element; display: string }> = [];

  dialogs.forEach((dialog) => {
    const element = dialog as HTMLElement;
    originalStates.push({
      element: dialog,
      display: element.style.display,
    });
    element.style.display = 'none';
  });

  return originalStates;
}

/**
 * 恢复之前隐藏的Quasar对话框
 * @param originalStates 原始显示状态数组
 */
function restoreQuasarDialogs(originalStates: Array<{ element: Element; display: string }>) {
  console.log('正在恢复Quasar对话框');
  originalStates.forEach((state) => {
    (state.element as HTMLElement).style.display = state.display;
  });
}

/**
 * 使用程序化创建组件的方式创建文件对话框
 *
 * @param options 文件对话框选项
 * @returns Promise，返回用户操作结果
 */
export function createFileDialog(options: {
  title: string;
  storageDir: string;
  operation: 'import' | 'export';
}) {
  return new Promise<{ canceled: boolean; filePath?: string; fileData?: any }>((resolve) => {
    console.log(`创建${options.operation}文件对话框:`, options.title, options.storageDir);

    // 隐藏Quasar对话框
    const originalDialogStates = hideQuasarDialogs();

    // 创建挂载点并设置关键样式
    const mountNode = document.createElement('div');
    mountNode.id = `file-dialog-${Date.now()}`;
    mountNode.style.position = 'fixed';
    mountNode.style.top = '0';
    mountNode.style.left = '0';
    mountNode.style.width = '100vw';
    mountNode.style.height = '100vh';
    mountNode.style.zIndex = '9999';
    mountNode.style.display = 'block';
    document.body.appendChild(mountNode);

    console.log('对话框挂载点已创建:', mountNode.id);

    // 首先加载文件列表
    loadFileList(options.storageDir)
      .then((fileList) => {
        console.log('已加载文件列表:', fileList.length);

        // 创建应用实例
        const app = createApp({
          setup() {
            console.log('对话框组件已设置');

            // 处理清理工作的函数
            const cleanup = () => {
              console.log('清理对话框资源:', mountNode.id);
              app.unmount();
              if (document.body.contains(mountNode)) {
                document.body.removeChild(mountNode);
              }
              // 恢复Quasar对话框
              restoreQuasarDialogs(originalDialogStates);
            };

            const handleSelect = async (file: FileRecord) => {
              console.log('选择文件:', file);
              if (options.operation === 'import' && file.path) {
                try {
                  console.log('正在读取文件内容:', file.path);
                  // 从主进程读取文件内容
                  const loadResult = await filesAPI.loadJsonFromFile(file.path);
                  console.log('文件读取结果:', loadResult);
                  cleanup();
                  if (loadResult.success && 'data' in loadResult) {
                    resolve({ canceled: false, filePath: file.path, fileData: loadResult.data });
                  } else {
                    resolve({ canceled: true });
                  }
                } catch (error) {
                  console.error('读取文件失败:', error);
                  cleanup();
                  resolve({ canceled: true });
                }
              } else if (file.path) {
                console.log('选择文件路径:', file.path);
                cleanup();
                resolve({ canceled: false, filePath: file.path });
              } else {
                console.log('无效文件路径');
                cleanup();
                resolve({ canceled: false });
              }
            };

            const handleCreate = async (name: string) => {
              console.log('创建文件:', name);
              if (!name) {
                cleanup();
                resolve({ canceled: true });
                return;
              }

              try {
                const fileName = name.endsWith('.json') ? name : `${name}.json`;
                console.log('获取完整文件路径:', options.storageDir, fileName);
                const filePath = await filesAPI.getFullPath(options.storageDir, fileName);
                console.log('完整文件路径:', filePath);
                cleanup();
                resolve({ canceled: false, filePath });
              } catch (error) {
                console.error('获取文件路径失败:', error);
                cleanup();
                const fallbackPath = `${options.storageDir}/${name}.json`;
                console.log('使用备用路径:', fallbackPath);
                resolve({
                  canceled: false,
                  filePath: fallbackPath,
                });
              }
            };

            const handleClose = () => {
              console.log('关闭对话框');
              cleanup();
              resolve({ canceled: true });
            };

            return () =>
              h(FileListDialog, {
                title: options.title,
                isOpen: true,
                storageDir: options.storageDir,
                operation: options.operation,
                onSelect: handleSelect,
                onCreate: handleCreate,
                onClose: handleClose,
              });
          },
        });

        // 挂载应用
        app.mount(mountNode);
        console.log('对话框已挂载');
      })
      .catch((error) => {
        console.error('加载文件列表失败:', error);
        // 移除挂载点
        if (document.body.contains(mountNode)) {
          document.body.removeChild(mountNode);
        }
        // 恢复Quasar对话框
        restoreQuasarDialogs(originalDialogStates);
        resolve({ canceled: true });
      });
  });
}

/**
 * 加载指定目录下的文件列表
 */
async function loadFileList(dirPath: string) {
  console.log('正在加载文件列表:', dirPath);
  try {
    // 确保目录存在
    await filesAPI.ensureDirectory(dirPath);

    // 加载文件列表
    const files = await filesAPI.listWithMetadata(dirPath);
    console.log('成功加载文件列表:', files);
    return files;
  } catch (error) {
    console.error('加载文件列表失败:', error);
    return [];
  }
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
  async exportFile(title: string, directory: string, data: any) {
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
