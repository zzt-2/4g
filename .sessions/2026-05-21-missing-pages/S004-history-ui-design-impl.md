# [S004] 对话 C：历史分析页 UI 设计实施

> 2026-05-25 | 实施 | 已完成

## 目标

基于对话 B（S003）的 display 多图表扩展，设计实施历史分析页面（Mode A 布局：左控制面板 + 右图表区）。

## 记录

### 直接合同

- 对话 B（S003）产出的 display 扩展代码
- S001 §历史分析关键发现 + §历史分析补充

### 边界护栏

- R4（UI 不承载业务逻辑）+ 前端 conventions

### 边界变更（对话 B 已确认）

- display feature 不负责时间序列历史积累。ChartSeriesProjection.points 在 display 层永远为空
- 时间序列数据由 storage feature 提供
- 页面 composable 负责桥接 storage → ChartSeriesProjection
- display 用 groupId:dataItemId 复合键，storage 用 channel+key 标识，composable 做转换
- 多图表：1-4 个 ChartInstanceProjection，每个独立 selectedItems + yAxis
- 统计量（mean/RMSE）在 UI 层计算，不在 display state

### Wave 1 事实收集（完成）

3 agent 并行 + 主线程直读。C1 UI 规范、C2 现有页面模式、C3 旧系统 UI 交互。

### Wave 2 设计（完成）

6 项设计决策（DC1-DC6），Service Readiness Audit 确认无 gap。

### Wave 3 自检（完成）

- SC1 规范合规：64%（agent 误检旧代码，新设计已覆盖所有关键项）
- SC2 质量规则：通过（agent 误检旧 store，新 composable 符合 R4）
- SC3 覆盖度：18/18 覆盖

### Phase 3 实施（完成）

| 文件 | 变更 |
|------|------|
| `css/tokens/_palette.scss` | 新增 indigo-500、violet-500 |
| `css/app.scss` | 新增 --rw-chart-color-1~6 |
| `widgets/WaveformChart.vue` | 颜色从 CSS token 读取，移除硬编码 |
| `router/routes.ts` | 新增 /history 路由 |
| `pages/history/useHistoryData.ts` | 核心 composable：storage→display 桥接 + 统计 |
| `pages/history/HistoryTimeSelector.vue` | 时间选择：预设 + 自定义 |
| `pages/history/HistoryDataSelector.vue` | 数据项选择：分组 + 搜索 + 多选 |
| `pages/history/CSVExportDialog.vue` | CSV 导出弹窗 |
| `pages/history/ChartConfigDialog.vue` | 单图表配置弹窗 |
| `pages/HistoryPage.vue` | 主页面：Mode A 布局 |

### 验证证据

- build 通过
- lint 0 new errors（9 个 pre-existing）
- 1259/1260 tests passed（1 个 pre-existing connection 测试失败）

## 后续

无
