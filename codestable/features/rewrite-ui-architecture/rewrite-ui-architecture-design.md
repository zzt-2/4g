# 全局 UI 架构 Design

## 元数据

- **类型**: design（结论和变化）
- **直接合同**: rewrite-frontend-conventions.md, rewrite-frontend-checklist.md, 本文档
- **边界护栏**: CLAUDE.md, rewrite-target-structure.md, rewrite-display-ui-design.md
- **日期**: 2026-05-12
- **brainstorm**: rewrite-ui-architecture-brainstorm.md
- **状态**: 已锁定（用户已确认全部 open questions）

---

## D1 导航体系

**方案**: 二级折叠侧边栏 + 顶部连接选择器 + 面包屑

```
┌─────────────────────────────────────────────────────────────────┐
│ QHeader [48px]                                                  │
│ [☰] 东方红上位机  [连接选择器] [状态指示] [暗色切换] [窗口控制]  │
├──────────┬──────────────────────────────────────────────────────┤
│ QDrawer  │ QPageContainer                                       │
│ [232px]  │                                                      │
│          │  ┌─ QBreadcrumbs (仅二级页面) ──────────────────┐   │
│ 运行总览 │  │                                              │   │
│ 连接管理 │  │  页面内容                                      │   │
│ ▼ 帧管理 │  │                                              │   │
│   帧列表 │  └──────────────────────────────────────────────┘   │
│   帧编辑 │                                                      │
│ ▼ 数据交互│                                                      │
│   发送   │                                                      │
│   接收展示│                                                      │
│ 接收配置 │                                                      │
│ 历史分析 │                                                      │
│ SCOE配置 │                                                      │
│ 高速存储 │                                                      │
│ 系统设置 │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

**实现要点**:
- QDrawer: show-if-above, :width="232", :mini="miniState", bordered
- 一级菜单: QItem + :to 路由绑定
- 二级折叠: QExpansionItem（帧管理→帧列表+帧编辑，数据交互→发送+接收展示）
- 连接选择器: QSelect下拉，数据源 connection.selectTransportTargets()
- 面包屑: QBreadcrumbs，从路由meta生成
- mini状态: localStorage持久化，hover临时展开

**MVP入口**（对应旧系统10个入口）:
| 路由 | 页面 | Feature |
|------|------|---------|
| / | 运行总览 | status |
| /connection | 连接管理 | connection |
| /frames | 帧列表 | frame |
| /frames/editor/:frameId? | 帧编辑 | frame |
| /frames/send | 帧发送 | send+task |
| /display | 实时展示 | display+receive |
| /receive/config | 接收配置 | receive+display |
| /history | 历史分析 | storage+display |
| /command-ingress | SCOE配置 | command-ingress |
| /storage | 高速存储 | storage |
| /settings | 系统设置 | settings |

---

## D2 布局骨架

3种标准布局模式，作为设计指南。各页面用CSS grid/flex + token实现。

### 模式A: 主从双栏

```
┌────────────────────────────────────────────────────┐
│  页面标题 + 操作按钮                                 │
├──────────────────────┬─────────────────────────────┤
│  主区域(flex:1)       │  侧边面板(固定宽度)          │
│  - 表格/列表          │  - 详情/配置                 │
│  - overflow: auto     │  - 280px~360px              │
└──────────────────────┴─────────────────────────────┘
```
适用: 连接管理、帧列表、接收配置、历史分析(可选QSplitter)

### 模式B: 三栏固定+弹性

```
┌──────────────────────────────────────────────────────────┐
│  页面标题 + 操作按钮                                       │
├──────────┬───────────────────────┬───────────────────────┤
│  左栏     │  中栏(flex:1)          │  右栏                 │
│  240px    │  - 实例/编辑区         │  300px                │
│  - 格式选择│  - 主工作区            │  - 预览/结果          │
└──────────┴───────────────────────┴───────────────────────┘
```
适用: 帧发送

### 模式C: 单栏居中

```
┌────────────────────────────────────────────────────┐
│  页面标题 + 操作按钮                                 │
├────────────────────────────────────────────────────┤
│        ┌──────────────────────────────┐             │
│        │  主内容区(max-width: 1120px)  │             │
│        │  margin: 0 auto              │             │
│        └──────────────────────────────┘             │
└────────────────────────────────────────────────────┘
```
适用: 高速存储、系统设置、SCOE配置

---

## D3 共享 Widget

| Widget | 用途 | 接口核心 | 优先级 |
|--------|------|---------|--------|
| **DataTable** | 通用数据表格 | rows, columns, rowKey, virtualScroll, selection, loading, serverMode | P0 |
| **StatusBadge** | 状态标签 | status(enum), size, outlined | P1 |
| **TableToolbar** | 表格工具栏 | searchable, filterable, actions[], selectedCount | P1 |
| **SendTargetSelector** | 发送目标选择 | modelValue(targetId), connectionType | P1 |
| **FrameSelector** | 帧选择下拉 | modelValue(frameId), direction, searchable | P1 |
| **ChartWidget** | 图表容器 | type, data, options, loading | P2 |

**DataTable 关键能力**:
- client模式: 全量数据 + virtual-scroll（行数≤1000）
- server模式: QTable @request + feature service分页/排序（行数>1000）
- 空状态 #no-data slot, loading prop, selection prop
- row-key 必须稳定唯一标识符

**不提前建**: FormBuilder, ConfirmDialog(用$q.dialog()), FormDialog, ActionButtonGroup
**归feature**: ParameterTable→display, ConnectionConfigForm→connection, FieldEditor→frame

---

## D4 实时数据展示架构

```
receive service
    │ 16ms routingTick
    ▼
DisplayService.ingestSourceMaterial()
    │ 写入 buffer (非响应式)
    ▼
DisplayService.recomputeSnapshot()
    │ 计算 projection → 更新 state
    ▼
DisplaySelectors (只读快照)
    │ selectTable1Rows(), selectChartSeries()
    ▼
useDisplayRefresh (features/display/composables/)
    │ rAF + cadenceMs(默认200ms)
    │ pendingChanges 标记位
    │ shallowRef 整组替换
    ▼
Vue 组件 (props 驱动)
    │ DataTable + ChartWidget + ScatterWidget
    ▼
DOM (Quasar + ECharts)
```

**关键参数**:
| 场景 | cadenceMs | 实现方式 |
|------|-----------|---------|
| 默认 | 200ms | rAF + cadence 节流 |
| 快速过程 | 100ms | cadenceMs: 100 |
| 慢速过程 | 1000ms | cadenceMs: 1000 |
| 后台/最小化 | 暂停 | document.hidden 检测 |

**视觉反馈**:
- 值变化: CSS @keyframes value-flash 600ms
- 告警: StatusBadge critical→negative+闪烁, warning→warning+背景色
- 数据过期: opacity:0.6 + grayscale + 时间戳
- 后台恢复: 补偿更新

---

## D5 暗色模式策略

**决策**: 只做暗色（默认唯一主题），不实施双主题切换

**实施**:
- 将现有 --rw-color-surface-* 值改为暗色值（深灰/深蓝灰背景）
- 将 --rw-color-text-* 值改为浅色值
- Quasar brand 色保持不变
- 图表6色保持不变（暗色背景下对比度充足）
- 不引入 body--dark 双层结构

**后续**: 如需亮色模式，需全局重构token为 :root + .body--dark 双层结构

---

## D6 路由表

```typescript
// routes.ts
const routes = [
  {
    path: '/',
    component: () => import('app/AppShell.vue'),
    children: [
      { path: '', name: 'home', component: () => import('pages/HomePage.vue') },
      { path: 'connection', name: 'connection', component: () => import('pages/ConnectionPage.vue') },
      {
        path: 'frames',
        children: [
          { path: '', name: 'frame-list', component: () => import('pages/FrameListPage.vue') },
          { path: 'editor/:frameId?', name: 'frame-editor', component: () => import('pages/FrameEditorPage.vue') },
          { path: 'send', name: 'frame-send', component: () => import('pages/SendPage.vue') },
        ],
      },
      { path: 'display', name: 'display', component: () => import('pages/DisplayPage.vue') },
      { path: 'receive/config', name: 'receive-config', component: () => import('pages/ReceiveConfigPage.vue') },
      { path: 'history', name: 'history', component: () => import('pages/HistoryPage.vue') },
      { path: 'command-ingress', name: 'command-ingress', component: () => import('pages/CommandIngressPage.vue') },
      { path: 'storage', name: 'storage', component: () => import('pages/StoragePage.vue') },
      { path: 'settings', name: 'settings', component: () => import('pages/SettingsPage.vue') },
    ],
  },
];
```

---

## 标识对齐

路由参数与feature ID类型对齐:
- /frames/editor/:frameId → FrameAsset.frameId
- 未来 /tasks/:taskId → TaskDefinition.taskId（需调整task types）

---

## 与 display-ui-design 对齐

| 项 | 状态 | 说明 |
|----|------|------|
| DisplayPage 独立页面 | ✅ 一致 | 本设计 /display 路由 |
| DataTable + virtual-scroll | ✅ 一致 | Widget 清单已包含 |
| ChartWidget 纯 props | ✅ 一致 | Widget 清单已包含 |
| rAF + cadence 刷新 | ✅ 一致 | D4 完全对齐 |
| useDisplayRefresh 位置 | ⚠️ 调整 | 改为 features/display/composables/ |
| useHistoryQuery 位置 | ⚠️ 调整 | 改为 features/display/composables/ |
| --rw-space-panel-gap | ⚠️ 调整 | 复用已有 --rw-space-1 (4px) |
| 图表色板 6 色 | ✅ 一致 | 暗色背景下可读 |
| 录制按字段级别 | ✅ 一致 | 不变 |
