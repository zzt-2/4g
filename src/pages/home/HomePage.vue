<template>
  <div class="flex flex-col">
    <header class="text-center mb-8">
      <h1 class="text-3xl font-semibold text-[#3b82f6] mb-2">RS485 上位机</h1>
      <p class="text-[#94a3b8] text-base">工业通信监控与控制</p>
    </header>

    <div class="grid grid-cols-[2fr_1fr] gap-6">
      <div class="grid grid-cols-2 gap-4">
        <div
          v-for="(card, index) in quickAccessCards"
          :key="index"
          @click="navigateTo(card.path)"
          class="flex items-center bg-[#1e293b] rounded-lg p-4 cursor-pointer transition-all duration-200 border border-[#334155] hover:border-[#3b82f6] hover:transform hover:translate-y-[-2px] hover:shadow-md"
        >
          <div class="flex items-center justify-center w-12 h-12 bg-[#334155] rounded-lg mr-4">
            <span class="material-icons text-[#3b82f6]">{{ card.icon }}</span>
          </div>
          <div>
            <h3 class="text-lg font-semibold mb-1">{{ card.title }}</h3>
            <p class="text-sm text-[#94a3b8]">{{ card.description }}</p>
          </div>
        </div>
      </div>

      <div class="bg-[#1e293b] rounded-lg p-4 border border-[#334155]">
        <h2 class="text-lg font-semibold mb-4 text-[#e2e8f0]">系统状态</h2>
        <div class="flex flex-col gap-3">
          <div class="flex justify-between py-2 border-b border-[#334155]">
            <span class="text-[#94a3b8]">连接状态:</span>
            <span :class="isConnected ? 'text-[#10b981]' : 'text-[#e2e8f0]'" class="font-medium">
              {{ isConnected ? '已连接' : '未连接' }}
            </span>
          </div>
          <div class="flex justify-between py-2 border-b border-[#334155]">
            <span class="text-[#94a3b8]">设备数量:</span>
            <span class="font-medium">{{ deviceCount }}</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-[#94a3b8]">今日收发:</span>
            <span class="font-medium">{{ todayTraffic }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// 快速访问卡片数据
const quickAccessCards = ref([
  {
    title: '串口监控',
    description: '监控串口数据流',
    icon: 'insights',
    path: '/serial/monitor',
  },
  {
    title: '设备控制',
    description: '发送命令控制设备',
    icon: 'settings_remote',
    path: '/serial/control',
  },
  {
    title: '帧配置',
    description: '配置和管理数据帧结构',
    icon: 'view_list',
    path: '/frames/list',
  },
  {
    title: '帧编辑器',
    description: '创建和编辑数据帧',
    icon: 'edit',
    path: '/frames/editor',
  },
  {
    title: '帧发送',
    description: '配置和发送数据帧实例',
    icon: 'send',
    path: '/frames/send',
  },
]);

// 系统状态 (将来会从store获取)
const isConnected = ref(false);
const deviceCount = ref(0);
const todayTraffic = ref('0 B');

// 页面导航
const navigateTo = (path: string) => {
  router.push(path);
};
</script>
