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
  </q-layout>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue';
import HeaderBar from '../components/layout/HeaderBar.vue';
import SidePanel from '../components/layout/SidePanel.vue';
import { useReceiveFramesStore } from 'src/stores/frames/receiveFramesStore';
import { useConnectionTargetsStore } from 'src/stores/connectionTargetsStore';
import { useFrameTemplateStore, useSendFrameInstancesStore } from 'src/stores/framesStore';
import { useSerialStore } from 'src/stores/serialStore';
import { useDataDisplayStore } from 'src/stores/frames/dataDisplayStore';
import { useSettingsStore } from 'src/stores/settingsStore';
import { useGlobalStatsStore } from 'src/stores/globalStatsStore';

const leftDrawerOpen = ref(true);
const drawerWidth = ref(120); // 默认宽度，单位是像素
const miniState = ref(true); // 默认为mini模式
const receiveFramesStore = useReceiveFramesStore();
const frameTemplateStore = useFrameTemplateStore();
const sendFrameInstancesStore = useSendFrameInstancesStore();
const serialStore = useSerialStore();
const dataDisplayStore = useDataDisplayStore();
const settingsStore = useSettingsStore();
const globalStatsStore = useGlobalStatsStore();

// 方法：清理数据项值
const clearDataItemValues = async (): Promise<void> => {
  try {
    console.log('页面卸载，开始清理接收帧数据项值...');

    // 使用store中的清理方法
    receiveFramesStore.clearDataItemValues();

    // 保存配置
    await receiveFramesStore.saveConfig();
    console.log('接收帧数据项值已清理并保存');
  } catch (error) {
    console.error('清理接收帧数据项值失败:', error);
  }
};

const connectionTargetsStore = useConnectionTargetsStore();

// 计算抽屉宽度为视窗宽度的百分比
onMounted(async () => {
  try {
    await frameTemplateStore.fetchFrames();
    await sendFrameInstancesStore.fetchInstances();
    await receiveFramesStore.loadConfig();
    await serialStore.refreshPorts();
    sendFrameInstancesStore.resetSendStats();
    connectionTargetsStore.refreshTargets(); // 刷新可用的连接目标

    // 初始化全局统计数据
    globalStatsStore.initialize();

    // 启动数据收集定时器（常开模式）
    dataDisplayStore.startDataCollection();

    // 根据设置自动开始记录
    if (settingsStore.autoStartRecording && !dataDisplayStore.recordingStatus.isRecording) {
      console.log('自动开始数据记录...');
      dataDisplayStore.startRecording();
    }
  } catch (error) {
    console.error('加载数据失败:', error);
  }
});

// 清理监听器
onUnmounted(() => {
  // 停止数据记录
  if (dataDisplayStore.recordingStatus.isRecording) {
    console.log('页面卸载，停止数据记录...');
    dataDisplayStore.stopRecording();
  }

  // 停止数据收集定时器
  dataDisplayStore.stopDataCollection();

  // 清理全局统计数据
  globalStatsStore.cleanup();

  clearDataItemValues();
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
