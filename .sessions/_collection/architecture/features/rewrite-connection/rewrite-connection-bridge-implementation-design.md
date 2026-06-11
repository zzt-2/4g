---
doc_type: feature-design
feature: rewrite-connection
type: rewrite-connection-bridge-implementation-design
status: draft
date: 2026-05-06
summary: Implementation design for real serial/TCP client/TCP server/UDP platform bridge. This document moves the connection bridge from boundary design to implementable design by specifying event model, queue/backpressure principles, implementation responsibilities, port compatibility, validation plan and implementation readiness gate.
tags:
  - rewrite
  - connection
  - bridge
  - serial
  - tcp
  - udp
  - implementation-design
---

# Rewrite connection bridge implementation design

## 1. Direct contract

本设计只依据以下正式工件和当前实现事实判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/architecture/rewrite-system-architecture.md`
5. `codestable/architecture/rewrite-platform-api-surface-reduction.md`
6. `codestable/architecture/rewrite-connection-transport-boundary.md`
7. `codestable/architecture/rewrite-connection-platform-bridge.md`
8. `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
9. `codestable/quality/rewrite-quality-rules.md`
10. `codestable/quality/rewrite-review-checklist.md`
11. `codestable/features/rewrite-connection/rewrite-connection-design.md`
12. `codestable/features/rewrite-connection/rewrite-connection-checklist.yaml`
13. 当前实现：`rewrite/src/features/connection`（core、services、state、adapters）
14. 当前实现：`rewrite/src/platform`（facade stub）
15. 当前实现：`rewrite/src-electron/main`（bare window manager）
16. 当前实现：`rewrite/src-electron/preload`（metadata-only bridge）

Boundary guards：

- 本轮是 Lane B implementation design，只产出 design + checklist 更新，不实现代码。
- 不实现 serial、TCP client、TCP server 或 UDP 真实平台链路。
- 不冻结 channel、method、DTO、字段、错误码或枚举。
- 不进入 receive、send、task、SCOE、result、report、northbound 实现。
- main 只承载平台 transport 资源、生命周期和必要 buffer/batch/queue/backpressure，不解释业务语义。
- renderer 不直接访问 Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport` 或旧 `window.electron`。
- serial/network transport target 不等于 northbound `deviceId`、业务设备身份、task、case 或 report delivery target。
- 不声明 hardware、package、HTTP/FTP、northbound 或 customer validation 完成。
- 旧 `src/`、`src-electron/`、`public/` 只作为 evidence、fixture 或 oracle 输入。
- 不读取或修改前端自动生成 types 文件。

## 2. Current implementation evidence

### 2.1 Connection adapter port

当前 `ConnectionTransportAdapter` 接口（`rewrite/src/features/connection/adapters/ports.ts`）定义：

| Method | Signature | Purpose |
| --- | --- | --- |
| `connect` | `(config: TransportConfig) => Promise<ConnectionAdapterCommandOutcome>` | 建立 transport 连接 |
| `disconnect` | `(connectionId: string) => Promise<ConnectionAdapterCommandOutcome>` | 断开指定连接 |
| `write` | `(request: TransportWriteRequest) => Promise<ConnectionAdapterCommandOutcome>` | 发送 bytes |
| `cleanup` | `() => Promise<ConnectionAdapterCommandOutcome>` | 释放所有连接 |
| `drainEvents` | `() => Promise<readonly ConnectionAdapterEvent[]>` | 拉取异步事件队列 |

`ConnectionAdapterEvent` 定义了 6 种事件类别：`connected`、`disconnected`、`data`、`write-accepted`、`write-failed`、`error`。

`TransportWriteRequest` 携带 `connectionId`、`bytes` 和可选 `targetId`。

`ConnectionResourceCandidate` 定义 discovery 输出：`kind`、`id`、`label`。

Judgement：该 port 接口已覆盖基本生命周期和字节 I/O，但缺少 discovery（枚举串口、发现网络资源）和 backpressure signal。real adapter 需要在遵守该 port 的同时通过 platform facade 补充 discovery 能力。

### 2.2 Fake adapter

`FakeConnectionTransportAdapter`（`fake-transport-adapter.ts`）提供：

- 成功和失败注入（`setFailure`、`clearFailures`）
- 外部事件推送（`pushData`、`pushError`、`pushClose`）
- 状态观察（`readStoredConfig`、`readWrittenBatches`）
- 所有 4 种 transport kind 的 config 接受和 lifecycle 模拟

Gap：fake adapter 目前不模拟 backpressure、discovery、TCP server 多 client 或 UDP remote route 变化。real adapter 到来前不需要改 fake adapter，但后续应补齐 backpressure 和 discovery 场景。

### 2.3 Platform/preload/main scaffold

| Layer | Current state | Gap for real bridge |
| --- | --- | --- |
| `platform-bridge.ts` | `RewritePlatformCapability = never`，只有 `getBridgeInfo()` | 需要定义 transport capability type |
| `platform/index.ts` | 只导出 `getRewritePlatformBridgeInfo()` | 需要 transport facade 方法 |
| `preload/index.ts` | 只暴露 `getBridgeInfo()` via contextBridge | 需要 transport IPC bridge |
| `main/index.ts` | bare BrowserWindow，无 IPC handler | 需要 transport resource handler |

### 2.4 Old implementation risk summary

基于子 agent 调查的旧代码证据：

| 风险类别 | 旧代码证据 | 严重程度 |
| --- | --- | --- |
| TCP `\r\n` 分包无跨 chunk 缓冲 | `networkHandlers.ts:466-493`，跨 segment 边界的 `\r\n` 丢失 | CRITICAL |
| 高速存储业务逻辑嵌入 transport handler | `networkHandlers.ts:509-516`，`shouldStore` 判断后短路 renderer | HIGH |
| 全窗口无差别广播 raw data | `serialHandlers.ts:532`、`networkHandlers.ts:598-608`，`getAllWindows()/getAllWebContents()` | HIGH |
| TCP server 不识别独立 client | `networkHandlers.ts:146-224`，client 按 index 而非稳定 ID | HIGH |
| 串口无 batching/throttling | `serialHandlers.ts:522-541`，每包直接 `webContents.send` | HIGH |
| receive 全局处理锁 + 无界队列 | `receiveFramesStore.ts:806-904`，单锁序列化所有连接 | HIGH |
| 无 renderer-to-main backpressure | 无任何流控信号 | HIGH |
| `Array.from(data)` 序列化开销 | `networkHandlers.ts:603`，每包创建 number[] | MEDIUM |
| Promise double-resolve | `networkHandlers.ts:85-141`，timeout/error 可能双重 resolve | MEDIUM |
| `network:statusChange` 死通道 | preload 注册但 main 从未 emit | MEDIUM |
| UDP remote host 字符串解析脆弱 | 三处 split(':')，IPv6 不兼容 | MEDIUM |
| `autoReconnect` 配置无实现 | 类型定义存在但无代码 | LOW |

这些风险只作为新桥接实现的反面证据，不作为目标架构。

## 3. Real bridge implementation responsibilities

### 3.1 Owner split

| Owner | Real bridge implementation owns | Must not own |
| --- | --- | --- |
| `main` | serial port handle、TCP socket、TCP server、UDP socket 等 native resource handle；资源生命周期；OS I/O；per-connection input byte batching；write queue per live resource；subscription cleanup；bounded lifecycle/error event buffer；backpressure signal 当 queue 超限时；app shutdown resource drain | frame matching、receive classification、send task state、SCOE completion、result attribution、report generation、northbound error conversion、business device identity、TCP line splitting protocol semantics |
| `preload` | 最小 typed bridge，把 platform 允许的 transport capability 接到 main；IPC invoke 包装和 event subscription 管理；renderer 隔离边界 | 裸 `invoke/send/on`、任意 channel 订阅、`window.electron` 大包、业务 API |
| `platform` facade | renderer 侧 transport primitive 入口；discovery（枚举串口）、lifecycle command（connect/disconnect/cleanup）、byte I/O（write request）、event drain（拉取 main 缓冲事件）、backpressure query | 连接配置语义、target identity 语义、receive parsing、send result、task lifecycle |
| `connection` real adapter | 遵守 `ConnectionTransportAdapter` port；调用 platform facade transport primitive；把 platform technical material 映射为已有 connection service 输入；不暴露 platform resource handle | platform resource handle 直接暴露、API schema 定义权、业务帧解析 |
| `connection` service/state/core | 不变——real adapter 通过同一 port 接口接入，service/state/core 无需修改 | 任何因 real adapter 而增加的平台依赖 |

### 3.2 Key split

- main owns live resource facts needed to operate handles。
- connection owns canonical renderer-side connection facts。
- platform/preload own the bridge boundary, not business interpretation。
- runtime owns wiring and exception visibility。

## 4. Port compatibility with fake adapter

Real adapter 必须遵守 `ConnectionTransportAdapter` port 接口，不修改 port 定义。

### 4.1 Port compatibility rules

| Adapter method | Real adapter behavior | Fake adapter equivalent | Compatibility constraint |
| --- | --- | --- | --- |
| `connect(config)` | 通过 platform facade 调用 main IPC，main 创建 native resource | 内存 Map 记录 config | 接受相同的 `TransportConfig` 四种 kind；返回相同 `ConnectionAdapterCommandOutcome` |
| `disconnect(id)` | 通过 platform facade 通知 main 关闭 native resource | 从 Map 删除 | 对已关闭资源返回 accepted with `disconnected` event；对不存在资源也返回 accepted（幂等） |
| `write(request)` | 通过 platform facade 发送 bytes 到 main | 记录到 writes Map | 返回 `write-accepted` 或 `write-failed`；携带 `byteLength` |
| `cleanup()` | 通过 platform facade 通知 main 关闭所有资源 | 清空 Map | 返回所有断开连接的 `disconnected` events |
| `drainEvents()` | 从 platform facade 拉取 main 缓冲的异步事件 | 从 eventQueue splice | 返回 `ConnectionAdapterEvent[]`；real adapter 的 main 缓冲等同 fake adapter 的 eventQueue |

### 4.2 Gaps requiring port extension or platform supplement

| Gap | Resolution strategy | Port change required |
| --- | --- | --- |
| Discovery（枚举串口） | platform facade 提供 `discoverResources(kind)` 方法，real adapter 在 connect 前调用；fake adapter 用 fixture 数据 | 不修改 port，discovery 在 adapter 外部通过 platform facade 完成 |
| Backpressure signal | main 在 queue 超限时 emit backpressure event category；real adapter 的 `drainEvents()` 返回该事件；fake adapter 通过 `pushError` 模拟 | 不修改 port，backpressure 作为新 `ConnectionAdapterEventKind` 或 `TransportErrorKind`；这是 schema 冻结前的候选类别 |
| TCP server multi-client | main 为每个 accepted client 生成独立 connection material；real adapter 把每个 client 作为独立 `connected` event | 不修改 port，但 connection service 需要处理多 client 场景 |
| UDP remote route change | main 在 remote route 可见性变化时 emit transport fact event | 不修改 port |

### 4.3 Fake adapter extension plan

Real adapter 到来前不需要改 fake adapter。但后续实现应补齐以下 fake adapter 场景：

- backpressure 模拟：push backpressure event，让 service 测试 queue full 行为
- discovery 模拟：提供 `setResourceCandidates` 方法
- TCP server multi-client 模拟：`pushClientConnected`、`pushClientDisconnected`
- UDP remote route 变化模拟

这些扩展不阻塞 real adapter 实现，但应在 real adapter 实现后逐步补齐。

## 5. Event model

### 5.1 Event classification

Transport events 分为三类：lifecycle、data、backpressure/signal。

| Category | Events | Frequency | Producer | Consumer | Design lane |
| --- | --- | --- | --- | --- | --- |
| Lifecycle | connected、disconnected、error（open-failed、connect-failed、listen-failed、bind-failed、timeout、close-failed、resource-unavailable、stale-event、invalid-config） | Low | main resource handler -> preload bridge -> platform facade -> connection adapter -> connection service | connection state、status read model、pages | Direct event delivery，no batching needed |
| Data | data（incoming bytes with connectionId、byteLength、source target） | High | main byte input handler -> batching in main -> preload bridge -> platform facade -> connection adapter drainEvents | connection service -> runtime route -> receive | Batched delivery，main-side buffer，separate from lifecycle |
| Backpressure/Signal | queue-full、queue-drained、write-backpressure（write queue full） | Low-Medium | main buffer management | connection adapter、runtime、status | Event-based signal，不自动转成业务错误 |

### 5.2 Event flow

```text
Main process:
  native resource event (serial data / socket data / socket close / socket error)
    -> main-side per-connection buffer:
       - lifecycle/error: immediate -> bounded lifecycle event queue
       - data: accumulate in byte batch buffer until window or flush trigger
    -> backpressure check:
       - if batch buffer exceeds threshold: emit queue-full signal
    -> typed event delivery to preload bridge

Preload bridge:
  receives main events via IPC
  -> lifecycle events: immediate forward
  -> data events: forward batch as single event
  -> backpressure signals: forward as event

Platform facade (renderer):
  wraps preload bridge API
  -> exposes drainEvents() for connection adapter
  -> exposes lifecycle command methods (connect/disconnect/write/cleanup)

Connection real adapter:
  implements ConnectionTransportAdapter port
  -> drainEvents() pulls from platform facade
  -> maps platform events to ConnectionAdapterEvent[]
  -> no platform handle leakage

Connection service:
  consumes adapter events via existing service logic
  -> routes data events to runtime for receive
  -> updates connection state for lifecycle events
  -> updates transport counters for all events
```

### 5.3 Event ordering rules

- 同一 connectionId 的 lifecycle 和 data 事件必须保序。
- 不同 connectionId 的事件可以交错，不需要全局序列号。
- `connected` event 必须在 data event 之前到达 service。
- `disconnected` event 后不应有同 connectionId 的 data event；若出现，connection service 标记为 `stale-event`。
- `write-accepted` 和 `write-failed` 是 command response 的一部分，不是异步 event queue 内容。
- Backpressure signal 不中断事件顺序，只是状态标记。

### 5.4 Subscription lifecycle

```text
Runtime startup:
  -> create connection service with real adapter
  -> adapter subscribes to platform facade event channel
  -> platform facade registers preload event listener

Connection connect:
  -> service calls adapter.connect(config)
  -> adapter calls platform facade connect command (IPC invoke to main)
  -> main creates native resource, starts buffering
  -> main emits 'connected' event via preload bridge
  -> adapter drainEvents() picks up 'connected'

App shutdown / page close:
  -> runtime calls service.cleanup()
  -> adapter calls platform facade cleanup command
  -> main drains all resources, closes handles
  -> platform facade removes event listener
  -> stale events after cleanup are discarded by adapter
```

## 6. Queue / backpressure / batching principles

### 6.1 Principles

本节只定原则和验证点，不写最终参数。

| Principle | Rationale | Verification point |
| --- | --- |--- |
| Main-side per-connection byte batch buffer | 减少 IPC 消息数量，避免旧系统的逐包穿透 | 验证 serial 115200 baud 和 TCP 高频场景下 IPC 消息速率下降 |
| Bounded batch buffer with flush trigger | 防止 batch buffer 无界增长 | 验证 buffer 达到上限时自动 flush，不等待时间窗口 |
| Time-window flush for low-frequency data | 低频数据不应因 batch 而延迟过长 | 验证空载或低频场景下 data event 在合理时间内到达 renderer |
| Bounded async event queue with overflow signal | eventQueue 不可无界 | 验证 queue 超限时 backpressure signal 到达 connection adapter |
| Overflow must be observable transport material | 丢弃不是静默行为 | 验证 overflow event 包含丢弃的 connectionId 和 byte count |
| Per-connection queue isolation | 一个连接的背压不应阻塞其他连接 | 验证 serial 和 TCP 同时高频时，serial 背压不影响 TCP 事件 |
| Main does not classify bytes | main 只做 buffer/batch/queue，不判断 frame content | 验证 main handler 代码不包含 frame matching、SCOE rule 或 receive classification |
| Overflow must not auto-convert to business error | 丢弃是 transport material，receive/send/task 自己决定业务含义 | 验证 overflow event 不进入 receive 作为 parse failure |

### 6.2 Batch buffer design lane

```text
Main per-connection byte input:
  native data callback
    -> append to per-connection byte buffer
    -> if buffer size >= maxBatchBytes: flush immediately
    -> else if time since last flush >= maxBatchWindowMs: flush
    -> flush: emit single 'data' event with accumulated bytes + source info
    -> if event queue depth >= maxQueueDepth: emit queue-full signal, apply drop policy
    -> drop policy candidate: drop oldest batch (latest data is more relevant for real-time systems)
```

具体参数（maxBatchBytes、maxBatchWindowMs、maxQueueDepth）在 implementation 阶段根据 runtime evidence 和 hardware testing 确定。

### 6.3 Write queue design lane

```text
Main per-connection write:
  write request from renderer
    -> if native resource is live: write bytes directly
    -> if write callback indicates backpressure (drain event): queue subsequent writes
    -> if write queue exceeds threshold: return write-backpressure to adapter
    -> on drain: flush queued writes
```

Write queue 与 input queue 独立管理，互不影响。

### 6.4 What must NOT happen

- 不可让 main 根据 byte content 决定 data 是否进入 renderer（旧 high-speed storage short-circuit 模式）。
- 不可让 batch window 导致低频数据无限延迟。
- 不可让 eventQueue 无界增长（旧 receiveFramesStore 模式）。
- 不可让一个连接的背压阻塞其他连接的事件传递（旧全局 processingLock 模式）。
- 不可让 renderer-to-main 的 IPC round-trip 成为每包处理的瓶颈（旧 receiveHandler invoke 模式）。

## 7. Error and lifecycle mapping

### 7.1 Lifecycle state mapping

| Native event | Main emits | Adapter maps to | Connection lifecycle status |
| --- | --- | --- | --- |
| Serial port open success | connected event with target snapshot | `ConnectionAdapterEvent { kind: 'connected' }` | `connected` |
| TCP socket connect success | connected event with target snapshot | `ConnectionAdapterEvent { kind: 'connected' }` | `connected` |
| TCP server listen success | connected event with listener target snapshot | `ConnectionAdapterEvent { kind: 'connected' }` | `connected` |
| UDP bind success | connected event with local bind target | `ConnectionAdapterEvent { kind: 'connected' }` | `connected` |
| TCP server client accepted | connected event with client target snapshot | `ConnectionAdapterEvent { kind: 'connected' }` + new target | `connected` for server, new target available |
| Native resource close | disconnected event | `ConnectionAdapterEvent { kind: 'disconnected' }` | `disconnected` |
| Native resource error | error event with error kind | `ConnectionAdapterEvent { kind: 'error' }` | `error` |
| User disconnect request | disconnected event after resource close | `ConnectionAdapterEvent { kind: 'disconnected' }` | `disconnected` |
| App shutdown | cleanup drains all resources | multiple `disconnected` events | all `disconnected` |
| Stale event after cleanup | discarded by adapter | not mapped | no change |

### 7.2 Error kind mapping

| Native error | Main emits error kind | Adapter maps to `TransportErrorKind` |
| --- | --- | --- |
| Serial port not found | `resource-unavailable` | `resource-unavailable` |
| Serial open rejected by OS | `open-failed` | `open-failed` |
| TCP connect refused/timeout | `connect-failed` or `timeout` | `connect-failed` or `timeout` |
| TCP server bind failed | `listen-failed` | `listen-failed` |
| UDP bind failed | `bind-failed` | `bind-failed` |
| Write to closed socket | `write-failed` + `resource-unavailable` | `write-failed` |
| Socket unexpected close | `disconnected` + optional error | `disconnected` |
| Serial device unplug | `disconnected` + error | `disconnected` + error |

### 7.3 Error boundary rules

- Transport error 只作为 connection fact 或 consumer input material。
- Write failure 只向 send/SCOE 提供 transport-level material，send/task/SCOE 自己决定业务含义。
- Disconnect 或 timeout 是 connection fact，不直接定义 result/report/northbound failure。
- Error visibility 属于 connection pages/status read model；UI 显示 sanitized summary，不泄漏 platform resource internals。
- 不让 main 根据 error kind 决定 task lifecycle、SCOE completion 或 report semantics。

## 8. Main / preload / platform / connection forbidden surfaces

### 8.1 Main forbidden surfaces

- 禁止解析 frame、匹配 receive、构造 send result、推进 task、解释 SCOE、生成 report 或转换 northbound error。
- 禁止用 high-speed storage rule、receive rule 或 SCOE rule 决定 bytes 是否进入 renderer。
- 禁止全窗口无差别广播 raw high-frequency bytes。
- 禁止在 main handler 中做 TCP `\r\n` 分包——这是协议语义，归 receive/connection design。
- 禁止在 main 中维护业务统计（frame match count、task progress、SCOE completion count）。
- 禁止使用 `webContents.getAllWebContents()` 无差别广播。

### 8.2 Preload forbidden surfaces

- 禁止暴露裸 `invoke/send/on` 或任意 channel 订阅。
- 禁止暴露 `window.electron` 大包。
- 禁止暴露 receive processing、high-speed storage rule、task command、SCOE command 或 report API。
- 禁止在 preload 中做任何数据转换或协议判断。

### 8.3 Platform facade forbidden surfaces

- 禁止复制旧 `src/api/common/serialApi.ts` 或 `networkApi.ts` 的一一映射。
- 禁止暴露 raw socket、serialport handle 或 IPC channel 名。
- 禁止定义连接配置 schema、target id 格式或业务错误码。
- 禁止持有 mutable connection state。

### 8.4 Connection adapter forbidden surfaces

- 禁止暴露 platform resource handle、raw IPC channel 或 main process object。
- 禁止 import Node.js、Electron 或 serialport。
- 禁止解析 frame content、匹配 receive 或决定 task lifecycle。
- 禁止绑定到最终 preload/main schema 的具体 channel 名或 method 名——adapter 只通过 platform facade 抽象层交互。

### 8.5 Connection service/state/core forbidden surfaces

- 不因 real adapter 而增加任何平台依赖。
- core 保持纯 TypeScript，不 import Vue、Pinia、Electron、platform、Node、socket 或 serialport。

## 9. Native dependency and packaged validation risk

### 9.1 Native dependency risks

| Dependency | Risk | Evidence | Mitigation |
| --- | --- | --- | --- |
| `serialport` + `@serialport/bindings-cpp` | C++ native addon 需要针对 Electron 35 重新编译 | 旧项目 `serialport@10.5.0`，Electron 35 使用较新 V8 | 升级到 serialport 12.x 或验证 rebuild 成功 |
| `electron-rebuild` | 旧项目有 `electron-rebuild@^3.2.9`，rewrite 无 | `rewrite/package.json` 无 rebuild script | 添加 `@electron/rebuild` devDep 和 rebuild script |
| Vite bundler externalization | 旧项目在 `rollupOptions.external` 中排除 serialport，rewrite 无 | `rewrite/quasar.config.ts` 无 external 配置 | 添加 serialport 相关 package 到 Vite external |
| `asarUnpack` | `asar: true` 但无 `asarUnpack` 配置 | `rewrite/quasar.config.ts:59` | 添加 `asarUnpack: ['**/*.node', '**/@serialport/**']` |
| Port enumeration | 旧项目用 Windows-only PowerShell registry query | `serialHandlers.ts:51-123` | 使用 `SerialPort.list()` API 实现跨平台枚举 |
| Build target | 旧项目支持 Windows (nsis)，rewrite 只有 Linux | `rewrite/quasar.config.ts` builder config | 若需 Windows 支持，添加 win target |

### 9.2 Validation checkpoint matrix

| Checkpoint | Package validation required | Hardware validation required | When to validate |
| --- | --- | --- | --- |
| serialport native module rebuild | YES | NO | 添加 serialport dep 后首次 build |
| Vite externalization | YES | NO | 修改 quasar.config.ts 后 |
| asar unpack configuration | YES | NO | 配置 asarUnpack 后 |
| Packaged app serial port loading | YES | YES | 首次 packaged build 后 |
| Real serial port enumerate | NO | YES | 开发态即可开始 |
| Real serial port open/close/read/write | NO | YES | 开发态即可开始 |
| Real TCP client connect/send/receive | NO | YES | 开发态即可开始 |
| Real TCP server listen/client accept/multi-client | NO | YES | 开发态即可开始 |
| Real UDP bind/send/receive/remote route | NO | YES | 开发态即可开始 |
| High-frequency batch/backpressure under real load | NO | YES | batch 参数确定后 |
| Cross-platform (Windows + Linux) serial behavior | NO | YES | Windows target 添加后 |

### 9.3 Validation sequencing

```text
Phase 1: Native dependency setup (package validation)
  -> add serialport dep
  -> add electron-rebuild script
  -> add Vite external
  -> verify dev-mode build succeeds
  -> verify dev-mode serial enumerate works

Phase 2: Basic lifecycle (hardware validation, dev mode)
  -> real serial open/close
  -> real TCP client connect/close
  -> real TCP server listen/client accept/close
  -> real UDP bind/close

Phase 3: Byte I/O (hardware validation, dev mode)
  -> real serial write/receive
  -> real TCP send/receive
  -> real UDP send/receive

Phase 4: High-frequency and backpressure (hardware validation)
  -> batch buffer behavior under load
  -> queue overflow and backpressure signal
  -> multi-connection isolation

Phase 5: Packaged app (package validation)
  -> packaged build with serialport
  -> verify asarUnpack works
  -> verify packaged app serial enumerate
  -> verify packaged app full lifecycle

Phase 6: Multi-platform (if Windows target needed)
  -> Windows serial enumerate
  -> Windows packaged app behavior
```

## 10. Runtime / package / hardware validation plan

### 10.1 Runtime validation

| Item | What to verify | Evidence needed |
| --- | --- | --- |
| App startup/shutdown wiring | connection service 和 adapter 正确创建和释放 | dev app 启动后连接状态正确，关闭后无泄漏 |
| Platform subscription cleanup | preload event listener 在 cleanup 后移除 | cleanup 后不再收到 stale event |
| Event ordering | connected before data, no data after disconnected | serial 和 TCP 连接后收发验证 |
| Fake/real adapter wiring | runtime 可在 fake 和 real adapter 间切换 | test env 用 fake, production 用 real |
| Batch buffer flush | 低频数据不因 batch 而无限延迟 | 单次发送后 data event 在合理时间内到达 |
| Multi-connection isolation | 多连接互不阻塞 | serial + TCP 同时高频收发 |

### 10.2 Hardware validation

| Transport | What to verify | Minimum evidence |
| --- | --- | --- |
| Serial | enumerate、open、close、reopen、write、receive、error、unplug | 至少一种真实串口设备的完整 lifecycle 记录 |
| TCP client | connect、send、receive、close、error、timeout | 对真实 TCP server 的完整 lifecycle 记录 |
| TCP server | listen、client accept、multiple client、per-client data、broadcast、client disconnect、server close cleanup | 至少 2 个 client 同时连接的记录 |
| UDP | bind、message、send、remote host route、broadcast candidate | 对真实 UDP target 的完整 lifecycle 记录 |
| High-frequency | batch behavior、queue overflow、backpressure signal、UI snapshot stability | 至少 baud rate 115200 serial 和 TCP 高频场景的吞吐和 UI 记录 |

### 10.3 Package validation

| Item | What to verify | Evidence needed |
| --- | --- | --- |
| Native module loading | packaged app 中 serialport 能正确 load | packaged app 启动不报 native module 错误 |
| asarUnpack | .node 文件在 asar 外可访问 | 检查 packaged app 解压后 asar.unpack 目录 |
| Resource path | packaged app 中 path resolve 正确 | packaged app 中 data path 可写 |
| Build target | Linux AppImage 和 deb 正确包含 native module | 安装 packaged app 后 serial enumerate 正常 |

## 11. Implementation readiness gate

### 11.1 Gate criteria

进入 real bridge implementation 前必须满足：

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| G1 | 实现轮重新列出 Direct contract / Boundary guards，并把本文列入 direct contract | 待满足 | 实现轮首行声明 |
| G2 | 明确本轮仅接受哪些 capability categories | 待满足 | 实现轮列出 discovery、lifecycle command、byte I/O、event drain、backpressure signal |
| G3 | 明确 owner split | 已满足 | 本文 §3 |
| G4 | 明确 real adapter 如何遵守 `ConnectionTransportAdapter` port | 已满足 | 本文 §4 |
| G5 | 明确 lifecycle/error/event 的 source、normalization owner、consumer 和 cleanup 责任 | 已满足 | 本文 §5、§7 |
| G6 | 明确 high-frequency queue/batch/backpressure 的设计状态 | 已满足（principle only） | 本文 §6，参数待 implementation/runtime evidence |
| G7 | 如 main 保留 buffer/backpressure，必须登记 runtime boundary exception | 已满足 | 本文 §6 即为 exception registry entry |
| G8 | 明确 validation levels | 已满足 | 本文 §9、§10 |
| G9 | 静态扫描确认 renderer 不直接访问 Node/Electron/raw IPC | 待满足 | 实现后 static scan |
| G10 | 未完成 runtime/package/hardware evidence 前，不声明真实连接链路验收完成 | 已满足 | 本文 §10 明确各层级 |

### 11.2 Blockers

进入 implementation 后仍存在以下 blocker，不阻塞开始实现但阻塞宣称完成：

| Blocker | Blocks what | Unblock when |
| --- | --- | --- |
| 无 native dependency setup | packaged app serialport 行为 | 添加 serialport + electron-rebuild + Vite external + asarUnpack |
| 无 queue/batch/backpressure 参数 | high-frequency steady-state 声明 | runtime evidence 后确定参数 |
| 无 hardware test environment 记录 | hardware validation 声明 | 至少一种真实设备测试记录 |
| 无 Windows build target | Windows serial behavior 声明 | 添加 win target + 测试 |
| 无 TCP server multi-client hardware evidence | multi-client 声明 | 至少 2 client 硬件测试 |
| 无 high-speed storage short-circuit design | high-speed storage 与 transport 交互声明 | storage/receive/runtime 共同登记 exception |

### 11.3 Cannot enter implementation when

- 需要 final API schema（channel 名、method 名、DTO 字段）才能判断边界。
- 需要 receive/send/task/SCOE/result/report/northbound 语义才能写 transport bridge。
- 需要 customer `deviceId` 或 northbound schema 才能解释 serial/network target。
- 缺少 queue/backpressure 策略却要声明 high-frequency steady-state accepted。
- 缺少 package/native module 验证计划却要触达 packaged bridge loading。

## 12. Deferred / blockers

### 12.1 Deferred

- Concrete platform/preload/main schema、channel、method、DTO、payload、error code、enum。
- Concrete connection config model（serial 额外选项、TCP keepAlive/noDelay、UDP broadcast）。
- Queue depth、batch window、overflow/drop policy、sampling、UI refresh interval、target throughput。
- TCP `\r\n` split ownership：transport input normalization、receive compatibility rule 或 candidate drop。
- High-speed storage short-circuit boundary with storage/receive/runtime。
- Global `webContents` broadcast replacement 的 target window/subscriber scoping 具体实现。
- Network status-change drift resolution。
- Serial option update while connected 的 UX 策略。
- UDP remote route representation（IPv6、duplicate route）。
- SCOE fixed TCP server / UDP source/target exception。
- Northbound `deviceId` and transport target separation。
- `autoReconnect` 策略（retry policy、cancellation、UI visibility）。
- Fake adapter backpressure/discovery/multi-client 扩展。

### 12.2 Blockers for implementation

- 无 accepted implementation design：本文即为此 gate，接受后解除。
- 无 native dependency setup：添加 serialport + rebuild + external + asarUnpack 后解除。

### 12.3 Blockers for acceptance

- Missing real serial/TCP/UDP validation blocks claiming hardware connection accepted。
- Missing runtime high-frequency evidence blocks claiming batching/backpressure accepted。
- Missing package validation blocks claiming packaged transport bridge/native module behavior accepted。
- Missing SCOE device evidence blocks claiming SCOE fixed source/target accepted。
- Missing customer schema/environment blocks claiming northbound delivery accepted。

## 13. Readiness verdict

`ready-for-bridge-implementation`，subject to gate criteria in §11.1。

Reason：

- Boundary owner split 已明确（§3）。
- Event model 已分类（§5）。
- Queue/backpressure principles 已定（§6），参数待 runtime evidence。
- Port compatibility 已分析（§4），real adapter 可遵守现有 port。
- Error and lifecycle mapping 已定义（§7）。
- Forbidden surfaces 已列出（§8）。
- Native dependency risk 已识别（§9.1）。
- Validation plan 已分层（§10）。
- Implementation readiness gate 已定义（§11）。
- Current rewrite implementation 有 fake connection contracts 和 adapter port，但无 real platform bridge。
- Real bridge implementation 可基于本文开始，前提是满足 §11.1 的 gate criteria 和 §11.2 的 blocker 前置条件。
