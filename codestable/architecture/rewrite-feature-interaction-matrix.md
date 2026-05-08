---
doc_type: architecture
type: rewrite-feature-interaction-matrix
status: draft
date: 2026-04-29
summary: Global pre-design feature interaction matrix for the Dongfanghong rewrite. This document fixes producer, consumer, owner, write/read boundary, interaction candidate, validation posture, and pre-design decision gates without defining schemas, payloads, signatures, or feature internals.
tags:
  - rewrite
  - feature-interaction
  - matrix
  - pre-design
  - batch-0
---

# Rewrite feature interaction matrix

## 1. Scope

本轮是东方红上位机重写的全局预设计阶段，对话 3：Feature Interaction Matrix。

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

Boundary guards:

- `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`
- 当前 `src` 和 `src-electron` 旧代码事实，只作为 evidence、oracle 候选和迁移风险。
- `codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。

Non-goals:

- 不进入任何 feature 内部详细设计。
- 不写字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 不写 receive / send / task / SCOE 的详细实现。
- 不做代码移动，不实现业务代码。
- 不把旧 store、旧 composable、旧 main handler 或旧 IPC 组织升级为新架构。

本文只固定后续 `cs-feat-design` 前必须看见的交互边界：

- producer / consumer。
- 事实 owner。
- 写入方 / 读取方。
- 交互方向。
- public API 候选。
- runtime 编排候选。
- explicit event 候选。
- 高频、platform/main/preload、runtime/hardware/customer validation 和先决策口径。

## 2. Evidence summary

旧代码事实只用于识别迁移风险和 oracle 候选，不作为目标架构。

Evidence:

- 旧 frame definition 由 `frameTemplateStore.frames` 承载；旧 receive store 监听 frame/mapping/group 变化并同步 main cache。`src/stores/frames/frameTemplateStore.ts:13`, `src/stores/frames/receiveFramesStore.ts:210`, `src-electron/main/ipc/receiveConfigCache.ts:22`
- 串口和网络入站数据直接进入 receive store。`src/stores/serialStore.ts:391`, `src/stores/serialStore.ts:416`, `src/stores/netWorkStore.ts:200`, `src/stores/netWorkStore.ts:212`
- main 中 `receiveHandlers` 执行 frame match、field processing 和 stats 构造，是 main 业务化风险。`src-electron/main/ipc/receiveHandlers.ts:55`, `src-electron/main/ipc/receiveHandlers.ts:72`, `src-electron/main/ipc/receiveHandlers.ts:91`, `src-electron/main/ipc/receiveHandlers.ts:126`
- receive 成功后继续写 global stats、groups、expression、frame stats、trigger task 和 SCOE 分支。`src/stores/frames/receiveFramesStore.ts:1016`, `src/stores/frames/receiveFramesStore.ts:1089`, `src/stores/frames/receiveFramesStore.ts:1127`, `src/stores/frames/receiveFramesStore.ts:1149`
- send build 经 send instance、表达式、校验和和 target 落地；send 成功后直接写 send stats、global stats 和 SCOE 记录。`src/composables/frames/sendFrame/useUnifiedSender.ts:69`, `src/composables/frames/sendFrame/useUnifiedSender.ts:146`, `src/stores/frames/sendFrameInstancesStore.ts:199`
- 旧 connection/platform 通过大 `window.electron` 暴露面和 `api/common` 访问平台能力。`src-electron/preload/index.ts:1`, `src-electron/preload/api/index.ts:14`, `src/api/common/serialApi.ts:12`, `src/api/common/networkApi.ts:18`
- network main handler 对高速存储规则命中后短路普通 renderer data event。`src-electron/main/ipc/networkHandlers.ts:505`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:104`
- 旧 send task 由 store、creator、controller、executor、trigger listener 多点写状态；stop 清理后写 `completed`。`src/stores/frames/sendTasksStore.ts:15`, `src/stores/frames/sendTasksStore.ts:401`, `src/composables/frames/sendFrame/useSendTaskController.ts:26`
- 旧 SCOE 分散在 SCOE store、receive store、send chain、network connection、receive utils 和 SCOE composables 中。`src/stores/scoeStore.ts:18`, `src/stores/scoeStore.ts:212`, `src/stores/frames/receiveFramesStore.ts:911`, `src/utils/receive/scoeFrame.ts:5`, `src/composables/scoe/useScoeCommandExecutor.ts:13`
- 旧 storage/history/CSV/high-speed storage、settings、status、widgets/common read model 归口不清。`src/stores/historyAnalysis.ts:21`, `src/stores/frames/dataDisplayStore.ts:337`, `src/stores/highSpeedStorageStore.ts:21`, `src/stores/statusIndicators.ts:8`, `src/stores/globalStatsStore.ts:12`
- 当前旧代码没有独立 result/report/northbound/HTTP/FTP 闭环入口。`src-electron/main/ipc/index.ts:12`

Inference:

- 静态资产、运行事实、统计 read model 和 UI snapshot 必须分层，不允许统计写回 frame definition、field definition 或静态配置。
- receive/send/task/SCOE/result/report/northbound 的 owner 必须保留在各 feature 内；runtime 只表达装配、路由、调用顺序和边界输入输出。
- main 可以承接平台资源、生命周期和必要高频缓冲/批处理/背压，但不能承载 receive/send/task/SCOE/result/report/northbound 领域语义。
- northbound 只能读取 task/status/result/report/storage 的内部事实或素材并做对外投影/交付，不拥有内部 truth。

## 3. Matrix conventions

Interaction candidate values:

- `public service`: 调用目标 feature 明确公开的用例入口或 command/query service。
- `selector`: 读取目标 feature 公开的只读 snapshot / read model / asset selector。
- `runtime orchestration`: 由 `runtime/` 装配多个公开入口、处理生命周期、顺序和边界路由。
- `explicit event`: 异步、多消费者、高频、结果通知或跨域解耦需要的显式事件。

Column rules:

- `Fact owner` 表示该交互涉及的事实归口；若源事实和目标事实不同，用 `A source; B target` 表示。
- `Writer` 只能写自己 feature 的事实；跨 feature 推进必须通过目标 feature 公开入口、runtime 编排或显式事件。
- `Reader` 必须通过公开入口读取，不得 import 对方内部 state、adapter、内部 composable 或 service 实现。
- `Pre-design decision` 为进入对应 `cs-feat-design` 前必须显式确认的口径；`none` 表示本轮 matrix 已足够作为起点。

## 4. Feature interaction matrix

### 4.1 `frame` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame -> receive` | `frame` | `receive` | `frame` owns static assets; `receive` owns parse facts | `frame` writes frame/field assets; `receive` writes receive result/read model | `receive` reads asset snapshot | `selector`, `runtime orchestration` for snapshot refresh | Asset change no; runtime consume can be high | No direct platform. Main cache from old code is migration risk only | fixture for parser; runtime for real high-frequency input | Decide snapshot/cache owner and refresh trigger before receive design |
| `frame -> send` | `frame` | `send` | `frame` owns definitions; `send` owns send request/result | `frame` writes static assets; `send` writes send execution facts | `send` reads frame/send-instance input | `selector`, `public service` for validation | No | No direct platform; send later uses connection/platform | fixture for send build | Decide whether send instance is `send` asset or derived from `frame` before send design |
| `frame -> task` | `frame` | `task` | `frame` owns assets; `task` owns lifecycle/config facts | `frame` writes assets; `task` writes task facts | `task` reads allowed frame snapshot | `selector`, optional `runtime orchestration` | No | No | fixture for task config/oracle | Decide how local timed/trigger tasks reference frame assets without copying static definitions |
| `frame -> SCOE` | `frame` | `scoe` | `frame` owns generic assets; `scoe` owns SCOE command/frame domain assets | `frame` writes generic assets; `scoe` writes SCOE domain state | `scoe` reads explicit frame/SCOE asset input | `selector`, `public service`, `runtime orchestration` for exception registration | No | No direct platform; SCOE later uses connection/platform | fixture plus real SCOE validation | Decide SCOE-specific asset owner and avoid turning generic frame into SCOE state |
| `frame -> report` | `frame` | `report` | `frame` owns definitions; `report` owns report object/file prep | `frame` writes static definitions; `report` writes report generation facts | `report` reads allowed definition/material snapshot | `selector`, `runtime orchestration` after result ready | No | No direct platform; report file prep goes through storage/platform | fixture for report material mapping; customer validation for external report | Decide which frame metadata is report material without freezing report schema |

### 4.2 `connection` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `connection -> receive` | `connection` | `receive` | `connection` owns transport/source facts; `receive` owns parse facts | `connection` writes connection/input stream facts; `receive` writes receive result | `receive` reads input batches and source snapshot | `explicit event`, `runtime orchestration`, `selector` for source status | Yes | Yes. Main/preload/platform may buffer only, not parse | runtime/hardware for serial/TCP/UDP and high-frequency order | Decide batch/backpressure boundary and whether high-speed storage can short-circuit normal receive |
| `connection -> send` | `connection` | `send` | `connection` owns target availability; `send` owns send result | `connection` writes transport status; `send` writes send execution facts | `send` reads target snapshot/availability | `selector`, `public service`, `runtime orchestration` | Conditional | Yes. Actual write goes through platform/main | fixture for target routing; hardware for real send | Decide target identity separation from northbound device identity |
| `connection -> SCOE` | `connection` | `scoe` | `connection` owns transport; `scoe` owns SCOE lifecycle/status | `connection` writes declared SCOE transport availability; `scoe` writes SCOE domain facts | `scoe` reads transport snapshot | `runtime orchestration`, `selector`, boundary exception record | Conditional high-frequency | Yes | real SCOE device and TCP/UDP validation | Decide SCOE fixed TCP/UDP lifecycle owner and exception record |
| `connection -> status` | `connection` | `status` | `connection` owns transport truth; `status` owns status read model | `connection` writes connection facts; `status` writes status summary | `status` reads connection snapshot | `selector`, optional `explicit event` for status changes | No, event stream can be bursty | Yes, platform is source of transport facts | runtime/hardware for real connection status | Decide status refresh/throttle boundary without status owning connection truth |
| `connection -> display` | `connection` | `display` | `connection` owns transport truth; `display` owns display context projection | `connection` writes connection facts; `display` writes display read model/context only | `display` reads connection public summary | `selector`, `runtime orchestration` | No | Indirect through connection/platform | fixture/manual; hardware evidence remains connection-owned | display must not own connection facts or lifecycle |

### 4.3 `receive` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `receive -> task` | `receive` | `task` | `receive` owns parse result; `task` owns lifecycle/trigger facts | `receive` writes receive result/delta; `task` writes task state | `task` reads explicit receive output | `explicit event`, `runtime orchestration`, `selector` | Yes | Indirect through connection/platform | fixture for trigger behavior; runtime for real event order | Decide trigger ownership and forbid receive directly changing task state |
| `receive -> status` | `receive` | `status` | `receive` owns parse/read model source; `status` owns status summary | `receive` writes receive facts; `status` writes indicator/health summary | `status` reads receive snapshot/result | `selector`, `explicit event` for deltas | Yes | Indirect | fixture for status mapping; hardware for real input | Decide status read model owner and reset/lifecycle boundaries |
| `receive -> result` | `receive` | `result` | `receive` owns source result; `result` owns internal result facts | `receive` writes receive result; `result` writes case/task result facts | `result` reads explicit receive output | `explicit event`, `runtime orchestration` | Conditional high-frequency, should be aggregated | Indirect | fixture for receive-to-result oracle; customer validation later | Decide result attribution boundary without letting receive define final result |
| `receive -> storage` | `receive` | `storage` | `receive` owns source facts; `storage` owns persisted records/files | `receive` writes source result; `storage` writes local history/material | `storage` reads explicit receive output | `explicit event`, `runtime orchestration`, `public service` | Yes | Yes through storage/platform; main can write files only as platform/buffer exception | runtime for packaged path and high-speed storage; fixture for local history | Decide normal history vs high-speed short-circuit behavior |
| `receive -> display` | `receive` | `display` | `receive` owns parse/read model source; `display` owns projection/snapshot | `receive` writes receive facts; `display` writes table/chart/scatter display read model | `display` reads receive public material only | `selector`, `explicit event`, `runtime orchestration` | Yes | Indirect through connection/platform | fixture for projection; runtime/hardware for high-frequency refresh | Decide display throttling/buffer boundary without display owning receive truth |
| `receive -> SCOE` | `receive` | `scoe` | `receive` owns generic input normalization; `scoe` owns SCOE protocol/command facts | `receive` writes generic receive output; `scoe` writes SCOE command/status | `scoe` reads explicit SCOE candidate input | `explicit event`, `runtime orchestration`, boundary exception | Yes | Indirect through connection/platform | SCOE fixture plus real device validation | Decide SCOE fixed source exception and prevent receive from executing SCOE commands |

### 4.4 `send` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `send -> task` | `send` | `task` | `send` owns send result; `task` owns lifecycle/progress | `send` writes send result; `task` writes task progress/state | `task` reads send result output (await Promise<SendResult>) | `public service`, `runtime orchestration`, `selector` | Conditional | Yes through connection/platform | fixture for task-send loop; hardware for target send | Decided: Promise<SendResult> primary, task send-step awaits sync result (send design §4.4) |
| `send -> status` | `send` | `status` | `send` owns send result; `status` owns summary | `send` writes send facts; `status` writes status read model | `status` reads send snapshot/result | `selector`, `explicit event` | Conditional | Indirect | fixture for status mapping; hardware for transport errors | Decide status aggregation without global stats store cross-write |
| `send -> result` | `send` | `result` | `send` owns source send result; `result` owns internal result facts | `send` writes send result; `result` writes result attribution | `result` reads send result via TaskStepResult (not directly) | `explicit event`, `runtime orchestration` | Conditional | Indirect | fixture for send result; customer validation for final result semantics | Decided: result does not consume send events directly; send results flow through task StepResult → TaskInstanceCompletion → result (result design §4.2) |
| `send -> storage` | `send` | `storage` | `send` owns source send result; `storage` owns persisted record/material | `send` writes send result; `storage` writes local records | `storage` reads send output | `explicit event`, `runtime orchestration`, `public service` | Conditional | Yes through storage/platform for persistence | fixture/manual for history; runtime for packaged path | Decide which send records are local history/report material |
| `send -> SCOE` | `send` | `scoe` | `send` owns send result; `scoe` owns SCOE command/tool record | `send` writes send result; `scoe` writes SCOE record/status | `scoe` reads send output | `explicit event`, boundary exception, `runtime orchestration` | Conditional | Indirect through connection/platform | real SCOE validation | Decide fixed SCOE target exception and forbid send hardcoding SCOE success semantics |

### 4.5 `task` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `task -> send` | `task` | `send` | `task` owns lifecycle/request context; `send` owns single-frame send execution | `task` writes task context/state; `send` writes send result | `send` reads explicit send request (SendRequest) | `public service`, `runtime orchestration` | Conditional, timed send can be high | Yes via send/connection/platform | fixture for timed/trigger send; hardware for real target | Decided: task is universal execution engine, send-step await Promise<SendResult> (compound/2026-05-06-task-scoe-send-execution-engine-unification.md §3.1-3.2) |
| `task -> receive` | `task` | `receive` | `task` owns wait-condition step context; `receive` owns receive facts | `task` writes lifecycle/context; `receive` writes parse results | `receive` reads allowed execution context only if needed | `runtime orchestration`, optional `public service`, `explicit event` for receive input | Conditional | Indirect | fixture for trigger and observation; runtime for event order | Decided: task consumes receive events via public API for wait-condition matching, O(1) frameId-indexed lookup (task design §4.4) |
| `task -> result` | `task` | `result` | `task` owns lifecycle/case context; `result` owns internal result facts | `task` writes lifecycle facts; `result` writes result facts | `result` reads TaskInstanceCompletion + TaskStepResult | `explicit event`, `runtime orchestration`, `selector` | No, event-driven | No | fixture for lifecycle-to-result; customer validation later | Decided: stop→stopped (not completed); result only consumes TaskInstanceCompletion, not raw send/receive events (compound/2026-04-28-northbound-overlap-and-gap-map.md + result design §4.2) |
| `task -> report` | `task` | `report` | `task` owns lifecycle context; `report` owns report generation facts | `task` writes lifecycle facts; `report` writes report object/file prep | `report` reads task/result/storage material | `runtime orchestration`, `selector` | No | Indirect through storage/platform for files | fixture/manual for local report; customer validation for JSON report | Decide report trigger point without task generating report |
| `task -> northbound` | `task` | `northbound` | `task` owns internal task truth; `northbound` owns external transaction/projection | `task` writes internal task facts; `northbound` writes external transaction facts | `northbound` reads task projection | `selector`, `explicit event`, `runtime orchestration` | No | Yes when northbound HTTP/FTP is active | customer validation required | Decide external task/control semantics; old send task cannot be reused as northbound task |
| `task -> status` | `task` | `status` | `task` owns lifecycle; `status` owns status read model | `task` writes task state; `status` writes status summary | `status` reads task snapshot | `selector`, `explicit event` | No | No | fixture for status mapping; customer validation for external status | Decide status names/projection separately from task internal truth |

### 4.6 `SCOE` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SCOE -> receive` | `scoe` | `receive` | `scoe` owns SCOE inbound protocol (bypasses generic receive); `receive` owns generic receive facts | `scoe` writes SCOE domain context; `receive` does NOT process SCOE inbound | `receive` reads only declared non-SCOE input | `runtime orchestration`, boundary exception | Conditional | Indirect through connection/platform | real SCOE device validation | Decided: SCOE inbound bypasses receive, goes directly from connection transport event to SCOE adapter (SCOE design §4.5) |
| `SCOE -> send` | `scoe` | `send` | `scoe` translates command to TaskDefinition; `task` owns execution; `send` owns single-frame send | `scoe` writes ScoeDomainState; `send` writes send result | `send` reads explicit send request from task (not from SCOE directly) | `public service`, `runtime orchestration`, boundary exception | Conditional | Yes through connection/platform | real SCOE send path validation | Decided: SCOE does not call send directly; goes through task→send path. targetId from ScoeCommand.frameInstances[0].targetId (compound/2026-05-06-outbound-routing-and-response-decisions.md D1) |
| `SCOE -> status` | `scoe` | `status` | `scoe` owns SCOE status; `status` owns system summary | `scoe` writes SCOE status; `status` writes aggregate summary | `status` reads SCOE snapshot | `selector`, `explicit event` | No, status loop can be periodic | Indirect | real SCOE status loop validation | Decide status summary boundary and avoid SCOE status becoming system lifecycle |
| `SCOE -> storage` | `scoe` | `storage` | `scoe` owns command/tool facts; `storage` owns persisted records/files | `scoe` writes SCOE facts; `storage` writes persisted config/records/material | `storage` reads explicit SCOE material | `public service`, `runtime orchestration`, `explicit event` | Conditional | Yes through storage/platform | fixture/manual plus packaged path validation | Decide which SCOE config/records/material are storage-owned without making storage a SCOE workflow |
| `SCOE -> result` | `scoe` | `result` | `scoe` owns SCOE command outcome; `result` owns internal result facts | `scoe` writes ScoeDomainState; `result` writes result facts | `result` reads TaskInstanceCompletion from task (not SCOE events directly) | `explicit event`, `runtime orchestration` | No | Indirect | fixture plus real device validation | Decided: SCOE commands execute via task, result consumes TaskInstanceCompletion uniformly (compound/2026-05-06-task-scoe-send-execution-engine-unification.md §3.4) |

### 4.7 `storage` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `storage -> frame` | `storage` | `frame` | `storage` owns persistence; `frame` owns frame assets | `storage` writes files/records; `frame` writes imported/migrated asset truth | `frame` reads import/migration input | `public service`, `runtime orchestration` | No | Yes through storage/platform | fixture for legacy import; manual for file dialogs | Decide migration/import boundary before frame design |
| `storage -> settings` | `storage` | `settings` | `storage` owns persistence; `settings` owns config facts | `storage` writes stored data; `settings` writes settings truth | `settings` reads persisted snapshot | `public service`, `runtime orchestration` at startup | No | Yes through storage/platform | fixture/manual; packaged path validation | Decide startup restore/default fallback boundary |
| `storage -> report` | `storage` | `report` | `storage` owns local material/files; `report` owns report object/file prep | `storage` writes materials; `report` writes report facts | `report` reads materials | `selector`, `public service`, `runtime orchestration` | No | Yes through storage/platform | fixture/manual; packaged path validation | Decide history/CSV/material use without equating it to TestReport |
| `storage -> pages` | `storage` | `pages` | `storage` owns stored data/read model; pages own UI snapshot only | `storage` writes persisted/read facts; pages write UI state only | pages read storage selectors/snapshots | `selector`, page-level `public service` | No | Yes through storage/platform | manual checklist | Decide page snapshot boundaries and forbid pages writing storage internals |
| `storage -> display` | `storage` | `display` | `storage` owns persisted history/material; `display` owns historical projection | `storage` writes storage/history facts; `display` writes display projection only | `display` reads storage public material | `selector`, `runtime orchestration` | Conditional | Yes through storage/platform, not display | fixture/manual; package evidence remains storage-owned | display must not define file/path/history schema |
| `storage -> northbound` | `storage` | `northbound` | `storage` owns files/materials; `northbound` owns delivery transaction | `storage` writes local material; `northbound` writes delivery facts | `northbound` reads material/file candidate | `selector`, `runtime orchestration`, `public service` | No | Yes for HTTP/FTP/file path | customer/runtime validation for delivery | Decide delivery material contract without freezing FTP/HTTP schema |

### 4.8 `settings` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `settings -> frame` | `settings` | `frame` | `settings` owns defaults/config; `frame` owns assets | `settings` writes config facts; `frame` writes frame assets | `frame` reads settings snapshot/defaults | `selector`, `runtime orchestration` at init | No | Indirect through storage/platform for persistence | fixture/manual | Decide which defaults belong to settings vs frame |
| `settings -> connection` | `settings` | `connection` | `settings` owns config; `connection` owns runtime transport facts | `settings` writes config; `connection` writes connection state | `connection` reads config snapshot | `selector`, `runtime orchestration` | No | Yes when applied to platform resources | runtime/hardware for real connection options | Decide config application timing and rollback/error handling at feature design |
| `settings -> receive` | `settings` | `receive` | `settings` owns config; `receive` owns parse/read facts | `settings` writes config; `receive` writes receive facts | `receive` reads config snapshot | `selector`, optional `explicit event` for config changes | No, but affects high-frequency path | Indirect | fixture for receive config; runtime for high-frequency impact | Decide config change lifecycle without receive mutating settings |
| `settings -> send` | `settings` | `send` | `settings` owns config; `send` owns send facts | `settings` writes config; `send` writes send facts | `send` reads config snapshot | `selector`, optional `explicit event` | No | Indirect | fixture for send defaults; hardware for target behavior | Decide send defaults owner and precedence |
| `settings -> storage` | `settings` | `storage` | `settings` owns config; `storage` owns persistence/file behavior | `settings` writes config; `storage` writes persisted records/files | `storage` reads config snapshot | `selector`, `runtime orchestration` | No | Yes through storage/platform | packaged path validation | Decide path/default retention boundaries |
| `settings -> status` | `settings` | `status` | `settings` owns indicator config; `status` owns status read model | `settings` writes config; `status` writes status summary | `status` reads config snapshot | `selector`, `explicit event` for config changes | No | No | fixture/manual | Decide whether indicator config belongs to settings or status before status design |
| `settings -> display` | `settings` | `display` | `settings` owns persisted config fact; `display` owns display preference semantics | `settings` writes config fact; `display` writes normalized display preference/read model | `display` reads settings public snapshot/defaults | `selector`, `runtime orchestration` | No | Indirect through storage/platform for persistence | fixture/manual | display is formal target feature at `rewrite/src/features/display`; persistence owner must stay settings/storage |

### 4.9 `status` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `status -> pages` | `status` | `pages` | `status` owns read model; pages own UI snapshot | `status` writes status summary; pages write only display state | pages read status snapshot | `selector` | No, should be throttled | No direct platform | manual checklist; runtime for real device status | Decide page-level composition without pages reading feature internals |
| `status -> widgets` | `status` | `widgets` | `status` owns read model; widgets own presentation only | `status` writes status summary; widgets write no domain facts | widgets read props/snapshot/selector | `selector`, props from page/runtime | No | No | manual checklist | Decide widget API as pure display; widgets must not call feature internals |
| `status -> display` | `status` | `display` | `status` owns health/summary truth; `display` owns contextual display projection | `status` writes status summary; `display` writes display context only | `display` reads status public summary | `selector`, `runtime orchestration` | No | No | fixture/manual; hardware evidence remains status-owned | display must not compute status health truth |
| `status -> northbound` | `status` | `northbound` | `status` owns internal summary; `northbound` owns external projection | `status` writes internal status; `northbound` writes external transaction/projection facts | `northbound` reads status projection | `selector`, `runtime orchestration` | No, heartbeat may be periodic | Yes for northbound platform transport | customer validation | Decide status query/heartbeat/self-check/alarm separation |

### 4.10 `display` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `display -> pages` | `display` | `pages` | `display` owns display read model; pages own UI snapshot | `display` writes projection/snapshot; pages write only page-local UI state | pages read display selector or runtime page API | `selector`, `runtime orchestration` | Throttled | No | manual checklist plus fixture | pages must not derive receive/storage/status truth |
| `display -> widgets` | `display` | `widgets` | `display` owns projection; widgets own presentation only | `display` writes UI-safe snapshot; widgets write no domain facts | widgets read props/snapshot/selector | `selector`, props from page/runtime | Throttled | No | manual checklist | widgets must not import display or source feature internals |

### 4.11 `result` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `result -> report` | `result` | `report` | `result` owns internal result facts; `report` owns report generation facts | `result` writes result truth; `report` writes report object/file prep | `report` reads result snapshot | `selector`, `explicit event`, `runtime orchestration` | No | Indirect through storage/platform for report file | fixture; customer validation for external report | Decide result/report split before report design |
| `result -> status` | `result` | `status` | `result` owns execution result; `status` owns status summary | `result` writes result facts; `status` writes status summary | `status` reads result snapshot | `selector`, `explicit event` | No | No | fixture/manual | Decide how final/intermediate result affects status without status owning result |
| `result -> northbound` | `result` | `northbound` | `result` owns internal result; `northbound` owns external report/result transaction | `result` writes internal result; `northbound` writes external projection/delivery facts | `northbound` reads result projection | `selector`, `explicit event`, `runtime orchestration` | No | Yes for northbound transport | customer validation required | Decide external result semantics after customer confirmation |
| `result -> pages` | `result` | `pages` | `result` owns result read model; pages own UI snapshot | `result` writes result facts; pages write display state only | pages read result snapshot | `selector` | No | No | manual checklist | Decide page snapshot scope without pages deriving result truth |

### 4.12 `report` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `report -> storage` | `report` | `storage` | `report` owns report object/prep; `storage` owns file persistence | `report` writes report generation facts; `storage` writes files/material records | `storage` reads report file candidate/material | `public service`, `runtime orchestration` | No | Yes through storage/platform | fixture/manual; packaged path validation | Decide report file preparation vs persistence boundary |
| `report -> northbound` | `report` | `northbound` | `report` owns report candidate; `northbound` owns delivery/ack transaction | `report` writes report facts; `northbound` writes delivery facts | `northbound` reads report candidate | `selector`, `explicit event`, `runtime orchestration` | No | Yes for HTTP/FTP | customer/runtime validation | Decide JSON report and delivery closure only after customer evidence |
| `report -> pages` | `report` | `pages` | `report` owns report read model; pages own UI snapshot | `report` writes report facts; pages write display state only | pages read report snapshot | `selector`, page-level `public service` | No | Indirect for local file open/export | manual checklist | Decide page operations without pages generating report internals |

### 4.13 `northbound` as producer

| Interaction | Producer | Consumer | Fact owner | Writer | Reader | Interaction candidate | High freq | Platform/main/preload | Validation | Pre-design decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `northbound -> task` | `northbound` | `task` | `northbound` owns external transaction; `task` owns internal lifecycle | `northbound` writes external request/transaction facts; `task` writes internal task facts | `task` reads validated internal command input | `runtime orchestration`, `public service`, `explicit event` | No | Yes for HTTP ingress | customer validation required | Blocked on external task/control semantics; old send task is oracle only |
| `northbound -> status` | `northbound` | `status` | `northbound` owns external query/heartbeat transaction; `status` owns internal summary | `northbound` writes external transaction facts; `status` writes internal summary | `northbound` reads status; `status` may read request context only if needed | `selector`, `runtime orchestration` | Heartbeat can be periodic | Yes | customer validation required | Decide heartbeat/status/self-check/alarm separation |
| `northbound -> result` | `northbound` | `result` | `northbound` owns external result transaction; `result` owns internal result facts | `northbound` writes external transaction facts; `result` writes internal result facts | `northbound` reads result projection | `selector`, `runtime orchestration`, `explicit event` | No | Yes | customer validation required | Blocked on result/exception/refusal semantics |
| `northbound -> report` | `northbound` | `report` | `northbound` owns external report request/delivery; `report` owns report generation | `northbound` writes external transaction facts; `report` writes report facts | `northbound` reads report candidate; `report` may read request intent via runtime | `runtime orchestration`, `public service`, `explicit event` | No | Yes for HTTP/FTP | customer validation required | Blocked on TestReport sample, naming, timing, and file rules |
| `northbound -> storage` | `northbound` | `storage` | `northbound` owns delivery transaction; `storage` owns local material/file access | `northbound` writes delivery facts; `storage` writes local file/material facts | `northbound` reads storage material via allowed entry | `public service`, `runtime orchestration` | No | Yes for files/FTP/HTTP | customer/runtime validation required | Decide FTP/HTTP delivery and packaged path evidence; history/CSV is not delivery closure |

## 5. Required prohibitions

以下禁止项对所有后续 `cs-feat-design` 生效：

- feature 之间不得 import 对方内部 `state`。
- feature 之间不得绕过 public API import 对方内部 service、adapter、composable 或私有 helper。
- 统计 read model 不得写回 frame definition、field definition、表达式、展示配置或任何静态资产。
- receive/send/task/SCOE/result/report/northbound 的领域规则不得放进 `runtime/`。
- `runtime/` 不得变成全局业务中心；它只负责装配、生命周期、调用顺序、事件路由、边界输入输出和例外登记。
- main 不得承载业务语义，只能承接平台资源、生命周期和必要的高频缓冲、批处理、聚合、节流、队列和背压。
- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- preload 不暴露裸 `invoke/send/on`，不暴露大而全的能力包。
- widgets 不直接调用 feature 内部 composable 或内部 state；只能消费 props、只读 selector、UI snapshot 或页面/runtime 组合后的输入。
- pages 不拥有协议语义、任务推进、平台访问、报告语义或跨 feature 内部状态写入。
- storage/history/CSV/local export 不得等同 TestReport 或 northbound delivery closure。
- serial/network target 不得等同 northbound device identity。
- old send task 不得等同 northbound task。
- SCOE 固定 source/target 不得沉积在通用 receive/send 主链中。SCOE 入站 bypass receive，出站通过 task→send 路径。
- display 不得拥有 receive runtime facts、connection facts、settings persistence、status health、report/northbound 语义。

## 6. Risk register

### 6.1 Interactions most likely to turn `runtime` into a global business center

| Risk interaction | Why risky | Guard |
| --- | --- | --- |
| `receive -> task/status/result/storage/SCOE` | 旧 receive store 已经把解析、统计、展示、trigger、SCOE、history 串在一个尾部副作用链中 | runtime 只路由 receive outputs；事实写入留在 task/status/result/storage/SCOE |
| `task -> send/receive/result/report/northbound/status` | task 是通用执行引擎，容易变成所有流程的总控制器 | task 拥有 lifecycle/context/step execution/condition matching；不拥有 SCOE 领域规则、receive 解析、result 归因、report 生成或 northbound 语义 |
| `northbound -> task/status/result/report/storage` | northbound 有外部闭环压力，容易直接定义内部 truth | northbound 只 owns external transaction/projection/delivery |
| `SCOE -> receive/send/status/storage/result` | 旧 SCOE 横跨 receive、send、network、storage、status | SCOE 不直接调 send/receive，通过 TaskDefinition→task→send 路径；入站 bypass receive；是声明式边界例外 |
| `receive/storage/status/connection -> display` | 旧 data display 容易把 source facts、展示配置、记录状态和可视化 snapshot 合成全局 store | display 只写 preference/projection/snapshot；source truth 留在各 owner |
| high-speed storage path | 旧 main network handler 已短路普通 receive event | 登记为边界例外，main 只做平台侧高速写入/缓冲，业务含义归 storage/receive/runtime design |
| report/delivery chain | result、report、storage、northbound 容易被合并成一次业务流程 | 三段分离：result truth、report generation、northbound delivery |

### 6.2 Interactions most likely to make public API too heavy

| Area | Risk | Guard |
| --- | --- | --- |
| `frame` selectors | 为 receive/send/task/SCOE/report 暴露过多内部结构 | 只读 snapshot/validation/import entry，feature design 再定允许入口 |
| `connection` target API | 把 transport target、business device identity、SCOE fixed target 混成一个万能 target | 分离 transport target 与 northbound device identity |
| `receive` result API | 为所有消费者直接暴露内部 parsing/read model | 以 explicit output、selector 和事件分层，不暴露可变 state |
| `task` command/query API | 任务 API 包揽 send、receive、result、report、northbound | task 只公开 lifecycle/context command/query |
| `storage` API | 统一文件 API 变成任意路径读写和业务万能持久层 | storage 按能力暴露，platform 路径受控 |
| `status` API | status 直接读取所有 feature 内部 state | status 只读公开 snapshot，写自己的 summary |
| `display` API | display 为了方便 UI 直接暴露 receive/storage/status/source internals 或 mutable buffer | 只暴露 UI-safe projection、preference operation 和 readonly selector |
| `northbound` API | 外部协议压力导致内部 feature 接受外部字段和错误码 | northbound 做转换，内部 feature 不冻结外部 schema |

### 6.3 Interactions that should prefer explicit event over synchronous service call

| Interaction | Reason |
| --- | --- |
| `connection -> receive` | 入站 bytes/batches 是高频异步输入，且需要队列、背压和事件顺序验证 |
| `receive -> task/status/result/storage/SCOE` | receive result/delta 可能有多消费者，不能同步堆副作用 |
| `receive -> display` | display 刷新可能高频且面向 UI-safe snapshot，需要节流、合批和背压边界 |
| `send -> task/status/result/storage/SCOE` | send result 是结果通知，多消费者各写自己的 read model |
| `task -> result/report/northbound/status` | lifecycle transitions 应作为显式状态输出，避免消费者回读 task internals |
| `SCOE -> status/storage/result` | SCOE command/status/tool records 是领域事件，不应同步写其他 state |
| `result -> report/northbound/status` | result finalization 是下游生成报告和外部投影的触发点 |
| `report -> storage/northbound/pages` | report ready 是文件准备、交付和 UI 展示的边界输出 |
| `northbound -> task/report/storage` | 外部请求进入内部流程需要 runtime 路由、拒绝/不可执行语义和审计记录 |

Synchronous `public service` 仍可用于低频 command/query，例如 asset validation、settings update、storage load/save、send request。但凡涉及高频、多消费者、跨域状态推进或异步完成，都应优先考虑 explicit event 或 runtime orchestration。

### 6.4 Interactions requiring northbound / SCOE / hardware / packaged data path evidence

| Area | Required evidence |
| --- | --- |
| `connection -> receive/send/status` | 真实串口枚举、连接、断开、收发、事件顺序；TCP/TCP server/UDP 断线、重连和 remote host 变化 |
| `connection/receive/send <-> SCOE` | 真实 SCOE 设备、固定 source/target、timeout、状态循环、完成条件 |
| `receive/send` high-frequency paths | 批处理、队列、背压、节流、snapshot 和 UI 刷新策略的 runtime 或压测证据 |
| `receive/storage/status/connection -> display` | display projection、UI-safe snapshot、刷新节流和 source material 边界的 fixture/manual/runtime evidence |
| `storage -> frame/settings/report/pages/northbound` | 打包态 data path、长期写入、备份、清理、文件保留 |
| high-speed storage | 命中后是否短路普通 receive/display/trigger 链，以及文件轮转/统计更新 |
| `northbound -> task/status/result/report/storage` | 甲方 schema、字段、枚举、错误码、TestReport 样例、FTP/HTTP 环境、完成通知和接收确认 |
| `report -> northbound` | JSON TestReport 内容、命名、时机、FTP/HTTP 交付和失败补偿 |

没有这些证据时，后续只能声明静态分析通过、fixture 通过或 pass-with-known-gaps，不能声明硬件链路、打包链路或甲方闭环完成。

### 6.5 Interactions impacting shared/tooling audit

| Area | Audit impact |
| --- | --- |
| `storage -> pages`, `settings -> storage`, file dialogs | `src/utils/common/dialogUtils.ts`, `fileDialogManager.ts`, common `useFileDialog` 需要判定 platform/widgets/storage 边界 |
| `status -> widgets`, `storage -> pages` | `components/common` 中 StatusIndicators、charts、import/export UI 只能成为 widgets 候选，不能直接读 feature internals |
| `connection -> receive/send` | `src/api/common` 不能作为长期 shared/tooling；应迁移到 `platform` facade 思路 |
| `receive/send` pure helpers | `src/utils/receive/*` 和 `src/utils/frames/*` 需逐文件判定 feature core/helper，不整体迁入 shared |
| `SCOE` helpers | `src/utils/receive/scoeFrame.ts` 属 SCOE/receive 边界风险，不能进入 pure shared |
| timer wrapper | 定时能力可能是 platform/runtime 装配材料，但 task lifecycle 不得进入 timer wrapper |
| error/date/hex helpers | 只有纯 TS、无 Vue/Pinia/Electron/platform、无业务 owner 的 helper 才能进 shared |

## 7. Pre-design gates by feature

进入任何 `cs-feat-design` 前，至少要确认：

- `frame`: asset snapshot/cache owner、legacy import boundary、frame metadata 是否作为 report material。
- `connection`: transport target 与 northbound device identity 分离；高频 input batch/backpressure；SCOE fixed connection exception。
- `receive`: parser owner、input snapshot、result output、trigger output、SCOE handoff、高速路径。
- `send`: send request/result owner（已决策：单帧 SendRequest→SendResult）、target route、task 调用边界（已决策：task send-step await Promise<SendResult>）、SCOE fixed target（已决策：SCOE 通过 task→send 路径，不直接调 send）。
- `task`: local timed/trigger task 与 northbound task 分离（已决策：同引擎不同入口适配）；stop/completed/failed/stopped 内部语义（已决策：stop≠completed）；timer lifecycle。
- `scoe`: fixed source/target（已决策：SCOE 声明需求、connection 管理生命周期）、command owner（已决策：SCOE 翻译为 TaskDefinition 交由 task）、completion condition owner（已决策：SCOE 定义完成条件，task 执行条件匹配）、确认帧配置（已决策：首轮只支持固定值）、入站 bypass receive（已决策）。
- `storage`: history/CSV/local file/material 和 report/northbound delivery 分离； packaged data path。
- `settings`: config owner、defaults owner、config application lifecycle、settings/status config split。
- `status`: read model source list、refresh/throttle、indicator config owner、external status projection boundary。
- `display`: formal target feature at `rewrite/src/features/display`; display preference/projection/snapshot owner、source material list、refresh/throttle/buffer boundary、settings/storage persistence split。
- `result`: internal result truth、material 来源（已决策：只消费 task TaskInstanceCompletion + TaskStepResult，不直接消费 send/receive/SCOE event）、report/northbound consumers。
- `report`: report generation vs storage persistence vs northbound delivery split。
- `northbound`: phase-one loop、identity、task/control/result/report/delivery semantics、customer validation assets。
- `shared/widgets/platform`: run shared/tooling audit before moving any common/utils/components/api materials.

## 8. Next-step judgement

可以进入下一轮 `shared/tooling plan`。

Reason:

- 本文已经把 shared/tooling 会受影响的交互面显式标出来：platform facade、`api/common`、common utils/composables/components、widgets 候选、timer wrapper、file dialog、charts、receive/send/SCOE helpers。
- northbound、SCOE、真实硬件、打包态 data path 的证据缺口不会阻塞 shared/tooling plan，因为下一轮只应做候选归口和 audit，不应实现业务闭环。

Carry-forward blockers for later feature design:

- northbound 缺甲方正式 schema、字段、枚举、错误码、TestReport 样例、FTP/HTTP 联调资产。
- SCOE 缺真实设备、timeout、状态循环和完成条件运行证据。
- 真实串口/TCP/UDP、高频数据和打包态 data path 缺 runtime/hardware evidence。
- old send task、本地 history/CSV、serial/network target 仍只能作为 oracle/material，不能升级为 northbound task/report/device 合同。
