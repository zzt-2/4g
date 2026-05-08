---
doc_type: feature-design
feature: rewrite-receive
status: draft
date: 2026-05-04
summary: 东方红上位机重写中 receive feature 的 owner、接收匹配、运行事实、统计 read model、高频数据原则、runtime/platform 边界和验证分层。
---

# Rewrite receive feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
4. `codestable/architecture/rewrite-target-structure.md`
5. `codestable/architecture/rewrite-system-architecture.md`
6. `codestable/architecture/rewrite-feature-boundaries.md`
7. `codestable/architecture/rewrite-feature-interaction-matrix.md`
8. `codestable/architecture/rewrite-connection-transport-boundary.md`
9. `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
10. `codestable/quality/rewrite-quality-rules.md`
11. `codestable/quality/rewrite-review-checklist.md`
12. `codestable/features/rewrite-frame/rewrite-frame-design.md`
13. `codestable/features/rewrite-frame/rewrite-frame-checklist.yaml`
14. `codestable/features/rewrite-connection/rewrite-connection-design.md`
15. `codestable/features/rewrite-connection/rewrite-connection-checklist.yaml`
16. 当前实现参考：`rewrite/src/features/frame`
17. 当前实现参考：`rewrite/src/features/connection` 如果后续存在；本轮扫描时该目录不存在，因此 connection 只以 design/checklist 为准。

`codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向和 feature 归口的 canonical 架构基线。`rewrite-frame-design.md` 固定 frame 是静态资产 owner，`rewrite-connection-design.md` 固定 connection 是 transport facts 和 byte input owner。

## 2. Boundary guards

- 本轮是 Lane B receive feature design，只产出 design/checklist。
- 本轮不实现 receive。
- 本轮不写 serial、TCP、UDP、preload、main 或 renderer API schema。
- 本轮不冻结 receive API schema、DTO、channel、事件 payload、错误码或枚举。
- 本轮不进入 send、task、SCOE、result、report、northbound 内部实现。
- receive owns 接收匹配、接收运行事实、解析输入流到 frame reference 的匹配结果、接收统计 read model 候选。
- receive does not own frame definition、connection transport facts、send task state、SCOE semantics、report、northbound。
- 高频数据流本轮只锁原则：buffer、batch、backpressure、snapshot、UI refresh、统计 read model 分层。
- 统计 read model 禁止写回 frame definition、field definition、表达式定义、展示配置或其他静态资产。
- 跨 feature 只能通过 frame/connection public API、runtime 编排、显式事件或只读 selector 交互，不 import internal state。
- 不把 connection target 等同 northbound `deviceId`。
- 不把 history、CSV、本地文件导出等同 TestReport 或 northbound file delivery。
- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport` 或旧 `window.electron`。
- main 可以承载与平台资源绑定且性能压力明显的 buffer、batch、queue、backpressure，但不承载 receive 匹配、字段解析、任务推进、SCOE 完成条件、报告或 northbound 语义。
- 旧 `src/`、`src-electron/`、`public/` 只作为 legacy evidence、fixture、oracle 或 migration input，不作为新代码落点。
- 不读取或修改前端自动生成 types 文件。

## 3. Evidence summary

### 3.1 Contract evidence

- target structure 将 `features/receive` 定义为输入字节流承接、帧匹配、字段解析、表达式输入、接收结果输出的 owner，明确不拥有任务是否开始、SCOE 完整领域执行或历史落盘编排。
- system architecture 要求静态资产、运行事实、统计 read model 和 UI snapshot 分层；高频链路按 batch、delta、queue、throttle、snapshot 和 backpressure 设计。
- feature boundaries 和 interaction matrix 明确 `connection -> receive` 的事实边界：connection owns transport/source facts，receive owns parse facts；`receive -> task/status/result/storage/SCOE` 必须通过显式输出、runtime 编排或事件，不允许 receive 直接写对方 state。
- connection design 明确 connection 只发布 incoming byte batches、source snapshot、lifecycle/error material；receive 不 import connection internal state。
- frame design 明确 frame owns frame/field/expression definition；receive 只能读取只读 frame asset snapshot 或 reference projection，不能写回 frame state。
- quality rules R8 要求 receive 主链只承接输入、解析、归一和明确接收结果输出；R13 要求统计 read model 不污染静态模型。
- validation baseline 要求每个 feature design 登记 legacy observable behavior ledger，并区分 static scan、Vitest unit、fixture test、oracle comparison、fake adapter test、manual checklist、runtime validation、hardware validation、package validation 和 customer validation。

### 3.2 Current rewrite implementation reference

- `rewrite/src/features/frame` 当前已有 frame core、service、state、selector、fixtures 和 Vitest 基线，可作为 receive 后续消费 frame reference 的实现风格参考。
- `rewrite/src/features/connection` 本轮扫描时不存在。receive 本轮不能假定 connection public API 已实现，只能引用 `rewrite-connection-design.md` 和 `rewrite-connection-checklist.yaml` 中的边界和后续验证要求。
- `rewrite/src/features/receive` 本轮开始前不存在。本设计和 checklist 是后续 receive implementation 的正式入口，不复用旧 `src/stores/frames/receiveFramesStore.ts` 的结构。

### 3.3 Legacy evidence

本轮只读扫描到的旧系统事实只用于保留可观测行为和识别迁移风险，不能自动升级为新架构结构：

- receive 页面、组件和展示：`src/pages/ReceiveFramePage.vue`、`src/components/frames/receive/FrameStatsPanel.vue`、`src/components/frames/receive/DataDisplay/DataDisplayContainer.vue`、`src/components/frames/receive/DataDisplay/DataTable.vue`、`src/components/frames/receive/ReceiveFrameSelector.vue`、`src/components/frames/receive/FrameStructureViewer.vue`
- receive store 和接收主链：`src/stores/frames/receiveFramesStore.ts`
- receive parser/matcher/validator：`src/utils/receive/dataProcessor.ts`、`src/utils/receive/frameMatchers.ts`、`src/utils/receive/frameValidators.ts`
- SCOE 特殊接收分支：`src/utils/receive/scoeFrame.ts`、`src/stores/frames/receiveFramesStore.ts`
- connection 入站接入：`src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`、`src-electron/main/ipc/serialHandlers.ts`、`src-electron/main/ipc/networkHandlers.ts`
- 旧 receive IPC 与主进程业务化风险：`src/api/common/receiveApi.ts`、`src-electron/preload/api/receive.ts`、`src-electron/main/ipc/receiveHandlers.ts`、`src-electron/main/ipc/receiveConfigCache.ts`
- 接收展示和历史采样 read model：`src/stores/frames/dataDisplayStore.ts`、`src/stores/globalStatsStore.ts`
- task/send/SCOE 边界耦合：`src/stores/frames/sendTasksStore.ts`、`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts`、`src/composables/scoe/useScoeCommandExecutor.ts`
- 本地 history/CSV/export：`src-electron/main/ipc/historyDataHandlers.ts`

## 4. Design

### 4.1 Goals and non-goals

Goals:

- 保留旧系统接收页面入口、接收数据展示、帧统计、当前值/数据项、错误/未匹配可见结果和接收触发候选等可观测行为。
- 锁定 receive 对输入批次到 frame reference match result、field value delta、parse/match error、receive runtime facts 和接收统计 read model 的 owner 边界。
- 锁定 receive 只消费 frame 静态资产只读快照和 connection 输入批次/来源快照，不拥有 frame definition 或 connection transport facts。
- 锁定 receive 与 task/status/result/storage/SCOE/report/northbound 的跨 feature 输出方式，防止旧 receive tail side effects 继续堆叠。
- 锁定高频数据原则：ingress buffer、batch、backpressure、delta/snapshot、UI refresh coalescing、统计 read model 分层。
- 为后续 implementation 建立 fixture、oracle、fake adapter、manual、runtime、hardware、package、customer validation 计划。

Non-goals:

- 不实现 receive core、service、state、UI、runtime route 或 platform bridge。
- 不写具体 receive input schema、事件名、payload、DTO、channel、错误码、枚举、队列阈值或刷新间隔。
- 不实现 serial/TCP/UDP、preload/main transport schema 或 connection feature。
- 不设计 send frame build、task lifecycle、SCOE command/completion、result/report/northbound 内部流程。
- 不把旧 `receiveFramesStore`、旧 `receiveApi`、旧 main `receiveHandlers` 或旧 `receiveConfigCache` 的组织方式迁入 `rewrite/`。
- 不声明真实串口、TCP、UDP、SCOE、高频稳态、打包态 data path、HTTP/FTP、northbound 或 customer closure 完成。

### 4.2 Owner / not owner

| 分类 | receive owner | receive not owner |
| --- | --- | --- |
| 输入承接 | 从 runtime/connection 接收 normalized byte batch、source snapshot、输入可用性和 lifecycle/error material，并形成 receive-side ingestion fact。 | 串口/TCP/UDP 连接生命周期、target availability、socket/serialport handle、platform event subscription。 |
| 匹配和解析 | 基于 frame reference snapshot 执行接收方向帧匹配、字段切片、字段值解析、字段 value delta、parse/match error、unmatched result。 | frame definition、field definition、expression definition、frame import/export、frame migration。 |
| 配置引用 | 维护 receive 所需的低频 reference snapshot、mapping/reference consistency 检查结果和解析可用性 read model。 | frame 静态资产源 truth、settings 默认值 truth、storage 持久化格式。 |
| 运行事实 | 接收队列/批次处理事实、最近输入、最近命中、最近错误、当前 matched frame reference、当前 field value delta、接收处理状态。 | task lifecycle、send execution state、SCOE command state、result truth、report generation state、northbound transaction。 |
| 统计 read model | 按稳定 key 维护接收包数、字节数、命中数、未匹配数、parse error、frame stats、field last value、rate/latency candidates、recent packet snapshot。 | global system lifecycle、frame definition stats、send result stats、task progress stats、northbound/customer status。 |
| 输出边界 | 向 pages/status/task/result/storage/SCOE 提供只读 selector、explicit receive result event、trigger candidate 或 runtime-routed output。 | 直接修改其他 feature internal state、决定任务是否开始/结束、执行 SCOE 命令、生成报告或交付文件。 |
| 高频处理 | 在 TypeScript receive 层设计 parse queue、batch/delta/snapshot/read model 原则，并配合 runtime 验证 backpressure。 | 为了性能把 frame match、field parse、task trigger、SCOE completion 或 report semantics 放进 main。 |

receive 的核心职责是把输入流归一为可测试的接收结果和接收 read model。receive 不是 task trigger 的事实 owner，不是 SCOE 专项协议 owner，也不是 result/report/northbound 的闭环 owner。

### 4.3 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level | blocker / note |
| --- | --- | --- | --- | --- | --- |
| `/frames/receive` 接收页面入口可达，页面展示接收帧选择、统计、数据结构和数据显示区域。 | pages + receive | preserve | `src/pages/ReceiveFramePage.vue`、`src/components/frames/receive/*` | manual checklist | 新 UI 重建后验证入口和可见状态。 |
| 串口和网络入站数据都汇聚到 receive 统一入口。 | connection produces input; receive consumes | preserve boundary | `src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`、`src/stores/frames/receiveFramesStore.ts` | fixture test, runtime validation, hardware validation | 新链路必须经 connection public boundary/runtime，不 import connection internals。 |
| receive 入口使用处理锁和 pending queue 避免并发重入。 | receive | preserve principle | `src/stores/frames/receiveFramesStore.ts` | fixture test, runtime validation | 本轮不冻结队列结构、上限或 overflow 策略。 |
| receive 按 `direction === 'receive'` 过滤可接收帧。 | frame owns definition; receive consumes snapshot | preserve | `src/stores/frames/receiveFramesStore.ts`、`src-electron/main/ipc/receiveConfigCache.ts` | fixture test | 过滤规则应集中在明确 reference projection，避免多份副本漂移。 |
| receive 使用 `identifierRules` 匹配帧，旧实现规则列表实际按 AND 处理。 | receive consumes frame reference | preserve as legacy observable; design gap noted | `src/utils/receive/frameMatchers.ts` | fixture test, oracle comparison | `logicOperator` 是否支持 OR 后续需单独决定，不能临场扩展。 |
| frame fields 驱动字段 offset、length、data type、big endian、factor、label options 等解析。 | receive consumes frame field reference | preserve | `src/utils/receive/dataProcessor.ts` | fixture test, oracle comparison | frame definition 仍归 frame；receive 只读取 snapshot。 |
| 仅直接数据字段参与接收匹配/解析，间接字段由后续表达式或消费者输出填充。 | receive + frame reference | preserve | `src/stores/frames/receiveFramesStore.ts`、`src-electron/main/ipc/receiveConfigCache.ts` | fixture test | 后续 expression runtime 需要单独锁安全模型。 |
| 无 receive 配置或缓存为空时返回失败并累计 error/unavailable 类统计。 | receive | preserve | `src-electron/main/ipc/receiveHandlers.ts` | fixture test | 新实现不使用旧 main cache 作为业务 owner。 |
| 无帧命中时返回 unmatched result、recent packet 和 unmatched counter。 | receive | preserve | `src-electron/main/ipc/receiveHandlers.ts`、`src/stores/frames/receiveFramesStore.ts` | fixture test, oracle comparison | unmatched 只进入 receive read model，不变成 task/result truth。 |
| 匹配成功时返回 updated groups / updated data items，前端更新当前值并触发表达式计算。 | receive owns parse output; expression definition belongs frame | preserve boundary | `src/utils/receive/dataProcessor.ts`、`src/stores/frames/receiveFramesStore.ts` | fixture test, oracle comparison | 运行结果不写回 frame definition。 |
| receive 维护 frameStats、recentPackets、frameDataCache、allReceiveFrameData 等当前值和近期事件读模型。 | receive statistics/read model | preserve with layering | `src/stores/frames/receiveFramesStore.ts` | fixture test, runtime validation | 不继承旧 store shape；按稳定 key 增量维护。 |
| globalStatsStore 记录 received packets/bytes、match/unmatched/error 和速率类统计。 | status/global stats candidate; receive owns receive source stats | preserve boundary | `src/stores/globalStatsStore.ts` | fixture test, runtime validation | 后续 status design 决定系统级汇总 owner；receive 不写全局可变大 store。 |
| DataTable 约 500ms 刷新表格快照，dataDisplayStore 约 1s 采集历史/图表环形缓冲。 | UI snapshot + storage/history candidate | preserve principle | `src/components/frames/receive/DataDisplay/DataTable.vue`、`src/stores/frames/dataDisplayStore.ts` | manual checklist, runtime validation | 本轮不冻结刷新间隔；只锁 UI 不逐包参与解析。 |
| 接收消息/近期日志存在数量上限和截断，避免无限增长。 | receive/UI snapshot | preserve principle | `src/stores/serialStore.ts`、`src/stores/frames/receiveFramesStore.ts` | fixture test, runtime validation | 不冻结具体上限；后续按性能验证决定。 |
| mapping validation 校验 frame/field/group/dataItem 引用一致性。 | receive owns receive mapping validation; frame owns field definition | preserve | `src/utils/receive/frameValidators.ts`、`src-electron/main/ipc/receiveHandlers.ts` | fixture test | 不把 mapping schema 在本轮冻结。 |
| receive 成功后旧实现直接调用 send task trigger。 | task owns trigger/lifecycle; receive outputs trigger candidate | preserve as explicit event boundary | `src/stores/frames/receiveFramesStore.ts`、`src/stores/frames/sendTasksStore.ts`、`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts` | fixture test, runtime validation | receive 不直接写 task state。 |
| receive 内有 SCOE source special-case，SCOE 命中时可能短路普通 receive。 | SCOE owns semantics; receive/runtime provide explicit boundary | deferred | `src/stores/frames/receiveFramesStore.ts`、`src/utils/receive/scoeFrame.ts` | fixture test, runtime validation, hardware validation | 后续 SCOE design 决定 fixed source exception 和是否走通用 receive。 |
| 旧 main `receiveHandlers` 执行 frame match、field processing 和 stats 构造。 | receive core in renderer TypeScript; main platform only | candidate drop for location | `src-electron/main/ipc/receiveHandlers.ts` | static scan, fixture test | 行为可作为 oracle；业务逻辑位置不能继承。 |
| 旧 receiveConfigCache 在 main 缓存 frames/mappings/groups 解析副本。 | frame/receive/runtime reference snapshot | deferred | `src-electron/main/ipc/receiveConfigCache.ts` | runtime validation | 如后续需要 cache，必须登记 owner、refresh trigger 和退出条件。 |
| 旧 TCP 入站在 network handler 按 `\\r\\n` 分包后进入 receive。 | connection/runtime input normalization candidate | deferred | `src-electron/main/ipc/networkHandlers.ts` | fixture test, runtime validation | 后续决定是 transport normalization、receive compatibility rule 还是 drop candidate。 |
| 旧高速存储命中会短路普通 renderer receive event。 | storage/receive/runtime exception | deferred | `src-electron/main/ipc/networkHandlers.ts`、`src/stores/highSpeedStorageStore.ts` | runtime validation, hardware validation, package validation | 必须登记 exception，不由 receive 或 connection 私自短路。 |
| 旧 history/CSV/export 能读取接收材料并本地导出。 | storage/history/report material; not receive closure | preserve as material boundary | `src/stores/frames/dataDisplayStore.ts`、`src-electron/main/ipc/historyDataHandlers.ts` | manual checklist, package validation | 不等同 TestReport 或 northbound delivery。 |
| 旧 `receiveApi`/preload 暴露 `receive:handleReceivedData`、`receive:updateConfigCache` 等业务 API。 | platform exposure shape should be dropped | candidate drop for exposure shape | `src/api/common/receiveApi.ts`、`src-electron/preload/api/receive.ts` | static scan | 新 platform 不暴露 receive 业务处理为桌面能力。 |

### 4.4 State owner

| State layer | Owner | Write rule | Readers | Reset / persistence | Design guard |
| --- | --- | --- | --- | --- | --- |
| Static config references | frame owns frame/field/expression definitions; receive may own receive-specific mapping/reference snapshots and consistency results. | frame assets change through frame public service; receive reference refresh goes through frame selector/runtime input. receive mapping changes go through receive service when implemented. | receive core/service, receive page, task/SCOE configuration readers through allowed selectors. | Low-frequency. Persistence is deferred to storage/settings design; not part of runtime input events. | Static references are not runtime facts. Statistics, last value and error counters cannot write back to frame definition or receive mapping config. |
| Runtime receive facts | receive | Single writer in receive service/state based on explicit byte batch input, parser result, lifecycle reset, or runtime cleanup. | receive page, status/task/result/storage/SCOE through selector/event/runtime. | Reset by receive lifecycle, config/reference refresh, app cleanup or explicit clear action. Usually transient unless later design records history. | Must not be written by connection, frame, task, SCOE, status, report or pages. |
| Statistics read model | receive for receive-owned stats; status/result/storage may own their own summaries after consuming receive output. | Incremental batch/delta updates by stable keys such as source reference, frame reference, field reference, error category or time bucket. | pages, status, result, storage, task trigger candidate consumers via read-only selector/event. | Reset timing and persistence must be declared per statistic during implementation. Default is transient read model. | No stats in frame list/field definition/config object. Avoid full replacement of large arrays on every packet. |
| UI snapshot | pages, receive composables, receive components | UI writes only selection, filters, pagination, table/chart projection, viewport state and local display throttling. | UI components only. | Reset by page lifecycle unless user preference persistence is explicitly designed through settings. | UI snapshot cannot define receive truth, queue state, task lifecycle or result status. |

State rules:

- Static config references, runtime receive facts, statistics read model and UI snapshot must remain physically and conceptually separate.
- receive state may expose immutable selector output, not mutable collection references, Vue refs, Pinia internals or internal service instances.
- receive state must not store connection internal state, socket/serialport objects, frame internal store references, task state, SCOE state, result truth or report/northbound transaction facts.
- Statistics items must record owner, reader, reset timing, lifecycle, persistence posture and validation level before implementation can claim completion.

### 4.5 Public API necessity

receive needs a public boundary because connection/runtime feed it byte batches and task/status/result/storage/SCOE/pages may consume receive output. This boundary is not a required file shape and does not freeze schema.

Allowed capability categories:

- Input ingestion category: accept normalized byte batch or transport input event from runtime/connection with source snapshot material.
- Frame reference consumption category: read frame asset/reference snapshots through frame public selector or runtime injection.
- Receive result category: expose matched frame reference, field value delta, unmatched/parse error and receive processing result as explicit output.
- Statistics selector category: expose read-only receive stats, recent input, frame stats, field last value and UI-safe snapshot candidates.
- Lifecycle/reset category: clear transient receive facts, reset statistics or handle reference snapshot refresh through receive service.
- Validation category: validate receive mapping/reference consistency using frame reference input without mutating frame state.
- Test boundary category: accept fake input batches, fake frame snapshots and error/lifecycle cases for fixture and fake adapter tests.

Explicitly not receive public API:

- frame create/update/delete/import/export/migration API.
- connection connect/disconnect/target/write API.
- send frame build or transport write API.
- task start/pause/resume/stop/progress lifecycle API.
- SCOE command parse/execute/complete/tool-record API.
- result/report/northbound projection, TestReport, HTTP/FTP or file delivery API.
- mutable receive store, internal service implementation, connection store, frame store, raw platform event or raw IPC channel.

Public output rules:

- `receive -> task` outputs trigger candidate or receive result material; task owns trigger strategy and lifecycle.
- `receive -> status` outputs receive health/material; status owns health summary.
- `receive -> result` outputs source facts; result owns result truth and attribution.
- `receive -> storage` outputs local material; storage owns persistence/history/file writing.
- `receive -> SCOE` outputs explicit candidate input if SCOE design accepts it; SCOE owns command semantics and completion.
- `receive -> report/northbound` has no direct public API in this feature design.

### 4.6 Runtime and platform involvement

runtime is required for receive only where lifecycle, cross-feature routing or high-frequency exception handling crosses feature boundaries.

runtime may:

- create and release receive service/state and fake/real input subscriptions.
- inject frame reference snapshots from frame public selector into receive service.
- route connection byte batches and lifecycle/error material to receive without letting receive import connection internals.
- route receive output to task/status/result/storage/SCOE through explicit events or public service calls.
- coordinate startup/shutdown, reference refresh, subscription cleanup and stale event rejection.
- register boundary exceptions for high-frequency buffer/backpressure, TCP line split compatibility, high-speed storage short-circuit, SCOE fixed source/target, package/native-module behavior or future northbound interactions.
- combine read-only receive snapshot with page/status view model.

runtime must not:

- implement frame matching, field parsing, expression evaluation, mapping validation or receive statistics meaning.
- own receive runtime facts or statistics read model.
- decide task lifecycle, SCOE completion, result truth, report generation or northbound/customer semantics.
- become a global event bus or service locator.
- directly access Electron, Node, `serialport`, socket handles, file system or raw IPC.

platform/preload/main posture:

- receive core and service should live in renderer TypeScript and be testable without Electron.
- platform facade may expose transport primitive only to connection adapters, not receive business handlers.
- preload must not expose `receive:handleReceivedData`-style business API as a platform ability.
- main may buffer, batch, throttle, queue or apply backpressure to raw transport data only when tied to platform resources or performance pressure.
- main must not match frames, parse fields, update receive stats, evaluate expressions, decide trigger candidates, execute SCOE logic, write result/report truth or convert northbound errors.
- Any main-side high-frequency exception must state why renderer/TypeScript core cannot reasonably own it, what main retains, where business semantics live, validation required and exit condition.

### 4.7 High-frequency data flow principles

本轮不设计具体队列深度、窗口大小、延迟阈值或丢弃策略，只锁实现必须遵守的原则：

1. Ingress buffer: connection/platform may buffer raw bytes for platform/performance reasons; receive owns parser-side queue facts only after normalized batch reaches receive boundary.
2. Batch: receive should process byte batches or normalized input events, not let every byte or every platform event directly fan out to UI and multiple stores.
3. Backpressure: overload behavior must be explicit. Implementation must declare queue cap, overflow/drop/defer policy or explain why a cap is not required for the accepted runtime target.
4. Delta first: parser output should be expressed as deltas and stable-key updates where possible, avoiding full replacement of frame arrays, mapping arrays or large UI objects per packet.
5. Snapshot: pages/widgets consume immutable snapshots or throttled read models; they do not subscribe to raw byte streams or participate in stats accumulation.
6. UI refresh: table/chart/recent packet display refresh cadence must be UI-owned or composable-owned snapshot behavior, not packet cadence. Legacy 500ms/1s sampling is evidence, not a frozen interval.
7. Statistics layering: receive stats are read models by stable key. They must declare owner, reader, reset timing, lifecycle, persistence and validation level. They never write back to frame definition or receive static config references.
8. Exception registry: TCP line split, high-speed storage bypass, SCOE fixed source and main-side buffering must be runtime exceptions with owner and validation evidence, not hidden branches inside generic receive.
9. Validation before claim: without runtime/hardware evidence, high-frequency design can only claim static/fixture readiness, not steady-state throughput acceptance.

### 4.8 Cross-feature communication

| Collaborator | May consume / provide | Must not do |
| --- | --- | --- |
| frame | Provide read-only frame asset/reference snapshot, receive-direction frame references, field definitions and expression definitions. | Let receive mutate frame definitions, write stats into fields, import frame internal state or depend on frame store shape. |
| connection | Provide incoming byte batches, source snapshot, lifecycle/error material and input availability through public boundary/runtime. | Let receive manage connection lifecycle, read socket/serialport handles, mutate target availability or equate sourceId with northbound deviceId. |
| task | Consume receive result or trigger candidate through explicit event/runtime. | Let receive directly call task internal state or decide running/completed/paused/stopped. |
| status | Consume receive stats/material and build status summary in status owner. | Let receive own system health truth or let status import receive internal state. |
| result | Consume explicit receive output as result material. | Let receive define final case result, report result or external success/failure semantics. |
| storage/history | Consume receive material for local history, snapshots or high-speed storage exception once designed. | Let receive perform arbitrary file writes, define storage path policy or claim TestReport/file delivery closure. |
| SCOE | Consume explicit SCOE candidate input if SCOE design accepts it. | Hide SCOE fixed source/target or command completion inside generic receive parser. |
| send | No direct dependency required in this design. Future relation should go through task/runtime if receive trigger leads to send. | Let receive invoke send internal sender or decide send result. |
| report | No direct receive API in this design. Future report may read result/storage material, not receive internals. | Generate report inside receive or use receive stats as TestReport schema. |
| northbound | No direct receive API in this design. Future northbound reads task/status/result/report/storage projections. | Treat receive source, connection target, history or CSV as customer device/report/delivery truth. |
| pages/widgets | Read receive UI-safe snapshots, stats and result projections. | Subscribe to raw transport bytes, parse frames, accumulate stats or mutate receive runtime facts. |

Allowed interaction patterns:

- selector for read-only receive snapshot or statistics read model.
- public service for receive lifecycle/reset and test input.
- explicit event for receive result, trigger candidate, parse error and high-frequency decoupling when useful.
- runtime orchestration for connection -> receive, frame snapshot refresh and receive -> task/status/result/storage/SCOE routing.

Prohibited interaction patterns:

- feature A imports `features/receive/state`, receive internal service, adapter, composable or private helper to mutate facts.
- receive imports connection/frame/task/SCOE/status/result/report/northbound internal state.
- pages/widgets subscribe to platform events or raw byte streams.
- runtime or main hides receive business logic under performance or IPC simplification.

### 4.9 Target internal layering

后续实现的目标分层只描述职责，不在本设计中冻结字段 schema。

| Layer | Target responsibility |
| --- | --- |
| `core` | 纯 TypeScript 规则。负责 byte batch -> frame reference match -> field parse -> receive result、mapping/reference consistency、parse error 分类候选、stats delta 计算候选。不得依赖 Vue、Pinia、Electron、platform、Node、global store、connection store 或 frame store。 |
| `services` | receive 用例入口。负责 ingest input batch、调用 core、写入 receive state、输出 explicit result event、处理 reference snapshot refresh、reset/clear 和错误归一。依赖通过构造函数、工厂或明确 context 注入。 |
| `state` | receive runtime facts、statistics read model、recent input snapshot、frame/field last value read model、UI-independent selector。state action 保持薄层，不保存 platform adapter，不写其他 feature state。 |
| `adapters` | 可选边界层。用于 fake input source、legacy oracle loader 或 runtime event adapter。real transport adapter 属 connection，不属于 receive。adapter 不解释 frame definition owner 或 connection lifecycle。 |
| `composables` | 面向 receive 页面和局部组件的 UI-facing 组合。负责筛选、分页、表格/图表 snapshot、错误展示、selector 组合和 service 调用，不解析协议、不累计统计。 |
| `components` | 接收帧选择、统计面板、数据结构展示、数据表、近期事件和错误展示等 UI。组件通过 props/events/composables 使用 receive 能力，不直接访问 platform 或其他 feature internals。 |
| `fixtures` | byte samples、frame reference samples、mapping samples、expected match/parse output、unmatched/error samples、高频小样本、legacy observable behavior oracle。fixtures 是证据材料，不是新核心 schema。 |
| `oracles` | 可选 golden output、legacy 对照、日志/截图索引和不可直接变成 fixture 的旧行为证据。必须登记 provenance，不作为生产模型来源。 |
| `__tests__` | core/service/state/selector/fake-adapter spec。测试断言通过 public output 或 explicit state selector，不依赖 Vue/Electron/runtime/hardware。 |

### 4.10 Fixture / oracle / test plan

Static scan:

- 检查 design/checklist 章节、direct contract、boundary guards、legacy observable behavior ledger、owner/not owner、state owner、public API、runtime/platform、高频原则、cross-feature、validation 和 deferred 是否存在。
- 后续实现时检查 `features/receive/core` 无 Vue/Pinia/Electron/platform/Node/global store 依赖；receive 不 import frame/connection/task/SCOE/status/result/report/northbound internal state；platform/preload/main 不暴露 receive business API。

Vitest unit:

- matcher/parser core：no config、unmatched、matched、invalid length、invalid field、parse error、mapping missing、direct-data-only、field value conversion。
- stats delta：received bytes/packets、match/unmatched、frame stats、parse error、recent event candidate。
- selector/state：immutable snapshot、reset behavior、reference refresh behavior、no write-back to static config.
- service：ingest batch、emit receive result, reject stale input, handle reference refresh and reset with fake dependencies.

Fixture test:

- 最小合法 byte -> frame match -> fields -> receive result 正例。
- 多帧匹配优先级和 unmatched 负例。
- identifier rules AND legacy behavior 负例/正例。
- field offset、length、data type、big endian、factor、label option 解析样本。
- direct data field only 样本。
- mapping frameId/fieldId/groupId/dataItemId 缺失或错配样本。
- no-config、empty frame list、invalid bytes、truncated packet、unsupported field type、expression input missing 等错误样本。
- 高频小样本只验证 batch/delta/read-model 形态，不冻结性能参数。

Oracle comparison:

- 旧 `src/utils/receive/frameMatchers.ts` 和 `src/utils/receive/dataProcessor.ts` 的可判定输出可沉淀为 legacy oracle。
- 旧 `public/data/templates/receiveConfig.json`、`public/data/templates/framesConfig.json` 和可用历史样本只作为 oracle/migration input，不作为新 schema。
- 旧 UI 的 frameStats、unmatched、recent packet、data table snapshot 可作为 visible behavior oracle。

Fake adapter test:

- fake connection input source 提供 serial/network/TCP server/UDP-like byte batches、source snapshot、lifecycle error、stale event、burst input 和 shutdown cleanup。
- fake frame snapshot provider 提供 receive-direction frame references、empty snapshot、changed snapshot 和 invalid reference。
- fake runtime event sink 记录 receive result、parse error、trigger candidate 和 stats delta 输出。
- fake adapter 不承载真实 serial/TCP/UDP、preload/main 或 platform behavior。

Manual checklist:

- `/frames/receive` 页面和导航入口可达。
- 接收帧选择、统计面板、数据项/数据组、近期包、错误和未匹配状态可见。
- 输入停止、引用变化、清空/重置、错误提示和无配置状态可见。
- 表格/图表/近期事件使用 UI snapshot，不出现明显逐包闪烁或页面卡死。
- 不通过页面直接访问 platform、connection internals 或 frame internals。

Runtime validation:

- app startup/shutdown 装配顺序、frame snapshot refresh、connection byte batch -> receive 路由、receive output -> consumers 路由。
- subscription cleanup、stale event rejection、disconnect during burst、reference refresh during input。
- batch/window/overflow/backpressure/UI snapshot 策略运行记录。
- high-speed storage bypass、TCP split compatibility、SCOE fixed source exception 如触达必须登记 owner、exit condition 和验证记录。

Hardware validation:

- 真实串口 enumerate/open/close/reopen/send/receive/error/unplug 后进入 receive 的事件顺序。
- 真实 TCP client connect/send/receive/close/error/timeout 后进入 receive 的事件顺序。
- 真实 TCP server listen/client accept/client data/client close/server close 后进入 receive 的事件顺序。
- 真实 UDP bind/send/receive/remote route/broadcast candidate 后进入 receive 的事件顺序。
- 高频真实链路吞吐、延迟、backpressure 和 UI snapshot 行为。

Package validation:

- 仅当实现触达 packaged bridge、native module、data path、高速存储路径、extraResources 或打包态订阅差异时需要。
- package validation 不能由 Vitest 或开发态 Electron 替代。

Customer validation:

- 本 receive feature 不声明 customer closure。
- northbound、HTTP/FTP、TestReport、customer 状态/错误码/枚举必须由 northbound/result/report/customer validation 解锁。
- receive 只能提供内部事实材料，不能把接收值、history、CSV、connection target 或 sourceId 直接升级为客户对外交付语义。

Cannot claim from this design:

- receive implementation complete.
- real serial/TCP/UDP hardware chain complete.
- high-frequency steady-state complete.
- SCOE fixed source/target complete.
- packaged bridge/data path complete.
- report/northbound/customer closure complete.

### 4.11 Deferred / blockers

Deferred:

- Concrete receive input schema、event names、payload、error categories、DTO、channel、method、enum names。
- receive static config/reference/mapping model、persistence shape、migration rule and validation messages。
- frame reference projection shape and refresh trigger between frame/runtime/receive。
- connection source snapshot representation, `sourceId` normalization and UDP remote route material.
- TCP `\\r\\n` split ownership: connection input normalization, receive compatibility rule or candidate drop.
- queue depth、batch window、overflow/drop policy、backpressure、sampling、UI refresh interval and target throughput.
- expression runtime safety model and whether receive executes receive-side expressions or emits expression input to another owner.
- task trigger ownership and trigger candidate contract.
- SCOE fixed source/target exception and whether SCOE input bypasses generic receive.
- high-speed storage short-circuit boundary with storage/connection/runtime.
- status/global stats owner split for receive-derived system summary.
- result/report/northbound consumption of receive material.
- legacy receive JSON/sample compatibility scope and oracle corpus.

Blockers for implementation:

- No accepted concrete connection public API implementation for byte batch input.
- No accepted receive input/event schema or receive mapping/reference model.
- No accepted high-frequency backpressure/overflow policy.
- No accepted runtime route design for connection -> receive -> task/status/result/storage/SCOE.
- No accepted SCOE fixed source/target boundary.
- No hardware/runtime evidence for real serial/TCP/UDP event order.

Blockers for acceptance:

- Missing receive implementation and tests block implementation acceptance.
- Missing runtime high-frequency evidence blocks claiming batching/backpressure accepted.
- Missing real serial/TCP/UDP validation blocks claiming hardware receive accepted.
- Missing package validation blocks claiming packaged bridge/data path behavior accepted.
- Missing SCOE device evidence blocks claiming SCOE receive path accepted.
- Missing customer schema/environment blocks claiming northbound/report/customer closure.

## 5. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-receive/rewrite-receive-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、boundary guards、legacy observable behavior ledger、owner/not owner、state owner、public API necessity、runtime/platform involvement、high-frequency principles、cross-feature communication、validation plan 和 deferred/blocker 项，不能把本轮文档外的旧代码结构升级为新实现合同。
