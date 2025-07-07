/**
 * 文件操作工具函数
 * 提供文件和目录操作的通用功能
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * 确保指定的目录存在，如不存在则创建
 * @param dirPath 目录路径
 * @returns Promise<void>
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    console.error('创建目录失败:', err);
    throw err;
  }
}

/**
 * 从文件加载JSON数据，并处理文件不存在等异常情况
 * @param filePath 文件路径
 * @returns Promise<T[]> 泛型支持不同数据类型
 */
export async function loadJsonData<T>(filePath: string): Promise<T[]> {
  try {
    // 确保目录存在
    await ensureDirectory(path.dirname(filePath));

    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 文件不存在或解析错误，返回空数组
    console.log(`加载数据失败: ${filePath}，将使用空数组:`, error);
    return [] as T[];
  }
}

/**
 * 将JSON数据保存到文件，并处理异常情况
 * @param filePath 文件路径
 * @param data 要保存的数据
 * @returns Promise<{success: boolean, message?: string}>
 */
export async function saveJsonData<T>(
  filePath: string,
  data: T,
): Promise<{ success: boolean; message?: string }> {
  try {
    // 确保目录存在
    await ensureDirectory(path.dirname(filePath));

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`保存数据失败: ${filePath}:`, error);
    return { success: false, message: `保存数据失败: ${message}` };
  }
}

/**
 * 检查文件是否存在
 * @param filePath 文件路径
 * @returns Promise<boolean>
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
