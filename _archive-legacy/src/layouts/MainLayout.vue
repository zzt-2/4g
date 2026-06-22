<template>
  <q-layout view="hHh lpR fFf" class="bg-[#0f172a] h-screen flex flex-col">
    <!-- 头部固定高度 -->
    <q-header class="bg-[#1e293b] shadow-sm h-[48px] items-center">
      <HeaderBar />
    </q-header>

    <!-- 内容区域使用flex布局 -->
    <div class="flex items-end flex-grow h-[calc(100vh-28px)]">
      <!-- 侧边栏固定宽度 -->
      <q-drawer v-model="leftDrawerOpen" :breakpoint="200" dark persistent show-if-above :width="drawerWidth"
        :mini="miniState" @mouseover="miniState = false" @mouseout="miniState = true" mini-to-overlay
        class="bg-[#1e293b] text-[#e2e8f0] shadow-none border-r-0 h-full overflow-hidden">
        <SidePanel />
      </q-drawer>

      <!-- 主内容区域 -->
      <q-page-container class="flex-grow h-full overflow-auto">
        <div class="text-[#e2e8f0] h-full">
          <router-view />
        </div>
      </q-page-container>
    </div>

    <!-- 全局文件对话框 -->
    <FileListDialog v-if="fileDialogState.isOpen" :title="fileDialogState.title" :isOpen="fileDialogState.isOpen"
      :storageDir="fileDialogState.storageDir" :operation="fileDialogState.operation" @select="handleFileSelect"
      @create="handleFileCreate" @close="handleFileDialogClose" />
  </q-layout>
</template>

<script setup lang="ts">
import HeaderBar from '../components/layout/HeaderBar.vue';
import SidePanel from '../components/layout/SidePanel.vue';
import FileListDialog from '../components/common/FileListDialog.vue';
import { useFileDialog } from './useFileDialog';
import { useAppLifecycle } from './useAppLifecycle';
import { useLayoutDrawer } from './useLayoutDrawer';

// 抽屉/侧边栏逻辑
const { leftDrawerOpen, drawerWidth, miniState } = useLayoutDrawer();

// 文件对话框逻辑
const { fileDialogState, handleFileSelect, handleFileCreate, handleFileDialogClose } = useFileDialog();

// 应用生命周期逻辑
useAppLifecycle();
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
