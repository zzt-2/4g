---
doc_type: explore
type: implementation-preflight
memo_type: Batch 1A implementation preflight and first patch selection
status: current
date: 2026-04-24
summary: Implementation-entry preflight for Batch 1A, selecting exactly one smallest behavior-preserving first cleanup patch and rejecting overlarge or out-of-bound candidates before code implementation.
tags:
  - cleanup-first
  - batch-1a
  - implementation-preflight
  - first-patch-selection
  - receive-chain
confidence: high
---

# Batch 1A implementation preflight and first patch selection

## 1. Context recap

Quick answer:

- 本轮 preflight 结论是：可以为下一轮 implementation cleanup 选择一个第一刀 patch，但只能选一个最小、可回滚、行为不变的 1A 内部边界清理。
- 推荐第一刀是：只在 `src/stores/frames/receiveFramesStore.ts` 的接收入口串行化边界附近做 one-file cleanup，保护 `handleReceivedData` 的 public signature、processing lock、pending queue、FIFO drain、`processDataInternal` 调用顺序和 `finally` 释放锁语义。
- 本轮不推荐先动 trigger 转发、listener 条件匹配、配置 / 映射清理、SCOE、send-task lifecycle、common sender、result/report 或 Platform API。

Evidence:

- Batch 1A 第一刀链路已被限定为 `serial/network -> receiveFramesStore.handleReceivedData -> receiveAPI.handleReceivedData -> checkTriggerConditions -> sendTasksStore.handleFrameReceived -> useSendTaskTriggerListener`。`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:36-43`
- implementation cleanup 的 Gate 3 要求已有 cleanup plan、明确验证路径、小范围可回滚且不引入 feature behavior。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:138-153`
- 1A plan 已把第一刀排序写成：先保护入站可达性和处理顺序，再保护解析成功 / 失败与副作用，再标清触发转发链混合事实点。`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:78-89`
- 当前接收入口的锁和队列集中在 `handleReceivedData`，正在处理时入队，之后 FIFO `shift()` 并逐个 `await processDataInternal`，最后释放锁。`src/stores/frames/receiveFramesStore.ts:852-891`
- 串口和网络入站分别以 `serial + portPath`、`network + connectionId` 调用同一个接收入口。`src/stores/serialStore.ts:391-417`, `src/stores/netWorkStore.ts:200-218`

Inference:

- 最安全的第一刀不是“最有架构收益”的 trigger 边界切分，而是先把接收入口串行化行为守住并让下一步变更有稳定回归基准。
- 触发转发链仍是 1A 的核心混合点，但从风险 memo 看，它紧贴 listener、任务状态、映射回读和 executor，作为第一刀更容易滑入 1B。

## 2. Implementation-entry gate check

Gate result:

- Conditional pass: 允许下一轮进入 implementation cleanup，但只允许围绕 recommended first patch 做一刀。
- Fail closed: 一旦 patch 需要新增正式字段、对象、DTO、schema、生命周期枚举，或需要修改 Platform API / SCOE / result / send-task lifecycle，即视为未通过本 gate。

Hard constraints:

- 第一刀只属于 1A 直接链路，不扩大到 1B / 1C / SCOE / result / Platform API。`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:290-314`
- 不设计 trigger candidate 最终对象、正式类型、命名、字段集合或任务解释规则。`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:212-224`
- 不把当前热点模块、共享状态或本地发送任务状态升格为未来正式架构事实。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:17-25`
- Platform API boundary 包括 `src/api/common/*Api.ts`、preload、IPC、`window.electron.*`、`contextIsolation` / `contextBridge`；没有 dedicated analysis / decision 前不得塞进 1A cleanup。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:68-90`

Protected behavior:

- 串口入站仍按端口过滤，并在记录串口接收消息后进入统一接收入口。`src/stores/serialStore.ts:391-417`
- 网络入站仍按连接 ID 进入接收链，并更新 `lastActivity`。`src/stores/netWorkStore.ts:207-218`
- 同一接收入口内仍保持串行处理，快速连续入站不应乱序，异常后不得永久卡住队列。`src/stores/frames/receiveFramesStore.ts:857-891`
- `source/sourceId/data` 三元组和后续 `source + ':' + sourceId` 的现状匹配口径保持可观察。`src/stores/frames/receiveFramesStore.ts:852-856`, `src/stores/frames/receiveFramesStore.ts:1127-1138`

Sub-agent memos used:

- `analyst`: 约束 memo 强调 Gate 3、小范围可回滚、禁止 1B/1C/SCOE/result/Platform API、保护入站 / 队列 / 成功失败 / 触发现状行为。
- `debugger`: 风险 memo 把配置保存同步链、接收入口到触发执行链、任务状态删除链列为高风险；明确不适合先做配置 / 映射 cleanup、状态生命周期 cleanup、listener 匹配简化。
- `test-engineer`: 验证 memo 判断“入站可达性与处理顺序保护”验证成本最低、越界风险最低。
- `critic`: 反越界 memo 拒绝正式对象 / DTO / schema、固化当前混合实现细节、listener 映射清理、任务状态语义、SCOE、Platform API、大拆 `processDataInternal`。

## 3. Candidate first patches

### Candidate A: Receive-entry serialization boundary

Touched files:

- `src/stores/frames/receiveFramesStore.ts`

Target:

- 只围绕 `handleReceivedData` 的接收入口串行化边界做 behavior-preserving cleanup。
- 目标是让“入站接收请求如何排队、何时进入 `processDataInternal`、何时 resolve/reject、何时释放 lock”这个现状边界更清楚。
- 不碰 `processDataInternal` 内的解析、SCOE 早退、成功 / 失败分支、显示 / 统计 / 缓存副作用、触发转发。

Why behavior-preserving:

- public signature 保持 `source: 'serial' | 'network'`、`sourceId: string`、`data: Uint8Array`。`src/stores/frames/receiveFramesStore.ts:852-856`
- 串口 / 网络调用点不需要改，仍调用同一个接收入口。`src/stores/serialStore.ts:416`, `src/stores/netWorkStore.ts:212`
- FIFO queue、逐个 `await processDataInternal`、单个 queued request 的 resolve/reject、最终释放锁的现状语义必须逐字保护。`src/stores/frames/receiveFramesStore.ts:857-891`

Risk:

- 改错队列 drain 顺序会让连续入站乱序。
- 改错 promise resolve/reject 会让调用方等待状态漂移。
- 如果下一轮尝试给串口 / 网络调用点补 `await`，会改变目前 fire-and-forget 的时序，应停线。
- 如果 patch 触碰 `processDataInternal`，会立刻进入解析、SCOE、显示副作用和触发转发的更大回归面。

Verification:

- `pnpm lint`
- `pnpm test`，但当前脚本只是 `echo "No test specified" && exit 0`，只能记录“无实际测试套件”。`package.json:8-15`
- 若 patch 发生 identifier / import / type 可见面变化，补 `pnpm build`。
- 手工路径：串口连续注入 2-3 包，网络连续注入 2-3 包，观察接收记录、统计、当前值或触发日志没有乱序、卡死或丢包。

Stop conditions:

- 需要修改 `src/stores/serialStore.ts` 或 `src/stores/netWorkStore.ts` 调用方式。
- 需要修改 `processDataInternal` 分支内容。
- 需要解释或改动 `scoe-tcp-server` 早退。
- 需要新增正式接收对象、字段、DTO、schema。

Patch rank:

- 1. Recommended first patch.

### Candidate B: Trigger-forwarding adapter boundary

Touched files:

- `src/stores/frames/receiveFramesStore.ts`

Target:

- 只标清 `checkTriggerConditions` 当前是接收更新到 send-task trigger listener 的转发适配点，而不是未来正式触发候选对象。
- 适用区域是接收成功后调用触发检查，以及内部把本次更新补成 listener 当前可消费形态后调用 `sendTasksStore.handleFrameReceived`。`src/stores/frames/receiveFramesStore.ts:1127-1138`, `src/stores/frames/receiveFramesStore.ts:1186-1227`

Why behavior-preserving:

- `source + ':' + sourceId` 的现状来源匹配字符串不变。`src/stores/frames/receiveFramesStore.ts:1129-1138`
- `sendTasksStore.handleFrameReceived(frameId, sourceId, dataItems)` 的调用不变。`src/stores/frames/receiveFramesStore.ts:1227`
- `sendTasksStore` 仍只是转发给 trigger listener。`src/stores/frames/sendTasksStore.ts:553-562`

Risk:

- 这里紧贴 listener 对帧、来源、任务状态和条件的匹配逻辑。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-92`
- listener 条件字段还会反读接收映射。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-184`
- 一旦开始改变匹配口径或条件字段解析，就会进入 1B 或字段设计。

Verification:

- `pnpm lint`
- `pnpm test` 仅作无实际测试套件记录。
- 手工路径：现有触发任务覆盖匹配帧 / 来源、空条件、字段缺失、未知操作符、非 `waiting-trigger` 现状兼容行为。

Stop conditions:

- 开始定义 trigger candidate 正式对象、字段、DTO、schema。
- 开始固化当前 listener 输入形态为未来任务输入事实。
- 开始解释本地任务状态、listener 注册状态或 executor 归属。

Patch rank:

- 2. Useful later, but not first.

### Candidate C: Parse-success/failure side-effect boundary

Touched files:

- `src/stores/frames/receiveFramesStore.ts`

Target:

- 标清 `processDataInternal` 中解析失败、解析成功、recent packets、统计、缓存、当前值回填、表达式、星座图、frame stats 的现状副作用边界。

Why behavior-preserving:

- API 不可用 / 解析失败仍返回失败结果并走 unmatched / parse error / recent packet / warning 现状路径。`src/api/common/receiveApi.ts:21-48`, `src/stores/frames/receiveFramesStore.ts:1027-1045`
- 解析成功仍按原顺序更新 matched、recent packet、cache、当前值、表达式、星座图、frame stats，再触发检查。`src/stores/frames/receiveFramesStore.ts:1050-1138`

Risk:

- 该区间一次覆盖太多可观察副作用，现有自动测试不足。
- 顺序变化会影响表达式、星座图、统计、触发转发的观察结果。
- 大拆 `processDataInternal` 会让 patch 不再是“第一刀最小可回滚”。

Verification:

- `pnpm lint`
- `pnpm test` 仅作无实际测试套件记录。
- 建议补 `pnpm build`，因为该候选更容易牵动类型和导入边界。
- 手工路径：解析失败、解析成功、表达式字段、星座图 bytes 字段、清理统计。

Stop conditions:

- 开始把显示 / 统计 / 缓存 / 表达式副作用解释成任务运行事实源。
- 需要改 SCOE completion / link-check、result/report、history/storage/files。
- 需要设计表达式参与触发的未来归属。

Patch rank:

- 3. Defer until Candidate A creates safer baseline.

## 4. Rejected candidates

Rejected: formal trigger/input object, DTO, schema, lifecycle enum.

- Reason: 这会直接进入字段 / 对象设计，违反 Gate 3 和 1A deferred。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:130-153`, `easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:222-235`

Rejected:固化当前 `DataItem[]`、`groups`、`mappings`、`allReceiveFrameData`、`waiting-trigger` 为未来正式事实。

- Reason: 它们只能作为当前混合实现细节、现状兼容行为或停线观察点记录，不能写成未来任务输入、运行事实或生命周期事实。`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:90-93`, `easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:316-326`

Rejected: listener mapping cleanup / field matching simplification.

- Reason: listener 当前按 `fieldId` 找映射再查数据项，是高风险现状行为；第一刀修改会静默改变触发匹配。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-184`

Rejected: send-task status / listener lifecycle cleanup.

- Reason: `TaskStatus`、`waiting-trigger`、完成删除、timer/listener 收口属于 1B lifecycle。`src/stores/frames/sendTasksStore.ts:23-30`, `src/stores/frames/sendTasksStore.ts:401-476`

Rejected: Platform API cleanup.

- Reason: `src/api/common/receiveApi.ts` 是 Platform API boundary 的一部分，当前还保护 Electron API 不可用时返回失败的现状行为。`src/api/common/receiveApi.ts:21-48`, `easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:68-90`

Rejected: SCOE early-return or SCOE completion/link-check changes.

- Reason: `sourceId === 'scoe-tcp-server'` 早退只保护、不解释、不设计；触碰就停回 Batch 1D。`src/stores/frames/receiveFramesStore.ts:1015-1021`, `easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:171-182`

Rejected: big split of `processDataInternal`.

- Reason: 它横跨全局统计、SCOE、API 解析、失败处理、cache、当前值、表达式、星座图、frame stats、触发转发，不满足第一刀最小可回滚。`src/stores/frames/receiveFramesStore.ts:1005-1139`

Rejected: receive config / mapping cleanup.

- Reason: 配置 watch 会自动保存并同步主进程缓存，`loadConfig` / `importConfig` 也会同步缓存；映射清理可能穿透持久化与解析缓存。`src/stores/frames/receiveFramesStore.ts:234-267`, `src/stores/frames/receiveFramesStore.ts:343-430`

## 5. Recommended first patch

Recommended:

- Candidate A: `receiveFramesStore` receive-entry serialization boundary.

Patch boundary:

- One file only: `src/stores/frames/receiveFramesStore.ts`.
- Only around `handleReceivedData` / `processingLock` / `pendingProcessQueue` / queued request drain.
- No public API change.
- No caller change.
- No parse-result branch change.
- No trigger-forwarding change.
- No Platform API / SCOE / send-task lifecycle / result/report change.

Selection rationale:

- 它正好对应 1A plan 的第一排序：先保护入站可达性和处理顺序。`easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:84-89`
- 它是 1A 内部最小 one-file patch，可通过静态检查和手工连续入站路径观察行为是否保持。
- 它避开了 debugger memo 中的最高风险区域：配置保存同步、listener 字段匹配、任务状态删除、executor、common sender、SCOE completion。
- 它不会把当前混合实现细节写成未来正式事实。

Non-selection rationale for trigger-forwarding first:

- trigger-forwarding 确实更接近 1A 的核心混合点，但当前它紧贴 listener 反读映射、读取本地任务状态和动态进入 executor。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-92`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-184`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`
- 第一刀先碰这里，容易把“边界清理”滑成字段设计或 1B lifecycle 解释。

## 6. Required verification after patch

Command checks:

- `pnpm lint`
- `pnpm test`，记录为“当前无实际测试套件”，不得作为回归充分证据。`package.json:8-15`
- `pnpm build`：如果 patch 发生 identifier、import、type 可见面或构建面变化，必须补跑。

Manual minimum for recommended patch:

- 串口入站：连接串口或使用现有串口数据入口连续注入 2-3 包，确认仍按端口过滤、仍记录串口接收消息、仍进入统一接收入口。`src/stores/serialStore.ts:391-417`
- 网络入站：通过网络连接连续注入 2-3 包，确认仍按连接 ID 进入接收链，并更新 `lastActivity`。`src/stores/netWorkStore.ts:207-218`
- 处理顺序：快速连续入站后，观察 recent packet、统计、当前值或触发日志没有乱序、卡死或后续包永久不处理。`src/stores/frames/receiveFramesStore.ts:857-891`

Conditional manual expansion:

- 如果 patch 触碰 `processDataInternal` 任意分支，必须补解析成功 / 失败、表达式、星座图、frame stats、清理统计路径。
- 如果 patch 触碰触发转发链，必须补匹配帧 / 来源、空条件、字段缺失、未知操作符、非触发等待状态、一次性触发后的 listener 注销路径。
- 如果 patch 触碰 SCOE 或 Platform API，直接停止，不进入验证后补救。

Observable pass criteria:

- 入站仍可达。
- 连续入站仍按现状顺序处理。
- 异常不会让锁永久保持。
- 无新增 feature behavior。
- 无字段 / DTO / schema / lifecycle enum 设计。

## 7. Stop conditions

Implementation cleanup must stop if any of these appears:

- 需要修改 `src/api/common/receiveApi.ts`、preload、IPC、`window.electron.*`、`contextIsolation` / `contextBridge`。
- 需要改 `source + ':' + sourceId` 的现状匹配口径。
- 需要改 `processDataInternal` 中 SCOE 早退、解析结果处理、表达式、星座图、frame stats 或触发转发。
- 需要新增正式字段、对象、DTO、schema、lifecycle enum。
- 需要把当前共享状态或本地任务状态解释成未来正式事实。
- 需要解释 send-task lifecycle、`waiting-trigger`、listener/timer 注册状态、stop/pause/resume/completed 的未来语义。
- 需要触碰 SCOE completion/link-check、result/report/history/storage/files。
- `pnpm lint` 或必要的 `pnpm build` 失败，且修复需要扩大到 recommended patch 以外。

## 8. Handoff prompt for implementation cleanup

```text
本轮进入 Batch 1A implementation cleanup，只做一个最小 patch。

目标：在 src/stores/frames/receiveFramesStore.ts 内，围绕 handleReceivedData / processingLock / pendingProcessQueue / queued request drain 做 behavior-preserving cleanup，标清接收入口串行化边界。

硬边界：
- 不改 public signature。
- 不改 src/stores/serialStore.ts 或 src/stores/netWorkStore.ts 调用方式。
- 不改 processDataInternal 内部解析、SCOE、成功/失败、副作用或触发转发分支。
- 不改 src/api/common/receiveApi.ts、preload、IPC、window.electron.*、contextIsolation/contextBridge。
- 不进入 send-task lifecycle、common sender、SCOE、result/report。
- 不新增正式字段、DTO、schema、对象类型或 lifecycle enum。
- 不把当前混合实现细节写成未来正式事实；相关内容只能作为当前实现细节、现状兼容行为或停线观察点。

行为保护：
- FIFO 处理顺序保持。
- queued request 的 resolve/reject 语义保持。
- processDataInternal 调用顺序保持。
- finally 释放 lock 的现状语义保持。
- 串口 / 网络 fire-and-forget 入站时序保持。

验证：
- pnpm lint
- pnpm test，并记录当前无实际测试套件
- 如有 identifier/import/type 可见面变化，补 pnpm build
- 手工验证串口连续入站、网络连续入站、处理顺序和异常后不永久卡锁

如果实现过程中必须扩大到 trigger 转发、listener 条件匹配、SCOE、receiveAPI wrapper、任务状态或正式字段设计，停止并回到 preflight / scope 仲裁，不顺手处理。
```
