---
doc_type: feature-design
feature: rewrite-display
status: draft
date: 2026-05-04
summary: 东方红上位机重写中 display feature 的展示偏好、表格/图表/星座图投影、实时/历史展示 snapshot、跨 feature 输入边界和 UI/runtime 消费规则。
---

# Rewrite display feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/architecture/rewrite-system-architecture.md`
5. `codestable/architecture/rewrite-feature-boundaries.md`
6. `codestable/architecture/rewrite-feature-interaction-matrix.md`
7. `codestable/architecture/rewrite-thin-ui-runtime-wiring.md`
8. `codestable/architecture/rewrite-ui-style-baseline.md`
9. `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
10. `codestable/quality/rewrite-quality-rules.md`
11. `codestable/quality/rewrite-review-checklist.md`
12. 当前设计/实现：`rewrite/src/features/settings`
13. 当前设计/实现：`rewrite/src/features/connection`
14. 当前设计：`codestable/features/rewrite-receive/rewrite-receive-design.md`
15. 当前设计：`codestable/features/rewrite-status/rewrite-status-design.md`
16. 当前 checklist：`codestable/features/rewrite-display/rewrite-display-checklist.yaml`

`display` 已正式收口为 rewrite target feature，目标落点为 `rewrite/src/features/display`。本文把旧 data display/chart/history display 能力收敛为一个窄边界 feature design；后续进入代码实现前，必须将本文和 checklist 列为直接合同。本文本身不写代码、不冻结 schema、不替代实现阶段验证。

## 2. Boundary guards

- 本轮只做 Lane B feature design/checklist，不实现 display，不写 UI 页面代码。
- display 是正式 rewrite target feature，目标落点为 `rewrite/src/features/display`。
- display owns 展示偏好语义、展示配置校验/规范化、表格/图表/星座图 display projection、实时/历史 UI-safe display snapshot 和展示刷新策略。
- display does not own receive parse truth、connection transport truth、status health summary、settings persisted truth、storage/history persistence truth、task lifecycle、result/report/northbound 语义。
- settings 只能提供用户配置事实和持久化偏好快照，不解释 chart/table/scatter 的运行语义。
- receive/storage/frame/connection/status 只能通过 public selector、public service、显式事件或 runtime 编排向 display 提供只读材料；display 不 import internal state。
- UI snapshot 与 display feature state 分离：display 可以拥有 UI-safe display read model，页面只拥有本页过滤、选中、弹窗、loading 等临时 snapshot。
- 不进入 receive/send/task/SCOE/result/report/northbound 细节实现。
- 不写颜色、样式 token、组件样式或页面布局。
- 不冻结 API schema、chart library API、刷新间隔、队列参数、字段 payload、错误码或存储格式。
- 不读取或修改自动生成前端 types。

## 3. Split decision

本轮拆分为 `rewrite-status` 和 `rewrite-display`。

Evidence:

- 旧 status 行为主要是 HeaderBar 状态灯、连接状态摘要和 SCOE 状态面板；它的输出是健康/状态 summary。`src/stores/statusIndicators.ts`、`src/components/common/StatusIndicators.vue`、`src/components/scoe/StatusPanel.vue`
- 旧 display 行为主要是 Receive 页面显示模式、双表 table/chart/special、图表配置、星座图配置、历史图表布局和可视化刷新。`src/stores/frames/dataDisplayStore.ts`、`src/components/frames/receive/DataDisplay/DataDisplayContainer.vue`、`src/components/common/UniversalChart.vue`、`src/stores/historyAnalysis.ts`
- 旧 `dataDisplayStore` 同时做展示配置、实时采样、记录状态和历史保存；这是旧耦合 evidence，不应照搬为新 owner。

Judgement:

- status owns “当前状态如何解释”；display owns “数据如何呈现和刷新”。
- display 可以消费 status snapshot 作为展示素材，例如显示连接/错误摘要，但不计算 health truth。
- display 可以消费 receive/storage read model 形成表格/图表/历史视图，但不拥有 receive/storage truth。

## 4. Evidence summary

### 4.1 Contract evidence

- target structure 已将 `display/` 列为正式 feature；同时要求静态资产、运行事实、统计 read model 和 UI snapshot 分离，统计/read model 不得写回 frame definition、settings config 或展示配置。
- thin UI/runtime wiring 要求 pages/widgets 只能消费 feature public API、只读 selector、props 或 page/runtime 组合后的 snapshot；widgets 不能直接读 feature internals。
- settings design 已把 table1/table2、scatter config、chart-performance-config、historyAnalysis_chartSettings 登记为 display/chart/history 偏好来源，但 settings 只处理用户配置事实和持久化快照，不解释图表数据、采样和刷新语义。
- receive design 已确认 receive owns parse result、field value delta、receive stats 和 recent input material；display 只能消费 UI-safe receive output 或 selector。
- storage-local baseline 已确认 storage owns local persistence、history、CSV、file material；display 只能消费 storage read model 或触发公开操作，不定义文件 truth。
- interaction matrix 要求 multi-feature UI 由 page/runtime 组合只读输入，再传给 widget；组件不得 import 多个 feature internal state 拼业务流程。

### 4.2 Legacy evidence

旧系统证据只用于识别可观测行为、fixture/oracle 材料和迁移风险：

- display store 和启动/停止：`src/stores/frames/dataDisplayStore.ts`、`src/layouts/useAppLifecycle.ts`
- Receive 显示入口：`src/pages/ReceiveFramePage.vue`、`src/components/frames/receive/DataDisplay/DataDisplayContainer.vue`
- 表格和控制：`src/components/frames/receive/DataDisplay/DataTable.vue`、`src/components/frames/receive/DataDisplay/DisplayModeToggle.vue`、`src/components/frames/receive/DataDisplay/TableControls.vue`、`src/components/frames/receive/DataDisplay/RecordingControls.vue`
- 图表：`src/components/common/UniversalChart.vue`、`src/components/common/UniversalChartSettingsDialog.vue`
- 星座图：`src/components/frames/receive/DataDisplay/SpecialConstellationChart.vue`、`src/components/frames/receive/DataDisplay/ScatterPlotConfigDialog.vue`
- 历史分析：`src/pages/HistoryAnalysisPage.vue`、`src/stores/historyAnalysis.ts`、`src/components/storage/HistoryDataSelector.vue`、`src/components/storage/HistoryTimeSelector.vue`
- source facts：`src/stores/frames/receiveFramesStore.ts`、`src/components/frames/receive/FrameStatsPanel.vue`
- connection/status facts：`src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`、`src/stores/connectionTargetsStore.ts`、`src/stores/statusIndicators.ts`
- settings facts：`src/pages/settings/Index.vue`、`src/stores/settingsStore.ts`

## 5. Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level | note |
| --- | --- | --- | --- | --- | --- |
| 应用生命周期启动 data display collection，并按 settings 自动开始记录。 | display owns live display collection; storage owns persistence; settings provides config | preserve boundary | `src/layouts/useAppLifecycle.ts`、`src/stores/frames/dataDisplayStore.ts`、`src/stores/settingsStore.ts` | fixture test, runtime validation | 自动记录落盘不由 display 单独完成；storage/runtime 需验证。 |
| Receive 页面可在 edit/display 内容模式之间切换。 | pages + display | preserve | `src/pages/ReceiveFramePage.vue` | manual checklist | 本轮不实现页面。 |
| 双表 table1/table2 各自持久化 displayMode、selectedGroupId、chartSelectedItems、Y 轴配置。 | display owns preference semantics; settings/storage may persist fact | preserve | `src/stores/frames/dataDisplayStore.ts`、`src/components/frames/receive/DataDisplay/DataDisplayContainer.vue` | fixture test, manual checklist | 当前 settings 实现未承载这些字段，implementation 前需补 persistence owner。 |
| 表格视图读取当前数据项并按刷新 cadence 更新。 | display owns UI projection; receive owns source facts | preserve principle | `src/components/frames/receive/DataDisplay/DataTable.vue`、`src/stores/frames/receiveFramesStore.ts` | fixture test, manual checklist, runtime validation | 旧 500ms 是 evidence，不冻结为新规则；UI 不逐包解析。 |
| 实时图表通过 UniversalChart 读取 group history records，支持 selected items、chart config、performance config。 | display/widgets | preserve boundary | `src/components/common/UniversalChart.vue`、`src/components/common/UniversalChartSettingsDialog.vue` | fixture test, manual checklist, runtime validation | widget 不能直接 import receive/display internals；图表刷新策略需后续实现验证。 |
| 星座图支持 I/Q 数据源、位宽、点数、刷新间隔等配置。 | display owns visual mapping; receive/frame provide source references | preserve | `src/components/frames/receive/DataDisplay/ScatterPlotConfigDialog.vue`、`src/components/frames/receive/DataDisplay/SpecialConstellationChart.vue` | fixture test, manual checklist, runtime validation | 不冻结具体 payload 或刷新参数。 |
| 清空历史/图表缓存影响可见展示。 | display owns live display buffer; storage owns persisted history | preserve boundary | `src/components/frames/receive/DataDisplay/DataDisplayContainer.vue`、`src/stores/frames/dataDisplayStore.ts` | fixture test, manual checklist | 不允许清 display snapshot 删除 storage truth，除非 storage public command 明确。 |
| recording controls 显示记录状态并触发 start/stop。 | storage/recording owns runtime; display owns control snapshot | preserve boundary | `src/components/frames/receive/DataDisplay/RecordingControls.vue`、`src/stores/frames/dataDisplayStore.ts` | manual checklist, runtime validation, package validation | 真实文件写入和打包态路径由 storage/platform 验证。 |
| 历史分析页面支持时间范围、数据选择、多图配置和历史图表。 | storage/history owns data source; display owns visual analysis projection | preserve boundary | `src/pages/HistoryAnalysisPage.vue`、`src/stores/historyAnalysis.ts` | fixture test, manual checklist, package validation | history 文件可用性不由 display 证明。 |
| FrameStatsPanel 展示接收统计和 recording stats。 | receive/storage/status own source stats; display may present | preserve boundary | `src/components/frames/receive/FrameStatsPanel.vue` | manual checklist, runtime validation | display 不拥有 receive stats truth。 |
| 状态指示灯配置和显示可见。 | status owns health/indicator; display may present alongside data | not owned by display | `src/stores/statusIndicators.ts`、`src/components/common/StatusIndicators.vue` | fixture test, manual checklist | status/display 分离。 |
| 串口/网络连接状态和 target 可用性影响展示上下文。 | connection owns truth; display may show disabled/empty reason | preserve boundary | `src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`、`src/stores/connectionTargetsStore.ts` | manual checklist, runtime validation, hardware validation | display 不拥有 connection facts。 |

## 6. Owner / not owner

| 分类 | display owner | display not owner |
| --- | --- | --- |
| 展示偏好 | table/chart/special/history display preference semantics、可见字段/数据项选择、图表参数、星座图 source binding、刷新/采样 preference 的语义校验。 | settings 默认值合并/持久化容器、receive parsing、connection lifecycle、status health mapping。 |
| 展示配置 read model | 配置规范化结果、UI-safe display config snapshot、invalid/deferred source explanation、display mode projection。 | frame definition truth、receive mapping truth、storage history file schema。 |
| 实时展示投影 | 基于 receive/storage/status/connection public material 生成表格、图表、星座图、空状态、错误/无数据提示所需 projection。 | receive runtime facts、connection target facts、status summary truth、result/report truth。 |
| transient display buffers | 为图表、表格、近期值、可视化刷新服务的短生命周期 buffer 或 sampled display read model。 | 本地 history persistence、CSV/export、report material、northbound file delivery。 |
| UI-facing controls | display 页面/组件的显示模式、选中分组、打开配置弹窗、清空 display buffer 的 operation result。 | 真实文件删除、硬件连接、任务控制、报告生成。 |

## 7. State owner

| State layer | Owner | Write rule | Readers | Reset / lifecycle / persistence | Design guard |
| --- | --- | --- | --- | --- | --- |
| Display preference facts | display owns semantics; settings/storage may persist configured input after explicit contract | display service validates/normalizes; persistence via allowed settings/storage boundary | pages、widgets、runtime | low-frequency; persistence owner must be declared before implementation | settings does not interpret display semantics; display does not own arbitrary settings store. |
| Source runtime facts | receive、connection、status、storage/history 等 source owner | source feature writes own truth | display via public selector/event/runtime | source lifecycle | display copies only material needed for projection, not source truth. |
| Display read model | display | display service/state writes based on source material and preference snapshot | pages/widgets/runtime | transient by default; reset/clear through display command | read model must be UI-safe and immutable to consumers. |
| Page UI snapshot | pages/display composables/widgets | UI writes only filters, selected panel, dialog draft, loading, error view, pagination, viewport | UI components | page lifecycle; persistent only if promoted through display/settings design | page snapshot cannot define source values, connection status or status health. |
| Persistent history/file state | storage | storage writes file/history truth | display may read storage snapshot/material | storage lifecycle/package path | display cannot claim package validation or delete persisted history without storage public command. |

## 8. Public API necessity

display needs public API because receive pages/widgets/runtime need a clean way to configure and consume display projections without reading receive/settings/storage internals. API 是边界能力类别，不是文件形态或 schema。

Allowed capability categories:

- Preference category: read/update/reset display preference snapshot for table/chart/special/history display。
- Source projection category: accept receive/storage/status/connection read-only material and produce UI-safe display model。
- Live buffer category: update/clear transient display buffers for chart/table visualization; not persisted history truth。
- Selector category: provide table rows, chart series, scatter source projection, empty/error state, selected item options and display summaries。
- Validation category: validate stale/missing source references, invalid chart config and unsupported display modes。
- Test boundary category: accept fake source snapshots and expected display projection fixtures。

Explicitly not display public API:

- receive ingest/match/parse API。
- connection connect/disconnect/write/target API。
- settings mutable state or raw localStorage key API。
- storage file/path/history write API, except through storage public service when explicitly designed。
- status health mapping API。
- task/send/SCOE/result/report/northbound API。
- mutable store、internal service、raw chart instance、platform object、raw IPC event。

## 9. Runtime / UI involvement

Runtime may:

- 在 app/page 初始化时装配 display service、settings/display preference snapshot、receive/storage/status/connection public material。
- 将 receive result/read model 或 storage/history read model 路由给 display，触发 display projection update。
- 对高频 receive material 做 coalescing/throttle 后再给 display，或让 display 自己根据设计维护 UI-safe buffer。
- 在 clear display buffer、start/stop recording、history load 等跨 feature 操作中路由到 display/storage public API。
- 登记 high-frequency、history/package path、hardware/customer validation gap。

Runtime must not:

- 实现 receive parsing、storage file semantics、status health mapping、task/SCOE/result/report/northbound rules。
- 保存 display/source business truth 为全局 store。
- 直接访问 Electron/Node/platform primitive。

UI may:

- 通过 display public selector、display page composable 或 runtime page API 获取 display snapshot。
- 持有 page-local UI snapshot，例如当前 tab、selected panel、dialog draft、过滤、分页、viewport、loading。
- 把 display snapshot 作为 props 传给 widgets 或 display components。

UI must not:

- import receive/settings/storage/connection/status internal state。
- 直接订阅 raw byte stream 或逐包累计图表数据。
- 自行解释 source truth、connection status、status health 或 storage persistence。
- 写颜色/样式 token；样式实现必须另行遵守 `rewrite-ui-style-baseline.md`。

## 10. Cross-feature communication rules

| Collaborator | May provide / consume | Must not do |
| --- | --- | --- |
| settings | 提供 persisted user preference fact/default snapshot。 | 解释 display mode、chart sampling、scatter semantics 或当前数据状态。 |
| receive | 提供 field value delta、stats、recent input、UI-safe read model material。 | 让 display import receive internal state 或修改 receive facts。 |
| frame | 提供 field/reference/options metadata for labels and source binding。 | 让 display 写 frame definition 或统计。 |
| storage/history | 提供 history rows/hour summaries/material snapshots；承接 persistence commands if explicitly designed。 | 让 display 直接读写文件、定义 CSV/history schema 或 claim package path complete。 |
| connection | 提供 source/target availability summary for empty/disabled context。 | 让 display 管理 transport lifecycle 或把 target 当 business device。 |
| status | 提供 health/status snapshot as optional display material。 | 让 display 计算 health truth 或修改 status read model。 |
| pages/widgets | 读取 display snapshot、传递 props/events。 | import feature internals 或直接拼多个 feature truth。 |
| task/send/SCOE/result/report/northbound | 本轮无直接 display API。 | 用 display snapshot 推进任务、定义结果、生成报告或对外交付。 |

## 11. Target internal layering

后续实现可以按实际需要创建目录，不为填模板而建空层：

| Layer | Target responsibility |
| --- | --- |
| `core` | 纯 TypeScript display preference normalization、source reference validation、table row projection、chart series projection、scatter source projection、display buffer delta。 |
| `services` | display use case entry。负责 load/update/reset preference、consume source material、update display read model、clear transient buffer、return operation result。 |
| `state` | display preference snapshot、display read model、transient live buffers、UI-independent selector。 |
| `fixtures` | legacy table1/table2 configs、chart-performance-config、scatter configs、history chart settings、fake receive/storage source material、expected projection。 |
| `composables` | display 页面局部 UI snapshot、dialog draft、selector 组合和 service 调用。 |
| `components` | table/chart/scatter/history display 局部 UI；组件不跨 feature 拼 truth。 |

## 12. Fixture / manual test plan

Automatic evidence plan:

- preference fixture: table1/table2 display mode、selected group、selected items、Y-axis config、missing/invalid/stale source fallback。
- chart fixture: realtime/history selected items + performance config -> chart projection，不冻结具体 chart library API。
- scatter fixture: I/Q source config、sample count/bit width/update interval preference -> source projection and invalid-state output。
- source projection fixture: receive field value material -> table rows/chart series snapshot。
- storage/history fixture: history material snapshot -> historical chart/table projection。
- selector fixture: display selector returns cloned/readonly projection and does not expose mutable buffers。
- static scan: display/pages/widgets/runtime 不 import receive/settings/storage/connection/status internal state 或 raw platform/Electron。

Manual checklist:

- Receive display mode entry 可达，edit/display 切换后展示区域不丢失。
- 双表 table/chart/special 模式、选中分组、图表设置、星座图设置、空状态、无数据和错误提示可见。
- 清空 display buffer 只影响展示，不误删 storage persisted history。
- 历史分析视图可见时间范围、数据选择、多图配置和图表展示。
- recording controls 可见，但真实记录/保存完成声明来自 storage/runtime/package evidence。

Runtime / hardware / package validation:

- 高频 receive material 到 display snapshot 的节流、批量、丢弃/延迟策略必须 runtime validation。
- 真实串口/TCP/UDP 输入下的 display 刷新稳定性必须 runtime/hardware validation。
- 历史记录、CSV、package data path、长期写入、清理和恢复必须 storage/package validation；display 不单独声明。
- northbound/report/customer closure 不由 display 声明。

## 13. Deferred and implementation preconditions

Deferred:

- 当前 `rewrite/src/features/receive` 尚未实现，display 不能声明实时 receive-driven table/chart 完成。
- 当前 settings 实现未包含 table/chart/scatter/history display preference fields。
- chart payload、刷新间隔、采样策略、buffer 上限、overflow/drop 规则、历史查询 schema 均不冻结。
- history persistence、recording runtime、CSV/export、package data path 属 storage/platform 后续验证。

Implementation claim preconditions:

- 没有 receive/storage public material 时，不能声明实时/历史 display 完成。
- 没有 runtime/hardware evidence 时，不能声明高频 display 稳态完成。
- 若实现需要 import 其他 feature internal state，必须回到 design 更新 public API 或重划 owner。
