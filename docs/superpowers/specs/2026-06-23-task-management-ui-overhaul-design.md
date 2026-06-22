---
doc_type: design-spec
topic: task-management-ui-overhaul
date: 2026-06-23
status: approved-pending-implementation
session: S011
related:
  - rewrite/src/pages/TaskManagePage.vue
  - rewrite/src/features/task/components/TemplateListPage.vue
  - rewrite/src/features/task/components/ExecutionListPage.vue
  - rewrite/src/features/task/composables/use-template-editor.ts
  - rewrite/src/features/task/composables/use-task-editor.ts
  - rewrite/src/features/task/composables/use-task-list.ts
  - rewrite/src/features/task/composables/use-task-monitor.ts
  - rewrite/src/widgets/TaskExecutionDetail.vue
  - docs/superpowers/specs/2026-06-22-command-ingress-page-ui-overhaul-design.md
  - docs/superpowers/specs/2026-06-19-sendpage-ui-redesign-design.md
---

# 任务管理页(TaskManagePage)UI 重做

## 1. 背景与问题

用户原话(2026-06-23, S010 收尾时):"我打算开个新对话,把任务管理那边也改一下?我感觉那边也丑"。经 brainstorm 澄清,核心不满是**三类**:

| # | 问题 | 现状 |
|---|------|------|
| F1 | **左右栏贴死/右栏窄** | 执行监控页右栏 `w-[360px]` 写死 + `rw-divider-l` 1px 细线贴死无 gap,窄屏挤压左表(与用户抱怨的 SCOE 列表同款通病) |
| F2 | **缺总览/全是表格** | 活动任务数、运行中、进度、历史汇总等全是表格列,没有一眼总览的 KPI/卡片 |
| F3 | **整体平淡/灰扑扑** | Quasar 原生组件堆砌、默认下划线 tab、H1「任务管理」碍事(左侧导航已标当前页),无设计感 |

**用户未选的痛点(确认不做)**:"三层 tab 太绕"——用户明确选**保留 tab 嵌套结构**,只换分段控件样式,不重组信息架构。

### 明确不含(本次不做)

- **不重组信息架构/导航结构**:TaskManagePage 一级 tab「模板管理 / 执行监控」+ ExecutionListPage 二级 tab「活动任务 / 历史记录」**结构保留**,只换皮(分段控件)。
- **不动 4 个 composable 的 API**:`use-template-editor`/`use-task-editor`/`use-task-list`/`use-task-monitor` 的 return 签名零改动。
- **不统一 ExecutionListPage 用 use-task-monitor**:用户明确"不过记住这个,后面开新对话看"——本次保留 ExecutionListPage 自实现的 monitor 逻辑(`selectedInstance`/`selectedProgress`/`selectedDisplayStatus` 等 computed),**逻辑重构单独开任务**。
- **不动 task core / services 业务逻辑**:纯 UI 重做,只动消费方(模板 + 组件拆分)。
- **不动 TaskExecutionDetail.vue 的滚动修复**:S009 续接5 用户亲改(no-wrap + 右栏 h-full),本次不碰,除非用户明确要求。
- **不补功能**:批量操作扩展、任务管理的某个缺失功能等不在本次范围——brainstorm 时已确认"只做 UI 重做"。

## 2. 不变量与约束

- **样式基线**:颜色/背景/边框/阴影/间距/圆角/字体层级必须走 `--rw-*` token 或 `rw-*` 语义 class;禁 inline `style="color: var(--rw-...)"`;禁 `style="width: Npx"` 硬编码像素(C4)。UnoCSS 只承担结构性 utility(`min-h-0`、`overflow-*`、`flex` 等)。
- **边缘 padding 硬约束(用户强调)**:所有容器边缘必须有 padding,内容不贴边——横向容器(toolbar/KPI bar/表格)左右 padding;纵向容器(左右栏/卡片堆)上下 padding。具体值对齐 SendPage/S010 的 `p-3`/`px-3`/`py-3`。
- **左右分栏不贴死**:父容器加 `gap-6`(或等价 token 间距),**不用 `rw-divider-r/l` 1px 细线贴死**。列表栏 `flex-1 min-w-0`(min-w-0 防表格列累加撑破)。
- **高度链范式**:沿用 `SendPage.vue` / `DisplayPage.vue` / `CommandIngressPage.vue` 验证过的模式(`q-page flex flex-col h-full` + scoped `min-height: 0` + 关键节点 `flex-1 min-h-0`)。DataTable 用 `container-height="100%"`(D007 flex 撑开陷阱解法),**禁用 `calc(100vh - Npx)` magic number**(现状 TemplateListPage/ExecutionListPage 都用了 200/280)。
- **L4 精确加**:不预防性堆 `flex-1 min-h-0 overflow-hidden`,只在滚动边界(表格/可滚动区/分栏容器)补足,普通布局用 `w-full`/`h-full`。
- **4 个 composable API 零改动**。
- **路由不变**:TaskManagePage 仍是 AppShell 下的 page,路径 `/tasks`。
- **删除二次确认**(Q5):`$q.dialog` + cancel,不用 `window.confirm`。
- **禁空 catch**(O2)。
- **状态色走 StatusBadge + statusMap**(V3):TASK_STATUS_MAP 已存在,继续用;新增 KPI bar 的状态分布也走同一映射。

## 3. 设计

### 3.1 顶部 toolbar(地基,消灭双行头)

**方案 A(已选定)**:极简单行 toolbar——去 H1,一级分段控件 + 按 tab 动态切换的操作按钮,全部一行约 48px。

```
┌─────────────────────────────────────────────────────────────────────┐
│ px-3                                                              px-3│
│  [模板管理][执行监控]                            [按 tab 切换的操作按钮] │
│  ↑ 一级分段控件 rw-segmented(左)              ↑ 按 activeTab 渲染(右) │
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- **砍掉 H1「任务管理」**。左侧导航(AppShell)已标当前页,顶部不再重复(与 S010 一致)。
- 外层 q-tab 换成**一级分段控件**(`rw-segmented`)。
- 操作按钮**按当前 tab 动态切换**:
  - `templates` → `[新建模板][编辑][导入][导出][批量管理]`(原 TemplateListPage 的 TableToolbar actions)
  - `executions` → `[从模板创建][空白任务][全部停止][批量管理]`(原 ExecutionListPage 的 TableToolbar actions)
- 整个 toolbar 一行,左右各 `px-3` padding,底部 `rw-divider-b` 分隔。
- **搜索框保留在 toolbar 内**(与 §4.3 `TaskManageToolbar` 的 `searchText` prop 一致)——紧凑布局,搜索随 tab 切换作用域。

**这是相对当前最大的功能行为变化**(按钮按 tab 渲染),但**不动 composable API**——只是 page 模板根据 `activeTab` 渲染不同按钮组,handler 函数不变。

### 3.2 模板管理页(Tab1)

**方案 A(已选定)**:单表全屏,token 化 + 卡片化优化,**不加 KPI bar**(模板是静态资源,无实时状态,KPI 意义不大)。

```
┌─────────────────────────────────────────────────────────────────────┐
│ py-3                                                              py-3│
│                                                                      │
│  (DataTable 占满全宽, container-height="100%", flex 高度链)           │
│                                                                      │
│  名称 | 来源模板 | 调度类型 | 默认发送目标 | 标签 | 更新时间 | 操作     │
│  ─────────────────────────────────────────────────────────────      │
│  ...                                                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- 砍掉当前 TemplateListPage 自带的 TableToolbar(顶部 toolbar 已统一接管搜索 + actions)。
- 主体 DataTable:行 hover/selected 走 `--rw-color-surface-selected`,标签 chip 走 token 化(现状 `color="grey-3" text-color="grey-8"` 硬编码 → 走 `rw-text-*` 或 Quasar brand `grey`)。
- `container-height` 从 `calc(100vh - 200px)` 改为 `"100%"`(走 flex 高度链,D007)。
- 批量模式工具条(批量删除/设置发送目标)保留,token 化 + 卡片化样式。
- 模板编辑 dialog(`rw-dialog-xl`)**拆成独立组件** `templates/TemplateEditDialog.vue`,不内联在 page。
- 批量设置发送目标 dialog 拆 `templates/BatchSetTargetDialog.vue`(两页共用,见 §4)。

### 3.3 执行监控页(Tab2)

**方案 A(已选定)**:顶部 KPI bar + 下为左右分栏(列表 + 详情)。KPI bar 在上,主区纵向空间被 KPI bar 压缩一点(KPI bar 约 48-60px,可接受)。

```
┌─────────────────────────────────────────────────────────────────────┐
│ px-3                                                              px-3│
│  活动 5  运行中 2  暂停 1  待启动 2  │ 历史 完成 12  失败 3          │
│  ↑ KPI bar(单行紧凑 label: value,左右 px-3,~48px)                  │
├─────────────────────────────────────────────────────────────────────┤
│ py-3                                                              py-3│
│ ┌──────────────────────────────┐  gap-6  ┌─────────────────────────┐│
│ │ 二级分段控件 rw-segmented--sub│         │ 任务详情(~400px)        ││
│ │ [活动任务][历史记录]          │         │ rw-panel-base 卡片       ││
│ │ 状态筛选 chip 行(可选保留)    │         │ ┌─────────────────────┐ ││
│ │ ────────────────────────────│         │ │ 任务名称 / 来源模板  │ ││
│ │ DataTable(列表)              │         │ │ 调度类型 / 步骤数    │ ││
│ │ 名称|模板|调度|目标|状态|进度|操作│     │ ├─────────────────────┤ ││
│ │ flex-1 min-w-0               │         │ │ TaskExecutionDetail  │ ││
│ │ container-height=100%        │         │ │ (运行态/created 态)  │ ││
│ │                              │         │ └─────────────────────┘ ││
│ └──────────────────────────────┘         └─────────────────────────┘│
│  左栏 flex-1 min-w-0                         右栏 ~400px flex-shrink-0│
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- **新增 KPI bar**:单行紧凑「label: value」,左右 `px-3`,上下 `py-2`。指标:
  - 计数器(活动任务总数 / 运行中 / 暂停 / 待启动):从 `activeRows` 聚合
  - 历史(已完成数 / 失败数):从 `historyRows` 聚合
  - label 走 `--rw-color-text-muted`,value 走 `--rw-color-text-primary`
  - 实施时定具体项数(5-6 项一行紧凑排列,`flex` + `gap`)
- **二级 tab 换分段控件**:`rw-segmented--sub`(视觉重量弱于一级)。
- 状态筛选 chip 行:保留但 token 化(现状 `color="primary"/"grey-4"` 硬编码 → Quasar brand 或 chip 样式优化)。实施时可考虑并入二级分段控件或保留独立行(实施时定,倾向保留独立行)。
- **右栏拓宽 + 加 gap**:`w-[360px]` → 约 400px(实施时实测确认宽度是否够放详情字段 + TaskExecutionDetail);**去 `rw-divider-l` 贴死细线**,父容器加 `gap-6`。
- 左栏 `flex-1 min-w-0`(min-w-0 防表格列累加撑破)。
- 两个 DataTable 的 `container-height` 从 `calc(100vh - 280px)` 改为 `"100%"`(D007)。
- 任务详情区卡片化:created 态(手写)和运行态(调 TaskExecutionDetail)分别套 `rw-panel-base` 卡片壳。**TaskExecutionDetail 内部滚动修复保留**(no-wrap + 右栏 h-full),不动。
- 批量模式工具条(仅 active tab)保留,token 化。
- 任务编辑 dialog(`rw-dialog-xl`)拆 `executions/TaskEditDialog.vue`。
- 从模板创建任务弹窗拆 `executions/TemplatePickerDialog.vue`。
- 批量设置发送目标 dialog 复用 `templates/BatchSetTargetDialog.vue`(两页共用,见 §4)。

### 3.4 分段控件共享样式(复用 S010 已建)

S010 已新增 `rw-segmented`(一级)/ `rw-segmented--sub`(二级)到 `rewrite/src/css/layers/_utilities.scss`。本次**直接复用**,不重复定义。

- `.rw-segmented`——一级分段控件(标准字号,用于 TaskManagePage 顶部「模板管理 / 执行监控」)
- `.rw-segmented--sub`——二级分段控件(小字号 + 更浅填充,用于 ExecutionListPage「活动任务 / 历史记录」)

选中/未选中态、hover 态、圆角、间距全走 token(S010 已实现)。

## 4. 组件拆分

### 4.1 文件组织(沿用 S010 范式:components/ 下按 tab 语义分子文件夹)

```
features/task/components/
├─ (现有保留,扁平根目录)
│  ├─ task-columns.ts                (7 列,保留)
│  ├─ template-columns.ts            (7 列,保留)
│  ├─ history-columns.ts             (6 列,保留)
│  ├─ scheduleKindMap.ts             (保留,token 化颜色)
│  ├─ taskStatusMap.ts               (保留)
│  └─ task-labels.ts                 (保留)
│
├─ (step editors 保留在根目录,两页共用)
│  ├─ SendStepEditor.vue             (保留)
│  ├─ WaitConditionStepEditor.vue    (保留)
│  ├─ DelayStepEditor.vue            (保留)
│  └─ AdvancedConfigPanel.vue        (保留)
│
├─ templates/                        Tab1「模板管理」
│  ├─ TemplateList.vue               主体(单表全屏)
│  └─ TemplateEditDialog.vue         模板编辑弹窗(从 TemplateListPage 内联抽出)
│
├─ executions/                       Tab2「执行监控」
│  ├─ ExecutionList.vue              主体(KPI bar + 二级分段控件 + 左列表)
│  ├─ TaskDetailPanel.vue            右栏任务详情(卡片化,含 TaskExecutionDetail)
│  ├─ ExecutionKpiBar.vue            KPI bar(新增)
│  └─ TaskEditDialog.vue             任务编辑弹窗(从 ExecutionListPage 内联抽出)
│
└─ (跨 tab 共用)
   ├─ BatchSetTargetDialog.vue       批量设置发送目标弹窗(两页共用,抽出现有两份重复)
   └─ TemplatePickerDialog.vue       从模板创建任务弹窗(现 ExecutionListPage 内联)
```

**命名规范**(沿用 S010):
- 子文件夹用 tab 语义命名(`templates`/`executions`),不用通用名(`tabs/`)。
- 子文件夹内 .vue **不加 Task 前缀**(文件夹已隔离命名空间)。
- 跨 tab 共用的(`BatchSetTargetDialog.vue`/`TemplatePickerDialog.vue`)放 components 根目录。
- ts 数据文件(列定义/labels/statusMap)**保持扁平根目录不动**。
- step editors(SendStepEditor 等)**保留在根目录不动**(两页共用且与本次重做无关)。

### 4.2 TaskManagePage.vue 变薄壳

现状 49 行已经很薄,本次保持薄壳角色,只改顶部结构:
- 持有 `activeTab` 状态。
- 顶部 `<TaskToolbar>`(新建,或并入 page 模板):一级分段控件 + 按 tab 切换的 actions 按钮。
- 按 `activeTab` 渲染 `<TemplateList>` 或 `<ExecutionList>`。
- **不写 UI 细节**(无 KPI bar / 表格 / 卡片的具体模板)。
- 模板→执行 tab 切换逻辑(`onInstantiated`)保留。

**TaskToolbar 是否独立组件**:实施时定。倾向独立 `TaskManageToolbar.vue`(放根目录),因为顶部 toolbar 按 tab 切按钮的逻辑独立,且和 S010 的 CiToolbar 范式一致。若实施发现逻辑简单可直接内联在 page,不强求。

### 4.3 子组件职责边界

| 组件 | 职责 | 主要 props | 主要 emits |
|------|------|-----------|-----------|
| `TaskManageToolbar`(新建,实施时定是否独立) | 一级分段控件 + 按 tab 动态按钮 + 搜索 | `activeTab`, `searchText`, 各 tab 的 action 态(loading/selected) | `update:active-tab`, `update:search-text`, 各 action 事件 |
| `templates/TemplateList` | 模板单表全屏 | `rows`, `selectedRow`, `batchMode`, `batchSelectedRows` | `row-click`, `selection-change`, `new`/`edit`/`instantiate`/`delete`/`import`/`export`/`batch-*` |
| `templates/TemplateEditDialog` | 模板编辑弹窗 | `model-value`, `editor`(use-template-editor 实例) | `update:model-value`, `save` |
| `executions/ExecutionList` | KPI bar + 二级分段控件 + 左列表 | `activeRows`, `historyRows`, `selectedActiveRow`, `selectedHistoryRow`, `activeTab`, `statusFilter`, `batchMode`, KPI 数据 | `row-click`, `selection-change`, `start`/`pause`/`resume`/`stop`/`edit`/`remove`/`retry`/`clear-history`/`batch-*` |
| `executions/ExecutionKpiBar`(新增) | 任务计数 + 状态分布 KPI | `activeCount`, `runningCount`, `pausedCount`, `createdCount`, `historyCompletedCount`, `historyFailedCount`(或聚合 stats 对象) | 无(纯展示) |
| `executions/TaskDetailPanel` | 右栏任务详情卡片 | `instance`(selectedInstance), `progress`, `displayStatus`, `statusInfo`, `templateLabel` | `pause`/`resume`/`stop`/`edit`/`retry`/`remove` |
| `executions/TaskEditDialog` | 任务编辑弹窗 | `model-value`, `editor`(use-task-editor 实例) | `update:model-value`, `save`, `save-and-start` |
| `BatchSetTargetDialog`(共用) | 批量设置发送目标 | `model-value`, `targetId`, `selectedCount`, `scope`('template'\|'task', 控制文案差异) | `update:model-value`, `update:target-id`, `confirm` |
| `TemplatePickerDialog`(共用) | 从模板创建任务 | `model-value`, `rows`(templates), `search` | `update:model-value`, `pick` |

**props/emits 原则**:走 composable 的 return 签名,不新增业务逻辑。若某 composable 接口确实需要微调(如需暴露某个内部 ref 给子组件读),**先和用户确认**,不在本次擅自改。

## 5. 高度链

照搬 SendPage/S010 验证过的模式:

```
q-page.task-page (height 链根) — flex flex-col h-full + scoped min-height:0
├─ TaskManageToolbar (flex-shrink-0, ~48px)
└─ div.flex-1.min-h-0 (一级 tab 内容容器)
   ├─ Tab1「模板管理」:
   │  └─ templates/TemplateList
   │     └─ DataTable flex-1 min-w-0 container-height="100%"
   └─ Tab2「执行监控」:
      └─ executions/ExecutionList
         ├─ ExecutionKpiBar (flex-shrink-0, ~48px)
         ├─ 二级分段控件行 (flex-shrink-0, ~40px)
         └─ div.flex.flex-1.min-h-0 (主区分栏, gap-6)
            ├─ 左:二级 tab 内容(列表)
            │  └─ DataTable flex-1 min-w-0 container-height="100%"
            └─ 右:TaskDetailPanel w-[400px] flex-shrink-0 min-h-0
               └─ rw-panel-base 卡片(h-full + 内部 overflow-y-auto)
```

**关键约束**(L4 + S009 续接5 教训):不滥用 `flex-1 min-h-0 overflow-hidden`,只在关键节点(表格/可滚动区/分栏容器)补足,普通布局用 `w-full`/`h-full`。

## 6. 通病治理(沿用 S010 续接标准解法)

| 通病(现状) | 标准解法 | 现状出处 |
|------|---------|---------|
| 右栏 `w-[360px] rw-divider-l` 贴死无 gap | 父容器 `gap-6`,去 `rw-divider-l` | ExecutionListPage:580 |
| DataTable `container-height="calc(100vh - 200/280px)"` magic number | `container-height="100%"` + flex 高度链 | TemplateListPage:430 / ExecutionListPage:455,532 |
| Quasar 默认下划线 tab 难看 | `rw-segmented` / `rw-segmented--sub` 分段控件 | TaskManagePage:21 / ExecutionListPage:428 |
| 巨石单文件 page(753/832 行) | page 薄壳 + `components/{templates,executions}/` 子目录 | TemplateListPage / ExecutionListPage |
| dialog 内联在 page | dialog 各自独立组件 | 两 page 的编辑/模板选择/批量设置 dialog |
| Quasar 调色板硬编码(`color="grey-3" text-color="grey-8"` / `color="grey-4"`) | 走 `--rw-color-*` token 或语义 class | TemplateListPage:457 / ExecutionListPage:435 等 |
| 标签 chip 硬编码颜色 | token 化 + chip 样式优化 | TemplateListPage:457 |
| 预防性堆 `flex-1 min-h-0 overflow-hidden` | 按场景精确加,滚动边界才加 overflow+min-h-0 | (重做时避免重蹈) |

## 7. 实施方式

**用户明确指示(2026-06-23)**:本次实施**用 frontend-design skill**,不走 writing-plans 那套 spec→plan→execute。

> handoff 原预判"spec 定了就按 spec 实施,frontend-design 留给创意发散"被用户推翻。

- **brainstorm(文字)定方向** → 已完成(本 spec)
- **frontend-design 生成视觉实现** → 按 spec 在 S010 设计语言(`rw-segmented` + `rw-panel-base` + KPI bar + gap-6 + token 化)内做任务管理页
- **守 token 边界**:frontend-design 的输入约束为"在 S010 设计语言内,不超 token 体系",与用户选的"守 token,和 S010 同级"一致。

## 8. 验证

- `lint`:0 新增 error(baseline 有 6 个 pre-existing 无关,可接受)。
- `tsc`:0 错误。
- `task` 测试套件:不新增失败。
- 实测:`quasar dev -m electron` 打开任务管理页:
  - 顶部 toolbar:模板/执行两个 tab 切换,按钮按 tab 切换。
  - 模板管理页:单表 CRUD(新建/编辑/删除/实例化/导入/导出)+ 批量模式。
  - 执行监控页:KPI bar 计数正确;活动/历史二级 tab 切换;状态筛选;左列表行操作(启动/暂停/恢复/停止/编辑/删除/重试);右详情卡片(created 态/运行态/终态)滚动正常。
  - 弹窗:模板编辑、任务编辑、批量设置发送目标、从模板创建——都开一遍。
- diff 验证:4 个 composable 文件 + task core + TaskExecutionDetail 零改动(只动消费方)。

## 9. 风险与决策记录

| 决策 | 选择 | 理由 | 否决项 |
|------|------|------|--------|
| 顶部骨架 | 去H1 + 单行 toolbar + 按 tab 切按钮 | 省 H1 一行 + 按钮带上下文,与 S010/SendPage 一致 | 留 H1 占两行 / 合成单页 |
| tab 嵌套 | 保留 + 换皮(两级分段控件) | 用户明确"保留嵌套",不重组信息架构降低风险 | 拍平二级 tab / 合成单页 |
| KPI bar 位置 | 只执行页加,KPI 在上左右分栏在下 | 模板无实时状态不加;KPI 在上高度链清晰 | 两页都加 / KPI 进 toolbar 同行 |
| 右栏 | 拓宽 ~400px + gap-6 | 治"右栏窄/贴死"痛点,保留分栏 | 去右栏详情进弹窗 / 只加 gap 宽度不变 |
| 组件拆分 | components/{templates,executions}/ 子目录 + dialog 独立 | 沿用 S010 范式,治巨石单文件 | 不拆只改视觉 |
| 设计感度 | 守 token,和 S010 同级 | 用户明确"和 S010 同级" | 允许创意超 token / 加卡片视图切换 |
| monitor 逻辑统一 | **本次不做**,记后续新对话 | 用户明确"逻辑重构非纯 UI,单独开任务";handoff 不变量:composable API 零改动 | 顺手统一(超范围) |
| 实施方式 | frontend-design(用户指定) | 用户明确推翻 handoff 原预判 | writing-plans spec→plan→execute |
| TaskExecutionDetail 滚动修复 | 保留不动 | S009 续接5 用户亲改,本次不碰 | 重写(超范围) |

## 10. 落档

完成后:
- 新建 `.sessions/2026-06-10-ui-feature-bugs/S011-task-management-ui-overhaul.md`。
- 更新 `topic-index.md`(加 S011 条目 + 顶部"最后更新"行 + "当前位置"段)。
- 更新 `_registry.yaml` 的 `2026-06-10-ui-feature-bugs` `last_updated: 2026-06-23`。
- `voice.md` 加 `## 2026-06-23` 段,记 brainstorm 原话(痛点选择 / tab 保留 / 去 H1 / 右栏拓宽 / KPI 只执行页 / 守 token / 拆组件 / monitor 不做记后续 / 用 frontend-design)。
- git commit message 带 `[S011]`,拆 commit(feat 代码 + docs 落档)。
- **不要 push**(远程没通),**不要碰 `_archive-legacy/`**。

## 11. 范围控制提醒

- 实施时若发现需要补功能(任务管理的某个缺失功能、批量操作扩展),明确告知是范围扩张,建议拆后续任务,本次只做 UI 重做(除非用户坚持)。
- 若发现需要统一 ExecutionListPage 用 use-task-monitor(消除重复),这是逻辑重构非纯 UI,**单独确认 + 可能新建 D###**,不在本次顺手做(用户已记后续新对话)。
- TaskExecutionDetail 的滚动修复(S009 续接5)是用户亲改的,别在 UI 重做里动它,除非用户明确要求。
