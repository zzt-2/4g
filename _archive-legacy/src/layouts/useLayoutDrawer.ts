import { ref, provide } from 'vue';

/**
 * 布局抽屉 Composable
 * 处理侧边栏/抽屉的状态和交互
 */
export function useLayoutDrawer() {
  const leftDrawerOpen = ref(true);
  const drawerWidth = ref(120); // 默认宽度，单位是像素
  const miniState = ref(true); // 默认为mini模式

  const toggleDrawer = () => {
    leftDrawerOpen.value = !leftDrawerOpen.value;
  };

  // 提供给子组件使用
  provide('toggleDrawer', toggleDrawer);

  return {
    leftDrawerOpen,
    drawerWidth,
    miniState,
    toggleDrawer,
  };
}
