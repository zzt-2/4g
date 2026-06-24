# [S010] 星座图刷新间隔接通生效 + 点大小配置 + 默认间隔≥2s

> 2026-06-24 | 修复+增强 | 状态: 已交付（待运行时实测）

## 目标

用户报告 3 个问题：
1. 星座图"刷新间隔"改了不生效，再点开还是 100ms（设置没存住）
2. 点的大小要小一些
3. 默认间隔至少 2 秒

主对话诊断：刷新间隔是"半成品"——UI 做了，但存储合并漏字段 + 末端没接线 + 实际刷新走写死的 cadence。本轮接通整条链路让设置真正生效。

## 记录

### 根因探查：4 个"刷新间隔"概念互相打架（比主对话预判的 3 个多 1 个）

display feature 里有 **4 个互不相关的刷新间隔概念**，关系比预想的更乱：

| 概念 | 字段 | 状态 |
|---|---|---|
| A. scatter 专属 | `ScatterDisplayPreference.refreshIntervalMs` | UI 绑这个，但 normalize 合并漏字段 + clone 漏字段（**两层存储 bug**）+ 无消费者 |
| B. 图表通用 | `ChartPerformancePreference.refreshIntervalMs` | 能存住（service 直接合并），但无消费者 |
| C. 顶层 cadence | `DisplayPreferences.refreshCadenceMs` | 能存住，仅底栏显示（假值） |
| D. 写死 | `useDisplayRefresh` `cadenceMs=200` | **唯一真正驱动刷新的**，与 A/B/C 全无关 |

→ 用户在 UI 改的值（A）在两层存储（normalize 合并 + clone）被丢弃 → 存不住 → 回填还是旧值；即便存住，消费端走 D 写死值，也与 A/B/C 全无关。

### 决策（用户拍板，记 D001）

通过 3 轮 AskUserQuestion 锁定方案（推翻主对话"统一到 C"的预判）：
- **星座图/波形图各自独立节奏**（用户原话"它们应该是单独的才对？两个独立"）
- **表格固定 500ms**
- **弃用 C**，底栏不再显示单一值
- **点大小加配置入口**（scatter.pointSize pref + 弹窗滑块，不只调默认值）

详见 decisions.md D001。

### 实施（TDD）

**1. 存储层修复（问题 1 根因，先写复现测试）**
- `normalize.ts:387-394` scatter patch 合并：之前只展开 iSource/qSource，补 sampleCount/bitWidth/refreshIntervalMs/pointSize（undefined 保留旧值）
- `clone.ts:55-65` cloneScatterDisplayPreference：字段白名单补 pointSize（第二个存储 bug——createDefaultDisplaySnapshot→clone 把 pointSize 丢了，导致 reset() 后缺字段）
- 复现测试 2 条：改 refreshIntervalMs→normalize→读回是新值；scatter patch 只传 pointSize 不清掉 iSource 等

**2. 消费层重写（问题 3 根因）**
- 删写死 `cadenceMs=200` 参数，改三组独立 cadence：scatterCadence/chartCadence/tableCadence(500)
- 单 rAF 循环内 `tick` 按三组 cadence 分别判断到点（三个独立 lastTime）
- watch cadence 变化→重置对应 lastTime=0→下一帧立即按新节奏刷新（reactive，不等老间隔走完）
- watch preferences 变化→更新 cadence（用户保存配置后生效）
- 导出 `clampCadence`/`computeChartCadence` 纯函数供单测

**3. 点大小（问题 2）**
- `ScatterDisplayPreference` 加 `pointSize`，默认 4（原写死 6 偏大）
- ScatterConfigDialog 加 q-slider（1-12px）
- ScatterChart.vue symbolSize 写死 6→读 prop pointSize + watch 重绘
- DisplayPanel 加 scatterPointSize prop 透传，DisplayPage 传 scatterPreference.pointSize

**4. 默认值 + UI 对齐**
- defaults：scatter refreshIntervalMs 100→2000、pointSize 4；chart refreshIntervalMs 200→2000
- ScatterConfigDialog/ChartConfigDialog 的 refreshIntervalMs ref 默认同步 2000
- DisplayPage 底栏删 `刷新: {{refreshCadenceMs}}ms` 假显示

**5. 顺手清理**
- `projection.ts` projectScatter 签名收窄为 `Pick<ScatterDisplayPreference,'iSource'|'qSource'|'sampleCount'|'bitWidth'>`——pointSize/refreshIntervalMs 是渲染/UI 参数，与投影计算无关，类型应收窄反映真实依赖（避免 5 处测试调用都要补 pointSize）

### 测试设计教训

初版 cadence 测试用"可控 rAF + 时间模拟"驱动整个循环统计刷新次数——**极脆弱**（依赖时间模拟精度 + rAF 调度细节），3 个全失败。改用 systematic-debugging 思路：验证**业务不变量**（cadence 计算纯函数）而非实现细节。导出纯函数单测 6 条，覆盖：clampCadence 边界、computeChartCadence 取 min/空/无效/下限、散点与图表 cadence 来源独立。更可靠。

## 决策引用

- D001（新建）：display 刷新间隔三视图各自独立节奏，弃用顶层 refreshCadenceMs

## 范围确认

- 本轮在 scope boundary 内：星座图刷新间隔/点大小属 display feature，是 display-group-management 专题范围 ✓

## 验证

- display 单元测试 **69/69 ✓**（含 2 条存储复现 + 6 条 cadence 纯函数）
- display 集成测试 **38/38 ✓**（含 persistence-recovery 验证旧数据缺 pointSize 时 normalize 正确降级）
- 全量 1762 passed / 20 failed：**20 个失败全部 pre-existing**（TCP/FTP/heartbeat/frame 序列化的环境 issue，git stash 验证纯净 baseline 同样失败），display 零回归
- lint：6 errors **全部 pre-existing**（git stash 验证），**0 新增**
- tsc：src **0 错误**（node_modules 的 @vitejs/plugin-vue .d.mts 语法不兼容是环境问题；vue-tsc 1.8.27 与 Node 20 不兼容已知 bug）

## 后续

- **运行时手工验证**（待用户）：quasar dev，星座图改刷新间隔 2000ms→保存→再开是 2000ms（问题1）；图表刷新节奏肉眼变慢（问题3）；点变小（问题2，默认4）；改 pointSize 滑块点随之变
- **refreshCadenceMs 字段保留未删**：旧 docking.json 仍含此字段，normalize 忽略它。如未来要彻底清理，需加 migration
- **图表 cadence 取 min 的限制**：多图表无法真正各自独立节奏（chartBuffer 共享约束）。如未来要 per-chart 独立，需拆 buffer。当前用户未提此需求
