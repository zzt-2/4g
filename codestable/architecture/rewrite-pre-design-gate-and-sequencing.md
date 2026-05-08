---
doc_type: architecture
type: rewrite-pre-design-gate-and-sequencing
status: draft
date: 2026-04-30
summary: Global pre-design gate, feature sequencing proposal, and platform API surface reduction plan before any feature design starts.
tags:
  - rewrite
  - pre-design
  - sequencing
  - platform
  - electron
  - api-surface
---

# Rewrite pre-design gate and sequencing

## 1. Scope

本轮是东方红上位机重写的全局预设计阶段，对话 5：Pre-design Gate / Feature Sequencing / Platform API Surface Reduction。

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

Boundary guards:

- 当前 `src`、`src-electron` 和 `public` 旧代码事实只作为 evidence、oracle 候选和迁移风险。
- `codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。
- 涉及 northbound / result / report / file delivery 时，额外参考 `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`，但不把它扩展成接口合同。

Lane judgement:

- 本轮属于 Lane B 的全局 pre-design 收口。
- 本文是后续 `cs-feat-design` 的前置门禁和排序材料，不是任何 feature 的详细设计。

Non-goals:

- 不写业务代码。
- 不移动代码。
- 不把旧 `src/api/common/*` 一一迁到 `rewrite/src/platform/*`。
- 不写字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 不为 preload/main/renderer 定义最终 API schema。
- 不进入 receive / send / task / SCOE / result / report / northbound 的内部流程设计。

## 2. Evidence summary

Evidence:

- 旧 renderer 侧 `src/api/common/index.ts` 聚合 `system/files/serial/network/path/receive/dataStorage/highSpeedStorage/historyData/timerManager`，并由各 wrapper 直接访问 `window.electron`。
- `src-electron/preload/index.ts` 通过 `contextBridge.exposeInMainWorld('electron', api)` 暴露大包 `window.electron`；`src-electron/preload/api/index.ts` 再聚合所有能力模块。
- `src-electron/main/ipc/receiveHandlers.ts` 在 main 中执行 frame matching、mapping validation、data processing、group update 和 stats 构造，属于 receive 领域语义进入 main 的风险证据。
- `src-electron/main/ipc/networkHandlers.ts` 接收数据后先判断 high-speed storage 规则，命中后写文件并短路普通 renderer data event，属于必须登记的高频边界例外候选。
- `src-electron/main/ipc/highSpeedStorageHandlers.ts` 同时包含规则匹配、connection id 解析、文件写入、轮转和统计，混合了 storage 业务判断与平台文件 I/O。
- `src-electron/main/ipc/timerManagerHandlers.ts` 在 main 中做定时调度和事件派发，这类平台侧调度能力可以保留，但 task / SCOE / status 的业务语义不能进入 timer wrapper。
- 文件对话能力分散在 `src/utils/common/dialogUtils.ts`、`src/utils/common/fileDialogManager.ts`、`src/composables/common/useFileDialog.ts`、`src/layouts/useFileDialog.ts`、`src/components/common/FileListDialog.vue`，同时混合 app shell、platform file/path、import/export 业务语义。
- `src/composables/window/useWindowControls.ts` 直接访问 `window.electron.window`，其中还绕过旧 `src/api/common/systemApi.ts` 的窗口 wrapper。
- `serialApi.ts`、`networkApi.ts`、`highSpeedStorageApi.ts` 等旧 API 可作为能力形态和 fallback 行为证据，但不能直接变成新的 platform facade。

Inference:

- `platform facade` 必须按能力缩面，不按旧文件名平移。
- preload 需要从大包 `window.electron` 收缩为少量 typed bridge 能力，不暴露裸 `invoke/send/on`。
- main 可以保留平台资源访问、生命周期、高频缓冲、批处理、节流、队列、背压和文件 I/O，但不能保留 receive/send/task/SCOE/result/report/northbound 的业务语义。
- `receiveApi`、`dataStorageApi`、`historyDataApi`、`highSpeedStorageApi` 是业务语义穿过 Electron 边界的重点风险，不应作为 platform API 模板。

## 3. Pre-design gate checklist

任何 feature 进入 `cs-feat-design` 前，必须先填完本表。缺失项不能在实现阶段临场补；应回到当前 feature design 或 roadmap update。

| Gate item | Required answer before `cs-feat-design` | Fails when |
| --- | --- | --- |
| Direct contract | 列出当前 feature design 的正式合同。至少包含本 feature 的 roadmap item 或设计入口，以及本文、target structure、quality rules、review checklist 中相关条款 | 用 handoff、摘要、临时 prompt 或旧代码事实替代正式合同 |
| Boundary guards | 列出只用于补边界和 evidence 的材料，例如旧代码、northbound gap map、硬件事实、旧 oracle | 边界护栏推翻直接合同，或旧代码组织被当成目标架构 |
| Legacy observable behavior | 明确本轮覆盖哪些旧系统可观测行为，并登记 Legacy observable behavior ledger；ledger 至少包含旧可观测行为、owner feature、`preserve` / `candidate drop` / `deferred` / `not touched`、证据来源、validation level | 未说明旧行为范围，或因为旧代码质量差而默认丢功能，或把 ledger 写成字段 schema / 业务模型 |
| Owner / not owner | 明确该 feature 拥有什么，不拥有什么。必须引用 `rewrite-feature-boundaries.md` 的 owner 口径 | feature 拿走其他 feature 的状态事实、协议语义或交付语义 |
| State owner | 明确静态资产、运行事实、统计 read model、UI snapshot 的 owner、reader、写入权、reset 时机、生命周期、是否持久化 | 统计写回 frame definition、字段定义、配置对象，或多个 store 写同一主事实 |
| Public API necessity | 说明是否有外部消费者。没有消费者时明确“不需要额外 public API”；有消费者时只说明允许入口类别，不写接口签名 | 为每个 feature 机械生成 `public.ts`，或外部直接 import 内部 state/service/composable |
| Runtime necessity | 说明是否需要 `runtime/`。若需要，只能用于装配、生命周期、调用顺序、事件路由、边界输入输出和例外登记 | runtime 承载 parser、frame builder、task state machine、SCOE 协议、result attribution、report 语义或 northbound 错误转换 |
| Platform/main/preload involvement | 说明是否涉及 files/path/dialog、serial/network、scheduling、packaged data path、HTTP/FTP 或 high-frequency exception | renderer 直接访问 `window.electron`、Node、Electron、`ipcRenderer`、`fs`、`path`、`net`、`serialport`；main 放业务语义 |
| Shared/tooling prerequisite | 判断是否依赖 shared/widgets/app shell/platform 缩面。任何旧 `src/utils`、`src/api/common`、`components/common` 迁移前必须有 owner 判定 | 把旧 `common`、`utils`、`api/common` 整体迁到 shared 或 platform |
| Interaction boundary | 明确 producer、consumer、fact owner、writer、reader、候选交互方式和是否需要显式事件 | feature 间通过内部 state import、全局 store 回读、隐式 event bus 互写 |
| Validation level | 标出本 feature 行为属于 fixture、manual、runtime、hardware、customer 哪些层级 | 用 build/lint 通过替代 runtime/hardware/customer 证据 |
| Blocked items | 列出阻塞 design、阻塞 implementation、阻塞 acceptance、可通过 fixture/oracle 暂时推进的项 | 把甲方 schema、硬件链路、打包态 data path、HTTP/FTP 等缺口隐藏成 future work |

Validation level definitions:

| Level | Meaning | Typical use |
| --- | --- | --- |
| `fixture` | 可用静态输入输出、旧行为 oracle 或新 core 单测验证 | frame migration、receive parser、send builder、timed task transition、SCOE parser、storage/history local rules、status mapping、result/report object |
| `manual` | 需要人工检查页面入口和用户可见流程 | 页面入口、文件导入导出、设置读写、状态指示、SCOE 工具可见行为 |
| `runtime` | 需要真实应用运行、打包态或长时间数据流验证 | packaged data path、timer drift、高频 batch/backpressure、文件轮转 |
| `hardware` | 需要真实串口、TCP/UDP、SCOE 设备或等价硬件环境 | serial/TCP/UDP 收发、SCOE timeout/completion、高速数据链路 |
| `customer` | 需要甲方 schema、示例、HTTP/FTP 环境、验收场景或接收确认 | northbound、TestReport、file delivery、外部错误/拒绝/状态语义 |

Test baseline rule:

- Vitest 是 `core`、`services`、`adapters`、`selectors` 的默认单测栈。
- 页面交互先进入 manual checklist。
- Electron runtime、package、hardware 和 customer validation 不由 Vitest 代替。
- 若引入 auto-import，只允许 Vue、Vue Router、Pinia 等基础框架 API；禁止自动导入 feature service、platform facade、runtime、store、feature public API 或 adapter。

First batch business feature designs:

- `frame`、`settings`、`storage-local-baseline` 进入 feature design 时必须填写 Legacy observable behavior ledger。
- Ledger 是设计和审查用的范围登记，用来说明旧可观测行为如何处理；它不是字段 schema，不是业务模型，也不是接口 payload 或枚举设计。

## 4. Feature sequencing proposal

本节是 design discussion 顺序，不是实现顺序。排序目标是先收紧边界，再设计依赖该边界的 feature，避免旧 `window.electron` 和 `src/api/common` 换目录重生。

### 4.1 Zero batch before feature design

| Order | Design discussion | Why first | Can run in parallel |
| --- | --- | --- | --- |
| 0.1 | Platform API surface reduction | 所有触达 Electron 的 feature 都依赖 renderer/platform/preload/main 的缩面规则。必须先决定哪些能力是 platform，哪些业务语义退回 feature | 可与 shared/tooling 同步，但必须先于涉及平台的 feature design 生效 |
| 0.2 | Shared/tooling/app shell/widgets ownership | `src/utils`、`src/api/common`、`components/common` 是 legacy mixed zone。必须先判 owner，再决定是否抽 shared、widgets 或 app shell | 可与 platform 缩面同步 |
| 0.3 | Platform/app shell/file dialog boundary | `frame`、`settings`、`storage-local-baseline` 都会触达 file/path/dialog/window controls。必须先固定 platform、preload、main、app shell、feature、runtime 的 owner split，不写最终 API schema | 应在第一批 feature implementation 前完成；可引用 `rewrite-platform-api-surface-reduction.md` 和 `rewrite-shared-tooling-app-shell-ownership.md` |
| 0.4 | Boundary exception registry template | SCOE 固定 source/target、高速存储短路、packaged data path、HTTP/FTP delivery 都需要统一例外登记格式 | 可与 platform 缩面同步 |

Conclusion:

- `platform/API 缩面` 和 `shared/tooling/app shell 归口` 应先于绝大多数 feature design。
- `platform/app shell/file dialog boundary` 是 `frame/settings/storage-local-baseline` 继续 implementation 前的补充 gate。
- 这些讨论不写 API schema，只写能力类别、owner、禁止暴露面和验证级别。

### 4.2 Recommended feature design sequence

| Sequence | Feature design discussion | Direct dependency | Reason | Parallel possibility | Must wait |
| --- | --- | --- | --- | --- | --- |
| 1 | `frame` | target structure、feature boundaries、shared/tooling gate | frame 静态资产是 receive/send/task/SCOE/report 的输入；先固定 asset owner、legacy import boundary 和 fixture/oracle 策略 | 可与 `settings` 并行 | 不等待硬件；旧 JSON 样例越完整越好 |
| 2 | `settings` | target structure、feature boundaries、shared/tooling gate | 设置默认值和持久化会影响 connection、receive、send、storage、status，但 settings 不拥有运行事实 | 可与 `frame`、storage local 部分并行 | 不等待硬件；涉及真实 platform option 应标 deferred |
| 3 | `storage` local baseline | platform files/path gate、frame/settings | 本地持久化、history、CSV、legacy JSON migration、导入导出是基础材料；但不能定义 report delivery 或 northbound closure | 可与 `frame/settings` 并行 | packaged data path、高速存储、file delivery 只做 blocker 登记 |
| 4 | `connection` | platform serial/network gate、settings | serial/TCP/TCP server/UDP transport、connection status、target route 是 receive/send/SCOE 的 platform 输入 | 需要先于 receive/send 细节 | 真实串口/TCP/UDP 证据阻塞 implementation/acceptance，不阻塞边界设计 |
| 5 | `receive` | frame asset snapshot、connection input boundary、high-frequency principles | receive 是高频入口，必须先锁 parser owner、batch/backpressure、result output、trigger output、SCOE handoff 和高速路径 | 可与 `send` 并行，但共享 frame/connection 前置输入 | 高速短路策略和真实 transport 只阻塞实现或验收 |
| 6 | `send` | frame/send asset boundary、connection target boundary、task 调用候选 | send 需要固定 send request、frame build、target落地、send result 输出，不承载 task/SCOE/report 语义 | 可与 `receive` 并行 | 真实 target 落地只阻塞 hardware acceptance |
| 7 | `task` | receive/send outputs、scheduling gate | task 拥有 timed/trigger send 和 task/case lifecycle。必须先区分 local timed task 与 northbound task | 可与 `status` 部分并行 | northbound 外部 control 语义阻塞 northbound-facing design，不阻塞 local timed task |
| 8 | `status` | connection/receive/send/task/SCOE/result snapshots | status 是 read model，不拥有底层 truth。先等主要 fact owner 和 selector 候选清晰 | 可与 SCOE 边界讨论并行 | 外部 heartbeat/status projection 等 northbound 语义延后 |
| 9 | `scoe` | connection/receive/send/task 边界、exception registry | SCOE 是领域例外，必须独立设计 fixed source/target、command owner、completion condition、tool records | 可与 status read model 并行 | 真实 SCOE 设备阻塞 implementation/acceptance |
| 10 | `result` | task lifecycle、receive/send/SCOE outputs、status snapshot | result 是内部结果事实 owner，先做内部 truth 和 fixture 策略，不写 northbound 字段 | 可与 `report` 的本地对象讨论并行 | 外部结果/异常/拒绝语义阻塞 northbound-facing design |
| 11 | `report` | result truth、storage material、task context | report 生成对象和文件候选，不承载 HTTP/FTP 交付。必须与 storage/northbound 分开 | 可与 `result` 并行 | JSON TestReport 样例阻塞 customer-facing report design |
| 12 | `northbound` | task/status/result/report/storage 内部边界、customer materials | northbound 最晚进入详细设计，因为它只能做外部投影、接入、交付和错误语义转换 | 可先做概念 reserved list，不做详细 design | 甲方 schema、任务/状态/错误、HTTP/FTP、TestReport、file delivery 证据 |

### 4.3 Parallel discussion groups

| Group | Can discuss together | Guard |
| --- | --- | --- |
| Group A | platform/API surface reduction + shared/tooling/app shell/widgets | 只写能力归口、禁止面、迁移 evidence，不写 final API schema |
| Group B | frame + settings + storage local baseline | storage 只能处理本地持久化、history、CSV、migration，不触 northbound delivery |
| Group C | receive + send | 必须先有 frame input、connection target 和 high-frequency event model |
| Group D | task + status | status 只读公开 snapshot；task 不因 status 展示需要扩大 lifecycle owner |
| Group E | SCOE + status read model | SCOE 保持独立领域例外；status 不直接读取 SCOE 内部 state |
| Group F | result + report | 保持 result truth、report generation、northbound delivery 三段分离 |

### 4.4 Feature designs requiring oracle/fixture strategy first

| Feature | Fixture / oracle strategy required before design detail |
| --- | --- |
| `frame` | legacy JSON samples、frame/field validation cases、import/export visible behavior |
| `receive` | bytes -> frame match -> fields -> expression/result；unmatched/error samples；high-frequency batch samples |
| `send` | frame build、checksum、target request、send result；send failure samples |
| `task` | timed send、trigger send、stop/cancel local behavior；old `stop -> completed` 作为 negative oracle |
| `scoe` | command parse、checksum、param resolution、completion condition；真实设备项标 hardware blocker |
| `storage` | history/CSV/local export、legacy data path、file rotation samples；packaged path 标 runtime blocker |
| `status` | internal status mapping samples；indicator reset/lifecycle samples |
| `result` | receive/send/task/SCOE material to internal result truth samples |
| `report` | internal report object samples；customer JSON TestReport 样例缺失时只做 local fixture |
| `northbound` | customer confirmed transaction semantics 后才能做 request/response fixture；当前只能做 reserved projection skeleton discussion |

## 5. Platform API surface reduction plan

Reduction rules:

1. 按能力类别缩面，不按旧文件名迁移。
2. `rewrite/src/platform` 是 renderer 访问桌面能力的唯一正式入口，但不承载业务语义。
3. preload 不暴露大包 `window.electron`，不暴露裸 `invoke/send/on`，不暴露任意通道访问。
4. renderer 不直接访问 `window.electron`、Electron、Node、`ipcRenderer`、`fs`、`path`、`net`、`serialport`。
5. main 只保留平台资源、生命周期、必要高频缓冲/批处理/节流/队列/背压、文件 I/O 和调度设施。
6. receive/send/task/SCOE/result/report/northbound 的业务运算、协议语义、状态推进、报告语义和外部错误转换必须退回可测试 TypeScript 层。
7. 删除重复 fallback、绕行入口和并行文件对话路径；保留一条 app shell + platform + feature adapter 的能力路径。
8. high-frequency、SCOE、packaged data path、HTTP/FTP 等例外必须进入 runtime boundary exception registry。
9. 旧 API 可作为 migration evidence 和 oracle 候选，不作为新 API 命名、通道和 payload 的合同。
10. `rewrite/` 是新的独立应用根目录；当前 root package、Quasar、TS、ESLint、UnoCSS 配置只能作为 infra evidence，进入 `rewrite/` 前必须重新收缩脚本、entry、boot、资源、lint/test include 和 auto-import 白名单。

| Old capability / file | Current responsibility | Target decision | Reason | API surface reduction rule | Old API as migration evidence only | Must not be exposed to renderer | Must not stay in main |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/api/common/index.ts` | 聚合所有旧 renderer API wrapper | delete / merge | 大包聚合会复制 `window.electron` 能力面 | 不提供万能 platform barrel；只暴露按能力收敛后的 facade 入口 | yes | 大包 `electron` 对象、任意跨能力访问 | none |
| `src/api/common/receiveApi.ts` | receive data processing、mapping validation、main cache sync | feature-owned / deferred | receive 解析、映射、统计和缓存是领域语义，不是平台能力 | 只允许 platform 交付输入 batch 或平台事件；receive core/service 处理语义 | yes | `handleReceivedData` 这类业务处理入口、receive cache 操作 | frame matching、field processing、group update、receive stats |
| `src/api/common/dataStorageApi.ts` | 基于 `DATA_PATH_MAP` 的动态 CRUD/export/import | feature-owned / merge / deferred | 数据类型、路径 map、导入导出属于 storage/feature 语义 | platform 只做受控 file/path；storage feature 定义本地持久化 | yes | 任意 data type CRUD、任意路径读写 | data type 动态业务注册、序列化策略 |
| `src/api/common/historyDataApi.ts` | history hour file、batch append、compression、CSV export、cleanup | feature-owned / deferred | history/CSV 是 storage 本地记录，不等同 report/file delivery | storage owns history rules；platform owns bounded file I/O | yes | history 作为 platform API | history schema、CSV time window、cleanup policy |
| `src/api/common/highSpeedStorageApi.ts` | 高速存储配置、规则、统计、校验 | feature-owned / deferred / exception | 规则匹配、是否短路普通 receive、统计语义需要 storage/receive owner | main 只可保留高频文件写入和轮转；业务规则例外登记 | yes | high-speed rule as generic platform API | `shouldStore` 业务判断、connection id 业务解析、统计含义 |
| `src/api/common/timerManagerApi.ts` | register/start/stop/pause/resume、timer stats、tick event | platform facade / preload-main implementation | main 定时调度可作为平台能力，feature 只作为 consumer | 收缩为 scheduling 能力；禁止 task/SCOE/status 语义进入 timer API | partial | 任意 custom event bus、业务命名 channel | task lifecycle、SCOE wait semantics、status polling meaning |
| `src/api/common/filesApi.ts` | list metadata、ensure dir、JSON/text read/write/delete | platform facade / merge | 文件能力是真 platform，但当前混入 import/export 语义和任意路径风险 | platform/files 只提供受控 file/path/dialog capability；feature owns JSON meaning | partial | 任意路径读写、业务化 JSON import/export wrapper | report generation、storage schema、northbound delivery semantics |
| `src/api/common/pathApi.ts` | data path、resolve、isPackaged | platform facade | packaged data path 是平台能力 | 只暴露受控 data path 类别，不让业务拼任意路径 | partial | raw path resolver as business utility | business data path policy |
| `src/api/common/systemApi.ts` | window/menu/autolaunch wrapper and fallback | platform facade + app shell | window/menu/app lifecycle 是平台/app shell 能力 | app shell 消费 platform/window/menu；删除绕行 fallback | partial | `window.electron.window/menu/autoLaunch` direct access | business lifecycle |
| `src/api/common/serialApi.ts` | serial list/open/close/write/read/data/status events | platform facade + connection feature / deferred | serial 是平台资源，connection owns target/status 语义 | platform only transport primitives and events; connection owns transport model | yes | raw serial object, Buffer-centric event stream, old fallback API | receive parsing、business routing、task/result/status semantics |
| `src/api/common/networkApi.ts` | TCP/TCP server/UDP connect/send/events/status | platform facade + connection feature / deferred | network 是平台资源，connection owns transport status and target routing | platform only socket lifecycle and byte transport; connection owns target model | yes | raw network event stream as business API | high-speed business short-circuit、receive classification、northbound device identity |
| `src/utils/common/dialogUtils.ts` | Electron dialog、Node fs/path、Vue inject、JSON import/export fallback | delete / merge / platform-main split | 同时混合 main、renderer、app shell、file business | 原生 dialog 经 platform/app shell；feature owns import/export semantics | yes | Electron dialog/fs/path into renderer utility | import/export validation、business JSON semantics |
| `src/utils/common/fileDialogManager.ts` | EventBus file dialog flow plus filesAPI read/write | merge / app shell utility | 属 app shell file dialog orchestration，不是 shared | 保留一条 app shell dialog flow；platform files only file/path | yes | EventBus-driven platform file access from arbitrary feature | feature import/export semantics |
| `src/composables/common/useFileDialog.ts` | local file dialog composable, direct `window.electron.files` | delete / merge | 与主 file dialog flow 重复且绕过 platform facade | 合并到 app shell dialog + platform files；删除直连 fallback | yes | `window.electron.files` direct access | none |
| `src/composables/window/useWindowControls.ts` | window minimize/maximize/close/unmaximize | app shell utility + platform facade | 窗口控制属于 app shell，但当前直连 `window.electron` | app shell 只能消费 platform/window facade | partial | `window.electron.window` direct access | none |
| `src-electron/preload/index.ts` | exposes all API modules as `window.electron` | delete / preload-main implementation | 大包暴露与目标 typed API 相反 | 按最小能力暴露 typed bridge，不暴露万能对象 | yes | `window.electron`, bare channel access | none |
| `src-electron/preload/api/index.ts` | aggregates all preload API modules | delete / merge | 聚合所有能力扩大 renderer 权限面 | 不按模块全量暴露；按 capability gate 暴露最小 typed bridge | yes | all-in-one API package | none |
| `src-electron/preload/api/window.ts`, `menu.ts`, `autolaunch.ts`, `path.ts`, `files.ts` | platform bridge for shell/path/file capabilities | preload-main implementation + platform facade | 能力方向正确但暴露面需收缩 | typed bridge only；renderer 通过 `rewrite/src/platform` 使用 | partial | raw invoke/send/on、任意 path/file operation | business import/export, report delivery |
| `src-electron/preload/api/serial.ts`, `network.ts` | serial/network invoke and event subscriptions | preload-main implementation + platform facade / deferred | transport 能力合理，事件面和数据流需按 connection/high-frequency design 收缩 | typed transport bridge；batch/backpressure event model 后定 | yes | raw per-packet unbounded event stream | receive classification, target/business device semantics |
| `src-electron/preload/api/receive.ts` | receive processing/cache bridge | feature-owned / delete from platform | receive 业务语义不应作为 preload platform API | 删除 receive business bridge；只保留 platform transport inputs if needed | yes | receive cache/process API | receive parser, mapping, stats |
| `src-electron/preload/api/dataStorage.ts`, `historyData.ts`, `highSpeedStorage.ts` | storage/history/high-speed bridges | feature-owned + platform file/path implementation / deferred | storage 规则、history、high-speed 判断不是平台；文件 I/O 是平台 | split file I/O from storage semantics; high-speed exception registry | yes | storage/history/high-speed as generic renderer platform package | data model, CSV/report material semantics, rule matching |
| `src-electron/preload/api/timerManager.ts` | timer invoke and tick/custom event listener | preload-main implementation + platform facade | scheduling can remain platform capability | expose minimal scheduling bridge; feature owns timer purpose | partial | arbitrary custom channel as event bus | task/SCOE/status semantics |
| `src-electron/main/ipc/windowHandlers.ts`, `menuHandlers.ts` | window/menu platform operations | preload-main implementation | true platform shell resource | Keep minimal, typed, app-shell consumed | partial | direct main channel names | business lifecycle |
| `src-electron/main/ipc/serialHandlers.ts` | serial resource, events, status, platform cleanup | preload-main implementation + exception for platform-specific enumeration | serial I/O belongs main; business routing does not | Keep port lifecycle/I/O/buffer only; batch event shape later | yes | direct serial handler package | receive parsing, task/status/result meaning |
| `src-electron/main/ipc/networkHandlers.ts` | TCP/UDP resource, events, stats, high-speed storage short-circuit | preload-main implementation + exception / deferred | socket lifecycle belongs main; high-speed business branch must be registered and likely moved | split transport I/O from storage business rule; short-circuit is exception | yes | raw network handler as business API | `shouldStore` semantic branch, report/result/northbound routing |
| `src-electron/main/ipc/receiveHandlers.ts`, `receiveConfigCache.ts` | receive processing and cache in main | feature-owned / delete from main | main currently holds parser and receive stats semantics | move parser/cache semantics to receive core/service; main only platform buffer if needed | yes | receive processing bridge | frame matching, mapping validation, group update, receive stats |
| `src-electron/main/ipc/dataStorageHandlers.ts`, `historyDataHandlers.ts`, `fileMetadataHandlers.ts` | data storage, history, file metadata I/O | split platform file I/O + feature-owned storage rules / deferred | file I/O belongs main; history/data schema and CSV rules belong storage | platform owns bounded file operations; storage owns persistence semantics | yes | arbitrary storage CRUD platform API | history schema, report material semantics, northbound delivery closure |
| `src-electron/main/ipc/highSpeedStorageHandlers.ts` | high-speed rule matching, file writing, rotation, stats | preload-main implementation + feature-owned + exception | file stream/rotation can stay main; rule matching and stats semantics need owner | register exception; storage/receive design decides short-circuit behavior | yes | high-speed storage as generic API | rule matching semantics, connection business parsing, stats interpretation |
| `src-electron/main/ipc/timerManagerHandlers.ts` | main timers and renderer event delivery | preload-main implementation + scheduling facade | stable timer in main is justified by renderer throttling | minimal scheduling, no business channel naming; window target assumption registered | partial | arbitrary event bus | task state machine, SCOE completion wait, status polling meaning |
| `src-electron/main/ipc/index.ts` and `src/utils/common/ipcUtils.ts` | main handler registry and common IPC helper | merge into main platform tooling | IPC tooling currently lives under renderer `src/utils`, crossing process boundary | main IPC infrastructure stays under main; no renderer shared dependency | yes | none | feature business handler registry as platform concern |

## 6. Minimal platform capability map

本文只写能力类别，不写接口 schema。

| Capability category | Why renderer cannot do it directly | Platform owns | Platform must not own | Feature consumers | Validation required |
| --- | --- | --- | --- | --- | --- |
| window / menu / app shell | renderer 不能直接访问 Electron window/menu/app lifecycle | 窗口最小控制、菜单显示状态、应用壳生命周期需要的系统能力、auto-launch 等平台设置的受控入口 | 页面业务流程、任务生命周期、状态事实、用户业务语义 | `app` shell、`pages` shell、settings visible config if needed | manual + runtime for real app shell behavior |
| files / path / dialogs | renderer 不能直接访问 `fs/path` 或 native dialog；打包态路径只能由 Electron/main 可靠判断 | 受控文件选择、受控读写、目录存在性、data path、packaged state、路径解析的最小能力 | frame import/export 语义、storage schema、history/CSV/report 语义、northbound delivery closure | `frame`、`storage`、`settings`、`report`、app shell file dialog | fixture for file adapters, manual for dialogs, runtime for packaged data path |
| serial / network transport | renderer 不能直接访问 `serialport`、socket、`net`，也不能承接底层 I/O 生命周期 | 端口/连接枚举、打开/关闭、字节收发、连接事件、必要入口侧 buffering/batch | frame matching、receive parsing、send result semantics、task state、SCOE completion、northbound device identity | `connection` first; then `receive`、`send`、`scoe`、`status` | runtime + hardware for serial/TCP/UDP; fixture only covers adapter shape |
| scheduling | renderer 定时器可能被节流；部分长周期或高频 timer 需要主进程稳定调度 | interval/timeout lifecycle、tick delivery、drift observation、cleanup | timed send 语义、task state machine、SCOE wait/completion、status polling meaning | `task`、`scoe`、`status`、app lifecycle where justified | fixture for cancellation model; runtime/manual for drift and lifecycle |
| packaged data path | 打包态路径、userData、权限和长期写入只能由 main/Electron 环境确认 | packaged state、data directory、受控路径类别、目录准备 | 旧 data path 常量、storage schema、report naming、file retention semantics | `storage`、`settings`、`report`、`northbound` when delivery needs local files | runtime/package validation required |
| optional HTTP/FTP transport | renderer 不应直接持有外部网络服务、FTP 传输和系统资源；交付需要平台资源和失败恢复 | HTTP/FTP transport primitive、连接生命周期、文件上传 I/O if northbound design confirms | northbound transaction semantics、external error/refusal mapping、TestReport schema、delivery success meaning | `northbound` via platform, with `report/storage` materials | customer + runtime validation; blocked until customer assets exist |
| high-frequency buffer/batch/backpressure exception | 高频串口/网络/文件链路不能逐包无节制穿透 renderer 和页面 | 与平台资源绑定的 buffering、batch、queue、throttle、backpressure、file stream/rotation | receive classification、storage rule meaning、task/result/status/report semantics | `connection`、`receive`、`storage`、`scoe` | fixture for rule pieces; runtime/hardware/performance validation for chain |

## 7. Carry-forward blockers

### 7.1 Blockers that stop feature design

| Blocker | Blocks | Why | Can fixture/oracle move forward |
| --- | --- | --- | --- |
| Missing direct contract or boundary guards | all feature design | Without formal contract, review outcome must be `blocked` | no |
| Platform/API surface reduction not accepted | any feature touching Electron, files, serial/network, timer, package path | Otherwise old `window.electron` and `src/api/common` will be recreated | only read-only evidence gathering |
| Shared/tooling owner not settled | any migration from `src/utils`, `src/api/common`, `components/common`, common composables | `src/utils` is legacy mixed zone, not shared | pure helper candidates can be listed, not moved as business |
| `connection` transport target vs northbound device identity not separated | connection, send, receive, northbound, status | serial/network target must not become customer `deviceId` | connection local transport fixture can proceed |
| High-speed storage short-circuit policy not decided | receive, storage, connection high-frequency path | Old network handler hides whether data reaches normal receive/display/trigger | rule matching fixture can proceed |
| SCOE fixed source/target/completion boundary not decided | scoe design and SCOE interactions with receive/send/task/status | SCOE is domain exception, not generic receive/send special case | parser/checksum fixture can proceed |
| Northbound phase-one transaction semantics missing | northbound detailed design | old send task/history/CSV/target cannot define external task/report/device | conceptual reserved map only |
| JSON TestReport/customer result semantics missing | customer-facing report/result/northbound design | report fields, depth, naming, result/error semantics are customer-owned | internal result truth and local report object can proceed |

### 7.2 Blockers that stop implementation but not boundary design

| Blocker | Blocks implementation of | Design can still decide | Required later evidence |
| --- | --- | --- | --- |
| Real serial/TCP/UDP runtime behavior unknown | connection transport adapter, send/receive real I/O | owner, input/output, validation plan | hardware/runtime |
| Main high-frequency batch/backpressure parameters unknown | receive/connection high-frequency implementation | principle, owner, exception registry | runtime/performance |
| Packaged data path not verified | storage/report/settings persistent path implementation | capability category and path owner | packaged runtime |
| Timer drift and multi-window event target assumption unverified | scheduling adapter implementation details | scheduling is platform capability, feature owns semantics | runtime/manual |
| HTTP/FTP environment unavailable | northbound transport implementation | optional transport category and owner split | customer/runtime |
| SCOE hardware unavailable | SCOE real command implementation | command owner and exception boundary | hardware |

### 7.3 Blockers that stop acceptance

| Blocker | Cannot claim accepted for |
| --- | --- |
| No real serial/TCP/UDP validation | hardware connection, real send/receive order, high-frequency data behavior |
| No SCOE device validation | SCOE timeout, state loop, completion condition, fixed source/target correctness |
| No packaged app data path validation | packaged persistence, backup, cleanup, report material path |
| No customer schema / enum / error / TestReport sample | northbound result/report/task/status customer closure |
| No HTTP/FTP environment and receiving-side confirmation | file delivery, report upload, completion notice, retry/failure compensation |
| No runtime evidence for high-speed storage | short-circuit correctness, throughput, file rotation, stats consistency |

### 7.4 Blockers that can be temporarily bypassed with fixture/oracle

| Area | Fixture/oracle allowed | Limit |
| --- | --- | --- |
| frame | legacy JSON and validation samples | does not prove all migration compatibility without samples |
| receive | byte samples and expected match/field outputs | does not prove real serial/TCP/UDP order or throughput |
| send | frame build and target request samples | does not prove real target delivery |
| task | timed/trigger state transition samples | does not define northbound task/control semantics |
| SCOE | command parse/checksum/completion condition samples | does not prove real device behavior |
| storage/history/CSV | local file samples and old history/export evidence | does not prove packaged path or northbound delivery |
| high-speed storage | rule validation and small data store fixture | does not prove throughput or short-circuit acceptance |
| status | internal mapping fixture | does not prove external heartbeat/status customer semantics |
| result/report | internal fact aggregation and local report object fixture | does not prove customer TestReport or file delivery |
| northbound | transaction concept map after customer confirmation | current phase cannot fixture external contract without customer semantics |

## 8. First design batch readiness

Can start first batch `cs-feat-design`:

- Yes, but not for receive/send/task/SCOE/result/report/northbound first.
- The first batch should start with global pre-feature design gates and low-risk foundation feature designs.
- If the team treats platform/shared/app shell as CodeStable design items rather than feature items, run them immediately before feature designs. If they must be represented as `cs-feat-design`, mark them as global foundation designs, not business feature internals.

### 8.1 First batch candidates

| Candidate | Kind | Direct contract | Boundary guards | Notes |
| --- | --- | --- | --- | --- |
| `platform-api-surface-reduction` | global foundation design | `AGENTS.md`; rewrite execution charter; target structure; system architecture; shared-tooling audit plan; quality rules; this document | old `src/api/common/*`, `src-electron/preload/api/*`, `src-electron/main/ipc/*` as evidence only | Must output capability categories, prohibited renderer/main exposure, exception registry template. No final API schema |
| `shared-tooling-app-shell-ownership` | global foundation design | `AGENTS.md`; target structure; system architecture; shared-tooling audit plan; quality rules; this document | old `src/utils`, `src/composables/common`, `src/components/common`, file dialog chain as evidence | Must decide owner categories and delete/merge candidates. No code movement |
| `platform-app-shell-file-dialog` | global foundation design | `AGENTS.md`; execution charter; target structure; platform API surface reduction; shared-tooling app shell ownership; frame/settings/storage designs; quality rules; this document | old file/path/dialog/window controls and current `rewrite` scaffold as evidence only | Must fix platform/preload/main/app shell/feature/runtime owner split for file/path/dialog/window controls. No API schema |
| `frame` | feature design | roadmap item if any; rewrite execution charter; target structure; system architecture; feature boundaries; interaction matrix; quality rules; this document | legacy frame JSON, old frame utils, old page entry as evidence | First actual business feature candidate because it owns static frame assets used by receive/send/report |
| `settings` | feature design | roadmap item if any; target structure; feature boundaries; interaction matrix; shared-tooling audit plan; quality rules; this document | old settings page/config/defaults as evidence | Can run with frame; must not own runtime truth |
| `storage-local-baseline` | feature design | roadmap item if any; target structure; feature boundaries; interaction matrix; shared-tooling audit plan; quality rules; this document | old dataStorage/history/CSV/files/path facts as evidence; northbound gap map as guard | Limit to local persistence/history/CSV/migration. Exclude northbound file delivery and TestReport closure |

### 8.2 Not first batch

| Candidate | Reason to delay |
| --- | --- |
| `connection` | Should wait until platform transport surface and high-frequency exception template are accepted |
| `receive` | Depends on frame asset snapshot, connection input model, high-frequency batch/backpressure boundary |
| `send` | Depends on frame/send asset boundary, connection target model, task call boundary |
| `task` | Depends on receive/send outputs and scheduling boundary; northbound task semantics remain separate |
| `scoe` | Depends on connection/receive/send/task boundaries and exception registry |
| `status` | Depends on fact owners and read model sources |
| `result` | Depends on task/receive/send/SCOE output boundaries |
| `report` | Depends on result truth and storage material boundary |
| `northbound` | Blocked for detailed design until customer semantics, TestReport, HTTP/FTP and file delivery evidence exist |

## 9. Review implications

For later implementation or review:

- If a change recreates `window.electron` as a large renderer capability object, outcome should be `revise-required`.
- If a change puts receive/send/task/SCOE/result/report/northbound business semantics into main, outcome should be `revise-required`.
- If a feature design lacks direct contract, owner/not owner, state owner, platform involvement, validation level, or blockers, outcome should be `blocked`.
- If semantics are locked but hardware/customer/package validation is pending, outcome may be `pass-with-known-gaps` only when the missing evidence is explicitly registered.
- Build/lint evidence never replaces contract completeness, boundary compliance, or runtime/hardware/customer validation.

## 10. Next step

Recommended next discussion:

1. Run `platform-api-surface-reduction` as a global foundation design.
2. Run `shared-tooling-app-shell-ownership` in parallel or immediately after.
3. Start first business feature designs with `frame`, `settings`, and `storage-local-baseline`.

Do not start receive/send/task/SCOE/result/report/northbound detailed design until their listed prerequisites are visible in the feature design direct contract.
