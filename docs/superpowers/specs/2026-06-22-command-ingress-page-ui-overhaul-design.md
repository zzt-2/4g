---
doc_type: design-spec
topic: command-ingress-page-ui-overhaul
date: 2026-06-22
status: approved-pending-implementation
session: S010
related:
  - rewrite/src/pages/CommandIngressPage.vue
  - rewrite/src/features/command-ingress/composables/use-scoe-config.ts
  - rewrite/src/features/command-ingress/composables/use-scoe-monitor.ts
  - rewrite/src/features/command-ingress/composables/use-test-tool.ts
  - rewrite/src/features/command-ingress/composables/use-central-docking.ts
  - rewrite/src/pages/SendPage.vue
  - docs/superpowers/specs/2026-06-19-sendpage-ui-redesign-design.md
---

# CommandIngressPage(指令接入页)UI 重做

## 1. 背景与问题

用户原话:"我对于指令接入那一整个页面,都不咋满意(大体上的 UI,具体二级 tab 再说)"。经 brainstorm 澄清,核心不满是**两类**:

| # | 问题 | 现状 |
|---|------|------|
| F1 | **布局/空间利用差** | 顶部 H1 + 4 按钮 + tab 行占三行;Tab1 的 5×2 统计卡片网格占满顶部约 200px,挤压表格纵向空间 |
| F2 | **视觉缺乏设计感** | Quasar 原生组件直接堆砌,无卡片化/分区/视觉层次,整体灰扑扑平淡;tab 难看;大标题碍事 |

具体刺眼点(用户补充):
- 顶部 H1「指令接入」碍事(左侧导航已标当前页)
- 顶部 4 个按钮(连接/断开/加载·卸载/保存配置)"不知道有啥用"——它们语义上只对 SCOE(Tab1/2)有意义,但顶在全局,脱离作用对象
- tab 难看(Quasar 默认下划线 tab)
- 整体乱

### 明确不含(本次不做)

- **不动信息架构/导航结构**:3 个一级 tab(运行与测试 / SCOE 配置 / 中心对接)保留,不重组。
- **不补 Tab2 命令配置「待实现」占位**:该功能开发另开任务,本次只做占位样式不刺眼。
- **不动 4 个 composable 的 API**:`use-scoe-config`/`use-scoe-monitor`/`use-test-tool`/`use-central-docking` 的 return 签名零改动。
- **不动 command-ingress core / northbound feature / task feature**:纯 UI 重做,只动消费方(模板 + 组件拆分)。
- **用例目录映射逻辑(D004/S012)原样迁移**:catalogMappings 的 CRUD + fieldGroups 分组 + 选模板弹窗 + 勾字段交互,零功能改动。

## 2. 不变量与约束

- **样式基线**:颜色/背景/边框/阴影/间距/圆角/字体层级必须走 `--rw-*` token 或 Quasar 语义 prop;禁止硬编码视觉值;UnoCSS 只承担结构性 utility(`min-h-0`、`overflow-*`、`flex` 等)。
- **边缘 padding 硬约束(用户强调)**:所有容器边缘必须有 padding,内容不能贴边——横向容器(toolbar/KPI bar/表格)左右 padding;纵向容器(左右栏/卡片堆)上下 padding。具体值走 `--rw-space-*` token,基准对齐 SendPage 的 `p-3`/`px-3`/`py-3`。
- **高度链范式**:沿用 `SendPage.vue` / `DisplayPage.vue` 验证过的模式(`q-page flex flex-col h-full` + scoped `min-height: 0` + 关键节点 `flex-1 min-h-0 overflow-hidden`)。参考 D007(flex `max-height:100%` 撑开陷阱)和 S009 续接5(不滥用 flex-1/min-h-0/overflow-hidden,关键处补足即可)。
- **4 个 composable API 零改动**。
- **路由不变**:CommandIngressPage 仍是 AppShell 下的一个 page。

## 3. 设计

### 3.1 顶部 toolbar(地基,消灭三行头)

**方案 A(已选定)**:极简单行 toolbar——去 H1,按钮按 tab 动态切换,全部一行约 48px。

```
┌─────────────────────────────────────────────────────────────────────┐
│ px-3                                                              px-3│
│  [SCOE 运行与测试][SCOE 配置][中心对接]      [连接][断开][加载/卸载][保存配置] │
│  ↑ 一级分段控件(左)                          ↑ 按 tab 动态切换的操作按钮(右) │
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- **砍掉 H1「指令接入」**。左侧导航已标当前页,顶部不再重复。
- 一级 tab 换成**分段控件**(segmented control)样式:每个选项一格,选中格底色填充,不用 Quasar 默认下划线 tab。走 token:选中格 `--rw-color-surface-selected` 背景 + `--rw-color-text-primary` 文字;未选中 `--rw-color-surface-base` + `--rw-color-text-secondary`。
- 操作按钮**按当前 tab 动态切换**:
  - Tab1/Tab2(SCOE)→ `[连接][断开][加载/卸载][保存配置]`(原顶部 4 按钮)
  - Tab3(中心对接)→ `[对接配置][断开][上报记录]`(原 Tab3 状态条里的按钮)
- 整个 toolbar 一行,左右各 `px-3` padding。

**这是相对当前最大的功能行为变化**(按钮按 tab 渲染),但**不动 composable API**——只是 page 模板根据 `activeTab` 渲染不同按钮组,handler 函数不变。

### 3.2 Tab1「SCOE 运行与测试」

**方案 A(已选定)**:统计卡片瘦身成 KPI bar。

```
┌─────────────────────────────────────────────────────────────────────┐
│ px-3                                                              px-3│
│  累计 00:12:34  卫星 00:12:34  接收 1,234  成功 1,200  出错 34      │
│  卫星ID SAT-1   健康 ●正常   链路自检 通过                          │
│  ↑ KPI bar(两行紧凑「label: value」,~60px,左右 px-3)              │
├─────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────┐ ┌──────────────────────────────┐ │
│ │ py-3                          │ │ py-3                        │ │
│ │ 命令日志  最后码:0x1A 错误:无 │ │ 测试工具 (320px)             │ │
│ │ ─────────────────────────────│ │ 接收区 (virtual-scroll)       │ │
│ │ (表格占满)                    │ │ 发送区 (textarea)             │ │
│ │                              │ │ [高亮配置]                    │ │
│ └────────────────────────────────┘ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- **10 个指标分两类**:
  - 计数器类(累计秒/卫星运行秒/接收总数/成功数/出错数):KPI bar 第一行常驻,「label: value」紧凑排列,5 项均分宽度(`flex` + `gap`)。
  - 状态类(已加载卫星ID/健康状态/链路自检):KPI bar 第二行常驻,状态用 StatusBadge + `--rw-color-status-*`(健康/链路自检)或纯文本(已加载卫星ID),3 项靠左排列。
  - **「最后功能码」「错误原因」收进命令日志表表头**(用户拍板),以「最后码: 0x1A  错误: 无」形式显示在 CommandLogTable 标题栏右侧,不占 KPI bar 常驻位置。
- KPI bar 两行,行高紧凑(`text-sm`),label 走 `--rw-color-text-muted`,value 走 `--rw-color-text-primary`,整体左右 `px-3` padding,上下 `py-2`。
- 主体左右分栏保留:左命令日志表(flex-1)+ 右测试工具栏(320px)。
- 表格纵向空间翻倍(原 5×2 卡片 ~200px → KPI bar ~60px,省 ~140px 给表格)。
- 左右栏内部 `py-3` 上下 padding(硬约束),栏间分隔用 `--rw-color-border-subtle` 细线。
- 测试工具栏内部结构不变(接收区 virtual-scroll + 发送区 textarea + 高亮配置按钮),只套进 token 化的卡片壳。

### 3.3 Tab2「SCOE 配置」

**方案 A(已选定)**:保持左右分栏,右编辑区卡片化分区。

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────────┐ │
│ │ px-3 py-3   │ │ px-3 py-3                                    │ │
│ │ 卫星列表     │ │ 基本信息 (卡片)                               │ │
│ │ ───────────│ │ ┌──────────────────────────────────────────┐ │ │
│ │ ▸ SAT-1 ●  │ │ │ ID / 名称 / 地址 / 端口                   │ │ │
│ │   SAT-2    │ │ └──────────────────────────────────────────┘ │ │
│ │   SAT-3    │ │                                              │ │
│ │            │ │ 命令配置 (卡片)                               │ │
│ │ [+ 新增]    │ │ ┌──────────────────────────────────────────┐ │ │
│ │            │ │ │ ▾ 命令组(expansion 列表,待实现占位)     │ │ │
│ │            │ │ └──────────────────────────────────────────┘ │ │
│ └──────────────┘ └──────────────────────────────────────────────┘ │
│  左栏 240px                              右栏 flex-1              │
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- 左栏缩到 **240px**(对齐 SendPage),列表项加 hover/selected 态(`--rw-color-surface-selected`)。
- 右编辑区两个**独立卡片**:基本信息卡 + 命令配置卡,卡片间 `gap` 走 token,卡片壳走 `rw-panel-base` + token。
- 命令配置「待实现」占位**保持不动**,占位样式做不刺眼(灰字 `--rw-color-text-muted` + 浅底)。
- 顶部 toolbar 的「保存配置」按钮作用于整个右编辑区(行为不变)。

### 3.4 Tab3「中心对接」

**方案 A(已选定)**:状态条 + 二级 tab 合并到一行 toolbar。

```
┌─────────────────────────────────────────────────────────────────────┐
│ px-3                                                              px-3│
│ HTTPS ●正常  心跳 3s  设备 4/5        │ [任务][设备][目录映射]       │
│ ↑ 状态徽章组(左)                        ↑ 二级分段控件(右)          │
├─────────────────────────────────────────────────────────────────────┤
│ py-3                                                              py-3│
│                                                                      │
│  (二级 tab 内容:任务列表表 / 设备列表表 / 用例目录映射列表)           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**改动点**:
- **消灭双行头**:状态徽章 + 二级分段控件,全部一行约 48px,左右 `px-3`。
- 状态徽章(HTTPS/心跳/设备)做成紧凑徽章组:`●正常` 这种 icon + 文字,走 `--rw-color-status-*`。
- 二级分段控件**视觉重量弱于一级**(用 `rw-segmented--sub` 修饰:更小字号 `--rw-font-size-caption` / 更紧 padding / 去阴影),层级感自然区分一级/二级。
- 内容区 `py-3` 上下 padding(硬约束)。
- **操作按钮(对接配置/断开/上报)归 CiToolbar 统一管理**(docking tab 时显示),DockingToolbar 不重复——按钮单一来源,避免 3.1 节顶部 toolbar 和本节 toolbar 两处都显示 docking 按钮的歧义。
- **3 个弹窗(对接配置/设备编辑/上报记录)逻辑零改动**,触发它们的按钮从原 Tab3 状态条移到 CiToolbar 右侧(docking tab 时)。
- **用例目录映射(CatalogMappingPanel)功能逻辑零改动**,原样套进新分段控件容器(D004/S012 完整保留:catalogMappings CRUD + fieldGroups 分组 + 选模板弹窗 + 勾字段交互)。

### 3.5 分段控件共享样式(新增)

一级 tab 和二级 tab 都用分段控件,做成**共享样式**(避免每个组件各写一遍)。放 `rewrite/src/features/command-ingress/components/ci-segmented.scss`(或并入现有 scss,实施时定),导出两个 class:
- `.ci-segmented`——一级分段控件(标准字号 `--rw-font-size-body`)
- `.ci-segmented--sub`——二级分段控件(小字号 `--rw-font-size-caption` + 更浅填充)

选中/未选中态、hover 态、圆角(`--rw-radius-*`)、间距全走 token。

## 4. 组件拆分

### 4.1 文件组织(用户拍板:components/ 下按 tab 语义分子文件夹)

放 `rewrite/src/features/command-ingress/components/`,按 tab 语义分子文件夹:

```
features/command-ingress/components/
├─ (现有保留,扁平根目录)
│  ├─ ci-labels.ts
│  ├─ command-log-columns.ts
│  ├─ satellite-columns.ts
│  ├─ docking-labels.ts
│  ├─ docking-task-columns.ts
│  ├─ report-record-columns.ts
│  └─ scoeStatusMap.ts
│
├─ CiToolbar.vue                    顶部 toolbar(一级分段控件 + 按 tab 动态按钮)
├─ ci-segmented.scss                分段控件共享样式(新增)
│
├─ runtime/                         Tab1「SCOE 运行与测试」
│  ├─ StatsKpiBar.vue               KPI bar(8 个常驻指标)
│  └─ CommandLogTable.vue           命令日志表(含「最后码/错误」表头)
│
├─ config/                          Tab2「SCOE 配置」
│  ├─ SatelliteList.vue             左栏卫星列表(240px)
│  └─ SatelliteEditPanel.vue        右编辑区(基本信息卡 + 命令配置卡)
│
└─ docking/                         Tab3「中心对接」
   ├─ DockingToolbar.vue            状态徽章组 + 二级分段控件 + 操作按钮
   ├─ TaskListPanel.vue             任务列表
   ├─ DeviceListPanel.vue           设备列表
   ├─ CatalogMappingPanel.vue       用例目录映射(D004/S012 原样迁移)
   ├─ DockingConfigDialog.vue       弹窗:对接配置
   ├─ DeviceEditDialog.vue          弹窗:设备编辑
   └─ ReportRecordDialog.vue        弹窗:上报记录
```

**命名规范**:
- 子文件夹用 tab 语义命名(`runtime`/`config`/`docking`),不用通用名(`tabs/`)。
- 子文件夹内 .vue **不加 Ci 前缀**(文件夹已隔离命名空间)。
- 只有跨 tab 共用的(`CiToolbar.vue` + `ci-segmented.scss`)放 components 根目录,加 Ci 前缀。
- ts 数据文件(列定义/labels)保持扁平根目录不动。

### 4.2 CommandIngressPage.vue 变薄壳(~150 行)

职责:
- 持有 4 个 composable 实例(`useScoeConfig`/`useScoeMonitor`/`useTestTool`/`useCentralDocking`)。
- 持有 `activeTab` 状态。
- 持有 polling / asyncAction / unmount cleanup 等页面级生命周期。
- 按 `activeTab` 渲染对应 tab 内容,通过 props/emits 分发 composable 数据到子组件。
- **不写 UI 细节**(无 KPI bar / 表格 / 卡片的具体模板,只 `<CiToolbar>` + 各 tab 组件)。

### 4.3 子组件职责边界

| 组件 | 职责 | 主要 props | 主要 emits |
|------|------|-----------|-----------|
| `CiToolbar` | 一级分段控件 + 按 tab 动态按钮 | `activeTab`, `scoeButtons`(连接/断开/加载/保存的 loading 态), `dockingButtons` | `update:activeTab`, `connect`, `disconnect`, `load-unload`, `save-config`, `open-docking-config`, `docking-disconnect`, `open-report` |
| `runtime/StatsKpiBar` | 8 个常驻指标 KPI bar | `stats`(monitor 的运行统计对象) | 无(纯展示) |
| `runtime/CommandLogTable` | 命令日志表 + 表头「最后码/错误」 | `rows`(commandLog), `lastCommandCode`, `lastErrorReason` | `clear-log` |
| `config/SatelliteList` | 左栏卫星列表 | `rows`(satelliteConfigs), `selectedId`, `search` | `update:selected`, `update:search`, `add`, `duplicate`, `delete`, `import`, `export` |
| `config/SatelliteEditPanel` | 右编辑区 | `config`(selectedConfig), `editForm` | `update:edit-form`, `add-command`, `save` |
| `docking/DockingToolbar` | 状态徽章 + 二级分段控件 + 操作按钮 | `connectionState`, `activeInnerTab`, `isActive`, `isDisconnecting`, `hasReportRecords` | `update:active-inner-tab`, `open-config`, `disconnect`, `open-report` |
| `docking/TaskListPanel` | 任务列表 | `rows`(dockingTasks) | `stop-task` |
| `docking/DeviceListPanel` | 设备列表 | `rows`(devices) | `add`, `edit`, `delete` |
| `docking/CatalogMappingPanel` | 用例目录映射(原样迁移) | `mappings`, `templates`, `field-groups`(计算函数) | `toggle-enabled`, `toggle-field`, `add-mapping`, `toggle-mapping`, `delete-mapping` |
| `docking/DockingConfigDialog` | 对接配置弹窗 | `model-value`(v-model), `config` | `update:model-value`, `save-connect` |
| `docking/DeviceEditDialog` | 设备编辑弹窗 | `model-value`, `device`, `subSysOptions` | `update:model-value`, `confirm` |
| `docking/ReportRecordDialog` | 上报记录弹窗 | `model-value`, `rows`(reportRecords) | `update:model-value` |

**props/emits 原则**:走 composable 的 return 签名,不新增业务逻辑。若某 composable 接口确实需要微调(如需暴露某个内部 ref 给子组件读),先和用户确认,不在本次擅自改。

## 5. 高度链

照搬 SendPage/DisplayPage 验证过的模式:

```
q-page.command-ingress-page (height 链根) — flex flex-col h-full + scoped min-height:0
├─ CiToolbar (flex-shrink-0, ~48px)
└─ div.flex-1.min-h-0 (tab 内容容器)
   ├─ Tab1: div.flex.flex-col.flex-1.min-h-0
   │  ├─ StatsKpiBar (flex-shrink-0, ~60px)
   │  └─ div.flex.flex-1.min-h-0 (主体分栏)
   │     ├─ CommandLogTable flex-1 min-w-0 min-h-0 overflow-hidden
   │     └─ 测试工具栏 w-[320px] flex-shrink-0 min-h-0
   ├─ Tab2: div.flex.flex-1.min-h-0
   │  ├─ SatelliteList w-[240px] flex-shrink-0 min-h-0
   │  └─ SatelliteEditPanel flex-1 min-w-0 min-h-0 overflow-y-auto
   └─ Tab3: div.flex.flex-col.flex-1.min-h-0
      ├─ DockingToolbar (flex-shrink-0, ~48px)
      └─ div.flex-1.min-h-0 (二级 tab 内容)
```

**关键约束**(吸取 S009 续接5 教训):不滥用 `flex-1 min-h-0 overflow-hidden`,只在关键节点(表格/可滚动区/分栏容器)补足,普通布局用 `w-full`/`h-full` 或不管。

## 6. 验证

- `lint`:0 新增 error。
- `tsc`:0 错误。
- `command-ingress` 测试套件:不新增失败。
- 实测:`quasar dev -m electron` 打开指令接入页,3 个 tab 都点一遍,映射 CRUD 走一遍。
- diff 验证:4 个 composable 文件零改动(只动消费方)。

## 7. 风险与决策记录

| 决策 | 选择 | 理由 | 否决项 |
|------|------|------|--------|
| 顶部骨架 | 方案 A(单行 toolbar + 按钮 tab 切换) | 省 2 行纵向空间,按钮带上下文,和 SendPage 风格一致 | B(留 H1 占两行)/ C(sidebar 破坏全站统一) |
| Tab1 统计 | 方案 A(KPI bar) | 省 ~140px 给表格,直接解决"空间利用差" | B(卡片还占一块)/ C(表头塞不下状态) |
| Tab1 偶发值 | 收进日志表表头 | KPI bar 更干净,偶发值不需常驻 | 全留 KPI bar(挤) |
| Tab3 头部 | 方案 A(状态+二级 tab+按钮一行) | 消灭双行头 | B(sidebar 多一个) |
| tab 样式 | 分段控件 | 现代感,和 toolbar 融合好,用户拍板 | 下划线精细化 / 纯文字切换 |
| 组件拆分 | components/ 下按 tab 语义分子文件夹 | 用户拍板:扁平太乱,但不用通用名 `tabs/` | 扁平全放 components 根 / 建 tabs/ 文件夹 |

## 8. 落档

完成后:
- 新建 `.sessions/2026-06-10-ui-feature-bugs/S010-command-ingress-page-ui-overhaul.md`。
- 更新 `topic-index.md`(加 S010 条目 + 顶部"最后更新"行 + "当前位置"段)。
- 更新 `_registry.yaml` 的 `2026-06-10-ui-feature-bugs` `last_updated: 2026-06-22`。
- `voice.md` 记用户原话(顶部碍事 / 按钮没用 / tab 难看 / padding 硬约束 / 文件夹约定)。
- git commit message 带 `[S010]`,建议拆 commit(组件拆分 / 各 tab UI / 收尾)。
