---
doc_type: explore
type: cleanup-sequencing
memo_type: Batch 1ABC cleanup sequencing and first-cut scope
status: current
date: 2026-04-24
summary: Mainline arbitration for Batch 1A/1B/1C cleanup scopes, deciding first-cut sequencing, dependency boundaries, protected current behavior, cleanup-plan readiness, and deferred design questions without entering implementation or spec design.
tags:
  - cleanup-first
  - batch-1abc
  - sequencing
  - first-cut-scope
  - execution-gating
---

# Batch 1ABC cleanup sequencing and first-cut scope

## Scope guard

Evidence:

- 当前 guardrail 明确本阶段只能推进 `Batch 1ABC sequencing and first-cut scope`，不应直接进入代码实现、feature design 或 spec 字段设计。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:51-63`
- Sequencing 文档必须回答第一刀从哪条事实链切、1A/1B/1C 的依赖顺序、哪些行为必须先保护、哪些判断仍不能拍板。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:75-85`
- cleanup plan 仍禁止设计中心任务字段、生命周期枚举、JSON 报告字段、北向协议和 SCOE 专题能力。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:87-110`
- 实现 cleanup 只有在已有 cleanup plan、验证路径、小范围、可回滚且不引入 feature behavior 时才允许进入。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:111-127`
- 本轮 strict conservative gate 下没有第一批真正 `design-now` 功能。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:275-286`

Sequencing decision:

- 本文只做 1A/1B/1C 主线仲裁和第一刀 cleanup scope 裁剪。
- 本文不写实现方案、不写 spec 字段、不设计生命周期枚举、不设计任务字段、不设计 JSON 报告字段。
- 本文不把 `receiveFramesStore`、`sendTasksStore`、`useUnifiedSender`、SCOE 特判、history/storage/files 工具层升格为正式架构。

## 1. 1A / 1B / 1C 是否存在冲突，主线如何仲裁

Evidence:

- 1A 的范围是 `receiveFramesStore` 与 `useSendTaskTriggerListener`，只回答接收输入事实、触发候选和接收副作用边界。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:18-31`
- 1A 已确认接收成功后当前会把命中帧、来源、更新项送入触发检查，再转发给 `sendTasksStore.handleFrameReceived`。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:142-166`
- 1A 同时确认 listener 会反读接收映射、读取本地任务状态、动态进入本地执行器并写任务状态，导致接收事实、接收配置、本地发送任务状态和执行动作串成隐式链。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:168-193`
- 1B 的范围是 send-task cluster，并明确现有发送任务对象不等于中心任务上下文，只是本地发送执行能力的任务对象。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:18-31`
- 1B 明确当前 `SendTask.status`、active task 视图、manager 统计、listener/timer 注册状态、页面监控入口都容易被误读为中心任务事实，但只能降为本地执行态、监控态、展示态或基础设施资源。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:55-75`
- 1C 的范围是 `useUnifiedSender` 与 `connectionTargetsStore`，目标是 common sender 只消费显式发送请求，返回标准发送执行结果，不承载任务、结果、SCOE 领域语义。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:18-30`
- 1C 已确认 `useUnifiedSender` 当前含 SCOE 固定目标记录副作用，且 common sender 不应负责任务生命周期、领域完成条件、领域记录、报告结果或 SCOE 固定目标语义。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:32-73`

Inference:

- 1A/1B/1C 没有方向性冲突：三者都在阻断“共享状态 / 本地执行态 / 通用发送落点”被误用为中心任务、结果或领域事实。
- 真实冲突风险在解释权重叠：1A 会碰到触发 listener，1B 会碰到 `waiting-trigger` 与 listener 注册状态，1C 会碰到 1B 发出的本地发送执行请求和 SCOE 发送副作用。
- 如果各批次独立收口而没有主线仲裁，容易出现三个局部边界都成立、但中间输入输出语义仍互相回读的情况。

Sequencing decision:

- 主线仲裁规则是：上游只产出明确边界输入，下游只消费边界输入并返回边界结果；任何一层都不回读另一层共享状态来补齐自己的主语义。
- 1A 拥有“接收事实与触发候选输入”的边界解释权，但不拥有任务生命周期解释权。
- 1B 拥有“本地发送执行对象降级与生命周期事实外溢阻断”的边界解释权，但不拥有接收输入字段终稿或发送执行结果终稿。
- 1C 拥有“通用发送执行与目标目录”的边界解释权，但不拥有任务完成、用例结果、报告交付或 SCOE 领域成功解释权。
- 发生交叉时按事实流向仲裁：1A 先切接收输入，1B 再切本地执行态，1C 最后切发送执行结果；SCOE 与结果边界只作为例外观察，不进入本轮设计。

Deferred:

- 触发候选是否成为独立正式对象、任务系统如何解释触发、未来任务状态机、SCOE 领域接入对象、结果 / 报告 / 交付对象，均不在本轮拍板。
- Electron Platform API boundary 不在 1ABC sequencing 内拍板。用户倾向关闭 Electron API 隔离 / 简化 `contextBridge` 相关层，但这只是 owner inclination；是否关闭 `contextIsolation`、是否删除 renderer common API wrapper、main/preload/renderer 三层如何归口，必须另起 Platform API boundary analysis。

## 2. 第一刀从哪条事实链切，为什么

Evidence:

- post-step3 已将 1A 定义为第一批 cleanup 入口，模块是 `receiveFramesStore` 与 `useSendTaskTriggerListener`。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:190-203`
- 1A 代码证据显示，串口 / 网络入站进入 `receiveFramesStore.handleReceivedData`，接收 store 同时处理队列、解析、统计、缓存、显示回填、表达式、星座图采集、帧统计和触发检查。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:47-65`
- 1A 已确认当前最窄接收输入事实只到入站来源、来源标识、原始载荷、处理顺序、解析成功 / 失败、命中帧和更新字段等现有运行输入级事实。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:84-108`
- 1B 要求只接收 1A 已归一后的触发候选输入或等价运行输入，不应要求回读 `groups / mappings / allReceiveFrameData`。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:296-310`
- 任务系统文档要求任务系统消费的是接收主链输出，不是接收 store 当前形态；这些输入不应回头读接收缓存、显示态或历史态补齐语义。`refactor/docs/03-architecture/06-任务系统归口方式.md:326-349`

Inference:

- 第一刀应切“接收输入事实 -> 触发候选 / 等价运行输入 -> send-task listener”的事实链，而不是先切 send-task 状态或 common sender。
- 原因是 1B 和 1C 都依赖上游输入已经可见：如果接收侧仍把显示缓存、映射回读和本地任务状态串在一起，1B 无法判断哪些是本地执行态，1C 也会继续接收夹带任务语义的隐式发送动作。

Sequencing decision:

- 第一刀 scope：只围绕 1A 直接链路裁剪，即 `receiveFramesStore` 当前接收输入事实、接收副作用边界、触发检查到 listener 的隐式事实链。
- 第一刀目标：让后续 cleanup plan 能明确保护“现有接收解析与触发可用性”，同时阻断 `groups / mappings / allReceiveFrameData / 页面显示态 / 统计记录态 / listener 状态` 被继续当作任务输入事实源。
- 第一刀不处理：send-task 生命周期改造、common sender 结构、SCOE 领域设计、结果事实设计、手工发送统一入口。

Deferred:

- 第一刀不决定触发候选最终命名、对象形态、字段集合、任务解释规则或 listener 最终归属。

## 3. 1A / 1B / 1C 的依赖顺序和并行边界

Evidence:

- 1A 输出给 1B 的应是接收边界输入，不夹带页面选中态、recent packet 视图、frame stats 视图、`groups` 当前值面板、表达式副作用、星座图采集结果或本地任务状态解释。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:195-220`
- 1B 向 1C 暴露的应只是本地发送执行载体可被翻译出的显式发送请求和上下文引用，不应交出完整 `SendTask`、当前 `TaskStatus`、timer/listener 资源状态或页面监控状态。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:311-323`
- 1C 要求 common sender 接受上游已归口后的显式发送请求，返回标准发送执行结果，而不是任务完成事实、用例结果事实、报告事实或 SCOE 领域记录。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:98-117`
- guardrail 要求 re-gate F03-F06 的条件包括：1A 不再依赖接收共享状态补语义，1B 不再外放为中心任务事实，1C 不再沉积生命周期、领域特判或结果事实。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:128-140`

Sequencing decision:

- 主依赖顺序：1A -> 1B -> 1C。
- 1A 必须先落出 cleanup plan，因为它决定后续任务系统或 send-task cluster 能消费什么输入。
- 1B 紧随 1A，因为它负责阻断本地 send-task 状态、listener/timer 资源、页面监控态向中心任务生命周期外溢。
- 1C 可以与 1B 做读证并行，但 cleanup plan 的执行顺序应晚于 1B 的边界裁剪，至少不能抢先把 1B 的本地执行态解释成发送请求或发送结果。
- 1C 的独立并行边界是 SCOE 固定 target 副作用和 `connectionTargetsStore` 目标目录 / 校验边界；只要不设计任务请求、结果对象或目标 schema，就可以在 1B 后半段并行准备。

Deferred:

- 并行只限文档观察、保护面梳理和停止条件梳理；实现级拆分、对象层级、字段命名、adapter 分层仍 deferred。

## 4. 第一刀 cleanup 前必须保护哪些现有行为

Evidence:

- 1A 当前串口 / 网络入站统一进入接收入口，接收入口存在处理锁和待处理队列。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:51-64`
- 1A 当前解析成功后会更新 groups 当前值、表达式、星座图采集、frame stats、触发检查；这些已被归类为显示 / 统计 / 缓存 / 表达式副作用，不是运行主事实。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:110-140`
- 1A 当前触发链以现有接收结果中的命中帧、来源和更新项进入 `checkTriggerConditions`，再转给 `sendTasksStore.handleFrameReceived`。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:142-166`
- 1B 当前 `completed` 会触发 remove task，stop 会清 timer/listener 后写 `completed`，pause/resume 仍是本地控制显示 / 中断提示状态。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:76-128`
- 1C 当前 common sender 已提供目标解析、serial/network 落地发送、底层回执归一和目标可用性查询。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:32-53`
- 04 文档明确页面工作台、发送任务监控视图、接收显示当前值、历史记录和综合展示状态不应再被视为运行骨架对象，但这些视图和记录本身仍可作为展示、记录或缓存存在。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:95-117`

Sequencing decision:

- 第一刀 cleanup plan 前必须保护以下现有行为：
  - 串口 / 网络入站仍能进入统一接收入口并保持处理顺序。
  - 当前解析成功 / 失败的基础行为、失败记录和最近包 / 统计更新不被破坏。
  - 接收成功后的页面当前值回填、表达式计算、星座图采集、frame stats 等既有展示 / 统计副作用保持可观察。
  - 现有触发任务路径保持可用，但只能作为被保护的现有行为，不升格为未来任务输入事实。
  - 现有本地发送任务的顺序 / 定时 / 条件触发 / 时间触发能力保持可用。
  - 现有 stop / pause / resume / completed 删除等本地语义保持兼容，但必须标注为禁止外放的现状行为。
  - common sender 的 serial/network 发送、目标校验、目标可用性查询和统一回执保持可用。
  - SCOE 现有固定目标记录副作用在第一刀内只作为观察和禁止升格项保护，不在 1A 里搬动或设计。

Deferred:

- 回归保护的具体命令、测试路径、手工操作路径和停止条件清单留给 cleanup plan；本文只给保护面。

## 5. 哪些判断已经足够进入 cleanup plan

Evidence:

- guardrail 的 Gate 2 要求已明确第一刀链路、不做哪些功能设计、回归保护面，以及遇到 SCOE 或 F09-F12 是否补观察。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:87-102`
- 1A 已足够确认 `receiveFramesStore` 与 trigger listener 混层，且接收链只应输出显式输入，不应解释任务生命周期。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:237-255`
- 1B 已足够确认 send-task cluster 应被收窄为本地发送执行 / 调度 / 监控簇，不是未来中心任务系统。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:351-362`
- 1C 已足够确认 `useUnifiedSender` 是通用发送执行边界，`connectionTargetsStore` 是通用连接目标目录与校验边界，任务生命周期、领域目标、SCOE 记录、结果事实和报告交付都不应沉积在 common sender。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:178-185`

Sequencing decision:

- 已足够进入 cleanup plan 的判断：
  - 第一刀只切 1A 的接收输入事实与触发候选边界。
  - cleanup plan 可以列出 1A 保护面、观察路径、停止条件和越界条件。
  - cleanup plan 可以明确 1B/1C 作为后续依赖批次，但不在第一刀写 1B/1C 实施方案。
  - cleanup plan 可以把 `SendTask.status`、listener/timer 注册、common sender SCOE 副作用、history/storage/files 结果错位列为禁止继承项。
  - cleanup plan 可以设定遇到 SCOE 或 F09-F12 时的停回观察规则。

Deferred:

- cleanup plan 仍不能包含具体实现改造步骤、对象结构、字段命名、生命周期枚举、报告 schema 或 feature design。

## 6. 哪些判断仍必须 deferred，不能进入 design

Deferred:

- 中心任务上下文、用例执行上下文、生命周期控制状态、结果归口状态的字段结构。
- 未来任务状态机是否包含某些正式状态、这些状态如何命名、如何与现有本地 `TaskStatus` 对应。
- 停止、自然完成、异常中止、结果落定、报告可交付之间的正式终态关系。
- 触发候选最终是否作为独立正式输出类型，以及现有接收更新值是否继续作为任务触发输入载体。
- 手工发送、触发发送、中心任务驱动发送是否统一入口。
- common sender 前是否拆出目标适配层，UDP remote host 当前中间格式是否保留，`bluetooth / other` 是否进入统一发送能力。
- SCOE 固定目标、固定来源、领域反馈、领域成功条件、测试工具记录的具体接入对象和对象分层。
- F09-F12 的结果事实、本地记录、报告素材、报告对象、对外交付边界。
- F01/F02 的 thin identity/envelope 是否可重新申请 design-now；当前严格 gate 下仍不进入 design。
- Electron main / preload / renderer common API 分层，包括 `contextIsolation` / `contextBridge` / `window.electron.*` / `src/api/common/*Api.ts` 是否保留、收薄或关闭隔离。

Evidence:

- 1A deferred 已列出触发候选正式类型、命名、载体、任务解释、listener 归属、SCOE 插队、表达式参与触发、订阅方式和手工发送统一入口均不拍板。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:222-235`
- 1B deferred 已列出中心任务 / 用例执行 / 生命周期 / 结果归口字段、未来状态机、pause/resume、终态关系、手工发送入口、局部重试 / 延时 / 超时、F09-F12、SCOE 接入均不拍板。`easysdd/compound/2026-04-24-batch-1b-send-task-lifecycle-cleanup-scope-memo.md:337-350`
- 1C deferred 已列出目标适配分层、UDP 目标表达、目标类型扩展、SCOE 固定目标来源、F13/F15、F17、手工发送入口、F09/F10 结果字段 / 汇总 / 报告 / 交付均不拍板。`easysdd/compound/2026-04-24-batch-1c-unified-sender-and-target-cleanup-scope-memo.md:156-177`

## 7. 是否需要先补 Batch 1D SCOE 或 result boundary observation

Evidence:

- post-step3 将 SCOE access 标为 conditional Batch 1D：若首批任务包含 SCOE，用 1D 插队；否则不抢 1A-1C。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:235-247`
- post-step3 将 result/local-record/report material 标为 observation only：`historyAnalysis`、`highSpeedStorageStore`、`filesAPI` 暂不搬动，只作为 F09-F12 边界证据。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:249-259`
- 07 明确 SCOE 是二级领域模块，不是通用接收主链、通用发送主链、任务系统或统一运行主状态本身。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:69-97`
- 07 还明确 SCOE 固定目标解析、领域成功条件、测试工具记录不应写进通用发送层。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:304-318`

Inference:

- 第一刀切 1A 时不需要先补完整 Batch 1D，因为第一刀目标不是清 SCOE，而是清接收输入事实和触发边界。
- 但 cleanup plan 必须带条件停线：如果第一刀触碰 `scoe-tcp-server` 短路、SCOE 固定 target、SCOE 记录回写或 SCOE 长流程调度，就必须补 1D observation / scope，不得把 SCOE 规则顺手塞进 1A/1B/1C。
- 第一刀也不需要先补 result boundary observation；但如果 cleanup 触碰 F09-F12、history/storage/files、报告文件或结果归口，就必须停回 result boundary observation，不得把本地记录直接升格为结果事实。

Sequencing decision:

- 不先补 1D 或 result boundary observation；先推进 1A cleanup plan。
- cleanup plan 必须写明两个条件插队：
  - 触碰 SCOE 领域入口、固定目标、领域记录或领域完成条件时，先补 Batch 1D SCOE observation / scope。
  - 触碰结果、报告、历史、文件交付时，先补 result boundary observation。

Deferred:

- 1D 的具体范围、SCOE 接入对象、result boundary observation 的模块清单和报告 / 交付边界，不在本文展开。
- Platform API boundary 的具体范围不在本文展开；除非 1A cleanup plan 必须改 `receiveAPI` / preload / IPC / `contextIsolation`，否则它不阻塞 1A。

## 8. 下一步 cleanup plan 应该包含什么，但不要写实现方案

Sequencing decision:

下一步 cleanup plan 应只包含以下内容：

1. 第一刀 scope：
   - 只覆盖 1A 的接收输入事实、接收副作用边界、触发检查到 listener 的隐式事实链。
   - 明确 1B/1C 仅作为依赖背景和禁止外放项，不在第一刀实施。

2. 回归保护面：
   - 串口 / 网络入站处理顺序。
   - 解析成功 / 失败与统计 / 最近包可观察行为。
   - 页面当前值回填、表达式、星座图、frame stats 等展示 / 统计副作用。
   - 现有触发任务可用路径。
   - 本地发送任务能力、common sender serial/network 发送和目标可用性。

3. 观察路径：
   - 接收入口到触发转发的现有链路。
   - listener 对接收映射、本地任务状态和 executor 的回读 / 写入点。
   - 1B/1C 禁止外放点是否被第一刀意外触碰。
   - SCOE 与 result boundary 的条件插队触发点。

4. 停止条件：
   - 开始设计字段名、对象 schema、生命周期枚举、JSON 报告字段或北向协议。
   - 开始把 `SendTask.status` 外放为中心任务状态。
   - 开始把接收共享状态当作任务输入事实。
   - 开始让 common sender 解释任务完成、用例结果、报告交付或 SCOE 成功。
   - 开始移动 history/storage/files 或设计结果 / 报告对象。
   - 开始修改 `contextIsolation` / `contextBridge` / `window.electron.*` / `src/api/common/*Api.ts` 等 Platform API 边界。

5. 越界清单：
   - 任何 feature behavior 引入。
   - 任何 SCOE 专题能力设计。
   - 任何 F03-F06 / F09-F12 feature design。
   - 任何把当前 hotspot 模块命名为正式目标架构的表述。

6. 下一步交付物：
   - 一份 1A first-cut cleanup plan。
   - 一份 regression protection plan 或明确验证路径。
   - 必要时补 1D SCOE observation / scope 或 result boundary observation。
   - 如果 1A plan 发现必须触碰 `receiveAPI` wrapper、preload API、IPC handler 或 Electron 隔离设置，先补 Platform API boundary analysis。

Deferred:

- cleanup plan 之后才允许进入实现 cleanup；实现 cleanup 之后才允许重新评估 F03-F06。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:111-140`
- Platform API cleanup 不并入 1A 第一刀；用户倾向关闭隔离应作为后续讨论输入，不作为当前 sequencing decision。
