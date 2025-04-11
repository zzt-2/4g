/**
 * 帧模板管理Composable
 *
 * 连接多个Store，提供帧模板列表、过滤、选择等功能
 */
import { computed, onMounted, watch } from 'vue';
import {
  useFrameTemplateStore,
  useFrameFilterStore,
  useFrameCategoryStore,
} from '../../stores/framesStore';
import type { Frame, FilterOptions } from '../../types/frames';
import { useFrameFilters } from './useFrameFilters';

/**
 * 帧模板管理组合式函数
 * 提供帧模板列表、过滤、选择等功能
 */
export function useFrameTemplates() {
  // 获取相关的Store
  const templateStore = useFrameTemplateStore();
  const filterStore = useFrameFilterStore();
  const categoryStore = useFrameCategoryStore();

  // 获取过滤函数
  const { applyAllFilters, framesByProtocol, framesByDeviceType } = useFrameFilters();

  // 计算属性
  const isLoading = computed(() => templateStore.isLoading);
  const error = computed(() => templateStore.error);
  const frames = computed(() => templateStore.frames);
  const selectedFrame = computed(() => templateStore.selectedFrame);

  // 过滤后的帧列表
  const filteredFrames = computed(() => {
    return applyAllFilters(templateStore.frames);
  });

  // 是否有数据
  const hasFrames = computed(() => frames.value.length > 0);

  // 每个协议的帧数量
  const protocolStats = computed(() => {
    const result: Record<string, number> = {};
    const protocolGroups = framesByProtocol(frames.value);

    for (const protocol in protocolGroups) {
      result[protocol] = protocolGroups[protocol]?.length || 0;
    }

    return result;
  });

  // 每个设备类型的帧数量
  const deviceTypeStats = computed(() => {
    const result: Record<string, number> = {};
    const deviceGroups = framesByDeviceType(frames.value);

    for (const deviceType in deviceGroups) {
      result[deviceType] = deviceGroups[deviceType]?.length || 0;
    }

    return result;
  });

  // 初始化方法
  async function loadFrames() {
    try {
      await templateStore.fetchFrames();
      categoryStore.updateCategoryCount(templateStore.frames);
    } catch (err) {
      console.error('加载帧数据失败:', err);
    }
  }

  // 选择帧
  function selectFrame(id: string | null) {
    templateStore.setSelectedFrameId(id);
  }

  // 创建新帧
  async function createNewFrame(data: Partial<Frame> = {}) {
    try {
      const newFrame = await templateStore.createFrame(data);
      categoryStore.updateCategoryCount(templateStore.frames);
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
      categoryStore.updateCategoryCount(templateStore.frames);
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
      if (success) {
        categoryStore.updateCategoryCount(templateStore.frames);
      }
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
      categoryStore.updateCategoryCount(templateStore.frames);
      return newFrame;
    } catch (err) {
      console.error('复制帧失败:', err);
      return null;
    }
  }

  // 切换收藏状态
  function toggleFavorite(id: string) {
    templateStore.toggleFavorite(id);
    // 需要延迟更新分类计数，确保toggleFavorite完成
    setTimeout(() => categoryStore.updateCategoryCount(templateStore.frames), 0);
  }

  // 搜索方法
  function search(query: string) {
    filterStore.setSearchQuery(query);
  }

  // 设置过滤器
  function setFilters(filters: Partial<FilterOptions>) {
    filterStore.setFilters(filters);
  }

  // 设置分类
  function setCategory(categoryId: string) {
    categoryStore.setSelectedCategoryId(categoryId);
  }

  // 设置排序方式
  function setSortOrder(order: string) {
    filterStore.setSortOrder(order);
  }

  // 重置过滤器
  function resetFilters() {
    filterStore.resetFilters();
  }

  // 刷新数据并更新分类计数
  function refreshData() {
    loadFrames();
  }

  // 监听分类变化
  watch(
    () => categoryStore.selectedCategoryId,
    () => {
      // 在分类变化时，可以执行一些操作，如更新UI状态
    },
  );

  // 自动加载数据
  onMounted(() => {
    if (templateStore.frames.length === 0) {
      loadFrames();
    }
  });

  return {
    // 状态
    isLoading,
    error,
    frames,
    filteredFrames,
    selectedFrame,
    hasFrames,
    protocolStats,
    deviceTypeStats,
    categories: computed(() => categoryStore.categories),
    selectedCategory: computed(() => categoryStore.selectedCategory),
    searchQuery: computed(() => filterStore.searchQuery),
    showFilterPanel: computed(() => filterStore.showFilterPanel),

    // 查询和过滤
    loadFrames,
    search,
    setFilters,
    setCategory,
    setSortOrder,
    resetFilters,
    refreshData,
    toggleFilterPanel: filterStore.toggleFilterPanel,

    // 帧操作
    selectFrame,
    createNewFrame,
    updateFrame,
    deleteFrame,
    duplicateFrame,
    toggleFavorite,
  };
}
