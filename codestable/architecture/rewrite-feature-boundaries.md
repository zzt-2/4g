---
doc_type: architecture
type: rewrite-feature-boundaries
status: draft
date: 2026-04-29
summary: Feature boundary and owner pre-screen for the Dongfanghong rewrite before any cs-feat-design work. This document records owner responsibilities, input/output direction, runtime fact ownership, validation posture, and high-risk cross-feature seams without defining schemas or feature internals.
tags:
  - rewrite
  - feature-boundary
  - owner
  - pre-design
  - batch-0
---

# Rewrite feature boundaries

## 1. Scope

本轮是全局预设计阶段的 feature 边界与 owner 初筛，目的是在进入任何 `cs-feat-design` 前，先固定每个 feature 的职责边界、输入输出方向、运行事实归属、验证风险和明显的合并/拆分风险。

Direct contract:

- `AGENTS.md`
- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`

Boundary guards:

- `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`
- `easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md`
- 当前 `src` 和 `src-electron` 旧代码事实，只作为 evidence、oracle 候选和风险证据。

Non-goals:

- 不进入任何 feature 内部详细设计。
- 不写字段 schema、事件 payload、接口签名、northbound 字段、枚举或错误码。
- 不写 receive / send / task / SCOE 的详细实现。
- 不做代码移动，不实现业务代码。
- 不把旧页面、旧 store、旧 composable、旧 IPC、旧 main handler 组织自动升级为目标架构。

Canonical rule:

- `codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向和 feature 归口的 canonical 架构基线。本文只做 owner 初筛和后续 feature design 的入口材料。

## 2. Legacy Evidence Summary

Evidence:

- 旧系统路由覆盖首页、连接、帧配置/编辑、发送、接收、设置、存储、历史和 SCOE 页面。`src/router/routes.ts:3-54`
- 左侧导航暴露首页、连接、SCOE、配置、发送、接收、存储、历史、设置。`src/components/layout/SidePanel.vue:32-47`
- 应用生命周期一次性装配 frame、send instance、receive config、serial、connection target、global stats、SCOE、history recording 等多个 store。`src/layouts/useAppLifecycle.ts:17-26`, `src/layouts/useAppLifecycle.ts:45-68`
- 串口和网络 store 接收事件后直接调用 `receiveFramesStore.handleReceivedData`。`src/stores/serialStore.ts:391-417`, `src/stores/netWorkStore.ts:200-213`
- `receiveFramesStore` 同时处理入站队列、SCOE 分支、receive API、全局统计、接收组当前值、表达式、星座图、frame stats 和发送触发条件。`src/stores/frames/receiveFramesStore.ts:805-904`, `src/stores/frames/receiveFramesStore.ts:1016-1205`, `src/stores/frames/receiveFramesStore.ts:1215-1293`
- send task 的本地任务状态、计时器、触发监听、进度缓存和状态索引聚集在 `sendTasksStore`，控制器停止任务时把停止写成 `completed`。`src/stores/frames/sendTasksStore.ts:15-30`, `src/stores/frames/sendTasksStore.ts:145-184`, `src/composables/frames/sendFrame/useSendTaskController.ts:26-65`
- 统一发送器直接读取连接目标、发送实例统计、全局统计、表达式管理和 SCOE store。`src/composables/frames/sendFrame/useUnifiedSender.ts:6-13`, `src/composables/frames/sendFrame/useUnifiedSender.ts:55-167`
- SCOE store 同时管理配置、SCOE TCP/UDP 连接、SCOE 发送、状态循环和测试工具记录。`src/stores/scoeStore.ts:18-39`, `src/stores/scoeStore.ts:212-340`
- 旧 Electron 配置已是 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`，但 preload 暴露统一 `window.electron` 能力包，renderer `api/common` 直接围绕 `window.electron` 组织平台能力和部分业务语义。`src-electron/main/window.ts:28-39`, `src-electron/preload/index.ts:1-10`, `src-electron/preload/api/index.ts:1-31`, `src/api/common/index.ts:6-34`
- main 进程中 `receiveHandlers` 直接执行帧匹配、字段处理、统计结果构建，`networkHandlers` 中高速存储规则命中后会短路普通 renderer data event。`src-electron/main/ipc/receiveHandlers.ts:18-25`, `src-electron/main/ipc/receiveHandlers.ts:53-140`, `src-electron/main/ipc/networkHandlers.ts:498-520`
- 当前代码未形成独立 `northbound` store/composable/page，`result` 和 `report` 也没有独立 feature 入口；历史分析和 data display 是 `display` feature 的 legacy evidence/oracle 候选，CSV 和 high-speed storage 仍归 storage/receive/runtime 边界材料。

Inference:

- 旧系统页面入口应默认保留为用户可见入口，但页面结构不决定新 feature owner。
- 新系统必须把静态资产、运行事实、统计 read model、UI snapshot、平台能力和对外交付分开，不继续沿用旧 store 跨写。
- `result / report / northbound` 必须作为新边界补齐；不能用旧 `history / CSV / local export` 直接替代。

## 3. Feature Boundary Table

| Feature | Owner responsibilities | Does not own | Main inputs | Main outputs | Runtime fact owner | Static definitions / assets | Public API likely | Runtime orchestration likely | Platform/main/preload boundary | Validation posture | Initial scope class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frame` | 帧资产、字段编辑、校验、序列化、导入导出、旧 JSON 迁移入口、frame fixture/oracle 材料 | 接收运行状态、发送执行状态、SCOE 命令流程、统计事实、报告交付 | 用户编辑、旧 JSON/导入文件、storage 读取、settings 默认值 | frame definition、field definition、可供 receive/send/SCOE/report 读取的静态资产 | 只拥有 frame 静态资产事实；不拥有命中次数、最近值、错误数 | 是。frame、field、frame-owned 展示元数据、legacy JSON migration 都涉及 | 是。receive/send/task/SCOE/report 需要只读读取 frame 资产或校验入口 | 通常不需要；导入迁移和跨 feature 装配可由 runtime 调用公开入口 | 文件导入导出经 storage/platform，不直接触 Electron | fixture/oracle 优先；导入导出和旧 JSON 迁移需要手工 checklist | `preserve` for visible asset behavior; legacy JSON internal shape is `deferred/candidate compatibility` |
| `connection` | 串口/TCP/TCP server/UDP 连接模型、连接实例、连接状态、target 路由、transport availability | 字节解析、业务结果、报告、任务生命周期、northbound deviceId | 平台串口/网络资源、用户连接操作、settings 默认连接参数 | target snapshot、connection status、transport send/receive availability、连接事件 | 连接实例和 transport 状态事实 | 连接配置可能持久化；不是业务设备身份资产 | 是。send/SCOE/storage/status/runtime 需要 target 查询和发送落点 | 是。启动/释放连接、SCOE 固定连接、跨 feature target 装配需要 runtime | 强涉及 platform/main/preload；main 只做平台 IO 和必要缓冲 | 串口/TCP/UDP 必须 hardware/runtime validation；静态只能说明边界 | `preserve` |
| `receive` | 输入字节流承接、batch/queue、帧匹配、字段解析、表达式输入、接收结果输出、receive fixture/oracle | 任务是否开始或结束、SCOE 完整领域执行、历史落盘编排、状态指示定义、报告语义 | connection 入站 bytes、frame 静态资产、receive 配置、SCOE 显式入口输入 | receive result、field value delta、parse error、match stats、给 task/status/result/storage/SCOE 的显式结果 | receive 解析运行事实和接收 read model；统计 owner 需在 design 中细化 | receive mapping/config 可能涉及静态配置；不得写回 frame definition | 是。task/status/result/storage/report 需要只读结果或事件 | 是。高频数据、SCOE 分支和 result/storage/status 消费需要 runtime 明确路由 | 强涉及 platform 数据流，但 core 不依赖 Electron；main 只能缓冲/批处理 | 自动 fixture 最高优先；真实串口/TCP/UDP 和高频链路需 runtime/hardware validation | `preserve` |
| `send` | 单帧发送（SendRequest→构帧→target 路由→transport write→SendResult）、发送队列（transport-level FIFO）、target 落地、发送统计 read model、send fixture/oracle | 任务编排/step 序列执行、SCOE 成功条件、报告交付、northbound 回执语义、定时/触发/序列调度 | frame/send instance、task send-step 请求、页面手动发送请求、connection target、settings | send result（SendResult）、bytes sent、send error、给 task/status/storage 的显式结果 | send 执行局部事实和发送结果事实；不拥有 task 主状态 | send instance/template 是静态或半静态资产，需要与 frame 分清 | 是。task/pages/runtime 需要发起发送请求 | 是。task send-step 调用 send 公开 service | 通过 connection/platform 落地；renderer 不直连串口/网络 | send build 可 fixture；真实 target 落地需 hardware/runtime validation | `preserve` |
| `task` | 通用执行引擎（接收执行计划 step 序列，按顺序执行，处理错误，追踪进度）、多态 step（send/wait-condition/delay）、多触发来源入口适配（用户 UI、定时器、receive 触发、SCOE 命令、northbound 外部命令）、条件匹配逻辑、调度、取消/停止/暂停/恢复语义 | 页面工作台状态、send 局部发送细节、receive 解析、northbound 对外回执协议、报告文件生成、SCOE 领域规则 | TaskDefinition（来自用户 UI / SCOE adapter / northbound adapter / 定时器）、send public service result、receive public API 事件、settings | TaskInstanceState、TaskProgress、TaskInstanceCompletion、TaskStepResult、给 result/status/northbound 的显式事件 | task/case/step lifecycle 主事实和执行进度事实；旧 send task 只能作为 local oracle | task config 或 legacy send task config 属兼容候选；不直接等同 northbound task schema | 是。pages/northbound/result/report/status/runtime 都需要 task 查询或命令入口 | 是。task 是通用执行引擎，跨 receive/send/result/report/northbound 的核心编排消费者和生产者 | timer 可以经 platform/main，但状态推进必须在 TS core/service | 定时/触发/SCOE 命令可 fixture；stop/pause/resume 和真实发送链需 runtime validation | `preserve` for timed send/local visible behavior; northbound task semantics are `deferred` |
| `scoe` | SCOE 协议、命令解析（指令码→step 定义映射）、完成条件定义、确认帧配置、SCOE 领域状态（commandSuccessCount 等）、SCOE 静态资产（卫星配置、SCOE 帧实例）、固定 source/target 声明、测试工具记录、SCOE fixture/oracle | 通用执行引擎（task owns）、单帧发送（send owns）、通用 receive/send 主链定义权、统一运行主状态、当前甲方 northbound 身份 | SCOE TCP server 入站字节（经 connection transport event，bypass receive）、SCOE config、frame/SCOE frame instance、task lifecycle 事件（TaskInstanceCompletion） | ScoeDomainState、TaskDefinition（翻译自 ScoeCommand，triggerSource=scoe-command）、SCOE 静态资产 | SCOE 领域状态和测试工具记录；不成为系统主状态 | 是。卫星/SCOE config、命令、参数、完成条件等静态定义 | 是。pages/runtime/task 需要显式入口 | 是。固定连接声明、命令翻译为 TaskDefinition、边界例外需要 runtime 登记 | 强涉及 connection/platform；main 不拥有 SCOE 协议语义 | fixture + real SCOE device validation；无设备只能静态/fixture | `preserve`, with `deferred` hardware proof |
| `storage` | 本地持久化、history、CSV、高速存储、迁移脚本输入输出、文件素材归档 | northbound 文件回传协议、任务结果事实定义、报告对象语义 | feature 静态资产、receive/result/report 素材、高速 bytes、settings、platform path/file API | persisted assets、history records、CSV/local files、report 素材文件、高速存储文件 | storage/history/file 写入事实；不定义 result/report 成功语义 | 是。本地模板、旧 JSON、history/CSV、高速规则和迁移输入输出 | 是。frame/settings/report/result/pages 需要存取能力 | 是。打包态 data path、高速存储短路、报告素材归档需 runtime 登记 | 强涉及 main/path/fs/preload；main 只做文件 IO、缓冲和安全路径能力 | fixture + manual checklist；打包态 data path 和高频存储必须 runtime validation | `preserve` |
| `settings` | 设置模型、默认值、持久化、设置页可见配置、跨 feature 配置分发边界 | 领域运行事实、任务推进、状态事实、平台能力 | 用户设置、默认值、storage 读取、feature design 中声明的配置项 | typed settings snapshot、feature-specific config inputs | settings 只拥有配置事实；不拥有运行状态 | 是。默认值、用户设置、配置导入导出 | 是。features 读取配置快照或订阅变更 | 通常不需要；启动注入和跨 feature 默认值可 runtime 装配 | 通过 storage/platform 持久化，不直接触 main | fixture + manual checklist；配置持久化路径需 runtime/package check | `preserve` |
| `status` | 状态指示、健康状态、状态视图、内部状态摘要、UI-facing read model | 心跳协议本身、任务主状态事实、receive/send 原始事实、northbound 外部状态枚举 | connection/task/receive/send/SCOE/result 的只读 snapshot、settings 指示灯配置 | status view、health summary、indicator snapshot、给 northbound 的内部状态素材 | status read model；不拥有底层事实 | 指示灯配置属于 status/settings 交叉，需在 design 定 owner | 是。pages/widgets/northbound 需要状态摘要 | 是。跨 feature 状态聚合应由 runtime 或 status service 读取公开入口 | 不直接触 main；心跳归 northbound/platform，不在 status 内实现协议 | fixture + manual checklist；硬件状态需 runtime/hardware validation | `preserve` for local indicators; external heartbeat is `deferred` |
| `display` | 展示偏好、展示配置校验/规范化、表格/图表/星座图 projection、实时/历史 UI-safe snapshot、transient display buffers | receive runtime facts、connection facts、settings persistence、status health、storage/history persistence truth、report/northbound 语义 | settings preference facts、receive/frame/storage/status/connection public material、pages/widgets user view intent | display preference snapshot、table/chart/scatter/history projection、display read model、UI-safe snapshot | display read model 和 transient display buffers；不拥有 source truth | display preference semantics 是；持久化容器需由 settings/storage 合同声明 | 是。pages/widgets/runtime 需要展示 projection；source features 只提供公开输入 | 是。高频 receive 到 display snapshot、history material 和跨 feature view model 需 runtime 装配 | 不直接触 main；文件/path 归 storage/platform；图表/UI 不访问 platform | fixture + manual checklist；高频刷新需 runtime/hardware；history/package 归 storage/package | `preserve` for visible display behavior |
| `result` | 内部结果事实（case result truth、task result truth）、结果归因和聚合规则（ResultAggregationRule）、执行摘要、结果 read model | 报告文件生成、HTTP/FTP 交付、外部响应语义、外部 schema/枚举/错误码、history 文件格式 | TaskInstanceCompletion + TaskStepResult（来自 task，不直接消费独立 send/receive/SCOE event） | CaseResult、TaskResultSummary、ResultReadModel、CaseResultFinalized 事件、report material facts | 内部结果事实主 owner | 结果定义本轮不写 schema；结果 fixture/oracle 后续按 feature design 细化 | 是。report/northbound/status/pages 需要读取结果事实 | 是。task completion 到 result 的归集需要 runtime 或明确事件 | 不应直接触 platform/main | fixture 优先；客户验收口径未定前不能声明 customer closure | `deferred` for new northbound loop; local history-derived facts are `preserve` material |
| `report` | 报告对象生成、报告素材归集、报告文件准备、本地报告生成规则 | HTTP/FTP 交付动作、外部回执、内部结果事实定义、history/CSV 直接等价 | result、task、storage素材、settings/report template、customer-confirmed report requirements | report object、report file candidate、交付素材引用 | 报告生成状态和报告文件准备事实 | 是。报告模板、命名、素材映射后续涉及，但本轮不写 schema | 是。northbound/pages/storage 需要报告生成和读取入口 | 是。任务完成后 result -> report -> storage/northbound 需要 runtime 编排 | 文件准备经 storage/platform；不在 main 写报告语义 | fixture + manual checklist；甲方 JSON TestReport 需 customer validation | `deferred` |
| `northbound` | 中心协同接入、对外投影、对外交付、外部错误语义转换、HTTP/FTP 交付闭环 | 内部运行主状态定义、收发主链内部规则、旧 send task、本地 history/CSV | customer HTTP/REST（经 platform HttpFacade）、task/status/result/report/storage 内部事实 | external response/projection、delivery result、completion notification、external error/refusal mapping | northbound transaction fact（testCaseId↔instanceId 映射、server running 状态）；不拥有内部 task/result/report truth | customer schema 基于 V1.0.1 接口文档，待正式确认 | 是。handleStepResult 回调由 task service 通过 late-binding 调用；外部入口经 HttpFacade | 是。runtime feature-wiring 负责 task↔northbound late-binding 装配和 HttpFacade 依赖注入 | 强涉及 platform/main for HTTP（HttpFacade → preload HttpBridge → main http-handlers）；HTTP 协议语义留在 TS domain | customer validation 必需；MVP 基于 V1.0.1 接口文档实现，43 tests passing | `preserve` for MVP inbound/outbound loop; customer schema confirmation and FTP delivery remain `deferred` |

## 4. Owner Notes By Feature

### 4.1 `frame`

- Owner: 帧定义、字段定义、资产生命周期、校验、序列化、导入导出和旧 JSON 迁移入口。
- Not owner: receive 命中统计、send 执行结果、SCOE 命令状态、result/report 语义。
- Main risk: 旧 `receiveFramesStore` 监听 frame template 并同步 main cache，说明 frame 资产变化会影响 receive 运行缓存。新架构应通过 explicit input 或 runtime 装配传递，不允许 receive 反向写 frame 静态资产。
- Validation: frame CRUD、导入导出、旧 JSON migration 可做 fixture；页面入口和文件导入导出需 manual checklist。

### 4.2 `connection`

- Owner: transport connection 和 target availability，包含串口、TCP、TCP server、UDP remote host。
- Not owner: northbound `deviceId`、业务设备身份、receive 解析、send 构帧、task lifecycle。
- Main risk: 旧 `connectionTargetsStore` 聚合 serial/network target，并被 send、SCOE、storage 等多域消费；新系统需要把 transport target 与业务 device identity 分开。
- Validation: 串口枚举、连接、断开、TCP/UDP 数据收发和事件顺序必须 hardware/runtime validation。

### 4.3 `receive`

- Owner: 输入字节到 receive result 的可测试链路。
- Not owner: task 主状态、SCOE 完整执行、history/report/northbound 闭环。
- Main risk: 旧 receive 同时写 global stats、data display、trigger task、SCOE 分支和 main cache，是跨 feature 写入风险最高区域。
- Validation: bytes -> frame match -> field parse -> expression -> receive result 是首要 fixture/oracle；高频队列、真实串口/TCP/UDP 需 runtime validation。

### 4.4 `send`

- Owner: 单帧发送（SendRequest→构帧→target 路由→transport write→SendResult）、transport-level FIFO 队列、发送统计 read model。
- Not owner: task/case lifecycle、SCOE completion、report delivery、定时/触发/序列调度、northbound 回执语义。
- Main risk: 旧 `useUnifiedSender` 同时更新 send instance stats、global stats 和 SCOE send record。新系统中这些应拆成 send result 输出，由各 owner 消费。
- Validation: 构帧、target route、send result 可做 fixture；真实 target 落地必须 hardware/runtime validation。

### 4.5 `task`

- Owner: 通用执行引擎。接收执行计划（step 序列），按顺序执行，处理错误，追踪进度。多态 step（send/wait-condition/delay），多触发来源入口适配（用户 UI、定时器、receive 触发、SCOE 命令、northbound 外部命令）。条件匹配逻辑（wait-condition 和 trigger 共用同一套匹配算法）。
- Not owner: northbound 对外协议、send 局部状态、receive 解析、report 文件生成、SCOE 领域规则。
- Main risk: 旧 stop 写成 `completed`，与 northbound stop 后应进入 stopped 的 workshop 口径冲突；旧 send task 只能作为本地行为 oracle，不能等同甲方 task。
- Validation: 定时发送和触发发送应保留；pause/resume/stop 语义需 feature design 中明确，并与 northbound 外部控制语义分开。

### 4.6 `scoe`

- Owner: SCOE 协议、命令解析（指令码→step 定义映射）、完成条件定义、确认帧配置、SCOE 领域状态、SCOE 静态资产和测试工具记录。SCOE 不需要自己的执行器——翻译命令为 TaskDefinition（triggerSource=scoe-command）交由 task 执行。SCOE 入站字节流 bypass receive，直接从 connection transport event 到 SCOE adapter。
- Not owner: 通用执行引擎（task owns）、单帧发送（send owns）、通用 receive/send 主链定义权、当前甲方 northbound 身份。
- Main risk: 旧 SCOE 在 receive store、send unified sender、network store、SCOE store、SCOE composable 之间分裂，且 `src/utils/receive/scoeFrame.ts` 直接读取 receive store。
- Validation: SCOE command parse/checksum/completion 条件可做 fixture；真实设备、timeout、状态循环必须 hardware validation。

### 4.7 `storage`

- Owner: 本地文件、历史记录、CSV、高速存储、迁移输入输出和报告素材文件。
- Not owner: result truth、report object semantics、northbound FTP/HTTP delivery closure。
- Main risk: 旧 high-speed storage 在 main/network handler 中命中后短路普通 receive event；该行为必须作为 runtime 边界显式登记，不能藏在普通 network handler。
- Validation: 本地 JSON/history/CSV 可 fixture + manual checklist；打包态 data path、高频存储和文件轮转必须 runtime validation。

### 4.8 `settings`

- Owner: 用户设置、默认值和配置持久化。
- Not owner: 运行事实、状态解释、领域流程。
- Main risk: 旧 settings 页面同时暴露 data recording、CSV 路径、状态指示灯配置和系统操作；新系统中 settings 只保存配置事实，配置生效由对应 feature 或 runtime 装配负责。
- Validation: 设置读写、导入导出、默认值回退可 fixture/manual checklist。

### 4.9 `status`

- Owner: 内部状态摘要、状态指示、health/read model 和 UI-facing snapshot。
- Not owner: heartbeat 协议、task 主状态、receive/send 原始事实。
- Main risk: 旧 `statusIndicators` 直接读取 receive groups 并定时轮询，`globalStatsStore` 另有一套统计口径，状态解释容易漂移。
- Validation: status mapping 可 fixture；真实硬件状态、连接状态和客户侧状态查询需 runtime/customer validation。

### 4.10 `display`

- Owner: 展示偏好、展示配置校验/规范化、表格/图表/星座图 projection、实时/历史 UI-safe snapshot 和 transient display buffers。
- Not owner: receive runtime facts、connection facts、settings persistence、status health、storage/history persistence truth、report/northbound 语义。
- Main risk: 旧 `dataDisplayStore` 同时做展示配置、实时采样、记录状态和历史保存，容易重新变成 receive/storage/status 混合 store。
- Validation: preference/projection 可 fixture；页面入口、图表切换和星座图配置需 manual checklist；高频刷新需 runtime/hardware；history/package 由 storage/package 验证。

### 4.11 `result`

- Owner: 内部 case result truth、task result truth、执行摘要、结果归因和聚合规则（ResultAggregationRule）。result 不直接消费独立的 send/receive/SCOE event，主要素材来源是 task 输出的 TaskInstanceCompletion 和 TaskStepResult。
- Not owner: report file generation、HTTP/FTP delivery、external response semantics、外部 schema/枚举/错误码。
- Main risk: 旧系统没有独立 result owner，历史分析、receive result、send result、SCOE status 和 CSV 导出分散承载结果材料。
- Validation: 内部 result 可以基于 receive/send/task/SCOE fixture；客户结果字段和枚举未确认前只能 deferred。

### 4.12 `report`

- Owner: 报告对象生成、报告素材归集、报告文件准备。
- Not owner: internal result truth、HTTP/FTP upload、external acknowledgement。
- Main risk: 旧 history/CSV/local export 容易被误当 TestReport；必须保持 result、report、delivery 三段分离。
- Validation: 本地报告生成可 fixture/manual checklist；JSON TestReport 格式、命名、必填字段需 customer validation。

### 4.13 `northbound`

- Owner: customer-facing inbound/outbound boundary、外部投影、对外交付、外部错误语义转换。
- Not owner: internal task/result/report/status truth。
- Main risk: 当前代码没有 northbound 边界；旧 send task、serial/network target、history/CSV 都不能直接改名为 customer task/device/report。
- Validation: 只有 customer simulator、HTTP/FTP 环境、正式接口材料或甲方验收数据到位后，才能声明 northbound closure；本轮只能记录 deferred。
- Implementation (MVP):
  - Inbound: HTTP server 接收甲方请求（/setTestTask, /controlTestTask, /heartbeat, /getSubSysState），经 platform HttpFacade → northbound service URL routing → inbound translator 纯函数转 TaskDefinition → task service 执行。
  - Outbound: task onStepResult 回调（late-binding by runtime feature-wiring）→ outbound translator 纯函数转 customer JSON → platform HttpFacade sendRequest 上报。
  - State: NorthboundStateContainer 维护 testCaseId↔instanceId 双向映射。
  - Platform: HttpFacade 新增 platform facade，preload HttpBridge 和 main http-handlers 实现双向 IPC（main→renderer 请求转发、renderer→main 响应返回）。
  - 43 tests passing（translators 22 + state 11 + service 10）。
  - Known gaps: frameId placeholder、step timestamps 缺失、customer schema 待确认。

## 5. Cross-Feature High-Risk Points

### 5.1 Old store cross-write

- `serialStore` and `netWorkStore` call `receiveFramesStore.handleReceivedData` directly. `src/stores/serialStore.ts:391-417`, `src/stores/netWorkStore.ts:200-213`
- `receiveFramesStore` updates global stats, receive groups, expression results, data display, trigger task and SCOE branch in one flow. `src/stores/frames/receiveFramesStore.ts:1016-1205`, `src/stores/frames/receiveFramesStore.ts:1215-1293`
- `useUnifiedSender` writes send stats, global stats and SCOE send record after send result. `src/composables/frames/sendFrame/useUnifiedSender.ts:146-167`
- `sendTasksStore` owns task state, but creator/controller/executor/trigger composables all mutate it.

Risk:

- 主状态多点写入，后续 feature design 必须先声明每个运行事实的 owner 和只读消费者。

### 5.2 `window.electron` direct dependency

- Preload exposes `window.electron` as one large capability object. `src-electron/preload/index.ts:1-10`, `src-electron/preload/api/index.ts:14-31`
- Renderer `src/api/common` wraps `window.electron`, and `receiveApi` carries domain objects through that boundary. `src/api/common/index.ts:6-34`, `src/api/common/receiveApi.ts:19-95`

Risk:

- 旧 `api/common` 可作为 migration evidence，但新 renderer 正式入口必须是 `rewrite/src/platform` facade，不应让 pages/stores/composables 继续依赖 `window.electron`。

### 5.3 Main process business logic

- `receiveHandlers` imports `src/utils/receive` and performs match/process/validate in main. `src-electron/main/ipc/receiveHandlers.ts:18-25`, `src-electron/main/ipc/receiveHandlers.ts:53-140`
- `networkHandlers` applies high-speed storage rules before deciding whether to emit renderer data. `src-electron/main/ipc/networkHandlers.ts:498-520`

Risk:

- main 可保留平台资源访问、生命周期、高频缓冲、批处理、队列和背压，但不能拥有 receive/send/task/SCOE/result/report/northbound 领域语义。

### 5.4 High-frequency packet push

- 旧链路是 main/preload/API/store 多段事件推送，receive 又同步推进统计、展示、trigger 和 status。
- high-speed storage 命中后直接短路普通 renderer data event。`src-electron/main/ipc/networkHandlers.ts:505-520`

Risk:

- 新设计必须在 feature design 中写清 batch、delta、queue、throttle、snapshot、backpressure 和 UI refresh 边界，不能让页面或多个 store 逐包消费底层事件。

### 5.5 `shared/common` repeated implementation

- `rewrite/src/shared` 目前不存在，旧 `src/utils/common`、`src/composables/common`、`src/components/common` 分散承担通用能力。
- `withErrorHandling` 在 `src/utils/common/errorUtils.ts:23` 和 `src/utils/frames/frameInstancesUtils.ts:16` 重复。
- file dialog 能力分散在 EventBus、fileDialogManager、dialogUtils、layout/composable/API wrapper 中。

Risk:

- `shared` 只能接收纯 TS、无 Vue/Pinia/Electron/platform、无业务 owner 的稳定 helper；不能把旧 `src/utils` 整体迁入 shared。

### 5.6 `src/utils` business helper mixing

- `src/utils/receive/scoeFrame.ts` 位于 receive utils，却直接 import receive store，并承担 SCOE 参数解析、完成条件和轮询相关逻辑。`src/utils/receive/scoeFrame.ts:5`, `src/utils/receive/scoeFrame.ts:416-491`
- `src/utils/common/ipcUtils.ts` 直接 import `electron.ipcMain`。`src/utils/common/ipcUtils.ts:6-35`
- `src/utils/common/dialogUtils.ts` 同时 import Electron、fs、path 和 Vue inject。`src/utils/common/dialogUtils.ts:6-12`

Risk:

- `src/utils` 不是 `shared` 来源，只是 legacy candidate pool；后续需要单独 shared/tooling 对话逐文件判定 owner。

## 6. `src/utils` Owner Pre-Screen

本节只做 owner 级别初筛，不做逐文件最终 audit。

| Current path | Candidate owner | Evidence / reason | Risk |
| --- | --- | --- | --- |
| `src/utils/frames/frameUtils.ts` | `frame`, with possible pure `shared` extracts | frame filter/sort/date/deepClone/validation style helpers | 职责过宽；`formatDate` 与 common date helper 重叠 |
| `src/utils/frames/fieldValidation.ts` | `frame` | field/expression/mapping validation | 与 receive mapping validation 可能重叠 |
| `src/utils/frames/defaultConfigs.ts` | `frame` / `settings` | default strategy/expression-like config factories | 默认值归口需按 feature design 拆分 |
| `src/utils/frames/frameInstancesUtils.ts` | `send`, with frame encoding input | send instance -> buffer、checksum、field encoding | 混有 `withErrorHandling`，且 send/frame 边界重叠 |
| `src/utils/frames/hexCovertUtils.ts` | candidate `shared` only if pure; otherwise `frame/send/receive` | hex conversion and value comparison | 需确认是否无业务语义；不能直接搬 shared |
| `src/utils/frames/taskConfigUtils.ts` | `task` | task config extraction/validation | 旧 send task 不等于 northbound task |
| `src/utils/frames/strategyValidation.ts` | `task` / `send` | timed/trigger strategy validation | strategy owner 需在 task design 中固定 |
| `src/utils/receive/dataProcessor.ts` | `receive/core` | match/process received data | 可作为 parser fixture 候选，但不能留 main-only |
| `src/utils/receive/frameMatchers.ts` | `receive/core` | frame identifier matching | preserve as pure parser candidate |
| `src/utils/receive/frameValidators.ts` | `receive/core` or `frame` boundary validator | mapping/frame/group validation | 与 frame field validation 边界需后续 audit |
| `src/utils/receive/labelOptionGenerators.ts` | `receive` / `widgets` candidate | receive display option helper | 若只是 UI option，不能进入 core |
| `src/utils/receive/scoeFrame.ts` | `scoe/core`, with receive input boundary | SCOE frame recognition, param extraction, completion checks | 当前直接依赖 receive store，不能作为 shared |
| `src/utils/common/ipcUtils.ts` | `platform/main tooling` | direct `ipcMain.handle` | 不属于 renderer shared；需移出 business utils |
| `src/utils/common/dialogUtils.ts` | `platform` / `widgets` split candidate | Electron dialog/fs/path plus Vue inject | 平台/UI/文件业务混杂 |
| `src/utils/common/fileDialogManager.ts` | `widgets` / `storage` / `platform facade consumer` split candidate | EventBus file dialog + filesAPI | UI event bus 与 storage API 混合 |
| `src/utils/common/EventBus.ts` | `app` / `widgets` event utility candidate | Quasar EventBus plus Vue lifecycle | 不属于 pure shared |
| `src/utils/common/dateUtils.ts` | possible `shared` | date formatting | 需和 frame date formatting 去重 |
| `src/utils/common/errorUtils.ts` | possible `shared` if no UI/platform dependency | error wrapper/logging | 与 frameInstancesUtils 重复 |
| `src/utils/common/fileUtils.ts` | `platform/main` or storage tooling candidate | file path/fs helper | 需确认 Electron/Node dependency |

Explicit guard:

- 旧 `src/utils` 不是 `rewrite/src/shared` 的来源。
- 后续必须开单独 `shared/tooling` 对话，对 `src/utils`、`src/composables/common`、`src/components/common`、`src/api/common` 逐文件判断：保留在 feature、拆到 platform、拆到 widgets、抽 pure shared、或 candidate drop。

## 7. Merge / Split Risk Register

| Risk | Affected features | Why risky | Current pre-screen |
| --- | --- | --- | --- |
| frame vs receive | `frame`, `receive` | receive 依赖 frame definitions，但旧 receive store 监听 frame 并同步 main cache | 分开。frame owns static assets; receive consumes explicit snapshots |
| send vs task | `send`, `task` | 旧发送页和 send composables 同时承载发送执行、定时、触发和任务状态 | 分开。send owns send result; task owns lifecycle |
| task vs northbound task | `task`, `northbound` | 旧 send task 与甲方 task 名似但语义不同 | 分开。旧 task 是 local oracle; northbound task 是 external transaction |
| SCOE vs receive/send | `scoe`, `receive`, `send` | 旧 SCOE 分支嵌在 receive/store/send target 中 | SCOE 独立 owner，通过 explicit receive input / send request 接入 |
| storage vs report/delivery | `storage`, `report`, `northbound` | 旧 history/CSV/local export 容易被当 TestReport/FTP closure | 分开。storage stores materials; report generates object; northbound delivers |
| status vs result | `status`, `result` | 状态指示和统计不等于结果事实 | 分开。status is read model; result owns execution result |
| display vs receive/storage/status | `display`, `receive`, `storage`, `status` | 旧 dataDisplayStore 把展示配置、实时采样、记录状态、历史保存和状态素材混在一起 | 分开。display owns preference/projection/snapshot；source truth 留在 receive/storage/status |
| connection target vs northbound device | `connection`, `northbound` | serial/network target 不是 customer `deviceId` | 分开。connection owns transport; northbound owns external identity mapping |
| common/widgets/shared | `widgets`, `shared`, all features | 旧 common/utils 混有 UI、平台和业务规则 | 不整体迁移；逐文件 audit |

## 8. Public API And Runtime Pre-Screen

Likely public API required:

- `frame`: read-only frame asset selectors, validation, import/export/migration entry.
- `connection`: target snapshot, connection status, platform send/receive availability.
- `receive`: receive result stream/read model, parser fixture entry, config sync entry.
- `send`: send request service and send result output.
- `task`: task command/query service, lifecycle read model.
- `scoe`: command execution, status query, explicit receive/send adapters.
- `storage`: persisted asset/history/file APIs via platform-safe facade.
- `settings`: typed settings snapshot and update entry.
- `status`: status summary and indicator read model.
- `display`: display preference reader/service, table/chart/scatter/history projection selector, transient display buffer operations.
- `result`: result query and aggregation entry.
- `report`: report generation entry and report file candidate query.
- `northbound`: inbound request handling, outbound projection, delivery status.

Likely runtime orchestration required:

- App startup/shutdown service wiring.
- Platform resource lifecycle for connection, storage, timers, HTTP/FTP.
- receive/send/task/SCOE interaction routing.
- display source material routing and high-frequency display snapshot throttling/backpressure registration.
- result/report/northbound phase-one loop.
- high-frequency data batching/backpressure registration.
- boundary exception registry for SCOE, high-speed storage, packaged data path, HTTP/FTP delivery.

Runtime must not own:

- receive parser.
- send frame builder.
- task state machine.
- SCOE protocol semantics.
- result attribution.
- report generation semantics.
- northbound external error mapping.

## 9. Validation Pre-Screen

Automatic fixture / oracle candidates:

- frame asset validation and legacy JSON migration.
- receive bytes -> match -> fields -> expression/result.
- send build -> target request -> send result.
- timed/trigger send and task state transition.
- SCOE command parse, checksum, parameter extraction and completion condition.
- storage/history/CSV/export.
- status mapping.
- display preference normalization and table/chart/scatter/history projection.
- result/report object generation.
- northbound request/response mapping after customer semantics are confirmed.

Manual checklist candidates:

- 页面入口仍可达：connection、frame list/editor、send、receive、storage、history、settings、SCOE。
- 文件导入导出、设置读写、状态指示展示、表格/图表/星座图展示。
- connection 操作流程和 target selector 行为。
- SCOE 工具操作和状态面板可见行为。
- history/report/local export 用户可见结果。

Runtime / hardware / customer validation required:

- 真实串口枚举、连接、断开、收发和事件顺序。
- TCP/TCP server/UDP 断线、重连、高频数据、remote host 变化。
- SCOE 真实设备、timeout、状态循环和完成条件。
- 打包态 data path 写入、备份、清理、长期文件保留。
- high-speed storage 命中后是否短路普通 receive/display/trigger 链。
- northbound HTTP/FTP 交付、失败补偿、完成通知和客户侧接收确认。

## 10. Next Step Gate

下一轮 `interaction matrix` 对话可以开始，前提是继续保持本轮边界：

- 只讨论 feature 间交互方向、producer/consumer、事实 owner、public API 候选和 runtime 编排候选。
- 不写字段 schema。
- 不写 northbound 接口字段。
- 不写 receive/send/task/SCOE 内部流程。
- 不进入任何 `cs-feat-design`。

Not blocking, but must stay visible:

- `northbound` 仍缺甲方正式 schema、枚举、错误码、TestReport 样例、FTP/HTTP 联调资产。
- `SCOE`、真实串口/TCP/UDP、高速存储和打包态 data path 都缺 runtime/hardware evidence。
- `src/utils` 需要单独 shared/tooling 逐文件 audit，本文不能替代。
