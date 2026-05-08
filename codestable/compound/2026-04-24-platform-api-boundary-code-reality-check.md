---
doc_type: explore
type: spike
date: 2026-04-24
slug: platform-api-boundary-code-reality-check
topic: Electron main / preload / renderer common API boundary code reality checkpoint
scope: src-electron main IPC handlers, preload API exposure, renderer common API wrappers, window.electron call points
keywords:
  - electron
  - platform-api
  - preload
  - contextIsolation
  - contextBridge
  - ipc
status: active
confidence: high
---

# Platform API boundary code reality checkpoint

## Context recap

本文件是独立的 `Platform API boundary code reality checkpoint`，只记录当前 Electron main / preload / renderer common API 的真实分层、调用方向、复杂度和风险。它不是 cleanup plan，不是 implementation plan，也不是长期 decision。

本轮已遵守的边界：

- 不改业务代码。
- 不重构。
- 不关闭 `contextIsolation`。
- 不删除 preload / common API wrapper。
- 不把本线塞进 1A / 1B / 1C cleanup。
- 不把 owner inclination 写成已拍板 decision。

前置文档已经明确：Platform API boundary 是独立 deferred 线，是否保留 `contextIsolation` / `contextBridge`、renderer 是否继续经 `src/api/common/*Api.ts` 间接访问、main 是否存在依赖 preload API 的倒挂，都需要 dedicated analysis / decision 后再处理。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:68-90`

`Code reality check before 1A cleanup plan` 也把进入 `receiveAPI` wrapper、preload API、IPC handler 或 Electron isolation 设置列为 Platform API 停线条件。`easysdd/compound/2026-04-24-code-reality-check-before-1a-cleanup-plan.md:177-190`

速答：

```mermaid
flowchart LR
  R[Renderer stores / composables] --> C[src/api/common/*Api.ts]
  C --> W[window.electron.*]
  W --> P[src-electron/preload/api/*]
  P --> I[ipcRenderer invoke / send / on]
  I --> M[src-electron/main/ipc/*Handlers.ts]
  M --> N[Main process Node / Electron capability]
  N -.events.-> E[webContents.send]
  E --> P2[preload ipcRenderer.on]
  P2 --> C2[renderer common listener wrapper]
  C2 --> R2[renderer callback]
```

当前真实分层基本成立，但不是干净分层：

- 大多数调用方向是 renderer common wrapper -> `window.electron` -> preload API -> IPC -> main handler。
- 存在明确局部倒挂：3 个 main handler import `src-electron/preload/api/path` 的 `pathAPI`。
- 存在重复 wrapper：common 层大量做 `window.electron` 可用性检查、fallback、`deepClone`；preload 层大量做 IPC channel adapter。
- 重复 wrapper 不是同质问题：serial/network/timer 的 listener wrapper 承担事件生命周期；files/network/serial/history 等 API 暴露了较宽平台能力。
- 当前启用 `contextIsolation: true` 和 `nodeIntegration: false`，但 `sandbox: false`；这说明隔离存在，但 bridge 暴露面仍需单独评估。

## Current platform API layers

当前平台 API 至少有五层：

| Layer | Current files | Observed role |
| --- | --- | --- |
| Electron window / security config | `src-electron/main/window.ts`, `quasar.config.ts` | 配置 BrowserWindow、preload entry、context isolation、packaging resource 路径。 |
| Main IPC handlers | `src-electron/main/ipc/*Handlers.ts` | 注册 IPC channel，执行 Node/Electron 能力：串口、网络、文件、历史数据、高速存储、timer、window/menu。 |
| Preload exposure | `src-electron/preload/index.ts`, `src-electron/preload/api/*` | 聚合 API，通过 `contextBridge` 暴露为 `window.electron`，多数方法转成 `ipcRenderer.invoke/send/on`。 |
| Global type bridge | `src-electron/types/electron-api.d.ts` | 把 `Window.electron` 类型绑定到 preload 聚合类型。 |
| Renderer common API wrappers | `src/api/common/*Api.ts` | renderer 侧 facade：检查 `window.electron`、做 fallback、部分 `deepClone`、向业务代码提供稳定入口。 |

Evidence:

- Quasar Electron main entry 指向 `src-electron/main/index.ts`，preload entry 指向 `src-electron/preload/index.ts`。`quasar.config.ts:222-230`
- Quasar 配置声明 preload script 名称为 `electron-preload`。`quasar.config.ts:235-236`
- BrowserWindow 配置了 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`，并指定 preload 文件路径。`src-electron/main/window.ts:28-39`
- main 初始化先创建窗口，再执行 `setupIPC()`。`src-electron/main/index.ts:29-33`
- `setupIPC()` 注册 window、menu、storage、serial、network、files、receive、highSpeedStorage、historyData、timerManager handlers。`src-electron/main/ipc/index.ts:12-22`
- preload 通过 `contextBridge.exposeInMainWorld('electron', api)` 暴露聚合 API。`src-electron/preload/index.ts:1-8`
- preload 聚合对象包含 `window/menu/autoLaunch/serial/network/files/dataStorage/path/receive/highSpeedStorage/historyData/timerManager`。`src-electron/preload/api/index.ts:1-34`
- `Window.electron` 类型直接来自 preload 聚合类型 `APIModules`。`src-electron/types/electron-api.d.ts:1-10`
- renderer common API 聚合导出系统、文件、串口、网络、路径、接收、数据存储、高速存储、历史数据和 timer API。`src/api/common/index.ts:1-34`

## Actual call direction

主调用方向：

1. renderer store / composable import `src/api/common`。
2. common wrapper 检查 `window.electron?.domain?.method`。
3. wrapper 调用 `window.electron.domain.method(...)`。
4. `window.electron` 方法来自 preload API。
5. preload API 调用 `ipcRenderer.invoke/send/on`。
6. main IPC handler 由 `createHandlerRegistry` 或直接 `ipcMain.on/handle` 注册。
7. main handler 调用 Node/Electron 能力。
8. 事件反向通过 `webContents.send` 到 preload `ipcRenderer.on`，再回调 renderer。

Representative chains:

- Receive parse: `receiveFramesStore -> receiveAPI.handleReceivedData -> window.electron.receive.handleReceivedData -> ipcRenderer.invoke('receive:handleReceivedData') -> receiveRegistry.register('handleReceivedData') -> matchDataToFrame/processReceivedData/applyDataProcessResult`。`src/stores/frames/receiveFramesStore.ts:1018-1024`, `src/api/common/receiveApi.ts:41-48`, `src-electron/preload/api/receive.ts:26-40`, `src-electron/main/ipc/receiveHandlers.ts:18-25`, `src-electron/main/ipc/receiveHandlers.ts:72-148`, `src-electron/main/ipc/receiveHandlers.ts:274-286`
- Serial data event: renderer common `serialAPI.onData` 调用 preload `ipcRenderer.on('serial:data')`；main 端 SerialPort data event 后向所有窗口 `webContents.send('serial:data')`。`src/api/common/serialApi.ts:67-72`, `src-electron/preload/api/serial.ts:75-101`, `src-electron/main/ipc/serialHandlers.ts:521-542`
- Network send: sender 使用 `networkAPI.send`，preload 映射 `network:send`，main handler 调用 `NetworkConnectionManager.sendData`，最终写 TCP/UDP socket。`src/composables/frames/sendFrame/useUnifiedSender.ts:228-235`, `src/api/common/networkApi.ts:37-45`, `src-electron/preload/api/network.ts:45-50`, `src-electron/main/ipc/networkHandlers.ts:346-447`, `src-electron/main/ipc/networkHandlers.ts:668-677`
- Data storage: renderer common 与 preload 都按 `DATA_PATH_MAP` 动态生成 API，IPC channel 前缀来自 basename，main 按同一映射注册 storage handler。`src/api/common/dataStorageApi.ts:38-89`, `src-electron/preload/api/dataStorage.ts:13-42`, `src-electron/main/ipc/dataStorageHandlers.ts:146-194`
- Timer: renderer 调用 `timerManagerAPI.register/start/...`，main 维护 TimerManager；tick 通过 `mainWindow.webContents.send(eventChannel)` 回到 preload `ipcRenderer.on(eventChannel)`。`src/api/common/timerManagerApi.ts:21-188`, `src-electron/preload/api/timerManager.ts:20-120`, `src-electron/main/ipc/timerManagerHandlers.ts:176-190`, `src-electron/main/ipc/timerManagerHandlers.ts:377-457`

Observed exceptions:

- `pathAPI` 不走 IPC；preload 直接用 Node `path` 和 `process.resourcesPath` 计算路径。`src-electron/preload/api/path.ts:1-18`
- `autoLaunch` 不走 main IPC handler；preload 直接 import Electron `app` 并调用 login item settings。`src-electron/preload/api/autolaunch.ts:1-20`
- 存在 renderer 直接访问 `window.electron.files.getFullPath` 的点，绕过 common wrapper。`src/composables/common/useFileDialog.ts:49`

## Renderer common API wrappers

Current responsibilities:

- 对业务层隐藏 `window.electron` 访问细节。
- 在 Electron API 不可用时返回 fallback。
- 对部分参数做 `deepClone`。
- 对事件订阅返回空 cleanup 或转发 preload cleanup。

Evidence:

- `systemApi.ts` 直接定义 `electronAPI = window.electron || fallback`，并为 window/menu/autoLaunch 再包一层方法。`src/api/common/systemApi.ts:7-22`, `src/api/common/systemApi.ts:25-87`
- `serialApi.ts` 对 open/setOptions 做 `deepClone`，对 listener 不可用返回空 cleanup，对多数失败返回 `{ success: false }`。`src/api/common/serialApi.ts:20-24`, `src/api/common/serialApi.ts:67-72`, `src/api/common/serialApi.ts:129-143`
- `networkApi.ts` 对 connect 做 `deepClone`，连接/发送失败 fallback 返回 `{ success: false, error }`。`src/api/common/networkApi.ts:18-25`, `src/api/common/networkApi.ts:37-45`
- `receiveApi.ts` 在 Electron receive API 不可用时返回 `success:false` 和 errors，并对 config cache 更新参数做 `deepClone`。`src/api/common/receiveApi.ts:21-48`, `src/api/common/receiveApi.ts:69-119`
- `filesApi.ts` 包装文件操作，保存 JSON 时 `deepClone(data)`，不可用时返回失败对象或空结果。`src/api/common/filesApi.ts:9-81`
- `dataStorageApi.ts` 和 preload 同样基于 `DATA_PATH_MAP` 动态生成 API，但 fallback 行为有 reject 与空数组混用。`src/api/common/dataStorageApi.ts:38-89`
- `pathApi.ts` fallback 返回 `Promise.resolve('') / Promise.resolve(false)`，而 Electron 正常路径返回同步值。`src/api/common/pathApi.ts:7-27`, `src-electron/preload/api/path.ts:11-18`

Reality:

- common wrapper 不只是“无意义重复层”；它确实承载了 fallback、clone 和兼容入口。
- common wrapper 也不是一个严格干净的 boundary；fallback 语义不一致，且已有直接 `window.electron` 调用绕过它。
- `src/api/common` 名称容易让人误读为跨运行时通用 API；代码现实是它高度依赖 `window.electron`。

## Preload exposure surface

Current exposure:

- `window.electron.window`
- `window.electron.menu`
- `window.electron.autoLaunch`
- `window.electron.serial`
- `window.electron.network`
- `window.electron.files`
- `window.electron.dataStorage`
- `window.electron.path`
- `window.electron.receive`
- `window.electron.highSpeedStorage`
- `window.electron.historyData`
- `window.electron.timerManager`

Evidence:

- 以上模块由 preload `apiModules` 一次性聚合并暴露。`src-electron/preload/api/index.ts:14-31`
- preload 只在 `process.contextIsolated` 为真时调用 `contextBridge.exposeInMainWorld`；关闭 isolation 后当前代码不会自动用同样路径注入 `window.electron`。`src-electron/preload/index.ts:5-8`

Notable exposure characteristics:

- `serial` 暴露打开、关闭、写入、读取、修改参数、清缓冲和多类事件订阅。`src-electron/preload/api/serial.ts:20-68`, `src-electron/preload/api/serial.ts:75-124`, `src-electron/preload/api/serial.ts:219-241`
- `network` 暴露 TCP client、TCP server、UDP bind、发送、状态和事件订阅。`src-electron/preload/api/network.ts:25-64`, `src-electron/preload/api/network.ts:71-123`
- `files` 暴露目录列表、路径拼接、目录创建、JSON 读写删除、文本读取。`src-electron/preload/api/files.ts:3-44`
- `dataStorage` 动态暴露 `list/save/delete/saveAll/export/import`。`src-electron/preload/api/dataStorage.ts:13-56`
- `receive` 暴露解析、映射校验、配置缓存更新和缓存状态查询。`src-electron/preload/api/receive.ts:18-122`
- `timerManager` 暴露 timer 注册/控制/批量操作/清理，并允许订阅自定义事件通道。`src-electron/preload/api/timerManager.ts:20-120`
- `path` 暴露通用 `resolve(...segments)` 和数据根。`src-electron/preload/api/path.ts:11-18`
- `autoLaunch` 直接在 preload 使用 Electron `app`，没有对应 main IPC handler。`src-electron/preload/api/autolaunch.ts:1-20`

## IPC handler surface

Main handler registration:

- `createHandlerRegistry` 会把 key 拼成 channel，并对每个 handler 调 `ipcMain.handle(channel, ...)`。`src/utils/common/ipcUtils.ts:27-42`
- window/menu 使用直接 `ipcMain.on/handle`。`src-electron/main/ipc/windowHandlers.ts:4-23`, `src-electron/main/ipc/menuHandlers.ts:4-11`

Handler capabilities by surface:

- Window/menu: 控制窗口关闭、最小化、最大化、菜单栏显示。`src-electron/main/ipc/windowHandlers.ts:4-23`, `src-electron/main/ipc/menuHandlers.ts:4-11`
- Serial: 使用 SerialPort、PowerShell registry 查询、串口打开/关闭/写入/读取/状态广播。`src-electron/main/ipc/serialHandlers.ts:5-19`, `src-electron/main/ipc/serialHandlers.ts:71-123`, `src-electron/main/ipc/serialHandlers.ts:130-214`, `src-electron/main/ipc/serialHandlers.ts:286-365`, `src-electron/main/ipc/serialHandlers.ts:580-636`
- Network: 使用 Node `net`/`dgram` 管理 TCP client、TCP server、UDP socket，并向 renderer 广播 connection/data events。`src-electron/main/ipc/networkHandlers.ts:17-19`, `src-electron/main/ipc/networkHandlers.ts:33-80`, `src-electron/main/ipc/networkHandlers.ts:85-292`, `src-electron/main/ipc/networkHandlers.ts:582-608`, `src-electron/main/ipc/networkHandlers.ts:668-677`
- Files: 对 renderer 传入路径直接 `readdir/mkdir/writeFile/readFile/unlink`。`src-electron/main/ipc/fileMetadataHandlers.ts:8-16`, `src-electron/main/ipc/fileMetadataHandlers.ts:41-59`, `src-electron/main/ipc/fileMetadataHandlers.ts:71-93`, `src-electron/main/ipc/fileMetadataHandlers.ts:105-112`
- Data storage: 按 `DATA_PATH_MAP` 生成 storage handlers，默认路径由 preload `pathAPI.getDataPath()` 拼出。`src-electron/main/ipc/dataStorageHandlers.ts:11-12`, `src-electron/main/ipc/dataStorageHandlers.ts:146-194`
- Receive: 在 main 进程读取 receive cache，调用 `src/utils/receive` 做帧匹配、解析和结果构造。`src-electron/main/ipc/receiveHandlers.ts:18-25`, `src-electron/main/ipc/receiveHandlers.ts:53-148`
- High speed storage: 管理写入流、业务数据目录、规则匹配、统计、reset 删除当前存储文件；network handler 会调用其 `storageManager`。`src-electron/main/ipc/highSpeedStorageHandlers.ts:20-24`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:248-266`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:350-362`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:485-500`, `src-electron/main/ipc/networkHandlers.ts:505-517`
- History data: 使用 `fs/path/zlib/dialog` 做小时数据读写、gzip、CSV 导出、删除和清理。`src-electron/main/ipc/historyDataHandlers.ts:5-31`, `src-electron/main/ipc/historyDataHandlers.ts:101-157`, `src-electron/main/ipc/historyDataHandlers.ts:159-192`, `src-electron/main/ipc/historyDataHandlers.ts:304-459`, `src-electron/main/ipc/historyDataHandlers.ts:476-554`
- Timer manager: main 内维护 timers，通过 `webContents.send` 发送 tick/custom event。`src-electron/main/ipc/timerManagerHandlers.ts:18-31`, `src-electron/main/ipc/timerManagerHandlers.ts:176-190`, `src-electron/main/ipc/timerManagerHandlers.ts:377-457`

Reality:

- IPC handler surface 不是单纯“业务调用桥”，而是本机文件、串口、网络、窗口、timer 和存储能力入口。
- 多数 handler 没有在本轮已读代码中体现 capability-level allowlist。例如 files handler 直接接收 path；network handler 直接接收 host/port/type。
- 这不等价于“必须关闭或保留隔离”，但说明后续 decision 必须同时看 bridge 暴露面和 handler 参数边界。

## contextIsolation / contextBridge current status

Current facts:

- `contextIsolation: true`。`src-electron/main/window.ts:29`
- `nodeIntegration: false`。`src-electron/main/window.ts:30`
- `sandbox: false`。`src-electron/main/window.ts:31`
- preload 文件通过 Quasar Electron preload build 入口生成。`quasar.config.ts:224-236`
- `contextBridge` 暴露只在 `process.contextIsolated` 为真时发生。`src-electron/preload/index.ts:5-8`

Implications supported by code:

- 当前 renderer 普通前端代码不应直接拥有 Node integration；它通过 `window.electron` 使用平台能力。
- 当前 preload 仍拥有 Electron/Node 能力，因为它 import `electron`、`path`、`ipcRenderer`、`app` 等模块。`src-electron/preload/index.ts:1-2`, `src-electron/preload/api/path.ts:1-18`, `src-electron/preload/api/autolaunch.ts:1-20`
- 关闭 `contextIsolation` 不是只改一个布尔值；当前 `preload/index.ts` 在隔离关闭时不会走 `contextBridge.exposeInMainWorld`，renderer common wrappers 大量依赖的 `window.electron` 路径可能变化。`src-electron/preload/index.ts:5-8`, `src/api/common/receiveApi.ts:41-48`, `src/api/common/networkApi.ts:22-25`

Not established:

- 不能从当前代码直接推出“隔离没用”。
- 也不能从当前代码直接推出“当前 bridge 面已足够安全，必须永久原样保留”。

## Complexity and maintenance costs

Observed costs:

1. Three places maintain the contract.
   - common method name, preload method name, IPC channel name, main handler name分散维护。`src/api/common/serialApi.ts:35-57`, `src-electron/preload/api/serial.ts:42-68`, `src-electron/main/ipc/serialHandlers.ts:596-620`

2. Naming is mostly regular but not uniform.
   - `serial.closeAll -> serial:close-all -> close-all`
   - `serial.sendData -> serial:send -> send`
   - `serial.getStatus -> serial:status -> status`
   - `network.onConnectionEvent -> network:connectionEvent event`

3. Type contract can drift.
   - common `receiveAPI.handleReceivedData` 声明 `updatedDataItems`。
   - main handler 也可能返回 `updatedDataItems`。
   - preload `receiveAPI.handleReceivedData` 返回类型没有声明该字段。`src/api/common/receiveApi.ts:25-35`, `src-electron/main/ipc/receiveHandlers.ts:40-46`, `src-electron/main/ipc/receiveHandlers.ts:141-145`, `src-electron/preload/api/receive.ts:30-38`

4. Fallback semantics are inconsistent.
   - serial listener fallback 返回 noop cleanup。`src/api/common/serialApi.ts:67-72`
   - receive fallback 返回 `success:false`。`src/api/common/receiveApi.ts:41-48`
   - dataStorage 部分不可用时 reject。`src/api/common/dataStorageApi.ts:51-71`
   - path fallback 返回 Promise，而正常 Electron path 是同步值。`src/api/common/pathApi.ts:7-27`, `src-electron/preload/api/path.ts:11-18`

5. Main/preload ownership is blurred.
   - main handler import preload `pathAPI`。`src-electron/main/ipc/dataStorageHandlers.ts:12`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:11`, `src-electron/main/ipc/historyDataHandlers.ts:22`

6. Some wrappers have real lifecycle behavior.
   - serial preload maps original callbacks to wrapped callbacks so `removeListener` can work。`src-electron/preload/api/serial.ts:4-8`, `src-electron/preload/api/serial.ts:75-101`
   - network/timer preload returns cleanup functions for event subscriptions。`src-electron/preload/api/network.ts:71-123`, `src-electron/preload/api/timerManager.ts:93-120`

Complexity conclusion:

- 当前复杂度是真实存在的，不是文档臆测。
- 当前复杂度不能简化成“wrapper 都可删”；至少事件 wrapper、fallback contract、typing contract、IPC naming contract 要分开评估。

## Security and packaging risks

Security facts:

- Current bridge exposes broad platform capabilities, not a minimal capability surface.
- Files handler accepts caller-provided paths and directly performs read/write/delete operations in the main process. `src-electron/main/ipc/fileMetadataHandlers.ts:8-16`, `src-electron/main/ipc/fileMetadataHandlers.ts:41-59`, `src-electron/main/ipc/fileMetadataHandlers.ts:71-93`
- Network handler lets renderer-provided config create TCP client, TCP server, or UDP socket. `src-electron/main/ipc/networkHandlers.ts:62-68`, `src-electron/main/ipc/networkHandlers.ts:85-118`, `src-electron/main/ipc/networkHandlers.ts:146-186`, `src-electron/main/ipc/networkHandlers.ts:229-269`
- Timer preload exposes custom event channel subscription. `src-electron/preload/api/timerManager.ts:105-120`
- High speed storage can write business data files and reset can delete current storage file. `src-electron/main/ipc/highSpeedStorageHandlers.ts:248-266`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:350-362`
- `pathAPI.resolve(...segments)` is exposed to renderer, making arbitrary path construction easier. `src-electron/preload/api/path.ts:11-18`

Packaging/resource facts:

- Electron builder enables `asar: true` while excluding `public/**/*` from asar and copying it as `extraResources` to `resources/public`。`quasar.config.ts:277-285`
- `pathAPI.getDataPath()` returns `process.resourcesPath/public` in packaged mode。`src-electron/preload/api/path.ts:3-15`
- history data, high speed storage, and data storage derive runtime data paths from that `pathAPI.getDataPath()` root。`src-electron/main/ipc/historyDataHandlers.ts:33-37`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:20-24`, `src-electron/main/ipc/dataStorageHandlers.ts:149-152`
- build config currently disables minify and enables source maps for debugging. `quasar.config.ts:68-82`

Risk conclusion:

- Keeping `contextBridge` does not by itself mean the platform API is minimal or safe; the bridge surface and handlers are broad.
- Closing or weakening isolation would expand the blast radius if renderer code is compromised, because the exposed capabilities include filesystem, network, serial, storage and timer controls.
- Packaging data under `resources/public` blurs static resources and runtime mutable data. This is a packaging/data-boundary observation, not a decision to move it in this checkpoint.

## Supported conclusions

The following conclusions are supported by code evidence:

1. Current primary call direction is renderer common wrapper -> `window.electron` -> preload API -> IPC -> main handler.
   - Evidence: `src/api/common/index.ts:1-34`, `src-electron/preload/index.ts:1-8`, `src-electron/preload/api/index.ts:1-34`, `src-electron/main/ipc/index.ts:12-22`

2. `contextIsolation` is currently enabled, `nodeIntegration` is disabled, and `sandbox` is disabled.
   - Evidence: `src-electron/main/window.ts:28-39`

3. `window.electron` is a broad aggregated surface, not a minimal one-method bridge.
   - Evidence: `src-electron/preload/api/index.ts:14-31`

4. There is a real local layering inversion: main IPC handlers import preload `pathAPI`.
   - Evidence: `src-electron/main/ipc/dataStorageHandlers.ts:12`, `src-electron/main/ipc/highSpeedStorageHandlers.ts:11`, `src-electron/main/ipc/historyDataHandlers.ts:22`

5. Renderer common wrappers are partly repetitive, but not uniformly disposable.
   - Evidence: fallback/deepClone examples in `src/api/common/serialApi.ts:20-24`, `src/api/common/networkApi.ts:18-25`, `src/api/common/receiveApi.ts:41-48`; listener lifecycle examples in `src-electron/preload/api/serial.ts:75-101`, `src-electron/preload/api/timerManager.ts:93-120`

6. The renderer does not strictly always go through `src/api/common/*Api.ts`.
   - Evidence: `src/composables/common/useFileDialog.ts:49`

7. Bridge safety is not equivalent to current bridge quality.
   - Evidence: files/network/path/timer surfaces are broad and accept renderer-controlled inputs. `src-electron/main/ipc/fileMetadataHandlers.ts:52-93`, `src-electron/main/ipc/networkHandlers.ts:33-73`, `src-electron/preload/api/path.ts:11-18`, `src-electron/preload/api/timerManager.ts:105-120`

## Inferences only

The following are inferences, not code facts:

- The main/preload `pathAPI` inversion is likely a good future cleanup candidate. Code proves the inversion exists; it does not prove priority or exact fix.
- Some pure forwarding common wrappers may be simplifiable. Code proves repetition; it does not prove they should be deleted.
- Fallback behavior may be hiding injection/configuration failures. Code proves fallback inconsistency; it does not prove current users rely on or do not rely on these fallbacks.
- A capability-based bridge may be safer than the current broad bridge. Code proves broad capability exposure; final security architecture still requires threat model and decision workflow.
- Moving runtime data out of `resources/public` may be desirable. Code proves current packaged path behavior; it does not prove the correct target location.
- Keeping `contextIsolation` may be prudent. Code proves current isolation and broad platform capabilities; final policy belongs to later decision workflow.
- Closing `contextIsolation` may reduce apparent wrapper complexity. Code proves wrapper complexity; it does not prove closing isolation is an acceptable way to reduce it.

## Decision questions for later

These questions are intentionally deferred:

1. Threat model:
   - Is renderer considered trusted first-party code only, or must it be treated as potentially compromised by XSS, dependency injection, plugins, DevTools or user-controlled content?

2. Isolation policy:
   - Should `contextIsolation` remain enabled?
   - If disabled, how would `window.electron` be exposed, typed and validated without breaking current common wrappers?

3. Bridge shape:
   - Should `window.electron` remain a broad module aggregate, or be narrowed to capability-specific APIs?
   - Should files/network/path/timer APIs receive allowlists and argument validation at bridge/handler boundary?

4. Layer ownership:
   - Where should `pathAPI.getDataPath()` live if both main and preload need it?
   - Is `src-electron/preload/api/path.ts` allowed to be imported by main, or should this be a main-safe utility?

5. Renderer facade:
   - Is `src/api/common/*Api.ts` a long-term renderer facade, a migration compatibility layer, or a temporary duplicate?
   - Should fallbacks stay, fail fast, or be made environment-explicit?

6. API contract:
   - Should method -> channel -> handler mapping be centralized or generated?
   - How should type drift like `receive.updatedDataItems` be prevented?

7. Packaging/data boundary:
   - Should runtime mutable data live under `resources/public`, app userData, or another explicit writable data root?

8. Verification:
   - What minimal regression matrix is required before changing isolation, bridge exposure, path ownership, or wrapper layers?

## Stop conditions

Any future work on this line should stop and return to dedicated decision / planning if it starts doing any of the following without an approved decision:

- Changing `contextIsolation`, `nodeIntegration`, `sandbox`, preload entry, or `contextBridge` exposure.
- Removing `src-electron/preload/api/*`.
- Removing `src/api/common/*Api.ts`.
- Replacing `window.electron` access strategy.
- Moving runtime data root or changing `pathAPI.getDataPath()` semantics.
- Changing files/network/serial/timer exposed capability surface.
- Changing IPC channel names or event channel names.
- Treating fallback behavior as unneeded without inventory and call-site verification.
- Treating current broad bridge as safe only because contextBridge exists.
- Folding this line into 1A / 1B / 1C cleanup.
- Writing a final architecture decision in this checkpoint.

## Possible future cleanup lanes

These are possible lanes only, not decisions:

1. API contract inventory lane
   - Produce a table of `common method -> window.electron path -> preload method -> IPC channel/event -> main handler -> capability`.
   - Useful before deleting or merging any wrapper.

2. Path ownership lane
   - Re-home `getDataPath/resolve/isPackaged` into a platform utility with explicit main/preload ownership.
   - First target would be the current main imports of preload `pathAPI`.

3. Renderer facade classification lane
   - Classify common wrappers into `behavioral wrapper`, `fallback wrapper`, `pure forwarding wrapper`, and `direct window.electron bypass`.
   - This supports simplification discussion without pre-deciding deletion.

4. Bridge hardening lane
   - Review files/path/network/timer/history/highSpeedStorage surfaces for argument validation, path allowlists, channel allowlists and capability scoping.
   - This can happen whether isolation stays or later changes.

5. Fallback semantics lane
   - Make Electron API unavailable behavior explicit and consistent: noop, `success:false`, reject, or fail-fast by environment.

6. Packaging/data-root lane
   - Separately evaluate `resources/public` as runtime data root under builder `asar/extraResources`.
   - Keep this out of 1A / 1B / 1C unless explicitly routed.

7. Isolation decision lane
   - Only after this checkpoint and any needed inventory/hardening evidence, run `.agent/skills/easysdd-decisions/SKILL.md` to decide whether isolation and bridge strategy should change.

## Related documents

- `easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md`
- `easysdd/compound/2026-04-24-code-reality-check-before-1a-cleanup-plan.md`
