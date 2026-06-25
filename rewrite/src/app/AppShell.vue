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

// 持久化 hydrate 完成前不渲染业务路由(S012 根因 C):否则子路由在 ready resolve 前
// 渲染空状态,数据到位后再跳变 = 启动闪烁。ready 后切 hydrated=true 显示 router-view。
const hydrated = ref(false);

const navigationItems = [
  { label: '总览', to: '/', icon: 'dashboard' },
  { label: '连接管理', to: '/connection', icon: 'link' },
  { label: '帧定义', to: '/frames', icon: 'view_agenda' },
  { label: '帧发送', to: '/send', icon: 'send' },
  { label: '任务管理', to: '/tasks', icon: 'assignment' },
  { label: '实时测试', to: '/display', icon: 'monitor_heart' },
  { label: '历史分析', to: '/history', icon: 'o_analytics' },
  { label: '指令接入', to: '/command-ingress', icon: 'settings_input_antenna' },
  { label: '系统设置', to: '/settings', icon: 'o_settings' },
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
  hydrated.value = true;
  runtime.startTickDriver();

  // ⚠️ 临时调试(现象2:停止后实例在历史里消失)——只读诊断,排查完即删。
  // Console 跑: __rw.taskSnapshot()  看 instances 里那条停止的实例在不在 / lifecycle 是什么。
  if (typeof window !== 'undefined') {
    (window as unknown as { __rw?: { taskSnapshot: () => unknown } }).__rw = {
      taskSnapshot: () => runtime.features.taskService.getSnapshot(),
    };
  }

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
  // 关闭前确保最新快照落盘(S012 根因 A3)。flushPending = saveAll 全量并发。
  // Electron 下 beforeunload 的 async 不保证跑完,但原子写(A1)保证已写的文件完整,
  // 即使被打断,下次启动数据不丢。flushPending 是锦上添花。
  void runtime.persistence.flushPending();
});
</script>

<template>
  <q-layout view="hHh Lpr fFf" class="app-shell__layout">
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
      <!-- hydrate 完成前显示 loading,避免子路由在 ready 前渲染空状态闪屏(S012 根因 C) -->
      <div v-if="!hydrated" class="app-shell__boot-loading" role="status" aria-live="polite">
        <q-spinner color="var(--rw-color-accent-primary)" size="2em" />
      </div>
      <router-view v-else />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
/* 把视口高度钉死在 q-layout 根。
   Quasar 的 .q-layout 默认只有 min-height:100%(无 height),.q-page-container 也无 height,
   .q-page 只有 position:relative —— 整条链无确定高度,内容一高就把 q-layout/q-page-container/
   q-page 一起撑过视口。base.scss 锁了 body overflow:hidden 后,撑开的内容直接被裁
   (既不滚也看不见)。这里 height:100% 给 .q-layout 一个=视口的确定高度
   (父级 .q-layout-container=#q-app 已 height:100%=body=100vh),.q-page-container 的
   height:100%+overflow-y:auto 才真正生效,滚动发生在 header 下方内容区。 */
.app-shell__layout {
  height: 100%;
}

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

/* q-page-container 是唯一的滚动容器。
   关键:padding-top:50px 显式给 header(q-toolbar min-height:50px)留位 —— 不依赖 Quasar
   按 view 字符串 JS 注入 padding-top(实测不可靠,会出现 header 遮顶)。配合 box-sizing
   border-box(Quasar 默认),height:100% 包含 padding,内容区=100%-50px 正好在 header 下方。
   overflow-y:auto 让超高内容在本容器滚(滚动条在 header 下,不盖 header)。
   h-full 页面(Display/Send/TaskManage)内容恰 100% 不溢出不滚;min-h-full 页面
   (Home/Connection/Settings 等)超高时在此容器内滚动。
   50px 来自 q-toolbar 的 min-height(Quasar 源 .q-toolbar { min-height:50px })。 */
.app-shell__page-container {
  height: 100%;
  padding-top: 50px;
  overflow-y: auto;
}

/* 启动 hydrate 期间的 loading 占位(S012 根因 C):铺满内容区居中,
   替代子路由在数据就绪前的空状态闪烁。 */
.app-shell__boot-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
