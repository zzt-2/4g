---
doc_type: architecture
type: rewrite-platform-api-surface-reduction
status: draft
date: 2026-04-30
summary: Global foundation design for reducing platform, preload, main, and renderer API surface before business feature design or code migration. This document classifies old Electron-facing APIs as delete, merge, platform capability, feature-owned, deferred, or runtime exception without defining final API schemas.
tags:
  - rewrite
  - platform
  - electron
  - preload
  - api-surface
  - pre-design
---

# Rewrite platform API surface reduction

## 1. Scope

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
- `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

Boundary guards:

- 当前 `src`、`src-electron` 和 `public` 旧代码事实只作为 evidence、oracle 候选和迁移风险。
- `codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。
- 本轮不写业务代码，不移动代码，不定义最终 preload/main/renderer API schema。
- 本轮不写字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 本轮不进入 receive / send / task / SCOE / result / report / northbound 内部流程设计。

Lane judgement:

- 本轮属于 Lane B 的 global foundation design。
- 当前产物是后续 app shell、shared tooling 和业务 feature design 的前置 gate，不是任何业务 feature 的详细设计。

Non-goals:

- 不把旧 `src/api/common/*` 一一迁到 `rewrite/src/platform/*`。
- 不为每个旧 preload API 生成对应 platform facade。
- 不保留旧 `window.electron` 大包暴露方式。
- 不用 main process 的旧业务化 handler 证明目标 main 职责。

Canonical decision:

- `rewrite/src/platform` 是 renderer 访问桌面能力的唯一正式入口，但 platform 只表达桌面能力，不承载业务语义。
- `rewrite/` 是新的独立应用根目录；旧根配置只能作为 infra evidence，进入 `rewrite/` 前必须重新收缩 Quasar/Electron entry、boot、public/extraResources、lint/test scope 和 auto-import 白名单。
- preload 只暴露最小 typed bridge，不暴露裸 `invoke/send/on`、任意 channel 或大包能力对象。
- main 只保留平台资源、生命周期、受控文件/路径/对话框、串口/网络 I/O、HTTP/FTP transport primitive，以及必要的高频缓冲、批处理、队列、节流和背压。
- receive/send/task/SCOE/storage/result/report/northbound 的领域判断必须归口到可测试 TypeScript feature core/service 或 runtime 编排边界。

Platform acceptance in this document only accepts capability category, prohibited surface, owner, validation/blocker, and runtime boundary exception registry entry when needed. It does not accept final API schema, interface signature, event payload, field enum, or preload/main/renderer contract details.

## 2. Evidence summary

Facts:

- `src-electron/preload/index.ts` 通过 `contextBridge.exposeInMainWorld('electron', api)` 暴露单一 `window.electron` 大包。
- `src-electron/preload/api/index.ts` 聚合 `window / menu / autoLaunch / serial / network / files / dataStorage / path / receive / highSpeedStorage / historyData / timerManager`。
- `src/api/common/*Api.ts` 基本按 preload 模块同构包装 `window.electron`，形成 renderer 侧旧平台大包兼容层。
- renderer 树下仍有直接 Electron/Node 依赖：`src/utils/common/ipcUtils.ts` import `ipcMain`，`src/utils/common/fileUtils.ts` import `fs/path`，`src/utils/common/dialogUtils.ts` import Electron dialog、BrowserWindow、fs、path，`src/composables/common/useFileDialog.ts` import `path` 并直连 `window.electron.files`。
- `src/composables/window/useWindowControls.ts` 直接读取 `window.electron.window`，绕过 `src/api/common/systemApi.ts` 中已有的 window wrapper。
- `src-electron/main/ipc/receiveHandlers.ts` 和 `receiveConfigCache.ts` 在 main 中执行 receive matching、mapping validation、data processing、cache/status 和统计构建，是 main 业务化风险证据。
- `src-electron/main/ipc/networkHandlers.ts` 在高频存储规则命中后短路普通 `network:data` 事件，是必须显式登记的高频边界例外候选。
- `src-electron/main/ipc/highSpeedStorageHandlers.ts` 同时包含文件流/轮转和 rule matching、connection id 解析、统计含义，混合了平台性能处理与 storage/receive 语义。
- 文件对话路径重复：`src/utils/common/fileDialogManager.ts`、`src/layouts/useFileDialog.ts`、`src/components/common/FileListDialog.vue`、`src/composables/common/useFileDialog.ts`、`src/utils/common/dialogUtils.ts` 并行存在。
- `timerManager` 从 main 到 preload 到 renderer wrapper 到 composable 已形成调度链，但 `onCustomEvent` 允许任意事件名订阅，存在把 timer 变成跨进程 event bus 的风险。

Inference:

- 现有三段式 Electron 链路可作为能力清单 evidence，但不能作为目标 API 组织。
- platform API surface 的主要目标是缩小、合并和退回 feature，而不是补齐所有旧 wrapper。
- `receiveApi`、`dataStorageApi`、`historyDataApi`、`highSpeedStorageApi` 是业务语义穿过 Electron 边界的重点风险。
- file/path/dialog/window 能力可先进入 app shell / shared tooling 设计，但只能按能力类别收口，不能保留多套 fallback。
- serial/network 只能作为 transport primitive 和平台资源生命周期进入 platform；connection status、target route、device identity、业务解析和结果语义不归 platform。

## 3. Platform API Surface Reduction Decision Table

Legend:

- `Evidence only`: 旧 API 是否只能作为迁移证据或 oracle 候选。
- `Blocked by`: 后续继续推进时需要等待的 design、runtime、hardware、customer 或 packaged evidence。

| Old capability / file | Current responsibility | Observed risk | Target decision | Reason | What renderer may access | What preload may expose | What main may retain | What must move back to feature | Evidence only | Blocked by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/api/common/index.ts` | 汇总所有旧 renderer wrapper | 大包聚合复制 `window.electron` 能力面 | delete / merge | 新 platform 不按旧文件名平移，不保留万能 barrel | 只访问按能力收敛的 `rewrite/src/platform` facade | none | none | none | yes | platform design acceptance |
| `src/api/common/systemApi.ts` | window/menu/autoLaunch 兼容 wrapper 和 fallback | `electronAPI` 兜底掩盖能力缺失；autoLaunch 无调用证据 | merge / platform facade / deferred | window/menu 属 app shell/platform；autoLaunch 属高权限系统设置，需显式需求 | app shell 通过 platform 使用最小 window/menu 能力 | typed shell bridge，autoLaunch 后置 | window/menu 平台操作；autoLaunch 若被确认才保留系统调用 | 设置语义、用户授权语义回 `settings/app` | partial | app shell design；autoLaunch 用户需求 |
| `src/api/common/filesApi.ts` | 文件元数据、目录、JSON/text read/write/delete | 泛路径、泛文件读写和业务 JSON import/export 混在一起 | merge / platform facade | 文件能力是真平台能力，但必须受控并和业务语义分离 | feature adapter 或 app shell file dialog 通过 platform 访问受控 file capability | typed bounded file/dialog bridge | 受控文件 I/O、目录准备、元数据读取 | frame/storage/report import/export 语义、JSON 内容语义 | partial | storage/app shell design；packaged path evidence |
| `src/api/common/pathApi.ts` | data path、path resolve、isPackaged | raw resolver 易成为任意路径拼接工具；打包态语义未验证 | platform facade / deferred | path 是平台能力，但只能表达受控路径类别 | 受控 path category 或 packaged state query | typed bounded path bridge | packaged state、数据根定位、目录准备 | storage path policy、report naming、retention 规则 | partial | packaged runtime evidence |
| `src/api/common/serialApi.ts` | 串口枚举、打开/关闭、读写、状态、事件 | raw serial/status/event 面过大，易把 connection 和 receive 语义塞进 platform | platform facade + feature-owned connection semantics / deferred | 串口 I/O 属平台；连接模型、target 和状态事实归 connection | connection adapter 访问 transport primitive，不直接消费 raw object | typed bounded serial transport bridge | port lifecycle、I/O、清理、必要 buffer/batch | connection status/target、receive parsing、send result、task/status/result 语义 | yes | connection design；hardware/runtime |
| `src/api/common/networkApi.ts` | TCP/TCP server/UDP connect/send/status/events | target、status、high-speed short-circuit、device identity 容易混同 | platform facade + feature-owned connection semantics / deferred | socket I/O 属平台；transport model 和 target route 归 connection | connection adapter 访问 network transport primitive | typed bounded network transport bridge | socket lifecycle、I/O、连接事件、必要 buffer/batch | target route、device identity、receive classification、northbound deviceId | yes | connection design；TCP/UDP runtime |
| `src/api/common/receiveApi.ts` | receive data processing、mapping validation、cache update/query | receive 解析、映射、统计和 cache 业务语义穿过 Electron | feature-owned / delete from platform / deferred | `receiveApi` 不能迁成 `platform/receive`；platform 只交付 transport input | receive feature 只通过 connection/platform 输入 bytes/batches，不访问 receive platform API | 不暴露 receive process/cache bridge | 若短期必须保留，只能登记 platform-side buffer exception | parser、mapping、cache semantics、stats、result output 回 `receive` | yes | receive design；high-frequency strategy |
| `src/api/common/dataStorageApi.ts` | 基于 `DATA_PATH_MAP` 动态 CRUD/export/import | dynamic key 扩大 API 面；数据类型和路径 map 是业务/存储语义 | feature-owned / merge / deferred | data storage 不是 platform；platform 只提供受控 file/path | storage/frame/settings adapter 通过 storage feature API 访问 | 不暴露动态 data type CRUD bridge | bounded file I/O、目录、迁移所需文件操作 | storage schema、导入导出、data type 生命周期 | yes | storage local baseline；packaged path |
| `src/api/common/historyDataApi.ts` | 按小时历史、批量追加、压缩、CSV 导出、清理 | history/CSV 容易被误当 report/northbound delivery | feature-owned / deferred | history 属 storage 本地记录和 report 素材，不是平台能力 | storage/report 通过 feature API 获取本地材料 | 不暴露 history as generic platform package | 文件读写、压缩/流式处理的执行器可保留 | history model、CSV 选择/字段/清理策略 | yes | storage/report design；packaged runtime |
| `src/api/common/highSpeedStorageApi.ts` | 高速存储配置、规则校验、统计、重置 | 规则匹配、短路普通 receive、统计含义混入平台 | feature-owned + runtime exception / deferred | high-speed 需要显式例外；platform 只保留高频 I/O 与背压设施 | storage/receive 通过登记后的 exception boundary 使用 | 仅在例外登记后暴露最小 typed bridge | stream、rotation、queue、backpressure、bounded file write | rule matching、frame header 语义、stats interpretation、short-circuit decision | yes | high-speed design；hardware/runtime/perf |
| `src/api/common/timerManagerApi.ts` | timer register/start/stop/pause/stats/tick/custom event | `onCustomEvent` 允许任意 channel；易变万能跨进程调度中心 | platform facade / preload-main implementation / merge | scheduling 可保留为平台能力，但 timer purpose 归 feature | feature consumer 通过 platform scheduling，不直接订阅 arbitrary channel | typed scheduling bridge；固定能力事件，不暴露任意 channel | timer lifecycle、cleanup、drift observation | timed send、task lifecycle、SCOE wait、status polling meaning | partial | scheduling gate；runtime drift evidence |
| `src/composables/window/useWindowControls.ts` | UI 直接控制窗口 | 直接 `window.electron.window`，绕过 platform facade | merge / app shell utility | 窗口控制属于 app shell；访问必须经 platform | app shell composable 使用 platform window capability | none beyond shell typed bridge | window operations | none | partial | app shell/platform window design |
| `src/composables/common/useFileDialog.ts` | 本地 file dialog callback 容器，直连 files/path fallback | 与主 file dialog flow 重复；混用 `window.electron.files` 和 Node `path` | delete / merge | 文件对话只保留一条 app shell + platform + feature adapter 路径 | app shell file dialog outcome，不直接访问 `window.electron` | none beyond file/dialog bridge | none | feature import/export 语义 | yes | app shell file-dialog design |
| `src/utils/common/fileDialogManager.ts` | EventBus 文件对话流 | EventBus 容易泛化成隐式 runtime bus | merge / app shell utility | 可作为 app shell 内部实现候选，不进 shared/platform | pages/features 只能调用 app shell 或 feature adapter | none | none | import/export semantics 回 feature | partial | app shell design |
| `src/utils/common/dialogUtils.ts` | Electron dialog、BrowserWindow、fs/path、Vue inject fallback | renderer 树下混合 Electron/Node/UI/业务文件语义 | delete / merge / platform-main split | 原生 dialog 和文件 I/O 归 platform/main；UI flow 归 app shell | 不直接访问该 utility | typed dialog/file bridge only | native dialog、bounded file operation | JSON import/export、confirm/message 业务口径 | yes | app shell/platform split |
| `src/utils/common/fileUtils.ts` | Node fs/path 文件 helper | renderer 树直接 Node 依赖 | delete / preload-main implementation if still needed | renderer 不得直接 fs/path；旧 helper 不能进 shared | none | none | bounded file helper under main if needed | storage semantics | yes | platform files design |
| `src/utils/common/ipcUtils.ts` | main IPC handler tooling | `ipcMain` 出现在 renderer `src/utils` 路径 | merge into main platform tooling | IPC tooling 属 main，不属 renderer shared | none | none | handler registration and error adapter | none | yes | main tooling design |
| `src-electron/preload/index.ts` | expose all modules as `window.electron` | 大包直出违反目标边界 | delete / preload-main implementation | preload 只暴露最小 typed bridge，不暴露万能对象 | renderer 不访问 `window.electron` | no big package, no bare channel | none | none | yes | preload typed boundary |
| `src-electron/preload/api/index.ts` | 聚合所有 preload modules | all-in-one package 扩大权限面 | delete / merge | 不按模块全量暴露，只按 accepted capability gate 暴露 | none | minimal accepted capability bridge | none | business modules removed | yes | platform acceptance |
| `src-electron/preload/api/window.ts`, `menu.ts` | window/menu IPC bridge | `send/invoke` 内部没问题，但暴露面需收窄 | preload-main implementation + platform facade | 真平台 shell 能力，可作为最小 bridge 候选 | app shell via platform | typed shell bridge | window/menu handlers | none | partial | app shell design |
| `src-electron/preload/api/autolaunch.ts` | login item get/set | 高权限系统持久化能力，旧代码无调用证据 | deferred / delete candidate | 没有用户设置需求前不暴露 | none until confirmed | none or controlled bridge only after settings design | OS login item call if confirmed | user setting/authorization semantics | yes | user/settings decision |
| `src-electron/preload/api/files.ts`, `path.ts` | file/path bridge | 泛文件、raw resolve、打包路径不清 | platform bridge / merge / deferred | 保留受控 file/path capability，不保留业务 JSON/path policy | app shell/storage adapter via platform | typed bounded file/path bridge | bounded file/path operations | import/export/history/report semantics | partial | storage/app shell；packaged runtime |
| `src-electron/preload/api/serial.ts`, `network.ts` | transport invoke and event subscriptions | raw per-packet unbounded event stream，权限面大 | preload-main implementation + deferred event model | transport bridge 合理，但事件模型需 connection/high-frequency design | connection adapter via platform | typed transport bridge with bounded events after design | transport lifecycle/I/O | receive/send/task/status/SCOE semantics | yes | connection/high-frequency design |
| `src-electron/preload/api/receive.ts` | receive process/cache bridge | 把 receive 业务处理做成 preload API | feature-owned / delete from platform | receive 业务 bridge 必须移出 platform surface | none | no receive business bridge | only platform buffer if exception registered | receive parser/cache/stats/result | yes | receive design |
| `src-electron/preload/api/dataStorage.ts`, `historyData.ts`, `highSpeedStorage.ts` | storage/history/high-speed bridges | data model、CSV、rule matching、stats 混入 Electron API | feature-owned + platform file/path split / deferred | storage 类 API 不能原样成为 platform API | storage feature API, not generic platform package | only bounded file/high-frequency bridge after registry | file stream/rotation/compression executor | data model、history/CSV、rules、stats | yes | storage/high-speed/report design |
| `src-electron/preload/api/timerManager.ts` | scheduling bridge with tick/custom event | arbitrary event subscription | platform scheduling / merge | scheduling 可以平台化，但不承载业务 channel | feature consumer via scheduling facade | typed scheduling bridge; no arbitrary event channel | timer lifecycle/cleanup | task/SCOE/status timer purpose | partial | scheduling gate |
| `src-electron/main/ipc/windowHandlers.ts`, `menuHandlers.ts` | window/menu operations | 低风险平台能力，但 menu 无上游调用证据 | preload-main implementation / deferred for menu | 保留最小 shell operations，未用能力后置 | none direct | none | minimal window/menu operations | none | partial | app shell/menu decision |
| `src-electron/main/ipc/serialHandlers.ts` | serial resource, data/status events, cleanup | 高频逐包事件和状态广播可能直接冲击 stores | preload-main implementation + high-frequency exception | serial I/O 属 main；业务分类不属 main | none direct | none | port lifecycle、I/O、cleanup、buffer/batch/backpressure | receive parsing、task/result/status meaning | yes | hardware/runtime; event model |
| `src-electron/main/ipc/networkHandlers.ts` | TCP/UDP lifecycle/data/status，高速存储短路 | `shouldStore` 业务分流藏在 transport handler | preload-main implementation + runtime exception | socket I/O 可保留；short-circuit 必须登记并迁出语义 | none direct | none | socket lifecycle、I/O、buffer/batch/backpressure | high-speed rule、receive classification、device identity | yes | high-speed/connection design |
| `src-electron/main/ipc/receiveHandlers.ts`, `receiveConfigCache.ts` | receive matching、processing、cache、stats | main 承载 receive 业务核 | feature-owned / delete from main / exception only if temporary | main 不拥有 receive 解析或 cache 语义 | none | none | only platform buffer if registered | matching、mapping、cache、stats、result output | yes | receive design |
| `src-electron/main/ipc/dataStorageHandlers.ts`, `fileMetadataHandlers.ts` | JSON storage CRUD、file metadata/I/O | data type CRUD 和业务路径 map 与平台 I/O 混在一起 | split platform file I/O + feature-owned storage | file I/O 留 main；storage 语义回 feature | none direct | none | bounded file operations、metadata、directory prep | data type lifecycle、serialization/import/export | yes | storage local baseline |
| `src-electron/main/ipc/historyDataHandlers.ts` | history append/load/compress/cleanup/CSV export | history schema、CSV 字段和清理策略是业务语义 | split + feature-owned / deferred | main 可执行文件流/压缩；history 语义归 storage | none direct | none | file/stream/compress executor | history model、CSV/report material semantics | yes | storage/report; packaged runtime |
| `src-electron/main/ipc/highSpeedStorageHandlers.ts` | stream/rotation/rule matching/stats | platform perf 和业务规则混合 | preload-main implementation + feature-owned + runtime exception | 保留高频文件设施，业务规则必须登记 owner | none direct | none | stream、rotation、queue、backpressure | rule matching、short-circuit、stats meaning | yes | high-speed design；perf/hardware |
| `src-electron/main/ipc/timerManagerHandlers.ts` | main timers、tick event、cleanup | 容易成为业务事件总线或 hidden scheduler | preload-main implementation + scheduling facade | main timer 可规避 renderer throttling；feature owns timer meaning | none direct | none | timer lifecycle、cleanup、drift observation | task/SCOE/status semantics | partial | timer drift/runtime |
| `src-electron/main/ipc/index.ts` | 一次性注册所有 handlers | 聚合业务 handler 强化旧边界 | merge into platform main tooling / deferred | main registry 可保留，但按 accepted capability 注册 | none | none | capability registry | feature business handlers | yes | platform/main boundary |

## 4. Minimal platform capability map

本文只写能力类别，不写接口 schema。

| Capability category | Why renderer cannot do it directly | Platform owns | Platform must not own | Features consume it | Validation required | Reduction rule |
| --- | --- | --- | --- | --- | --- | --- |
| window / menu / app shell | renderer 不能直接访问 Electron window/menu/app lifecycle | 最小窗口控制、菜单显示状态、app shell 需要的系统能力；autoLaunch 仅在需求确认后进入 | 页面业务流程、任务生命周期、状态事实、用户业务语义 | `app` shell、`pages` shell、`settings` if visible config is confirmed | manual + runtime | 只保留 app shell 真正使用的 shell capability；无调用证据的 menu/autoLaunch 后置或删除 |
| files / path / dialogs | renderer 不能直接访问 `fs/path` 或 native dialog；打包态路径需 Electron/main 判断 | 受控文件选择、受控读写、目录准备、data path、packaged state、路径类别 | frame import/export 语义、storage schema、history/CSV/report 语义、northbound delivery closure | `frame`、`storage`、`settings`、`report`、app shell file dialog | fixture for adapters; manual for dialogs; runtime for packaged data path | 合并多套 file dialog 和 path fallback；禁止 raw path resolver 和任意路径读写成为业务 API |
| serial / network transport | renderer 不能访问 `serialport`、socket、`net`，也不应承接 I/O 生命周期 | 端口/连接资源、打开/关闭、字节收发、连接事件、必要 buffering/batch/backpressure hook | frame matching、receive parsing、send result、task state、SCOE completion、northbound device identity | `connection` first; then `receive`、`send`、`scoe`、`status` | runtime + hardware for serial/TCP/UDP | 只保留 transport primitive；connection owns status/target model，feature owns business interpretation |
| scheduling | renderer timer 可能被节流；部分长周期/高频 timer 需要主进程稳定调度 | timer lifecycle、tick delivery、cleanup、drift observation | timed send 语义、task state machine、SCOE wait/completion、status polling meaning | `task`、`scoe`、`status`、app lifecycle where justified | fixture for cancellation model; runtime/manual for drift | 收缩为 scheduling facility；禁止任意 channel 和万能跨进程 event bus |
| packaged data path | userData、resources、权限和长期写入只有打包态可确认 | packaged state、受控数据根、目录准备、路径类别 | 旧 data path 常量、storage schema、report naming、file retention semantics | `storage`、`settings`、`report`、`northbound` when delivery needs local files | packaged runtime validation | 只定义 capability category；具体路径策略等 storage/app package evidence |
| optional HTTP/FTP transport | renderer 不应持有 FTP/HTTP 交付资源和失败恢复；外部交付需平台 transport | HTTP/FTP transport primitive、连接生命周期、文件上传 I/O if confirmed | northbound transaction semantics、external error/refusal mapping、TestReport schema、delivery success meaning | `northbound` via platform, using `report/storage` materials | customer + runtime validation | 只作为 optional transport 能力保留；无 customer evidence 前不实现或冻结 contract |
| high-frequency buffer / batch / backpressure exception | 高频串口/网络/文件链路不能逐包无节制穿透 renderer 和页面 | 与平台资源绑定的 buffer、batch、queue、throttle、backpressure、file stream/rotation | receive classification、storage rule meaning、task/result/status/report semantics | `connection`、`receive`、`storage`、`scoe` | fixture for small rules; runtime/hardware/perf validation for chain | 每个高频例外必须登记；main 只能保留性能侧处理，业务语义回 feature |

## 5. API surface shrink list

### 5.1 Delete

- 删除目标架构中的 `window.electron` 大包暴露方式；旧 `src-electron/preload/index.ts` 只能作为证据。
- 删除或停止扩展 `src/api/common/index.ts` 这类万能 renderer API barrel。
- 删除 renderer 侧直接 Electron/Node 入口：`src/utils/common/ipcUtils.ts`、`src/utils/common/fileUtils.ts`、`src/utils/common/dialogUtils.ts` 的当前归口形态不能进入新 renderer 树。
- 删除 `timerManager.onCustomEvent` 这类任意 channel 订阅能力；后续如需事件，只能由 runtime/feature design 声明固定边界。
- 删除 `src/composables/common/useFileDialog.ts` 与主 file dialog flow 重复的直连/fallback 路径。
- 删除 `systemApi.electronAPI` 这种兼容兜底对象在目标架构中的正式地位。

### 5.2 Merge

- 合并 window/menu/app shell 能力：app shell 只消费一条 platform shell capability path，不再让 `useWindowControls` 和 `systemApi.windowAPI` 并行。
- 合并 files/path/dialog 能力：保留一条 app shell file dialog + platform file/path + feature adapter 路径，不保留 `dialogUtils`、`fileDialogManager`、`useFileDialog` 多套 fallback。
- 合并 file/path 的平台实现：platform 只表达受控文件、受控路径和打包态能力；storage/report/frame/settings 各自拥有业务语义。
- 合并 scheduling 能力：main timer、preload timer、renderer wrapper 和 composable 统一为 platform scheduling facility + feature consumer，不复制局部 timer manager。
- 合并 IPC tooling 到 main platform tooling；renderer `src/utils` 不再持有 `ipcMain` helper。

### 5.3 Migration evidence only

- `src/api/common/*Api.ts` 是旧能力清单和 fallback 行为证据，不是新 platform 命名或接口合同。
- `src-electron/preload/api/*` 是旧 bridge 形态证据，不是目标 preload 暴露清单。
- `src-electron/main/ipc/*` 是平台资源、业务泄漏和高频风险证据，不是目标 main 责任边界。
- 旧 `path.getDataPath()` 指向开发/打包路径的行为只能作为 packaged data path 风险证据，不能冻结为长期路径策略。
- 旧 high-speed storage short-circuit 是必须解释的行为证据，不能默认成为新 receive/storage 数据流。

### 5.4 Feature-owned

- `receiveApi` 不能迁成 `platform/receive`。receive matching、mapping、cache、stats、result output 归 `features/receive`。
- `dataStorageApi`、`historyDataApi`、`highSpeedStorageApi` 不能都原样迁成 platform API。storage/history/high-speed 的数据模型、清理口径、导出语义、rule matching 和统计含义归 `features/storage` 或对应 feature design。
- serial/network 的 connection status、target route、target availability 和 transport identity 归 `features/connection`；northbound device identity 归 `features/northbound`。
- timerManager 的 timed send、task lifecycle、SCOE wait/completion、status polling meaning 分别归 `task`、`scoe`、`status`，不归 platform scheduling。
- file import/export validation、旧 JSON migration、history/CSV/report material、report generation 和 northbound delivery closure 都归 feature。

### 5.5 Deferred

- `autoLaunch` 后置到 settings/app shell 需求确认；无用户可见需求前不作为目标 platform surface。
- `menuAPI` 后置到 app shell/menu UX 确认；当前无上游调用证据时不主动暴露。
- raw `path.resolve` 与最终 `getDataPath` 语义后置到 packaged data path design 和 runtime evidence。
- serial/TCP/UDP 事件模型、batch/backpressure 参数、queue/window/overflow 策略后置到 connection/receive design 和 runtime evidence。
- HTTP/FTP transport 后置到 northbound phase-one/customer assets；本轮只保留 optional platform capability category。
- high-speed storage short-circuit 是否保留、何时短路普通 receive/display/trigger 链，后置到 storage/receive/high-frequency design。

### 5.6 Runtime exception registry required

后续触达以下能力时必须登记 runtime boundary exception，而不是隐式沉积在 platform/main handler 中：

- high-frequency buffer/batch/backpressure for serial/network data.
- high-speed storage short-circuit or direct file write path.
- packaged data path and writable data root.
- temporary main-side receive processing if any migration step cannot remove it immediately.
- SCOE fixed source/target/completion boundary.
- optional HTTP/FTP northbound delivery transport.
- scheduling assumptions that rely on main timers, multi-window target, drift control, or cleanup ordering.

## 6. Special reduction decisions

- `receiveApi` 不能迁成 `platform/receive`。receive 是 feature-owned domain; platform 只提供 transport input、必要 batch/backpressure 和 typed boundary。
- `dataStorageApi/historyDataApi/highSpeedStorageApi` 不能都原样迁成 platform API。它们必须拆成 platform file/path/high-frequency facility 与 storage/history/high-speed feature semantics。
- `timerManagerApi` 不能变成万能跨进程调度中心。platform scheduling 只负责 timer facility；feature 必须声明用途、取消策略、owner 和验证。
- `serialApi/networkApi` 只能保留 transport 能力。connection/status/target/device identity 语义不归 platform；northbound `deviceId` 不等同 serial/network target。
- file/path/dialog/window 能力必须合并重复入口，删除静默 fallback 和绕行路径，不保留多套并行 file dialog 或 window control path。

## 7. Runtime Boundary Exception Registry Template

本文只定义登记格式，不登记具体实现。后续任何 exception record 必须按此模板补齐。

| Field | Required content | Must not contain |
| --- | --- | --- |
| Exception name | 稳定、可检索的例外名称 | 临时实现细节或旧 handler 文件名本身 |
| Why renderer/feature core cannot own it directly | 说明为什么不能由 renderer 或 feature core 直接承载，例如平台资源、权限、性能、打包态、硬件链路 | “减少 IPC” 这类不足以成立的理由 |
| Platform/main retained responsibility | main/platform 只保留哪些平台侧或性能侧处理 | 业务运算、协议语义、任务推进、报告语义、northbound 错误转换 |
| Business owner feature | 明确业务语义最终归属哪个 feature | `platform` 或 `runtime` 作为业务 owner |
| Data flow boundary | 输入来自哪里、平台侧处理到哪里结束、feature 从哪里接管；只写边界，不写 payload schema | 字段 schema、接口签名、事件 payload |
| Validation required | fixture/manual/runtime/hardware/customer/package 哪些层级必须覆盖 | 用 build/lint 替代 runtime/hardware/customer evidence |
| Exit condition / future simplification possibility | 何时可以移除例外、下沉到 feature core、或缩小 main 保留职责 | 无期限保留或“以后再看” |

Template rules:

- 每个例外都必须能回答：为什么不能由可测试 TypeScript core 直接拥有，main 到底只保留了什么，业务语义在哪里归口，如何验证，何时退出。
- 例外登记只允许扩大审计可见性，不允许把业务规则合法化到 main。
- 没有登记的 high-frequency、SCOE、packaged data path、HTTP/FTP 或 main-side business processing，后续审查应判为 `revise-required`。

## 8. Follow-up gate

### 8.1 Platform abilities that can enter shared-tooling-app-shell-ownership next

| Ability | Why allowed now | Guard |
| --- | --- | --- |
| window controls | app shell 需要，能力低频且边界清楚 | 只设计 app shell consumer 和 platform category，不写最终 API schema |
| menu visibility | 可作为 app shell candidate | 当前无上游调用证据，默认 deferred until UX need |
| file dialog shell | 重复路径明显，适合先做 owner 归口 | app shell owns dialog flow; feature owns import/export semantics |
| bounded files/path category | storage/frame/settings 都依赖，但可先定禁止面 | 不定义具体 path schema；packaged path 需 runtime evidence |
| scheduling category | timer facility 需要先防止业务化 | 不定义 task/SCOE/status timer semantics |
| renderer direct access cleanup rules | 与 shared/tooling 归口直接相关 | 不做代码迁移，只写 owner/delete/merge 判断 |

### 8.2 Must wait for connection / receive / storage / SCOE / northbound design

| Ability | Must wait for | Reason |
| --- | --- | --- |
| serial/network event model and target status | `connection` design | transport target、status、availability 和 batch boundary 需要 connection owner |
| receive processing/cache replacement | `receive` design | parser、mapping、result、stats 都是 receive semantics |
| high-speed storage rule and short-circuit behavior | `storage` + `receive` + high-frequency design | 关系到是否进入普通 receive/display/trigger 链 |
| local storage/history/CSV semantics | `storage-local-baseline` | data model、cleanup、export 和 migration 属 storage |
| SCOE fixed source/target/completion | `scoe` design | 属领域例外，不可塞进 generic transport/receive/send |
| HTTP/FTP transport usage | `northbound` + customer materials | transport primitive 可保留，使用语义必须等甲方闭环 |
| result/report delivery interaction | `result` + `report` + `northbound` | result truth、report generation、delivery closure 必须分开 |

### 8.3 Blocks implementation but not boundary design

| Blocker | Blocks implementation of | Boundary design may still decide |
| --- | --- | --- |
| Real serial/TCP/UDP evidence missing | transport adapter, send/receive real I/O | owner, capability category, validation plan |
| High-frequency batch/backpressure parameters missing | concrete queue/window/overflow implementation | principle, exception template, feature owner |
| Packaged data path unverified | persistent path implementation | path owner, runtime validation requirement |
| Timer drift/multi-window target unverified | concrete scheduling adapter behavior | scheduling category and feature ownership split |
| SCOE hardware unavailable | real SCOE command path | SCOE owner and exception boundary |
| HTTP/FTP environment unavailable | northbound transport implementation | optional transport category and customer blocker |

### 8.4 Blocks acceptance

| Missing evidence | Cannot claim accepted for |
| --- | --- |
| No real serial/TCP/UDP validation | hardware connection, real send/receive order, high-frequency data behavior |
| No SCOE device validation | SCOE timeout, state loop, completion condition, fixed source/target correctness |
| No packaged app data path validation | packaged persistence, backup, cleanup, report material path |
| No runtime evidence for high-speed storage | short-circuit correctness, throughput, file rotation, stats consistency |
| No customer schema / enum / error / TestReport sample | northbound result/report/task/status customer closure |
| No HTTP/FTP environment and receiving-side confirmation | file delivery, report upload, completion notice, retry/failure compensation |

### 8.5 Impact on first batch design

| First batch candidate | Allowed after this document | Required guard |
| --- | --- | --- |
| `shared-tooling-app-shell-ownership` | yes | Must use this document as direct contract for platform/app shell shrink decisions; no code movement |
| `frame` | yes | File import/export uses platform/file category only as boundary; old JSON migration stays frame/storage design |
| `settings` | yes | System settings like autoLaunch remain deferred until explicit user-facing need |
| `storage-local-baseline` | yes, local-only | Must split storage semantics from platform file/path; packaged path marked runtime blocker |
| `connection` | not first until platform transport gate accepted | serial/network must be transport-only; target/device identity split required |
| `receive` | not first | Needs frame snapshot, connection input model, high-frequency boundary |
| `send` | not first | Needs frame/send asset boundary and connection target model |
| `task` | not first | Needs scheduling gate and receive/send outputs |
| `scoe` | not first | Needs exception registry and connection/receive/send boundaries |
| `result/report/northbound` | not first | Needs task/status/result/report boundaries plus customer materials for northbound |

## 9. Review implications

- If a future change recreates `window.electron` or another large renderer capability object, review outcome should be `revise-required`.
- If a future change exposes bare `invoke/send/on`, arbitrary channel subscription, or raw path/file operation to renderer, review outcome should be `revise-required`.
- If main retains receive/send/task/SCOE/result/report/northbound business semantics without an explicit exception record and owner/exit condition, review outcome should be `revise-required`.
- If platform facade names mirror every old `src/api/common/*Api.ts` file without shrink/merge/delete decisions, review outcome should be `revise-required`.
- If feature design touches platform/preload/main but does not list this document as direct contract or boundary guard, review outcome should be `blocked`.

## 10. Next-step judgement

Allowed:

- Enter `shared-tooling-app-shell-ownership` as the next global foundation design.
- Enter `platform-app-shell-file-dialog` as the bridge gate that applies this platform shrink decision to file/path/dialog/window controls before frame/settings/storage implementation.
- Start first business feature designs for `frame`, `settings`, and local-only `storage-local-baseline`, provided they carry this document as direct contract or boundary guard when touching platform/file/path/dialog.

Not allowed yet:

- Do not start receive/send/task/SCOE/result/report/northbound implementation.
- Do not define final preload/main/renderer API schema from this document.
- Do not migrate old `src/api/common/*` files directly into `rewrite/src/platform/*`.
- Do not claim hardware, packaged runtime, high-speed storage, HTTP/FTP, or customer closure from static evidence.
