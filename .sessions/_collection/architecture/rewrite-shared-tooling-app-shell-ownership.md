---
doc_type: architecture
type: rewrite-shared-tooling-app-shell-ownership
status: draft
date: 2026-04-30
summary: Global foundation ownership decision for legacy shared tooling, widgets, app shell utilities, feature helpers, and delete-or-merge candidates before business feature design starts.
tags:
  - rewrite
  - shared
  - widgets
  - app-shell
  - ownership
  - pre-design
---

# Rewrite shared tooling app shell ownership

## 1. Scope

本轮是东方红上位机重写的 global foundation design：`shared-tooling-app-shell-ownership`。

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
- `src/utils` 是 legacy mixed zone，不是天然 shared 来源。
- 本轮不写业务代码，不移动代码，不定义字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 本轮不定义最终 component API，不进入 receive / send / task / SCOE / result / report / northbound 内部流程设计。

Lane judgement:

- 本轮属于 Lane B 的全局 foundation design。
- 本文只固定 owner、禁止面、delete-or-merge 方向和后续 gate；不是任何 feature 的内部设计。

## 2. Ownership rules

Shared minimal rule:

- `shared` 只接收纯 TypeScript、无 Vue/Pinia/Quasar/Electron/Node/platform、无 feature owner、无副作用或副作用清楚受限的能力。
- 有 frame、receive、send、task、SCOE、storage、status、result、report、northbound 语义的能力默认不进 `shared`。
- `shared` 不是 `src/utils` 的新名字；所有候选必须按函数子集拆判。

Widgets rule:

- `widgets` 只能是展示/交互 shell，消费 props、emit、slot、只读 view model 或 public selector。
- `widgets` 不得直接读 feature internals、store、platform、旧 `src/api/common` 或 `window.electron`。

App shell rule:

- `app shell` 负责应用壳、布局、全局文件对话框挂载、窗口控制入口和全局 UI 容器。
- `app shell` 可以消费 platform facade，但不拥有业务语义、文件格式、导入导出校验、任务语义或存储规则。

Feature helper/core rule:

- 承载领域规则、领域校验、协议语义、任务语义、状态推进、SCOE 特判、历史/高速存储语义的旧工具必须回到对应 feature。
- 不为了“复用感”提前抽 shared；重复能力优先删除或合并，不默认迁移。

Event and file dialog rule:

- `EventBus` 不得发展成跨 feature runtime bus。
- file dialog 只能保留一条 `app shell + platform/files + feature adapter` 路径。

## 3. Evidence summary

Evidence:

- `src/utils/frames/*` 混合 frame 字段、表达式、默认配置、send instance、task config、hex projection 和策略校验。
- `src/utils/receive/*` 混合 receive matching、validation、data processing、UI label option 和 SCOE 特判；`scoeFrame.ts` 直接读取 receive store。
- `src/utils/common/*` 混合 Quasar EventBus、Vue lifecycle、Electron dialog、Node `fs/path`、renderer file dialog manager、main IPC tooling、date/error helper。
- file dialog 现有主链路是 `fileDialogManager.ts -> EventBus -> layouts/useFileDialog.ts -> MainLayout.vue -> FileListDialog.vue -> filesAPI -> preload/main files handler`。
- file dialog 存在重复入口：`src/composables/common/useFileDialog.ts` 和 `src/utils/common/dialogUtils.ts` 与主链路平行。
- `FileListDialog.vue` 直接读取 `fileStorageStore` 并调用 `filesAPI`；`ImportExportActions.vue` 直接调用 `fileDialogManager` 和 `pathAPI`。
- `UniversalChart.vue` 直接读取 `useDataDisplayStore`；`StatusIndicators.vue` 直接读取 status store 和 receive store；`StatusIndicatorConfigDialog.vue` 直接编辑 status store。
- `useWindowControls.ts` 直接访问 `window.electron.window`。

Inference:

- 旧 common/widgets 目录已经承担“公共入口”和“业务快捷入口”两种职责，不能整体迁入 `shared` 或 `widgets`。
- 当前可前置的只有少量纯工具、app shell owner 设计和 widgets 展示壳约束；大多数迁移必须等 platform surface reduction 或对应 feature design。

## 4. Ownership decision table

### 4.1 `src/utils/frames`

| current path / capability | current responsibility | observed dependencies | candidate owner | reason | risk | can move before feature design | condition | must not become |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/utils/frames/frameUtils.ts` | deep clone、date format、field type helper、field hex preview、frame validation、filter/sort | imports frame types, `FIELD_TYPE_CONFIGS`, `validateExpressionConfig` | `feature helper`; tiny `shared` subset | 主体围绕 frame/field 资产和展示规则，只有 `deepClone`、简单 date 子集可能无 owner | 整体进 shared 会把 frame 语义和 display preview 带入公共层 | conditional | 只抽纯 clone/date 子集；frame/field 部分等 frame design | 公共 frame service、字段语义中心、统计容器 |
| `src/utils/frames/fieldValidation.ts` | expression syntax、variable mapping、data source validation、cycle check | imports frame field expression types and `DataSourceType` | `feature core` | 表达式和变量来源绑定 frame/current/global/SCOE 等领域输入 | 进 shared 会冻结跨 feature 数据源规则 | no | 等 frame design 明确 expression owner 和 receive/SCOE 输入边界 | 通用 validator、跨 feature 数据源合同 |
| `src/utils/frames/defaultConfigs.ts` | timed/trigger strategy、expression、label/default config factory | imports send strategy types, field expression types, `nanoid` | `feature helper`; `deferred` | 默认值混合 frame、send、task、expression、label source | 整体迁移会复制旧耦合默认值 | no | 等 frame/send/task/settings design 拆 owner | shared defaults、全局配置事实源 |
| `src/utils/frames/frameInstancesUtils.ts` | send instance field init、编号、checksum、buffer write、local error wrapper | imports send instance types, number data types, hex utilities | `feature core` | 主体是 send instance 和构帧语义 | 进 shared 会把 send buffer/checksum 伪装成通用工具 | no | 等 send design；重复 `withErrorHandling` 合并到 error plan | 公共发送引擎、task lifecycle owner |
| `src/utils/frames/hexCovertUtils.ts` | number/hex conversion、format、field full hex、send field init、SCOE compare | imports `NUMBER_DATA_TYPES`, `SendInstanceField`, SCOE `MatchOperator` | `shared` for pure subset; `feature helper` for domain wrappers | conversion 子集可纯 TS；field/instance/SCOE 部分有 owner | 不拆就会把 send/SCOE operator 带入 shared | conditional | 先拆出无 frame/send/SCOE import 的 conversion/format primitives | 协议语义层、SCOE compare center、send field formatter |
| `src/utils/frames/taskConfigUtils.ts` | lean task config、config type label、instance reference validation | imports task config and send instance types | `feature core` | task config、实例引用和策略配置属于 task/send 边界 | 旧 send task 被误等价 northbound task | no | 等 task design；frame/send 引用边界先锁 | northbound task schema、通用 import/export schema |
| `src/utils/frames/strategyValidation.ts` | timed/trigger strategy validation | imports strategy types | `feature core` | 策略语义属于 task/send 调度 | 提前迁移会锁死旧策略口径 | no | 等 task/send design 确认 local timed/trigger 语义 | shared validation、runtime scheduler policy |

### 4.2 `src/utils/receive`

| current path / capability | current responsibility | observed dependencies | candidate owner | reason | risk | can move before feature design | condition | must not become |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/utils/receive/index.ts` | receive utility barrel | re-exports matcher/validator/label/processor | `feature helper` | 只是旧 receive mixed zone 聚合 | 直接迁移会延续旧 receive helper 边界 | no | receive design 后按 core/UI helper 拆 | 新 barrel shared |
| `src/utils/receive/frameMatchers.ts` | frame identifier matching | imports frame/receive types and `convertToHex` | `feature core` | matching 是 receive core，读取 frame asset projection | shared 化会让 receive parser 成为全局工具 | no | 等 receive design 明确 parser oracle 和 frame snapshot | shared parser、main handler helper |
| `src/utils/receive/frameValidators.ts` | receive mapping/frame/group validation | imports frame/receive types | `feature core`; maybe frame boundary validator | 配置校验属于 receive/frame 边界 | 提前抽会冻结旧 mapping schema | no | 等 frame + receive design 分清资产校验和接收配置校验 | 通用 schema validator |
| `src/utils/receive/dataProcessor.ts` | packet processing、field extraction、group mutation | imports matcher, validators, frame/receive types, hex utilities | `feature core` | bytes -> match -> fields -> receive output 是 receive 领域规则 | 旧 main handler 调用它，容易继续 main 业务化 | no | 等 receive high-frequency design 和 main/platform 例外登记 | platform processor、shared pipeline |
| `src/utils/receive/labelOptionGenerators.ts` | receive data option generation and display label formatting | imports frame field type and receive display concepts | `feature helper`; `widgets` only after view model | UI option 与 receive 数据源语义混合 | widget 若直接读 receive internals 会越界 | no | receive/status/data-display 提供 public view model 后再决定 | widget data source owner |
| `src/utils/receive/scoeFrame.ts` | SCOE recognition、checksum、param resolution、completion wait | imports receive store and hex utilities; uses interval wait | `feature core` | SCOE 是独立领域例外，不是 receive/shared 工具 | 固化 receive store 穿透和 SCOE 特判 | no | 等 SCOE design、receive handoff 和 hardware/fixture plan | receive special case、shared protocol toolkit、runtime bus |

### 4.3 `src/utils/common`, composables, layout and window shell

| current path / capability | current responsibility | observed dependencies | candidate owner | reason | risk | can move before feature design | condition | must not become |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/utils/index.ts` | re-export legacy EventBus | only exports `./common/EventBus` | `delete / merge duplicate` | 强化旧 mixed zone，没有目标架构价值 | 新代码继续从 legacy utils 绕行 | no | 只在 app shell 方案替换后停止扩展或删除 | shared barrel |
| `src/utils/common/EventBus.ts` | Quasar EventBus and lifecycle listener; includes file dialog events and old bookmark/menu/search events | imports Quasar `EventBus`, Vue lifecycle | `app shell` or `delete / merge duplicate` | 当前有效链路主要是 file dialog；不是 pure shared | 发展成隐式跨 feature bus | conditional | 只允许作为 app shell file-dialog implementation detail | runtime bus、task/status/result event hub |
| `src/utils/common/dateUtils.ts` | date/time formatting, duration, hour key helpers | pure Date/string/number | `shared` for formatting subset; `feature helper` for hour storage subset | formatter 可无 owner；hour boundary 更接近 storage/history/data-display | 将 storage hour key 当全局时间合同 | conditional | format/date/duration 可前置；hour key 等 storage design 再判 | storage schema、timezone policy center |
| `src/utils/common/errorUtils.ts` | error normalization, response shape, logger, assertion, IPC error formatting | pure TS plus console logger callback | `shared` core; platform/main adapter for IPC | unknown error -> message/core 可共享；IPC/UI loading/logger 是 adapter | shared 吞并业务错误码、重试和 toast policy | conditional | 只抽 platform-free normalization；IPC response 留 main/platform adapter | business error taxonomy、northbound error mapper |
| `src/utils/common/dialogUtils.ts` | native dialog, JSON import/export, custom dialog fallback | imports Electron `dialog/BrowserWindow`, Node `fs/path`, Vue `inject`, error/file utils | `delete / merge duplicate`; platform/main split if needed | 同时混合 main、renderer UI fallback、file business | renderer shared 引入 Electron/Node，且与 fileDialogManager 平行 | no | 等 platform files/dialog boundary；当前只作 evidence | normal file-dialog path、feature import/export owner |
| `src/utils/common/fileDialogManager.ts` | EventBus file dialog promise, JSON load/save via files API | imports EventBus, `filesAPI`, file record type | `app shell`; `platform consumer`; feature adapter boundary | 属 app shell 全局文件对话流的一段，但当前写入 JSON 业务 | 让 UI/feature 直接依赖 shell event bus 和 platform wrapper | conditional | 只作为 app shell/file-dialog adapter 设计前置；迁移等 platform/files facade | shared file service、business import/export owner |
| `src/utils/common/fileUtils.ts` | Node fs/path JSON load/save/existence helpers | imports `fs`, `path` | `platform consumer`; `delete / merge duplicate` | renderer tree 下 Node helper 违反目标边界；目前主要被 dialogUtils 用 | 变成任意路径读写工具 | no | 等 platform/files design 决定是否有 main-side helper | shared file util、storage schema owner |
| `src/utils/common/ipcUtils.ts` | main IPC handler registry and response wrapper | imports Electron `ipcMain`, error util; used by main handlers | `platform consumer` | 是 main/preload implementation tooling，不属于 renderer shared | 位置误导导致 renderer 依赖 main tooling | no | platform/preload/main boundary design 后移入 main tooling | business handler center、feature service locator |
| `src/composables/common/useFileDialog.ts` | alternate import/export dialog composable and getFullPath fallback | Vue state; direct `window.electron.files.getFullPath`; only type-imported by dialogUtils | `delete / merge duplicate` | 与 `layouts/useFileDialog.ts` 平行且不在主链路 | 双入口语义漂移，绕过 app shell/platform | no | app shell file dialog 方案确认后删除或合并 | long-term compatibility entry |
| `src/composables/common/useDragSort.ts` | generic drag-sort interaction composable | Vue refs/computed, DOM events | `widgets` | 通用交互 shell，无业务 owner | 若持久化排序或字段语义进入其中会越界 | yes | 只迁交互状态和 reorder callback；补 lifecycle/edge constraints later | feature sorting service、field order owner |
| `src/composables/common/useLocation.ts` | fetch IP geolocation and coordinate formatting | Vue state, external `fetch('https://ipapi.co/json/')` | `deferred`; maybe `feature helper` | 外部网络、隐私、离线策略和用途未锁 | 被误当设备身份、northbound 位置事实或平台能力 | no | 等 status/settings/global stats design 确认需要 | device identity source、northbound field |
| `src/composables/common/useTimerManager.ts` | timer register/start/stop/pause/resume/listen/cleanup wrapper | Vue lifecycle; `timerManagerAPI`; timer types | `platform consumer`; `feature helper` | platform scheduling consumer，不是 shared；task/status/SCOE 拥有 timer 用途 | 发展成隐藏 runtime bus 或 task lifecycle owner | no | platform scheduling surface + task/status/SCOE design | task state machine、SCOE wait semantics、status polling owner |
| `src/layouts/useFileDialog.ts` | active global file dialog state and EventBus listener | Vue reactive/onMounted, EventBus, `FileRecord` | `app shell` | 当前全局 FileListDialog 主链路 | 缺少 unmount cleanup；依赖 legacy EventBus | conditional | 作为 app shell owner 可前置设计；迁移等 platform/files facade and FileListDialog decoupling | feature file service、runtime bus |
| `src/layouts/MainLayout.vue` file dialog mount | app layout, drawer, global FileListDialog mount, app lifecycle | imports common FileListDialog, layout composables, app lifecycle | `app shell` | 全局 UI 容器和文件对话框挂载属于 app shell | FileListDialog 直连 store/platform 会污染 shell | conditional | 只固定 mount owner；组件解耦后再复用 | business page, storage owner |
| `src/composables/window/useWindowControls.ts` | window minimize/maximize/close controls | direct `window.electron.window` | `app shell`; `platform consumer` | 窗口控制属于 app shell，但访问必须经 platform facade | 继续绕过 platform facade | conditional | platform/window facade 先存在；app shell 只消费 facade | generic shared composable、page-level Electron access |

### 4.4 Common components / widgets

| current path / capability | current responsibility | observed dependencies | candidate owner | reason | risk | can move before feature design | condition | must not become |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/components/common/ImportExportActions.vue` | generic import/export buttons with callback props | Vue/Quasar; `fileDialogManager`; `pathAPI`; parent get/set callbacks | `widgets`; `app shell` consumer via adapter | Button shell 可复用，文件选择和业务导入导出不属于它 | widget 直接消费 platform/path and app shell event flow | conditional | 剥离 `pathAPI/fileDialogManager` 后只保留 button shell | import/export business workflow、file path owner |
| `src/components/common/FileListDialog.vue` | global file picker/list dialog | Vue/Quasar; `fileStorageStore`; `filesAPI` delete; local date formatter | `app shell`; possibly `widgets` after decoupling | 当前由 MainLayout 全局挂载，但直接读 storage/platform | 阻塞 file dialog single path 和 storage boundary | conditional | 先让文件列表和删除由 app/platform/storage adapter 注入 | storage service、platform consumer widget |
| `src/components/common/UniversalChart.vue` | realtime/history chart display, sampling, resize, local time cache | ECharts; storage/history types; receive data item type; `useDataDisplayStore` | `deferred`; later `widgets` shell + feature adapter | 当前直接读 dataDisplay store，不是纯 widget | widgets 读 receive/data-display internals | no | 等 data-display/history/receive view model design | receive read model owner、history statistics owner |
| `src/components/common/UniversalChartSettingsDialog.vue` | chart settings and performance config dialog | props/emit; `useLocalStorage`; history config types | `widgets` with settings/storage owner guard | 接近纯配置 UI，但 localStorage 持久化归口未定 | localStorage key/schema 绕过 settings/storage | conditional | 配置持久化 owner 明确后可前置 shell | chart config source of truth |
| `src/components/common/StatusIndicators.vue` | header status indicator display | `useStatusIndicatorStore`; `useReceiveFramesStore` | `feature helper`; later `widgets` display shell | 当前直接读 status + receive internals | app header 变成跨 feature state consumer | no | 等 status design 提供 snapshot / selector | system lifecycle owner、receive status mapper |
| `src/components/common/StatusIndicatorConfigDialog.vue` | status indicator config editor | `useStatusIndicatorStore`; status config types; direct settings copy/save | `feature helper` | 直接编辑 status settings，属于 status feature UI | widget 暴露 status schema and mutation | no | 等 status/settings design | generic config dialog、receive data binding owner |

### 4.5 Platform wrapper evidence related to shell/tooling

| current path / capability | current responsibility | observed dependencies | candidate owner | reason | risk | can move before feature design | condition | must not become |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/api/common/filesApi.ts` | renderer file list/path/json/text/delete wrapper | direct `window.electron.files`; imports `deepClone` | `platform consumer` | 文件能力属于 platform/files，但业务 JSON 含义不属于 platform | 旧 wrapper 作为万能文件 API 继续扩散 | conditional | 等 platform/files surface reduction；只做受控 file/path capability | feature import/export owner、任意路径读写服务 |
| `src/api/common/pathApi.ts` | data path、resolve、packaged state wrapper | direct `window.electron.path` | `platform consumer` | path/packaged state 是平台能力 | data path 常量被业务长期固化 | conditional | 等 platform/path surface reduction and packaged validation plan | storage schema、report naming owner |
| `src/api/common/systemApi.ts` | window/menu/autolaunch wrapper and fallback object | direct `window.electron.window/menu/autoLaunch` | `platform consumer`; `app shell` consumer | window/menu 是 shell/platform；autolaunch 需要单独权限面 | app shell 绕过 platform 或 settings 混入系统能力 | conditional | platform/system or platform/window design 先定 | shared window util、page direct Electron access |
| `src/api/common/timerManagerApi.ts` | timer register/start/stop/listen wrapper | direct `window.electron.timerManager`; timer types | `platform consumer` | scheduling 是平台能力；timer 用途归 feature | timer API 变成任意 custom event bus | conditional | platform/scheduling surface reduction；feature 用途由 task/status/SCOE design 决定 | task lifecycle owner、runtime bus |
| `src-electron/preload/api/files.ts` and `src-electron/main/ipc/fileMetadataHandlers.ts` | preload/main files bridge and file metadata handlers | `ipcRenderer.invoke('files:*')`; main file operations | `platform consumer` implementation | 可作为 platform/files evidence；不是 renderer shared | handler shape 被业务 schema 驱动 | no | 等 platform/preload/main boundary design | report delivery、storage schema、feature import/export logic |
| `src-electron/preload/index.ts` and `src-electron/preload/api/index.ts` | exposes aggregated `window.electron` API package | `contextBridge.exposeInMainWorld('electron', api)` and module aggregation | `delete / merge duplicate` | 目标是 typed minimal bridge via `rewrite/src/platform` facade, not big package | renderer 继续绕过 `rewrite/src/platform` | no | platform API surface reduction | final preload contract、public renderer API |

## 5. Shared minimal candidate list

| candidate | why shared | what must be excluded | duplicate sources | required tests / fixtures later | can be extracted before feature design |
| --- | --- | --- | --- | --- | --- |
| date/time formatting subset | pure Date/string formatting; already consumed across storage/history/frame display | hour-key boundary, storage retention window, timezone policy, business duration meaning | `src/utils/common/dateUtils.ts`, `frameUtils.formatDate`, `UniversalChart.vue` local formatter, component local `toLocaleString` | invalid date, timestamp/date/string inputs, display format compatibility, timezone note | yes for formatting only |
| error normalization core | converts unknown error to stable message/code/details shape without platform dependency | IPC response shape, Quasar notify/toast, logger sink, retry policy, northbound external error mapping, loading-state wrapper | `src/utils/common/errorUtils.ts`, `frameInstancesUtils.withErrorHandling`, `dialogUtils` wrappers, scattered `console.error` | Error/string/object/circular details, no-swallow behavior, adapter-specific mapping fixtures | conditional: only platform-free core |
| pure number/hex conversion subset | numeric/bytes conversion primitives can be pure TS and reused by frame/send/receive display | `SendInstanceField`, `NUMBER_DATA_TYPES` import if it is feature-owned, SCOE `MatchOperator`, send field initialization, receive comparison policy, endianness/protocol decisions | `hexCovertUtils.ts`, `frameUtils` inline hex preview, `dataProcessor`, `serialStore`, connect test tools, SCOE components | signed/unsigned range, BigInt 64-bit, invalid input, padding, case/spacing, endian assumptions documented | conditional: only after import-free subset is isolated |
| deep clone helper | used as defensive copy in old API wrappers and frame utilities; can be pure if semantics are explicit | feature model migration, Date-heavy domain assumptions, cyclic data, Map/Set, platform serialization policy | `frameUtils.deepClone`, JSON clone in config helpers, API wrapper cloning | Date, nested arrays/objects, mutation isolation, unsupported structures behavior | conditional: prefer standard `structuredClone` where available; extract only if multiple feature-neutral consumers remain |

Shared non-candidates:

- expression validation, variable mapping, frame field validation.
- send instance buffer, checksum policy, send field initialization.
- task config and strategy validation.
- receive matcher, receive mapping validation, data processor.
- SCOE frame recognition, command param resolution, completion wait.
- file/path/dialog/timer/window/platform wrappers.

## 6. Widgets and app shell candidate list

| item | candidate classification | currently reads store/platform/window.electron | required decoupling before reuse | blocks frame/settings/storage-local-baseline design |
| --- | --- | --- | --- | --- |
| file dialog flow | `app shell` + `platform/files` + feature adapter | Uses EventBus, `filesAPI`, `pathAPI`; no direct `window.electron` in main flow but `filesAPI/pathAPI` wrap it | Keep one global app shell flow; platform owns files/path/dialog primitives; feature adapters own JSON/import/export semantics; remove alternate direct dialog entry | yes for storage-local-baseline; conditional for frame/settings import/export |
| `MainLayout.vue` file dialog mount | `app shell` | Mounts `FileListDialog`; app lifecycle setup | Keep mount as shell responsibility; ensure mounted dialog is store/platform-free shell or receives adapter props | yes for app shell/file dialog gate |
| `FileListDialog.vue` | `app shell` now; `widget` only after decoupling | Yes: `fileStorageStore`, `filesAPI`; no direct `window.electron` | File list loading/deletion must move behind app/platform/storage adapter; component consumes file records and emits select/create/delete request | yes |
| `ImportExportActions.vue` | `widgets` shell + feature adapter | Indirect platform via `pathAPI` and `fileDialogManager`; no store | Remove path resolution and file dialog calls from widget shell; parent/adapter provides command and result policy | conditional; blocks if used to define import/export semantics |
| `UniversalChart.vue` | `deferred`; later `widgets/charts` display shell | Yes: `useDataDisplayStore`; no platform | Feature must provide chart view model; chart shell consumes data/config only; realtime/history mapping stays in data-display/history owner | not block frame/settings; affects storage-local-baseline/history display |
| `UniversalChartSettingsDialog.vue` | `widgets` | No store/platform; uses `localStorage` through `useLocalStorage` | Move persistence owner to settings/storage or parent adapter; keep props/emit display config shell | no, but storage/settings should own persistence |
| `StatusIndicators.vue` | `feature UI` now; later display widget | Yes: status store and receive store | status feature exposes indicator snapshot; app header passes snapshot; widget does not read receive/status internals | yes for status/app shell boundary; not blocking frame core |
| `StatusIndicatorConfigDialog.vue` | `feature UI` | Yes: status store direct mutation | Move validation/save/options behind status feature service/composable; dialog can stay status component | no for frame/storage; settings must not own status runtime truth |
| `useDragSort.ts` | `widgets` interaction utility | No platform/store; Vue and DOM events only | Keep as reorder interaction with callback; no persistence or business ordering | no |
| window controls | `app shell` + `platform/window` consumer | Direct `window.electron.window` | Replace with platform/window facade; app shell owns button/control placement | no for feature design; blocks app shell implementation |

File dialog / window controls gate:

- `codestable/architecture/rewrite-platform-app-shell-file-dialog.md` is the follow-up bridge gate for applying this owner split to `frame`、`settings`、`storage-local-baseline` implementation. This document remains the shared/tooling/app shell ownership source; the bridge gate fixes platform/preload/main/feature/runtime usage before code changes.
- File dialog state owner: app shell owns dialog open/selection UI state; platform owns native file/path/dialog capability; feature adapters own import/export semantics and persistence decisions.
- File dialog public entry: pages and feature UI may only use the app shell / feature adapter entry approved by design; they must not call EventBus, `filesAPI`, `pathAPI`, `window.electron`, or platform internals directly.
- File dialog validation level: fixture for adapter boundaries, manual for visible dialog flow, runtime for packaged data path.
- Window controls state owner: app shell owns control placement and UI snapshot; platform/window owns native window state operations; settings only owns visible user configuration if a later design confirms it.
- Window controls public entry: app shell consumes platform/window facade; pages, widgets and feature internals must not access `window.electron.window` or final bridge details directly.
- Window controls validation level: manual for visible controls and runtime for real desktop window behavior.

These gates are app shell / platform ownership placeholders only. They do not define concrete implementation, final API schema, interface signatures or event payloads.

## 7. Delete / merge duplicate plan

本节只写合并方向和 owner，不写实现。

| capability | duplicate sources | merge / delete direction | owner |
| --- | --- | --- | --- |
| file dialog multi-flow | `fileDialogManager.ts`, `layouts/useFileDialog.ts`, `MainLayout.vue`, `FileListDialog.vue`, `composables/common/useFileDialog.ts`, `dialogUtils.ts` | 保留一条 app shell flow；删除或合并 alternate composable 和 dialogUtils fallback；feature 只拿 adapter 入口 | `app shell` + `platform/files` + feature adapters |
| EventBus usage | `EventBus.ts`, file dialog open/result events, old bookmark/menu/search event enum | 限域为 app shell file dialog implementation detail or replace by shell state service；不得扩成 runtime bus | `app shell`; delete general bus usage |
| date/time formatter | `dateUtils.ts`, `frameUtils.formatDate`, `UniversalChart` formatter, component local formatters | 合并 pure display formatter；storage hour key 等留 feature | `shared/date` core + feature helpers |
| error wrapper | `errorUtils.ts`, `frameInstancesUtils.withErrorHandling`, `dialogUtils`, `ipcUtils`, scattered `console.error` | shared 只保留 normalization；UI notification、IPC response、feature mapping 各回 owner | `shared/error` core + owner adapters |
| hex conversion | `hexCovertUtils.ts`, `frameUtils` hex preview, receive/dataDisplay/connect/SCOE inline parse/format | 拆 pure conversion；field projection、send buffer、SCOE compare 留 feature | `shared/hex` core + frame/send/receive/SCOE helpers |
| timer wrapper | `useTimerManager.ts`, `timerManagerApi.ts`, main timer manager, feature/local `setInterval` | 收敛为 platform scheduling facade；feature 显式声明 timer purpose and cancellation | `platform/scheduling` + feature consumers |
| import/export shell | `ImportExportActions.vue`, `fileDialogManager`, `FrameList.vue`, FrameSend/SCOE/receive data import-export callers | UI button shell 与 file dialog 分离；业务 serialization/validation 回 feature | `widgets` shell + `app shell` + feature adapters |
| chart/display helper | `UniversalChart.vue`, `UniversalChartSettingsDialog.vue`, dataDisplay/history chart logic, special constellation chart | chart shell 吃 view model；realtime/history/statistics/sampling mapping 留 feature；special chart 作为 explicit feature exception | `widgets/charts` + data-display/history feature adapters |
| status indicator display/config | `StatusIndicators.vue`, `StatusIndicatorConfigDialog.vue`, `statusIndicators` store, receive data item options | status owns config/read model; header consumes snapshot; config dialog remains status feature UI until decoupled | `features/status` + optional display widget |

## 8. Feature helper return plan

| target feature | old capability should return | notes |
| --- | --- | --- |
| `frame` | frame/field helper, field type config lookup, frame validation, frame list filter/sort, expression config parts that define frame asset rules | Must not own receive stats, send execution, SCOE state or task lifecycle |
| `receive` | `frameMatchers`, receive mapping validation, data processing, receive label option helper after view model is fixed | Must output explicit receive results; no task/status/storage/SCOE tail-side effects |
| `send` | send instance field init, send buffer/write helper, checksum/build helper, send-time hex projection | Must not own task lifecycle or SCOE completion |
| `task` | task config file helper, strategy validation, timed/trigger local task config, task frame refs | Old local send task is not northbound task |
| `SCOE` | `scoeFrame.ts`, SCOE checksum, param resolution, receive command match, completion wait | Must be declared domain exception; no receive store read-through |
| `storage` | local file persistence semantics, history/CSV helpers, file metadata, high-speed storage rules after design | Platform only owns bounded files/path I/O; storage owns local persistence semantics |
| `status` | status indicator config/display rules, status read model source mapping | Status reads feature snapshots; it does not own receive/task truth |
| `data display/history` | UniversalChart data projection, sampling/statistics, history chart mapping, data-display store helper | If this remains under receive/storage naming later, feature design must name the owner explicitly |
| `settings` | default configuration persistence and visible user settings policy, including chart/status config persistence if selected | Settings owns config facts, not runtime truth |
| `connection` | serial/network transport target display helpers and test-tool byte formatting only after platform/connection boundary | Transport target must not become northbound device identity |

## 9. Follow-up gate

### 9.1 Can be independently designed before business feature design

- Shared date/time formatting subset.
- Shared error normalization core, excluding IPC/UI/northbound mapping.
- Shared pure number/hex conversion subset, excluding field/send/SCOE wrappers.
- `useDragSort` as widgets interaction utility.
- App shell file dialog ownership and single-flow design.
- Window controls ownership as app shell consumer of platform/window.
- `ImportExportActions` as a widget shell design, only after file dialog and feature adapter split is explicit.
- `UniversalChartSettingsDialog` as a display settings shell, only after config persistence owner is stated.

These are design-ready; only the pure shared/widgets pieces above are migration candidates. Any code movement still needs its own implementation contract and verification.

### 9.2 Must wait for platform API surface reduction

- Any replacement of `window.electron`, `src/api/common/*Api.ts`, preload API aggregation, or main IPC handler shape.
- `files/path/dialog/window/system/timer` facade naming and typed bridge exposure.
- `fileUtils.ts`, `ipcUtils.ts`, `dialogUtils.ts` process-boundary relocation or deletion.
- `FileListDialog` and `ImportExportActions` removal of direct `filesAPI/pathAPI` coupling.
- Timer/scheduling facade and timer event policy.
- Serial/network transport and high-frequency buffering boundaries.
- Packaged data path, native dialogs, and file deletion/list/load/save behavior.

### 9.3 Must wait for corresponding feature design

- `frameUtils` frame/field parts, `fieldValidation.ts`, frame defaults and expression owner.
- `frameInstancesUtils.ts`, send buffer/checksum and send instance projection.
- `taskConfigUtils.ts` and `strategyValidation.ts`.
- `frameMatchers.ts`, `frameValidators.ts`, `dataProcessor.ts`, receive label options.
- `scoeFrame.ts` and all SCOE command/completion helpers.
- `UniversalChart.vue` realtime/history chart data mapping.
- `StatusIndicators.vue` and `StatusIndicatorConfigDialog.vue`.
- storage/history/high-speed data operations and import/export semantics.
- settings schema, default values, config persistence, chart/status config persistence owner.

### 9.4 Evidence only; cannot migrate as target structure

- Old `src/utils` directory layout.
- Old `components/common` placement.
- Old `composables/common` placement.
- Old `src/api/common` aggregation and `window.electron` wrapper shape.
- Old preload `window.electron` big package exposure.
- Main receive handler business processing.
- `dialogUtils.ts` direct Electron/Node/Vue mixed utility.
- Old send task shape as northbound task candidate.
- History/CSV/local export as TestReport or file delivery candidate.
- Serial/network target as northbound `deviceId` candidate.

### 9.5 Impact on first business feature designs

`frame`:

- Can start design after this doc.
- Must use this doc to keep frame helpers inside `features/frame` unless they are on the minimal shared list.
- Must not use old `ImportExportActions` or `fileDialogManager` shape as final import/export design.
- Must list file dialog and storage persistence as platform/app-shell dependencies, not frame core responsibilities.

`settings`:

- Can start design after this doc.
- Must own configuration facts only; it cannot own runtime status, timer behavior, receive/send facts or storage file semantics.
- Must decide whether chart/status config persistence belongs to settings, status, chart/data-display or storage-local-baseline before any migration.

`storage-local-baseline`:

- Can start boundary design after this doc, but concrete file/path/dialog implementation must wait for platform API surface reduction.
- Must keep local persistence/history/CSV/migration separate from report delivery and northbound file delivery.
- Must register packaged data path and high-speed storage as runtime validation or boundary exception candidates.

## 10. First batch permission

允许进入第一批业务 feature design：`frame`、`settings`、`storage-local-baseline`。

Allowed scope:

- 只进入 feature design，不进入代码迁移或实现。
- 只定义 owner、旧可观测行为、输入输出方向、public API necessity、platform involvement、validation level and blockers。
- 不写 schema、payload、接口签名、northbound 字段、枚举或错误码。

Required direct contract for `frame` design:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
- `codestable/architecture/rewrite-shared-tooling-app-shell-ownership.md`
- `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

Required direct contract for `settings` design:

- Same foundation documents as `frame`.
- Add current settings old-code evidence only as boundary guard, not as direct contract.

Required direct contract for `storage-local-baseline` design:

- Same foundation documents as `frame`.
- Add platform API surface reduction document if it exists before storage design starts; if it does not exist, storage design must mark files/path/dialog/platform decisions as blockers or deferred dependencies.

Blocked for implementation:

- Platform API surface reduction is not yet represented in this document as a final typed API contract.
- Feature designs for frame/settings/storage-local-baseline do not yet exist.
- Packaged data path, high-speed storage, hardware/runtime and northbound delivery evidence remain outside this design.

## 11. Review stance

This document is a pre-design ownership decision, not implementation evidence.

- Pure documentation change: no build/lint is required.
- Later implementation must provide its own direct contract, changed files, verification evidence and open issues.
- A later change should be `revise-required` if it recreates `src/utils`, `components/common` or `composables/common` as a new public dumping ground.
- A later change should be `revise-required` if widgets read feature internals or platform directly.
- A later change should be `revise-required` if EventBus becomes a cross-feature runtime bus.
- A later change should be `blocked` if it depends on platform, hardware, packaged path, SCOE or customer semantics that are not in its direct contract.
