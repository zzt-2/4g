# 接收帧分组管理 Feature 实施与修复

> 状态: active | 创建: 2026-06-11 | 最后更新: 2026-06-11 S004 持久化+UI重构+图表弹窗

## 进展线索

- **S001** 初始实施 (06-11)：6 步完成 display-group-management feature — 名词层/编排骨架/持久化/静态结构/交互逻辑/联调收尾。design.md + checklist.yaml 全 done/pass
- **S002** 代码质量修复 (06-11)：审查发现 7 严重 + 4 中等问题，按 S5→S4+S6→S7+M2→S2+S3→M1+M3+M4→B1-B4→S1 顺序修复
- **S003** 运行时问题修复 (06-11)：用户反馈选分组后表格为空、折线图字段选择始终为空。根因：availableFields 仅取 receive 方向帧 + 无数据时无占位行
- **S004** 持久化 + UI 重构 (06-11)：修复持久化缺失 bug、chart 字段列表不响应 bug、图表配置弹窗改为 tab + chip 卡片

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

## 未决项

- **持久化未生效**：代码已加 `persistDisplay()` 调用，与其他页面模式一致。但用户反馈分组仍不持久化。可能原因：(1) Electron dev 模式热重载时序问题 (2) LazyPersistence delegate 未设置 (3) 文件写入静默失败。需用户确认 Electron DevTools 控制台是否有 `[persistence]` 或 `[bootstrap]` 错误。
- 前端规范合规检查：UI 改动需对照 rewrite-frontend-conventions / checklist / quickref（这些文件可能尚未创建）

## 当前位置

S004 持久化 + UI 重构完成（lint+test 通过）。用户反馈持久化仍未生效，待下轮压缩上下文后继续排查。需用户提供 Electron DevTools 控制台日志。
