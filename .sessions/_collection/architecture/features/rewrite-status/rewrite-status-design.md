---
doc_type: feature-design
feature: rewrite-status
status: draft
date: 2026-05-04
summary: 东方红上位机重写中 status feature 的状态摘要、健康视图、状态指示 read model、跨 feature 输入边界和 UI/runtime 消费规则。
---

# Rewrite status feature design

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

`codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向和 feature 归口的 canonical 架构基线。本文只锁定 `status` feature 的 owner、read model、public API 候选、runtime/UI 消费边界和验证计划，不定义字段 schema、事件 payload、接口签名、颜色 token 或 UI 实现。

## 2. Boundary guards

- 本轮只做 Lane B feature design/checklist，不实现 status，不写 UI 页面代码。
- status owns 状态指示、健康状态、状态视图、内部状态摘要和 UI-facing status read model。
- status does not own settings 配置事实、connection transport truth、receive/send 原始事实、task 主状态、SCOE 领域状态、result truth、report generation 或 northbound external projection。
- settings 只能提供用户配置事实和只读配置快照，不解释运行状态。
- connection/receive/send/task/SCOE/result/report 只通过 public selector、public service、显式事件或 runtime 编排向 status 提供事实或材料；status 不 import internal state。
- UI snapshot 与 status feature state 分离；pages/widgets 不写 status truth，不把 snapshot 升级为全局 store。
- runtime 只做装配、只读组合、事件路由、刷新节流和边界例外登记，不拥有 status 规则或底层事实。
- 不进入 receive/send/task/SCOE/result/report/northbound 细节实现。
- 不冻结 northbound status query、heartbeat、self-check、alarm、外部状态枚举、错误码或 customer schema。
- 不写颜色、样式 token、组件样式或页面布局。
- 不读取或修改自动生成前端 types。

## 3. Split decision

本轮拆分为 `rewrite-status` 和 `rewrite-display` 两组设计。

Evidence:

- 旧 `statusIndicators` 和 HeaderBar 状态灯是运行状态/健康摘要的可见投影，数据源来自 receive 当前值、connection 连接态、SCOE 运行面板等事实。`src/stores/statusIndicators.ts`、`src/components/common/StatusIndicators.vue`、`src/components/layout/HeaderBar.vue`
- 旧 `dataDisplayStore`、DataDisplay 双表、UniversalChart、历史分析图表主要是展示偏好、图表/表格 UI snapshot 和数据投影，不应成为系统健康状态 owner。`src/stores/frames/dataDisplayStore.ts`、`src/components/frames/receive/DataDisplay/DataDisplayContainer.vue`、`src/components/common/UniversalChart.vue`、`src/stores/historyAnalysis.ts`
- `rewrite-feature-boundaries.md` 已将 `status` 定义为状态摘要/健康/status view owner；display 不是 connection/receive/settings 的运行事实 owner。

Judgement:

- status 和 display 共享 receive/connection/settings 输入，但写入事实和消费语义不同。
- status 输出“系统/局部能力当前健康与状态摘要”；display 输出“如何展示实时/历史数据的用户偏好和 UI-safe 展示投影”。
- 合并会让 status 变成图表配置、数据表刷新、历史分析和运行健康的大杂物箱，也会让 display 误拥有 connection/receive 事实。

## 4. Evidence summary

### 4.1 Contract evidence

- target structure 定义 `status` owns 状态指示、健康状态、状态视图和内部状态摘要；must not own heartbeat 协议本身或 task 主状态事实。
- system architecture 要求静态资产、运行事实、统计 read model 和 UI snapshot 分层；status 只能写自己的 read model。
- feature boundaries 指出旧 `statusIndicators` 直接读取 receive groups 并定时轮询，`globalStatsStore` 另有统计口径，状态解释存在漂移风险。
- interaction matrix 将 `connection -> status`、`receive -> status`、`send -> status`、`task -> status`、`result -> status` 和 `status -> pages/widgets/northbound` 都限制在 selector、explicit event 或 runtime orchestration。
- thin UI/runtime wiring 要求 pages/widgets 只能消费 feature root public API、只读 selector、props 或 page/runtime 组合后的 snapshot；runtime 不能持有 feature business truth。
- settings design 已确认 settings 只提供 indicator config snapshot；active/current color read model、数据源解释和刷新节奏必须归 status。
- connection 当前实现已公开 connection snapshot、runtime facts、transport events、targets、lifecycle/error selector；status 可把这些作为输入材料，但不能导入 connection internal state。
- receive 当前只有 design，无实现 public API；status 不能假定 receive API 已可用。

### 4.2 Legacy evidence

旧系统证据只用于识别可观测行为、fixture/oracle 候选和迁移风险，不作为新架构结构：

- status indicator 配置和运行：`src/stores/statusIndicators.ts`、`src/components/common/StatusIndicators.vue`、`src/components/common/StatusIndicatorConfigDialog.vue`
- 全局状态灯入口：`src/components/layout/HeaderBar.vue`、`src/pages/settings/Index.vue`
- connection 状态可见行为：`src/pages/ConnectConfigPage.vue`、`src/components/connect/ConnectionContentPanel.vue`、`src/components/connect/ConnectionList.vue`、`src/components/connect/SerialPortList.vue`、`src/components/connect/NetworkConnectionCard.vue`、`src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`
- receive 数据项状态来源：`src/stores/frames/receiveFramesStore.ts`
- SCOE 专属状态面板：`src/pages/SCOEConfigPage.vue`、`src/components/scoe/StatusPanel.vue`、`src/stores/scoeStore.ts`
- 旧平台事件来源风险：`src-electron/main/ipc/serialHandlers.ts`、`src-electron/main/ipc/networkHandlers.ts`、`src-electron/preload/api/serial.ts`、`src-electron/preload/api/network.ts`
- 路由证据：`src/router/routes.ts` 未见独立 `/status` 页面；旧 status 主要以 HeaderBar 状态灯、连接页状态和 SCOE 面板嵌入呈现。

## 5. Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level | blocker / note |
| --- | --- | --- | --- | --- | --- |
| HeaderBar 常驻显示状态指示灯，不是独立 status 页面。 | status + widgets/app shell | preserve | `src/components/common/StatusIndicators.vue`、`src/components/layout/HeaderBar.vue`、`src/router/routes.ts` | manual checklist | 新 UI 可以重建入口，但不得丢失可见状态指示能力。 |
| 设置页可启用/禁用状态指示灯并打开配置弹窗。 | settings owns persisted preference; status owns active read model | preserve boundary | `src/pages/settings/Index.vue`、`src/components/common/StatusIndicatorConfigDialog.vue`、`src/stores/statusIndicators.ts` | fixture test, manual checklist | 当前 `rewrite/src/features/settings` 尚未将 indicator config 纳入 snapshot；后续需补设计/实现。 |
| 状态指示灯支持按 `groupId + dataItemId` 绑定接收数据项。 | status consumes receive output | preserve boundary | `src/stores/statusIndicators.ts`、`src/stores/frames/receiveFramesStore.ts` | fixture test, runtime validation, hardware validation | status 不读取 receive internal state；receive API 未实现前不能声明完成。 |
| 状态灯根据数据项值、阈值/范围和颜色规则计算当前显示状态。 | status | preserve | `src/stores/statusIndicators.ts` | fixture test, oracle comparison, manual checklist | 不继承旧色值或 UI 样式；颜色映射只表达状态角色。 |
| 旧状态灯每秒轮询刷新。 | status read model + UI snapshot | preserve principle | `src/stores/statusIndicators.ts` | fixture test, manual checklist, runtime validation | 旧 1s 是 evidence，不冻结为新刷新间隔；实现需声明 throttle/snapshot 策略。 |
| 串口 connected/connecting/disconnected/error 和字节/错误计数可见。 | connection owns truth; status summarizes | preserve boundary | `src/stores/serialStore.ts`、`src/components/connect/SerialPortList.vue` | fixture test, manual checklist, runtime validation, hardware validation | status 不能拥有 transport truth。 |
| 网络连接状态、错误、bytes/messages 等统计在连接页卡片可见。 | connection owns truth; status summarizes | preserve boundary | `src/stores/netWorkStore.ts`、`src/components/connect/NetworkConnectionCard.vue` | fixture test, manual checklist, runtime validation, hardware validation | 真实 TCP/UDP 状态需 hardware/runtime evidence。 |
| Connect 页面同时显示配置与连接状态。 | connection pages; status may provide summary widgets | preserve boundary | `src/pages/ConnectConfigPage.vue`、`src/components/connect/ConnectionContentPanel.vue` | manual checklist | 不把旧页面 store 组织继承为 status owner。 |
| SCOE 页面显示 runtime 秒数、命令收发计数、链路/心跳/健康状态。 | SCOE owns domain facts; status may read summary | deferred boundary | `src/pages/SCOEConfigPage.vue`、`src/components/scoe/StatusPanel.vue`、`src/stores/scoeStore.ts` | fixture test, runtime validation, hardware validation | SCOE 专属状态不能升级为全局 status truth。 |
| receive/global stats 统计包数、字节数、命中/未命中/错误等。 | receive/result/status split | deferred boundary | `src/stores/frames/receiveFramesStore.ts`、`src/stores/globalStatsStore.ts` | fixture test, runtime validation | 后续需决定哪些是 receive stats，哪些进入 status summary。 |
| 旧 serial/network IPC/preload 事件名直接驱动 UI 状态。 | platform/connection evidence only | candidate drop for exposure shape | `src-electron/main/ipc/serialHandlers.ts`、`src-electron/main/ipc/networkHandlers.ts` | static scan, runtime validation | 新实现不得继承裸 IPC/大 `window.electron` 暴露形态。 |

## 6. Owner / not owner

| 分类 | status owner | status not owner |
| --- | --- | --- |
| 状态摘要 | 面向 UI 和内部消费者的 health summary、indicator snapshot、transport/receive/task/result/SCOE 等材料的只读摘要。 | connection lifecycle truth、receive parse truth、send result truth、task lifecycle truth、SCOE domain truth、result truth。 |
| 状态指示 | indicator config 的运行语义、数据源绑定校验、当前 active/current 状态、状态角色映射、刷新节流 read model。 | settings 持久化默认值合并、视觉 token、组件样式、receive 字段解析、connection target route。 |
| 统计 read model | status-owned summary，例如 health level、最近状态变化、整体可用性、异常摘要、UI-safe indicator list。 | receive frame stats、connection byte counters、send result counters、task progress、SCOE command counters 的事实源。 |
| public boundary | 提供只读 selector/reader、可选 recompute/reset/ack command、fixture input boundary 和 UI-safe snapshot。 | 暴露其他 feature 内部 state，允许外部写入 status state，承接 platform/preload/main 能力。 |
| external projection material | 给 northbound/status query 提供内部 status material 候选。 | northbound heartbeat/status query 协议、外部状态枚举、错误码、customer response schema。 |

## 7. State owner

| State layer | Owner | Write rule | Readers | Reset / lifecycle / persistence | Design guard |
| --- | --- | --- | --- | --- | --- |
| Status input material | connection、receive、send、task、SCOE、result 等事实 owner | 各 feature 自己写；status 只能通过 public selector/event/runtime 获取 | status service/runtime | 随各 owner 生命周期变化；status 不持久化底层事实 | status 不回读 internal state，不复制底层事实作为 truth。 |
| Indicator config snapshot | settings 可拥有 persisted preference；status 拥有语义校验和 active read model | settings 写持久配置；status 写运行投影 | status、settings page、widgets | 低频配置更新；是否持久化由 settings/status split 明确 | 当前 settings 实现未包含完整 indicator config，implementation 前需补齐。 |
| Status read model | status | status service/state 单点写入，基于显式输入或重算 | pages、widgets、runtime、northbound future | reset/recompute/clear 由 status service 定义；默认 transient | 只保存 summary/indicator projection，不保存 socket、raw bytes、task internals。 |
| UI snapshot | pages/widgets/status composable | UI 只写筛选、展开、loading、显示模式、错误提示等展示状态 | UI components | 页面生命周期；默认不持久化 | UI snapshot 不能定义 health truth、连接 truth 或接收 truth。 |

## 8. Public API necessity

status 需要 public API，因为 pages/widgets、runtime、future northbound 需要读取状态摘要，connection/receive/task/SCOE/result 等 feature 会成为输入来源。API 是边界能力类别，不是文件形态或 schema。

Allowed capability categories:

- Input material category: 接收 connection/receive/send/task/SCOE/result 的只读 snapshot、explicit event 或 runtime-routed material。
- Indicator config category: 接收 settings 提供的 persisted indicator preference snapshot，并在 status 内做语义校验和运行投影。
- Summary selector category: 提供 UI-safe health summary、indicator snapshot、status role、last change 和 error summary。
- Lifecycle/reset category: reset/recompute/clear status read model；不重置底层 feature truth。
- Acknowledge/silence candidate: 若后续需要告警确认，只写 status read model 或 UI state，不改底层事实；本轮不冻结。
- Test boundary category: 接收 fake connection/receive/task/SCOE/result material，输出 expected status projection。

Explicitly not status public API:

- connection connect/disconnect/write/target API。
- receive ingest/match/parse API。
- send request/result owner API。
- task start/stop/progress API。
- SCOE command/complete API。
- result/report/northbound schema/API。
- mutable store、internal service、feature internal state、raw IPC event、platform object。

## 9. Runtime / UI involvement

Runtime may:

- 装配 status reader/service/state 和 fake/real input material provider。
- 从 connection/receive/task/SCOE/result public API 或显式事件收集只读材料，传给 status。
- 对高频 receive/send material 做节流、批次路由或 coalesced recompute 触发。
- 为 HeaderBar、connection page、receive page、home/status widgets 组合只读 view model。
- 登记 receive 高频、SCOE 专属状态、northbound status query、hardware/customer validation 的 gap。

Runtime must not:

- 保存 connection/receive/task/SCOE/result truth。
- 实现 status mapping 规则、状态灯阈值判断或 health summary 语义。
- 访问 Electron/Node/raw IPC 或 platform primitive。
- 成为全局状态 store 或所有 feature 的回读中心。

UI may:

- 通过 status public selector、runtime page API 或 page composable 获取 status snapshot。
- 持有 page-local UI snapshot，例如过滤、展开、loading、selected indicator、错误提示。
- 将 page/runtime 组合后的 snapshot 作为 props 传给 widgets。

UI must not:

- 直接 import `features/status/state` 或其他 feature internal state。
- 自行读取 connection/receive/SCOE store 拼健康状态。
- 订阅 raw transport bytes 或 platform events。
- 用 UI snapshot 反向定义运行事实。
- 写颜色/样式 token；样式实现必须另行遵守 `rewrite-ui-style-baseline.md`。

## 10. Cross-feature communication rules

| Collaborator | May provide / consume | Must not do |
| --- | --- | --- |
| settings | 提供 indicator config/defaults 只读 snapshot；settings page 可触发配置编辑。 | 解释当前状态、读取 receive/connection internals、计算 active color。 |
| connection | 提供 lifecycle/error/target/counter summary 或 explicit event。 | 让 status 写 connection facts，或把 transport target 当 northbound deviceId。 |
| receive | 提供 receive stats、field value material、parse/error/unmatched summary。 | 让 status 读取 receive internal state，或让 receive 直接写 status internals。 |
| send | 提供 send result/error summary material。 | 让 status 定义 send business result。 |
| task | 提供 lifecycle/progress projection。 | 让 status 推进任务状态或解释 stop/completed/customer status。 |
| SCOE | 提供 SCOE health/status summary material。 | 把 SCOE 专属状态当作全局 status truth，或在 status 内执行 SCOE completion 规则。 |
| result | 提供内部结果摘要 material。 | 让 status 定义 result truth。 |
| report/northbound | 可读取 status material 用于 report/northbound projection 的后续设计。 | 在本轮冻结 heartbeat、external status enum、HTTP/FTP 或 customer schema。 |
| pages/widgets | 读取 status snapshot 或 props。 | import feature internals、订阅 raw event、写 status truth。 |

## 11. Target internal layering

后续实现可以按实际需要创建目录，不为填模板而建空层：

| Layer | Target responsibility |
| --- | --- |
| `core` | 纯 TypeScript status mapping、indicator rule evaluation、health summary derivation、input material normalization。不得依赖 Vue、Pinia、Electron、platform、其他 feature internal state 或全局 store。 |
| `services` | 接收 input material、调用 core、写 status state、处理 recompute/reset/clear/ack candidate、输出 operation result 和 snapshot。 |
| `state` | status read model、indicator snapshot、health summary、last change/error summary、只读 selector。 |
| `fixtures` | fake connection/receive/task/SCOE/result material、indicator config legacy samples、expected status projection、unknown/deferred source samples。 |
| `composables` | 面向 status 局部 UI 的 UI snapshot 和 service 调用组合，不承载 mapping 规则。 |
| `components` | status indicator list、summary panel、health badge 等局部 UI；不跨 feature 拼 truth。 |

## 12. Fixture / manual test plan

Automatic evidence candidates:

- status mapping fixture: connection lifecycle/error/counter material -> health summary。
- receive material fixture: field value/range/unmatched/error material -> indicator active/current projection。
- settings compatibility fixture: indicator config disabled/empty/invalid/missing fields -> safe status config input。
- multi-source precedence fixture: connection error + receive ok + task pending 等组合 -> expected summary，不冻结字段 schema。
- selector fixture: status selector returns cloned/readonly projection and does not expose mutable state。
- static scan: status 不 import connection/receive/settings internal `state`、`adapters`、internal service、raw platform/Electron。

Manual checklist:

- HeaderBar 或 status widget 入口仍可见。
- 状态指示灯启用/禁用、空配置、配置错误、无数据、数据变化、异常状态可见。
- connection 页状态展示不丢失，但运行 truth 仍来自 connection。
- receive 页状态/错误摘要不逐包抖动，UI 只消费 snapshot。
- SCOE 状态若展示在全局 summary 中，必须标明来自 SCOE projection。

Runtime / hardware / customer validation:

- 真实串口/TCP/UDP 状态跳变、断开、重连、错误和事件顺序必须 runtime/hardware validation。
- receive 高频输入对 status 刷新节流和 UI snapshot 的影响必须 runtime validation。
- SCOE 真实设备状态、timeout、状态循环必须 hardware validation。
- northbound status query/heartbeat/self-check/alarm 必须 customer validation；本轮不声明完成。

## 13. Deferred and blockers

Deferred:

- `rewrite/src/features/receive` 尚未实现，status 不能声明 receive-driven indicator 完成。
- 当前 settings 实现只包含 recording 配置，尚未实现完整 status indicator config snapshot。
- task/send/SCOE/result/report/northbound 的 public material 未全部设计或实现。
- status 刷新节奏、event payload、summary 字段、状态枚举、告警确认行为均不冻结。
- northbound heartbeat/status query/self-check/alarm、外部状态名、错误码和 customer schema 均不进入本轮。

Blockers for implementation claims:

- 没有 runtime/hardware evidence 时，不能声明真实连接状态链路完成。
- 没有 receive implementation 和 fixture 时，不能声明基于接收字段的状态灯完整完成。
- 没有 customer evidence 时，不能声明 northbound status closure。
- 如果实现需要 import 其他 feature internal state，必须回到 feature design 更新 public API，而不是绕过边界。
