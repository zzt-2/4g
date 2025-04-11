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

    <!-- 帧分类，仅在帧配置相关页面显示 -->
    <!-- <div v-if="isFramesRoute" class="border-t border-[#334155]">
      <FrameCategory
        :categories="categories"
        @select="selectCategory"
        @add="addCategory"
        @update="updateCategory"
        @delete="deleteCategory"
      />
    </div> -->

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
import FrameCategory from '../frames/FrameList/FrameCategory.vue';

// 定义分类接口
interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
}

// 路由相关功能
const router = useRouter();
const route = useRoute();

// 活动路由
const activeRoute = computed(() => route.path);

// 是否在帧配置相关页面
const isFramesRoute = computed(() => {
  return route.path.startsWith('/frames');
});

// 导航数据
const navItems = ref([
  { label: '首页', path: '/', icon: 'home' },
  { label: '串口监控', path: '/serial/monitor', icon: 'insights' },
  { label: '设备控制', path: '/serial/control', icon: 'settings_remote' },
  { label: '帧配置', path: '/frames/list', icon: 'view_list' },
  { label: '帧编辑器', path: '/frames/editor', icon: 'edit' },
  { label: '设置', path: '/settings', icon: 'settings' },
]);

// 导航函数
const navigateTo = (path: string) => {
  router.push(path);
};

// 连接状态 (后期会从store中获取)
const isConnected = ref(false);
const connectionStatus = computed(() => (isConnected.value ? '已连接' : '未连接'));

// 帧分类数据
const categories = ref<Category[]>([
  { id: 'all', name: '全部帧', count: 0, icon: 'category', color: 'blue' },
  { id: 'recent', name: '最近使用', count: 0, icon: 'history', color: 'teal' },
  { id: 'favorites', name: '收藏', count: 0, icon: 'star', color: 'amber' },
  { id: 'sensors', name: '传感器', count: 0, icon: 'sensors', color: 'green' },
  { id: 'controls', name: '控制器', count: 0, icon: 'tune', color: 'red' },
]);

// 帧分类相关函数
const selectCategory = (categoryId: string) => {
  console.log(`选择分类: ${categoryId}`);
  // 如果不在帧列表页面，导航到帧列表页面并传递分类参数
  // if (route.path !== '/frames/list') {
  //   router.push(`/frames/list?category=${categoryId}`);
  // } else {
  //   // 如果已经在帧列表页面，发出事件通知父组件更新分类过滤
  //   // 可以使用全局事件总线或状态管理来实现
  // }
};

const addCategory = (category: Omit<Category, 'count'>) => {
  categories.value.push({ ...category, count: 0 });
};

const updateCategory = (category: Omit<Category, 'count'>) => {
  const index = categories.value.findIndex((c) => c.id === category.id);
  if (index !== -1) {
    // 确保保留原始的count值
    const existingCategory = categories.value[index];
    if (existingCategory) {
      const count = existingCategory.count;
      categories.value[index] = { ...category, count };
    }
  }
};

const deleteCategory = (categoryId: string) => {
  categories.value = categories.value.filter((c) => c.id !== categoryId);
};
</script>
