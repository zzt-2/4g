# Decisions — 接收帧分组管理 Feature

> 按时间。D### 决策记录，status: active/superseded。

## D001: display 刷新间隔——三视图各自独立节奏，弃用顶层 refreshCadenceMs

> status: active
> date: 2026-06-24
> 取代：无
> 被取代：无

### 决策

display 的刷新节奏按**视图类型各自独立**，不再有单一全局 cadence：
- **星座图**节奏 ← `scatter.refreshIntervalMs`（星座图弹窗入口），默认 2000ms
- **波形图**节奏 ← 各 `charts[].performance.refreshIntervalMs` 的**最小值**（chartBuffer 共享，必须统一节奏，否则不同 cadence 累积会错乱），默认 2000ms
- **表格**节奏 ← 固定常量 500ms（表格无独立配置入口）
- 顶层 `refreshCadenceMs` **弃用**：不再驱动任何视图，底栏不再显示（之前显示 500ms 但实际 200ms 是骗人）

三视图节奏互不影响。此前 `useDisplayRefresh` 写死的 `cadenceMs=200`（真正驱动）与上述 3 个配置全无关，本次彻底接通。

### 理由

用户原话："它们应该是单独的才对？两个独立"——星座图和波形图的刷新节奏应各自独立，不该共用一个全局 cadence。这是比"统一到顶层 refreshCadenceMs"（主对话预判方案）更合理的设计：不同图表对刷新频率的需求天然不同（星座图看实时性、波形图看趋势），强行统一会牺牲灵活性。

单 rAF 循环内按三组 cadence 分别判断到点（`tick` 内三个独立 `lastTime`），避免拆成多个 rAF 循环的结构复杂度。cadence 变化时 watch 重置对应 `lastTime=0`，让新值下一帧立即生效（不等老间隔走完）。

图表 cadence 取 min 而非 per-chart 独立，是因为 `chartBuffer`（时序累积缓冲）是所有图表共享的 Map，多图表若各自 cadence 会产生累积时序错乱。取 min = "按最快的图驱动累积，慢的图只是读得少"。

### 排除的替代方案

- **统一到顶层 refreshCadenceMs（主对话预判）**：否决。用户明确要"两个独立"，全局单 cadence 违背意图。且会让星座图/波形图弹窗的两个"刷新间隔"输入框失去意义。
- **每图表各自独立 rAF 节奏**：否决。chartBuffer 共享导致时序错乱，且拆多循环增加结构复杂度无收益。
- **表格跟随星座图或波形图节奏**：否决。耦合，用户改一个会连累另一个；表格用固定 500ms 最可预测。
- **删掉 refreshCadenceMs 字段**：否决（暂留）。字段保留避免持久化迁移风暴（旧 docking.json 仍含此字段，normalize 会忽略它）；只是不再驱动/显示。

### 影响范围

- `composables/use-display-refresh.ts`：重写，删写死 `cadenceMs=200` 参数，改三组独立 cadence + watch 重启；导出 `clampCadence/computeChartCadence` 纯函数供单测
- `core/normalize.ts`：scatter patch 合并补 refreshIntervalMs/sampleCount/bitWidth/pointSize（**问题 1 存储层根因**，之前漏字段导致存不住）
- `core/clone.ts`：cloneScatterDisplayPreference 补 pointSize（第二个存储 bug，clone 白名单漏字段）
- `core/types.ts` + `core/defaults.ts`：ScatterDisplayPreference 加 pointSize；scatter/chart refreshIntervalMs 默认 100/200 → 2000
- `components/ScatterConfigDialog.vue`：加 pointSize 滑块（1-12px）；refreshIntervalMs 默认 2000
- `components/ChartConfigDialog.vue`：refreshIntervalMs 默认 200 → 2000
- `widgets/ScatterChart.vue`：symbolSize 写死 6 → 读 prop pointSize（默认 4）
- `components/DisplayPanel.vue` + `pages/DisplayPage.vue`：透传 scatterPointSize；删底栏 refreshCadenceMs 显示
- `core/projection.ts`：projectScatter 签名收窄为 Pick（pointSize/refreshIntervalMs 是渲染参数非投影输入）

### 来源

S010 / 用户纠正（"它们应该是单独的才对？两个独立" + "弃用 C，底栏不再显示单一值" + "表格 500ms" + "点大小加配置"）
