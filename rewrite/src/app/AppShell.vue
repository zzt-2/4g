<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { bootstrapRewriteRuntime, provideRewriteRuntime } from '@/app/rewriteRuntime';
import { REWRITE_PLATFORM_BRIDGE_KEY, type WindowControlBridge } from '@/shared/platform-bridge';
import AppNavigation from '@/widgets/AppNavigation.vue';

const { runtime, ready } = bootstrapRewriteRuntime();
provideRewriteRuntime(runtime);

const route = useRoute();
const router = useRouter();
const drawerOpen = ref(false);

const navigationItems = [
  { label: '总览', to: '/', icon: 'dashboard' },
  { label: '连接管理', to: '/connection', icon: 'link' },
  { label: '帧定义', to: '/frames', icon: 'view_agenda' },
  { label: '帧发送', to: '/send', icon: 'send' },
  { label: '实时测试', to: '/display', icon: 'monitor_heart' },
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

// --- 自定义窗口控制(无边框窗口 frame:false) ---
// 直接读 preload expose 的 windowControl,不经 src/platform facade —— 窗口控制是
// 壳层 UI 能力,与业务 facade(transport/file/...)同级,没必要再封一层。
function getWindowControl(): WindowControlBridge | undefined {
  return window[REWRITE_PLATFORM_BRIDGE_KEY]?.windowControl;
}

const isMaximized = ref(false);
let unsubscribeMaximize: (() => void) | undefined;

async function onMinimize(): Promise<void> {
  await getWindowControl()?.minimize();
}

async function onToggleMaximize(): Promise<void> {
  const next = await getWindowControl()?.toggleMaximize();
  if (typeof next === 'boolean') {
    isMaximized.value = next;
  }
}

async function onClose(): Promise<void> {
  await getWindowControl()?.close();
}

onMounted(async () => {
  await ready;
  runtime.startTickDriver();

  // 取初始最大化态 + 订阅后续变化(系统 Snap/双击标题栏或按钮触发都推送),图标随之切。
  const ctrl = getWindowControl();
  if (ctrl) {
    isMaximized.value = await ctrl.isMaximized();
    unsubscribeMaximize = ctrl.onMaximizeChange((maximized) => {
      isMaximized.value = maximized;
    });
  }
});

onUnmounted(() => {
  unsubscribeMaximize?.();
  unsubscribeMaximize = undefined;
  runtime.destroy();
});

window.addEventListener('beforeunload', () => {
  void runtime.persistence.saveAll();
});
</script>

<template>
  <q-layout view="hHh Lpr fFf">
    <q-header bordered class="app-shell__header">
      <!-- 标题栏可拖动区(frame:false 无系统标题栏,靠 -webkit-app-region:drag 移动窗口);
           按钮和 menu 标 no-drag 否则点不到。 -->
      <q-toolbar class="app-shell__toolbar">
        <q-btn flat round dense icon="menu" aria-label="切换导航" class="app-shell__no-drag" @click="drawerOpen = !drawerOpen" />
        <q-toolbar-title class="app-shell__title">激光模拟器</q-toolbar-title>
        <div class="app-shell__window-controls">
          <q-btn
            flat
            round
            dense
            icon="remove"
            aria-label="最小化"
            class="app-shell__window-btn"
            @click="onMinimize"
          />
          <q-btn
            flat
            round
            dense
            :icon="isMaximized ? 'fullscreen_exit' : 'fullscreen'"
            :aria-label="isMaximized ? '还原' : '最大化'"
            class="app-shell__window-btn"
            @click="onToggleMaximize"
          />
          <q-btn
            flat
            round
            dense
            icon="close"
            aria-label="关闭"
            class="app-shell__window-btn app-shell__window-btn--close"
            @click="onClose"
          />
        </div>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawerOpen" show-if-above bordered :width="drawerWidth" class="app-shell__drawer">
      <AppNavigation :items="navigationItems" :active-path="activePath" @navigate="navigate" />
    </q-drawer>

    <q-page-container class="app-shell__page-container">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.app-shell__header {
  background: var(--rw-color-surface-header);
  color: var(--rw-color-text-primary);
}

/* 整条 toolbar 是拖动区(无边框窗口移动窗口用),下面的按钮/控件单独标 no-drag。 */
.app-shell__toolbar {
  -webkit-app-region: drag;
}

.app-shell__no-drag,
.app-shell__window-controls {
  -webkit-app-region: no-drag;
}

.app-shell__title {
  font-size: var(--rw-font-size-title-sm);
  font-weight: var(--rw-font-weight-semibold);
  letter-spacing: var(--rw-letter-spacing-normal);
  line-height: var(--rw-line-height-title-sm);
}

.app-shell__window-controls {
  display: flex;
  align-items: center;
  gap: var(--rw-space-1);
  margin-left: var(--rw-space-2);
}

.app-shell__window-btn {
  color: var(--rw-color-text-secondary);
}

.app-shell__window-btn:hover {
  color: var(--rw-color-text-primary);
  background: var(--rw-color-surface-selected);
}

/* 关闭按钮 hover 是红底白字(退出语义),单独覆盖普通按钮的浅色 hover。 */
.app-shell__window-btn--close:hover {
  color: #ffffff;
  background: var(--rw-color-status-danger);
}

.app-shell__drawer {
  background: var(--rw-color-surface-base);
}

/* q-page-container 是唯一的滚动容器:body 锁视口(base.scss height:100%+overflow:hidden),
   这里 height:100%(= q-layout = 视口) + overflow-y:auto 让页面内容在 header 下方滚动。
   Quasar 按 view="hHh" 给本容器自动加 padding-top = header 高度,所以滚动条出现在 header
   下方而非盖住 header。h-full 页面(Display/Send/TaskManage)内容恰好 100% 不溢出不滚;
   min-h-full 页面(Home/Connection 等)超高时在此容器内滚动。 */
.app-shell__page-container {
  height: 100%;
  overflow-y: auto;
}
</style>
