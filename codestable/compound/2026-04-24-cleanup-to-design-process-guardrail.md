---
doc_type: explore
type: process-guardrail
memo_type: cleanup to design process guardrail
status: current
date: 2026-04-24
summary: Guardrail for the current cleanup-first track, preventing scope drift from cleanup scope into feature design, spec writing, or premature implementation.
tags:
  - cleanup-first
  - process-guardrail
  - execution-gating
  - design-readiness
---

# Cleanup to design process guardrail

## Purpose

本文件用于约束当前阶段的推进方式：先清理事实源和边界，再允许功能进入 design。它不是 feature spec，不是实现计划，也不是长期代码规范。

当前工作的核心目的：

- 防止把现有 `receiveFramesStore`、`sendTasksStore`、`useUnifiedSender`、SCOE 特判、history/storage/files 工具层误升格为目标架构事实。
- 防止从“功能清单清楚”直接跳到 feature design 或代码实现。
- 给后续 cleanup、design、implementation 之间建立可检查的门禁。

## Current source-of-truth chain

当前必须继承的收敛链如下：

| Stage | Artifact | Role |
| --- | --- | --- |
| Spike | `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md` | 建立 capability domain、current code map、cross-cut hotspot 的证据面。 |
| Scoping | `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md` | 拍板当前必须成立的边界、必须延后的边界、核心交叉模块和 cleanup 候选。 |
| Post-step3 gating | `easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md` | 对 F01-F20 给出 `cleanup-first / brainstorm / design-now / defer` gate。 |
| Batch 1A scope | `easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md` | 收口接收输入事实、trigger candidate、接收副作用边界。 |
| Batch 1B scope | `easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md` | 收口 send-task cluster 作为本地发送执行/调度/监控簇，不外放为中心任务事实。 |
| Batch 1C scope | `easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md` | 收口 common sender 只消费显式发送请求，返回标准发送执行结果。 |

任何后续 design 或 implementation 如果与上表冲突，必须先回到 gating / sequencing 阶段仲裁，不能直接改代码绕过。

## Current position

目前已经完成：

- `spike`
- `architecture scoping`
- `post-step3 execution gating`
- Batch 1A / 1B / 1C cleanup scope memo
- Batch 1ABC sequencing and first-cut scope
- code reality checkpoint before 1A cleanup plan

目前尚未完成：

- 1A first-cut cleanup plan
- cleanup plan
- regression protection plan
- implementation cleanup
- F03-F06 re-gate
- F09-F12 result boundary observation / re-gate
- Platform API boundary analysis / decision
- project-level design / implementation quality conventions

Scope decision:

当前下一步只能进入 `1A first-cut cleanup plan`，不应直接进入代码实现、feature design 或 spec 字段设计。

## Deferred platform API boundary

Platform API boundary 指当前 Electron main / preload / renderer common API 分层，包括：

- `src-electron/main/ipc/*Handlers.ts`
- `src-electron/preload/api/*`
- `window.electron.*`
- `src/api/common/*Api.ts`

当前判断：

- 该问题不属于 Batch 1A / 1B / 1C 的第一刀范围。
- 它可能是一条独立基础设施 cleanup 线，后续需要单独做 code reality checkpoint。
- 用户当前倾向关闭 Electron API 隔离 / 简化 `contextBridge` 相关层，但这只是 owner inclination，不是已拍板 decision。
- 在没有 dedicated analysis / decision 前，不得直接关闭 `contextIsolation`，不得直接删除 preload / renderer API wrapper，也不得把这条基础设施线塞进 1A cleanup。

Deferred:

- 是否保留 `contextIsolation` / `contextBridge`。
- renderer 是否继续通过 `src/api/common/*Api.ts` 间接访问 `window.electron.*`。
- main 进程是否存在依赖 preload API 的层次倒挂，以及如何归口。
- fallback “Electron API 不可用”是否保留。
- Platform API cleanup 应在 1A 前、1A 后还是与 1B/1C 并行。

## Stage gates

### Gate 1: cleanup scope -> sequencing

允许进入 sequencing 的条件：

- Batch 1A/1B/1C 已分别说明各自边界。
- 已明确哪些内容属于 `Scope decision`，哪些必须 `Deferred`。
- 没有把现有 hotspot 模块升格为正式目标架构。

Sequencing 文档必须回答：

- 第一刀从哪条事实链切。
- 1A/1B/1C 的依赖顺序。
- 哪些行为必须先保护。
- 哪些模块可以暂不动。
- 哪些判断仍不能拍板。

建议产物：

`easysdd/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md`

### Gate 2: sequencing -> cleanup plan

允许进入 cleanup plan 的条件：

- 已明确第一刀只切哪条链路。
- 已明确不做哪些功能设计。
- 已明确回归保护面。
- 已明确若遇到 SCOE 或 F09-F12 是否需要补 Batch 1D / result observation。

cleanup plan 必须回答：

- 要保护哪些现有行为。
- 要观察哪些命令/测试/手工路径。
- 每一步的停止条件是什么。
- 哪些改动一旦出现就是越界。

禁止在 cleanup plan 里做：

- 设计中心任务字段。
- 设计生命周期枚举。
- 设计 JSON 报告字段。
- 设计北向协议。
- 设计 SCOE 专题能力。

### Gate 3: cleanup plan -> implementation cleanup

允许进入实现 cleanup 的条件：

- 已有明确 cleanup plan。
- 已有回归保护或至少明确可验证路径。
- 改动范围小、可回滚、只服务于边界清理。
- 不引入 feature behavior。

实现 cleanup 的原则：

- 小步改。
- 优先断隐式事实链。
- 不新增大抽象替代旧混层。
- 不让新对象提前承载 F03-F06 或 F09-F12 的业务语义。
- 每轮改动后验证，不把失败留到下一轮。

### Gate 4: implementation cleanup -> re-gate F03-F06

允许重新评估 F03-F06 的条件：

- 1A 的接收事实 / trigger candidate 不再依赖 `groups/mappings/allReceiveFrameData` 补语义。
- 1B 的本地 send execution 不再外放为中心任务事实。
- 1C 的 common sender 不再沉积任务生命周期、领域特判或结果事实。

重新评估只回答：

- F03-F06 是否仍是 `cleanup-first`。
- 是否有某个功能可进入 design。
- 哪些仍需 brainstorm 或 defer。

### Gate 5: design readiness

允许某功能进入 feature design 的条件：

- 它的事实源已清楚。
- 它依赖的旧代码混层已被隔离或有明确禁止继承项。
- 它不会反向定义通用接收、发送、任务、结果边界。
- 它不是因为“功能描述清楚”才进入 design，而是因为代码落点和边界也足够清楚。

当前 strict conservative gate 下，没有第一批真正 `design-now` 功能。

## Stop conditions

出现以下情况必须停回上一级仲裁：

- 开始讨论字段名、DTO、JSON 报告 schema、生命周期枚举。
- 开始把 `SendTask.status` 当中心任务状态。
- 开始把 `receiveFramesStore.groups/mappings/allReceiveFrameData` 当任务输入事实。
- 开始让 common sender 解释任务完成、用例结果、报告交付或 SCOE 领域成功。
- 开始让 `historyAnalysis/highSpeedStorageStore/filesAPI` 充当结果事实或报告对象。
- 开始把 `09` 的北向接入/交付二分当作已批准正式架构。
- 开始把完整 case/script/menu、升级/重启、完整告警拉进第一批主线。
- 开始修改 `contextIsolation` / `contextBridge` / `window.electron.*` / `src/api/common/*Api.ts` 这类 Platform API 边界。

处理方式：

- 如果是边界未清，回到 cleanup sequencing / cleanup scope。
- 如果是功能方向未清，后续走 `.agent/skills/easysdd-feature-brainstorm/SKILL.md`。
- 如果是已拍板约束需要长期保存，走 `.agent/skills/easysdd-decisions/SKILL.md`。
- 如果是架构文档之间可能冲突，走 `.agent/skills/easysdd-architecture-check/SKILL.md`。
- 如果是 Platform API 边界问题，先做独立 code reality checkpoint，再用 `.agent/skills/easysdd-decisions/SKILL.md` 归档已拍板约束。

## Minimum reading set by stage

### For Batch 1ABC sequencing

必须读：

- `easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md`
- `easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md`
- `easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md`
- `easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md`

按需读：

- `refactor/docs/03-architecture/04-运行主状态与状态边界.md`
- `refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md`
- `refactor/docs/03-architecture/06-任务系统归口方式.md`
- `refactor/docs/03-architecture/07-SCOE 的架构位置.md`

### For cleanup implementation

必须读：

- 上一阶段 sequencing 文档。
- 对应 batch scope memo。
- 待改模块代码。
- 当前 repo 的 `AGENTS.md`。

还必须补：

- cleanup plan。
- regression protection plan 或明确验证路径。

### For Platform API boundary analysis

必须读：

- `src-electron/main/ipc/*Handlers.ts`
- `src-electron/preload/index.ts`
- `src-electron/preload/api/*`
- `src-electron/types/electron-api.d.ts`
- `src/api/common/*Api.ts`
- 使用这些 API 的 stores / composables。

必须回答：

- main / preload / renderer common API 三层分别承担什么。
- 哪些是必要隔离，哪些是重复包装。
- 是否存在 main 依赖 preload 的层次倒挂。
- 关闭 `contextIsolation` 的收益、风险和替代方案。
- 是否需要形成长期 decision 并同步 AGENTS.md。

### For feature design

必须读：

- post-step3 gating memo。
- 对应 cleanup completion / re-gate 文档。
- 相关 architecture docs。
- 若是方向不清功能，必须先读对应 brainstorm 文档。

禁止只读功能清单就进入 design。

### For future project-level quality / convention extraction

必须读：

- 当前项目真实代码结构。
- 当前项目已有 `AGENTS.md`。
- `refactor/docs/quality/*.md`
- `refactor/docs/conventions/*.md`
- 已完成的 cleanup / gating / architecture memos。

注意：

这些 quality / convention 文档的形式可参考，但规则内容不能直接套用其他项目。必须经过系统分析和讨论后，才能写入正式规范或 AGENTS.md。

## Relationship to project-level quality / conventions

本 guardrail 不是代码质量规范。

后续应单独开启“项目级设计实现规范体系提取”阶段，目标类似：

- `refactor/docs/quality/frontend.md`
- `refactor/docs/quality/backend.md`
- `refactor/docs/quality/discussion-feasibility.md`
- `refactor/docs/conventions/frontend.md`
- `refactor/docs/conventions/backend.md`
- `AGENTS.md` 中的读取时机和执行门禁

但该阶段必须经过：

1. 现有规范盘点。
2. 当前项目代码结构分析。
3. 当前架构边界分析。
4. 设计阶段质量规则讨论。
5. 实现阶段质量规则讨论。
6. AGENTS.md 触发时机讨论。
7. 试运行与修订。

在完成这些讨论前，不应把其他项目规范直接复制为本项目规则。

## Next recommended artifact

下一份建议文档：

`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md`

该文档应只做 1A 第一刀 cleanup plan，不写实现。

必须回答：

- 第一刀具体 scope。
- 需要保护哪些现有行为。
- 需要哪些回归保护或验证路径。
- 哪些改动属于越界。
- 何时停回 1D SCOE、result observation 或 Platform API boundary analysis。
