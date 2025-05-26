/**
 * 帧模板管理Store
 *
 * 负责帧模板的CRUD操作，提供模板列表和单个模板访问
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Frame } from '../../types/frames';
import { dataStorageAPI } from '../../utils/electronApi';
import { deepClone } from '../../utils/frames/frameUtils';
import { createEmptyFrame } from '../../types/frames/factories';

export const useFrameTemplateStore = defineStore('frameTemplates', () => {
  // 核心状态
  const frames = ref<Frame[]>([]);
  const selectedFrameId = ref<string | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 计算属性
  const selectedFrame = computed(() =>
    frames.value.find((frame) => frame.id === selectedFrameId.value),
  );

  // 数据获取方法
  async function fetchFrames() {
    try {
      isLoading.value = true;
      error.value = null;
      const data = await dataStorageAPI.framesConfig.list();
      frames.value = data;
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载帧配置失败';
      error.value = errorMessage;
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  // CRUD操作
  async function createFrame(frameData: Partial<Frame>): Promise<Frame> {
    try {
      isLoading.value = true;
      error.value = null;

      // 使用工厂函数创建基础帧
      const baseFrame = createEmptyFrame();
      const newFrame: Frame = {
        ...baseFrame,
        ...frameData,
        timestamp: Date.now(),
        updatedAt: new Date(),
      };

      await dataStorageAPI.framesConfig.save(newFrame);
      frames.value.push(newFrame);
      return newFrame;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建帧配置失败';
      error.value = errorMessage;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateFrame(frame: Frame): Promise<Frame> {
    try {
      isLoading.value = true;
      error.value = null;

      const updatedFrame = {
        ...deepClone(frame),
        updatedAt: new Date(),
      };

      await dataStorageAPI.framesConfig.save(updatedFrame);

      // 更新本地数据
      const index = frames.value.findIndex((f) => f.id === frame.id);
      if (index !== -1) {
        frames.value[index] = updatedFrame;
      }

      return updatedFrame;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新帧配置失败';
      error.value = errorMessage;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteFrame(id: string): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = null;

      await dataStorageAPI.framesConfig.delete(id);

      // 更新本地数据
      frames.value = frames.value.filter((frame) => frame.id !== id);

      // 如果删除的是当前选择的帧，清空选择
      if (selectedFrameId.value === id) {
        selectedFrameId.value = null;
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除帧配置失败';
      error.value = errorMessage;
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  // 其他必要方法
  function setSelectedFrameId(id: string | null) {
    selectedFrameId.value = id;
  }

  function toggleFavorite(id: string) {
    const frame = frames.value.find((f) => f.id === id);
    if (frame) {
      frame.isFavorite = !frame.isFavorite;
      updateFrame(frame).catch((err) => console.error('切换收藏状态失败', err));
    }
  }

  return {
    // 状态
    frames,
    selectedFrameId,
    selectedFrame,
    isLoading,
    error,

    // 方法
    fetchFrames,
    createFrame,
    updateFrame,
    deleteFrame,
    setSelectedFrameId,
    toggleFavorite,
  };
});
