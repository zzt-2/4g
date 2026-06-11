# 图表累积重构 + 死代码清理计划

> 2026-06-12 | 实施完成+运行时调试 | active
> 来源: S001 S005 诊断 | 交接目标: 图表运行时问题排查

## 目标

修复 display feature 图表永远无数据问题（`projectChartSeries` 永远返回 `points: []`），同时清理因此产生的死基础设施代码。

核心思路：**将图表时序累积从 projection/service 层移到 composable 层**，用最简 `Map<string, number[]>` 实现滚动 buffer，删除因"假装有图表数据流"而产生的死函数/类型字段/clone/selectors。

## 已完成边界

### S005 UI 修复（已完成）
- 排序/列设置按钮加 `v-if="mode === 'table'"` 
- 移除 `sortable: true`
- `_reorder` 列仅在 reorderMode 时出现
- `allFrames` → `receiveFrames` 过滤发送帧
- 行高 48→36

### S002 图表累积重构（已完成，lint+test 通过）

**Phase 1 — composable 累积**（`use-display-refresh.ts`）：
- 新增 `chartBuffer: Map<string, {fieldName, points: ChartPoint[]}>`
- 每次 refresh 调 `service.getSourceFields()` 取未过滤数据
- 按 chart selectedItems 追加 numeric value，超 maxPoints 裁头部
- selectedItems 变更时清 buffer（signature 检测）
- 构建 `ChartInstanceProjection[]` 暴露

**Phase 2 — 删死代码**：
- `projection.ts`：删 `projectChartSeries` + `projectChartInstances`
- `clone.ts`：删 3 个 chart clone 函数
- `display-selectors.ts`：删 `selectChartInstances` + `selectChartSeries`
- `display-service.ts`：删 `getChartInstances` + `getChartSeries`，新增 `getSourceFields()`
- `types.ts`：`DisplayProjection` 去掉 `charts` 字段
- `defaults.ts` / `fixtures` / `index.ts` 连带清理

**Phase 3 — 测试修复**：4 文件更新，零新增失败

## 运行时问题（待排查）

### 症状 1：图表依然不出数据

**可能根因**：
- 没有数据流过 receive 管线 → `buffer.sourceFields` 永远空
- 数据在流但帧没匹配 → `fanOutToDisplay` 只处理 `matched` outcomes

**调试步骤**（下轮优先）：
1. 看 DisplayPage UI 的"匹配率/已匹配/未匹配"计数器
   - 全 0 → 数据没进来（receive 配置/串口问题）
   - 有"未匹配"无"已匹配" → 帧定义没匹配上
   - 有"已匹配"但图空 → bridge/composable 链路问题
2. 在 `receive-display-bridge.ts` 的 `fanOutToDisplay` 加 console.log 看 fields 数量
3. 在 `display-service.ts` 的 `ingestSourceMaterial` 加 log 看 buffer 是否更新
4. 在 composable 的 `refreshCharts` 加 log 看 sourceFields 长度

### 症状 2：图例显示随机 ID（如 `Y05eqFmYqrpIBnjq22Wtd`）

**根因**：fieldName 查找依赖运行时数据（sourceFields），而非帧定义。

composable 里：
```typescript
fieldName: entry?.fieldName ?? field?.fieldName ?? key.split(':').pop() ?? key
```
sourceFields 为空时回退到 `key.split(':').pop()` → 显示 fieldId 末段（可能是 UUID）。

**修复方向**（下轮讨论后决定）：
- **方案 A**：chart preference selectedItems 改存 `{fieldId, fieldName}` 对象（干净但改 preference shape，需迁移）
- **方案 B**：DisplayPage 用 `availableFields` 构建 name lookup Map，enrich chart series 后传给 DisplayPanel（不动 preference，composable 不变）

推荐方案 B——不动 preference shape，最小改动。DisplayPage 已有 `availableFields` computed（fieldId → fieldName/frameName），只需在 chart1/chart2 computed 里 enrich series。

## 不要做什么

- **不要删 `ChartPoint` / `ChartSeriesProjection` / `ChartInstanceProjection` 类型**——history 页面（`useHistoryData.ts`）合法消费它们
- **不要改 WaveformChart.vue 的 prop 类型**——DisplayPanel 和 HistoryPage 都用它，类型契约不变
- **不要把累积逻辑放进 service 或 projection 层**——那是死代码的产生根源
- **不要为 buffer 加复杂清理逻辑**——简单在 selectedItems 变更时清空即可

## 必读

1. `rewrite/src/features/display/composables/use-display-refresh.ts` — 累积逻辑（已实施）
2. `rewrite/src/features/display/services/display-service.ts` — `getSourceFields()` 方法
3. `rewrite/src/pages/DisplayPage.vue` — `availableFields` computed（方案 B 的 enrich 落点）
4. `rewrite/src/pages/history/useHistoryData.ts` — 类型保留的证据

## 下一轮

1. 确认 receive 管线是否在跑（看 UI 计数器）
2. 如数据在流但图空，加 log 定位断点
3. 实施图例名字修复（方案 B：DisplayPage enrich chart series）
4. 运行时验证

### 验证命令

```bash
pnpm -C rewrite lint
pnpm -C rewrite test -- --run
```

当前状态：lint 零 display 相关 error，tests 零新增失败。
