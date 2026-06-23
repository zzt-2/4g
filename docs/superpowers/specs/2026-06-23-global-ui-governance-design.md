---
doc_type: spec
type: global-ui-governance-design
status: approved
date: 2026-06-23
session: S012
topic: 2026-06-10-ui-feature-bugs
handoff: H010-global-ui-governance-handoff.md
tags:
  - rewrite
  - frontend
  - ui
  - governance
---

# S012 全局 UI 治理设计（窄化版）

> 触发：H010 交接 + 用户原话"不少地方不好看，我指的是大块的分布，以及边角的零碎的分布"。
> brainstorm 收窄后范围：HistoryPage 全治 + FrameListPage 仅批量模式上移 + 两页删 H1 + drawer 补导航项。
> 纯 UI，不动 composable/service/core API，不动路由。

---

## 1. 范围（brainstorm 已定，本节是合同）

| # | 改动 | 文件 | 深度 |
|---|------|------|------|
| 1 | HistoryPage 视觉治理 | `rewrite/src/pages/HistoryPage.vue` | 完整（4 子项） |
| 2 | FrameListPage 批量模式控件移到顶部 toolbar（替换式） | `rewrite/src/pages/FrameListPage.vue` | 单点 |
| 3 | ConnectionPage / HomePage 删碍事 H1 | `HistoryPage.vue` 同级两页 | 最小 |
| 4 | 左侧 drawer 补导航项 + 任务上移 | `rewrite/src/app/AppShell.vue` | 单常量数组 |

**明确不做**（用户原话"别的不咋想管"/"帧定义还好"）：
- FrameListPage 的分栏贴死、`container-height` magic number、调色板硬编码、筛选 chip —— **不在本轮**。
- DisplayPage 716 行巨石组件化 —— 拆后续单独对话（H010 已记）。
- SettingsPage / FrameEditorPage 边角清理 —— 拆后续批量对话。
- 各 page 的 composable / service / core API —— 零改动。

---

## 2. 改动 1：HistoryPage 视觉治理

### 现状刺眼点（已验证）

| # | 问题 | 现状位置 | 违反 |
|---|------|---------|------|
| 1a | 左右分栏贴死无 gap | `L86` `<div class="flex h-full">` 左 `w-80`（`L88`）+ 右 `flex-1`（`L114`），中间 `rw-divider-l` 1px 细线贴死 | S010 续接通病 |
| 1b | `<q-page style="background:...">` inline token | `L85` | C4 |
| 1c | 左栏 `style="min-width: 280px"` inline 像素 | `L88` | C4 |
| 1d | `q-btn-toggle` 旧式（图表数量） | `L118` | S010 rw-segmented 范式 |

### 改造方案

**1a. 分栏 gap-6（S010 续接通病标准解法）**
- 父容器 `L86` `<div class="flex h-full">` → `<div class="flex h-full gap-6 p-6">`（加 gap-6 + 外层 p-6 边缘 padding 硬约束）
- 左栏 `L88` 去 `rw-divider-l`（不再用 1px 细线贴死），保留 `w-80 flex flex-col overflow-hidden`，加 `rw-panel-base rounded`（左栏整体卡片化）
- 左栏 `style="min-width: 280px"`（1c）删除 —— `w-80`=320px 已够，min-width 是冗余 magic
- 右栏 `L114` 保留 `flex-1 flex flex-col overflow-hidden`，右栏内部顶 bar + 图表区不动结构

> **L4 检查**：父 `flex h-full gap-6 p-6`（无预防性堆叠）。左栏 `overflow-hidden`（内部子组件各自管滚动，左栏是裁剪层，符合 L4"中间传递层用 overflow-hidden"）。右栏 `flex-1 ... overflow-hidden` 是滚动容器边界，其内部 `flex-1 overflow-auto`（`L132`）才是真滚动边界——保持现状。左栏 `min-h-0` 不加（左栏不滚，内部 HistoryTimeSelector/HistoryDataSelector 各自管），右栏 `overflow-hidden` 已够。

**1b. q-page inline style → scoped class**
- `L85` `<q-page class="min-h-full" style="background: var(--rw-color-surface-app)">` → `<q-page class="history-page min-h-full">`
- 加 scoped style：`.history-page { background: var(--rw-color-surface-app); }`
- 写法对齐 FrameListPage 现有 `.frame-list-page { background: ... }`（`FrameListPage.vue:424`）—— 同页同范式，O3 复用。

**1c. 见 1a**（删 `min-width:280px`）。

**1d. q-btn-toggle → rw-segmented**
- `L118-124` 的 `<q-btn-toggle>` 替换为 rw-segmented 分段控件，照搬 S010 `CiToolbar.vue:54-66` 范式：

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

- 模块级常量（O4，照搬 CiToolbar `TABS` 范式）：

```typescript
const CHART_COUNT_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
] as const;
```

- `handleChartCountChange` 复用现成（`L38`），签名已是 `(count: number)`，无需改逻辑。

**保留不改**：
- `CHART_HEIGHTS`（`L52-57`，420/340/280/240px）—— 图表运行时高度计算，非颜色/间距视觉 token。T2 明确"px 值用于 API/尺寸要求不视为硬编码违规"，图表高度同理。保留。
- 右栏图表卡片结构、统计 overlay、WaveformChart 调用 —— 不动。
- 两个 dialog（CSVExportDialog / ChartConfigDialog）—— 不动。

### 改动后 HistoryPage 视觉

```
┌─────────────────────────────────────────────────────┐
│ q-page.history-page (p-6)                            │
│ ┌───────────┐  gap-6  ┌────────────────────────────┐│
│ │ 左栏 w-80  │         │ 右栏 flex-1                ││
│ │ rw-panel-  │         │ ┌────────────────────────┐ ││
│ │ base 卡片  │         │ │ 顶bar: 图表数量        │ ││
│ │            │         │ │ [1][2][3][4] rw-segmtd │ ││
│ │ 时间选择器  │         │ │   ...N条记录·M项选中   │ ││
│ │ ─────────  │         │ ├────────────────────────┤ ││
│ │ 数据选择器  │         │ │ 图表区 flex-1 滚动     │ ││
│ │            │         │ │  ┌─卡片─┐ ┌─卡片─┐    │ ││
│ │ 导出CSV btn│         │ │  └──────┘ └──────┘    │ ││
│ └───────────┘         │ └────────────────────────┘ ││
│                       └────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## 3. 改动 2：FrameListPage 批量模式上移（替换式）

### 现状

两处批量相关 UI：
- `L301-310` 顶部 toolbar actions slot 里的「批量管理」切换按钮 —— **保留**。
- `L319-338` 内容区表格上方**独立 batch-mode toolbar**：含「删除选中」(`L321-329`) + 「N 项已选中」(`L330`) + spacer + 「退出批量模式」(`L332-337`)。

用户意图：把后者扔到顶上去，删掉内容区这条独立 bar。

### 改造方案（A. 替换式，已定）

进入批量模式后，**顶部 toolbar 的 actions slot 整组替换**为批量操作组：

```vue
<template #actions>
  <template v-if="batchMode">
    <!-- 批量模式：替换式 actions -->
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
    <!-- 正常模式：原 actions（新建/导入/导出/批量管理）原样保留 -->
    ... 原 L272-311 ...
  </template>
</template>
```

- **删除** `L319-338` 的独立 batch-mode toolbar 整块。
- 抽 `exitBatchMode()` 函数（O3，`batchMode=false; batchSelectedRows=[]` 现在出现在两处：`L309` 切换按钮 + 原 `L336` 退出按钮；提取后两处共用），签名 `(): void`。
- 进入批量模式按钮 `L301-310` 的 click handler `batchMode = !batchMode; batchSelectedRows = []; selectedFrameIds = []` 也走 `exitBatchMode` 或新 `toggleBatchMode`（O3 提取，避免重复逻辑）。

> **注意**：`batchMode` 下 `selectedFrameIds = []` 清空是为了切回单选时不残留选中。`exitBatchMode` 必须 `batchMode=false; batchSelectedRows=[]`；`toggleBatchMode` 进入时额外 `selectedFrameIds=[]`。两个语义不同，分别提取，不混。

### 改动后顶部 toolbar（批量模式）

```
┌──────────────────────────────────────────────────────┐
│ [搜索框] [接收][发送][★]    | [🗑删除选中] N项已选中  [退出批量]│
└──────────────────────────────────────────────────────┘
```

正常模式不变。表格区上方不再有独立 bar，表格直接撑满。

### 保留不改（明确不做）

- 分栏贴死、`container-height="calc(100vh-160px)"` magic、`w-[320px]` 任意值、调色板硬编码 chip/button、筛选 chip 三态 —— **全不动**（用户"别的不咋想管"）。

---

## 4. 改动 3：ConnectionPage / HomePage 删 H1

### ConnectionPage

- `ConnectionPage.vue:133` `<h1 class="connection-page__title">连接管理</h1>` → 删除。
- 对应 scoped style `.connection-page__title`（如有）一并清。
- 删后 header 容器只剩「新建连接」按钮。若 header 容器因此空 flex，调整 header 容器结构（保留按钮 + spacer 对齐，按钮靠右或靠左按现状）。

### HomePage

- `HomePage.vue:134` `<h1 class="home-page__title m-0">运行总览</h1>` → 删除。
- 对应 scoped style `.home-page__title`（如有）一并清。
- 删后 header 容器只剩刷新按钮（`L136`）。header 容器调整同上。

> AppShell drawer 已标当前页名（通病标准解法 S010），page 顶 H1 重复碍事。不补子标题（用户"还行"，对齐 CommandIngressPage 无 H1 样板）。

---

## 5. 改动 4：drawer 补导航项 + 任务上移

### 现状

`AppShell.vue:15-23` `navigationItems` 7 项，漏 `/history` 和 `/settings`，且任务管理位置靠后。

### 改造方案

新数组（9 项，照搬现有 `{ label, to, icon }` 结构 + `as const`）：

| # | label | icon | to | 变动 |
|---|-------|------|----|------|
| 1 | 总览 | dashboard | / | — |
| 2 | 连接管理 | link | /connection | — |
| 3 | 帧定义 | view_agenda | /frames | — |
| 4 | 帧发送 | send | /send | — |
| 5 | 任务管理 | assignment | /tasks | **上移**（原 6） |
| 6 | 实时测试 | monitor_heart | /display | — |
| 7 | 历史分析 | o_analytics | /history | **新增** |
| 8 | 指令接入 | settings_input_antenna | /command-ingress | — |
| 9 | 系统设置 | o_settings | /settings | **新增** |

- 逻辑流：总览→连接→帧定义/发送→**任务（组织发送）**→实时测试→**历史分析（看测试数据）**→指令接入（独立子系统）→系统设置（沉底）。
- **icon 一致性说明**：现有 7 项用陈旧实心名（`dashboard`/`link`/...，历史遗留）。新增 2 项用项目现代惯例 **Material Symbols outlined `o_` 前缀**（与 command-ingress/frame 等新 feature 代码一致，见 `CiToolbar`/`FrameFieldList` 等 30+ 处）。**本轮不顺手统一现有 7 项**（避免改动现有视觉、控范围），只让新项走现代规范；后续可在独立小轮统一 drawer 图标风格。新项 icon：`o_analytics`（历史分析，趋势感）、`o_settings`（系统设置，惯例齿轮）。
- `AppNavigation.vue` 子组件不动（已泛型，items prop 透传）。

---

## 6. 不变量（照搬 H010，全部遵守）

1. **composable/service/core API 零改动**：纯 UI。`useHistoryData`、`frameService`、`displayService` 等不动。
2. **路由不变**：10 个 page 路由（`routes.ts`）不动。改动 4 只动 drawer 数据源，不动 routes。
3. **token 系统（C4）**：0 inline `style="...var(--rw-color-...)"` / `style="...Npx"`。改动 1b/1c 直接消除两处违规。
4. **边缘 padding 硬约束**：HistoryPage 父容器 `p-6`（改动 1a）。其他页现状已有 padding，不破坏。
5. **Quasar 调色板**：新增代码走 brand（primary/negative）+ 语义 class（rw-text-desc）。FrameListPage 现有硬编码本轮不动（明确不做）。
6. **删除二次确认（Q5）**：FrameListPage 批量删除 `$q.dialog`（`L57`）保留，不动。
7. **禁空 catch（O2）**：本轮无新 catch。
8. **AppShell 布局别破坏**：改动 4 只加数组项，不动 AppShell 高度链/drawer 结构/windowControl 逻辑。

---

## 7. 规范合规对照（quickref 绝对禁止逐条）

| 禁止项 | 本设计处理 |
|--------|-----------|
| `catch {}` 空吞 | 无新 catch（O2 ✓） |
| `style="...var(--rw-color-...)"` inline | 改动 1b 删除，新增 0 处（C4 ✓） |
| `style="width: Npx"` 硬编码 | 改动 1c 删除 `min-width:280px`，新增 0 处（C4 ✓） |
| `v-for :key="i"` | rw-segmented 用 `:key="opt.value"`（P6 ✓）；HistoryPage 现有 v-for 已用稳定 key |
| 组件超 300 行不拆 | HistoryPage 187 行、FrameListPage 427 行（本轮不增行数，删多于加）；本轮不涉及拆分（用户明确不要组件化） |
| 选项数组写在 setup 内 | `CHART_COUNT_OPTIONS` 放模块级（O4 ✓） |
| 同一逻辑 2+ 处不提取 | FrameListPage `exitBatchMode`/`toggleBatchMode` 提取（O3 ✓） |
| `any` 类型 | 无（D6 ✓） |
| 预防性堆 flex-1 min-h-0 overflow-hidden | 改动 1a 按 L4 精确加，不堆叠（L4 ✓） |

---

## 8. 验证阈值

| 验证项 | PASS 标准 | 阈值来源 |
|--------|----------|---------|
| `pnpm lint` | 0 新增 error（baseline 6 pre-existing 无关） | H010 / 全局 baseline |
| tsc（改动文件） | 0 错 | 全局 |
| 改动页面相关测试 | 全过（HistoryPage 无单测；FrameListPage 无单测；AppShell 无单测——预期无测试影响） | — |
| grep inline style 违规 | HistoryPage 0 处 `style="`（改动 1b/1c 后）；FrameListPage/ConnectionPage/HomePage 现状不动不查 | C4 |
| 实测 | dev server 打开 4 改动页 + drawer 切 9 项，视觉/交互/滚动正常 | H010 完成清单 |

---

## 9. 风险 & 边界

| 风险 | 概率 | 处理 |
|------|------|------|
| FrameListPage 替换式 actions 在批量模式下搜索/筛选区是否还可用 | 低 | 保留 filters slot 不动，只替换 actions slot，搜索/筛选区不受影响 |
| HistoryPage 父容器加 p-6 后图表区高度链是否仍正常 | 中 | 右栏 `flex-1 overflow-hidden` + 内部 `flex-1 overflow-auto` 已是 S010 验证过的链路；p-6 只动外层 padding，不破高度链。实测确认 |
| drawer 加 2 项后纵向是否溢出 | 低 | 现有 7 项 + 2 = 9 项，drawer 有滚动兜底；视觉确认 |
| ConnectionPage/HomePage 删 H1 后 header 结构塌 | 低 | header 容器 flex，删 H1 后按钮独占，实测调整对齐 |

---

## 10. 落档（实施完成后，不在本轮 brainstorm 产出）

实施完后按 H010「完成后必须做」：
1. 跑 `pnpm lint` + 改动文件 tsc + 实测。
2. 新建 `.sessions/2026-06-10-ui-feature-bugs/S012-global-ui-governance.md`。
3. 更新 `topic-index.md`（加 S012 + 最后更新行 + 当前位置）+ `_registry.yaml` last_updated + `voice.md`（2026-06-23 段）。
4. git commit message 带 `[S012]`，拆 commit。
5. 不 push，不碰 `_archive-legacy/`。

---

## 决策引用

- 无新 D###（纯 UI 治理，不动架构/接口/不变量，与 S010 同性质）。
- 延用 D003（子组件单次 emit）—— 本轮 HistoryPage rw-segmented 是原生 button 非 v-model 子组件，不触发；但保留原则。
- 延用 S010 样板（rw-segmented / gap-6 分栏 / 去 H1 / container-height="100%"）—— 本轮直接复用视觉模式。

## 范围确认

- 本轮是否在 ui-feature-bugs 专题边界内：**是**（专题目标是 UI 集中修复，全局治理是其直接延伸）。
- 是否违反"明确不含"：专题无"明确不含"段；H010 列的"DisplayPage 拆后续 / 不顺手做"本轮遵守（不动 DisplayPage）。
