# 全局 UI 架构 Brainstorm

## 元数据

- **类型**: brainstorm（事实 + 分析 + 自检）
- **直接合同**: rewrite-frontend-conventions.md, rewrite-frontend-checklist.md
- **边界护栏**: CLAUDE.md, rewrite-target-structure.md, 2026-05-07-runtime-next-phase-global-planning.md, rewrite-display-ui-design.md, CSS token 体系
- **日期**: 2026-05-12
- **决策状态**: 全部锁定（用户已确认 7 个 open questions 采纳推荐 A）

---

## 一、事实层

### 1.1 旧系统页面行为完整清单（85 个行为）

| 页面 | 路由 | 核心行为数 | 布局模式 |
|------|------|-----------|---------|
| 首页 | / | 2 | 单栏 |
| 连接配置 | /connect | 6 | 双栏(24vw+1fr) |
| 帧列表 | /frames/list | 10 | 双栏(表格+30vw详情) |
| 帧编辑器 | /frames/editor | 6 | 表单 |
| 帧发送 | /frames/send | 14 | 三栏(240px+flex+300px) |
| 接收帧 | /frames/receive | 10 | 动态(编辑3栏/显示2栏) |
| 系统设置 | /settings | 6 | 单栏 |
| 高速存储 | /storage | 9 | 单栏居中(max-w-4xl) |
| 历史分析 | /history | 10 | 双栏(320px可拖拽+图表) |
| SCOE配置 | /scoe | 13 | 三栏(固定+弹性+固定) |

**核心数据流**: 连接建立 → 帧定义配置 → 发送/接收数据 → 数据展示/存储 → 历史分析

### 1.2 旧系统导航行为

- 一级扁平侧边栏（9项），无二级菜单
- 可折叠：mini模式(60px图标) ↔ 展开(120px全标签)，hover自动展开
- 顶部48px状态栏：logo、状态指示灯、窗口控制
- 无面包屑、无标签页浏览
- 用户操作线性流程：连接→配置→执行→查看

### 1.3 新系统 UI 现状

- 5个Vue文件：AppShell(QLayout+QDrawer+QHeader)、App.vue、HomePage(运行总览)、AppNavigation、SummaryMetricGrid
- 1条路由：/ → HomePage
- 10个feature有完整TS实现但零UI组件

### 1.4 CSS Token 现状

**已有**: 颜色(brand/surface/text/action/border/status)、间距(12级)、字体(6级+行高+粗细)、尺寸(app-drawer 232px/content-wide 1120px)、圆角、边框
**缺少**: 暗色模式token、交互状态色(hover/active/disabled)、shadow/z-index CSS变量导出、动画token
**UnoCSS**: 配置几乎为空

### 1.5 前端规范关键约束

- 虚拟滚动 MUST（行数>100）
- DOM节点 ≤3000
- 高频数据 rAF缓冲 MUST
- 大数组 shallowRef MUST
- 侧边栏 232px 固定
- 响应式下限 720px，不做移动端
- 禁止硬编码颜色
- 状态色固定映射 positive/warning/negative/info
- 优先 Quasar 内建方案，禁止第三方UI库

### 1.6 外部参考精华

**ISA-101 工业HMI标准**:
- 四级显示层次：概览→区域→设备→诊断
- 灰底原则：正常运行灰色/低对比度，颜色只为异常保留
- 紧凑间距：4/8/12px（非消费级16-24px）
- 最大3次点击原则
- 背景色推荐 #404040-#606060（暗环境）

**Quasar 框架能力**:
- QDrawer: 侧边栏+mini模式(show-if-above+ :mini)
- QExpansionItem: 可折叠子菜单
- QSplitter: 可拖拽分栏
- QTable + virtual-scroll: 内置虚拟滚动
- Dark mode: body--dark class 自动切换

**实时数据表格**:
- QTable+virtual-scroll+shallowRef+triggerRef 是最小依赖路径
- rAF节拍：数据到达→buffer→rAF回调→applyUpdates→clear buffer
- CSS @keyframes flash: 值变化高亮
- 只更新可见元素

---

## 二、决策层（现状→变化）

### D1 导航体系

**现状**: 旧系统9个扁平一级菜单，无二级折叠，无面包屑

**变化**:
- 采用二级折叠侧边栏（QDrawer + QExpansionItem）
- 顶部增加连接状态选择器（全局可见，不属于功能域）
- 面包屑仅在二级页面显示
- **MVP先锁旧系统10个入口**，新增入口随对应feature design锁定后添加
- mini/展开状态持久化到localStorage

**导航结构（MVP）**:
```
QDrawer (232px)
├── 运行总览 (/)              [status]
├── 连接管理 (/connection)     [connection]
├── ▼ 帧管理
│   ├── 帧列表 (/frames)       [frame]
│   └── 帧编辑 (/frames/editor/:frameId?) [frame]
├── ▼ 数据交互
│   ├── 发送 (/frames/send)    [send+task]
│   └── 接收展示 (/display)    [display+receive]
├── 接收配置 (/receive/config) [receive+display]
├── 历史分析 (/history)        [storage+display]
├── SCOE配置 (/command-ingress) [command-ingress]
├── 高速存储 (/storage)        [storage]
└── 系统设置 (/settings)       [settings]
```

**QHeader (48px)**: [菜单] [Logo] [连接选择器] [状态指示] [暗色切换] [窗口控制]

### D2 布局骨架

**现状**: 旧系统用CSS grid/flex固定比例，无QSplitter拖拽

**变化**:
- 归纳3种标准布局模式作为**设计指南**（不封装为独立组件）
- 页面各自用CSS grid/flex + token实现布局，等2+页面出现完全相同布局参数时再提取共享语义class
- QSplitter仅在有明确用户拖拽需求时使用（如历史分析面板宽度调整）

**3种布局模式**:

| 模式 | 适用页面 | 实现 |
|------|---------|------|
| 主从双栏 | 连接管理、帧列表、接收配置、历史分析 | CSS grid: 固定宽度 + flex(1) |
| 三栏固定+弹性 | 帧发送 | CSS grid: 240px + flex(1) + 300px |
| 单栏居中(max 1120px) | 高速存储、系统设置、SCOE配置 | max-width + margin auto |

### D3 共享 Widget

**现状**: 旧系统有SendTargetSelector等跨页面复用组件，新系统有AppNavigation和SummaryMetricGrid

**变化**: 保留6个真正跨页面复用的widget，其余归对应feature/components/或按需创建

| Widget | 用途 | 使用页面 | 优先级 |
|--------|------|---------|--------|
| DataTable | 通用数据表格+虚拟滚动+server-side分页 | 帧列表、发送、任务、接收、历史 | P0 |
| StatusBadge | 状态标签(positive/warning/negative/info) | 连接、任务、SCOE、发送、首页 | P1 |
| TableToolbar | 表格工具栏(搜索/筛选/操作按钮) | 帧列表、发送、任务、历史 | P1 |
| SendTargetSelector | 发送目标选择器 | 发送页、任务页、SCOE页 | P1 |
| FrameSelector | 帧选择下拉(方向过滤/搜索) | 发送页、接收页、任务页、SCOE页 | P1 |
| ChartWidget | 图表容器(ECharts封装) | 实时展示、历史分析 | P2 |

**不提前建**: FormBuilder、ConfirmDialog(用$q.dialog())、FormDialog、ActionButtonGroup
**归feature/components/**: ParameterTable→display, ConnectionConfigForm→connection, FieldEditor→frame, StatusIndicatorPanel→status

### D4 实时数据展示架构

**现状**: 旧系统逐包穿透Vue响应式导致卡顿

**变化**:
- 数据流: receive→routingTick(16ms)→DisplayService→DisplaySelectors→useDisplayRefresh(rAF+cadence)→shallowRef→Vue组件→DOM
- rAF + 可配置cadenceMs节流（默认200ms，快过程100ms，慢过程1000ms）
- shallowRef + 整组替换
- 100+参数: QTable virtual-scroll + 分组默认折叠
- 值变化高亮: CSS @keyframes value-flash 600ms
- 后台暂停: document.hidden检测
- 数据过期降级: 变灰+时间戳
- useDisplayRefresh 归 features/display/composables/（强依赖display selectors）
- 与display-ui-design完全对齐，无冲突

### D5 暗色模式

**现状**: 旧系统只有暗色主题，无明暗切换。新系统token体系只有一套值（亮色）

**变化**:
- **只做暗色（默认唯一主题）**，不实施双主题切换
- 当前token体系需将palette/semantic-colors中的surface、text值改为暗色值
- 图表6色(#60A5FA/#34D399/#FBBF24/#F87171/#A78BFA/#FB923C)在暗色背景下对比度充足，直接复用
- 后续如需亮色模式，需要全局token重构为:root + .body--dark双层结构

### D6 页面清单

**现状**: 旧系统9个页面入口

**变化**: MVP对应旧系统10个入口（首页+9功能页），接收帧拆为展示+配置两页

| # | 页面 | 路由 | Feature | 优先级 | 旧系统对应 |
|---|------|------|---------|--------|-----------|
| 1 | 运行总览 | / | status | P0 | 首页 |
| 2 | 连接管理 | /connection | connection | P0 | ConnectConfig |
| 3 | 帧列表 | /frames | frame | P0 | FrameList |
| 4 | 帧编辑 | /frames/editor/:frameId? | frame | P0 | FrameEditor |
| 5 | 帧发送 | /frames/send | send+task | P0 | FrameSend |
| 6 | 实时展示 | /display | display+receive | P0 | ReceiveFrame显示模式 |
| 7 | 接收配置 | /receive/config | receive+display | P1 | ReceiveFrame编辑模式 |
| 8 | 历史分析 | /history | storage+display | P1 | HistoryAnalysis |
| 9 | SCOE配置 | /command-ingress | command-ingress | P1 | SCOEConfig |
| 10 | 高速存储 | /storage | storage | P1 | HighSpeedStorage |
| 11 | 系统设置 | /settings | settings | P2 | Settings |

**后续随feature design锁定添加**: 任务管理页、结果报告页、北向交付页

---

## 三、自检层

### R1 假设验证

所有布局和组件假设均有支撑来源:
- QDrawer+QExpansionItem → Quasar官方文档 + 旧系统侧边栏行为
- rAF+cadence → 前端规范P1/P5 + ISA-101自适应刷新率
- 暗色唯一 → 旧系统事实 + ISA-101暗环境推荐
- 3种布局模式 → 旧系统6种页面布局归纳

### R2 旧行为覆盖度

- 85个旧行为: 73覆盖(85.9%), 4合并(4.7%), 8降级(9.4%), 0删除
- 降级项均为UI效率功能（批量编辑、快捷键、面板拖拽），非核心路径
- 需关注映射点: 接收帧拆分两页、发送任务可内嵌、SCOE重命名

### R3 边界场景

- 窗口缩放: 响应式下限720px，侧边栏<720px自动折叠
- 多连接: 顶部连接选择器，SendTargetSelector下拉选择
- 无数据: DataTable #no-data slot
- 加载中: DataTable :loading prop + QInnerLoading
- 错误态: StatusBadge negative + 错误信息展示
- 数据过期: 变灰+时间戳+离线标记

### 过度设计审查结论

| 审查维度 | 结论 | 理由 |
|---------|------|------|
| 上游消费 | ✅ | widget只消费feature public API，不直接访问state |
| 下游需求 | ⚠️→✅ | 精简后6个widget都有2+页面复用 |
| 驱动真实性 | ⚠️→✅ | 去掉FormBuilder等无旧行为支撑的抽象 |
| 链路位置 | ⚠️→✅ | useDisplayRefresh归display feature，布局不封装 |
| 跨模块一致性 | ✅ | DataTable/StatusBadge统一跨feature |

### 规范合规

合规率96.6%（28/29），唯一补充: DataTable增加server-side分页模式（@request事件透传）

### 标识对齐

对齐度85%。需调整: TaskDefinition.id→taskId, 路由参数:→→:frameId/:taskId

### 与display-ui-design对齐

11项一致，2项调整:
1. useDisplayRefresh/useHistoryQuery归features/display/composables/
2. --rw-space-panel-gap(4px)复用已有--rw-space-1，不新增冗余token
