/**
 * 帧分类管理Composable
 *
 * 提供帧分类管理功能，包括分类选择、添加、更新、删除等
 */
import { computed } from 'vue';
import { useFrameCategoryStore } from '../../stores/framesStore';
import type { Category, Frame } from '../../types/frames';
import { CATEGORY_IDS } from '../../config/frameDefaults';

/**
 * 帧分类管理组合式函数
 * 提供分类选择、添加、更新、删除等功能
 */
export function useFrameCategories() {
  // 获取相关的Store
  const categoryStore = useFrameCategoryStore();

  // 计算属性
  const categories = computed(() => categoryStore.categories);
  const selectedCategoryId = computed(() => categoryStore.selectedCategoryId);
  const selectedCategory = computed(() => categoryStore.selectedCategory);

  /**
   * 选择分类
   * @param categoryId 分类ID
   */
  function selectCategory(categoryId: string) {
    categoryStore.setSelectedCategoryId(categoryId);
  }

  /**
   * 添加分类
   * @param category 分类信息
   */
  function addCategory(category: Omit<Category, 'count'>) {
    const newCategory = { ...category, count: 0 };
    categoryStore.addCategory(newCategory);
  }

  /**
   * 更新分类
   * @param category 分类信息
   */
  function updateCategory(category: Omit<Category, 'count'>) {
    // 先移除旧分类，再添加更新后的分类
    categoryStore.removeCategory(category.id);
    categoryStore.addCategory(category);
  }

  /**
   * 删除分类
   * @param categoryId 分类ID
   */
  function deleteCategory(categoryId: string) {
    categoryStore.removeCategory(categoryId);
  }

  /**
   * 更新分类计数
   * @param frames 帧列表
   */
  function updateCategoryCount(frames: Frame[]) {
    categoryStore.updateCategoryCount(frames);
  }

  /**
   * 获取分类帧数量
   * @param categoryId 分类ID
   */
  function getCategoryCount(categoryId: string): number {
    const category = categories.value.find((c) => c.id === categoryId);
    return category?.count || 0;
  }

  /**
   * 检查帧是否属于选定分类
   * @param frame 帧对象
   */
  function isInSelectedCategory(frame: Frame): boolean {
    const categoryId = selectedCategoryId.value;

    // 检查系统分类
    if (categoryId === CATEGORY_IDS.ALL) {
      return true;
    }

    if (categoryId === CATEGORY_IDS.FAVORITES) {
      return frame.isFavorite === true;
    }

    if (categoryId === CATEGORY_IDS.RECENT) {
      // 通常由过滤器处理，这里简单返回 true
      return true;
    }

    if (categoryId === CATEGORY_IDS.SENSORS) {
      return frame.deviceType === 'sensor';
    }

    if (categoryId === CATEGORY_IDS.CONTROLS) {
      return frame.deviceType === 'controller' || frame.deviceType === 'plc';
    }

    // 自定义分类通常由其他逻辑处理
    return true;
  }

  return {
    // 状态
    categories,
    selectedCategoryId,
    selectedCategory,

    // 方法
    selectCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    updateCategoryCount,
    getCategoryCount,
    isInSelectedCategory,
  };
}
