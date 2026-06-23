# S012 全局 UI 治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 4 处 UI 做治理——HistoryPage 视觉全治、FrameListPage 批量模式 actions 替换式上移、ConnectionPage/HomePage 删 H1、AppShell drawer 补 2 项导航 + 任务上移。

**Architecture:** 纯模板/scoped-style 改动，零 composable/service/core API 变更，零路由变更。所有改动遵守 `codestable/quality/rewrite-frontend-conventions.md` + `codestable/reference/rewrite-frontend-quickref.md`（绝对禁止清单）。无单测覆盖这 4 个文件（已确认无 spec.ts 引用），验证走 `pnpm lint` + `vue-tsc` + dev server 实测，不造假 TDD 循环。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Quasar 2 + UnoCSS + SCSS scoped + 项目语义 class（rw-segmented / rw-panel-base / rw-divider-* / rw-text-*）。

**Spec:** `docs/superpowers/specs/2026-06-23-global-ui-governance-design.md`

**命令约定**（所有 task 通用，路径用 `git -C` 避免 cd /d 问题）：
- Lint：`pnpm --prefix rewrite lint`（eslint，baseline 6 pre-existing error，**目标 0 新增**）
- 类型检查：`pnpm --prefix rewrite exec vue-tsc --noEmit`（**目标 0 错**；与最近几次 session 同款，跑改动相关文件即可，全量可能慢）
- 实测：`pnpm --prefix rewrite dev` 启 electron dev server，逐页点开看视觉/交互/滚动
- Commit：`git -C "D:\code\frontend\dongfanghong" add <files> && git -C "D:\code\frontend\dongfanghong" commit -m "..."`，message 末尾带 `[S012]`

---

## File Structure（改动总览）

| 文件 | 责任 | 改动 |
|------|------|------|
| `rewrite/src/app/AppShell.vue` | drawer 导航数据源 `navigationItems` | 数组重排 + 加 2 项（Task 1） |
| `rewrite/src/pages/HistoryPage.vue` | 历史分析页 | 4 处视觉治理（Task 2） |
| `rewrite/src/pages/FrameListPage.vue` | 帧定义列表页 | 批量模式 actions 替换式上移 + 抽 exit/toggle 函数（Task 3） |
| `rewrite/src/pages/ConnectionPage.vue` | 连接管理页 | 删 H1 + 清 scoped title 规则（Task 4） |
| `rewrite/src/pages/HomePage.vue` | 运行总览页 | 删 H1 + 清 scoped title 规则（Task 4） |

> Task 1（AppShell）和 Task 2-4（pages）互不依赖，可任意顺序；但都改完才能整体 lint/实测。建议顺序 1→2→3→4，每个 Task 末尾独立 commit。

---

## Task 1: AppShell drawer 补导航项 + 任务上移

**Files:**
- Modify: `rewrite/src/app/AppShell.vue:15-23`（`navigationItems` 数组）

**背景**：drawer 数据源是 `AppShell.vue` 顶部的 `navigationItems` 常量，7 项。`AppNavigation.vue` 子组件已泛型（items prop 透传），不动。现有 7 项 icon 用陈旧实心名（`dashboard`/`link`/...），**本轮不顺手统一**（控范围），只让新增 2 项走现代 `o_` 前缀惯例（spec §5 已记理由）。

- [ ] **Step 1: 替换 navigationItems 数组**

把 `rewrite/src/app/AppShell.vue:15-23` 这段：

```typescript
const navigationItems = [
  { label: '总览', to: '/', icon: 'dashboard' },
  { label: '连接管理', to: '/connection', icon: 'link' },
  { label: '帧定义', to: '/frames', icon: 'view_agenda' },
  { label: '帧发送', to: '/send', icon: 'send' },
  { label: '实时测试', to: '/display', icon: 'monitor_heart' },
  { label: '任务管理', to: '/tasks', icon: 'assignment' },
  { label: '指令接入', to: '/command-ingress', icon: 'settings_input_antenna' },
] as const;
```

替换为（9 项：任务上移到帧发送与实时测试之间，历史分析插在实时测试后，系统设置沉底）：

```typescript
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
```

> 顺序逻辑：总览→连接→帧定义/发送→**任务（组织发送）**→实时测试→**历史分析（看测试数据）**→指令接入（独立子系统）→系统设置（沉底）。

- [ ] **Step 2: 类型检查（确认 `as const` 推断无破坏）**

Run: `pnpm --prefix rewrite exec vue-tsc --noEmit`
Expected: 0 新增错（AppShell 改动只动数组字面量值，类型 `readonly AppNavigationItem[]` 不变）。

- [ ] **Step 3: Commit**

```bash
git -C "D:\code\frontend\dongfanghong" add rewrite/src/app/AppShell.vue
git -C "D:\code\frontend\dongfanghong" commit -m "feat(ui): drawer 补历史分析/系统设置导航 + 任务上移到发送与测试之间 [S012]"
```

---

## Task 2: HistoryPage 视觉治理

**Files:**
- Modify: `rewrite/src/pages/HistoryPage.vue`（4 处：①q-page inline style ②左栏 min-width inline + 分栏 gap ③左栏卡片化 ④q-btn-toggle→rw-segmented）
- 加 scoped style 块（现状无 `<style>`，需新增）

**背景**：现状 `L85` q-page 有 inline `style="background:..."`（违 C4），`L88` 左栏 inline `style="min-width:280px"`（违 C4）+ `rw-divider-l` 1px 细线贴死右栏（S010 续接通病），`L118` q-btn-toggle 旧式（应走 rw-segmented）。`CHART_HEIGHTS`（`L52-57`）保留（图表运行时高度，非视觉 token，T2 不视为硬编码）。

### Step 2a: q-page inline style → scoped class（改 C4 违规 1）

- [ ] **Step 1: 改 q-page 开标签**

`rewrite/src/pages/HistoryPage.vue:85`：

```vue
  <q-page class="min-h-full" style="background: var(--rw-color-surface-app)">
```

改为：

```vue
  <q-page class="history-page min-h-full">
```

### Step 2b: 分栏 gap-6 + 外层 padding + 左栏去 inline + 卡片化（改 C4 违规 2 + 通病 1a）

- [ ] **Step 2: 改分栏父容器**

`rewrite/src/pages/HistoryPage.vue:86`：

```vue
    <div class="flex h-full">
```

改为（加 gap-6 间距 + p-6 边缘 padding 硬约束；不再用 1px 细线贴死）：

```vue
    <div class="flex h-full gap-6 p-6">
```

- [ ] **Step 3: 改左栏容器（去 inline min-width + 去 divider-l + 卡片化）**

`rewrite/src/pages/HistoryPage.vue:88`：

```vue
      <div class="w-80 flex flex-col border-r rw-divider-l overflow-hidden" style="min-width: 280px">
```

改为（删 `border-r rw-divider-l` 不再用细线分隔；删 inline `style`；加 `rw-panel-base rounded` 卡片化；`w-80`=320px 已够宽，min-width 冗余删之）：

```vue
      <div class="w-80 flex flex-col rw-panel-base rounded overflow-hidden">
```

> **L4 检查**：父 `flex h-full gap-6 p-6` 无预防性堆叠。左栏 `overflow-hidden` 是裁剪层（内部 TimeSelector/DataSelector 各自管滚动），符合 L4"中间传递层用 overflow-hidden"。左栏不滚不加 min-h-0。右栏 `flex-1 ... overflow-hidden`（`L114` 现状）保持，其内部 `flex-1 overflow-auto`（`L132`）才是真滚动边界。

### Step 2c: q-btn-toggle → rw-segmented（通病 1d）

- [ ] **Step 4: 加模块级 CHART_COUNT_OPTIONS 常量（O4）**

在 `rewrite/src/pages/HistoryPage.vue` 的 `<script setup>` 内、`CHART_HEIGHTS` 常量（`L52`）附近，加模块级选项数组。把这段（`L52-57` 现有）：

```typescript
const CHART_HEIGHTS: Record<number, string> = {
  1: '420px',
  2: '340px',
  3: '280px',
  4: '240px',
};
```

替换为（CHART_HEIGHTS 保留 + 新增 CHART_COUNT_OPTIONS；两者都是图表数量相关的不变数据，放一起）：

```typescript
const CHART_HEIGHTS: Record<number, string> = {
  1: '420px',
  2: '340px',
  3: '280px',
  4: '240px',
};

// 图表数量分段控件选项（O4 模块级；照搬 CiToolbar TABS 范式）。
const CHART_COUNT_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
] as const;
```

- [ ] **Step 5: 替换 q-btn-toggle 为 rw-segmented**

`rewrite/src/pages/HistoryPage.vue:118-124`（顶 bar 里的 q-btn-toggle）：

```vue
          <q-btn-toggle
            :model-value="chartCount"
            :options="[1, 2, 3, 4].map((n) => ({ label: String(n), value: n }))"
            dense flat no-caps
            toggle-color="primary"
            @update:model-value="handleChartCountChange"
          />
```

替换为（照搬 S010 CiToolbar.vue:54-66 rw-segmented 范式：原生 `<button type="button" role="tab">` + `:class` 数组绑 active + `aria-selected` + click 调现成 `handleChartCountChange`）：

```vue
          <div class="rw-segmented" role="tablist">
            <button
              v-for="opt in CHART_COUNT_OPTIONS"
              :key="opt.value"
              type="button"
              role="tab"
              :aria-selected="chartCount === opt.value"
              :class="['rw-segmented__btn', { 'rw-segmented__btn--active': chartCount === opt.value }]"
              @click="handleChartCountChange(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
```

> `handleChartCountChange`（`L38`）签名已是 `(count: number): void`，复用无需改。模板里 `.map((n) => ({...}))` 内联表达式随之消除（O4 + P8 模板禁内联 .map）。

### Step 2d: 加 scoped style（承载 .history-page 背景）

- [ ] **Step 6: 在文件末尾 `</template>` 后加 scoped style 块**

`rewrite/src/pages/HistoryPage.vue` 当前无 `<style>` 块（`</template>` 在 `L186` 是文件末尾）。在 `</template>`（`L186`）后追加（写法对齐 FrameListPage.vue:423-427 `.frame-list-page`）：

```vue

<style scoped lang="scss">
.history-page {
  background: var(--rw-color-surface-app);
}
</style>
```

> scoped 消费 token 合规（C4 禁的是 **inline** style 消费 token，scoped style 消费 token 是 token 系统的正常用法，见 conventions §6 C1 "✅ SCSS / CSS 变量"）。

- [ ] **Step 7: 类型检查 + lint**

Run: `pnpm --prefix rewrite exec vue-tsc --noEmit`
Expected: 0 错。

Run: `pnpm --prefix rewrite lint`
Expected: 0 新增 error（baseline 6 pre-existing 无关）。

- [ ] **Step 8: Commit**

```bash
git -C "D:\code\frontend\dongfanghong" add rewrite/src/pages/HistoryPage.vue
git -C "D:\code\frontend\dongfanghong" commit -m "refactor(history): 视觉治理——gap-6 分栏 + 去 2 处 inline style + q-btn-toggle→rw-segmented [S012]"
```

---

## Task 3: FrameListPage 批量模式 actions 替换式上移

**Files:**
- Modify: `rewrite/src/pages/FrameListPage.vue`
  - script：抽 `exitBatchMode()` + `toggleBatchMode()`（O3，消除 `batchMode=...; batchSelectedRows=[]; selectedFrameIds=[]` 重复逻辑）
  - template：顶部 toolbar actions slot 加 `v-if="batchMode"` 替换式分支；删内容区独立 batch-mode toolbar（`L319-338`）

**背景**：现状批量 UI 两处——顶部 toolbar 的「批量管理」切换按钮（`L301-310`，保留）+ 内容区表格上方独立 bar（`L319-338`，删）。用户要后者扔到顶上去（替换式：批量模式下 actions 整组替换为「删除选中 / N项已选中 / 退出批量」）。

**FrameListPage 其他视觉问题（分栏贴死/magic height/调色板硬编码/筛选 chip）本轮明确不动**（spec §3）。

### Step 3a: 抽 exit/toggle 函数（O3）

- [ ] **Step 1: 加 exitBatchMode + toggleBatchMode 函数**

在 `rewrite/src/pages/FrameListPage.vue` 的 `<script setup>` 内，`onBatchDelete` 函数（`L54-74`）后面加两个函数。现状 `L54` 前是 `const batchSelectedRows = shallowRef<TableRow[]>([]);`（`L52`）。在 `onBatchDelete` 函数（结束于 `L74` 的 `}`）之后插入：

```typescript
// 退出批量模式：清批量选中。单选 selectedFrameIds 不在此清（切回单选时由 onSelectionChange 自然重置）。
function exitBatchMode(): void {
  batchMode.value = false;
  batchSelectedRows.value = [];
}

// 切换批量模式：进入时额外清单选残留（避免单选选中在批量模式下显示不一致）。
function toggleBatchMode(): void {
  batchMode.value = !batchMode.value;
  batchSelectedRows.value = [];
  selectedFrameIds.value = [];
}
```

### Step 3b: 顶部 toolbar 切换按钮改用 toggleBatchMode

- [ ] **Step 2: 改「批量管理」切换按钮 click handler**

`rewrite/src/pages/FrameListPage.vue:301-310`（actions slot 里的批量管理按钮）：

```vue
            <q-btn
              flat
              dense
              no-caps
              size="sm"
              :icon="batchMode ? 'o_close' : 'o_checklist'"
              :label="batchMode ? '退出批量' : '批量管理'"
              :color="batchMode ? 'negative' : 'grey'"
              @click="batchMode = !batchMode; batchSelectedRows = []; selectedFrameIds = []"
            />
```

改 click handler（其余属性不动）：

```vue
            <q-btn
              flat
              dense
              no-caps
              size="sm"
              :icon="batchMode ? 'o_close' : 'o_checklist'"
              :label="batchMode ? '退出批量' : '批量管理'"
              :color="batchMode ? 'negative' : 'grey'"
              @click="toggleBatchMode"
            />
```

> 注意：这个按钮在批量模式下会被 §3c 的替换式分支隐藏（actions 整组替换），所以它的「退出批量」label 其实是正常模式下点进去的预览态——替换式后退出走新加的「退出批量模式」按钮。保留这个 label 无害（用户从正常模式进批量时仍看到「批量管理」label）。

### Step 3c: 顶部 toolbar actions 加替换式分支

- [ ] **Step 3: 给 actions slot 包条件分支**

现状 `L272-311` 是 `<template #actions> ... </template>`，里面 4 个按钮（新建/导入/导出/批量管理）。

把 `rewrite/src/pages/FrameListPage.vue:272` 这行：

```vue
          <template #actions>
```

到 `L311` 的：

```vue
          </template>
```

整段（含 4 个按钮）替换为条件分支（批量模式下整组替换）：

```vue
          <template #actions>
            <template v-if="batchMode">
              <!-- 批量模式：替换式 actions（新建/导入/导出临时隐藏） -->
              <q-btn
                flat dense no-caps
                icon="o_delete"
                label="删除选中"
                color="negative"
                size="sm"
                :disable="batchSelectedRows.length === 0"
                @click="onBatchDelete"
              />
              <span class="rw-text-desc text-xs">{{ batchSelectedRows.length }} 项已选中</span>
              <q-space />
              <q-btn
                flat dense no-caps
                label="退出批量模式"
                size="sm"
                @click="exitBatchMode"
              />
            </template>
            <template v-else>
              <!-- 正常模式：原 actions -->
              <q-btn
                outline
                color="primary"
                icon="o_add"
                label="新建"
                dense
                no-caps
                @click="onEditFrame('new')"
              />
              <q-btn
                outline
                color="primary"
                icon="o_upload"
                label="导入"
                dense
                no-caps
                @click="showImportDialog = true"
              />
              <q-btn
                outline
                color="primary"
                icon="o_download"
                label="导出"
                dense
                no-caps
                :disable="frameList.length === 0"
                @click="onExport"
              />
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                :icon="batchMode ? 'o_close' : 'o_checklist'"
                :label="batchMode ? '退出批量' : '批量管理'"
                :color="batchMode ? 'negative' : 'grey'"
                @click="toggleBatchMode"
              />
            </template>
          </template>
```

### Step 3d: 删内容区独立 batch-mode toolbar

- [ ] **Step 4: 删表格上方独立批量 bar**

`rewrite/src/pages/FrameListPage.vue:319-338`（内容区 `<div class="flex flex-1 overflow-hidden">` 内、DataTable 之前的独立 batch-mode toolbar）：

```vue
          <!-- Batch mode toolbar -->
          <div v-if="batchMode" class="flex items-center gap-2 px-4 py-2 rw-divider-b flex-shrink-0">
            <q-btn
              flat dense no-caps
              icon="o_delete"
              label="删除选中"
              color="negative"
              size="sm"
              :disable="batchSelectedRows.length === 0"
              @click="onBatchDelete"
            />
            <span class="rw-text-desc text-xs">{{ batchSelectedRows.length }} 项已选中</span>
            <div class="flex-1" />
            <q-btn
              flat dense no-caps
              label="退出批量模式"
              size="sm"
              @click="batchMode = false; batchSelectedRows = []"
            />
          </div>
```

**整段删除**（这 19 行）。删除后 DataTable 直接接在内容容器顶部，批量操作归顶部 toolbar。

- [ ] **Step 5: 类型检查 + lint**

Run: `pnpm --prefix rewrite exec vue-tsc --noEmit`
Expected: 0 错（`exitBatchMode`/`toggleBatchMode` 新增函数被 template 引用，无未用警告）。

Run: `pnpm --prefix rewrite lint`
Expected: 0 新增 error。

- [ ] **Step 6: Commit**

```bash
git -C "D:\code\frontend\dongfanghong" add rewrite/src/pages/FrameListPage.vue
git -C "D:\code\frontend\dongfanghong" commit -m "refactor(frame-list): 批量模式 actions 替换式上移顶部 toolbar + 抽 exit/toggle 函数 [S012]"
```

---

## Task 4: ConnectionPage / HomePage 删 H1

**Files:**
- Modify: `rewrite/src/pages/ConnectionPage.vue`（删 `<h1>` `L133` + scoped `.connection-page__title` 规则 `L217-223`）
- Modify: `rewrite/src/pages/HomePage.vue`（删 `<h1>` + 包裹 div `L133-135` + scoped `.home-page__title` 规则 `L224-229`）

**背景**：AppShell drawer 已标当前页名（S010 通病标准解法），page 顶 H1 重复碍事。不补子标题（用户"还行"，对齐 CommandIngressPage 无 H1 样板）。

### Step 4a: ConnectionPage 删 H1

- [ ] **Step 1: 删 template 里的 h1**

`rewrite/src/pages/ConnectionPage.vue:132-141`（header div）：

```vue
      <div class="connection-page__header">
        <h1 class="connection-page__title">连接管理</h1>
        <q-btn
          unelevated
          color="primary"
          icon="add"
          label="新建连接"
          @click="showNewDialog = true"
        />
      </div>
```

改为（删 h1，header div 保留——`.connection-page__header` 规则 `L211-215` 是 flex space-between，删 h1 后按钮独占靠右，结构不塌）：

```vue
      <div class="connection-page__header">
        <q-btn
          unelevated
          color="primary"
          icon="add"
          label="新建连接"
          @click="showNewDialog = true"
        />
      </div>
```

- [ ] **Step 2: 删 scoped .connection-page__title 规则**

`rewrite/src/pages/ConnectionPage.vue:217-223`：

```scss
.connection-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
  margin: 0;
}
```

**整段删除**（含前后空行调整，保持 scoped 块整洁）。`.connection-page__header`（`L211-215`）保留（仍被 template 引用）。

### Step 4b: HomePage 删 H1

- [ ] **Step 3: 删 template 里的 h1 + 包裹 div**

`rewrite/src/pages/HomePage.vue:131-137`（header）：

```vue
      <!-- Header -->
      <div class="home-page__header gap-4">
        <div>
          <h1 class="home-page__title m-0">运行总览</h1>
        </div>
        <q-btn flat round icon="refresh" aria-label="刷新" @click="refreshData" />
      </div>
```

改为（删 h1 + 它的包裹 `<div>`——这个 div 只为承载 h1，删 h1 后 div 无用一并删；header 保留刷新按钮）：

```vue
      <!-- Header -->
      <div class="home-page__header gap-4">
        <q-btn flat round icon="refresh" aria-label="刷新" @click="refreshData" />
      </div>
```

- [ ] **Step 4: 删 scoped .home-page__title 规则**

`rewrite/src/pages/HomePage.vue:224-229`：

```scss
.home-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
}
```

**整段删除**。`.home-page__header`（`L212-216`）+ 响应式 `.home-page__header`（`L346-348`）保留（仍被 template 引用）。

- [ ] **Step 5: 类型检查 + lint**

Run: `pnpm --prefix rewrite exec vue-tsc --noEmit`
Expected: 0 错。

Run: `pnpm --prefix rewrite lint`
Expected: 0 新增 error（删 h1 不引入新代码）。

- [ ] **Step 6: Commit**

```bash
git -C "D:\code\frontend\dongfanghong" add rewrite/src/pages/ConnectionPage.vue rewrite/src/pages/HomePage.vue
git -C "D:\code\frontend\dongfanghong" commit -m "refactor(ui): ConnectionPage/HomePage 删碍事 H1（drawer 已标当前页）+ 清 scoped title 规则 [S012]"
```

---

## Task 5: 整体验证 + 落档

> 这个 Task 不改代码，是 spec §8/§10 验证阈值 + H010「完成后必须做」。

- [ ] **Step 1: 全量 lint**

Run: `pnpm --prefix rewrite lint`
Expected: 0 新增 error（baseline 6 pre-existing 无关，可对比 Task 1-4 各自跑的结果）。

- [ ] **Step 2: 全量类型检查**

Run: `pnpm --prefix rewrite exec vue-tsc --noEmit`
Expected: 0 错（改动文件相关）。

- [ ] **Step 3: grep 验证 C4 合规（HistoryPage 0 inline style）**

Run（PowerShell/git-bash 语法，确认 HistoryPage 无残留 inline style 消费 token）:
```bash
git -C "D:\code\frontend\dongfanghong" grep -n "style=" -- rewrite/src/pages/HistoryPage.vue
```
Expected: 空输出（Task 2 删了 q-page + 左栏两处 inline style，无新增）。

- [ ] **Step 4: 实测（dev server）**

Run: `pnpm --prefix rewrite dev`
逐项确认：
1. **drawer**：9 项顺序正确（总览/连接/帧定义/帧发送/**任务管理**/实时测试/**历史分析**/指令接入/**系统设置**），新增 2 项 icon `o_analytics`/`o_settings` 正常显示，点击跳转 `/history` `/settings` 正常。
2. **HistoryPage**：左右栏 gap-6 间距 + p-6 边缘 padding 正常；左栏卡片化（rw-panel-base 圆角背景）；图表数量 rw-segmented 分段控件 1/2/3/4 点击切换正常；图表区滚动正常；导出 CSV 按钮可用。
3. **FrameListPage**：正常模式 actions（新建/导入/导出/批量管理）正常；点「批量管理」进入批量模式后顶部 actions 替换为（删除选中 / N项已选中 / 退出批量模式），表格上方无独立 bar；勾选行后「删除选中」可用，二次确认弹窗正常；「退出批量模式」回到正常 actions。
4. **ConnectionPage**：顶部无 H1「连接管理」，只剩「新建连接」按钮靠右；其余连接卡片/串口网口分区正常。
5. **HomePage**：顶部无 H1「运行总览」，只剩刷新按钮；Metrics / 快速入口正常。

- [ ] **Step 5: 落档 S012 session note**

新建 `.sessions/2026-06-10-ui-feature-bugs/S012-global-ui-governance.md`，用 session-governance S### 模板（目标 / 记录 / 决策引用 / 范围确认 / 后续）。内容要点：
- 触发 H010（用户"不少地方不好看"）
- brainstorm 收窄：HistoryPage 全治 + FrameListPage 仅批量上移（用户"别的不咋想管"）+ 删 H1 + drawer 补导航
- 实施记录（Task 1-4 改动概要）
- 无 D###（纯 UI，延用 S010 样板）
- 验证：lint 0 新增 + tsc 0 错 + 实测 5 项
- 后续：DisplayPage 组件化 / SettingsPage·FrameEditorPage 边角清理 / FrameListPage 剩余视觉问题 / drawer icon 统一（拆独立小轮）

- [ ] **Step 6: 更新 topic-index + registry + voice**

- `topic-index.md`：进展线索加 S012 条；最后更新行 + 当前位置改为 S012。
- `_registry.yaml`：`2026-06-10-ui-feature-bugs` 的 `last_updated` 改 `2026-06-23`，description 末尾追加 S012 一句。
- `voice.md`：`## 2026-06-23` 段追加（和 H009/H010 同日期）：
  - "然后是不是最好还有一个，去把别的那些页面都搞搞？感觉不少地方不好看。我指的是大块的分布，以及边角的零碎的分布" → H010/S012
  - [AskUserQuestion 选]"体检 + 改最刺眼的几个" → H010
  - "帧定义还好，我只打算把批量模式的那些玩意扔到最顶上那条，别的不咋想管" → S012（收窄 FrameListPage 范围）
  - "目前历史页左侧索引没加，系统管理也是" → S012（加 drawer 导航项）
  - "把任务放到发送和测试中间" → S012（drawer 重排）
  - "我懒得看，你直接做吧。别忘了规范，别给我拉屎就行" → S012（放弃 spec review gate + 质量硬要求）

- [ ] **Step 7: 最终 commit（落档）**

```bash
git -C "D:\code\frontend\dongfanghong" add .sessions/2026-06-10-ui-feature-bugs/S012-global-ui-governance.md .sessions/2026-06-10-ui-feature-bugs/topic-index.md .sessions/_registry.yaml .sessions/2026-06-10-ui-feature-bugs/voice.md
git -C "D:\code\frontend\dongfanghong" commit -m "docs(session): S012 全局 UI 治理落档 + voice [S012]"
```

**不 push，不碰 `_archive-legacy/`。**

---

## Self-Review（plan 写完后自查）

**1. Spec coverage**（逐条 spec 对照）：
- spec §2 改动 1（HistoryPage 4 子项 1a/1b/1c/1d）→ Task 2 Step 2a-2d ✓
- spec §3 改动 2（FrameListPage 替换式）→ Task 3 Step 3a-3d ✓
- spec §4 改动 3（删 H1）→ Task 4 Step 4a-4b ✓
- spec §5 改动 4（drawer）→ Task 1 ✓
- spec §6 不变量 → 各 Task 背景说明 + Step 验证 ✓
- spec §8 验证阈值 → Task 5 Step 1-4 ✓
- spec §10 落档 → Task 5 Step 5-7 ✓
- spec 明确不做项（FrameListPage 其他视觉/DisplayPage/SettingsPage）→ 各 Task 背景明确"不动"，无任务触及 ✓

**2. Placeholder scan**：无 TBD/TODO/"适当处理"。所有 code step 含完整代码。✓

**3. Type consistency**：
- `exitBatchMode(): void` 定义（Task 3 Step 1）与 template 引用 `@click="exitBatchMode"`（Step 3）一致 ✓
- `toggleBatchMode(): void` 定义（Step 1）与 `@click="toggleBatchMode"`（Step 2/3）一致 ✓
- `CHART_COUNT_OPTIONS` 定义（Task 2 Step 4）与 `v-for="opt in CHART_COUNT_OPTIONS"` + `opt.value`/`opt.label`（Step 5）属性名一致 ✓
- `handleChartCountChange(opt.value)` 签名 `(count: number)`（HistoryPage.vue:38 现状）与 `opt.value: number`（1/2/3/4 字面量）一致 ✓
- `navigationItems` 数组项 shape `{ label, to, icon }` 与 AppNavigation.vue `AppNavigationItem` 接口（label/to/icon required）一致 ✓

无类型不一致。
