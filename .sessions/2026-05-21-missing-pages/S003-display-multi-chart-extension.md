# [S003] 对话 B：历史分析 — display 扩展实施

> 2026-05-25 | 实施 | 已完成
> 2026-05-25 续接：压缩后代码质量审查 + 27 项修复 + 边界清除

## 目标

扩展 display feature 支持多图表实例(1-4) + Y轴配置，为历史分析页面提供 feature API 基础。

## 记录

### 直接合同

- S001 §历史分析关键发现 + §历史分析补充
- 边界护栏：R7（多图表偏好归 display，数据归 storage）+ R4

### 已完成

**Wave 1（9 agent 事实收集）：**
- B1-B3（Batch 1）：display types/service/design-doc
- B4-B6（Batch 2）：旧系统多图表模型/数据项选择/时间+CSV
- B7-B9（Batch 3）：storage 数据层/集测基线/UI 规范+组件

**Wave 2（设计）：**
- DC1: chart→charts[] 类型级扩展
- DC2: 元数据复用 frame 定义，不复建注册表
- DC3: ~~storage-display-bridge~~ → 历史页面 composable 做转换（用户确认去掉 bridge）
- DC4: Y轴配置归 display preferences
- DC5: 固定 6 色 CSS token

**Wave 3（自检 3 agent 并行）：**
- SC1 规范合规：PASS（WaveformChart 颜色硬编码是已有问题，留对话 C）
- SC2 质量规则：PASS（agent 报 REVISE REQUIRED 但多项判断有误）
- SC3 覆盖度：PASS（多图表 54.5%/数据项选择 85.7%/集测基线 100%）

**Phase 3 实施：**

改了 14 个文件，核心变更：

| 文件 | 变更 |
|------|------|
| `display/core/types.ts` | 新增 ChartInstancePreference/YAxisPreference/ChartInstanceProjection/ChartInstancePatch；chart→charts[]，chartSeries→charts[] |
| `display/core/defaults.ts` | 默认 charts: [单图表] |
| `display/core/clone.ts` | 新增 cloneChartInstancePreference/cloneChartInstanceProjection |
| `display/core/validation.ts` | 循环验证 charts[] |
| `display/core/normalize.ts` | 新增 normalizeChartInstance/normalizeCharts；重写 applyDisplayPreferencesPatch |
| `display/core/projection.ts` | 新增 projectChartInstances；projectChartSeries 改为分解参数 |
| `display/services/display-service.ts` | 新增 getChartInstances()/updateChartConfig()/updateChartCount() |
| `display/selectors/display-selectors.ts` | 新增 selectChartInstances |
| `display/composables/use-display-refresh.ts` | 新增 chartInstances ref |
| `display/index.ts` | 新增类型导出 |
| `display/fixtures/display-fixtures.ts` | 适配 charts[] |
| `__tests__/display-core-service-state-selector.spec.ts` | 新增 6 个多图表测试 |
| `__tests__/integration/display-projection.spec.ts` | 适配 charts patch |
| `pages/DisplayPage.vue` | 适配 chartInstances |

**验证：** build 通过 + lint 0 errors + 1216/1217 tests passed（1 预存 connection 失败）

### 代码质量审查与修复

> 2026-05-25 续接：子 agent 全量扫描发现 42 个问题（14 BUG + 7 RISK + 5 SMELL + 16 GAP），已全部修复

**核心修复（27 项）：**

1. **normalizeYAxis 提取**：替代原嵌套三元 + 重复 `isRecord`/`as UnknownRecord`，消除 `typeof isRecord(...)` 类 bug 温床
2. **normalizeCharts 新图表 selectedItems**：新图表（超出已有数量时）从空选择开始，不继承第一个图表的 selectedItems
3. **normalizeCharts >4 截断 warning**：超 4 图表时发出 `display.chart.countExceeded` issue
4. **normalizeCharts fallback guard**：空 fallbacks 时用 `DEFAULT_CHART_INSTANCE` 兜底
5. **applyDisplayPreferencesPatch 避免全量 clone**：`cloneDisplayPreferences` 替代 `cloneDisplaySnapshot`
6. **refreshCadenceMs typeof 守卫**：移除裸 `as number`，加 `typeof === 'number'` 运行时检查
7. **validation 图表数量+ID 唯一性**：新增 1-4 范围检查、空数组检查、重复 ID 检查
8. **validation path 用 index**：`preferences.charts[0] (id=chart-1)` 替代 `preferences.charts[chart-1]`
9. **projection 字段预索引**：`Map<compositeKey, field>` 替代 `fields.find()` 线性扫描
10. **updateChartConfig 去双层间接**：直接 `normalizeDisplayPreferencesInput`，不再构造 patch 再 applyPatch
11. **删除 chartHistory 死路径**：display 不负责时间序列积累，`ChartPoint`/`historyBuffer` 从 service 和 projection 移除
12. **DEFAULT_CHART_INSTANCE 共享常量**：`updateChartCount` 用共享常量替代硬编码默认值
13. **selectors 复用 clone 函数**：`selectChartInstances` 委托 `cloneChartInstanceProjection`，`selectChartSeries` 复用 `selectChartInstances`
14. **getChartSeries JSDoc**：标注 backward compat 语义
15. **fixtures DISPLAY_SCHEMA_VERSION**：替代硬编码 `1`
16. **DisplayPage .value 移除**：Vue 模板自动解包 ref，不需要 `.value`
17. **normalizeDisplayPreferencesInput clone 优化**：`cloneDisplayProjection(fallback.projection)` 替代 `cloneDisplaySnapshot(fallback).projection`
18. **新增 9 个测试**：多图表扩展/收缩边界、yAxis merge、标题更新、负数 clamp、空 charts normalize、>4 截断 warning、getChartInstances 独立投影、clearProjection 图表断言

**最终验证：** build 通过 + lint 0 errors + 1216/1217 tests passed

### scope 外（对话 C 负责）

- UI 页面实现（HistoryPage、HistoryDataSelector、HistoryTimeSelector）
- WaveformChart 颜色 token 迁移
- storage→ChartSeriesProjection 转换 composable（display 的 points 永远为空，时间序列由 storage 提供，页面 composable 做桥接）

## 后续

无。本对话已完成，待用户确认后提交。对话 C（UI 实施）H001 提示词已更新边界变更说明。
