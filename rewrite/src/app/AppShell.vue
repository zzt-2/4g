<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { bootstrapRewriteRuntime, provideRewriteRuntime } from '@/app/rewriteRuntime';
import AppNavigation from '@/widgets/AppNavigation.vue';

const { runtime } = bootstrapRewriteRuntime();
provideRewriteRuntime(runtime);
runtime.startTickDriver();

onUnmounted(() => {
  runtime.destroy();
});

const route = useRoute();
const router = useRouter();
const drawerOpen = ref(false);

const navigationItems = [
  { label: '总览', to: '/', icon: 'dashboard' },
  { label: '连接管理', to: '/connection', icon: 'link' },
  { label: '帧定义', to: '/frames', icon: 'view_agenda' },
  { label: '帧发送', to: '/send', icon: 'send' },
  { label: '任务管理', to: '/tasks', icon: 'assignment' },
  { label: '指令接入', to: '/command-ingress', icon: 'settings_input_antenna' },
] as const;

const activePath = computed(() => route.path);
const drawerWidth = readCssPixelToken('--rw-size-app-drawer');

function readCssPixelToken(name: string): number | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const rawValue = window.getComputedStyle(window.document.documentElement).getPropertyValue(name);
  const parsedValue = Number.parseFloat(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function navigate(to: string): void {
  if (route.path !== to) {
    void router.push(to);
  }
}
</script>

<template>
  <q-layout view="hHh Lpr fFf">
    <q-header bordered class="app-shell__header">
      <q-toolbar>
        <q-btn flat round dense icon="menu" aria-label="切换导航" @click="drawerOpen = !drawerOpen" />
        <q-toolbar-title class="app-shell__title">东方红上位机</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawerOpen" show-if-above bordered :width="drawerWidth" class="app-shell__drawer">
      <AppNavigation :items="navigationItems" :active-path="activePath" @navigate="navigate" />
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.app-shell__header {
  background: var(--rw-color-surface-header);
  color: var(--rw-color-text-primary);
}

.app-shell__title {
  font-size: var(--rw-font-size-title-sm);
  font-weight: var(--rw-font-weight-semibold);
  letter-spacing: var(--rw-letter-spacing-normal);
  line-height: var(--rw-line-height-title-sm);
}

.app-shell__drawer {
  background: var(--rw-color-surface-base);
}
</style>
