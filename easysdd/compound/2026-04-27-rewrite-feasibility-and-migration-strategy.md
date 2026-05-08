---
doc_type: explore
type: rewrite-strategy
memo_type: rewrite feasibility and migration strategy
status: current
date: 2026-04-27
summary: Evaluates shifting from cleanup-first refactoring to whole-application rewrite, defining scope, staged migration strategy, old-system oracle usage, first vertical slice, validation approach, and risks without starting implementation.
tags:
  - rewrite
  - migration-strategy
  - cleanup-first
  - architecture
  - validation
---

# Rewrite Feasibility and Migration Strategy Memo

## 1. Context recap

Evidence:

- 本轮输入要求从“继续旧代码 cleanup-first”转向“整应用重写”的可行性和迁移策略收口，但明确禁止写代码、生成新项目骨架、进入 feature design 或 implementation。
- 本轮指定的 `easysdd/compound/...` 必读文档在当前工作树中不可读；同名资料实际位于 `codestable/compound/...`。本 memo 的历史证据引用以当前可读的 `codestable/...` 为准，输出仍落到用户指定的 `easysdd/compound/...`。
- 既有文档已经把当前仓库定性为“本地运行骨架”：帧收发工作台、send task、SCOE、本地存储/历史等已经存在，但不是完整“中心协同接入型集成测试系统骨架”。`codestable/compound/2026-04-23-spike-capability-domain-current-code-map.md:30`
- 既有 guardrail 的核心目标是先清事实源和边界，防止把旧 hotspot 直接升格为目标事实。`codestable/compound/2026-04-24-cleanup-to-design-process-guardrail.md:17`
- 严格 gate 下，当时没有真正 design-now；下一步只能 cleanup-first 和 checkpoint。`codestable/compound/2026-04-24-post-step3-review-and-execution-gating.md:275`

Inference:

- cleanup-first 原本是为了避免从旧热点直接跳目标架构，但 1A/1B/1C/Platform checkpoint 暴露出：旧代码里的事实源、运行态、发送结果、领域特例、平台能力边界已经纠缠在同一批热点上。
- 因此，本轮转折点不是“发现代码质量差”，而是“继续逐刀 cleanup 会把大量精力投入到不应成为目标骨架的旧结构上”。

Deferred:

- 本 memo 不是正式 architecture decision，也不批准目录结构、字段 schema、DTO、IPC contract 或新 UI 方案。

## 2. Executive decision

Strategy decision:

- 建议从“继续旧代码 cleanup-first 作为主路线”切换到“整应用重写路线”的决策准备与迁移策略。
- 不建议 big-bang 一次推倒重写。
- 推荐 staged rewrite / strangler rewrite：目标是整应用重写，迁移方式是分阶段 vertical slice 替换；旧系统在迁移期间继续承载生产使用和 oracle 角色。
- 推荐第一条 vertical slice 选择 `receive -> parse -> display current value`，先建立可对照、风险最低的运行骨架薄片；`send explicit frame -> target -> result` 作为紧随其后的候选；`task receive-triggered send minimal loop` 不适合作为第一条，因为它同时跨 1A/1B/1C、任务、发送、接收和平台验证面。

必须区分：

- 用户倾向：用户当前倾向整应用重写。
- 证据支持：现有文档和代码证据支持“旧代码 cleanup-first 成本过高，应转向重写策略收口”。
- 仍需决策：这还不是正式批准 big-bang rewrite，也不是批准新架构文档或 implementation。

Evidence:

- 当前接收热点同时承担接收队列、解析、表达式、统计、触发、SCOE 等多能力域职责。`codestable/compound/2026-04-23-spike-capability-domain-current-code-map.md:207`
- send-task cluster 是本地发送执行/调度/监控簇，不是中心任务事实源。`codestable/compound/2026-04-24-code-reality-check-before-1b-cleanup-plan.md:20`
- unified sender 当前同时承担发送、目标解析、统计副作用和 SCOE 固定目标记录。`codestable/compound/2026-04-24-code-reality-check-before-1c-cleanup-plan.md:117`
- Platform API checkpoint 明确：不能直接关闭隔离、删除 preload/common wrapper 或把 owner inclination 当 decision。`codestable/compound/2026-04-24-platform-api-boundary-code-reality-check.md:21`

Deferred:

- 正式 rewrite ADR。
- 第一阶段资源、期限、验收口径。
- 平台隔离、bridge 暴露面、文件/网络权限模型。
- 新旧并行运行方式。

## 3. Why cleanup-first became too costly

Evidence:

- 1A 第一刀最终只能选择 `receiveFramesStore` 中接收入口串行化边界，真正的解析、统计、触发、SCOE/result 等仍留在 `processDataInternal`。`codestable/compound/2026-04-24-batch-1a-implementation-preflight-and-first-patch-selection.md:21`
- 1A 的安全候选被明确限定为 one-file、lock/queue/FIFO/finally 基线，架构收益小但风险最低。`codestable/compound/2026-04-24-batch-1a-implementation-preflight-and-first-patch-selection.md:35`
- 1B 不能把 send-task 状态当中心任务生命周期；`completed`、`paused`、timer、listener、cache 都不能证明中心生命周期。`codestable/compound/2026-04-24-code-reality-check-before-1b-cleanup-plan.md:68`
- 1C 不能继承当前 request/result/target shape；SCOE 固定 target 只是反侵点，不是目标结构。`codestable/compound/2026-04-24-code-reality-check-before-1c-cleanup-plan.md:167`
- 回归保护计划承认 `pnpm test` 只是占位，lint/build 不能证明 runtime behavior，大量行为依赖手工矩阵。`codestable/compound/2026-04-24-batch-1a-regression-protection-plan.md:57`
- Platform boundary 是独立大线，不能并入 1A。`codestable/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:181`

混合点类型:

- 事实源混合：接收当前值、缓存、展示、表达式、统计、触发候选混在 `receiveFramesStore`。
- 生命周期混合：本地发送执行态、timer、trigger listener、页面 current task 被误用为任务生命周期线索。
- 发送混合：通用发送、目标解析、统计副作用、SCOE 固定目标记录混在 `useUnifiedSender`。
- 领域特例混合：SCOE 在接收链 early-return，在发送链固定 target，同时还维护测试工具记录。
- 平台能力混合：main/preload/common 三层重复包装，文件、网络、timer、路径、存储暴露面宽。
- 结果归口混合：history/storage/files 可提供记录证据，但不能直接升级为结果事实或报告交付边界。

Inference:

- 继续 cleanup-first 会持续面对“每一刀都必须保护旧行为，但每一刀都不能把旧结构当目标结构”的矛盾。
- 它仍有价值，但更适合作为 oracle capture 和风险地图维护，而不是主交付路线。

## 4. Rewrite scope

Strategy decision:

- “整应用重写”在本 memo 中指：最终用新的 runtime core、platform boundary、UI shell/pages 和领域接入方式替换现有应用主路径。
- 迁移第一阶段不是 UI 全量重做，而是 runtime core first + platform boundary decision + minimal UI surface。
- 旧代码继续承载生产使用、行为对照、数据样本和回归 oracle；除关键缺陷修复、oracle 捕获、必要兼容外，不再继续按 1A/1B/1C 做长期 cleanup 主路线。

Evidence:

- 当前代码还不是中心协同接入骨架，北向结果交付边界未形成。`codestable/compound/2026-04-23-spike-capability-domain-current-code-map.md:123`
- 目标运行骨架应围绕子系统运行主体、中心任务上下文、用例执行上下文、生命周期控制状态、结果归口状态组织；页面状态、发送任务监控、接收当前值、历史记录、综合状态不是运行骨架。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:58`
- 中心测试任务不是现有发送任务同义词。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:50`

Deferred:

- 是否保留现有 Quasar/Electron 技术组合。
- 新旧系统是否同进程并存、双应用并行，或用数据/fixture 离线对照。
- 新目录、包结构、模块命名。

## 5. Big-bang vs staged rewrite

Evidence:

- 旧系统保存了大量隐性行为：入站顺序、解析成功/失败 side effect、显示/统计、触发任务、SCOE early-return、固定 target、平台 fallback。`codestable/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:122`
- 当前自动化验证不足，真实串口、网络 socket、preload/IPC、SCOE E2E、UI 回归都不能只靠命令证明。`codestable/compound/2026-04-24-batch-1a-regression-protection-plan.md:201`
- Electron bridge 暴露系统、串口、网络、文件、接收、存储、历史、定时器等宽能力。`src-electron/preload/api/index.ts:14`

比较:

| 策略 | 收益 | 主要风险 | 判断 |
| --- | --- | --- | --- |
| Big-bang rewrite | 可以一次摆脱旧热点形状，目标结构表达更干净 | 隐性行为丢失、平台权限重开口、SCOE/收发链回归不可定位、没有可执行 oracle 对照 | 不建议 |
| Staged rewrite / strangler | 目标仍是整应用替换，但每个 slice 有旧系统 oracle 和阶段验收 | 需要维护新旧并行边界，前期决策成本更高 | 推荐 |

Strategy decision:

- 推荐 staged rewrite。
- 这仍然算“整应用重写”，不是继续小修旧系统，因为目标代码路径、运行骨架、平台边界和 UI 组织都以新系统为终局；旧系统只保留生产和 oracle 价值，不作为长期演进骨架。

Stop condition:

- 如果下一阶段要求“一次性停用旧系统并直接上线新系统”，应暂停 rewrite，先补 oracle 和平台权限决策。

## 6. Old system as oracle

Strategy decision:

- 旧系统保留为 executable oracle、manual checklist 来源、fixture 采集源。
- 旧系统不再作为目标模块边界来源，也不再继续大规模重构。

应保留为 oracle 的旧模块:

- 接收主链：`src/stores/frames/receiveFramesStore.ts` 中队列、SCOE early-return、`receiveAPI`、成功/失败处理、trigger 转发。
- 发送任务簇：`src/stores/frames/sendTasksStore.ts`、`useSendTaskManager.ts`、`useSendTaskExecutor.ts` 及 trigger listener/timer 行为。
- 发送落地：`useUnifiedSender.ts`、`connectionTargetsStore.ts`。
- SCOE：`scoeStore.ts`、SCOE frame instances、SCOE test tool、SCOE command handling。
- Platform API：`src-electron/main/ipc/*Handlers.ts`、`src-electron/preload/api/*`、`src/api/common/*Api.ts`。
- 数据/历史：接收配置、发送实例、历史分析、高速存储、本地 JSON 文件、报告相关现有记录。
- UI workflow：连接管理、接收显示、发送工作台、SCOE 页面、历史分析页面。

不再重构的旧代码范围:

- 不继续把 `receiveFramesStore` cleanup 成目标接收模块。
- 不继续把 `sendTasksStore` cleanup 成中心任务系统。
- 不继续把 `useUnifiedSender` cleanup 成目标发送协议。
- 不继续把 `history/storage/files` cleanup 成结果/报告域。
- 不通过旧 `window.electron` 宽 bridge 的整理来替代平台边界决策。

必须提取为 fixture/checklist/oracle 的行为:

- 入站顺序、串行化、FIFO、连续接收行为。
- 解析成功、解析失败、unmatched、parse error、recent data、frame stats。
- current value、表达式结果、常量组、星座值、显示数据更新。
- receive-triggered send 的触发条件、source identity、updated items。
- send task 状态变化、pause/resume/stop/completed 删除行为、timer cleanup。
- 显式发送到 serial/network/UDP remote 的 target availability 与结果。
- 发送统计副作用和 SCOE 固定 target 记录。
- SCOE TCP server source early-return、SCOE command success/failure、状态定时器。
- 文件、网络、timer、path、storage 的 bridge fallback 和错误口径。

## 7. Target capability domains for rewrite

Evidence:

- 既有 scoping 文档提出 6 个能力域作为 taxonomy，不是最终模块树。`codestable/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:57`
- 接收主链和发送主链的架构约束是消费明确边界输入、产出明确边界结果。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:31`
- 任务系统应是独立能力域，不等于页面、发送主链、接收主链、监控视图或领域模块。`refactor/docs/03-architecture/06-任务系统归口方式.md:74`
- SCOE 推荐作为二级领域模块，通过显式接收、发送、任务边界接入。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:118`
- 北向协同边界应独立于任务系统、主状态和收发主链。`refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:81`

| Capability domain | 重写目标定位 | 第一阶段是否进入 |
| --- | --- | --- |
| 接收主链 | 入站事实、解析结果、显示投影、触发候选的边界化 | 进入。作为第一条 slice 主轴 |
| 发送主链 | 显式发送请求、目标落地、标准发送结果 | 进入但不抢第一条，作为第二候选 |
| 任务系统 | 中心任务、用例上下文、生命周期、调度、结果归口推进 | 只做边界决策，不做第一条 slice |
| Platform API boundary | Electron IPC/preload/common facade、文件/网络/timer/path 权限模型 | 进入。先做决策问题和能力清单 |
| SCOE | 二级领域模块，保留固定 source/target/command 规则 | 第一阶段保留 oracle，不作为主轴 |
| result/report | 结果事实、报告材料、对外交付口径 | 第一阶段只定义进入条件，不做完整报告 |
| history/storage | 本地记录、fixture 来源、历史查看 | 第一阶段作为 oracle/fixture 数据，不重写为结果域 |
| UI shell / pages | 新 runtime 的最小操作面和观察面，最终替换旧页面 | 第一阶段只保留最小显示/验证面，不做全 UI 重做 |

Deferred:

- 北向协同接入、心跳、报告上传、设备状态字段等进入哪一条正式 business slice，需在 first slice 验收后再定。

## 8. First vertical slice candidates

### Candidate A: receive -> parse -> display current value

Evidence:

- 当前 1A 已经把接收入口串行化作为最低风险第一刀，说明这条链的行为 oracle 最清楚。`codestable/compound/2026-04-24-batch-1a-implementation-preflight-and-first-patch-selection.md:70`
- `receiveFramesStore` 当前入口已包含 queue/lock，并在 `processDataInternal` 内串接 SCOE early-return、`receiveAPI`、失败/成功处理。`src/stores/frames/receiveFramesStore.ts:805`
- 成功处理更新 current values、表达式、星座、统计，再转发 trigger check。`src/stores/frames/receiveFramesStore.ts:1060`

收益:

- 最容易建立旧新对照。
- 能验证入站、解析、显示投影、统计等核心基础。
- 不需要先拍中心任务、发送结果、SCOE 成功条件或报告字段。

风险:

- 业务闭环价值有限。
- 需要明确排除 trigger/send/SCOE 领域接管，避免 slice 膨胀。

### Candidate B: send explicit frame -> target -> result

Evidence:

- `useUnifiedSender` 当前入口是 `(targetId, frameInstance)`，不是明确业务发送请求。`src/composables/frames/sendFrame/useUnifiedSender.ts:69`
- `connectionTargetsStore` 负责 serial/network/tcp-server/udp remote target 刷新和 availability。`src/stores/connectionTargetsStore.ts:35`
- 当前发送结果还夹带统计异步副作用和 SCOE 固定 target 记录。`src/composables/frames/sendFrame/useUnifiedSender.ts:146`

收益:

- 能尽早暴露 platform bridge、target、network/serial 发送边界问题。
- 是后续任务系统闭环的必要基础。

风险:

- 容易把旧 targetId/result shape 误继承为目标 schema。
- 平台权限问题会扩大 slice 半径。

### Candidate C: task receive-triggered send minimal loop

Evidence:

- 现有 receive trigger 通过 `receiveFramesStore.checkTriggerConditions` 回读 groups，再调用 `sendTasksStore.handleFrameReceived`。`src/stores/frames/receiveFramesStore.ts:1252`
- send task executor 的 running/waiting-trigger/timer/completed/error 路径复杂，且 `completed` 会与删除、cache cleanup 绑定。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451`
- 任务系统文档明确：现有发送任务对象只能是本地发送执行对象，不能等同中心任务上下文。`refactor/docs/03-architecture/06-任务系统归口方式.md:126`

收益:

- 最接近后续业务闭环。
- 能同时检验接收、任务、发送三条主链边界。

风险:

- 同时跨 1A/1B/1C、任务系统、发送主链、接收主链、平台验证，第一条 slice 过宽。
- 旧系统 oracle 需要同时覆盖触发、发送、状态、timer、失败恢复，当前自动化不足。

Strategy decision:

- 第一条推荐 Candidate A。
- Candidate B 作为第二条 slice 候选。
- Candidate C 作为第一批业务闭环候选，但必须等 A/B 的边界和 oracle 过关后再进入。

## 9. Recommended first vertical slice

推荐第一条：`receive -> parse -> display current value`。

目标:

- 证明新 runtime 可以承接入站数据、完成解析、形成当前值/显示投影，并与旧系统行为可对照。

范围:

- 接收输入承接。
- 解析成功/失败口径。
- 当前值和显示投影。
- recent/statistics 的最小对照。
- 旧系统 fixture/manual checklist 对照。

排除项:

- 不接入 send task。
- 不做 receive-triggered send。
- 不做 SCOE 领域接管。
- 不设计中心任务生命周期。
- 不设计 result/report schema。
- 不设计北向接口字段。
- 不拍 `contextIsolation`/`nodeIntegration` 最终策略。

完成信号:

- 同一组旧系统采集的入站样本，新旧系统在顺序、解析成败、当前值、显示投影、关键统计上能对照。
- 失败样本有明确 expected behavior。
- 无法自动验证的串口/网络/UI 行为形成手工 checklist。
- 平台能力边界中的文件、网络、timer、path 进入 deferred decision 清单，没有被 slice 顺手继承。

Deferred:

- 这条 slice 不是最终业务闭环，也不是完整任务系统。
- 中心任务接入、显式发送、结果归口、北向交付进入后续 slice。

## 10. Validation strategy

Strategy decision:

- 使用“双层验证”：旧系统行为 oracle + 新架构边界验证。
- 第一阶段不追求完整自动化覆盖，但必须把可重复的旧行为提取为 fixture，把不可自动化的运行态列为 manual checklist。

Fixture candidates:

- receive frame 样本：匹配、不匹配、parse error、连续帧、高速连续入站。
- mapping/source 样本：serial、network、tcp-server、SCOE source。
- current value/display 样本：普通字段、表达式、常量组、星座值。
- trigger 样本：source identity、updated items、条件命中/不命中。
- send target 样本：serial target、network tcp、udp remote、unavailable target。
- send frame instance 样本：表达式计算、buffer 生成、发送成功/失败。
- SCOE 样本：TCP source early-return、command receive、fixed UDP target、status timer。
- platform fallback 样本：bridge 缺失、IPC 失败、路径/文件/网络失败。

Manual checklist:

- 真实串口入站。
- 网络 TCP client/server/UDP 入站。
- UI current value 展示。
- 触发发送闭环。
- 目标不可用发送。
- SCOE 固定 target 和测试工具记录。
- Electron preload/IPC/fallback。
- history/storage/report 现有数据读取。

当前无法验证:

- 没有完整自动化测试证明 runtime behavior；`pnpm test` 在既有计划中只是占位。`codestable/compound/2026-04-24-batch-1a-regression-protection-plan.md:57`
- 真实硬件、真实网络环境、SCOE E2E、Electron packaged 行为需要运行态或硬件/仿真环境。
- 北向字段、报告 JSON、心跳协议、交付方式仍未确认。`codestable/compound/2026-04-23-spike-capability-domain-current-code-map.md:300`

Stop condition:

- 如果无法产出第一条 slice 的旧系统 fixture 或手工 checklist，不应进入实现。

## 11. Platform boundary strategy

Evidence:

- 当前 Electron 窗口配置是 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`。`src-electron/main/window.ts:28`
- preload 聚合暴露 `window/menu/autoLaunch/serial/network/files/dataStorage/path/receive/highSpeedStorage/historyData/timerManager`。`src-electron/preload/api/index.ts:14`
- renderer common API 统一导出系统、文件、串口、网络、路径、接收、存储、高速存储、历史、timer。`src/api/common/index.ts:6`
- 文件 handler 接收 renderer 路径并直接 `readdir/mkdir/writeFile/readFile/unlink`。`src-electron/main/ipc/fileMetadataHandlers.ts:8`
- 网络 handler 接收 renderer 配置后创建 TCP client、TCP server、UDP socket。`src-electron/main/ipc/networkHandlers.ts:33`
- timer preload 允许 renderer 订阅自定义 event channel。`src-electron/preload/api/timerManager.ts:111`
- main 层存在 import preload `pathAPI` 的倒挂。`src-electron/main/ipc/dataStorageHandlers.ts:12`

Strategy decision:

- 重写不能直接继承当前宽 bridge、renderer-controlled path、renderer-controlled network endpoint/server、custom event channel、main import preload 的结构。
- 不在本 memo 拍 `contextIsolation` 是否保留；这必须作为后续独立 decision。
- 第一阶段必须先建立 platform capability inventory、权限模型、IPC/event channel 清单、runtime data root 策略。

Deferred decision questions:

- renderer threat model 是可信本地 UI，还是要按可能被 XSS/依赖污染处理？
- `contextIsolation` 是否继续开启？
- 是否允许 `nodeIntegration`，如果允许，哪些目录或页面可触达 Node/Electron？
- `window.electron` 是继续聚合暴露，还是拆成 capability-scoped bridge？
- 文件 API 的允许根目录、读写删权限、导入导出路径如何定义？
- 网络 API 是否拆分内部链路能力和北向协同接入能力？
- timer/event channel 是否集中登记并限制订阅范围？
- `src/api/common` 是长期 renderer facade、迁移兼容层，还是重写时收敛为新 platform client？

## 12. Quality and convention requirements

Evidence:

- 项目质量分析明确：当前只做规范体系前置讨论，不写正式规范。`codestable/compound/2026-04-24-project-quality-conventions-system-analysis.md:18`
- 需要分阶段文档：discussion/design readiness、cleanup gate、implementation guardrail、frontend-electron boundary、Pinia state ownership、review checklist、regression protection、thin AGENTS entry。`codestable/compound/2026-04-24-project-quality-conventions-system-analysis.md:64`
- 候选硬规则包括：无 cleanup/re-gate 不进 design、hotspot 不能升格、cleanup 不写 spec、旧 shared state/status/result 不外放、规范必须有证据/范围/例外/deferred。`codestable/compound/2026-04-24-project-quality-conventions-system-analysis.md:113`

重写前必须先讨论的规范类别:

- 决策文档格式：Evidence / Inference / Strategy decision / Deferred。
- 阶段门禁：什么时候可进入 design、什么时候可进入 implementation、什么时候必须停。
- runtime state ownership：主事实源、展示态、记录态、缓存态、页面态的边界。
- frontend-electron boundary：renderer、preload、main、common facade 的职责。
- platform capability policy：文件、网络、timer、path、storage 的权限和可见性。
- Pinia/store 使用边界：哪些状态可进 store，哪些只能做 UI projection。
- oracle/fixture/checklist 规范：旧系统行为如何采集、命名、验收。
- review checklist：代码评审、平台风险、回归证据、deferred 决策检查。
- AGENTS thin entry：只承载协作偏好和项目入口，不被大段流程覆盖。

Deferred:

- 不在本 memo 写完整规范文本。
- 不借用其他项目具体技术规则，只借阶段门禁和证据表达结构。

## 13. Risks and stop conditions

### Big-bang 风险

Risk:

- 一次性推倒会丢失旧系统中未文档化的运行行为，尤其是接收顺序、失败 side effects、SCOE、平台 fallback。

Stop condition:

- 任何要求“无 oracle 直接替换旧系统”的计划都应暂停。

### 旧功能遗漏风险

Risk:

- 当前应用包含本地收发、连接、历史、高速存储、SCOE、配置导入导出等工具面；它们未必都是目标第一阶段能力，但不能无记录地消失。

Stop condition:

- 未建立功能 inventory 与 in/out/deferred 表之前，不进入全 UI 替换。

### 行为 oracle 不足风险

Risk:

- 当前测试不足，很多行为只存在于运行态和手工路径。

Stop condition:

- 第一条 slice 的 fixture/checklist 不成形时，不进入实现。

### 平台权限风险

Risk:

- 文件、网络、timer、path、storage bridge 宽暴露，重写若直接继承会把旧平台风险带入新系统。

Stop condition:

- 未完成 platform capability inventory 和 deferred decision 清单前，不修改 isolation/bridge/nodeIntegration 策略。

### 需求膨胀风险

Risk:

- 第一条 slice 容易被扩成任务系统、发送闭环、SCOE、结果报告、北向协同全都进入。

Stop condition:

- 如果 slice 同时跨 receive、send、task、SCOE、report、northbound、platform hardening，应拆分重议。

## 14. Proposed rewrite workflow

Strategy decision:

1. 本 memo 收口：确认是否从 cleanup-first 主路线切换到 staged whole-application rewrite。
2. Rewrite decision memo：只拍路线、范围、oracle 保留、第一条 slice，不写字段和实现。
3. Target boundary sketch：只定义运行骨架、收发主链、任务系统、平台边界、SCOE、结果/报告的职责边界。
4. Platform boundary decision：完成 threat model、capability inventory、bridge/IPC/data root 决策问题。
5. Oracle capture plan：从旧系统提取 first slice fixtures 和 manual checklist。
6. First vertical slice design：围绕 `receive -> parse -> display current value` 进入设计，但不扩大到 task/send/SCOE/report。
7. First slice build and oracle validation：以旧系统 oracle 验证，不用旧代码形状约束新结构。
8. Re-gate next slice：验收后再决定进入 `send explicit frame -> target -> result` 或业务闭环 slice。

Deferred:

- 新项目骨架、目录结构、模块文件、schema、具体 API 命名都放到后续阶段。

## 15. Immediate next questions

1. 是否批准把主路线从“旧代码 cleanup-first”切换为“staged whole-application rewrite”，同时冻结旧系统的大规模 cleanup？
2. 第一条 vertical slice 是否按 `receive -> parse -> display current value` 收口，而不是先做 send 或 receive-triggered task loop？
3. 旧系统在迁移期的定位是否明确为 production + oracle，且只允许关键缺陷修复、数据采集和必要兼容？
4. Platform boundary 是否作为 first slice 前置 decision lane，先处理能力清单、bridge/IPC/data root、隔离策略问题？
5. 第一阶段可用的验证资源是什么：真实串口/网络环境、SCOE 环境、历史数据样本、人工验收人、可重复 fixture 的来源分别有哪些？
