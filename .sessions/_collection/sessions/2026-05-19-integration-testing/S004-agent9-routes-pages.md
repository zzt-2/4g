# [S004-agent9] 旧系统页面入口与路由完整清单

> 2026-05-19 | 事实提取 | 状态：完成

## 目标

提取旧系统所有页面入口、路由定义、导航结构，并与新系统逐项对照，形成完整的新旧映射表。

## 记录

### 1. 旧系统路由完整列表

路由定义文件：`src/router/routes.ts`

旧系统只有一层嵌套路由结构：所有业务页面都是 `/` 根路由（使用 `MainLayout.vue` 布局）的 children。

| # | path | component | 侧边栏名称 | 功能描述 |
|---|------|-----------|------------|---------|
| 1 | `/` (空字符串，即 `/`) | `pages/home/HomePage.vue` | 首页 | 应用首页，仅显示标题"激光链路标准测试设备" |
| 2 | `/connect` | `pages/ConnectConfigPage.vue` | 连接 | 连接配置管理。左右分栏：左侧连接列表，右侧三个 tab（网口配置/串口配置/测试工具） |
| 3 | `/frames/list` | `pages/frames/FrameList.vue` | 配置 | 帧列表（帧配置管理）。左右分栏：左侧帧表格+过滤，右侧帧详情面板。支持新建/编辑/复制/删除/收藏/导入/导出 |
| 4 | `/frames/editor` | `pages/frames/FrameEditor.vue` | （从帧列表导航进入，无侧边栏入口） | 帧编辑器。创建/编辑帧定义。左侧基本信息，中间字段列表+字段预览，弹窗式字段编辑器 |
| 5 | `/frames/send` | `pages/FrameSendPage.vue` | 发送 | 帧发送页面。帧格式列表、帧实例列表、实例编辑器、帧预览、目标选择器、定时发送/触发发送/顺序发送弹窗、活动任务监控 |
| 6 | `/frames/receive` | `pages/ReceiveFramePage.vue` | 接收 | 接收帧页面。两种模式——编辑模式（三栏：接收帧选择器/数据项列表/统计面板），显示模式（双栏：数据组管理/数据展示容器） |
| 7 | `/settings` | `pages/settings/Index.vue` | 设置 | 系统设置。数据记录设置（自动开始记录/保存间隔）、其他应用选项 |
| 8 | `/storage` | `pages/storage/HighSpeedStoragePage.vue` | 存储 | 高速存储管理。配置和管理业务数据的高速存储功能（几百 Mbps 网络数据存储） |
| 9 | `/history` | `pages/HistoryAnalysisPage.vue` | 历史 | 历史分析。时间选择器+数据选择器+多图表展示，支持 CSV 导出和图表设置 |
| 10 | `/scoe` | `pages/SCOEConfigPage.vue` | SCOE | SCOE 配置。三栏：左侧卫星配置列表、中间配置表单、右侧状态面板 |
| 11 | `/:catchAll(.*)*` | `pages/ErrorNotFound.vue` | （无） | 404 页面 |

**路由特点：**
- 无动态路由参数（`/frames/editor` 通过 query string `?id=xxx` 或 `?new=true` 传递参数）
- 无 name 属性定义
- 无 meta 属性
- 无路由守卫
- 无多级嵌套（除根布局外）
- 使用 `createWebHashHistory`（hash 模式路由）

### 2. 旧系统导航结构

#### 2.1 侧边栏（SidePanel.vue）

侧边栏定义 9 个导航项，硬编码在 `src/components/layout/SidePanel.vue`：

```typescript
const navItems = ref([
  { label: '首页',    path: '/',            icon: 'home' },
  { label: '连接',    path: '/connect',     icon: 'insights' },
  { label: 'SCOE',    path: '/scoe',        icon: 'satellite' },
  { label: '配置',    path: '/frames/list', icon: 'view_list' },
  { label: '发送',    path: '/frames/send', icon: 'send' },
  { label: '接收',    path: '/frames/receive', icon: 'download' },
  { label: '存储',    path: '/storage',     icon: 'storage' },
  { label: '历史',    path: '/history',     icon: 'history' },
  { label: '设置',    path: '/settings',    icon: 'settings' },
]);
```

**导航方式：** 点击侧边栏项 → `router.push(path)` → 全页面切换。

**侧边栏 UI 行为：**
- 默认 mini 模式（宽度 60px，只显示图标）
- 鼠标悬停展开（宽度 120px，显示图标+文字）
- 使用 `mini-to-overlay` 模式
- 深色主题（`bg-[#1a202c]`）

#### 2.2 顶部栏（HeaderBar.vue）

- 左侧：Logo + 应用名称"激光链路标准测试设备"
- 中间：状态指示灯（`StatusIndicators` 组件）
- 右侧：窗口控制按钮（最小化/最大化/关闭）
- 整行可拖拽移动窗口（`-webkit-app-region: drag`）

#### 2.3 页面间导航（非侧边栏）

| 来源页面 | 目标页面 | 导航方式 |
|---------|---------|---------|
| 帧列表 `/frames/list` | 帧编辑器 `/frames/editor?new=true` | 点击"新建帧"按钮 → `router.push` |
| 帧列表 `/frames/list` | 帧编辑器 `/frames/editor?id=xxx` | 帧操作菜单"编辑" → `router.push` |
| 帧发送 `/frames/send` | 弹窗：定时发送/触发发送/顺序发送/任务监控 | Dialog 弹窗，非路由 |

#### 2.4 页面内 Tab 切换

| 页面 | Tab 结构 |
|------|---------|
| 连接 `/connect` | 右侧面板三个 tab：网口配置 / 串口配置 / 测试工具 |
| 接收 `/frames/receive` | 两种模式切换：编辑模式 / 显示模式 |
| 帧发送 `/frames/send` | 通过弹窗访问：定时发送 / 触发发送 / 顺序发送 / 任务监控 |

#### 2.5 全局弹窗

- **FileListDialog**：全局文件对话框，挂载在 `MainLayout.vue` 中，通过 EventBus 打开（`FILE_DIALOG_OPEN` 事件），用于导入/导出文件操作。

### 3. 旧系统布局结构

#### 3.1 主布局（MainLayout.vue）

```
q-layout (view="hHh lpR fFf")
├── q-header (固定高度 48px)
│   └── HeaderBar
├── div.flex (内容区域，高度 calc(100vh - 28px))
│   ├── q-drawer (侧边栏，mini 模式，固定 60px/展开 120px)
│   │   └── SidePanel
│   └── q-page-container (flex-grow)
│       └── router-view
└── FileListDialog (全局文件对话框，条件渲染)
```

**布局特点：**
- 全局深色主题（`bg-[#0f172a]`）
- 侧边栏 mini-to-overlay 模式
- 无全屏模式
- 无独立的空白/登录页
- 布局 composable 分为三个：`useLayoutDrawer`（侧边栏状态）、`useFileDialog`（全局文件对话框）、`useAppLifecycle`（应用生命周期初始化）

#### 3.2 页面内部布局模式

| 页面 | 布局模式 |
|------|---------|
| 首页 | 居中标题 |
| 连接 | 左右分栏（24vw + 1fr），右侧含 tab |
| 帧列表 | 左右分栏（帧表格 + 30vw 详情面板） |
| 帧编辑器 | 三栏（300px 左侧 + 主区域），主区域内字段列表+预览 |
| 帧发送 | 多组件组合（帧格式列表 + 实例列表 + 编辑器 + 预览 + 目标选择） |
| 接收 | 编辑模式三栏（240px + 1fr + 300px）/ 显示模式双栏 |
| 设置 | 单栏表单 |
| 存储 | 单栏，居中 max-w-4xl |
| 历史 | 左右可调分栏（320px + 1fr） |
| SCOE | 三栏（w-64 + flex-1 + w-56） |

### 4. 新旧路由映射表

| 旧路由 | 旧侧边栏名 | 新路由 | 新侧边栏名 | 映射关系 |
|-------|-----------|-------|-----------|---------|
| `/` | 首页 | `/` | 总览 | 直接对应。旧系统首页仅标题，新系统改为仪表盘（连接/帧/任务/发送统计+快速入口） |
| `/connect` | 连接 | `/connection` | 连接管理 | 直接对应。新系统包含串口/网络连接管理，不再含测试工具 tab |
| `/frames/list` | 配置 | `/frames` | 帧定义 | 直接对应。帧列表+帧详情 |
| `/frames/editor` | （从列表导航） | `/frames/editor/:frameId?` | （从列表导航） | 直接对应。旧用 query `?id=xxx`，新用路由参数 `:frameId?` |
| `/frames/send` | 发送 | `/send` | 帧发送 | 直接对应 |
| `/frames/receive` | 接收 | `/display` | 实时展示 | 对应关系变化。旧"接收"页面含帧配置+数据展示，新系统拆分为 receive service（后台）+ display 页面（展示） |
| `/scoe` | SCOE | `/command-ingress` | 指令接入 | 概念合并升级。旧 SCOE 配置页 → 新"指令接入"页（含 SCOE 配置+监控+测试工具+中心对接，范围更大） |
| `/storage` | 存储 | 无 | 无 | **新系统缺失** |
| `/history` | 历史 | 无 | 无 | **新系统缺失** |
| `/settings` | 设置 | 无 | 无 | **新系统缺失** |
| 无 | 无 | `/tasks` | 任务管理 | **新系统新增**。旧系统的定时发送/触发发送/顺序发送散在发送页弹窗中，新系统独立为任务管理页 |
| `/:catchAll(.*)*` | 无 | 无 | 无 | 新系统未定义 catch-all/404 路由 |

### 5. 新系统路由详情

路由定义文件：`rewrite/src/router/routes.ts`

| # | path | component | 侧边栏名称 | 功能描述 |
|---|------|-----------|------------|---------|
| 1 | `/` (空字符串) | `pages/HomePage.vue` | 总览 | 仪表盘首页。连接/帧/任务/发送统计卡片、快速入口、连接状态列表、系统快照 |
| 2 | `/connection` | `pages/ConnectionPage.vue` | 连接管理 | 连接管理。卡片式连接列表+新建连接弹窗（串口/网络） |
| 3 | `/frames` | `pages/FrameListPage.vue` | 帧定义 | 帧列表+帧详情面板+导入弹窗。支持方向过滤、收藏、搜索、克隆、删除 |
| 4 | `/frames/editor/:frameId?` | `pages/FrameEditorPage.vue` | （从列表导航） | 帧编辑器。基本信息+标识规则+字段列表+字段编辑弹窗。支持动态路由参数 |
| 5 | `/send` | `pages/SendPage.vue` | 帧发送 | 帧发送。左栏帧列表+中栏实例表格/编辑+目标选择器+帧预览 |
| 6 | `/display` | `pages/DisplayPage.vue` | 实时展示 | 实时数据展示。接收生命周期状态、计数器、字段值表、最近输入表、帧统计表、散点图、波形图 |
| 7 | `/tasks` | `pages/TaskManagePage.vue` | 任务管理 | 任务管理。活动任务+历史任务 tab、任务编辑器（步骤：发送/延时/等待条件）、任务执行详情 |
| 8 | `/command-ingress` | `pages/CommandIngressPage.vue` | 指令接入 | 指令接入。多 tab：监控/配置/测试工具/中心对接。包含 SCOE 配置、命令日志、卫星配置表、心跳/链路测试/对接任务 |

**新系统路由特点：**
- 使用动态路由参数（`:frameId?`）
- 无 catch-all 路由
- 无 meta/name 属性
- 无路由守卫
- 侧边栏默认收起（`drawerOpen = false`），非 mini-to-overlay 模式

### 6. 新系统导航结构

导航项定义在 `rewrite/src/app/AppShell.vue`：

```typescript
const navigationItems = [
  { label: '总览',     to: '/',               icon: 'dashboard' },
  { label: '连接管理', to: '/connection',     icon: 'link' },
  { label: '帧定义',   to: '/frames',         icon: 'view_agenda' },
  { label: '帧发送',   to: '/send',           icon: 'send' },
  { label: '实时展示', to: '/display',        icon: 'monitor_heart' },
  { label: '任务管理', to: '/tasks',          icon: 'assignment' },
  { label: '指令接入', to: '/command-ingress', icon: 'settings_input_antenna' },
];
```

**导航方式：** 点击侧边栏项 → `router.push(to)` → 全页面切换。侧边栏使用独立 `AppNavigation` widget 组件。

**新系统侧边栏 UI 行为：**
- 默认收起（`drawerOpen = false`）
- 有 `show-if-above` 属性（小屏幕自动收起）
- 手动点击 hamburger 按钮切换
- 宽度由 CSS token `--rw-size-app-drawer` 控制

### 7. 缺失项列表

#### 7.1 旧功能在新系统中缺失

| 旧页面 | 功能 | 状态 | 备注 |
|-------|------|------|------|
| `/storage` | 高速存储管理 | 缺失 | 支持几百 Mbps 网络数据存储的配置和管理 |
| `/history` | 历史数据分析 | 缺失 | 时间选择器+数据选择器+多图表展示+CSV 导出 |
| `/settings` | 系统设置 | 缺失 | 自动开始记录、保存间隔等应用配置 |
| 连接页测试工具 tab | 网口/串口测试工具 | 可能已合并 | 旧连接页右侧有"测试"tab，新连接页未见，可能移到 command-ingress 页测试工具 tab |
| 接收帧配置 | 接收帧选择+数据项配置 | 架构变化 | 旧接收页含配置+展示，新系统拆为 receive service（后台）+ display 页（纯展示），配置方式待确认 |
| 帧编辑器字段预览 | 实时字段预览区域 | 缺失或变化 | 旧编辑器有 FrameFieldPreview 组件，新编辑器未见 |

#### 7.2 新系统新增能力

| 新页面 | 功能 | 对应旧系统 |
|-------|------|-----------|
| `/tasks` | 独立任务管理页（创建/编辑/执行/监控任务） | 旧系统定时/触发/顺序发送散在发送页弹窗中，无独立任务页 |
| `/command-ingress` | 指令接入统一页（SCOE+监控+测试+中心对接） | 旧系统仅有 `/scoe` 配置页，监控/测试/对接分散 |

#### 7.3 404 页面

旧系统有 `ErrorNotFound.vue` catch-all 路由。新系统未定义。

### 8. 保留/排除建议

#### 保留（新系统已有对应）

| 旧页面 | 建议 | 理由 |
|-------|------|------|
| 首页 | 保留升级 | 新首页已升级为仪表盘，功能远超旧首页 |
| 连接配置 | 保留 | 新连接页覆盖旧功能 |
| 帧列表 | 保留 | 新帧定义页覆盖旧功能 |
| 帧编辑器 | 保留 | 新编辑器覆盖旧功能，路由参数方式改进 |
| 帧发送 | 保留 | 新发送页覆盖旧功能 |
| SCOE 配置 | 合并保留 | 合并到指令接入页，范围更大 |

#### 排除（旧代码组织不保留）

| 旧页面 | 建议 | 理由 |
|-------|------|------|
| 接收帧页面（整体） | 拆分保留 | 按重写总原则，配置逻辑和展示逻辑拆分为独立 feature，不保留旧的单页面耦合方式 |
| 旧路由 hash 模式 | 排除 | 新系统可自行选择路由模式 |

#### 待补充（新系统缺失，需要新增）

| 页面 | 优先级 | 理由 |
|------|--------|------|
| 存储管理页 | 高 | 高速存储是核心业务功能 |
| 历史分析页 | 高 | 历史数据分析是核心业务功能 |
| 系统设置页 | 中 | 应用配置入口 |
| 404 页面 | 低 | 基础体验完善 |

## 后续

无。
