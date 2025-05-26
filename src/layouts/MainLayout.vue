<template>
  <q-layout view="hHh lpR fFf" class="bg-[#0f172a] h-screen flex flex-col">
    <!-- 头部固定高度 -->
    <q-header class="bg-[#1e293b] shadow-sm h-[48px] items-center">
      <HeaderBar />
    </q-header>

    <!-- 内容区域使用flex布局 -->
    <div class="flex items-end flex-grow h-[calc(100vh-28px)]">
      <!-- 侧边栏固定宽度 -->
      <q-drawer
        v-model="leftDrawerOpen"
        :breakpoint="500"
        dark
        persistent
        show-if-above
        :width="drawerWidth"
        :mini="miniState"
        @mouseover="miniState = false"
        @mouseout="miniState = true"
        mini-to-overlay
        class="bg-[#1e293b] text-[#e2e8f0] shadow-none border-r-0 h-full overflow-hidden"
      >
        <SidePanel />
      </q-drawer>

      <!-- 主内容区域 -->
      <q-page-container class="flex-grow h-full overflow-auto">
        <div class="text-[#e2e8f0] h-full">
          <router-view />
        </div>
      </q-page-container>
    </div>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue';
import HeaderBar from '../components/layout/HeaderBar.vue';
import SidePanel from '../components/layout/SidePanel.vue';

const leftDrawerOpen = ref(true);
const drawerWidth = ref(250); // 默认宽度，单位是像素
const miniState = ref(true); // 默认为mini模式

// 计算抽屉宽度为视窗宽度的百分比
onMounted(() => {
  const updateWidth = () => {
    drawerWidth.value = Math.round(window.innerWidth * 0.15); // 15% 的视窗宽度
  };

  updateWidth();
  window.addEventListener('resize', updateWidth);

  // 清理监听器
  onUnmounted(() => {
    window.removeEventListener('resize', updateWidth);
  });
});

const toggleDrawer = () => {
  leftDrawerOpen.value = !leftDrawerOpen.value;
};

provide('toggleDrawer', toggleDrawer);
</script>

<style>
/* 确保没有不必要的边距和边框 */
.q-layout,
.q-page-container {
  padding: 0;
}

.q-drawer__content {
  box-shadow: none !important;
  border-right: none !important;
}

/* mini状态下的drawer样式 */
.q-drawer--mini {
  width: 60px !important;
}

.q-drawer--mini .q-item__label {
  display: none;
}

/* 鼠标悬停时的过渡效果 */
.q-drawer {
  transition: all 0.3s;
}
</style>
