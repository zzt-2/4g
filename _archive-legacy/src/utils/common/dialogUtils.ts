/**
 * 对话框操作工具函数
 * 提供文件选择、保存对话框的通用功能
 */

import { dialog, BrowserWindow } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { fileExists, ensureDirectory } from './fileUtils';
import path from 'path';
import { formatErrorResponse, logError } from './errorUtils';
import { inject } from 'vue';
import type { useFileDialog } from '../../composables/common/useFileDialog';

/**
 * 打开保存对话框并处理用户选择的文件路径
 * @param title 对话框标题
 * @param defaultPath 默认文件路径
 * @param filters 文件过滤器，例如 [{ name: 'JSON文件', extensions: ['json'] }]
 * @returns Promise<{canceled: boolean, filePath?: string}>
 */
export async function showExportDialog(
  title: string,
  defaultPath: string,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<{ canceled: boolean; filePath?: string }> {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      throw new Error('找不到主窗口');
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath,
      filters,
    });

    return result;
  } catch (error) {
    logError('显示导出对话框失败', error);
    return { canceled: true };
  }
}

/**
 * 打开文件选择对话框并处理用户选择的文件
 * @param title 对话框标题
 * @param filters 文件过滤器，例如 [{ name: 'JSON文件', extensions: ['json'] }]
 * @param multiSelections 是否允许多选
 * @returns Promise<{canceled: boolean, filePaths: string[]}>
 */
export async function showImportDialog(
  title: string,
  filters: Array<{ name: string; extensions: string[] }>,
  multiSelections: boolean = false,
): Promise<{ canceled: boolean; filePaths: string[] }> {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      throw new Error('找不到主窗口');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
      filters,
    });

    return result;
  } catch (error) {
    logError('显示导入对话框失败', error);
    return { canceled: true, filePaths: [] };
  }
}

/**
 * 将数据导出到指定文件
 * @param data 要导出的数据
 * @param filePath 文件路径，如未提供则调用showExportDialog
 * @param title 对话框标题（当需要显示对话框时）
 * @param defaultName 默认文件名（当需要显示对话框时）
 * @returns Promise<{success: boolean, message?: string, filePath?: string}>
 */
export async function exportToFile<T>(
  data: T,
  filePath: string | undefined,
  title: string = '导出数据',
  defaultName: string = 'export.json',
): Promise<{ success: boolean; message?: string; filePath?: string }> {
  try {
    let targetFilePath: string;

    // 如果未提供文件路径，打开保存对话框
    if (!filePath) {
      const defaultPath = path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        'Documents',
        defaultName,
      );

      const result = await showExportDialog(title, defaultPath, [
        { name: 'JSON文件', extensions: ['json'] },
      ]);

      if (result.canceled || !result.filePath) {
        return { success: false, message: '导出已取消' };
      }

      targetFilePath = result.filePath;
    } else {
      targetFilePath = filePath;
    }

    // 确保目录存在
    await ensureDirectory(path.dirname(targetFilePath));

    // 导出数据
    await writeFile(targetFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, filePath: targetFilePath };
  } catch (error) {
    logError('导出数据失败', error);
    return formatErrorResponse(error, '导出数据失败') as { success: false; message: string };
  }
}

/**
 * 从指定文件导入数据并验证格式
 * @param filePath 文件路径，如未提供则调用showImportDialog
 * @param validator 可选的验证函数，验证导入的数据格式
 * @param title 对话框标题（当需要显示对话框时）
 * @returns Promise<{success: boolean, data?: T, message?: string}>
 */
export async function importFromFile<T>(
  filePath: string | undefined,
  validator?: (data: unknown) => { valid: boolean; reason?: string },
  title: string = '导入数据',
): Promise<{ success: boolean; data?: T; message?: string }> {
  try {
    let selectedFilePath: string;

    // 如果未提供文件路径，打开对话框选择文件
    if (!filePath) {
      const result = await showImportDialog(title, [{ name: 'JSON文件', extensions: ['json'] }]);

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '导入已取消' };
      }

      selectedFilePath = result.filePaths[0] || '';
    } else {
      selectedFilePath = filePath;
    }

    // 检查文件是否存在
    if (!(await fileExists(selectedFilePath))) {
      return { success: false, message: `文件不存在: ${selectedFilePath}` };
    }

    // 读取文件内容
    const data = await readFile(selectedFilePath, 'utf-8');
    const parsedData = JSON.parse(data);

    // 验证数据格式
    if (validator) {
      const validationResult = validator(parsedData);
      if (!validationResult.valid) {
        return {
          success: false,
          message: validationResult.reason || '导入的数据格式不正确',
        };
      }
    }

    return { success: true, data: parsedData as T };
  } catch (error) {
    logError('导入数据失败', error);
    return formatErrorResponse(error, '导入数据失败') as { success: false; message: string };
  }
}

/**
 * 显示确认对话框
 * @param title 对话框标题
 * @param message 对话框消息
 * @param type 对话框类型: 'info', 'error', 'question', 'warning'
 * @returns Promise<boolean> 用户是否确认
 */
export async function showConfirmDialog(
  title: string,
  message: string,
  type: 'info' | 'error' | 'question' | 'warning' = 'question',
): Promise<boolean> {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      throw new Error('找不到主窗口');
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type,
      title,
      message,
      buttons: ['确认', '取消'],
      defaultId: 0,
      cancelId: 1,
    });

    return response === 0;
  } catch (error) {
    logError('显示确认对话框失败', error);
    return false;
  }
}

/**
 * 显示消息对话框
 * @param title 对话框标题
 * @param message 对话框消息
 * @param type 对话框类型: 'info', 'error', 'warning'
 */
export async function showMessageDialog(
  title: string,
  message: string,
  type: 'info' | 'error' | 'warning' = 'info',
): Promise<void> {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) {
      throw new Error('找不到主窗口');
    }

    await dialog.showMessageBox(mainWindow, {
      type,
      title,
      message,
      buttons: ['确定'],
    });
  } catch (error) {
    logError('显示消息对话框失败', error);
  }
}

export async function showCustomExportDialog(
  title: string,
  directory: string,
  defaultName: string,
): Promise<{ canceled: boolean; filePath?: string }> {
  const fileDialog = inject('fileDialog') as ReturnType<typeof useFileDialog> | undefined;
  if (!fileDialog) {
    console.error('fileDialog未提供，回退到原生对话框');
    return showExportDialog(title, defaultName, [{ name: 'JSON文件', extensions: ['json'] }]);
  }

  return fileDialog.openExportDialog(title, directory, defaultName);
}

export async function showCustomImportDialog(
  title: string,
  directory: string,
): Promise<{ canceled: boolean; filePaths: string[] }> {
  const fileDialog = inject('fileDialog') as ReturnType<typeof useFileDialog> | undefined;
  if (!fileDialog) {
    console.error('fileDialog未提供，回退到原生对话框');
    return showImportDialog(title, [{ name: 'JSON文件', extensions: ['json'] }]);
  }

  const result = await fileDialog.openImportDialog(title, directory);
  return {
    canceled: result.canceled,
    filePaths: result.filePath ? [result.filePath] : [],
  };
}
