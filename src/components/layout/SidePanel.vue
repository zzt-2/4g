<template>
  <nav class="h-full bg-[#1a202c] text-[#e2e8f0]">
    <q-scroll-area class="fit">
      <q-list padding>
        <q-item
          v-for="item in navItems"
          :key="item.path"
          :active="activeRoute === item.path"
          clickable
          v-ripple
          @click="navigateTo(item.path)"
          class="transition-all duration-200"
          active-class="bg-[#2d3748] text-[#3b82f6]"
        >
          <q-item-section avatar>
            <q-icon :name="item.icon" />
          </q-item-section>

          <q-item-section>
            {{ item.label }}
          </q-item-section>
        </q-item>
      </q-list>
    </q-scroll-area>
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
  { label: '连接', path: '/connect', icon: 'insights' },
  { label: '配置', path: '/frames/list', icon: 'view_list' },
  { label: '发送', path: '/frames/send', icon: 'send' },
  { label: '接收', path: '/frames/receive', icon: 'download' },
  { label: '历史', path: '/history', icon: 'history' },
  { label: '设置', path: '/settings', icon: 'settings' },
]);

// 导航函数
const navigateTo = (path: string) => {
  router.push(path);
};
</script>

<style>
/* 自定义样式以配合Quasar的mini-drawer功能 */
.q-drawer--mini .q-mini-drawer-hide {
  display: none;
}
</style>
