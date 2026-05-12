---
doc_type: brainstorm
feature: rewrite-display
scope: ui-page-layer
status: draft
date: "2026-05-11"
summary: display feature UI 页面层 brainstorm — 页面结构、组件选型、实时更新策略、交互设计。基于 9 个 explore agent 的并行事实收集。
direct_contract:
  - "codestable/quality/rewrite-frontend-conventions.md"
  - "codestable/quality/rewrite-frontend-checklist.md"
boundary_guards:
  - "codestable/features/rewrite-display/rewrite-display-design.md（feature core 设计，不覆盖）"
  - "codestable/architecture/rewrite-target-structure.md"
  - "CLAUDE.md（rewrite 总原则、UI 样式规则、selector 不可变约束）"
---

# Display UI 页面层 brainstorm

## 前置说明

`rewrite/src/features/display/` core/service/selector 层已完成（17 文件，291 行测试），本文只设计 UI 页面层如何消费 display public API 构建可视化页面。不重复 feature core 设计。

## 直接合同

- `codestable/quality/rewrite-frontend-conventions.md` — UI 规范
- `codestable/quality/rewrite-frontend-checklist.md` — 自检清单

---

# 第一层：事实

## 1.1 旧系统可观测行为清单

### 1.1.1 页面入口与布局

| # | 行为 | 证据位置 | 用户可见效果 |
|---|------|----------|-------------|
| L1 | ReceiveFramePage 提供 edit/display 模式切换 | `src/pages/ReceiveFramePage.vue:13-18` | 顶部按钮切换，左侧 group manager + 右侧 display container |
| L2 | 双面板布局（table1 + table2），4px gap | `DataDisplayContainer.vue:176-256` | 左右并列两个独立显示区域 |
| L3 | 每个面板独立：displayMode、selectedGroupId、配置 | `DataDisplayContainer.vue:181-182` | 面板间完全独立操作 |
| L4 | 底部 recording controls | `RecordingControls.vue:33-82` | 开始/停止记录按钮 + 统计信息 |
| L5 | 三种显示模式：table / chart / special | `DisplayModeToggle.vue:22-64` | 三个图标按钮切换 |

### 1.1.2 表格行为

| # | 行为 | 证据位置 | 用户可见效果 | 旧问题 |
|---|------|----------|-------------|--------|
| T1 | 6 列：编号/名称/值/十六进制/收藏/操作 | `DataTable.vue:32-84` | 参数表格显示 | 列定义内联，无法复用 |
| T2 | 500ms 全量刷新 | `DataTable.vue:108-110` | 值实时更新 | 即使数据未变也全量替换 |
| T3 | 每行 hex 转换无缓存 | `dataDisplayStore.ts:297` | 十六进制列 | 50 行 × 2 次/秒 = 100 次 hex 计算 |
| T4 | 行排序（上移/下移） | `OrderControls.vue:49-63` | 行顺序调整 | — |
| T5 | 收藏标记 | `DataTable.vue:194` | 星标图标 | — |
| T6 | 分组下拉选择 | `TableControls.vue:28-44` | "分组名 (项数)" 格式 | — |
| T7 | 空状态处理 | `DataTable.vue` | 未选分组/无数据提示 | — |
| T8 | 虚拟滚动（但 slice-size=10） | `DataTable.vue:150-151` | 大数据量滚动 | 配置偏小，效果有限 |

### 1.1.3 折线图行为

| # | 行为 | 证据位置 | 用户可见效果 | 旧问题 |
|---|------|----------|-------------|--------|
| C1 | ECharts 折线图，多系列 | `UniversalChart.vue:527-628` | 实时曲线 | — |
| C2 | 增量 setOption (notMerge: false) | `UniversalChart.vue:680-698` | 平滑更新 | — |
| C3 | 滑动窗口 maxPoints=500 | `UniversalChart.vue:228-236` | 最多 500 点 | — |
| C4 | 等间隔采样 (interval=2) | `UniversalChart.vue:388-486` | 数据稀疏化 | 过早优化 |
| C5 | 多层定时器嵌套 | store 1s → watch → chart update | 数据驱动图表 | 定时器不同步，内存泄漏风险 |
| C6 | 设置对话框 3 tab | `UniversalChartSettingsDialog.vue:194-220` | 数据选择/图表配置/性能配置 | — |
| C7 | 统计面板 (mean/RMSE) | `UniversalChart.vue:793-815` | 右侧浮动统计 | — |
| C8 | 垂直图例 | `UniversalChart.vue:564-583` | 左侧图例列表 | — |

### 1.1.4 星座图行为

| # | 行为 | 证据位置 | 用户可见效果 | 旧问题 |
|---|------|----------|-------------|--------|
| S1 | ECharts scatter | `SpecialConstellationChart.vue:54-60` | IQ 散点图 | — |
| S2 | I/Q 数据源配置 | `ScatterPlotConfigDialog.vue:82-103` | 帧+字段选择 | — |
| S3 | bitWidth 决定坐标范围 | `SpecialConstellationChart.vue:24-27` | 如 12bit → [-2048, 2047] | — |
| S4 | 无数据上限 | `dataDisplayStore.ts:869, 880` | 持续累积 | **严重问题**：长时间运行内存溢出 |
| S5 | 独立刷新定时器 | `dataDisplayStore.ts:899-905` | 配置的 refreshInterval | — |
| S6 | 每次全量 setOption (notMerge: true) | `SpecialConstellationChart.vue:78` | 重建图表 | 性能差 |
| S7 | 配置对话框：bitWidth/sampleCount/pointSize/refreshInterval | `ScatterPlotConfigDialog.vue:107-112` | 参数配置 | — |

### 1.1.5 录制行为

| # | 行为 | 证据位置 | 用户可见效果 |
|---|------|----------|-------------|
| R1 | 开始/停止按钮 | `RecordingControls.vue:37-53` | 播放/停止图标 |
| R2 | 状态指示 + 统计 | `RecordingControls.vue:59-79` | 记录数、运行时间 |
| R3 | 5 分钟定时保存 | `dataDisplayStore.ts:597-640` | 后台自动保存 |

### 1.1.6 数据持久化

| # | 行为 | 证据位置 | 用户可见效果 |
|---|------|----------|-------------|
| P1 | table1/table2 config 持久化 | `dataDisplayStore.ts:118-128` | 跨会话保持配置 |
| P2 | scatter config 持久化 | `dataDisplayStore.ts:131-147` | 跨会话保持 IQ 配置 |
| P3 | performance config 持久化 | `DataDisplayContainer.vue:25` | 跨会话保持性能设置 |

## 1.2 新系统现状

### 1.2.1 display feature 已有能力

| 能力 | 实现位置 | 状态 |
|------|----------|------|
| 类型定义（DisplayMode/Preferences/Projection/Snapshot） | `core/types.ts` (153 行) | ✅ 完整 |
| 默认配置 | `core/defaults.ts` | ✅ 完整 |
| 深拷贝（所有类型） | `core/clone.ts` | ✅ 完整 |
| 验证 | `core/validation.ts` | ✅ 完整 |
| 规范化 + patch 合并 | `core/normalize.ts` | ✅ 完整 |
| 投影计算（table/chart/scatter） | `core/projection.ts` | ✅ 完整 |
| state 容器 | `state/display-state.ts` | ✅ 完整 |
| selector（6 个只读） | `selectors/display-selectors.ts` | ✅ 完整 |
| service（ingestSourceMaterial/updatePreferences/clear/reset） | `services/display-service.ts` | ✅ 完整 |
| fixtures | `fixtures/display-fixtures.ts` | ✅ 完整 |
| 291 行测试 | `display-core-service-state-selector.spec.ts` | ✅ 通过 |
| receive-display bridge | `runtime/bridges/receive-display-bridge.ts` | ✅ 已集成到 routingTick |

### 1.2.2 display feature 缺失能力

| 缺失 | 影响 | 修复位置 |
|------|------|----------|
| **chartHistory 从未累积** | 图表无法显示历史曲线 | `display-service.ts` ingestSourceMaterial |
| **scatter 只返回单点** | 星座图只有 1 个点 | `projection.ts` projectScatter |
| UI 页面 | 用户无法看到任何数据 | 新建 pages/widgets |
| ECharts 封装 | 无图表渲染能力 | 新建 composable + widget |

### 1.2.3 上游 API（display 可消费）

```
DisplayService
  ├─ getSnapshot() → ReadonlyDisplaySnapshot
  ├─ getTable1Rows() → TableRowProjection[]
  ├─ getTable2Rows() → TableRowProjection[]
  ├─ getChartSeries() → ChartSeriesProjection[]
  ├─ getScatterProjection() → ScatterProjection
  ├─ ingestSourceMaterial(material) → DisplayOperationResult
  └─ updatePreferences(patch) → DisplayOperationResult
```

所有 selector 返回值均为 readonly 深拷贝，符合不可变约束。

## 1.3 前端规范约束

### 1.3.1 表格约束（必须遵守）

- T1: QTable，行数 >100 必须开 virtual-scroll
- T2: 列数 ≥3 抽到 columns.ts
- T3: 大数据集排序/分页走 service 层
- T4: 空状态 #no-data slot，loading :loading prop
- T5: 行选中用 QTable selection，选中色走 token

### 1.3.2 性能约束（全部来自旧系统踩坑）

- P1: 高频数据必须缓冲后批量刷新（rAF 16ms）
- P2: 大数组用 shallowRef，整组替换
- P3: 禁止 deep watch 大对象
- P4: computed 返回对象/数组必须引用稳定
- P5: 定时器用 rAF，不用 setInterval
- P6: v-for 用稳定唯一 key
- P7: 仪表盘用 v-memo
- P8: 模板禁止内联 .filter()/.map()/.reduce()

### 1.3.3 数据展示约束

- V1: 数字格式化（千分位、有效精度），函数放 shared/
- V2: 时间格式 YYYY-MM-DD HH:mm:ss
- V3: 状态用 QBadge + 状态色，空值显示 `--`
- V4: 物理量标注单位，长文本截断 + QTooltip

### 1.3.4 CSS token 可用量

**已有 token 覆盖 display 需求**：
- 颜色：surface-app/header/base/selected、text-primary/default/secondary/muted、status-success/warning/danger/info
- 间距：space-0 到 space-6，page/page-compact
- 字体：font-size caption(12)/label(13)/body(14)/title-sm(16)/title-lg(28)
- 圆角：radius-panel(8)/control(8)
- 边框：border-width-subtle(1px)
- 阴影：shadow-focus
- z-index：app-header(1000)/drawer(999)/sticky-action(10)

**需要新增的 token**：
- chart 专用色板（多系列区分色）
- 表格行高（virtual-scroll item-size）
- 面板间距（双面板 gap）

## 1.4 依赖状态

| 依赖 | 状态 | 阻塞性 |
|------|------|--------|
| ECharts | ❌ 未安装 | 是（图表/星座图必须） |
| display chartHistory 累积 | ❌ 未实现 | 是（图表数据源） |
| display scatter 多点采样 | ❌ 未实现 | 是（星座图轨迹） |
| receive feature | ✅ 已完成 | 否（bridge 已集成） |
| storage feature | ✅ 基本完成 | 否（history 查询可 deferred） |
| frame feature | ✅ 已完成 | 否（元数据可消费） |

---

# 第二层：决策

## D1: Feature 命名与目录

**现状**：roadmap 称 visualization，代码目录 display/，已有 17 文件完整实现。

**决策**：沿用 `display/`。不创建 visualization/。UI 组件放 `pages/` 和 `widgets/`。

**原因**：display feature 已有完整类型和服务，新建 visualization 会造成两套类型和 API 并存。

## D2: 页面结构

**现状**：旧系统在 ReceiveFramePage 内用 edit/display 模式切换。全局规划 §14.3 显示 display 属 Wave 5。

**决策**：创建独立 `DisplayPage.vue`，不嵌入 ReceivePage。

**原因**：
- display 消费 receive 数据，但页面职责不同（receive 管"收什么"，display 管"怎么看"）
- 独立页面符合 target-structure 中 pages/ 职责（路由页面 + 页面级布局）
- 旧系统 edit/display 模式切换是 UI 耦合 evidence，不保留

**页面结构**：

```
DisplayPage.vue
├── 顶部工具栏
│   ├── 页面标题
│   ├── recording controls
│   └── 全局操作（清空、刷新）
├── 双面板容器（左右）
│   ├── Panel 1
│   │   ├── DisplayModeToggle（table/chart/special）
│   │   ├── GroupSelector（分组下拉）
│   │   ├── DataTable / ChartWidget / ScatterWidget（按模式切换）
│   │   └── SettingsButton（打开配置弹窗）
│   └── Panel 2（同上）
└── 配置弹窗层
    ├── ChartSettingsDialog
    └── ScatterSettingsDialog
```

## D3: 表格方案

**现状**：旧 DataTable 500ms 全量刷新 + 每行 hex 转换 + 列定义内联。新系统 display service 已提供 `selectTable1Rows()` / `selectTable2Rows()`。

**决策**：

| 维度 | 方案 | 替代旧做法 |
|------|------|-----------|
| 组件 | QTable + virtual-scroll | 同（但配置正确） |
| 数据源 | display selector `selectTable1Rows()` | 旧 500ms polling getTableData() |
| 刷新 | rAF + throttle (refreshCadenceMs) | 旧 setInterval(fn, 500) |
| 列定义 | 抽到 `columns.ts` | 旧内联 6 列 |
| hex 转换 | display service 层完成，projection 返回 hexValue | 旧每次 getTableData 重新计算 |
| 行 key | `fieldId`（stable） | 同 |
| 虚拟滚动 | virtual-scroll + item-size=40 | 同但 item-size 合理化 |

**列定义**（columns.ts）：

| 列 | field | align | width | 备注 |
|----|-------|-------|-------|------|
| # | index | center | 48px | 序号 |
| 数据名称 | fieldName | left | auto | 自适应 |
| 值 | displayValue | center | auto | 格式化值 |
| 十六进制 | hexValue | center | 120px | hex 显示 |
| 收藏 | isFavorite | center | 48px | 星标图标 |
| 操作 | actions | center | 80px | 上移/下移 |

**表格性能方案**：

```
display selector (rAF cadence)
  ↓ shallowRef rows
  ↓ v-memo per row (key = fieldId)
QTable virtual-scroll
```

不使用 setInterval 轮询。composable 内部用 rAF + throttle 读取 selector，数据不变不触发更新。

## D4: 折线图方案

**现状**：旧 UniversalChart 多层定时器嵌套 + ECharts。新系统缺 ECharts 依赖，display chartHistory 未累积。

**决策**：

### D4.1 ECharts 引入

- 新增 `echarts` 到 rewrite/package.json
- 创建 `useECharts` composable 管理 ECharts 实例生命周期
- 不使用 vue-echarts 等第三方封装

**原因**：ECharts 是旧系统唯一图表库，用户熟悉，重写不引入新库。vue-echarts 增加依赖但封装价值不大（display 已有自己的数据管道）。

### D4.2 图表组件

```
ChartWidget.vue
├── useECharts (composable)
├── 数据源: selectChartSeries()
├── 刷新: rAF + throttle
├── 配置: ECharts option builder（纯函数）
└── 交互: tooltip, legend, dataZoom
```

### D4.3 数据更新策略

**旧做法**：1s collectCurrentData → historyUpdateCounter++ → watch → setOption
**新做法**：

```
receive data → routingTick → fanOutToDisplay → ingestSourceMaterial
  ↓ (display service 内部累积 chartHistory)
selector getChartSeries() → rAF throttle → ECharts setOption
```

关键变化：
- **单层刷新**：UI 只在 rAF 回调读 selector，不再有 store → watch → chart 多层定时器
- **chartHistory 累积**：ingestSourceMaterial 中追加 ChartPoint（需修复 display service）
- **maxPoints 上限**：由 display preferences 控制，projection 已有 maxPoints 裁剪
- **采样**：由 display projection 层处理，不靠 ECharts sampling

### D4.4 统计面板

保留 mean/RMSE 统计，但移到图表组件内部用 computed 计算，不走独立 store。

## D5: 星座图方案

**现状**：旧系统无数据上限 → 内存溢出。新系统 scatter 只返回单点。

**决策**：

### D5.1 数据上限

新增 `scatter.maxPoints` 配置（默认 4096）。超过时用环形缓冲淘汰最早数据点。

**修复位置**：`display-service.ts` 的 scatter 缓冲区 + `projection.ts` 的 projectScatter。

### D5.2 组件

```
ScatterWidget.vue
├── useECharts (composable)
├── 数据源: selectScatterProjection()
├── 刷新: rAF + throttle
├── 坐标轴: 由 bitWidth 计算 range
└── tooltip: I/Q 值
```

### D5.3 更新方式

不再用 notMerge: true 全量重建。用 ECharts appendData 或增量 setOption。

## D6: 实时更新策略（核心）

**旧做法问题**：
1. 表格 500ms setInterval 全量替换
2. 图表 1s 数据收集 → watch → setOption
3. 星座图独立 refreshInterval 定时器
4. 三套定时器互不协调

**新做法**：单一 rAF 循环

```typescript
// useDisplayRefresh composable
function useDisplayRefresh(cadenceMs: number) {
  const lastTime = ref(0);
  let rafId: number;

  function loop(now: number) {
    if (now - lastTime.value >= cadenceMs) {
      // 读取 display selectors → 更新组件状态
      refreshDisplayData();
      lastTime.value = now;
    }
    rafId = requestAnimationFrame(loop);
  }

  onMounted(() => { rafId = requestAnimationFrame(loop); });
  onUnmounted(() => { if (rafId) cancelAnimationFrame(rafId); });
}
```

**好处**：
- 单一定时器源，UI 刷新频率统一
- rAF 天然与屏幕刷新率同步，不会过度渲染
- cadenceMs 可通过 preferences 配置
- 组件卸载自动清理

## D7: 配置对话框方案

**旧做法**：UniversalChartSettingsDialog（3 tab）、ScatterPlotConfigDialog（独立对话框）

**决策**：QDialog + QTabPanels 封装

| 对话框 | Tabs | 配置项 | 数据流 |
|--------|------|--------|--------|
| ChartSettingsDialog | 数据选择 / 图表配置 / 性能 | selectedItems, Y轴, maxPoints, 采样 | display.updatePreferences(patch) |
| ScatterSettingsDialog | 无 tab | I/Q source, bitWidth, sampleCount, pointSize, refreshInterval | display.updatePreferences(patch) |

数据流：用户修改 → patch → display.updatePreferences() → selector 自动更新 → UI 刷新

## D8: 录制控制

**决策**：录制控制由 storage feature own（persistence truth），display 只提供 UI 触发按钮和状态展示。

```
RecordingControls.vue
├── 状态展示: storage selector 读取录制状态
├── 触发: storage public command
└── 不再由 display 管理录制定时器
```

## D9: 持久化

**决策**：display 偏好持久化通过 settings feature（settings 只存事实，display 解释语义）。

**现状**：settings 当前无 display 偏好字段（只有 recording/storage/general），需扩展。
**变化**：SettingsSnapshot 新增 display 子结构（table1/table2/chart/scatter/recording），作为前置依赖。

## D10: 录制方式

**现状**：旧系统全量记录（所有分组所有数据项），无选择性。自动录制由 settingsStore.autoStartRecording 控制。
**决策**：新系统支持按字段级别选择录制，per 接收帧粒度控制。默认不录制。用户在每个接收帧的配置中选择哪些字段参与录制。

## D11: History 页面

**现状**：旧 HistoryAnalysisPage 左右分栏（控制面板 + 图表区），1-4 图表垂直堆叠，独立配置，无真正统计计算。
**决策**：新 HistoryPage 保留多图模式，不做星座图，不做实时刷新。包含 mean/RMSE 统计计算。

旧行为覆盖：
- ✅ 保留：多图 1-4、时间范围选择、数据项选择、独立配置、颜色循环
- ✅ 保留：CSV 导出（由 storage feature 提供）
- ✅ 新增：mean/RMSE 统计计算（computed 内实现）
- 🔽 简化：Y 轴默认 auto，不暴露性能配置 tab
- ❌ 删除：左侧面板拖拽调整宽度

## D12: 组件复用模型

**现状**：旧系统 UniversalChart 同时服务实时和历史两个模式，通过 props 区分。
**决策**：新系统 ChartWidget 纯 props 驱动（`series: ChartSeriesProjection[]`），不知道数据来自 display selector 还是 storage query。

复用分工：
- `useDisplayRefresh`（rAF 持续刷新）→ DisplayPage
- `useHistoryQuery`（一次性 storage 查询 + 转换）→ HistoryPage
- 两者都输出 `ChartSeriesProjection[]` → 同一个 ChartWidget

## D13: 数据身份标识统一（已结论）

**现状**：三个 feature 各用不同身份标识，已在新对话中讨论并统一。

**决策**：统一使用 `frameId + fieldId` 作为跨 feature 的唯一数据标识。display 的 `groupId` 就是 `frameId`，`dataItemId` 就是 `fieldId`。storage→display 转换使用 `resolveFrameIdentity(channel, fieldKey): { frameId, fieldId } | undefined`。

**详细决策和证据**：见 `codestable/features/rewrite-display/display-identity-brainstorm.md`。

## D14: CSS / 样式策略

### D14.1 需要新增的 token

```scss
// 颜色 - 图表系列色板（固定 6 色，不可配置）
--rw-color-chart-series-1: #60A5FA;  // blue
--rw-color-chart-series-2: #34D399;  // green
--rw-color-chart-series-3: #FBBF24;  // yellow
--rw-color-chart-series-4: #F87171;  // red
--rw-color-chart-series-5: #A78BFA;  // purple
--rw-color-chart-series-6: #FB923C;  // orange

// 尺寸 - 表格行高
--rw-size-table-row: 40px;

// 间距 - 双面板 gap
--rw-space-panel-gap: 4px;

// 尺寸 - 历史分析侧边栏
--rw-size-history-sidebar: 280px;
```

### D14.2 组件样式规则

- 表格：QTable 原生样式 + token 覆盖选中色
- 图表：ECharts backgroundColor transparent，颜色走 CSS 变量注入
- 面板：flat bordered card，间距走 space token
- 工具栏：页面级 spacing

## D15: display service 修复项

UI 设计暴露了 display service 需要修复的两个问题：

### D15.1 chartHistory 累积

`ingestSourceMaterial()` 需要追加 ChartPoint 到 chartHistory Map：

```typescript
// ingestSourceMaterial 内部新增：
for (const field of material.fields) {
  const key = `${field.frameId}:${field.fieldId}`;
  if (!buffer.chartHistory.has(key)) {
    buffer.chartHistory.set(key, []);
  }
  const points = buffer.chartHistory.get(key)!;
  points.push({ timestamp: now(), value: Number(field.value) || 0 });
  // maxPoints 裁剪
  if (points.length > preferences.chart.performance.maxPoints) {
    buffer.chartHistory.set(key, points.slice(-preferences.chart.performance.maxPoints));
  }
}
```

### D15.2 scatter 多点采样

projectScatter 和 display service 需要累积 IQ 采样点而非只保留最新一个：

```typescript
// display buffer 新增 scatterPoints 缓冲区
buffer.scatterPoints.push({ i, q });
if (buffer.scatterPoints.length > preferences.scatter.maxPoints) {
  buffer.scatterPoints = buffer.scatterPoints.slice(-preferences.scatter.maxPoints);
}
```

---

# 第三层：自检

## R1: 假设验证

| # | 假设 | 验证方式 | 结果 |
|---|------|----------|------|
| R1-1 | display selector 返回 readonly 深拷贝 | 读 display-selectors.ts + 测试 | ✅ 已验证，291 行测试含深拷贝验证 |
| R1-2 | receive-display bridge 已集成到 routingTick | 读 routing-tick.ts | ✅ 已验证，fanOutToDisplay 在 routingTick 中调用 |
| R1-3 | QTable 支持 virtual-scroll | Quasar 文档 | ✅ Quasar 原生支持 |
| R1-4 | ECharts 支持 Vue 3 tree-shakeable import | ECharts 文档 | ✅ `import * as echarts from 'echarts/core'` |
| R1-5 | display service 的 chartHistory 从未被写入 | 读 display-service.ts ingestSourceMaterial | ✅ 已确认是 bug，chartHistory Map 始终为空 |
| R1-6 | projectScatter 只返回单点 | 读 projection.ts | ✅ 已确认，当前只映射最后一个 field |
| R1-7 | Quasar QTable 支持 #no-data slot | Quasar 文档 | ✅ 原生支持 |
| R1-8 | rAF 可以替代 setInterval 做 UI 刷新 | 前端规范 P5 明确要求 | ✅ rAF 是规范要求的做法 |
| R1-9 | 旧表格 hex 转换每 500ms 重新计算 | 读 dataDisplayStore.ts:297 | ✅ getTableData() 中每次调用 convertToHex |
| R1-10 | display service 在 runtime 中可达 | 读 feature-wiring.ts + rewriteRuntime.ts | ✅ L3 装配，`useRewriteRuntime().features.displayService` |
| R1-11 | settings 有 display 偏好字段 | 读 settings/core/types.ts | ❌ **当前无 display 字段**，只有 recording/storage/general |
| R1-12 | storage records 可转为 DisplayFieldMaterial | 对比 StorageLocalRecord vs DisplayFieldMaterial | ✅ 已结论：通过 resolveFrameIdentity(channel, fieldKey) 映射到 frameId+fieldId |
| R1-13 | 旧录制支持选择性记录 | 读 dataDisplayStore.ts + settingsStore.ts | ❌ **旧系统全量记录**，无分组选择功能 |

## R2: 旧行为覆盖度检查

| 旧行为 | 新设计对应 | 覆盖状态 | 备注 |
|--------|-----------|---------|------|
| L1 edit/display 模式切换 | 独立 DisplayPage | **降级** | 旧 edit 模式（帧编辑）属 receive feature，display 只管展示 |
| L2 双面板布局 | DisplayPage 双面板 | ✅ 覆盖 | — |
| L3 面板独立配置 | 每面板独立 preferences | ✅ 覆盖 | — |
| L4 底部 recording controls | 页面工具栏中 | ✅ 覆盖 | 位置从底部改到工具栏 |
| L5 三种显示模式 | DisplayModeToggle | ✅ 覆盖 | — |
| T1 6 列表格 | columns.ts 6 列 | ✅ 覆盖 | hex 转移到 service 层 |
| T2 500ms 刷新 | rAF + refreshCadenceMs | ✅ 覆盖 | 性能更好 |
| T3 hex 转换 | display projection | ✅ 覆盖 | 预计算，不再每次刷新重新算 |
| T4 行排序 | QTable + service | ✅ 覆盖 | — |
| T5 收藏标记 | QTable slot | ✅ 覆盖 | — |
| T6 分组选择 | GroupSelector | ✅ 覆盖 | — |
| T7 空状态 | QTable #no-data | ✅ 覆盖 | — |
| C1 多系列折线图 | ChartWidget + ECharts | ✅ 覆盖 | — |
| C2 增量更新 | ECharts setOption | ✅ 覆盖 | — |
| C3 滑动窗口 | display projection maxPoints | ✅ 覆盖 | — |
| C5 多层定时器 | 单一 rAF 循环 | ✅ 改进 | 消灭定时器嵌套 |
| C6 设置对话框 3 tab | ChartSettingsDialog | ✅ 覆盖 | — |
| C7 统计面板 | 图表组件内 computed | ✅ 覆盖 | — |
| S1 星座图散点 | ScatterWidget | ✅ 覆盖 | — |
| S2 IQ 配置 | ScatterSettingsDialog | ✅ 覆盖 | — |
| S3 bitWidth 坐标范围 | projection 计算 | ✅ 覆盖 | — |
| **S4 无数据上限** | **环形缓冲 maxPoints** | ✅ **修复** | 解决内存溢出 |
| S5 独立定时器 | 统一 rAF | ✅ 改进 | — |
| R1-R3 录制控制 | storage 命令 + UI 按钮 | ✅ 覆盖 | 持久化归 storage |
| P1-P3 配置持久化 | settings API | ✅ 覆盖 | — |

**未覆盖（intentional）**：
- 旧 C4 等间隔采样（samplingInterval=2）：过度优化，新系统由 projection maxPoints 控制

**旧 History 页面覆盖**：

| 旧历史行为 | 新设计对应 | 覆盖状态 | 备注 |
|-----------|-----------|---------|------|
| 左右分栏（控制面板 + 图表区） | HistoryPage 同布局 | ✅ 覆盖 | — |
| 时间范围选择（日历 + 预设按钮） | HistoryTimeSelector | ✅ 覆盖 | 简化预设按钮 |
| 数据项选择（分组折叠 + 搜索） | HistoryDataSelector | ✅ 覆盖 | — |
| 多图 1-4 垂直堆叠 | 页面内多 ChartWidget | ✅ 覆盖 | — |
| 每图独立配置（数据项 + Y轴） | HistoryChartConfigDialog | ✅ 覆盖 | Y轴默认 auto |
| 颜色循环 12 色 | 固定 6 色 CSS token | 🔽 简化 | 6 色够用 |
| 图表统计面板 | 暂不实现 | ⏳ Deferred | 旧系统实际只有计数，无 mean/RMSE |
| CSV 导出 | storage feature 提供 | ✅ 覆盖 | 独立于 display |
| 左侧面板拖拽调整宽度 | 固定 280px | 🔽 简化 | 非核心交互 |

## R3: 反向挑刺

| # | 挑刺场景 | 风险 | 缓解 |
|---|---------|------|------|
| R3-1 | rAF 在后台 tab 被暂停 → display 数据堆积 | 中 | rAF 暂停时 display service 内部缓冲区仍累积，回到前台后一次 flush；需设 buffer 上限防溢出 |
| R3-2 | ECharts 实例在面板隐藏（v-if）时销毁 → 重建开销 | 低 | 图表面板用 v-show 而非 v-if（已在 DOM 中保持） |
| R3-3 | display preferences patch 粒度太粗 → 不必要全量投影重算 | 低 | patch 只改 table selectedFrameId 时，chart/scatter projection 不应重算；需检查 projection 函数是否有短路优化 |
| R3-4 | 双面板各开 chart → 两个 ECharts 实例同时刷新 | 中 | rAF 循环只触发一次 selector 读取，两个图表共享同一批数据；ECharts setOption 本身开销不大 |
| R3-5 | scatter bitWidth 从 8 改到 16 → 坐标轴范围剧变 → 已有数据点位置不对 | 低 | bitWidth 变更时清空 scatterPoints 缓冲区 |
| R3-6 | display service chartHistory 内存长期增长 | 中 | maxPoints 限制已有，但多 field × maxPoints 需评估；默认 500 points × 50 fields = 25000 entries，可接受 |
| R3-7 | QTable virtual-scroll 与动态行高冲突 | 低 | 固定行高（item-size=40），不允许动态行高 |
| R3-8 | 录制状态 display 不知道 → UI 按钮状态不同步 | 低 | recording 状态通过 storage selector 读取，不依赖 display |

---

# 决策汇总表

| ID | 决策 | 替代方案 | 原因 |
|----|------|---------|------|
| D1 | 沿用 display/，不建 visualization/ | 新建 visualization feature | 已有 17 文件完整实现 |
| D2 | 独立 DisplayPage | 嵌入 ReceivePage | 职责分离，旧耦合 evidence |
| D3 | QTable + virtual-scroll + columns.ts | 自定义表格组件 | 前端规范 T1 |
| D4 | ECharts + useECharts composable | vue-echarts / D3 / Chart.js | 沿用旧库，最小依赖 |
| D5 | scatter maxPoints=4096 环形缓冲 | 无上限（旧做法） | 修复内存溢出 |
| D6 | 单一 rAF 循环统一刷新 | 各组件独立 setInterval | 消灭多层定时器 |
| D7 | QDialog + QTabPanels 配置弹窗 | 自定义弹窗组件 | 前端规范 D1 |
| D8 | 录制归 storage feature，按分组选择 | display 管理全量录制 | storage owns persistence truth，用户要选择性录制 |
| D9 | Settings 扩展 display 偏好字段 | display 直接读写 localStorage | settings owns persisted truth |
| D10 | 录制默认不录制，用户选分组录制 | 全量录制（旧做法） | 用户需求 |
| D11 | HistoryPage 保留多图，不做星座图 | 全部复制旧功能 | 用户确认不需要星座图 |
| D12 | ChartWidget 纯 props 驱动，数据无关 | 组件内部读 selector | 两个页面复用，数据源不同 |
| D13 | storage→display 转换放 display/core/ | 放 storage | 输出类型是 DisplayFieldMaterial |
| D14 | 图表色板固定 6 色 CSS token | 用户可配置 | 用户确认不需要可配置 |
| D15 | 修复 display service chartHistory + scatter + hexValue | 新建 visualization service | 复用已有实现 |

---

# Open questions

1. ~~**数据身份标识统一**~~：已结论，统一使用 frameId+fieldId。详见 `display-identity-brainstorm.md`。
2. **录制配置 UI**：按字段级别选择录制，per 接收帧。具体 UI 交互待实施阶段确认（可能是帧配置页面的一个"录制"开关 + 字段选择列表）。
