/**
 * 帧导航相关的可组合函数
 */
import { useRouter, useRoute } from 'vue-router';

/**
 * 帧导航管理
 * 提供统一的导航处理，简化组件代码
 */
export function useFrameNavigation() {
  const router = useRouter();
  const route = useRoute();

  /**
   * 导航到帧列表页面
   * @param categoryId 分类ID，可选
   */
  const navigateToList = (categoryId?: string) => {
    router.push({
      name: 'frames-list',
      query: categoryId ? { category: categoryId } : undefined,
    });
  };

  /**
   * 导航到帧编辑页面
   * @param frameId 帧ID，如果不提供则创建新帧
   */
  const navigateToEditor = (frameId?: string) => {
    router.push({
      name: 'frames-edit',
      params: frameId ? { id: frameId } : {},
      query: frameId ? { edit: 'true' } : { create: 'true' },
    });
  };

  /**
   * 导航到帧详情页面
   * @param frameId 帧ID
   */
  const navigateToDetail = (frameId: string) => {
    router.push({
      name: 'frames-detail',
      params: { id: frameId },
    });
  };

  /**
   * 返回上一页
   */
  const navigateBack = () => {
    if (route.query.from) {
      router.push(route.query.from as string);
    } else {
      router.back();
    }
  };

  /**
   * 是否是创建新帧模式
   */
  const isCreateMode = () => {
    return route.query.create === 'true';
  };

  /**
   * 是否是编辑帧模式
   */
  const isEditMode = () => {
    return route.query.edit === 'true';
  };

  /**
   * 获取当前路由中的帧ID
   */
  const getCurrentFrameId = (): string | undefined => {
    return route.params.id as string | undefined;
  };

  /**
   * 获取当前路由中的分类ID
   */
  const getCurrentCategoryId = (): string | undefined => {
    return route.query.category as string | undefined;
  };

  return {
    navigateToList,
    navigateToEditor,
    navigateToDetail,
    navigateBack,
    isCreateMode,
    isEditMode,
    getCurrentFrameId,
    getCurrentCategoryId,
  };
}
