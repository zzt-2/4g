---
doc_type: architecture
type: rewrite-connection-platform-bridge
status: draft
date: 2026-05-04
summary: Boundary design for the real serial, TCP client, TCP server, and UDP platform bridge after the connection fake loop. This document fixes platform, preload, main, renderer, connection, and runtime responsibilities without defining API schemas, channels, DTOs, or error codes.
tags:
  - rewrite
  - connection
  - platform
  - bridge
  - serial
  - tcp
  - udp
---

# Rewrite connection platform bridge

## 1. Scope

本轮是东方红上位机重写的 connection real platform bridge design。

Lane judgement:

- Lane B design。
- 本轮只锁定真实 serial、TCP client、TCP server、UDP 的 platform / preload / main / renderer / connection / runtime 边界。
- 本轮只产出 design 和 checklist gate，不实现代码。

Non-goals:

- 不实现 serial、TCP client、TCP server 或 UDP。
- 不写 API schema、IPC channel、method、DTO、payload、错误码或枚举。
- 不进入 receive、send、task、SCOE、result、report 或 northbound 实现。
- 不把旧 `window.electron`、旧 `src/api/common`、旧 preload 聚合或旧 main business handler 迁入 `rewrite/`。
- 不声明 hardware、package、HTTP/FTP、northbound 或 customer validation 完成。

## 2. Direct contract

本设计只依据以下正式工件和当前实现事实判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/architecture/rewrite-system-architecture.md`
5. `codestable/architecture/rewrite-platform-api-surface-reduction.md`
6. `codestable/architecture/rewrite-connection-transport-boundary.md`
7. `codestable/architecture/rewrite-platform-app-shell-file-dialog.md`
8. `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
9. `codestable/quality/rewrite-quality-rules.md`
10. `codestable/quality/rewrite-review-checklist.md`
11. `codestable/features/rewrite-connection/rewrite-connection-design.md`
12. `codestable/features/rewrite-connection/rewrite-connection-checklist.yaml`
13. 当前实现：`rewrite/src/features/connection`
14. 当前实现：`rewrite/src/platform`
15. 当前实现：`rewrite/src-electron/main`
16. 当前实现：`rewrite/src-electron/preload`

Boundary guards:

- 只设计真实 serial / TCP client / TCP server / UDP bridge 的职责边界。
- 不冻结 schema、channel、method、DTO、payload、错误码或枚举。
- renderer 只能通过 `rewrite/src/platform` facade 使用桌面能力。
- preload 只暴露 typed bridge，不暴露裸 `invoke/send/on` 或任意 channel 订阅。
- main 只承载 native resource、transport lifecycle、OS I/O、必要 buffering、batch、queue、throttle 和 backpressure。
- main 禁止解释 frame、receive、send、task、SCOE、result、report、northbound 业务语义。
- connection feature 消费 platform capability，但不绑定具体 platform schema。
- 旧 serial/network target 不是 northbound `deviceId`，也不是业务设备、task、case 或 report delivery target。
- 不读取或修改自动生成前端 types。
- 本轮纯文档，不运行 build/lint。

## 3. Current evidence

当前 `rewrite` 状态：

- `rewrite/src/shared/platform-bridge.ts` 定义 bridge metadata、transport 类型（SerialConnectConfig + TCP/UDP config + TransportConnectConfig discriminated union）和 TransportBridge 接口（connect/disconnect/write/cleanup/drainEvents/onEvent）。
- `rewrite/src/platform/index.ts` re-export transport facade 和所有 transport config 类型；`transport.ts` 提供 `TransportFacade` 接口和 `createTransportFacade` 工厂。
- `rewrite/src-electron/preload/index.ts` 通过 `contextBridge` 暴露完整 transport bridge，内部维护 `connectionTypes` Map 做 serial/network IPC 路由。
- `rewrite/src-electron/main/index.ts` 注册 serial-handlers 和 network-handlers；network-handlers 管理 TCP Client、TCP Server（含 client）、UDP 连接，独立 batch 基础设施。
- `rewrite/src/features/connection` 已有 core、state、selector、service、adapter port、fake adapter 和 real-serial-adapter；TCP/UDP adapter 待 connection-complete feature 实现。
- 当前 connection 测试以 fake adapter、pure core、state/service/selector 为主。RealSerialAdapter 已接入 platform facade。真实 TCP/UDP 链路需 runtime/hardware 验证。

旧系统可作为 evidence 的 transport 能力：

- serial 侧存在端口枚举、打开、关闭、关闭全部、读写、状态、事件广播和 app quit cleanup。
- TCP client 侧存在 socket connect、send、receive、close、error、timeout。
- TCP server 侧存在 listen、client accept、client list、broadcast write 和 cleanup。
- UDP 侧存在 bind、message、send、remote host route 和 broadcast candidate。
- 旧 renderer 通过 `window.electron` 和 `src/api/common` 使用 serial/network 能力，旧 main/preload/renderer 链路提供了能力清单 evidence，但不能作为目标 bridge 形状。

旧系统风险 evidence：

- 旧 preload 暴露大而全 `window.electron`。
- 旧 renderer wrapper 围绕 `src/api/common/*Api.ts` 复制 Electron 能力面。
- 旧 serial/network data 逐事件进入 renderer store，并继续推动 receive、send、task、SCOE、统计和 UI 副作用。
- 旧 network handler 中存在 TCP `\\r\\n` 分包、高速存储 short-circuit 和全窗口广播。
- 旧 main 中存在 receive business handler，说明旧主进程已混入业务语义，不能成为新职责依据。

Evidence judgement:

- 旧 transport 能力可作为 native resource 能力范围和 manual/hardware oracle 候选。
- 旧暴露方式、旧 store 副作用链、旧 main business handler、旧 target 字符串和旧高速短路规则只作为迁移风险，不进入目标平台桥接合同。

## 4. Owner split

| Owner | Owns | Must not own |
| --- | --- | --- |
| `platform` | renderer 侧 facade；桥接可用性、capability health、受控 transport primitive category；面向 connection real adapter 的唯一桌面能力入口。 | 连接配置语义、target identity 语义、receive parsing、send result、task lifecycle、SCOE protocol、result/report/northbound 语义；旧 `src/api/common` 一一平移。 |
| `preload` | 最小 typed bridge；把 platform facade 允许的 transport capability 接到 main；订阅清理和 renderer 隔离边界。 | 裸 `invoke/send/on`、任意 channel 订阅、`window.electron` 大包、receive/send/task/SCOE/report/northbound business API。 |
| `main` | serial port、TCP socket、TCP server、UDP socket 等 native resource handle；资源生命周期；OS I/O；必要 buffer、batch、queue、throttle、backpressure、cleanup。 | frame matching、receive classification、send task state、SCOE completion、result attribution、report generation、northbound error conversion、customer device identity。 |
| `renderer` | 页面、feature 和 runtime 通过 `rewrite/src/platform` facade 与 connection public boundary 使用能力；只消费只读 snapshot、public service 或 runtime route。 | Node/Electron/`ipcRenderer`/`fs`/`path`/`net`/`serialport` 直连；直接订阅 raw preload event；直接持有 socket/serialport/platform handles。 |
| `connection` | transport config meaning、runtime connection facts、target availability、transport lifecycle、transport-level event/error/read model；real/fake adapter port。 | API channel/schema 定义权、业务帧解析、send 构帧、task 推进、SCOE 语义、result/report/northbound 语义、platform resource handle。 |
| `runtime` | app 级装配、connection service/adapter/subscription 创建和释放、跨 feature 路由、app shutdown cleanup、boundary exception registry。 | transport native resource 细节、receive parser、send builder、task lifecycle、SCOE protocol、report/northbound 语义、隐藏全局 event bus。 |

Key split:

- main owns live resource facts needed to operate handles.
- connection owns canonical renderer-side connection facts.
- runtime owns wiring and exception visibility.
- platform/preload own the bridge boundary, not business interpretation.

## 5. Allowed capability categories

本文只允许能力类别，不定义具体接口形状。

| Category | Allowed meaning | Consumer |
| --- | --- | --- |
| Bridge health metadata | bridge 是否存在、版本/能力类别健康、transport bridge 是否可用。 | app/platform/runtime |
| Serial discovery | 枚举可见 serial resource 候选和基础技术可用性。 | connection adapter |
| Transport lifecycle | serial open/close/cleanup、TCP client connect/close、TCP server listen/close/client cleanup、UDP bind/close。 | connection adapter |
| Byte input | serial/TCP/UDP 入站 bytes 的受控 batch 或 normalized transport input event。 | connection -> runtime -> receive |
| Byte output | transport-level bytes write request 和技术接收/失败材料。 | send/SCOE -> runtime/connection |
| Transport resource facts | connected、closed、resource unavailable、client accepted、remote route visible 等 transport facts。 | connection read model |
| Transport errors | open/connect/listen/bind/write/timeout/close/cleanup 等 transport-level error category。 | connection read model, status/pages |
| Subscription lifecycle | 订阅建立、释放、stale event 处理、app shutdown cleanup。 | runtime/platform/preload/main |
| Buffer/backpressure | 与 native resource 或性能压力绑定的 batch、queue、throttle、overflow/backpressure signal。 | main/platform/connection/runtime |
| Fake/real adapter substitution | fake adapter 继续用于 Vitest/fixture，real adapter 通过 platform facade 接入。 | connection tests/runtime |

Transport-specific allowance:

- Serial bridge 只作为 native port resource lifecycle 和 byte I/O。
- TCP client bridge 只作为 socket lifecycle 和 byte I/O。
- TCP server bridge 只作为 listener/client socket lifecycle 和 byte I/O。
- UDP bridge 只作为 socket bind、message、send、remote route transport material。

这些类别不授权 platform/main 定义连接配置 schema、target id 形状、receive 输入 schema、send result、task result、SCOE completion 或 northbound identity。

## 6. Forbidden surfaces

Forbidden:

- 禁止重新暴露 `window.electron` 大包。
- 禁止 renderer 可见裸 `invoke/send/on` 或任意 channel 订阅。
- 禁止 renderer 直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport`。
- 禁止 page、widget、feature 直接访问 preload bridge 细节或 main channel。
- 禁止 platform facade 复制旧 `src/api/common/serialApi.ts`、`networkApi.ts` 或旧 preload 文件形状。
- 禁止 main 解析 frame、匹配 receive、构造 send result、推进 task、解释 SCOE、生成 report 或转换 northbound error。
- 禁止 main 用 high-speed storage rule、receive rule 或 SCOE rule 决定 bytes 是否进入业务链路，除非有正式 runtime exception，且 business owner 和 exit condition 清楚。
- 禁止全窗口无差别广播 raw high-frequency bytes 作为目标设计。
- 禁止 connection public boundary 暴露 mutable state、store、socket、serialport、Electron object、raw channel 或 platform adapter。
- 禁止把 serial/network transport target 直接映射为 northbound `deviceId`、customer device 或 report delivery target。

Review stance:

- 重新引入上述 surface 的实现应判为 `revise-required`。
- 涉及真实 platform bridge 但未把本文列为 direct contract 或 boundary guard 的实现审查应判为 `blocked`。

## 7. Data flow boundary

Target flow:

```text
native resource in main
  -> resource lifecycle / byte I/O
  -> main-side buffer / batch / queue / backpressure when justified
  -> minimal typed preload bridge
  -> rewrite/src/platform facade
  -> connection real transport adapter
  -> connection service/state/read model
  -> runtime route or explicit feature event
  -> receive / send / SCOE / status public boundary
  -> feature-owned read model
  -> throttled UI snapshot
```

Rules:

- Low-frequency lifecycle/error facts and high-frequency byte input must use separate design lanes.
- Byte input reaches receive as transport bytes/batches plus source material. connection does not parse it.
- Byte output reaches main as transport write material. send/SCOE own business request and business result.
- Status may read connection summary, but does not own connection truth.
- Runtime may route bytes and writes, but does not inspect protocol semantics.
- UI consumes snapshots and commands, not raw transport events.

## 8. Event, buffer, and backpressure principles

Main may retain only these platform-side or performance-side processing categories:

- input byte batching for serial/TCP/UDP data.
- write queueing tied to a live native resource.
- subscription queueing and cleanup to prevent stale event delivery.
- bounded lifecycle/error event buffering for renderer synchronization.
- throttle or coalesce for high-frequency telemetry and UI-safe event delivery.
- overflow/backpressure signal when queue/batch policy is exceeded.
- resource cleanup drain on close, app shutdown or stale connection generation.

Rules:

- Queue depth、batch window、overflow/drop policy、sampling、UI refresh interval and target throughput are deferred to implementation/runtime evidence.
- Overflow must be observable as transport-level material, not silently converted into receive/send/task/result failure.
- Main may compress or batch events for transport pressure, but may not classify bytes as frame match、task trigger、SCOE success、report material or northbound delivery status.
- connection may maintain transport counters and recent event snapshots, but business statistics belong to receive/send/task/SCOE/status/result owners.
- Runtime exception records are required for high-frequency buffer/backpressure, high-speed storage short-circuit, packaged native module behavior and SCOE fixed route.
- Development-time fake adapter tests can simulate backpressure categories, but real steady-state behavior requires runtime/hardware validation after parameters are designed.

## 9. Error and lifecycle boundary

Principles:

- Main emits raw resource outcomes and technical failures.
- Platform/preload carry typed technical results without exposing raw IPC or raw handles.
- Connection normalizes transport-level lifecycle and error facts.
- Consumers interpret those facts under their own feature designs.

Lifecycle boundaries:

- connect、disconnect、cleanup and app shutdown must be idempotent enough for duplicate user actions, stale events and already-closed resources.
- Automatic reconnect is not assumed. If introduced, retry policy、cancellation、UI visibility and runtime/hardware validation must be declared separately.
- TCP server client lifecycle is transport availability material, not a business session.
- UDP remote route is transport route material, not a customer device identity.

Error boundaries:

- A transport write failure is input material for send/SCOE; it does not define task lifecycle.
- A disconnect or timeout is a connection fact; it does not define result/report/northbound failure.
- Missing resource, port unavailable, socket error or cleanup failure can be normalized by connection, but this document does not freeze error code names.
- User-visible error text belongs to pages/status projection and must not leak raw platform internals.

## 10. Connection consumption posture

Current connection fake loop remains valid as the first adapter contract layer:

- core stays pure TypeScript.
- service depends on adapter port.
- state/selectors expose immutable read models.
- fake adapter remains the fixture/Vitest implementation.

Future real adapter gate:

- real adapter may call only `rewrite/src/platform` transport capability categories accepted by an implementation design.
- real adapter must map platform technical material into existing connection service inputs without exposing platform resource handles.
- connection may consume discovery, lifecycle, byte input/output, transport error and backpressure material.
- connection must not bind to final preload/main schema in this architecture document.
- connection must not expose real adapter or platform facade to receive/send/task/SCOE/pages.

Cross-feature consumption:

- receive consumes byte batches and source material through runtime or explicit event.
- send/SCOE consume transport write capability and transport-level write outcome through public boundary.
- task consumes transport availability or send failure material only through task/send design.
- status consumes read-only connection summary.
- northbound has no direct serial/TCP/UDP target consumption in this design.

## 11. Validation plan

| Layer | Can prove | Cannot prove |
| --- | --- | --- |
| Static scan | 文档章节、direct contract、boundary guards、禁止面、renderer 无 raw Electron/Node 入口、platform 不复刻旧 API。 | 真实 I/O、event order、性能、硬件、打包态、客户闭环。 |
| Vitest unit | connection core lifecycle、config validation category、selector、state transition、error/event normalization。 | Electron runtime、preload/main、真实 serial/TCP/UDP。 |
| Fixture test | fake serial/TCP/TCP server/UDP event、target availability、stale event、write failure、cleanup、overflow simulation after policy exists。 | OS driver、socket timing、真实吞吐、真实断线。 |
| Fake adapter test | service/adapter contract under success、failure、duplicate close、disconnect during write、stale event。 | main/preload/platform bridge correctness。 |
| Runtime validation | Electron app startup/shutdown、bridge subscription cleanup、event ordering、fake/real adapter wiring、raw event storm replacement。 | 真实硬件链路、打包态 native module、客户交付。 |
| Package validation | packaged bridge loading、native module loading、resource path、extraResources、packaged runtime differences if touched。 | 业务算法、真实硬件时序、northbound customer closure。 |
| Hardware validation | real serial enumerate/open/close/reopen/send/receive/error/unplug；real TCP client/server/UDP connect/send/receive/close/error/timeout；high-frequency behavior after parameters are designed。 | package path、customer schema、HTTP/FTP delivery closure。 |
| Customer validation | 本设计不适用，只作为 blocker guard。 | 不能用 connection target 推导 northbound identity 或 customer acceptance。 |

Cannot claim from this design:

- real serial/TCP/UDP hardware chain complete.
- high-frequency steady-state complete.
- packaged transport bridge/native module behavior complete.
- SCOE fixed source/target complete.
- HTTP/FTP/northbound delivery complete.
- customer closure complete.

## 12. Implementation gate

进入真实 bridge implementation 前必须满足：

1. 实现轮重新列出 Direct contract / Boundary guards，并把本文列入 direct contract 或 boundary guard。
2. 明确本轮仅接受哪些 capability categories，不写超出当前轮的 schema、channel、DTO、payload 或错误码。
3. 明确 owner split：platform、preload、main、renderer、connection、runtime 各自改什么、不改什么。
4. 明确 real adapter 如何继续遵守 `ConnectionTransportAdapter` port，不暴露 platform/main resource handle。
5. 明确 lifecycle/error/event 的 source、normalization owner、consumer 和 cleanup 责任。
6. 明确 high-frequency queue/batch/backpressure 的设计状态：已设计、deferred 或 blocker。
7. 如 main 保留 buffer/backpressure、stream/file path、native module 或 package-sensitive 行为，必须登记 runtime boundary exception。
8. 明确 validation levels：Vitest/fake 能覆盖什么，runtime/package/hardware 必须验证什么。
9. 静态扫描确认 renderer 不直接访问 Node/Electron/raw IPC，preload 不暴露裸通道，main 不承载业务语义。
10. 未完成 runtime/package/hardware evidence 前，不声明真实连接链路验收完成。

不能进入 implementation 的情况：

- 需要 final API schema 才能判断边界。
- 需要 receive/send/task/SCOE/result/report/northbound 语义才能写 transport bridge。
- 需要 customer `deviceId` 或 northbound schema 才能解释 serial/network target。
- 缺少 queue/backpressure 策略却要声明 high-frequency steady-state accepted。
- 缺少 package/native module 验证计划却要触达 packaged bridge loading。

## 13. Deferred and blockers

Deferred:

- Concrete platform/preload/main/renderer schema、channel、method、DTO、payload、error code、enum。
- Concrete connection config model、target id representation、persistence shape and migration strategy。
- Queue depth、batch window、overflow/drop policy、sampling、UI refresh interval and target throughput。
- TCP `\\r\\n` split ownership: transport input normalization、receive compatibility rule or candidate drop。
- High-speed storage short-circuit boundary with storage/receive/runtime。
- Global `webContents` broadcast replacement and target window/subscriber scoping。
- Network status-change drift between old preload listener and main event evidence。
- Serial option update while connected and whether close/reopen remains visible behavior。
- UDP remote route representation, including IPv6 and duplicate route behavior。
- SCOE fixed TCP server / UDP source and target exception。
- Northbound `deviceId` and transport target separation in customer-facing flows。

Blockers for implementation:

- No accepted implementation design for concrete platform transport bridge capability categories.
- No high-frequency queue/batch/backpressure policy for claims beyond basic lifecycle.
- No package/native-module validation plan if implementation touches packaged bridge loading or native resources.
- No runtime plan for subscription cleanup, stale event handling and app shutdown cleanup.

Blockers for acceptance:

- Missing real serial/TCP/UDP validation blocks claiming hardware connection accepted.
- Missing runtime high-frequency evidence blocks claiming batching/backpressure accepted.
- Missing package validation blocks claiming packaged transport bridge/native module behavior accepted.
- Missing SCOE device evidence blocks claiming SCOE fixed source/target accepted.
- Missing customer schema/environment blocks claiming northbound delivery accepted.

## 14. Readiness verdict

`implementation-design-complete`, platform bridge code landed for serial + TCP/UDP.

Reason:

- Boundary owner split is explicit and implemented.
- Platform bridge (shared types + preload routing + main handlers + facade) 已落地并通过 build/lint/test。
- Real serial adapter 已接入 platform facade；TCP/UDP adapter 待 connection-complete feature。
- Runtime/hardware validation 待真实网络环境和硬件验证。
