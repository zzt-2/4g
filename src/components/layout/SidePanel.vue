<template>
  <nav class="flex flex-col h-full bg-[#1a202c] text-[#e2e8f0]">
    <div class="p-4 border-b border-[#334155]">
      <span class="text-sm font-semibold text-[#94a3b8] uppercase">功能导航</span>
    </div>

    <ul class="list-none p-0 m-0 flex-1 overflow-y-auto">
      <li
        v-for="item in navItems"
        :key="item.path"
        class="flex items-center py-3 px-4 cursor-pointer border-l-3 border-transparent transition-all duration-200 hover:bg-[#2d3748]"
        :class="{ 'bg-[#2d3748] border-l-[#3b82f6] text-[#3b82f6]': activeRoute === item.path }"
        @click="navigateTo(item.path)"
      >
        <span class="material-icons mr-3 text-xl">{{ item.icon }}</span>
        <span class="text-sm">{{ item.label }}</span>
      </li>
    </ul>

    <div class="p-4 border-t border-[#334155] mt-auto">
      <div class="flex items-center">
        <div
          class="w-2.5 h-2.5 rounded-full mr-2"
          :class="isConnected ? 'bg-[#10b981]' : 'bg-[#ef4444]'"
        ></div>
        <span class="text-xs text-[#94a3b8]">{{ connectionStatus }}</span>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

// 路由相关功能
const router = useRouter();
const route = useRoute();

// 活动路由
const activeRoute = computed(() => route.path);

// 导航数据
const navItems = ref([
  { label: '首页', path: '/', icon: 'home' },
  { label: '串口监控', path: '/serial/monitor', icon: 'insights' },
  { label: '设备控制', path: '/serial/control', icon: 'settings_remote' },
  { label: '帧配置', path: '/frames/list', icon: 'view_list' },
  { label: '设置', path: '/settings', icon: 'settings' },
]);

// 导航函数
const navigateTo = (path: string) => {
  router.push(path);
};

// 连接状态 (后期会从store中获取)
const isConnected = ref(false);
const connectionStatus = computed(() => (isConnected.value ? '已连接' : '未连接'));
</script>
