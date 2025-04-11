import { ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

// 帧数据存储路径
const FRAMES_FILE_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '',
  'rs485',
  'frames.json',
);

// 内存中的帧数据
let framesData: any[] = [];

// 确保目录存在
async function ensureDirectory() {
  const dirPath = path.dirname(FRAMES_FILE_PATH);
  try {
    await import('fs').then((fs) => fs.promises.mkdir(dirPath, { recursive: true }));
  } catch (err) {
    console.error('创建目录失败:', err);
  }
}

// 加载帧数据
async function loadFrames() {
  try {
    await ensureDirectory();
    const data = await readFile(FRAMES_FILE_PATH, 'utf-8');
    framesData = JSON.parse(data);
    return framesData;
  } catch (err) {
    // 文件不存在或解析错误，返回空数组
    console.log('加载帧数据失败，将使用空数组:', err);
    framesData = [];
    return framesData;
  }
}

// 保存帧数据
async function saveFrames() {
  try {
    await ensureDirectory();
    await writeFile(FRAMES_FILE_PATH, JSON.stringify(framesData, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('保存帧数据失败:', err);
    return { success: false, message: `保存帧数据失败: ${err}` };
  }
}

// 注册IPC处理程序
export function registerFramesHandlers() {
  // 获取所有帧
  ipcMain.handle('frames:list', async () => {
    try {
      return await loadFrames();
    } catch (err) {
      console.error('获取帧列表失败:', err);
      return [];
    }
  });

  // 保存单个帧
  ipcMain.handle('frames:save', async (_, frame) => {
    try {
      // 确保数据已加载
      if (framesData.length === 0) {
        await loadFrames();
      }

      const index = framesData.findIndex((f: any) => f.id === frame.id);
      if (index >= 0) {
        // 更新现有帧
        framesData[index] = frame;
      } else {
        // 添加新帧
        framesData.push(frame);
      }

      return await saveFrames();
    } catch (err) {
      console.error('保存帧失败:', err);
      return { success: false, message: `保存帧失败: ${err}` };
    }
  });

  // 删除帧
  ipcMain.handle('frames:delete', async (_, id) => {
    try {
      // 确保数据已加载
      if (framesData.length === 0) {
        await loadFrames();
      }

      const index = framesData.findIndex((f: any) => f.id === id);
      if (index >= 0) {
        framesData.splice(index, 1);
        return await saveFrames();
      }

      return { success: false, message: '找不到要删除的帧' };
    } catch (err) {
      console.error('删除帧失败:', err);
      return { success: false, message: `删除帧失败: ${err}` };
    }
  });

  // 批量保存所有帧
  ipcMain.handle('frames:saveAll', async (_, frames) => {
    try {
      framesData = frames;
      return await saveFrames();
    } catch (err) {
      console.error('批量保存帧失败:', err);
      return { success: false, message: `批量保存帧失败: ${err}` };
    }
  });

  // 导出帧到文件
  ipcMain.handle('frames:export', async (event, frames, filePath) => {
    try {
      if (!filePath) {
        // 如果没有提供文件路径，打开保存对话框
        const { canceled, filePath: selectedPath } = await dialog.showSaveDialog({
          title: '导出帧配置',
          defaultPath: path.join(
            process.env.USERPROFILE || process.env.HOME || '',
            'Documents',
            'frames-export.json',
          ),
          filters: [{ name: 'JSON文件', extensions: ['json'] }],
        });

        if (canceled || !selectedPath) {
          return { success: false, message: '导出已取消' };
        }

        filePath = selectedPath;
      }

      await writeFile(filePath, JSON.stringify(frames, null, 2), 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      console.error('导出帧失败:', err);
      return { success: false, message: `导出帧失败: ${err}` };
    }
  });

  // 从文件导入帧
  ipcMain.handle('frames:import', async (event, filePath) => {
    try {
      if (!filePath) {
        // 如果没有提供文件路径，打开打开对话框
        const { canceled, filePaths } = await dialog.showOpenDialog({
          title: '导入帧配置',
          properties: ['openFile'],
          filters: [{ name: 'JSON文件', extensions: ['json'] }],
        });

        if (canceled || filePaths.length === 0) {
          return { success: false, message: '导入已取消' };
        }

        filePath = filePaths[0];
      }

      const data = await readFile(filePath, 'utf-8');
      const importedFrames = JSON.parse(data);

      // 验证导入的数据格式
      if (!Array.isArray(importedFrames)) {
        return { success: false, message: '导入的数据格式不正确' };
      }

      return { success: true, data: importedFrames };
    } catch (err) {
      console.error('导入帧失败:', err);
      return { success: false, message: `导入帧失败: ${err}` };
    }
  });
}
