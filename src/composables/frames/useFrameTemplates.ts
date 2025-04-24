/**
 * 帧模板管理Composable
 *
 * 连接多个Store，提供帧模板列表、过滤、选择等功能
 */
import { onMounted } from 'vue';
import { useFrameTemplateStore } from '../../stores/framesStore';
import type { Frame } from '../../types/frames';

/**
 * 帧模板管理组合式函数
 * 提供帧模板列表、过滤、选择等功能
 */
export function useFrameTemplates() {
  // 获取相关的Store
  const templateStore = useFrameTemplateStore();

  // 初始化方法
  async function loadFrames() {
    try {
      await templateStore.fetchFrames();
    } catch (err) {
      console.error('加载帧数据失败:', err);
    }
  }

  // 创建新帧
  async function createNewFrame(data: Partial<Frame> = {}) {
    try {
      const newFrame = await templateStore.createFrame(data);
      return newFrame;
    } catch (err) {
      console.error('创建帧失败:', err);
      throw err;
    }
  }

  // 更新帧
  async function updateFrame(frame: Frame) {
    try {
      const updatedFrame = await templateStore.updateFrame(frame);
      return updatedFrame;
    } catch (err) {
      console.error('更新帧失败:', err);
      throw err;
    }
  }

  // 删除帧
  async function deleteFrame(id: string) {
    try {
      const success = await templateStore.deleteFrame(id);
      return success;
    } catch (err) {
      console.error('删除帧失败:', err);
      return false;
    }
  }

  // 复制帧
  async function duplicateFrame(id: string) {
    if (!id) return null;

    try {
      // 查找原始帧
      const originalFrame = templateStore.frames.find((f) => f.id === id);
      if (!originalFrame) return null;

      // 创建副本数据
      const frameCopy: Partial<Frame> = {
        ...originalFrame,
        // 移除id，让store生成新ID
        name: `${originalFrame.name} (副本)`,
        timestamp: Date.now(),
        isFavorite: false,
      };

      // 确保不包含id属性
      delete (frameCopy as Record<string, unknown>).id;

      // 保存新帧
      const newFrame = await templateStore.createFrame(frameCopy);
      return newFrame;
    } catch (err) {
      console.error('复制帧失败:', err);
      return null;
    }
  }

  // 刷新数据并更新分类计数
  function refreshData() {
    loadFrames();
  }

  // 自动加载数据
  onMounted(() => {
    if (templateStore.frames.length === 0) {
      loadFrames();
    }
  });

  return {
    // 查询和过滤
    loadFrames,
    refreshData,
    createNewFrame,
    updateFrame,
    deleteFrame,
    duplicateFrame,
  };
}
