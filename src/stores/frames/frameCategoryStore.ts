/**
 * 帧类别管理Store
 *
 * 负责帧类别的管理、计数更新等功能
 */
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Category, Frame } from '../../types/frames';
import { CATEGORY_IDS, DEFAULT_CATEGORIES, SYSTEM_CATEGORIES } from '../../config/frameDefaults';

// 定义系统分类ID类型
type SystemCategoryId = (typeof SYSTEM_CATEGORIES)[number];

export const useFrameCategoryStore = defineStore('frameCategory', () => {
  // 核心状态
  const categories = useStorage<Category[]>('frameCategories', DEFAULT_CATEGORIES);
  const selectedCategoryId = ref<string>(CATEGORY_IDS.ALL);

  // 计算属性
  const selectedCategory = computed(
    () =>
      categories.value.find((category) => category.id === selectedCategoryId.value) ||
      categories.value[0],
  );

  // 方法
  function updateCategoryCount(frames: Frame[]) {
    const countMap: Record<string, number> = {
      [CATEGORY_IDS.ALL]: frames.length,
      [CATEGORY_IDS.FAVORITES]: frames.filter((frame) => frame.isFavorite).length,
      [CATEGORY_IDS.RECENT]: Math.min(frames.length, 10), // 最近使用最多显示10条
      [CATEGORY_IDS.SENSORS]: frames.filter((frame) => frame.deviceType === 'sensor').length,
      [CATEGORY_IDS.CONTROLS]: frames.filter(
        (frame) => frame.deviceType === 'controller' || frame.deviceType === 'plc',
      ).length,
    };

    categories.value.forEach((category) => {
      if (category.id in countMap) {
        category.count = countMap[category.id] || 0;
      }
    });
  }

  function setSelectedCategoryId(id: string) {
    selectedCategoryId.value = id;
  }

  function addCategory(category: Omit<Category, 'count'>) {
    // 检查ID是否重复
    if (categories.value.some((c) => c.id === category.id)) {
      return null;
    }

    const newCategory: Category = {
      ...category,
      count: 0,
    };
    categories.value.push(newCategory);
    return newCategory;
  }

  function removeCategory(id: string) {
    // 系统预设的类别不允许删除
    if (SYSTEM_CATEGORIES.includes(id as SystemCategoryId)) {
      return false;
    }

    const index = categories.value.findIndex((c) => c.id === id);
    if (index > -1) {
      categories.value.splice(index, 1);

      // 如果删除的是当前选中的类别，重置为"全部"类别
      if (selectedCategoryId.value === id) {
        selectedCategoryId.value = CATEGORY_IDS.ALL;
      }

      return true;
    }
    return false;
  }

  return {
    // 状态
    categories,
    selectedCategoryId,

    // 计算属性
    selectedCategory,

    // 方法
    updateCategoryCount,
    setSelectedCategoryId,
    addCategory,
    removeCategory,
  };
});
