/**
 * 帧过滤器Composable
 *
 * 提供帧列表过滤、搜索、排序功能
 */
import { computed } from 'vue';
import { useFrameFilterStore } from '../../stores/framesStore';
import { useFrameCategoryStore } from '../../stores/framesStore';
import type { FilterOptions, Frame } from '../../types/frames';
import { CATEGORY_IDS, SORT_OPTIONS } from '../../config/frameDefaults';
import {
  applyAllFilters as applyAllFiltersUtil,
  framesByProtocol as framesByProtocolUtil,
  framesByDeviceType as framesByDeviceTypeUtil,
} from '../../utils/frames/frameUtils';

/**
 * 帧过滤器组合式函数
 * 提供过滤、搜索、排序功能
 */
export function useFrameFilters() {
  // 获取相关的Store
  const filterStore = useFrameFilterStore();
  const categoryStore = useFrameCategoryStore();

  // 计算属性
  const searchQuery = computed(() => filterStore.searchQuery);
  const filters = computed(() => filterStore.filters);
  const showFilterPanel = computed(() => filterStore.showFilterPanel);
  const sortOrder = computed(() => filterStore.sortOrder);
  const selectedCategoryId = computed(() => categoryStore.selectedCategoryId);

  /**
   * 设置搜索关键词
   * @param query 搜索关键词
   */
  function setSearchQuery(query: string) {
    filterStore.setSearchQuery(query);
  }

  /**
   * 设置过滤条件
   * @param options 过滤条件
   */
  function setFilters(options: Partial<FilterOptions>) {
    // 确保不要包含status字段，按照重构方案要求淡化status字段
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...otherOptions } = options;
    filterStore.setFilters(otherOptions);
  }

  /**
   * 设置排序方式
   * @param order 排序方式
   */
  function setSortOrder(order: string) {
    filterStore.setSortOrder(order);
  }

  /**
   * 切换过滤面板显示状态
   */
  function toggleFilterPanel() {
    filterStore.toggleFilterPanel();
  }

  /**
   * 重置所有过滤条件
   */
  function resetFilters() {
    filterStore.resetFilters();
  }

  /**
   * 按分类过滤帧列表
   * @param frames 要过滤的帧列表
   * @returns 过滤后的帧列表
   */
  function filterFramesByCategory(frames: Frame[]): Frame[] {
    const currentCategoryId = selectedCategoryId.value;
    let result = [...frames];

    if (currentCategoryId !== CATEGORY_IDS.ALL) {
      if (currentCategoryId === CATEGORY_IDS.FAVORITES) {
        // 过滤收藏的帧
        result = result.filter((frame) => frame.isFavorite);
      } else if (currentCategoryId === CATEGORY_IDS.RECENT) {
        // 按时间排序，取最近使用的
        result.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
        result = result.slice(0, 10); // 取前10条
      } else if (currentCategoryId === CATEGORY_IDS.SENSORS) {
        // 过滤传感器类型
        result = result.filter((frame) => frame.deviceType === 'sensor');
      } else if (currentCategoryId === CATEGORY_IDS.CONTROLS) {
        // 过滤控制器类型
        result = result.filter(
          (frame) => frame.deviceType === 'controller' || frame.deviceType === 'plc',
        );
      }
    }

    return result;
  }

  /**
   * 按搜索关键词过滤帧列表
   * @param frames 要搜索的帧列表
   * @returns 搜索后的帧列表
   */
  function searchFrames(frames: Frame[]): Frame[] {
    if (!searchQuery.value) return frames;

    const query = searchQuery.value.toLowerCase();
    return frames.filter(
      (frame) =>
        frame.name.toLowerCase().includes(query) ||
        (frame.description?.toLowerCase() || '').includes(query) ||
        frame.id.toLowerCase().includes(query),
    );
  }

  /**
   * 应用过滤条件
   * @param frames 要过滤的帧列表
   * @returns 过滤后的帧列表
   */
  function applyFilters(frames: Frame[]): Frame[] {
    let result = [...frames];
    const currentFilters = filters.value;

    // 协议过滤
    if (currentFilters.protocol) {
      result = result.filter((frame) => frame.protocol === currentFilters.protocol);
    }

    // 设备类型过滤
    if (currentFilters.deviceType) {
      result = result.filter((frame) => frame.deviceType === currentFilters.deviceType);
    }

    // 日期范围过滤
    if (currentFilters.dateRange && currentFilters.dateRange[0] && currentFilters.dateRange[1]) {
      const startDate = currentFilters.dateRange[0].getTime();
      const endDate = currentFilters.dateRange[1].getTime();
      result = result.filter((frame) => {
        const updatedAt = frame?.updatedAt ? new Date(frame.updatedAt).getTime() : 0;
        return updatedAt >= startDate && updatedAt <= endDate;
      });
    }

    return result;
  }

  /**
   * 对帧列表进行排序
   * @param frames 要排序的帧列表
   * @returns 排序后的帧列表
   */
  function sortFrames(frames: Frame[]): Frame[] {
    return [...frames].sort((a, b) => {
      switch (sortOrder.value) {
        case SORT_OPTIONS.NAME:
          return a.name.localeCompare(b.name);
        case SORT_OPTIONS.DATE: {
          const bDate = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          const aDate = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          return bDate - aDate;
        }
        case SORT_OPTIONS.USAGE:
          return (b?.usageCount || 0) - (a?.usageCount || 0);
        default:
          return 0;
      }
    });
  }

  /**
   * 对帧列表应用所有过滤条件
   * @param frames 要过滤的帧列表
   * @returns 过滤后的帧列表
   */
  function applyAllFilters(frames: Frame[]): Frame[] {
    return applyAllFiltersUtil(
      frames,
      filters.value,
      searchQuery.value,
      sortOrder.value,
      selectedCategoryId.value,
    );
  }

  /**
   * 按协议分组
   * @param frames 要分组的帧列表
   * @returns 按协议分组后的结果
   */
  function framesByProtocol(frames: Frame[]): Record<string, Frame[]> {
    return framesByProtocolUtil(frames);
  }

  /**
   * 按设备类型分组
   * @param frames 要分组的帧列表
   * @returns 按设备类型分组后的结果
   */
  function framesByDeviceType(frames: Frame[]): Record<string, Frame[]> {
    return framesByDeviceTypeUtil(frames);
  }

  return {
    // 状态
    searchQuery,
    filters,
    showFilterPanel,
    sortOrder,

    // 设置方法
    setSearchQuery,
    setFilters,
    setSortOrder,
    toggleFilterPanel,
    resetFilters,

    // 过滤和分组方法
    filterFramesByCategory,
    searchFrames,
    applyFilters,
    sortFrames,
    applyAllFilters,
    framesByProtocol,
    framesByDeviceType,
  };
}
