/**
 * 帧过滤器Store
 *
 * 负责存储帧过滤相关的状态
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FilterOptions } from '../../types/frames';
import { DEFAULT_FILTER_OPTIONS, SORT_OPTIONS } from '../../config/frameDefaults';

export const useFrameFilterStore = defineStore('frameFilter', () => {
  // 核心状态
  const searchQuery = ref('');
  const filters = ref<FilterOptions>({ ...DEFAULT_FILTER_OPTIONS });
  const sortOrder = ref<string>(SORT_OPTIONS.NAME);
  const showFilterPanel = ref(false);

  // 更新方法
  function setSearchQuery(query: string) {
    searchQuery.value = query;
  }

  function setFilters(newFilters: Partial<FilterOptions>) {
    filters.value = { ...filters.value, ...newFilters };
  }

  function setSortOrder(order: string) {
    sortOrder.value = order;
  }

  function toggleFilterPanel() {
    showFilterPanel.value = !showFilterPanel.value;
  }

  function resetFilters() {
    searchQuery.value = '';
    filters.value = { ...FILTER_OPTIONS };
  }

  return {
    // 状态
    searchQuery,
    filters,
    sortOrder,
    showFilterPanel,

    // 更新方法
    setSearchQuery,
    setFilters,
    setSortOrder,
    toggleFilterPanel,
    resetFilters,
  };
});
