---
doc_type: architecture
type: rewrite-shared-tooling-audit-plan
status: draft
date: 2026-04-30
summary: Global pre-design audit plan for legacy common, utils, api, widgets, and composables. This document classifies shared, platform, widget, app-shell, and feature-owned candidates before any feature design or code migration.
tags:
  - rewrite
  - shared
  - platform
  - widgets
  - tooling
  - pre-design
---

# Rewrite shared tooling audit plan

## 1. Scope

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

Boundary guards:

- 当前 `src` 和 `src-electron` 旧代码事实只作为 evidence、oracle 候选和迁移风险。
- `codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。
- `src/utils` 是 legacy mixed zone，不是天然 shared 来源。
- 本文只记录旧文件 import 关系作为 evidence，不把前端生成 types 当合同；后续仍以后端 DTO 或 feature design 为类型依据。
- 本轮不进入任何 feature 内部详细设计。
- 本轮不写字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 本轮不做代码移动，不实现业务代码。

Lane judgement:

- 本轮属于 Lane B 的全局 pre-design audit。
- 当前产物只为后续 pre-design gate、feature sequencing 和平台边界设计提供归口依据。
- 本文不能替代任何 `cs-feat-design`，也不能作为业务实现合同。

Non-goals:

- 不保留旧 `window.electron` 暴露方式为正式架构。
- 不把旧 `common / utils` 目录直接平移到新 `shared`。
- 不为 shared、platform、widgets 或 feature public API 定义最终签名。
- 不把旧 main handler 中的业务处理升级为目标 main 职责。

## 2. Classification Rules

`pure shared`:

- 只能是纯 TypeScript 类型、常量或无副作用 helper。
- 不依赖 Vue、Pinia、Quasar、Electron、Node、`window.electron`、`rewrite/src/platform`、feature store 或业务 owner。
- 不能包含 frame、receive、send、task、SCOE、status、storage、northbound 等领域语义。

`platform facade`:

- renderer 侧访问桌面能力的唯一正式入口。
- 只能表达平台能力或平台资源访问，不承载业务规则、任务推进、报告语义或协议语义。
- 旧 `src/api/common/*Api.ts` 可以作为 evidence，不能照搬为正式 API。

`preload/main platform implementation`:

- preload 只暴露 typed API，不暴露裸 `invoke/send/on` 或大包 `window.electron`。
- main 只负责平台资源、生命周期、系统对话框、路径、串口、网络、文件和必要的平台侧高频缓冲。
- main 不承载 receive/send/task/SCOE/result/report/northbound 领域规则。

`widget`:

- 跨页面纯展示或通用交互组件。
- 通过 props、emit、slot 或显式 view model 接收数据。
- 不直接读取 feature store、feature internals、platform facade 或 `window.electron`。

`app shell utility`:

- 服务应用壳、布局、窗口控制、全局文件对话框、全局 UI 容器等应用层能力。
- 可以消费 platform facade，但不拥有业务语义。

`feature core` / `feature helper`:

- 任何承载领域规则、领域状态推进、领域校验、协议语义、任务语义、SCOE 特判、历史/高速存储语义的代码，默认归对应 feature。
- feature helper 只能被本 feature 内部或 feature public API 显式暴露的 adapter 使用。

`delete / merge duplicate`:

- 旧系统中重复实现、孤立 fallback、旧边界绕行或迁移后不应保留的能力。

`deferred`:

- 需要等 feature design、platform/preload/main 边界设计、hardware/runtime evidence 或甲方 northbound 口径后才能判断。

## 3. Evidence Summary

Evidence:

- `src/utils/index.ts:1` 只 re-export `src/utils/common/EventBus.ts`，不能证明 `src/utils` 是 shared 根。
- `src/utils/frames/*` 同时包含 frame 定义、字段验证、send instance、task config、SCOE operator、checksum 和 hex preview 等语义，不能整体进入 shared。
- `src/utils/receive/*` 包含 receive matching、validation、data processing、label options 和 SCOE frame 特判，属于 receive/frame/SCOE 边界材料。
- `src/utils/common/*` 混合了 Quasar EventBus、Vue lifecycle、Electron dialog、Node `fs/path`、renderer file dialog shell、main IPC helper 和纯 date/error helper。
- `src/api/common/*Api.ts` 是 renderer 侧旧平台 wrapper，统一经 `window.electron` 访问 preload 暴露能力。
- `src-electron/preload/index.ts:1-8` 通过 `contextBridge.exposeInMainWorld('electron', api)` 暴露大包能力，不能保留为目标暴露方式。
- `src-electron/main/ipc/receiveHandlers.ts:18-160` 在 main 中引入 receive utils 并处理 cache、matching、processing 和 stats，属于 main 业务化风险证据。
- `src/components/common/UniversalChart.vue`、`StatusIndicators.vue`、`StatusIndicatorConfigDialog.vue` 直接读取 feature store 或领域类型，不是纯 widget。
- 文件对话能力在 `layouts/useFileDialog.ts`、`composables/common/useFileDialog.ts`、`utils/common/fileDialogManager.ts`、`utils/common/dialogUtils.ts`、`components/common/FileListDialog.vue` 重复出现。

Inference:

- `shared` 可以提前承接的能力很少，主要是剥离后的 date/time、error normalization、纯 hex conversion 等。
- 大多数 `utils` 文件应回到 feature core/helper、platform facade、app shell 或 widgets，而不是迁入 `shared`。
- platform 能力可以先按 facade 思路归口，但旧 preload/main 的 handler 内容需要等平台边界设计和相关 feature design 后拆分。

## 4. Ownership Matrix

### 4.1 `src/utils/frames` Audit

| current path | current responsibility | observed dependencies | candidate owner | classification | reason | risk | migration precondition | move before feature design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/utils/frames/frameUtils.ts` | deep clone、日期格式化、字段类型辅助、字段 hex preview、frame/field validation、frame filtering/sorting | 旧生成 frame field 类型导入、`FIELD_TYPE_CONFIGS`，见 `frameUtils.ts:4-7`；领域校验见 `frameUtils.ts:244-344` | `features/frame`，剥离后的 `rewrite/src/shared` 子能力 | feature helper；部分 pure shared | 文件主体围绕 frame definition 和 field 语义；`deepClone`、纯 date 可被剥离 | 若整体进入 shared，会把 frame 语义和 display preview 带入 shared | frame feature design 确认 frame definition 与 validation owner；shared 只接收无业务语义函数 | 否；纯 date/deep clone 可条件前置 |
| `src/utils/frames/fieldValidation.ts` | expression syntax、data source variable mapping、circular dependency validation | `ExpressionConfig`、`DataSourceType`，见 `fieldValidation.ts:5-10`；source 包含 frame/global/current/SCOE，见 `fieldValidation.ts:86-125` | `features/frame`，并与 task/receive/SCOE 边界对齐 | feature core | 表达式和数据源属于字段定义与运行数据绑定规则，不是通用校验 | 若进 shared，会把 frame/global/SCOE 数据源规则固化成全局工具 | frame design 确认表达式 owner；interaction matrix 确认跨 feature 数据源边界 | 否 |
| `src/utils/frames/defaultConfigs.ts` | frame/send/task/label/expression 默认配置 | `nanoid`、send/field types，见 `defaultConfigs.ts:5-18`；label source 包含 receive/global/SCOE，见 `defaultConfigs.ts:138-178` | `features/frame`、`features/task`、`features/send` 分拆 | feature helper；deferred | 默认值混合静态资产、发送策略、表达式和跨 feature label source | 整体迁移会复制旧 feature 耦合和默认配置污染 | 对应 feature design 确认默认配置 owner 和可观测行为 | 否 |
| `src/utils/frames/frameInstancesUtils.ts` | send instance buffer 生成、checksum、字段写入、错误 wrapper | send instance 类型、`NUMBER_DATA_TYPES`、hex utils，见 `frameInstancesUtils.ts:5-7`；checksum 见 `frameInstancesUtils.ts:154-253` | `features/send`，少量 pure error/hex 归 shared | feature core；feature helper | 主体是发送组帧和校验和语义 | 若进 shared，会把 send buffer 规则伪装成通用工具；`withErrorHandling` 重复 | send feature design 确认组帧边界；hex/error 先抽纯语义 | 否 |
| `src/utils/frames/hexCovertUtils.ts` | number/hex conversion、field/instance hex helper、SCOE compare operator | `NUMBER_DATA_TYPES`、`SendInstanceField`、SCOE `MatchOperator`，见 `hexCovertUtils.ts:5-8` | `rewrite/src/shared` 纯 hex 子集；`features/send`/`features/receive`/`features/scoe` adapter | pure shared；feature helper；delete / merge duplicate | 纯 conversion 可以共享，但 field/instance/SCOE compare 不是 shared | 若不拆分，会把 send 和 SCOE operator 带入 shared | 先拆出纯 conversion 规则；再由 feature adapter 包装领域语义 | 条件是：只移动纯 conversion 子集 |
| `src/utils/frames/taskConfigUtils.ts` | lean task config、task config validation、task frame refs | task/send types，见 `taskConfigUtils.ts:5-10` | `features/task` | feature core；feature helper | task 生命周期、引用提取和校验属于 task owner | 若进 shared，会让 task 语义成为隐式公共工具 | task feature design 确认 task config model 和 send/frame 引用边界 | 否 |
| `src/utils/frames/strategyValidation.ts` | timed/trigger strategy validation | strategy types，见 `strategyValidation.ts:5-6` | `features/task`，必要时协同 `features/send` | feature core | 策略语义属于任务或发送调度，不是通用校验 | 若提前迁移，会锁定旧策略口径 | task/send design 确认 strategy owner | 否 |
| `src/utils/frames/index.ts` | 当前未观察到该 barrel 文件 | 文件不存在 | none | delete / merge duplicate | 不应为旧目录补 barrel | 新增 barrel 会强化旧 mixed zone | 不创建 | 否 |

`src/utils/frames` conclusion:

- 绝不能整体进入 `shared`。
- 只有 `deepClone`、date/time formatting、纯 number/hex conversion、纯 error normalization 这类无业务语义子集有 shared 候选资格。
- frame definition、field validation、expression、send instance、checksum、task strategy、SCOE compare 都必须回到对应 feature。

### 4.2 `src/utils/receive` Audit

| current path | current responsibility | observed dependencies | candidate owner | classification | reason | risk | migration precondition | move before feature design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/utils/receive/index.ts` | receive utility barrel | re-export matcher、validator、label、processor，见 `receive/index.ts:6-21` | `features/receive` | feature helper | 只是旧 receive helper 聚合 | 直接迁移会延续旧 receive 工具边界 | receive design 拆 core、adapter、UI helper 后再决定 | 否 |
| `src/utils/receive/frameMatchers.ts` | receive frame matching、identifier compare | frame/receive types、hex conversion，见 `frameMatchers.ts:5-7`；identifier compare 见 `frameMatchers.ts:63-110` | `features/receive`，与 `features/frame` 明确边界 | feature core | 匹配规则属于 receive core，依赖 frame definition projection | 若放 shared，会让 receive matching 成为全局工具 | receive design 明确 frame projection 和 matching oracle | 否 |
| `src/utils/receive/frameValidators.ts` | receive mapping validation、frame field validation | frame/receive types，见 `frameValidators.ts:5-7` | `features/receive`，与 `features/frame` 协同 | feature core | 校验接收配置和字段映射，属于 receive 配置语义 | 若进 shared，会复制 feature 间 schema 假设 | receive/frame design 确认配置边界 | 否 |
| `src/utils/receive/dataProcessor.ts` | data packet matching、field extraction、data group mutation | frame/receive types、matcher、hex utils，见 `dataProcessor.ts:6-16`；mutating groups 见 `dataProcessor.ts:574-600` | `features/receive` | feature core | 处理接收数据、提取字段和更新 group 是 receive 领域规则 | 旧 main handler 也调用它，存在 renderer/main 业务边界混乱 | receive design 决定 core 所在层、batch/snapshot 策略和 main 只保留何种平台缓冲 | 否 |
| `src/utils/receive/labelOptionGenerators.ts` | receive label option generation and display formatting | frame field type，见 `labelOptionGenerators.ts:4`；display formatting 见 `labelOptionGenerators.ts:99-129` | `features/receive` UI helper 或 `widgets` adapter | feature helper；widget；deferred | 既有 label source 语义，又服务 UI options | 若直接做 widget，会读取 receive internals | receive design 提供 view model 或 public selector | 否 |
| `src/utils/receive/scoeFrame.ts` | SCOE frame identification、checksum、param resolution、completion condition wait | receive store import，见 `scoeFrame.ts:5`；completion 读 store 见 `scoeFrame.ts:416-491`；`setInterval` wait 见 `scoeFrame.ts:501-539` | `features/scoe`，与 receive 明确 adapter | feature core | SCOE 是独立领域能力，不是 receive 通用工具 | 直接进入 receive/shared 会固化 SCOE 特判和 store 穿透；runtime wait 缺少取消语义 | SCOE design、receive interaction design、必要硬件或 fixture oracle | 否 |

`src/utils/receive` conclusion:

- receive matcher、validator、processor 必须进入 receive feature core/helper。
- SCOE helper 必须归 SCOE feature，通过 receive 显式边界接入。
- label option 这类 UI helper 只能在 receive public view model 明确后成为 widget adapter，不得让 widget 读 receive internals。

### 4.3 `src/utils/common` and Common Composables Audit

| current path / capability | current responsibility | observed dependencies | candidate owner | classification | reason | risk | migration precondition | move before feature design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/utils/index.ts` | legacy utils barrel | only exports `./common/EventBus`，见 `src/utils/index.ts:1` | none | delete / merge duplicate | 只强化旧 mixed zone，没有新架构价值 | 继续引用会让新代码绕过目标目录 | 建立目标 owner 后删除或停止扩展 | 否 |
| `src/utils/common/EventBus.ts` | Quasar EventBus wrapper and lifecycle listener | Quasar EventBus、Vue lifecycle，见 `EventBus.ts:1-2`；event enum 主要是 file dialog，见 `EventBus.ts:5-15` | `rewrite/src/app` shell，限域文件对话框 | app shell utility；delete / merge duplicate | 不是纯事件总线，当前主要服务文件对话框 shell | 若泛化为 runtime bus，会绕开 feature public API | app shell file-dialog 方案确认后限域或替换 | 条件是：仅作为 app shell 内部实现 |
| `src/utils/common/dateUtils.ts` | pure date/time formatting and calculation | 纯 Date helper，见 `dateUtils.ts:10-152` | `rewrite/src/shared` | pure shared | 无 Vue/Electron/业务 owner 依赖 | 需统一和组件内、`frameUtils.formatDate` 的格式口径 | 统一 date/time formatting policy，不引入业务语义 | 是 |
| `src/utils/common/errorUtils.ts` | error wrapper、response format、logger、assert、IPC error format | pure TS error utilities，见 `errorUtils.ts:23-189` | `rewrite/src/shared` core；platform/main adapter | pure shared；platform facade；delete / merge duplicate | 通用错误标准化可共享，但 IPC response format 要分层 | 如果把 IPC response 也放 shared core，会绑定平台实现 | 先定义 shared error normalization 和 platform adapter 分界 | 条件是：只移动平台无关 core |
| `src/utils/common/dialogUtils.ts` | native dialog、JSON import/export、confirm/message、custom dialog fallback | Electron dialog、BrowserWindow、Node `fs/path`、Vue inject，见 `dialogUtils.ts:6-12` | `rewrite/src/platform` implementation；`rewrite/src/app` shell；部分 delete | deferred；delete / merge duplicate | 混合 main/preload 能力、renderer fallback 和 app shell UI | 若保留，会继续绕开 platform facade 和 file dialog shell | platform file/dialog boundary 和 app shell file-dialog owner 确认 | 否 |
| `src/utils/common/fileDialogManager.ts` | EventBus driven file dialog request and JSON import/export shell | EventBus、`filesAPI`，见 `fileDialogManager.ts:1-3` | `rewrite/src/app` shell；platform/files consumer | app shell utility；platform facade consumer | 当前是主文件对话框调度链路的一部分 | 若直接抽 widgets，会让 widget 持有平台能力 | 先统一 file dialog shell 与 platform/files facade | 条件是：作为 app shell，不作为 shared |
| `src/utils/common/fileUtils.ts` | ensure/load/save/exist local JSON file helpers | Node `fs/path`，见 `fileUtils.ts:6-7` | preload/main platform implementation 或删除 | preload/main platform implementation；delete / merge duplicate | renderer tree 下 Node 文件能力不符合目标边界 | 若迁入 shared，会破坏 renderer 无 Node 规则 | platform/files design 确认是否还有本地文件 helper 需求 | 否 |
| `src/utils/common/ipcUtils.ts` | main IPC handler registry and error wrapping | Electron `ipcMain`、error utils，见 `ipcUtils.ts:6-7` | `src-electron/main` platform implementation | preload/main platform implementation | 属于 main IPC 基础设施，不应位于 renderer `src/utils` | 如果被 renderer 引用，会混淆进程边界 | platform/preload/main boundary design 后移入 main tooling | 否 |
| `src/layouts/useFileDialog.ts` | MainLayout file dialog state and EventBus listener | Vue reactive、EventBus、FileRecord，见 `useFileDialog.ts:1-3`；listener 见 `useFileDialog.ts:26-83` | `rewrite/src/app` shell | app shell utility | 当前全局 FileListDialog 主链路 | 依赖旧 EventBus 和 FileRecord 语义 | app shell file-dialog owner 确认，platform files facade 确认 | 条件是：随 app shell 前置 |
| `src/layouts/MainLayout.vue` file dialog mount | 全局挂载 FileListDialog | `FileListDialog` import/useFileDialog，见 `MainLayout.vue:25-44` | `rewrite/src/app` shell | app shell utility | 属于应用壳布局职责 | 若 FileListDialog 直接操作 feature store，会污染 app shell | FileListDialog 平台/存储依赖剥离 | 条件是：先做 app shell 设计 |
| `src/composables/common/useFileDialog.ts` | local file dialog composable, get full path | direct `window.electron.files.getFullPath` and path import，见 `useFileDialog.ts:1-3`、`:38-68` | delete / merge into app shell file dialog | delete / merge duplicate；platform facade consumer | 与 layout/fileDialogManager 重复，并直接读旧 `window.electron` | 若迁移，会保留旧平台暴露方式 | app shell file-dialog 方案确认后删除或合并 | 否 |
| `src/composables/common/useDragSort.ts` | generic drag sort interaction | Vue only，见 `useDragSort.ts:1`；document events 见 `useDragSort.ts:38-241` | `rewrite/src/widgets` composable | widget | 通用交互能力，未观察到业务依赖 | document event 清理和移动端/可访问性需复核 | widgets interaction utility policy | 是 |
| `src/composables/common/useLocation.ts` | IP geolocation fetch and coordinate formatting | Vue；external `fetch('https://ipapi.co/json/')`，见 `useLocation.ts:38-75` | deferred；feature helper | deferred；feature helper | 外部网络、定位语义和 global stats 使用场景未锁定 | 自动外部请求可能影响离线/隐私/打包态行为 | status/global stats 或 settings feature design 确认需求 | 否 |
| `src/composables/common/useTimerManager.ts` | timer register/unregister lifecycle wrapper | Vue、`timerManagerAPI`，见 `useTimerManager.ts:5-11`；cleanup 见 `useTimerManager.ts:226-251` | platform scheduling facade consumer；feature helper | platform facade；feature helper | 是旧 timer platform wrapper 的 composable consumer | 若变 shared，会把平台调度和 feature lifecycle 混入 shared | platform timer/scheduling boundary；task/status/SCOE 对 timer 的需求确认 | 否 |
| `src/composables/window/useWindowControls.ts` | window minimize/maximize/close controls | direct `window.electron.window`，见 `useWindowControls.ts:16-55` | `rewrite/src/app` shell，through `rewrite/src/platform` | app shell utility；platform facade consumer | 窗口控制是 app shell 行为，但访问必须经 platform facade | 直接保留会绕过平台 facade | platform window facade 和 app shell layout 确认 | 条件是：改为 platform consumer 后可前置 |

### 4.4 `src/api/common`, Preload, and Main Boundary Audit

| current path / capability | current responsibility | observed dependencies | candidate owner | classification | reason | risk | migration precondition | move before feature design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/api/common/index.ts` | aggregate renderer API wrappers | aggregates system/files/serial/network/path/receive/dataStorage/highSpeed/history/timer，见 `index.ts:6-34` | `rewrite/src/platform` facade entry split by capability | platform facade；delete / merge duplicate | 旧聚合是 facade 候选证据，不是正式 API | 大包聚合会复制 `window.electron` 能力面 | platform capability map 设计 | 条件是：只建 facade 思路，不定义最终 schema |
| `src/api/common/filesApi.ts` | renderer files wrapper | `window.electron.files`，见 `filesApi.ts:9-81` | `rewrite/src/platform/files` | platform facade | 文件读写、路径解析和 dialogs 属于平台能力 | 可能混入 import/export 业务语义 | platform/files boundary；app shell file dialog plan | 条件是：平台能力层可前置 |
| `src/api/common/pathApi.ts` | data path、resolve、packaged state wrapper | `window.electron.path`，见 `pathApi.ts:7-28` | `rewrite/src/platform/path` | platform facade | 打包态路径是平台能力 | 打包态 data path 未验证前不能宣称闭环 | platform/path boundary；packaged data path validation plan | 条件是：只迁 facade，不迁业务 |
| `src/api/common/systemApi.ts` | window/menu/autolaunch wrapper | fallback `electronAPI`，见 `systemApi.ts:7-22`；window/menu/autolaunch 见 `systemApi.ts:25-87` | `rewrite/src/platform/system` and app shell | platform facade；app shell utility | 系统窗口与菜单是 app/platform 边界 | autolaunch 不能通过 preload 直接泄露 app 能力 | platform/system design and preload typed API | 条件是：window/menu 可前置，autolaunch 需边界复核 |
| `src/api/common/timerManagerApi.ts` | renderer timer manager wrapper | timer types and `window.electron.timerManager`，见 `timerManagerApi.ts:6-188` | `rewrite/src/platform/scheduling` | platform facade | 定时调度可作为平台调度能力 | task/SCOE/status 语义不能进入 platform timer | platform scheduling boundary；feature consumer 需求确认 | 条件是：只迁调度 facade |
| `src/api/common/serialApi.ts` | serial port wrapper and connection operations | `deepClone` from frameUtils, serial types, `window.electron.serial`，见 `serialApi.ts:6-144` | `rewrite/src/platform/connection` | platform facade；deferred | 串口是平台资源，但连接状态与 transport 语义需要 connection feature 协同 | 若照搬会把旧 connection/serial 语义穿过 platform | connection/platform design；hardware validation plan | 否 |
| `src/api/common/networkApi.ts` | TCP/UDP network wrapper and connection operations | `deepClone`、network types、`window.electron.network`，见 `networkApi.ts:6-101` | `rewrite/src/platform/connection` | platform facade；deferred | 网络是平台资源，但连接目标、transport mode 和状态语义需设计 | 若照搬会保留旧 target 与 northbound/device 误等价风险 | connection/platform design；TCP/UDP runtime validation | 否 |
| `src/api/common/receiveApi.ts` | renderer wrapper for receive data/cache processing | frame/receive types、`window.electron.receive`，见 `receiveApi.ts:6-150` | `features/receive` core plus platform channel | feature core；platform facade；deferred | 旧 API 让 receive 业务语义穿过 `window.electron` | main 业务化和 renderer/main 边界错位 | receive design 决定 core 所在层；platform only transports events/snapshots | 否 |
| `src/api/common/dataStorageApi.ts` | dynamic data storage operations | `DATA_PATH_MAP` and `window.electron.dataStorage`，见 `dataStorageApi.ts:6-90` | `features/storage` plus `rewrite/src/platform/files/path` | feature helper；platform facade；deferred | 数据存储语义不是纯文件能力 | 若照搬会把 storage schema 和 path map 直接固化 | storage feature design；packaged path evidence | 否 |
| `src/api/common/historyDataApi.ts` | history data operations | history types and `window.electron.historyData`，见 `historyDataApi.ts:6-124` | `features/history` plus platform files/path | feature helper；deferred | history 不是通用 storage，也不等于 report/file delivery | 若放 platform，会把历史业务塞进平台 | history/storage feature design；report/northbound 边界确认 | 否 |
| `src/api/common/highSpeedStorageApi.ts` | high-speed storage operations | high-speed types and `window.electron.highSpeedStorage`，见 `highSpeedStorageApi.ts:6-80` | `features/storage` or dedicated high-speed storage feature | feature core；deferred | 高速存储涉及硬件/runtime/path 证据 | 静态审计不能证明吞吐、打包路径或硬件链路 | high-speed storage design；runtime/hardware validation | 否 |
| `src-electron/preload/api/index.ts` | preload API module aggregation | imports all API modules and exposes `apiModules`，见 `preload/api/index.ts:1-31` | preload typed API per platform capability | preload/main platform implementation | 可作为能力清单 evidence | 大包暴露会继续扩大 renderer 权限面 | platform/preload/main boundary design | 否 |
| `src-electron/preload/index.ts` | exposes `window.electron` | `contextBridge.exposeInMainWorld('electron', api)`，见 `preload/index.ts:1-8` | preload typed API | preload/main platform implementation；delete / merge duplicate | 旧暴露方式与目标 typed API 不一致 | 若保留，renderer 可继续绕过 platform facade | preload typed API design | 否 |
| `src-electron/main/ipc/index.ts` | registers all main IPC handlers | setupIPC registers serial/network/files/receive/storage/history/highSpeed/timer/path/system，见 `main/ipc/index.ts:1-22` | main platform implementation split by capability | preload/main platform implementation；deferred | 是 main 能力入口清单 | 当前 handler 中混入业务，不能整体保留 | platform/main boundary design and feature design | 否 |
| `src-electron/main/ipc/receiveHandlers.ts` | receive cache, matching, processing, stats in main | imports receive utils，见 `receiveHandlers.ts:18-25`；handle data 见 `receiveHandlers.ts:32-160` | `features/receive` core outside main；main only platform buffering if needed | feature core；preload/main platform implementation；deferred | main 承载 receive 业务处理，是迁移风险 | 若照搬会违反 main 不承载业务规则 | receive design；high-frequency dataflow design | 否 |
| `src-electron/main/ipc/timerManagerHandlers.ts` | main timer instances and timer events | BrowserWindow, timer types, handler registry，见 `timerManagerHandlers.ts:6-457` | main scheduling implementation plus platform facade | preload/main platform implementation | 调度实现可在 main，但业务语义不应进入 | feature may overuse timer as hidden runtime bus | platform scheduling design；feature consumer limits | 条件是：只保留平台调度实现 |

`src/api/common` conclusion:

- `filesApi`、`pathApi`、`systemApi`、`timerManagerApi` 是 renderer 侧旧平台 wrapper，可作为 `rewrite/src/platform` facade 迁移 evidence。
- `serialApi`、`networkApi` 是平台资源 wrapper，但 connection/transport 状态语义必须与 connection feature design 对齐。
- `receiveApi`、`dataStorageApi`、`historyDataApi`、`highSpeedStorageApi` 已把业务语义穿过 `window.electron`，必须等对应 feature design 或 runtime/hardware evidence。
- preload/main 的旧能力只能作为迁移证据，不能保留旧大包 `window.electron` 暴露方式。

### 4.5 Common Widgets and UI Composables Audit

| current path / capability | current responsibility | observed dependencies | candidate owner | classification | reason | risk | migration precondition | move before feature design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/components/common/ImportExportActions.vue` | generic import/export buttons with callbacks | Vue/Quasar、fileDialogManager、pathAPI，见 `ImportExportActions.vue:1-15`；handlers 见 `:28-115` | `rewrite/src/widgets` shell plus feature adapters | widget；app shell utility；platform facade consumer | UI pattern 可复用，业务导入导出由 props callback 承接 | 直接持有 file dialog/platform path，会让 widget 消费平台 | app shell file dialog 和 import/export feature adapter 边界 | 条件是：剥离平台访问后可前置 |
| `src/components/common/FileListDialog.vue` | global file picker/list dialog | fileStorageStore、filesAPI，见 `FileListDialog.vue:1-6`；delete via filesAPI 见 `:90-110` | `rewrite/src/app` shell or widget shell; platform/files service | app shell utility；widget；platform facade consumer | 当前由 MainLayout 全局挂载，属于 app shell 文件选择体验 | 直接读 store 和 platform 会污染 widget | 文件 storage service 或 platform facade 明确后拆分 | 条件是：先剥离 store/platform direct access |
| `src/components/common/UniversalChart.vue` | realtime/history chart display, statistics, sampling, resize | ECharts、history/receive types、`useDataDisplayStore`，见 `UniversalChart.vue:1-7`、`:67`、`:176-191` | feature UI first; later `rewrite/src/widgets/charts` display shell | feature helper；widget；deferred | 当前读取 feature store 和领域 types，不是纯 chart widget | 直接迁 widgets 会让 widgets 读 feature internals | data-display/receive/history design 提供 chart view model | 否 |
| `src/components/common/UniversalChartSettingsDialog.vue` | chart settings dialog | props/emit and local storage，见 `UniversalChartSettingsDialog.vue:1-37`、`:62`、`:104-112` | `rewrite/src/widgets/charts` | widget | 主要通过 props/emit，接近纯配置 UI | localStorage key/schema 和 chart config ownership 需明确 | widgets chart settings policy；config persistence owner | 条件是：配置持久化 owner 明确后可前置 |
| `src/components/common/StatusIndicators.vue` | status indicator display | status store and receive store，见 `StatusIndicators.vue:27-44` | `features/status` UI | feature helper | 直接读取 status/receive store，不是通用 widget | 若迁 widgets，会违反 widgets 不读 feature internals | status feature design；receive public snapshot | 否 |
| `src/components/common/StatusIndicatorConfigDialog.vue` | status indicator config editor | status store and config types，见 `StatusIndicatorConfigDialog.vue:108-160`；direct mutation 见 `:255-282` | `features/status` UI | feature helper | 直接编辑 status settings | 若做 widget，会把 status schema 暴露到 widgets | status/settings feature design | 否 |
| chart/display helper capability | chart rendering, statistics, sampling, settings | distributed in `UniversalChart.vue` and chart settings dialog | `rewrite/src/widgets/charts` plus feature adapters | widget；feature helper；deferred | display shell 可 widget 化，data projection 属 feature | 提前抽象会固化 realtime/history 旧数据模型 | feature-provided chart view model | 否 for `UniversalChart`; 条件是 settings dialog |
| status indicator capability | status display and config | distributed in status components and receive/status stores | `features/status` | feature helper | status 语义和 config owner 未独立设计 | widget 直接读 receive/status internals | status design and interaction matrix | 否 |
| drag sort capability | generic drag interaction | `src/composables/common/useDragSort.ts` Vue only | `rewrite/src/widgets` | widget | 通用交互 composable | document event lifecycle 需验证 | widgets utility acceptance | 是 |
| timer wrapper capability | component lifecycle timer registration | `useTimerManager.ts` + `timerManagerApi.ts` + main timer manager | `rewrite/src/platform/scheduling` plus feature consumers | platform facade；feature helper | 调度实现和 feature 使用必须分层 | 手写 interval 与 main timer manager 并存，隐藏 runtime 行为 | platform scheduling design | 否 |
| window controls capability | app window controls | `useWindowControls.ts` direct `window.electron.window` | `rewrite/src/app` shell through `rewrite/src/platform/system` | app shell utility；platform facade consumer | 应属于 app shell，但必须经 platform facade | 直接访问旧 API 违反 renderer 边界 | platform system/window facade | 条件是：先改为 facade consumer |

Widgets conclusion:

- 可以成为 widgets 的只有剥离平台和 feature 依赖后的展示/交互 shell，例如 drag sort、chart settings dialog、import/export button shell。
- `UniversalChart`、status indicators 和 file list dialog 当前都直接读取 feature store 或平台 wrapper，必须先通过 app shell、platform facade 或 feature view model 解耦。
- widgets 不得直接读 feature internals，不得直接调用 `window.electron` 或旧 `src/api/common`。

## 5. `src/utils` Hard Audit Conclusions

绝不能进入 `shared`:

- `src/utils/frames/fieldValidation.ts`
- `src/utils/frames/defaultConfigs.ts`
- `src/utils/frames/frameInstancesUtils.ts`
- `src/utils/frames/taskConfigUtils.ts`
- `src/utils/frames/strategyValidation.ts`
- `src/utils/receive/frameMatchers.ts`
- `src/utils/receive/frameValidators.ts`
- `src/utils/receive/dataProcessor.ts`
- `src/utils/receive/scoeFrame.ts`
- `src/utils/common/EventBus.ts`
- `src/utils/common/dialogUtils.ts`
- `src/utils/common/fileDialogManager.ts`
- `src/utils/common/fileUtils.ts`
- `src/utils/common/ipcUtils.ts`
- `src/composables/common/useFileDialog.ts`
- `src/composables/common/useLocation.ts`
- `src/composables/common/useTimerManager.ts`

可能进入 `shared`，但必须先剥离业务语义:

- `src/utils/common/dateUtils.ts`: 可作为 date/time shared helper 的主候选。
- `src/utils/common/errorUtils.ts`: 只剥离平台无关 error normalization；IPC response adapter 不进 shared core。
- `src/utils/frames/frameUtils.ts`: 只考虑 `deepClone`、纯 date formatting 等非 frame 子能力。
- `src/utils/frames/hexCovertUtils.ts`: 只考虑纯 number/hex conversion；field/instance/SCOE operator 留在 feature adapter。

应回到 feature 的能力:

- `features/frame`: frame definition helper、field type helper、field validation、expression validation、frame config defaults。
- `features/receive`: frame matching、receive validation、data processing、receive label options。
- `features/send`: send instance buffer、field-to-buffer、checksum、send-time hex projection。
- `features/task`: task config、strategy validation、task frame refs。
- `features/scoe`: SCOE frame identification、checksum validation、parameter resolution、completion condition wait。
- `features/storage` / history / high-speed storage: data storage、history storage、高速存储 wrapper 中的业务语义。
- `features/status`: status indicator display/config and status data source rules。

属于 platform/main/preload 边界问题:

- `src/utils/common/fileUtils.ts`: renderer tree 下 Node `fs/path` 能力。
- `src/utils/common/ipcUtils.ts`: renderer tree 下 main IPC handler tooling。
- `src/utils/common/dialogUtils.ts`: Electron dialog、BrowserWindow、Node file IO 和 Vue inject 混杂。
- `src/api/common/*Api.ts`: 旧 renderer platform wrapper。
- `src-electron/preload/index.ts`: 旧大包 `window.electron` 暴露方式。
- `src-electron/main/ipc/receiveHandlers.ts`: main 中承载 receive 业务处理。

重复实现:

- file dialog: `fileDialogManager.ts`、`layouts/useFileDialog.ts`、`dialogUtils.ts`、`composables/common/useFileDialog.ts`、`FileListDialog.vue`。
- date/time format: `dateUtils.ts`、`frameUtils.formatDate`、若干组件内局部格式化。
- error wrapper: `errorUtils.ts`、`ipcUtils.ts`、`dialogUtils.ts`、`frameInstancesUtils.withErrorHandling`。
- hex conversion: `hexCovertUtils.ts` 与多处 inline `parseInt` / `toString(16)`。
- timer manager: `useTimerManager.ts`、`timerManagerApi.ts`、main timer manager 和局部 `setInterval`。
- EventBus: 当前主要服务文件对话框，不应发展为全局 runtime bus。

## 6. `src/api/common` Audit

Renderer side old platform wrappers:

- `filesApi.ts`
- `pathApi.ts`
- `systemApi.ts`
- `timerManagerApi.ts`
- `serialApi.ts`
- `networkApi.ts`
- `receiveApi.ts`
- `dataStorageApi.ts`
- `historyDataApi.ts`
- `highSpeedStorageApi.ts`

业务语义穿过 `window.electron` 的重点风险:

- `receiveApi.ts`: receive matching、cache、processing 通过 `window.electron.receive`。
- `dataStorageApi.ts`: storage data path map 和业务数据操作通过 `window.electron.dataStorage`。
- `historyDataApi.ts`: history 语义通过 `window.electron.historyData`。
- `highSpeedStorageApi.ts`: 高速存储语义通过 `window.electron.highSpeedStorage`。
- `serialApi.ts` / `networkApi.ts`: 平台资源 wrapper 中混有 connection target 和 transport 状态语义。

应迁到 `rewrite/src/platform` facade 思路的能力:

- files and dialogs: platform/files + app shell file dialog。
- path and packaged state: platform/path。
- system/window/menu/autolaunch: platform/system，app shell 只消费窗口控制能力。
- scheduling/timer: platform/scheduling，feature 只能作为 consumer。
- serial/network transport: platform/connection，connection feature 负责目标和状态语义。

只能作为迁移证据，不能保留旧暴露方式:

- `src-electron/preload/api/index.ts` 的 module aggregation。
- `src-electron/preload/index.ts` 的 `window.electron` 大包暴露。
- main IPC handler 聚合中的业务 handler 组织。
- 任何 renderer 直接访问 `window.electron` 的 composable 或 component。

本节不定义 typed API schema。后续 platform/preload/main 边界设计只应先定义能力归口、权限面和验证方式，再由具体 feature design 决定业务 payload。

## 7. Common Widgets and Composables Audit

File dialog:

- 主链路是 `fileDialogManager.ts` -> `EventBus` -> `layouts/useFileDialog.ts` -> `MainLayout.vue` -> `FileListDialog.vue`。
- `composables/common/useFileDialog.ts` 和 `dialogUtils.ts` 中的 fallback/直连实现是重复候选。
- 归口方向是 app shell owns dialog state and global dialog mount，platform/files owns file/path operations，feature adapters own import/export semantics。
- 不应把 file dialog 放进 `shared`。

Chart and chart settings:

- `UniversalChart.vue` 当前是 feature UI，因为它直接读取 data display store、receive/history types、statistics 和 realtime 更新。
- `UniversalChartSettingsDialog.vue` 接近 widget，但 localStorage key、chart config persistence 和 display setting owner 需要先定。
- 归口方向是 widgets/charts 只承载 display shell 和 settings UI，receive/history/data-display feature 提供 view model。

Import/export actions:

- `ImportExportActions.vue` 可成为 widget shell，但当前直接用 file dialog manager 和 path API。
- 归口方向是 widget button shell + app shell file dialog + feature import/export adapter。
- import/export 的业务语义不能进入 widget。

Status indicators:

- `StatusIndicators.vue` 和 `StatusIndicatorConfigDialog.vue` 当前直接读写 status store，并读取 receive store 数据源。
- 归口方向是 `features/status`，后续只有 status feature 提供稳定 view model 后，才可把展示壳拆为 widget。

Drag sort:

- `useDragSort.ts` 是 Vue-only generic interaction composable，可作为 widgets interaction utility 的前置候选。
- 前置迁移需要补充生命周期清理和跨页面使用约束，不涉及业务规则。

Timer wrapper:

- `useTimerManager.ts` 是 platform scheduling facade consumer，不是 shared。
- task/status/SCOE 等 feature 使用 timer 时必须显式登记用途、取消策略和验证方式。

Window controls:

- `useWindowControls.ts` 属于 app shell utility。
- 迁移前必须先通过 platform/system 或 platform/window facade，禁止继续直接访问 `window.electron.window`。

## 8. Duplicate Capability Consolidation Recommendations

| capability | current duplicates | recommended owner | consolidation direction |
| --- | --- | --- | --- |
| file dialog | `fileDialogManager.ts`、`layouts/useFileDialog.ts`、`dialogUtils.ts`、`composables/common/useFileDialog.ts`、`FileListDialog.vue` | `rewrite/src/app` shell + `rewrite/src/platform/files` + feature adapters | 保留一个 app shell file dialog flow；platform 只做文件和路径能力；feature adapter 负责导入导出语义；删除或合并重复 fallback |
| date/time format | `dateUtils.ts`、`frameUtils.formatDate`、component local formatters | `rewrite/src/shared/date` | 统一纯 date/time helper；feature 只提供业务时区/格式策略输入，不复制 formatter |
| error handling wrapper | `errorUtils.ts`、`ipcUtils.ts`、`dialogUtils.ts`、`frameInstancesUtils.withErrorHandling` | `rewrite/src/shared/error` core + platform/main adapters | shared 只做 error normalization；IPC response、dialog message 和 feature error mapping 各在 owner 层适配 |
| hex conversion | `hexCovertUtils.ts`、inline `parseInt/toString(16)` | `rewrite/src/shared/hex` pure core + frame/send/receive/SCOE adapters | 先拆纯 conversion；业务比较、field projection、SCOE operator 和 send instance formatting 留在 feature |
| timer manager | `useTimerManager.ts`、`timerManagerApi.ts`、main timer manager、局部 `setInterval` | `rewrite/src/platform/scheduling` + feature consumers | 统一调度 facade；feature 显式注册用途和取消策略；SCOE wait 等硬件链路等待不能隐藏在 shared |
| import/export shell | `ImportExportActions.vue`、file dialog manager、feature import/export callbacks | `rewrite/src/widgets` shell + `rewrite/src/app` shell + feature adapters | button shell 只负责交互；file dialog 归 app/platform；业务序列化和校验归 feature |
| chart/display helper | `UniversalChart.vue`、`UniversalChartSettingsDialog.vue`、data display store logic | `rewrite/src/widgets/charts` + data-display/receive/history adapters | chart shell 只吃 view model；statistics、sampling、history/realtime mapping 归 feature |
| EventBus usage | `EventBus.ts` currently serving file dialog | `rewrite/src/app` shell only | 限域为 app shell implementation detail；不得成为跨 feature runtime bus |

## 9. Follow-up Gates

可以在 feature design 前独立迁移的能力:

- `src/utils/common/dateUtils.ts` 的纯 date/time helper。
- `src/utils/common/errorUtils.ts` 的平台无关 error normalization core。
- `src/utils/frames/hexCovertUtils.ts` 的纯 number/hex conversion 子集，前提是先剥离 send/receive/SCOE 语义。
- `src/composables/common/useDragSort.ts` 作为 widgets interaction utility。
- `UniversalChartSettingsDialog.vue` 的展示配置 UI，前提是先明确配置持久化 owner，不迁移业务数据模型。
- app shell window controls，前提是先建立 platform/window facade consumer，不继续直连 `window.electron`。

必须等对应 feature design 的能力:

- frame: `frameUtils.ts` 的 frame/field 部分、`fieldValidation.ts`、`defaultConfigs.ts` 中 frame defaults。
- receive: `frameMatchers.ts`、`frameValidators.ts`、`dataProcessor.ts`、receive label options。
- send: `frameInstancesUtils.ts`、send instance hex projection、checksum、send buffer helpers。
- task: `taskConfigUtils.ts`、`strategyValidation.ts`。
- SCOE: `scoeFrame.ts` 和任何 SCOE operator、completion condition、param resolution。
- status: `StatusIndicators.vue`、`StatusIndicatorConfigDialog.vue`。
- data display/history: `UniversalChart.vue` realtime/history/statistics。
- storage/history/report: `dataStorageApi.ts`、`historyDataApi.ts` 和 import/export feature semantics。

必须等 platform/preload/main 边界设计的能力:

- `src/api/common/*Api.ts` 到 `rewrite/src/platform` facade 的正式边界。
- preload typed API 替换旧 `window.electron` 大包暴露。
- `src-electron/main/ipc/*` 中平台实现与业务规则的拆分。
- files/path/system/window/timer 这些平台能力的 renderer facade。
- serial/network transport 能力与 connection feature 的分界。
- renderer tree 下 `fileUtils.ts`、`ipcUtils.ts`、`dialogUtils.ts` 的进程边界归位。

必须等 northbound / SCOE / hardware / packaged data path evidence 的能力:

- high-speed storage and high-throughput data path。
- SCOE completion wait、checksum、device response 和硬件闭环。
- serial/TCP/UDP 真实 runtime 链路。
- packaged data path、history storage、local file persistence。
- HTTP/FTP northbound delivery、TestReport、result/report/file delivery 语义。

应该删除或合并，而不是迁移的能力:

- `src/utils/index.ts` 旧 barrel。
- `src/composables/common/useFileDialog.ts` 与主 file dialog flow 重复的直连实现。
- `src/utils/common/dialogUtils.ts` 中混合 Electron/Node/Vue 的 fallback 路径，除非后续被拆成明确 app/platform owner。
- `src/utils/common/fileUtils.ts` 在 renderer tree 下的 Node file helper。
- `frameInstancesUtils.withErrorHandling`、`dialogUtils` error wrapper 等重复 error handling。
- `frameUtils.formatDate` 和组件内局部 date formatter。
- 非 app shell 需要的泛化 EventBus usage。

## 10. Pre-design Outcome

可以进入下一轮 pre-design gate / feature sequencing:

- 可以。本文已经将 shared、platform、widgets、app shell 和 feature helper 的候选归口分开，足以支持下一轮对 feature sequencing 的排序讨论。

不能进入代码迁移或 feature implementation:

- 不能。当前仍缺少 platform/preload/main 边界设计、各 feature design、SCOE/hardware/runtime evidence 和 packaged data path 验证计划。

Blocking items for actual migration:

- platform facade 能力清单和 preload/main typed boundary 未设计。
- receive/send/task/SCOE/status/storage/data-display 等 feature design 未完成。
- high-speed storage、serial/TCP/UDP、SCOE 和 packaged data path 缺少 runtime/hardware validation。
- northbound/result/report/file delivery 语义不能从旧 history/CSV/local export 推断。

Review stance:

- 本文结论是 pre-design 归口判断，不是实现完成声明。
- 后续任何迁移 PR 都必须重新列出直接合同、边界护栏、可观测旧行为、验证证据和 open issues。
