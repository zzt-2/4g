---
doc_type: architecture
type: rewrite-connection-transport-boundary
status: draft
date: 2026-04-30
summary: Foundation boundary design for connection and transport before receive, send, task, SCOE, result, report, or northbound feature design. This document fixes ownership, state layering, Electron/platform responsibilities, high-frequency principles, cross-feature access rules, and validation posture without defining API schemas.
tags:
  - rewrite
  - connection
  - transport
  - platform
  - boundary
  - pre-design
---

# Rewrite connection / transport boundary

## 1. Scope

本轮是东方红上位机重写的 connection / transport foundation boundary design。

Lane judgement:

- Lane B。
- 本轮只做 foundation boundary design。
- 不写业务代码。
- 不实现 serial、TCP client、TCP server 或 UDP。
- 不写 preload / main / renderer API schema。
- 不进入 receive / send / task / SCOE / result / report / northbound 内部设计。

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
- `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
- `codestable/architecture/rewrite-platform-api-surface-reduction.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`
- 当前 `rewrite` scaffold 相关文件：`rewrite/src-electron/main`、`rewrite/src-electron/preload`、`rewrite/src/platform`、`rewrite/src/shared`

Boundary guards:

- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- preload 只暴露 typed bridge，不暴露裸 `invoke/send/on`。
- main 可以拥有串口、网络 socket、连接生命周期、必要缓冲、队列和背压，但不解释业务帧、字段、任务、报告语义。
- `connection` 只拥有连接配置、连接运行事实、连接错误、连接生命周期和 transport-level event。
- `connection` 不拥有 frame parsing、receive matching、send task state、SCOE protocol semantics、result、report、northbound。
- receive / send / task / SCOE 只能通过 connection public service 或 runtime 编排消费连接能力，禁止 import connection 内部 state。
- 本文不冻结具体 channel、method、DTO、错误码、枚举。
- 本文不声明真实串口、TCP、UDP、SCOE 硬件链路完成。

## 2. Legacy evidence summary

旧系统事实只用于识别可观测行为、迁移风险和 oracle 候选，不能自动升级为目标架构。

### 2.1 Serial evidence

- 旧 main 串口 handler 负责端口枚举、打开、关闭、写入、读取、状态查询、选项设置和事件广播。`src-electron/main/ipc/serialHandlers.ts:130`, `src-electron/main/ipc/serialHandlers.ts:286`, `src-electron/main/ipc/serialHandlers.ts:513`, `src-electron/main/ipc/serialHandlers.ts:580`
- 旧 main 串口打开时创建 `SerialPort` 并绑定 `ReadlineParser`，说明旧链路已在 transport 层带有按行 parser 倾向；新架构不能因此把业务解析放进 main。`src-electron/main/ipc/serialHandlers.ts:154`, `src-electron/main/ipc/serialHandlers.ts:164`
- 旧 serial data 事件直接广播到所有窗口，并同步更新字节计数和状态。`src-electron/main/ipc/serialHandlers.ts:521`, `src-electron/main/ipc/serialHandlers.ts:531`, `src-electron/main/ipc/serialHandlers.ts:567`
- 旧 renderer 的 `serialStore` 通过 `serialAPI.open` 执行连接，成功后注册 listener，并维护连接状态、活动端口、错误和历史消息。`src/stores/serialStore.ts:161`, `src/stores/serialStore.ts:177`, `src/stores/serialStore.ts:191`
- 旧 serial 入站数据在 store 中进入 `receiveFramesStore.handleReceivedData('serial', portPath, data)`。`src/stores/serialStore.ts:392`, `src/stores/serialStore.ts:414`
- 旧串口目标通过字符串 `serial:${port.path}` 进入发送目标路由。`src/stores/connectionTargetsStore.ts:56`, `src/composables/frames/sendFrame/useUnifiedSender.ts:105`

Evidence judgement:

- 旧系统可观测能力包括串口枚举、连接、断开、收发、状态展示、错误展示、页面测试发送和作为 send target。
- 旧字符串 target、逐包事件穿透、main 侧 parser 倾向和 store 直接调用 receive 是迁移风险，不是目标结构。

### 2.2 TCP client / TCP server / UDP evidence

- 旧 network 运行路径覆盖 TCP client、TCP server 和 UDP，renderer store 通过 `networkAPI.connect / disconnect / send` 调用 main。`src-electron/main/ipc/networkHandlers.ts:85`, `src-electron/main/ipc/networkHandlers.ts:146`, `src-electron/main/ipc/networkHandlers.ts:229`, `src/stores/netWorkStore.ts:50`
- TCP client 使用 `net.Socket`，连接后发送 connection event；`error`、`close`、`timeout` 更新状态或清理连接记录。`src-electron/main/ipc/networkHandlers.ts:85`, `src-electron/main/ipc/networkHandlers.ts:100`, `src-electron/main/ipc/networkHandlers.ts:120`, `src-electron/main/ipc/networkHandlers.ts:128`
- TCP server 使用 `net.createServer` 接收 client socket，并维护 server client 列表。`src-electron/main/ipc/networkHandlers.ts:146`, `src-electron/main/ipc/networkHandlers.ts:155`, `src-electron/main/ipc/networkHandlers.ts:162`
- UDP 使用 `dgram.createSocket('udp4')`、本地 bind、`message` 事件和可选 broadcast。`src-electron/main/ipc/networkHandlers.ts:229`, `src-electron/main/ipc/networkHandlers.ts:247`, `src-electron/main/ipc/networkHandlers.ts:265`, `src-electron/main/ipc/networkHandlers.ts:268`
- TCP 入站先按 `\r\n` 拆包再进入通用 data received；UDP message 直接进入通用 data received。`src-electron/main/ipc/networkHandlers.ts:464`, `src-electron/main/ipc/networkHandlers.ts:487`, `src-electron/main/ipc/networkHandlers.ts:498`
- 旧 network handler 在 data received 中先判断 high-speed storage rule，命中后异步存储并不再广播给 renderer。`src-electron/main/ipc/networkHandlers.ts:505`, `src-electron/main/ipc/networkHandlers.ts:509`, `src-electron/main/ipc/networkHandlers.ts:515`
- network data 和 connection event 直接广播给所有 renderer web contents。`src-electron/main/ipc/networkHandlers.ts:582`, `src-electron/main/ipc/networkHandlers.ts:598`
- 旧 network 入站数据在 store 中进入 `receiveFramesStore.handleReceivedData('network', connectionId, data)`。`src/stores/netWorkStore.ts:207`, `src/stores/netWorkStore.ts:210`

Evidence judgement:

- 旧系统可观测能力包括 TCP client、TCP server、UDP 本地绑定、UDP remote host、连接事件、数据收发和页面测试发送。
- 旧 TCP 的 `\r\n` 分包、high-speed storage 短路、状态事件漂移和发送无明确背压策略都是后续 feature design 的风险证据。
- TCP client、TCP server、UDP 的 transport 可保留为 capability，但旧 network handler 的业务分流不能进入目标 main 职责。

### 2.3 Receive / send / task / SCOE consumption evidence

- 旧 receive 总入口支持 `serial | network` source，并使用处理锁和队列保护。`src/stores/frames/receiveFramesStore.ts:882`, `src/stores/frames/receiveFramesStore.ts:887`
- 旧 receive 对 `scoe-tcp-server` 有固定 source 特判。`src/stores/frames/receiveFramesStore.ts:1021`
- 旧 receive 成功后会继续处理接收 API 结果、星座图数据和 trigger task 条件。`src/stores/frames/receiveFramesStore.ts:1198`, `src/stores/frames/receiveFramesStore.ts:1215`, `src/stores/frames/receiveFramesStore.ts:1252`
- 旧 receive trigger 会直接调用 `sendTasksStore.handleFrameReceived`。`src/stores/frames/receiveFramesStore.ts:1263`, `src/stores/frames/receiveFramesStore.ts:1293`
- 旧 send 统一发送器把 targetId 解析为 `serial` 或 `network`，再分别走串口或网络发送。`src/composables/frames/sendFrame/useUnifiedSender.ts:31`, `src/composables/frames/sendFrame/useUnifiedSender.ts:100`, `src/composables/frames/sendFrame/useUnifiedSender.ts:105`
- 旧 UDP remote host 目标通过 `connectionId:host:port` 字符串拼接继续向 network API 传递。`src/stores/connectionTargetsStore.ts:190`, `src/composables/frames/sendFrame/useUnifiedSender.ts:118`
- 旧 send 成功后直接更新 send stats、global stats，并硬编码 SCOE UDP target 记录。`src/composables/frames/sendFrame/useUnifiedSender.ts:146`, `src/composables/frames/sendFrame/useUnifiedSender.ts:150`, `src/composables/frames/sendFrame/useUnifiedSender.ts:154`
- 旧 task 发送失败后再查询 target availability，不可用时把任务置为 paused。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:229`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:233`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:236`
- 旧 SCOE 直接创建固定网络连接 `scoe-udp` 和 `scoe-tcp-server`，发送固定走 `network:scoe-udp:scoe-udp-remote`。`src/stores/scoeStore.ts:216`, `src/stores/scoeStore.ts:252`, `src/stores/scoeStore.ts:278`

Evidence judgement:

- receive、send、task、SCOE 都需要消费连接能力，但旧代码把连接状态、target 路由、receive 解析、task trigger、SCOE 固定目标和统计副作用揉在多处 store/composable 中。
- 新架构必须把 connection public service、runtime orchestration 和 explicit event 作为边界，禁止 feature import connection 内部 state。

### 2.4 Electron exposure evidence

- 旧 preload 暴露统一 `window.electron` 大包。`src-electron/preload/index.ts:1`, `src-electron/preload/index.ts:7`
- 旧 preload 聚合 window、menu、autoLaunch、serial、network、files、dataStorage、path、receive、highSpeedStorage、historyData、timerManager。`src-electron/preload/api/index.ts:1`, `src-electron/preload/api/index.ts:14`
- 旧 renderer `src/api/common` 直接围绕 `window.electron` 包装 serial / network / files / path / receive 等能力。`src/api/common/serialApi.ts:12`, `src/api/common/networkApi.ts:18`
- 当前 `rewrite` 已实现完整 transport bridge：preload 暴露 typed transport bridge（connect/disconnect/write/cleanup/drainEvents/onEvent）并维护 serial/network IPC 路由；platform facade 提供 TransportFacade 接口；shared types 包含 SerialConnectConfig + TCP/UDP config + TransportConnectConfig discriminated union；main 注册 serial-handlers + network-handlers。`rewrite/src-electron/preload/index.ts`, `rewrite/src/platform/transport.ts`, `rewrite/src/shared/platform-bridge.ts`, `rewrite/src-electron/main/network-handlers.ts`

Evidence judgement:

- 旧三段式 main / preload / renderer 可以作为能力清单 evidence。
- 旧 `window.electron` 大包、旧 `src/api/common` wrapper、旧 main business handler 不能作为新 API 形状。
- 当前 `rewrite` scaffold 尚未实现 connection feature 或 transport API；本轮不能声明连接链路完成。

## 3. Owner / not owner

### 3.1 Transport resource owner and runtime facts owner

| Transport | Platform / main resource responsibility | Connection feature responsibility | Runtime facts owner | Not owner |
| --- | --- | --- | --- | --- |
| Serial | 端口枚举、打开、关闭、底层读写、底层错误和关闭事件、必要平台侧 buffer / batch / backpressure | 串口连接配置模型、连接实例、状态事实、target availability、transport-level error、生命周期事件归一 | `features/connection` owns canonical connection facts; main only holds live resource facts | frame parsing、receive matching、send task state、SCOE semantics、report、northbound device identity |
| TCP client | socket 创建、连接、断开、底层读写、socket error / close / timeout、必要平台侧 buffer / batch / backpressure | TCP client 连接配置模型、连接实例、状态事实、target availability、transport-level error、生命周期事件归一 | `features/connection` owns canonical connection facts; main only holds socket resource facts | 上层协议拆帧、任务生命周期、业务结果、外部 device identity |
| TCP server | server listen / close、client socket accept / close、底层读写、client resource cleanup、必要平台侧 buffer / batch / backpressure | TCP server listener 与 client availability 的 transport facts、server target 可用性、生命周期事件归一 | `features/connection` owns listener/client transport facts visible to renderer; main owns live server/socket handles | 业务会话语义、SCOE 命令含义、receive 分类、northbound session |
| UDP | socket bind / close、message event、send、broadcast option、必要平台侧 buffer / batch / backpressure | UDP 本地绑定连接、remote host target route、target availability、transport-level error、生命周期事件归一 | `features/connection` owns canonical UDP connection and remote host route facts; main owns live socket resource facts | frame parsing、remote business device identity、SCOE command completion、northbound deviceId |

Rules:

- `connection` 是 transport domain owner；`platform/main` 是平台资源 owner。
- main 可以产生 raw platform facts，但 canonical renderer-side connection facts、target availability 和 transport read model 归 `connection`。
- `connection` 的 target identity 只表示 transport target，不表示 northbound `deviceId`、业务设备、case、task 或 SCOE 领域对象。
- TCP server 的 client 连接可以是 transport-level availability material，但不能自动成为业务会话或 northbound 设备。
- UDP remote host 是 transport route material，不冻结字段 schema，也不等同 customer device。

### 3.2 Connection owns

`connection` owns:

- serial / TCP client / TCP server / UDP 的 connection profile 和 transport static config。
- 连接实例生命周期：idle、connecting、connected、disconnecting、disconnected、error 等状态概念的归口。本文不冻结枚举名称。
- target route 和 target availability 的 read model。
- transport-level event：connected、disconnected、error、data available、write accepted、write failed、resource unavailable 等能力类别。本文不冻结事件名称或 payload。
- transport-level error：端口不存在、打开失败、socket 关闭、timeout、写入失败、资源释放失败等归一类别。本文不冻结错误码。
- 平台事件到 connection read model 的归一规则。
- 面向 receive / send / task / SCOE / status / runtime 的公开能力类别。
- fake transport adapter 所需的测试替换边界。

### 3.3 Connection does not own

`connection` must not own:

- frame byte parsing、identifier matching、field extraction、expression input 或 receive result。
- send frame construction、send instance stats、send task lifecycle 或 task progress。
- SCOE protocol semantics、command parse、completion condition、tool record 或 fixed source / target 的业务含义。
- result truth、report object、history/CSV/report material、northbound delivery、HTTP/FTP transaction。
- northbound `deviceId`、subsystem identity、customer-facing task/control/status/result/error semantics。
- UI page state、dialog state、form dirty state、table pagination 或 chart refresh state。

## 4. State owner

| State layer | Owner | Write rule | Readers | Persistence |
| --- | --- | --- | --- | --- |
| Transport static config | `features/connection` owns transport config meaning. `settings` may own user defaults. `storage` only persists snapshots through explicit feature request. | Config changes go through connection public service or runtime setup. Platform/main does not define config semantics. | pages, settings, send, SCOE, runtime may read allowed config snapshot. | Persist only when feature design says so; storage owns file I/O, not config meaning. |
| Runtime connection facts | `features/connection` | Single writer based on explicit user command, runtime lifecycle command, or platform event. main is source of resource events, not renderer truth owner. | send, receive, task, SCOE, status, pages via public selectors or runtime. | Usually transient; feature design must mark whether any reconnect/session facts persist. |
| Transport event / read model | `features/connection` for normalized transport events and read model; platform/main for raw resource event production. | Raw events enter through platform facade, then connection normalizes. Data batches may be forwarded through runtime to receive without exposing internal state. | receive consumes byte batches; send/SCOE consume write result and target availability; status consumes read model. | Event log/history is not implicit; if persisted, storage owns persistence only. |
| UI snapshot | pages / feature composables / widgets | UI can filter, group, throttle, paginate, and display; UI cannot write runtime facts. | UI components only. | UI preference persistence belongs settings only when explicitly designed. |

Rules:

- Static config, runtime facts, transport read model, UI snapshot must stay separate.
- `connection` read model cannot expose mutable internal state references.
- Runtime facts are reset by connection lifecycle rules, not by UI unmount alone.
- send / receive / task / SCOE must not infer connection facts by importing connection store internals.
- Transport counters may exist as connection read model, but business statistics belong to the corresponding feature owner.

## 5. Platform / preload / main / renderer boundary

Renderer:

- Uses only `rewrite/src/platform` facade for desktop capability access.
- Does not access `window.electron`, Electron, Node, `ipcRenderer`, `fs`, `path`, `net` or `serialport`.
- Does not subscribe directly to raw transport events from preload.
- Pages and widgets call connection public service, feature composables, or runtime page-level entry, not platform transport primitives.

Platform facade:

- Lives in renderer and hides preload details from features.
- Exposes capability categories only after corresponding foundation / feature design accepts the capability.
- Can expose transport primitives to connection adapters, not to arbitrary pages or features.
- Does not own connection config semantics, target identity, receive parsing, send result semantics, task lifecycle, SCOE protocol, result/report/northbound meaning.

Preload:

- Exposes a minimal typed bridge.
- Does not expose raw `invoke/send/on`, arbitrary channel subscription, or all-in-one `window.electron`.
- Does not expose `receive` business processing, high-speed storage business rules, history/report semantics, or task/SCOE commands as platform abilities.
- For transport, preload may bridge bounded lifecycle, byte I/O and bounded event delivery only after the connection design fixes the capability category.

Main process:

- Owns platform resources: serial port handles, TCP sockets, TCP server handles, UDP sockets, resource cleanup, app lifecycle, and necessary OS-level I/O.
- May retain platform-side buffering, batching, throttling, queueing, stream/file writing and backpressure when tied to platform resources or performance pressure.
- Must not define frame parsing, receive classification, task state transitions, SCOE completion, result attribution, report generation, northbound error conversion or business device identity.
- Any main-side exception must record why renderer / TypeScript core cannot reasonably own it, what main retains, where business semantics live, and how validation is done.

Connection feature:

- Is the renderer-side transport domain owner.
- Consumes platform transport primitives through adapters.
- Normalizes platform facts into transport facts.
- Publishes only public service, read-only selector, explicit event, or runtime-facing capabilities.
- Does not expose internal state to receive / send / task / SCOE.

## 6. Connection public API necessity

`connection` needs a public API because receive, send, task, SCOE, status, pages and runtime all depend on transport availability. This public API is a boundary rule, not a required file shape and not a schema definition.

Allowed capability categories:

- Lifecycle command category: request connect, disconnect, reconnect attempt, resource cleanup, and lifecycle recovery. This does not define method names.
- Config query / update category: read or update transport static config through controlled entry; settings may provide defaults, but connection owns transport meaning.
- Target selector category: read target availability, target route, connection kind, and status snapshot as immutable read model.
- Byte input category: expose incoming transport byte batches or normalized transport input events to receive through runtime or explicit event.
- Byte output category: accept transport-level write requests from send / SCOE through public service or runtime; return transport-level acceptance or failure, not business send result.
- Error / lifecycle event category: publish transport-level lifecycle and error events for status, pages and runtime.
- Test adapter category: allow fake transport adapter injection in tests without exposing platform/main objects.

Rules:

- Public API must not leak mutable connection state, platform resource handles, raw Electron objects, raw socket instances or serialport instances.
- Public API must not freeze DTO, channel names, error code names or enum values in this document.
- Public API must not make receive / send / task / SCOE depend on connection store implementation.
- If a future feature has no external connection consumer, no extra public API is required for that feature.
- If a future flow requires cross-feature write or lifecycle progression, it must state owner, caller, input/output boundary, failure handling and validation level in its feature design.

## 7. Runtime involvement

`runtime/` is needed only as an application composition and cross-feature orchestration layer.

Runtime may:

- Create and release connection service, transport adapters and platform subscriptions at application startup and shutdown.
- Wire platform facade events into connection service.
- Route connection byte batches to receive without letting receive import connection internals.
- Route send / SCOE transport write requests to connection public service when the flow spans feature boundaries.
- Coordinate lifecycle cleanup when pages close, app exits, user switches profiles, or hardware disconnects.
- Register boundary exceptions such as high-frequency buffer / batch / backpressure, high-speed storage short-circuit, SCOE fixed source/target, packaged data path or optional HTTP/FTP transport.
- Combine read-only connection snapshot with status or page view model.

Runtime must not:

- Parse receive bytes.
- Build send frames.
- Own task lifecycle.
- Interpret SCOE protocol.
- Define result, report or northbound semantics.
- Become a global service locator or hidden event bus.
- Directly access Electron, Node, `serialport`, socket handles or file system.

## 8. High-frequency data principles

Target high-frequency flow:

```text
platform resource
  -> main-side buffer / batch / queue / backpressure when justified
  -> typed preload bridge
  -> platform facade
  -> connection adapter and connection read model
  -> runtime route or explicit event
  -> receive / send / storage / SCOE public boundary
  -> feature read model delta
  -> throttled UI snapshot
```

Rules:

- Main may batch, buffer, throttle, queue or apply backpressure for platform-resource reasons.
- Main may not classify bytes as receive result, task result, SCOE command success, report material, or northbound delivery status.
- Connection may normalize transport-level data availability and transport stats; it does not parse frames or define business result.
- Receive consumes byte batches, not raw unbounded per-packet renderer events.
- UI consumes throttled snapshots and read-only selectors; UI does not subscribe to raw serial/network events.
- Backpressure and overflow policy must be declared in future connection / receive design; this document does not set queue depth, window size, sampling rate or timeout thresholds.
- High-speed storage short-circuit is a boundary exception candidate. It must state whether data bypasses normal receive/display/trigger, which feature owns the decision, and what runtime/hardware evidence is required.
- Transport-level counters must not become global business statistics. Business stats belong to receive/send/task/SCOE/result/status owners as appropriate.

## 9. Disconnect, reconnect, errors, and lifecycle events

Principles:

- Disconnect and error facts are transport-level facts owned by connection.
- Automatic reconnect is not assumed. If added, it must be explicit connection behavior with retry policy, cancellation, UI visibility and validation plan.
- A failed send should not itself decide task lifecycle. send may report transport failure; task decides task lifecycle through task-owned rules.
- A transport error should not define result/report/northbound failure semantics. result/report/northbound may consume transport facts through public projections.
- Close, cleanup and app shutdown must be idempotent and observable enough for runtime/manual validation.
- Connection lifecycle events should be low-frequency read model updates; high-frequency data flow should use batch/delta channels separately.

Legacy evidence guard:

- 旧网络 connect 对已有连接采取先 disconnect 再重建，未体现自动 retry 策略。`src-electron/main/ipc/networkHandlers.ts:33`
- 旧 TCP client 的 `error/close/timeout` 主要是状态更新和清理。`src-electron/main/ipc/networkHandlers.ts:120`, `src-electron/main/ipc/networkHandlers.ts:128`, `src-electron/main/ipc/networkHandlers.ts:132`
- 旧任务发送失败后才查询 target availability 并暂停任务。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:229`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:233`

## 10. Cross-feature communication

Allowed patterns:

- Public service: send, SCOE, task or pages call connection-owned command/query capabilities through explicit public entry.
- Runtime orchestration: runtime coordinates connection + receive or connection + send/SCOE when a flow crosses feature boundaries.
- Explicit event: connection emits declared transport-level events for receive/status/runtime consumers when async decoupling or batching is needed.
- Read-only selector: status/pages/widgets consume immutable snapshots or view models.

Prohibited patterns:

- receive / send / task / SCOE import connection internal `state`.
- receive / send / task / SCOE import connection internal adapter or private service implementation.
- connection imports receive/send/task/SCOE internal state to push business side effects.
- connection writes task status, send stats, receive parse result, SCOE command record, result truth, report file state or northbound transaction.
- pages/widgets subscribe to raw platform transport event streams.
- status reads raw connection internals instead of public snapshot.

Feature consumption boundaries:

| Consumer | May consume from connection | Must not do |
| --- | --- | --- |
| `receive` | incoming byte batches, source snapshot, lifecycle/error events relevant to input availability | import connection state, decide target availability, own transport lifecycle |
| `send` | target availability, transport write capability, transport-level write failure | own connection lifecycle, hardcode SCOE/northbound targets, define task result |
| `task` | target availability snapshot, explicit send/transport failure material via send result | import connection state, decide low-level retry by reading raw transport |
| `scoe` | declared fixed source/target availability through runtime exception, transport write capability | hardcode generic send internals, make connection own SCOE semantics |
| `status` | read-only connection summary and lifecycle events | own transport truth or raw platform resources |
| `northbound` | only internal projection if later needed through status/task/result/report; no direct transport target = deviceId mapping | treat serial/network target as customer device identity |

## 11. Validation plan

### 11.1 Vitest fixture can test

- Transport config validation as pure data rules once feature design defines the model.
- Connection lifecycle state transitions without real I/O.
- Target route and target availability selector behavior, including serial target, TCP target, TCP server target and UDP remote host route as fixture cases.
- Error normalization categories without freezing final error codes.
- Runtime-independent connection read model updates from fake platform events.
- Cross-feature contract tests that assert receive/send/task/SCOE only use connection public boundary and not internal state.
- High-frequency batching logic in pure functions where queue/window/overflow policy has been designed.

Limit:

- Fixture cannot prove real serial/TCP/UDP device behavior, OS socket timing, driver behavior, hardware disconnect order, throughput or packaged app behavior.

### 11.2 Fake transport adapter can test

- Fake serial open/close/write/data event ordering.
- Fake TCP client connect/error/close/timeout and incoming data batches.
- Fake TCP server listen/client connect/client close/broadcast write behavior as transport-level facts.
- Fake UDP bind/send/message/remote host routing behavior.
- Failure injection: write failure, disconnect during write, duplicate close, stale connection event, listener cleanup, reconnect attempt cancellation.
- Backpressure and overflow policy simulations after future design defines parameters.
- Runtime wiring with connection service without touching Electron main/preload or real sockets.

Limit:

- Fake adapter does not replace main/preload bridge validation or hardware/runtime validation.

### 11.3 Manual checklist must test

- Connection page entry remains reachable.
- User can create, edit, select and delete serial/TCP/TCP server/UDP connection configurations once UI is implemented.
- Connect/disconnect button states and disabled states are coherent.
- Connection status, error message and last activity display are understandable.
- Manual recovery after failed connect, duplicate connect, disconnect and reconnect is visible.
- Serial and network test tools or equivalent visible workflows are available if preserved in scope.
- Target selection for send/SCOE is visible without exposing raw internal state.
- UI snapshot does not visibly lag, flicker or grow unbounded under ordinary data flow.

Limit:

- Manual checklist proves user-visible workflow only; it does not prove hardware throughput, packet order, backpressure or customer delivery.

### 11.4 Runtime / hardware validation must test

- Real serial enumerate/open/close/reopen, send, receive, error and disconnect order.
- Serial behavior across Windows target environment, port path changes, unavailable port and device unplug.
- TCP client real connect/send/receive/close/error/timeout.
- TCP server listen/client accept/multiple client send/close/server close cleanup.
- UDP bind/send/receive/broadcast option and remote host routing.
- High-frequency serial/TCP/UDP data with batching, queue, overflow, UI snapshot and no unbounded renderer event storm.
- Disconnect during high-frequency data and during write.
- Reconnect policy if implemented, including cancellation and operator-visible status.
- Main/preload/platform bridge behavior in Electron runtime, not only unit tests.
- Packaged data path only when storage/report/northbound flows require it.
- SCOE fixed source/target with real device only in the later SCOE feature validation.

Cannot claim without evidence:

- Real serial/TCP/UDP hardware chain complete.
- High-frequency steady-state behavior complete.
- SCOE device chain complete.
- Packaged data path complete.
- HTTP/FTP / northbound delivery complete.
- Customer closure complete.

## 12. Deferred / blockers

Deferred:

- Concrete platform/preload/main channel names, methods, DTOs, errors and enums.
- Concrete connection config model, target id format and persistent storage shape.
- Queue depth, batch window, overflow/drop policy, retry/backoff policy and UI refresh interval.
- Whether TCP transport should preserve old `\r\n` splitting, move it into receive, or make it a configurable receive input rule.
- Whether old high-speed storage short-circuit is preserved, changed or split into storage/receive/runtime exception.
- Whether UDP remote host string serialization supports IPv6 or must use a different route representation.
- Whether old UI `websocket` option is dead legacy, candidate drop, or future extension; current old network type does not implement it.
- How network status-change drift is resolved; old renderer listens to status-change while main evidence primarily shows connection event and data event.
- SCOE fixed source/target exception design.
- Northbound `deviceId` and serial/network target separation in customer-facing flows.

Blockers for implementation:

- No accepted connection feature design yet.
- No accepted platform transport bridge capability map for serial/TCP/TCP server/UDP.
- No runtime evidence for real serial/TCP/UDP device behavior.
- No high-frequency performance evidence or target throughput.
- No hardware validation environment recorded for SCOE.
- No customer materials for northbound result/report/file delivery closure.

Blockers for acceptance:

- Missing real serial/TCP/UDP validation blocks claiming hardware connection accepted.
- Missing runtime high-frequency evidence blocks claiming buffer/batch/backpressure accepted.
- Missing packaged app evidence blocks claiming packaged data path accepted.
- Missing SCOE device evidence blocks claiming SCOE fixed source/target accepted.
- Missing customer schema/environment blocks claiming northbound delivery accepted.

## 13. Carry-forward gates

Before `connection` feature design:

- Use this document as direct contract together with target structure, system architecture, platform API surface reduction, quality rules and review checklist.
- Fill legacy observable behavior ledger for serial/TCP/TCP server/UDP visible behavior.
- Decide connection owner / not owner for any target route or transport event.
- Declare public API necessity by capability category only.
- Declare state owner for static config, runtime facts, read model and UI snapshot.
- Declare runtime involvement and exception records.
- Declare fixture, fake adapter, manual, runtime and hardware validation scope.

Before `receive` design:

- Decide how receive consumes connection byte batches without importing connection internal state.
- Decide whether TCP line splitting is transport fact, receive input normalization, or deferred compatibility.
- Decide high-speed storage short-circuit boundary with storage and runtime.

Before `send` design:

- Decide how send asks connection to write bytes and how send owns business send result.
- Keep target availability read-only and separate from task lifecycle.

Before `task` design:

- Keep transport failure as input material, not task truth.
- Do not inherit old `send failure -> query target -> pause` as target architecture without explicit task design.

Before `SCOE` design:

- Register fixed TCP server / UDP source and target as boundary exception.
- Keep SCOE command semantics in `scoe`, not connection/send/receive.

Before `northbound` design:

- Keep serial/network transport target separate from customer device identity.
- Do not map connection status directly to external status without status/northbound projection design.
