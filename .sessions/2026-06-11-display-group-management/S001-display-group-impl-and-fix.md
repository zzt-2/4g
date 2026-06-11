# 接收帧分组管理 Feature 实施与修复

> 状态: active | 创建: 2026-06-11 | 最后更新: 2026-06-12 S005 图表+UI全面诊断

## 进展线索

- **S001** 初始实施 (06-11)：6 步完成 display-group-management feature — 名词层/编排骨架/持久化/静态结构/交互逻辑/联调收尾。design.md + checklist.yaml 全 done/pass
- **S002** 代码质量修复 (06-11)：审查发现 7 严重 + 4 中等问题，按 S5→S4+S6→S7+M2→S2+S3→M1+M3+M4→B1-B4→S1 顺序修复
- **S003** 运行时问题修复 (06-11)：用户反馈选分组后表格为空、折线图字段选择始终为空。根因：availableFields 仅取 receive 方向帧 + 无数据时无占位行
- **S004** 持久化 + UI 重构 (06-11)：修复持久化缺失 bug、chart 字段列表不响应 bug、图表配置弹窗改为 tab + chip 卡片
- **S005** 图表+UI全面诊断 (06-12)：持久化已修复。全面排查发现 8 项问题

## 已确认结论

### 设计决策

| 项 | 决策 |
|----|------|
| 分组过滤位置 | bridge 层（不改 projection 签名） |
| 归属 | display feature 内部 |
| 数据格式 | `DisplayGroupConfig { id, label, frames: DisplayGroupFrameEntry[] }` |
| 持久化 | 扩展 DisplayPreferences，完整偏好持久化 |
| UI | 弹窗 rw-dialog-lg，DisplayPanel 设置按钮触发 |
| 空字段语义 | visibleFieldIds=[] = 显示全部（显式勾选后才过滤） |
| dataItemId 格式 | `frameId:fieldId`（解决多帧同组冲突） |
| 图表字段选择 UI | 按帧分 tab + chip 卡片点选，rw-dialog-lg |

### S002 修复清单

| ID | 问题 | 修复方案 | 涉及文件 |
|----|------|---------|---------|
| S1 | 无测试 | 新建 group-resolution.spec.ts + receive-display-bridge.spec.ts | 新建 2 文件，14 cases |
| S2 | 跨 group 重复 frameId 未校验 | normalizeGroupConfigs 加 globalFrameIds Set | normalize.ts |
| S3 | 模板内联函数未缓存 | 提取 fieldsByFrame computed Map | GroupConfigDialog.vue |
| S4 | visibleFieldIds=[] 字段全丢 | `size > 0 && !has()` 才过滤 | receive-display-bridge.ts |
| S5 | 多帧同组 dataItemId 冲突 | dataItemId 改为 `frameId:fieldId` | bridge, fixtures, tests |
| S6 | 删分组后 buffer 幽灵数据 | groups 变更时清空 buffer | display-service.ts |
| S7 | chart/scatter key stale | buffer 清空后 projection 自然重建 | display-service.ts |
| M1 | 表格无帧名列 | panelTableColumns 新增 frameId 列 | display-columns.ts |
| M2 | selectedGroupId 残留 | saveGroupConfig 检测并重置无效 ID | DisplayPage.vue |
| M3 | availableFields 从已过滤 projection 构建 | 从 groups + frameReader 构建全量 | DisplayPage.vue |
| M4 | 持久化范围过窄 | 完整 DisplayPreferences 持久化 | persistence.ts, rewriteRuntime.ts |
| B1 | bg-blue-1 硬编码 | rw-surface-selected | GroupConfigDialog.vue |
| B2 | FrameGroupMapping 无消费者导出 | 移除 | index.ts |
| B3 | 内联 confirmDelete | $q.dialog() | GroupConfigDialog.vue |
| B4 | groupId Date.now() | crypto.randomUUID() | GroupConfigDialog.vue |

### S003 修复清单

| 问题 | 根因 | 修复 |
|------|------|------|
| 折线图字段选择始终为空 | `availableFields` 仅用 `receiveFrames`（direction: 'receive'），非 receive 帧不出现 | 新增 `allFrames` computed（`listFrames()` 不限方向），`availableFields` 从 `allFrames` 构建 |
| 选分组后表格完全为空 | buffer 仅存 live data，无数据流时 projection 为空 | 新增 `buildPlaceholderRows()` 从帧定义生成占位行（displayValue: `-`），`panel1Rows`/`panel2Rows` 合并 live + placeholder |
| 图表字段选择显示 ID | label 格式为 `fieldName (groupId:frameId:fieldId)` | 改为 `帧名 - 字段名` |
| 图表字段不按分组过滤 | `availableFields` 返回全量，未关联面板 selectedGroupId | 新增 `chartAvailableFields` computed，按面板 selectedGroupId + visibleFieldIds 过滤 |

### S004 修复清单

| 问题 | 根因 | 修复 | 涉及文件 |
|------|------|------|---------|
| 分组配置不持久化 | DisplayPage 所有 updatePreferences 调用后无 saveDisplayPreferences | 新增 `persistDisplay()` 函数，所有偏好变更后调 `runtime.persistence.saveDisplayPreferences()` | DisplayPage.vue |
| ChartConfigDialog 字段列表不响应 prop 变化 | `fieldOptions` 是 IIFE 非 computed，组件创建时算一次后不更新 | IIFE 改为 `computed()` | ChartConfigDialog.vue |
| 图表配置弹窗 UI 丑陋 | 使用 q-select 多选下拉框，ID 不直观 | 重写为 q-tabs（按帧分 tab）+ q-chip 卡片点选，dialog 改 rw-dialog-lg | ChartConfigDialog.vue |
| FieldOption 缺少 frameId | 无法按帧分组 | availableFields/chartAvailableFields 条目加 frameId 字段 | DisplayPage.vue, 两个 Dialog |

### 验证证据

- lint: 2 pre-existing errors（shallowRef, chartConfigTarget unused）
- test: 1394 pass, 2 fail（全部已有：connection pilot + frame serialization pilot）
- 新增测试: 14 cases（group-resolution 7 + bridge 7）

### S005 诊断清单 (06-12)

| # | 问题 | 严重度 | 根因 | 位置 |
|---|------|--------|------|------|
| 1 | 图表永远无数据 | 致命 | `projectChartSeries()` 永远返回 `points: []`，系统无时序累积 | `projection.ts:82` |
| 2 | 图例显示原始 ID | 高 | buffer 无匹配 field 时回退到 fieldId | `projection.ts:79` |
| 3 | 全部分组含发送帧 | 中 | `availableFields` 用 `allFrames` 不限方向 | `DisplayPage.vue:95` |
| 4 | 排序/列设置按钮非表格模式仍出现 | 高 | 缺 `v-if="mode === 'table'"` | `DisplayPanel.vue:148,160` |
| 5 | 排序箭头不工作 | 高 | `sortable: true` 但无 sort 事件处理 | `display-columns.ts:87` |
| 6 | 排序箭头空占位 | 中 | Quasar sortable 始终预留空间 | Quasar 行为 |
| 7 | _reorder 列始终占 72px | 中 | 列定义固定 width，非排序模式也占 | `display-columns.ts:108` |
| 8 | 表格行高偏大 | 低 | `virtualScrollItemSize: 48` | `DataTable.vue:20` |

### Buffer 垃圾分析

- `ingestSourceMaterial` 每次**整体替换** buffer，不是追加 → 无跨 batch 累积
- 单 batch 内全分组字段都存 → 浪费但不影响正确性
- 切换 `selectedGroupId` 不清 buffer → 只有改 groups 配置才清
- 结论：**不是泄漏，是浪费**，优先级低

## 未决项

- **图表时序累积**（#1 致命）——需设计最小代码量方案，用户强调代码质量
- **图例原始 ID**（#2）——与 #1 关联
- 前端规范合规检查

## 当前位置

S005 诊断完成，即将开始 UI 修复（#3-#8）。图表累积待设计讨论。
