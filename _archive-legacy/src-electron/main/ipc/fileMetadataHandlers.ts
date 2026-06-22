import { stat, readdir, writeFile, readFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';

const fileRegistry = createHandlerRegistry('files');

fileRegistry.register('listWithMetadata', async (_, dirPath: string) => {
  try {
    const files = await readdir(dirPath);
    const fileStats = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
          const filePath = path.join(dirPath, file);
          const stats = await stat(filePath);
          return {
            id: path.basename(file, '.json'),
            name: path.basename(file, '.json'),
            createTime: stats.birthtime.toISOString(),
            lastModified: stats.mtime.toISOString(),
            isPublic: false, // 默认值，可根据需要修改
            isOwner: true, // 默认值，可根据需要修改
            path: filePath,
          };
        }),
    );
    return fileStats;
  } catch (error) {
    console.error('获取文件元数据失败:', error);
    return [];
  }
});

// 新增：获取完整文件路径
fileRegistry.register('getFullPath', (_, directory: string, filename: string) => {
  return path.join(directory, filename);
});

// 新增：确保目录存在
fileRegistry.register('ensureDirectory', async (_, dirPath: string) => {
  try {
    await mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    console.error('创建目录失败:', error);
    return { success: false, message: String(error) };
  }
});

// 新增：保存JSON数据到文件
fileRegistry.register('saveJsonToFile', async (_, filePath: string, data: unknown) => {
  try {
    // 确保目录存在
    const dirPath = path.dirname(filePath);
    await mkdir(dirPath, { recursive: true });

    // 写入文件
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    console.error('保存JSON数据失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

// 新增：从文件加载JSON数据
fileRegistry.register('loadJsonFromFile', async (_, filePath: string) => {
  try {
    const data = await readFile(filePath, 'utf-8');
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    console.error('加载JSON数据失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

// 新增：删除文件
fileRegistry.register('deleteFile', async (_, filePath: string) => {
  try {
    // 检查文件是否存在
    if (!existsSync(filePath)) {
      return { success: false, message: '文件不存在' };
    }

    // 删除文件
    await unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error('删除文件失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

// 读取文本文件
fileRegistry.register('readTextFile', async (_, filePath: string) => {
  try {
    if (!existsSync(filePath)) {
      return { success: false, message: '文件不存在' };
    }

    const content = await readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('读取文本文件失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

export function registerFileMetadataHandlers() {
  return fileRegistry.registerAll();
}
