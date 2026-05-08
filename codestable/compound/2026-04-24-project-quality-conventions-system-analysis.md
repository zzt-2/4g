---
doc_type: explore
type: project-quality-conventions-system-analysis
memo_type: project quality and conventions system analysis
status: current
date: 2026-04-24
summary: Pre-norm system analysis for project-level design, implementation, and review conventions. This memo compares existing reference quality/convention documents against the current Quasar/Electron/Pinia cleanup-first architecture evidence, and only records candidate document structure and deferred questions.
tags:
  - project-conventions
  - quality-system
  - cleanup-first
  - design-readiness
  - implementation-guardrail
---

# Project quality and conventions system analysis

## Scope guard

Evidence:

- 当前 guardrail 明确：现阶段目标是先清理事实源和边界，再允许功能进入 design；该 guardrail 不是 feature spec、实现计划或长期代码规范。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:17-25`
- guardrail 已将“project-level design / implementation quality conventions”列为尚未完成项，并要求未来提取规范前必须读当前真实代码结构、当前项目 AGENTS、已有 quality/conventions、cleanup/gating/architecture memos。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:51-60`, `easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:215-227`
- guardrail 明确在完成现有规范盘点、当前代码结构分析、架构边界分析、阶段质量规则讨论、AGENTS 触发时机讨论、试运行与修订前，不应把其他项目规范直接复制为本项目规则。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:242-252`
- 当前仓库根目录未发现实体 `AGENTS.md`；本轮使用的是用户消息中提供的 AGENTS 指令，不能给仓库文件行号。

Sequencing decision:

- 本文只做项目级设计实现规范体系的前置讨论结论。
- 本文不写正式规范，不直接改 `AGENTS.md`，不覆盖 `refactor/docs/quality/*` 或 `refactor/docs/conventions/*`。
- 本文不把 1A/1B/1C 的 cleanup 结论直接升级为长期工程规范。

Deferred:

- 正式规范文件、AGENTS 读取规则、硬规则编号和最终检查表，必须等 cleanup plan / regression protection / cleanup 后 re-gate 至少完成一轮后再写。

## 1. 现有参考规范哪些结构值得借，哪些内容不能借

Evidence:

- `quality/backend.md` 与 `quality/frontend.md` 都把规则分成“硬规则 / 经验规则”，并说明 quality 讲“写到什么程度才算合格”，convention 讲“怎么写”。`refactor/docs/quality/backend.md:3-8`, `refactor/docs/quality/frontend.md:3-8`
- `discussion-feasibility.md` 单独服务讨论阶段，用 `[MUST] / [SHOULD]` 区分阻塞检查与风险检查。`refactor/docs/quality/discussion-feasibility.md:1-7`
- `discussion-feasibility.md` 的 Phase 0 覆盖用户行为、数据模型、API 契约、外部依赖、现有数据、最小可交付范围；A-D 覆盖代码接触面、技术前提、规范兼容性、替代方案与遗漏风险。`refactor/docs/quality/discussion-feasibility.md:11-67`
- `conventions/frontend.md` 绑定 Vue 3 + shadcn-vue + TanStack Query + Vite，并包含 `@/api` 自动生成、DictKey、DetailPageShell 等规则。`refactor/docs/conventions/frontend.md:1-18`, `refactor/docs/conventions/frontend.md:61-133`
- 当前项目实际依赖是 Quasar/Electron/Pinia/Vue/serialport/UnoCSS，不是 shadcn-vue/TanStack Query 项目。`package.json:13-20`, `package.json:22-38`
- 当前 Quasar 配置包含 electron dev/build、boot 文件 `unocss`、`taskManager`、`quasarDefaults`，并通过 Quasar framework plugins 使用 Notify/Dialog。`quasar.config.ts:17-24`, `quasar.config.ts:149-153`
- Electron preload 聚合 `window/menu/serial/network/files/receive/highSpeedStorage/historyData/timerManager` 等 API；渲染层 `src/api/common/index.ts` 再做兼容导出。`src-electron/preload/api/index.ts:1-34`, `src/api/common/index.ts:1-34`

Inference:

- 值得借的是文档体系结构：阶段门禁、实现质量、写法 convention、评审 checklist 分开；每条规则保留适用范围、检查方式、例外和证据。
- 不能借的是具体技术栈内容：NestJS、Prisma、Zod DTO、BullMQ、Socket.IO、`@thesis/shared`、shadcn-vue、TanStack Query、DictKey、DetailPageShell、自动 OpenAPI SDK 等都不是当前项目事实。
- 也不能借旧文档里的固定并发调度方式；用户提供的 AGENTS 指令已经要求按任务规模动态决定子 agent 并发。

Candidate rule:

- 可借格式：`Evidence / Inference / Candidate rule / Deferred`、硬规则/经验规则、阶段 gate、目录职责表、反例/正例、例外说明、读取时机。
- 可借元规则：任何规范条款必须先说明“本项目证据是什么”，不能只因参考文档存在就直接采信。

Deferred:

- 行数阈值、API 调用规则、目录放置规则、自动导入规则、组件拆分规则都必须基于当前 Quasar/Electron/Pinia 代码抽样后再定。

## 2. 本项目后续至少需要哪些规范文档

Evidence:

- guardrail 已要求 sequencing 后才进入 cleanup plan，cleanup plan 必须包含保护行为、观察路径、停止条件和越界项。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:87-102`
- 实现 cleanup 要求小步、只服务边界清理、不引入 feature behavior，不让新对象提前承载 F03-F06 或 F09-F12 业务语义。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:111-126`
- feature design readiness 要求事实源清楚、旧混层隔离或有明确禁止继承项，且不能反向定义通用接收、发送、任务、结果边界。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:142-151`
- 当前代码真实边界横跨 Quasar 页面、Pinia store、composable、renderer API、Electron preload/main IPC。`src/pages/FrameSendPage.vue:109-151`, `src/stores/index.ts:25-32`, `src-electron/preload/api/index.ts:14-31`, `src/api/common/index.ts:6-34`

Inference:

- 本项目后续需要的不是一份“大前端规范”，而是一组按阶段和边界拆开的轻规范。
- 第一批规范应围绕 cleanup-first 工作流服务：先保证设计干净、边界清楚、实现不扩范围、评审不自我背书。

Candidate rule:

| 阶段 | 候选文档 | 覆盖范围 |
| --- | --- | --- |
| Discussion / design | `discussion-design-readiness.md` | 进入 design 前的证据、事实源、边界、deferred 检查；防止只因功能描述清楚就设计。 |
| Discussion / design | `cleanup-to-design-gate.md` | 继承 guardrail，说明 cleanup completion / re-gate / brainstorm 的读取时机。 |
| Implementation | `cleanup-implementation-guardrail.md` | cleanup 实施阶段的小步、保护面、停止条件、禁止 feature behavior。 |
| Implementation | `frontend-electron-boundary-conventions.md` | Quasar 页面、Pinia store、composable、renderer API、preload/main IPC 的职责边界。 |
| Implementation | `pinia-state-ownership-conventions.md` | cleanup 后沉淀 store 能持有什么状态、页面/composable 能写什么状态、哪些状态不能冒充主事实。 |
| Review / acceptance | `cleanup-review-checklist.md` | 检查隐式事实链是否断开，检查是否把 hotspot 升格为正式架构。 |
| Review / acceptance | `regression-protection-checklist.md` | 命令、手工路径、现有行为保护、无法自动验证时的证据要求。 |
| AGENTS entry | `AGENTS.md` thin entry | 只放读取时机、包管理器、禁止事项、子 agent 调度偏好、规范入口，不放厚业务规范。 |

Deferred:

- 是否需要单独的 `electron-ipc-conventions.md`、`quasar-ui-conventions.md`、`scoe-boundary-conventions.md`，等 cleanup 后看风险是否足以单列。

## 3. 哪些规范属于 discussion/design、implementation、review/acceptance

Evidence:

- guardrail 将 Gate 1 定义为 cleanup scope -> sequencing，Gate 2 定义为 sequencing -> cleanup plan，Gate 3 定义为 cleanup plan -> implementation cleanup。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:65-127`
- Gate 4 / Gate 5 分别约束 cleanup 后 re-gate F03-F06 与 design readiness。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:128-151`
- post-step3 在 strict conservative gate 下没有第一批真正 `design-now` 功能。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:275-286`

Candidate rule:

- Discussion / design 阶段规范负责：证据读取、范围锁定、事实源确认、边界仲裁、deferred 清单、是否可进入 design。
- Implementation 阶段规范负责：小步 cleanup、保护现有行为、禁止新增 feature behavior、禁止对象/字段/spec 设计、只处理已批准链路。
- Review / acceptance 阶段规范负责：独立复核、验证证据、回归保护、越界检查、是否满足 re-gate 前提。

Deferred:

- 具体文件名、编号体系、规则编号和 AGENTS 触发语句，不在本轮定稿。

## 4. 哪些规则已经有足够证据成为候选硬规则

Evidence:

- scoping memo 明确当前稳定的是边界语言，不是正式模块树；代码热点不能直接升格为目标骨架。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:28-47`
- guardrail 停止条件包括：讨论字段名、DTO、JSON schema、生命周期枚举；把 `SendTask.status` 当中心任务状态；把 `receiveFramesStore.groups/mappings/allReceiveFrameData` 当任务输入事实；让 common sender 解释任务完成、结果、报告或 SCOE 成功。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:153-164`
- 1A 已确认 `receiveFramesStore` 与 trigger listener 混层，且 1A 不处理 send-task 生命周期、结果事实、发送主链或完整 SCOE 领域设计。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:237-255`
- 1B 已确认 send-task cluster 应收窄为本地发送执行 / 调度 / 监控簇，不是未来中心任务系统。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:351-362`
- 1C 已确认 common sender 应收窄为通用发送执行边界，任务生命周期、领域目标、SCOE 记录、结果事实、报告交付都不应沉积其中。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:178-185`

Candidate rule:

- 没有 cleanup completion / re-gate 证据，不进入 feature design。
- Hotspot 只能作为 cleanup 对象或风险证据，不能被命名为正式目标架构。
- cleanup 文档不得写 spec 字段、生命周期枚举、任务字段、JSON 报告字段。
- `receiveFramesStore.groups/mappings/allReceiveFrameData`、`SendTask.status`、common sender 发送成功/SCOE 记录都不得外放为中心任务、统一状态、结果或报告事实。
- 引入任何长期规范前，必须标注证据来源、适用范围、例外条件和 deferred 项。

Deferred:

- 这些仍是候选硬规则，不是正式规范；正式化前还需要至少一轮 cleanup plan / implementation / review 反馈。

## 5. 哪些规则必须等 cleanup 或更多代码分析后再定

Deferred:

- Quasar 页面与组件的目录职责、页面能持有什么运行状态、弹窗/监控组件如何与 store/composable 交互。
- Pinia store 的长期状态归口：哪些是主状态、派生状态、展示态、记录态、缓存态。
- `src/api/common`、`src-electron/preload/api`、`src-electron/main/ipc` 的边界规则和错误归一规则。
- composable 的职责边界：哪些是 UI 组合逻辑，哪些是本地执行能力，哪些不应写运行事实。
- 本地发送执行对象未来是否全部由任务系统生成，手工发送是否进入统一任务系统。
- SCOE 是否需要单独规范，以及 1D 是否先插队。
- result/local-record/report material 的规范边界；F09-F12 仍缺 result boundary observation。
- 行数阈值、函数参数阈值、重复抽象阈值等实现质量数字，不能照搬参考项目。

Inference:

- cleanup 前硬写这些规则，会把临时现状、旧混层或别项目习惯固定成长期约束。

## 6. `AGENTS.md` 未来应在什么场景要求读取哪些规范

Evidence:

- guardrail 已给出按阶段的最小读取集：Batch 1ABC sequencing、cleanup implementation、feature design、future project-level quality / convention extraction 各自读取不同文档。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:172-227`
- 用户提供的 AGENTS 指令要求默认先讨论、锁边界，facts-first，当前轮目标压窄，不跳过验证宣称完成。

Candidate rule:

- 讨论 / scoping / design 前：读 `cleanup-to-design-process-guardrail.md`、对应 gating memo、相关 cleanup completion / re-gate 文档。
- Batch 1ABC cleanup plan 前：读 sequencing 文档、1A/1B/1C scope memo、相关 architecture docs。
- cleanup implementation 前：读 cleanup plan、regression protection plan、待改模块 scope memo、当前 repo AGENTS。
- feature design 前：读 post-step3 gating、对应 cleanup completion / re-gate、相关 architecture docs；方向不清功能还要读 brainstorm 文档。
- 项目规范提取前：读真实代码结构、AGENTS、quality/conventions 参考文档、已完成 cleanup/gating/architecture memos。
- AGENTS 只记录读取时机和停止条件，不内嵌大段业务规范，不把参考项目规则复制进来。

Deferred:

- 在仓库根目录实体 `AGENTS.md` 出现前，本轮不能给出具体修改方案或行号。

## 7. 下一轮讨论应该聚焦哪 3 到 5 个问题

Candidate rule:

1. 当前项目的规范体系最小文档集是否按“讨论设计 / 实现 / 评审验收 / AGENTS 入口”四类拆分。
2. cleanup-first 阶段哪些规则只作为当前 gate 停止条件，哪些可在 cleanup 后升级为长期硬规则。
3. Quasar/Electron/Pinia/preload/API/composable/page 的真实目录职责应如何抽样验证，抽样到什么程度才允许写 implementation convention。
4. regression protection 在当前 `package.json` 的 `test` 仍是占位时如何定义：命令验证、手工路径、日志证据、还是截图/操作记录。
5. AGENTS 未来保持多薄：只写读取时机和全局协作偏好，还是允许引用一组规范入口。

Deferred:

- 下一轮仍不应写正式规范；应先选定规范文档集、证据门槛和试运行策略。

## Closing classification

Evidence:

- 参考 quality/conventions 的结构可借，但其技术栈和业务内容与当前项目不匹配。
- 当前 cleanup-first 链路的证据足以支撑“规范提取门禁”和“候选硬规则”，不足以支撑最终工程规范。

Inference:

- 本项目规范体系应从当前边界清理和代码事实中长出来，而不是从参考项目迁移过来。

Candidate rule:

- 先建立阶段门禁和评审验收规则，再沉淀 Quasar/Electron/Pinia 具体实现 convention。

Deferred:

- 正式 quality/conventions、AGENTS 修改、实现细节规范和业务对象规范全部延后。
