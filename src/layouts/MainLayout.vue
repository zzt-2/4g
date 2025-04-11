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
        :width="240"
        :breakpoint="500"
        dark
        persistent
        show-if-above
        class="bg-[#1e293b] text-[#e2e8f0] shadow-none border-r-0 h-full"
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

    <!-- 底部状态栏 -->
    <div class="bg-[#1e293b] border-t border-[#0f172a] h-[28px] z-10">
      <StatusBar />
    </div>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, provide } from 'vue';
import HeaderBar from '../components/layout/HeaderBar.vue';
import SidePanel from '../components/layout/SidePanel.vue';
import StatusBar from '../components/common/StatusBar.vue';

const leftDrawerOpen = ref(true);

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
</style>
