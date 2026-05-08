---
doc_type: feature-design
feature: rewrite-connection
status: draft
date: 2026-05-04
summary: 东方红上位机重写中 connection feature 的 owner、连接配置、运行事实、transport event/error/lifecycle、platform/runtime 边界和跨 feature 消费边界。
---

# Rewrite connection feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/architecture/rewrite-system-architecture.md`
5. `codestable/architecture/rewrite-feature-boundaries.md`
6. `codestable/architecture/rewrite-feature-interaction-matrix.md`
7. `codestable/architecture/rewrite-connection-transport-boundary.md`
8. `codestable/architecture/rewrite-platform-api-surface-reduction.md`
9. `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
10. `codestable/quality/rewrite-quality-rules.md`
11. `codestable/quality/rewrite-review-checklist.md`

`codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向和 feature 归口的 canonical 架构基线。`rewrite-connection-transport-boundary.md` 是本 feature 的 connection/transport 直接边界输入。

## 2. Boundary guards

- 本轮是 Lane B 单 feature design，只产出 design/checklist。
- 本轮不实现 serial、TCP client、TCP server 或 UDP。
- 本轮不写 preload、main、renderer API schema，不冻结 channel、method、DTO、字段、错误码或枚举。
- connection owns transport config、runtime connection facts、transport-level lifecycle、error 和 event。
- connection does not own frame parsing、receive matching、send task state、SCOE semantics、result、report、northbound。
- main 可以承载平台 transport 资源、生命周期和必要 buffer / batch / queue / backpressure，不解释业务语义。
- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport` 或旧 `window.electron`。
- receive / send / task / SCOE / status / pages 只能通过 connection public boundary、runtime orchestration 或显式事件消费连接能力，不 import connection internal state。
- serial/network transport target 不等于 northbound `deviceId`、业务设备身份、task、case 或 report delivery target。
- 本轮不声明真实串口、TCP、UDP、SCOE、hardware、package、HTTP/FTP、northbound 或 customer validation 完成。
- 旧 `src/`、`src-electron/`、`public/` 只作为 legacy evidence、oracle 候选或 migration input，不作为新代码落点。
- 不读取或引用前端自动生成 types 文件作为证据。

## 3. Evidence summary

### 3.1 Contract evidence

- target structure 将 `features/connection` 定义为串口/TCP/UDP 连接模型、连接实例、连接状态和 target 路由 owner；明确不拥有字节解析、业务结果、报告和任务生命周期。
- system architecture 和 feature boundaries 要求 renderer 只能经 `rewrite/src/platform` facade 访问桌面能力，main 只保留平台资源、生命周期和必要高频处理。
- feature interaction matrix 明确 `connection -> receive/send/SCOE/status` 是高风险交互：connection owns transport/source/target facts，receive/send/SCOE/status 分别拥有解析、发送结果、SCOE 语义和状态 read model。
- connection/transport boundary 已锁定 connection owns transport static config、runtime connection facts、target availability、transport events/errors/lifecycle，且只按能力类别声明 public API necessity。
- platform surface reduction 要求 serial/network 只作为 transport primitive 进入 platform；connection status、target route、device identity、receive parsing、send result 和 northbound `deviceId` 不归 platform。
- validation baseline 要求每个 feature 登记 legacy observable behavior ledger，并区分 static scan、Vitest unit、fixture test、oracle comparison、fake adapter test、manual checklist、runtime validation、hardware validation、package validation 和 customer validation。

### 3.2 Legacy evidence

本轮只读检索到的旧系统事实只用于保留可观测行为和识别迁移风险，不能自动升级为新架构结构：

- 串口配置、扫描、连接、断开、状态、错误、收发和测试工具：`src/stores/serialStore.ts`、`src/components/connect/SerialPortList.vue`、`src/components/connect/SerialOptionsForm.vue`、`src/components/connect/SerialTestTools.vue`、`src-electron/main/ipc/serialHandlers.ts`、`src-electron/preload/api/serial.ts`、`src/api/common/serialApi.ts`
- TCP client / TCP server / UDP 配置、连接、断开、发送、状态、事件和测试工具：`src/stores/netWorkStore.ts`、`src/components/connect/NetworkConnectionList.vue`、`src/components/connect/NetworkConnectionEditDialog.vue`、`src/components/connect/NetworkTestTools.vue`、`src-electron/main/ipc/networkHandlers.ts`、`src-electron/preload/api/network.ts`、`src/api/common/networkApi.ts`
- 连接页入口和可见 UI：`src/router/routes.ts`、`src/components/layout/SidePanel.vue`、`src/pages/ConnectConfigPage.vue`、`src/components/connect/ConnectionList.vue`、`src/components/connect/ConnectionContentPanel.vue`
- target 聚合和 send target 消费：`src/stores/connectionTargetsStore.ts`、`src/composables/frames/sendFrame/useUnifiedSender.ts`
- receive / task / SCOE 消费连接事件和数据的旧耦合：`src/stores/frames/receiveFramesStore.ts`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts`、`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`、`src/stores/scoeStore.ts`、`src/composables/scoe/useScoeCommandExecutor.ts`
- 旧 Electron 暴露面：`src-electron/preload/index.ts`、`src-electron/preload/api/index.ts`、`src-electron/main/ipc/index.ts`、`src-electron/utils/common/ipcUtils.ts`、`src/api/common/index.ts`
- 当前 rewrite scaffold 只有最小 bridge info：`rewrite/src/platform/index.ts`、`rewrite/src/shared/platform-bridge.ts`、`rewrite/src-electron/preload/index.ts`

## 4. Design

### 4.1 Goals and non-goals

Goals:

- 保留旧系统连接页入口和串口、TCP client、TCP server、UDP 的用户可见连接能力。
- 锁定 connection 对 transport config、runtime connection facts、target availability、transport-level event/error/lifecycle 的单点 owner。
- 锁定 connection 与 platform/main/preload/runtime 的职责边界，防止旧 `window.electron` 大包、旧 `src/api/common` wrapper 和旧 main business handler 被照搬。
- 锁定 receive、send、task、SCOE、status、pages 等消费者如何读取连接能力，以及明确禁止的跨 feature 内部访问。
- 为后续 implementation 建立 fixture、fake adapter、manual、runtime、hardware、package、customer validation 计划。

Non-goals:

- 不实现 serial、TCP client、TCP server、UDP 或任何 platform bridge。
- 不写具体配置字段 schema、target id 格式、事件 payload、IPC channel、DTO、错误码或枚举。
- 不设计 receive parser、send frame builder、send task lifecycle、SCOE command / completion、result/report/northbound 内部语义。
- 不设计高速存储最终模型或 high-frequency 参数。
- 不把旧 `connectionTargetsStore`、`serialStore`、`netWorkStore`、旧 preload/API/main handler 的组织方式迁入 `rewrite/`。
- 不声明真实 hardware、package、HTTP/FTP、northbound 或 customer closure 完成。

### 4.2 Owner / not owner

| 分类 | connection owner | connection not owner |
| --- | --- | --- |
| transport config | 串口、TCP client、TCP server、UDP 的 transport static config 意义、默认输入应用边界、配置校验类别和可见配置快照。settings 可提供默认值，storage 只负责持久化技术边界。 | settings 默认值合并规则、storage 文件格式、northbound device identity、SCOE 业务配置。 |
| runtime facts | 连接实例、listener/client availability、remote host route、连接状态、last activity、transport counters、resource unavailable 等 transport 事实。 | receive parse result、send business result、task progress、SCOE tool record、status health summary、result truth、report file state。 |
| lifecycle | 连接请求、断开、重复连接、资源清理、关闭/重开、应用退出 cleanup、可选 reconnect 行为的 transport 生命周期规则。 | 任务开始/暂停/恢复/停止、SCOE 命令状态、report generation lifecycle、northbound transaction lifecycle。 |
| transport event | connected、disconnected、data available、write accepted、write failed、resource closed、resource error 等事件能力类别。 | frame matched、field parsed、send task completed、SCOE command success、case result、file delivered。 |
| error | port unavailable、open/connect/listen/bind failure、close failure、timeout、write failure、stale event、listener cleanup failure 等 transport-level error 类别。 | 外部错误码、拒绝执行语义、TestReport 错误、任务失败归因、SCOE completion failure 语义。 |
| public boundary | 面向 receive/send/task/SCOE/status/pages/runtime 的只读 selector、public service、显式事件和测试替换边界。 | 允许消费者 import connection internal state、adapter、store、Vue ref、platform resource handle 或 socket/serialport 对象。 |
| platform integration | connection adapter 通过 `rewrite/src/platform` facade 使用 transport primitive；main/preload 只提供受控 transport 能力。 | renderer 直接访问 Node/Electron/serialport/socket；platform 定义 connection config 语义或业务 target。 |

connection 的核心职责是提供 transport 事实和 transport 能力边界。它不是 receive/send/task/SCOE 的总控制器，也不是 northbound 设备身份层。

### 4.3 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level | blocker / note |
| --- | --- | --- | --- | --- | --- |
| `/connect` 页面和侧边栏“连接”入口可达，连接页包含串口、网口、测试工具等入口。 | pages + connection | preserve | `src/router/routes.ts`、`src/components/layout/SidePanel.vue`、`src/pages/ConnectConfigPage.vue` | manual checklist | 具体 UI 重建后验证。 |
| 串口列表可扫描端口，未检测到设备时给出可见提示。 | connection | preserve | `src/stores/serialStore.ts`、`src/components/connect/SerialPortList.vue`、`src-electron/main/ipc/serialHandlers.ts` | manual checklist, runtime validation, hardware validation | 真实端口枚举必须 hardware validation。 |
| 串口可配置波特率、数据位、停止位、校验、流控等 transport 参数。 | connection; settings may provide defaults | preserve | `src/stores/serialStore.ts`、`src/composables/serial/useSerialConfig.ts`、`src/components/connect/SerialOptionsForm.vue` | fixture test, manual checklist, hardware validation | 本轮不冻结字段 schema。 |
| 串口打开、关闭、关闭全部、重复打开短路、未打开关闭直接成功、应用退出 cleanup 可观察。 | connection + platform/main resource | preserve | `src-electron/main/ipc/serialHandlers.ts`、`src/stores/serialStore.ts` | fixture test, fake adapter test, runtime validation, hardware validation | 真实驱动行为必须 hardware validation。 |
| 串口修改已连接参数时旧实现采用关闭后重开策略。 | connection | deferred | `src-electron/main/ipc/serialHandlers.ts` | fixture test, runtime validation, hardware validation | 后续实现需决定是否保留该 UX/transport 行为。 |
| 串口发送文本、二进制和帧实例前检查连接状态，未连接给出错误提示。 | connection for availability; send owns business send result | preserve boundary | `src/stores/serialStore.ts`、`src/components/connect/SerialTestTools.vue`、`src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture test, manual checklist, hardware validation | connection 只输出 transport failure，不决定 task lifecycle。 |
| 串口入站数据和发送回显会进入旧 renderer store，并继续流向 receive/history。 | connection for transport event; receive/storage own semantics | preserve boundary; rewrite dataflow | `src/stores/serialStore.ts`、`src/stores/frames/receiveFramesStore.ts` | fixture test, runtime validation, hardware validation | 新链路必须 batch/route，不让 UI 逐包消费。 |
| 串口错误、close、status 变化会映射到 UI 错误和状态展示。 | connection; status may read summary | preserve | `src-electron/main/ipc/serialHandlers.ts`、`src/stores/serialStore.ts`、`src/components/connect/SerialPortList.vue` | fixture test, manual checklist, runtime validation, hardware validation | 本轮不冻结错误码或状态枚举。 |
| TCP client 使用 socket 连接、断开、error、close、timeout 和 data 事件。 | connection + platform/main resource | preserve | `src-electron/main/ipc/networkHandlers.ts`、`src/stores/netWorkStore.ts` | fixture test, fake adapter test, runtime validation, hardware validation | 真实网络时序需 runtime/hardware 证据。 |
| TCP server 可 listen、接收 client、维护 client 集合、断开时清理所有 client。 | connection + platform/main resource | preserve | `src-electron/main/ipc/networkHandlers.ts`、`src/stores/netWorkStore.ts` | fixture test, fake adapter test, runtime validation, hardware validation | 多 client 行为需专门 runtime/hardware 场景。 |
| UDP 可 bind local host/port，接收 message，按 remote host/port 发送。 | connection + platform/main resource | preserve | `src-electron/main/ipc/networkHandlers.ts`、`src/components/connect/NetworkConnectionEditDialog.vue`、`src/stores/connectionTargetsStore.ts` | fixture test, fake adapter test, manual checklist, hardware validation | UDP route 形态后续实现再定，不冻结 target id。 |
| 网络连接列表可新增、编辑、删除、连接、断开、展示状态和 lastError。 | connection page + connection | preserve | `src/components/connect/NetworkConnectionList.vue`、`src/components/connect/ConnectionContentPanel.vue`、`src/components/connect/NetworkConnectionEditDialog.vue` | manual checklist, fixture test | 新 UI 不继承旧 store 结构。 |
| 网络测试工具可发送、接收、追加错误行和执行连通性测试。 | connection for transport test workflow; receive owns parsing | preserve | `src/components/connect/NetworkTestTools.vue` | manual checklist, runtime validation, hardware validation | 真实收发必须 runtime/hardware 证据。 |
| 旧 TCP 入站按 `\\r\\n` 切包后进入通用 data received；UDP message 直接进入。 | connection/receive boundary | deferred | `src-electron/main/ipc/networkHandlers.ts` | fixture test, runtime validation | 后续 receive design 决定这是 input normalization 还是 compatibility rule。 |
| 旧 network high-speed storage 命中后短路普通 renderer data event。 | storage/receive/connection runtime exception | deferred | `src-electron/main/ipc/networkHandlers.ts`、`src-electron/main/ipc/highSpeedStorageHandlers.ts` | runtime validation, hardware validation, package validation | 必须后续按 exception registry 登记，不由 connection 单独决定。 |
| 旧 target 聚合将 serial、TCP、TCP server、UDP remote host 暴露给 send/SCOE。 | connection owns target availability; send/SCOE consume | preserve boundary | `src/stores/connectionTargetsStore.ts`、`src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture test, manual checklist, hardware validation | target route 不等于 northbound device identity。 |
| 旧 receive store 直接消费 serial/network 数据并执行帧匹配、统计、trigger 和 SCOE 分支。 | receive/task/SCOE/status, not connection | not touched by connection | `src/stores/frames/receiveFramesStore.ts`、`src-electron/main/ipc/receiveHandlers.ts` | fixture test, runtime validation, hardware validation | connection 只提供 bytes/events，不解析业务。 |
| 旧 send task 在发送失败后查询 target availability 并把任务置为 paused。 | task owns lifecycle; connection provides availability material | deferred to task design | `src/composables/frames/sendFrame/useSendTaskExecutor.ts`、`src/stores/connectionTargetsStore.ts` | fixture test, runtime validation | connection 不直接写 task 状态。 |
| 旧 SCOE 固定创建 `scoe-udp` 和 `scoe-tcp-server`，并在 receive/send 中硬编码固定 source/target。 | SCOE owns semantics; connection exposes transport availability | deferred to SCOE design | `src/stores/scoeStore.ts`、`src/stores/frames/receiveFramesStore.ts`、`src/composables/frames/sendFrame/useUnifiedSender.ts` | runtime validation, hardware validation | 必须登记 SCOE fixed source/target exception。 |
| 旧 preload 暴露 `window.electron` 大包，renderer `src/api/common` 围绕大包组织 serial/network/receive 等能力。 | platform boundary evidence; connection must not inherit | candidate drop for exposure shape | `src-electron/preload/index.ts`、`src-electron/preload/api/index.ts`、`src/api/common/index.ts` | static scan | rewrite 只允许 narrow typed bridge + platform facade。 |
| 旧 serial/network data 和 connection event 向 renderer 广播，network 还广播到所有 webContents。 | platform/main event delivery; runtime scopes consumers | candidate drop for global broadcast shape | `src-electron/main/ipc/serialHandlers.ts`、`src-electron/main/ipc/networkHandlers.ts` | runtime validation | 新实现必须明确订阅生命周期和目标窗口/消费者范围。 |
| 当前 rewrite scaffold 只有 bridge info，没有 connection/transport 能力。 | platform + connection future work | not touched | `rewrite/src/platform/index.ts`、`rewrite/src/shared/platform-bridge.ts`、`rewrite/src-electron/preload/index.ts` | static scan | 本轮不声明连接链路完成。 |

### 4.4 State owner

| 状态类别 | 写入 owner | 读取方 | reset / lifecycle / persistence | 本轮设计约束 |
| --- | --- | --- | --- | --- |
| Transport static config | connection owns config meaning; settings may provide defaults; storage/platform only persist or load through explicit boundary. | pages, runtime, settings, send, SCOE may read allowed config snapshot. | 低频更新；是否持久化由后续实现设计决定；缺失/非法旧值不能直接污染核心模型。 | 不冻结字段 schema；配置合法性和 target route 语义归 connection。 |
| Runtime connection facts | connection | send, receive, task, SCOE, status, pages, runtime via public selector/event. | 由 connect/disconnect/platform event/app cleanup 驱动；通常 transient；UI unmount 不等于事实 reset。 | 单点写入；main 是 raw resource event source，不是 renderer truth owner。 |
| Transport event read model | connection normalizes platform events; platform/main produces raw resource events. | receive consumes byte batches; send/SCOE consume write result/availability; status/pages consume lifecycle summary. | 事件订阅随 runtime 装配和 service 生命周期清理；是否保留 event log 后续设计。 | 不暴露 mutable state、socket、serialport、raw Electron object 或 raw channel。 |
| Target availability read model | connection | send、task、SCOE、pages、status | 由 runtime facts 派生；连接关闭、client 断开、UDP remote route 变化后更新。 | 只表达 transport target，不表达 customer device、task、case 或 report destination。 |
| Transport counters | connection for byte/connection-level counters only | pages/status may read summary; receive/send/status/result may maintain their own business stats. | 随连接生命周期 reset 或归档；是否持久化另行声明。 | counters 不成为 global business statistics，不写回 frame/settings/task/result。 |
| UI snapshot | connection pages/composables/widgets | UI only | 表单草稿、筛选、选中连接、测试工具输入、展开状态默认不持久化。 | UI snapshot 不能反向定义 connection facts。 |
| Runtime exception record | runtime owns registry; business owner feature owns semantics | reviewers, implementation tasks, affected features | 触达 high-frequency、SCOE fixed source/target、high-speed storage、package path 等例外时登记。 | connection design 只列候选，不把例外变成 main 业务授权。 |

### 4.5 Transport lifecycle, event and error posture

Connection lifecycle uses state concepts such as idle, connecting, connected, disconnecting, disconnected and error, but this design does not freeze enum names.

Lifecycle rules:

- connect / disconnect / cleanup must be idempotent enough for duplicate user actions, stale platform events and app shutdown.
- duplicate open/connect, close on already closed resource and app quit cleanup are preserved as observable lifecycle categories, not as exact implementation shape.
- changing serial options while connected is deferred; if preserved, close/reopen must be explicit and user-visible enough to validate.
- automatic reconnect is not assumed. If later implemented, it must define retry policy, cancellation, UI visibility and runtime/hardware validation in the implementation design.
- connection lifecycle events are low-frequency read model updates; high-frequency bytes must use separate batch/delta flow.

Error rules:

- Transport errors are connection facts until a consumer explicitly interprets them.
- Connection may normalize open/connect/listen/bind/write/timeout/close/resource-unavailable categories, but this document does not freeze error code names.
- A write failure can be returned to send/SCOE as transport-level material; send/task/SCOE decide business result or lifecycle under their own designs.
- A transport error must not directly define result/report/northbound failure semantics.
- Error visibility belongs to connection pages/status read model; UI displays sanitized summary, not platform resource internals.

High-frequency rules:

- Main may buffer, batch, throttle, queue or apply backpressure only for platform-resource or performance reasons.
- Main may not classify bytes as frame match, task trigger, SCOE success, result truth, report material or northbound delivery.
- connection may normalize source/target and byte availability; receive consumes byte batches and owns parse/match.
- UI must consume throttled snapshots and selectors, not raw serial/network event streams.
- Queue depth, batch window, overflow/drop policy, target throughput and UI refresh strategy are deferred to implementation/runtime evidence.

### 4.6 Public API necessity

connection needs a public API because receive, send, task, SCOE, status, pages and runtime all depend on transport availability. This is a boundary rule, not a required file shape and not a schema definition.

Allowed capability categories only:

- Transport config category: create, inspect, update and validate transport static config through controlled feature entry.
- Discovery category: expose available serial resources or transport resources as read-only candidates where platform supports discovery.
- Lifecycle command category: request connect, disconnect, cleanup and optional recovery actions.
- Target availability category: provide immutable target route, target status and availability snapshot for send/task/SCOE/pages.
- Byte input category: publish incoming byte batches or normalized transport input events to receive through runtime or explicit event.
- Byte output category: accept transport-level write requests from send/SCOE/runtime and return transport acceptance/failure material.
- Lifecycle/error event category: publish transport-level state and error events for status/pages/runtime.
- Test adapter category: allow fake serial/TCP/TCP server/UDP adapter substitution without exposing platform/main objects.

Explicitly not connection public API:

- receive frame match/process/result API.
- send frame build/business result API.
- task start/pause/resume/stop lifecycle API.
- SCOE command/complete/tool-record API.
- result/report/northbound projection or delivery API.
- mutable store, platform adapter, socket, serialport, raw Electron object, raw channel or DTO schema.

### 4.7 Runtime involvement

connection requires runtime involvement for application composition and cross-feature routing, but runtime must not own transport semantics.

runtime may:

- create and release connection service, connection state, fake/real transport adapters and platform subscriptions.
- route platform facade events into connection service and ensure listener cleanup.
- route connection byte batches to receive without letting receive import connection internals.
- route send/SCOE transport write requests to connection public service when the flow spans feature boundaries.
- combine read-only connection snapshot with status/page view model.
- coordinate cleanup when app exits, page scope closes, profile/settings change, hardware disconnects or stale events arrive.
- register boundary exceptions for high-frequency buffer/backpressure, high-speed storage short-circuit, SCOE fixed source/target, package/native-module behavior or optional northbound HTTP/FTP transport.

runtime must not:

- parse bytes, match frames or process fields.
- build send frames or define business send result.
- own task lifecycle or retry policy.
- interpret SCOE protocol or completion condition.
- define result, report, northbound or customer semantics.
- become a global service locator or hidden event bus.
- directly access Electron, Node, `serialport`, socket handles, file system or raw IPC.

### 4.8 Platform / preload / main involvement

Platform facade:

- Is the renderer-side desktop capability boundary used by connection adapters.
- May expose transport primitive capability categories only after connection/platform implementation design accepts them.
- Does not own transport config semantics, target identity, receive parsing, send result, task lifecycle, SCOE protocol, result/report/northbound meaning.
- Must not reproduce old `src/api/common` as a one-to-one facade.

Preload:

- Exposes minimal typed bridge capabilities, not `window.electron`, not bare `invoke/send/on`, not arbitrary channel subscription.
- May bridge bounded serial/network lifecycle, byte I/O and event delivery after accepted capability design.
- Must not expose receive processing, high-speed storage business rules, task/SCOE commands, report semantics or northbound transaction semantics as platform abilities.

Main process:

- Owns live platform resources: serial port handles, TCP sockets, TCP server handles, UDP sockets, resource cleanup and OS-level I/O.
- May retain platform-side buffer, batch, queue, throttle, stream/file write or backpressure only when tied to platform resources or performance pressure.
- Must not own frame parsing, receive classification, task state transition, SCOE command/completion, result attribution, report generation, northbound error conversion or business device identity.
- Any main-side exception must record why renderer/TypeScript core cannot own it, what main retains, where business semantics live, validation required and exit condition.

### 4.9 Cross-feature communication

| Consumer / collaborator | May consume from connection | Must not do |
| --- | --- | --- |
| pages / connection UI | connection config snapshot, lifecycle commands, status/error summary, target list, test workflow entry. | access platform primitive directly, store runtime truth in page snapshot, subscribe to raw transport stream. |
| settings | provide defaults or persisted preference input if connection design accepts it. | own connection state, open serial/TCP/UDP, validate runtime availability, map target to northbound device. |
| receive | incoming byte batches, source snapshot, lifecycle/error material relevant to input availability. | import connection internal state, parse in connection, decide target availability, write connection facts. |
| send | target availability, transport write capability, write failure/acceptance material. | own connection lifecycle, hardcode SCOE/northbound targets, define task/result/report semantics. |
| task | target availability snapshot and transport failure material indirectly through send result or runtime. | query raw transport internals to mutate lifecycle, treat connection failure as task truth without task-owned rule. |
| SCOE | declared fixed source/target availability and write capability through runtime exception. | make connection own SCOE command semantics, hide SCOE fixed route in generic send/receive internals. |
| status | read-only connection summary, lifecycle/error events and transport health material. | own transport truth, import connection internal state, read raw platform resources. |
| storage / high-speed storage | only through explicit runtime exception when high-frequency file path is designed. | let connection call storage business rules, let main classify storage semantics without owner/exit condition. |
| result / report | no direct connection API in this feature. Future consumers may read transport failure material only through result/report design. | derive result/report truth directly from connection facts. |
| northbound | no direct transport target consumption. If external projection later needs connection state, it must go through status/task/result/report/northbound design. | treat serial/network target, TCP client, TCP server client or UDP remote host as customer deviceId. |

Allowed interaction patterns:

- public service for lifecycle commands, target query and transport write.
- read-only selector for config/status/target snapshots.
- explicit event for transport lifecycle/error and byte batches when async decoupling or batching is needed.
- runtime orchestration for connection + receive, connection + send/SCOE and lifecycle cleanup.

Prohibited interaction patterns:

- feature A imports connection internal state, adapter, composable, private service or platform bridge.
- connection imports receive/send/task/SCOE/status/result/report/northbound internal state to push business side effects.
- pages/widgets subscribe to raw platform transport events.
- status or task backfills connection truth by reading a shared global store.

### 4.10 Target internal layering

后续实现的目标分层只描述职责，不在本设计中冻结字段 schema。

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript 规则。负责 transport config validation category、connection lifecycle reducer、target availability derivation、event normalization、error normalization、selector projection 和 fake-event fixture。不得依赖 Vue、Pinia、Electron、platform、Node、socket、serialport 或全局 store。 |
| `services` | connection 用例入口。负责 connect/disconnect/cleanup/recovery candidate、target query、transport write request、event ingestion、状态更新和错误归一。通过显式 adapter port 与 platform 能力交互。 |
| `state` | connection runtime facts、transport read model、target availability、transport counters 和只读 selector。state action 保持薄层，不保存 platform adapter，不写其他 feature state。 |
| `adapters` | real/fake transport adapter。real adapter 调用 `rewrite/src/platform` facade；fake adapter 用于 fixture、Vitest 和 runtime wiring 测试。adapter 不解释 receive/send/task/SCOE 语义。 |
| `composables` | 面向 connection 页面和局部组件的 UI-facing 组合。负责表单草稿、测试工具输入、订阅生命周期、错误展示、selector 组合和 service 调用。 |
| `components` | 连接列表、串口配置、网络配置、状态卡片、测试工具等 feature UI。组件通过 props/events/composables 使用 connection 能力，不直接访问 platform 或其他 feature internals。 |
| `fixtures` | serial/TCP/TCP server/UDP config 样本、fake platform events、target availability expected output、error/lifecycle transition cases、高频小样本和 legacy observable behavior oracle。fixtures 是证据材料，不是新核心 schema。 |

### 4.11 Structure health and micro-refactor stance

本轮不做代码实现，也不做“只搬不改行为”的微重构。

后续实现应在 `rewrite/src/features/connection` 建立必要层，不迁移旧 `src/stores/serialStore.ts`、`src/stores/netWorkStore.ts`、`src/stores/connectionTargetsStore.ts`、旧 `src/api/common/serialApi.ts`、`networkApi.ts` 或旧 main/preload handler 的组织方式。

旧代码中的职责混杂只作为实现风险：

- `connectionTargetsStore` 聚合 serial/network target 并被 send/SCOE/storage 等消费。
- `serialStore`、`netWorkStore` 直接把 data event 推入 receive store。
- `networkHandlers` 同时处理 transport、TCP line splitting、高速存储 short-circuit 和全窗口广播。
- 旧 preload/API 暴露面以 `window.electron` 和 `src/api/common` 为中心，不符合 rewrite platform facade。

这些问题不阻塞本 design，但必须进入后续 implementation checklist、runtime exception registry 和 review。

### 4.12 Validation plan

Static scan:

- 检查 design/checklist 章节、direct contract、boundary guards、ledger、owner/state/public API/runtime/platform/cross-feature/validation/deferred 是否存在。
- 后续实现时检查 renderer 无 Node/Electron/`window.electron`/raw IPC import，feature 之间不 import connection internal state，platform 不复刻 `src/api/common`。

Vitest unit:

- core lifecycle reducer、config validation category、target availability derivation、error/event normalization、selector projection。
- state read model update from fake platform events。
- no Electron/Node/platform dependency in core.

Fixture test:

- serial/TCP/TCP server/UDP config samples and invalid samples.
- duplicate connect、disconnect already closed、stale event、write failure、timeout、listener cleanup、close/reopen candidate.
- target availability for serial target、TCP target、TCP server listener/client and UDP remote route.
- TCP line split compatibility sample as deferred boundary material, not final receive schema.

Oracle comparison:

- Legacy observable behavior ledger can seed golden cases for visible config/defaults, target route projection, lifecycle transition and error visibility.
- Old UI screenshots/logs may be added later as manual oracle; not required in this pure design turn.

Fake adapter test:

- fake serial list/open/close/write/data/error/close ordering.
- fake TCP connect/data/error/close/timeout.
- fake TCP server listen/client connect/client close/broadcast write.
- fake UDP bind/message/send/error/close/remote route.
- failure injection for disconnect during write, duplicate close, stale event and cleanup.

Manual checklist:

- `/connect` and sidebar entry reachable.
- serial/network config create/edit/delete/select visible.
- connect/disconnect/reconnect/test actions expose coherent button states and errors.
- status, last activity and target availability visible without exposing internal state.
- send/SCOE target selection visible through allowed snapshot.

Runtime validation:

- app startup/shutdown wiring, platform subscription cleanup, event ordering, fake/real bridge lifecycle.
- high-frequency byte batches, throttled UI snapshots and no raw event storm.
- disconnect during high-frequency data and during write.
- runtime exception records when high-speed storage, SCOE fixed route or package/native-module behavior is touched.

Hardware validation:

- real serial enumerate/open/close/reopen/send/receive/error/unplug order.
- real TCP client connect/send/receive/close/error/timeout.
- real TCP server listen/client accept/multiple client send/close/server close cleanup.
- real UDP bind/send/receive/broadcast candidate and remote host routing.
- real throughput/backpressure behavior after parameters are designed.

Package validation:

- only required when implementation touches packaged native module behavior, platform bridge loading, resource path, extraResources or packaged runtime differences.
- package validation cannot be replaced by development Electron runtime or Vitest.

Customer validation:

- not applicable to connection acceptance except as a blocker guard: connection must not map transport target to customer `deviceId`.
- northbound HTTP/FTP, TestReport, customer error/refusal/status semantics remain outside connection.

Cannot claim from this design:

- real serial/TCP/UDP hardware chain complete.
- high-frequency steady-state complete.
- SCOE fixed source/target complete.
- packaged transport bridge complete.
- HTTP/FTP/northbound delivery complete.
- customer closure complete.

### 4.13 Deferred / blockers

Deferred:

- Concrete transport config model, target id representation, persistence shape and migration rule.
- Concrete preload/main/renderer API schema, channel/method names, DTOs, event payloads, error codes and enum names.
- serial option update while connected: preserve close/reopen behavior, change UX, or require manual reconnect.
- TCP `\\r\\n` split ownership: transport input normalization, receive compatibility rule or candidate drop.
- queue depth、batch window、overflow/drop policy、backpressure、sampling、UI refresh interval and target throughput.
- network status-change drift: old preload exposes status-change but main evidence primarily uses connection event/data event.
- global webContents broadcast replacement and target window/subscriber scoping.
- high-speed storage short-circuit boundary with storage/receive/runtime.
- SCOE fixed TCP server / UDP source/target exception.
- UDP remote host route representation, including IPv6 and duplicate route behavior.
- whether old network `autoReconnect` option is real behavior, future strategy or dead config candidate.
- northbound `deviceId` and transport target separation in customer-facing flows.

Blockers for implementation:

- No accepted implementation design for concrete platform transport bridge capabilities.
- No runtime evidence for real serial/TCP/UDP event order and failure behavior.
- No high-frequency performance target or overflow/backpressure policy.
- No hardware validation environment recorded for SCOE fixed source/target.
- No customer materials for northbound device identity, result/report/file delivery closure.

Blockers for acceptance:

- Missing real serial/TCP/UDP validation blocks claiming hardware connection accepted.
- Missing runtime high-frequency evidence blocks claiming batching/backpressure accepted.
- Missing package validation blocks claiming packaged transport bridge/native module behavior accepted.
- Missing SCOE device evidence blocks claiming SCOE fixed source/target accepted.
- Missing customer schema/environment blocks claiming northbound delivery accepted.

## 5. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-connection/rewrite-connection-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、boundary guards、legacy observable behavior ledger、owner/not owner、state owner、public API necessity、runtime/platform involvement、cross-feature communication、validation plan 和 deferred/blocker 项，不能把本轮文档外的旧代码结构升级为新实现合同。
