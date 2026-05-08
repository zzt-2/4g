---
doc_type: explore
type: cleanup-scope-memo
memo_type: Batch 1C unified-sender-and-target cleanup scope memo
status: current
date: 2026-04-24
summary: Scope memo for Batch 1C send boundary, covering common sender responsibilities, domain/SCOE intrusion, connection target responsibility, downstream ownership, and deferred target-adapter details without entering implementation or spec design.
tags:
  - cleanup-first
  - batch-1c
  - send-boundary
  - unified-sender
  - connection-targets
---

# Batch 1C unified-sender-and-target cleanup scope memo

## Scope guard

Evidence:

- Batch 1C 的模块范围已被限定为 `src/composables/frames/sendFrame/useUnifiedSender.ts` 与 `src/stores/connectionTargetsStore.ts`。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:222-231`
- Batch 1C 的 gate decision 是：不能让 SCOE / 任务 / 结果特判反侵通用发送。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:233`
- 后续 action 明确要求写 send boundary cleanup memo，回答 common sender 只接受什么显式 request、返回什么通用 result，以及领域目标、记录、反馈副作用如何下沉。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:321-327`

Scope decision:

- 本 memo 只收窄 Batch 1C 的责任边界。
- 本 memo 不写实现方案，不定义 spec 字段，不设计发送请求字段，不把 SCOE 固定目标写成通用发送规则。
- 本 memo 对 F04 / F09 / F10 只说明 Batch 1C cleanup 应提供的边界前提，不替这些 feature 做 design。

## 1. 当前 `useUnifiedSender` 中哪些是通用发送职责

Evidence:

- `useUnifiedSender.ts` 文件头部定义其当前角色为“统一发送路由器”，根据连接目标类型路由到相应发送方法。`src/composables/frames/sendFrame/useUnifiedSender.ts:1-4`
- `parseTargetId` 当前只把目标解析为 `serial` / `network` 两类，不支持其他类型时报错。`src/composables/frames/sendFrame/useUnifiedSender.ts:31-50`
- `sendFrameInstance` 当前先处理发送帧实例，再转换成 buffer，并按目标类型进入串口或网络发送。`src/composables/frames/sendFrame/useUnifiedSender.ts:69-107`
- 串口落地通过 `serialAPI.sendData`，并将底层返回归一成统一发送结果。`src/composables/frames/sendFrame/useUnifiedSender.ts:187-219`
- 网络落地通过 `networkAPI.send`，并将底层返回归一成统一发送结果。`src/composables/frames/sendFrame/useUnifiedSender.ts:228-260`
- 可用性查询当前委托 `connectionTargetsStore.isTargetAvailable`。`src/composables/frames/sendFrame/useUnifiedSender.ts:267-270`
- 发送主链文档把目标落地层的通用差异限定为串口 / 网络路由差异、通用错误归一、通用回执归一。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:253-265`

Inference:

- 当前 `useUnifiedSender` 已经是“逻辑目标 -> 目标解析 -> serial/network 落地发送 -> 通用回执归一”的通用发送落点雏形。这个判断也被 current-code-map 文档直接采信。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:237-247`
- 当前表达式计算、factor 处理和 `frameToBuffer` 更接近“帧实例载荷准备 / 通用帧发送前处理”，不是 SCOE 领域规则；但它们是否长期留在 common sender 内，不在本 memo 中做实现分层结论。`src/composables/frames/sendFrame/useUnifiedSender.ts:74-100`

Scope decision:

- Batch 1C 中可被认定为通用发送职责的，是承接已经明确的发送意图、解析通用连接目标、执行串口 / 网络发送、归一底层发送回执、返回标准发送执行结果。
- Common sender 不应负责解释任务生命周期、领域完成条件、领域记录、报告结果、SCOE 固定目标语义。

## 2. 哪些是领域特判、领域记录、领域反馈或 SCOE 反侵

Evidence:

- `useUnifiedSender` 直接引入并实例化 `scoeStore`。`src/composables/frames/sendFrame/useUnifiedSender.ts:13`, `src/composables/frames/sendFrame/useUnifiedSender.ts:61`
- 发送成功后，若 `targetId === 'network:scoe-udp:scoe-udp-remote'`，当前代码会把发送字节转为十六进制字符串并写入 `scoeStore.addSendData`。`src/composables/frames/sendFrame/useUnifiedSender.ts:146-160`
- 网络发送分支当前通过 `connectionTargetsStore.getValidatedTargetPath` 拿到路径，再用字符串中冒号数量区分 UDP 远程主机目标和 TCP 主连接目标。`src/composables/frames/sendFrame/useUnifiedSender.ts:108-136`
- 文档已明确：统一发送层只能承接通用目标差异，领域固定目标、领域记录回写、领域反馈帧、领域任务复用都应移出通用发送主链。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:444-447`
- SCOE 文档明确指出：当前统一发送链内部已经存在 `network:scoe-udp:scoe-udp-remote` 的领域特例处理，这是 SCOE 反向侵入通用发送链的证据。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:263-267`

Inference:

- 固定 SCOE target id 判断与 `scoeStore.addSendData` 是 Batch 1C 中最明确的 SCOE 反侵点：它把“标准发送结果”变成了带 SCOE 领域记录副作用的混合结果。
- UDP 远程主机字符串拆分是目标适配细节，不等同于 SCOE 领域规则；但它现在沉在 common sender 的网络分支里，容易让目标适配格式变成发送主链语义。
- 当前文件没有直接看到“领域反馈帧拼装”的代码证据；领域反馈属于文档明示的禁止沉积项，而不是本文件中已观察到的具体实现。

Scope decision:

- SCOE 固定目标、SCOE 发送记录、SCOE 成功反馈语义、SCOE 领域完成条件，都不能留在 common sender。
- 网络目标适配可以作为通用连接目标能力的一部分被保留在目标边界附近，但不应把具体字符串格式解释扩散成发送主链规则。

## 3. `connectionTargetsStore` 当前适合承担什么，不适合承担什么

Evidence:

- `connectionTargetsStore` 注释定义为统一管理所有类型连接目标，避免重复创建和频繁刷新。`src/stores/connectionTargetsStore.ts:8-11`
- 它聚合 `serialStore` 与 `networkStore`，维护 `availableTargets` 与 `isLoading`。`src/stores/connectionTargetsStore.ts:13-20`
- 它提供按类型和连接状态分组的目标视图。`src/stores/connectionTargetsStore.ts:21-32`
- `refreshTargets` 从串口可用端口、TCP、TCP Server、UDP remote hosts 构建统一目标列表。`src/stores/connectionTargetsStore.ts:35-133`
- `getValidatedTargetPath` 当前用于把逻辑 target id 转换为串口 path、TCP connectionId，或 UDP 的 connectionId + address。`src/stores/connectionTargetsStore.ts:166-197`
- `isTargetAvailable` 当前只基于目标状态是否为 connected 判断。`src/stores/connectionTargetsStore.ts:208-216`
- Batch 1C gate 明确指出：目标解析是通用发送边界，不应承载领域目标规则。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:228-231`

Inference:

- `connectionTargetsStore` 当前适合承担“连接目标目录”和“通用目标校验 / 解析服务”：它把 serial/network 的连接状态投影成统一目标候选，并为发送层提供可校验的目标引用。
- 它不适合承担领域固定目标的定义权，例如 SCOE 固定 UDP 目标不应通过这里变成通用发送规则。
- 它也不适合承担 F15 设备列表事实、F13 交付目标、任务生命周期许可、结果归口判断；这些都超出连接目标目录的证据范围。

Scope decision:

- Batch 1C 后，`connectionTargetsStore` 的边界应保持在通用连接目标的枚举、分组、状态投影、目标引用校验、通用路径解析。
- 它不应决定“某个领域动作是否允许发送”、不应产出任务事实、不应产出设备事实、不应把领域目标别名固化成 common sender 规则。

## 4. 通用发送边界应该接受什么显式 request，返回什么标准 result

Evidence:

- 发送主链文档明确：无论来源是中心任务上下文、用例执行上下文、手工工作台动作还是领域模块调用，都必须先变成统一的显式发送请求，才能进入发送主链。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:207-229`
- 通用编排 / 归一层只做真正通用的判断，包括上下文引用、生命周期允许性、目标可解析性、载荷可消费性、发送顺序 / 批次 / 局部重试 / 局部失败结果归一。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:231-245`
- 发送主链正式输出应是标准发送执行结果、统一运行主状态可消费的结果输入、结果归口状态可消费的结果输入，或领域模块可继续处理的发送结果。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:273-286`
- 任务系统文档明确：任务系统向发送主链发出显式发送请求和上下文引用；发送主链返回标准化执行结果和可归口的结果输入。`refactor/docs/03-architecture/06-任务系统归口方式.md:97-103`
- SCOE 文档明确：SCOE 输出显式发送请求给发送主链；发送主链回给 SCOE 的是标准发送执行结果，以及拒绝、失败、取消等标准结果口径。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:319-330`

Inference:

- “显式 request”在 Batch 1C 中应被理解为一种边界约束，而不是字段设计：进入 common sender 前，发送原因、调用来源、上下文归属、目标引用、载荷来源或实例引用，必须已经由上游归口层解释清楚。
- “标准 result”也应被理解为发送执行事实的标准口径，而不是结果上报对象：common sender 只能说明发送执行是否被接受、是否完成、是否失败、是否被拒绝或取消，以及底层发送回执如何归一。

Scope decision:

- Common sender 接受的不是“让发送器自己回读共享状态再猜语义”的隐式调用，而是上游已经归口后的显式发送请求。
- Common sender 返回的不是任务完成事实、用例结果事实、报告事实或 SCOE 领域记录，而是标准发送执行结果，以及可由任务系统、结果归口或领域模块继续消费的结果输入。

## 5. 哪些东西必须下沉到任务系统、SCOE 或结果归口

Evidence:

- 任务系统不是页面工作台、发送主链、接收主链或某个领域模块；它是消费显式输入、推进运行事实、再输出显式请求的编排归口层。`refactor/docs/03-architecture/06-任务系统归口方式.md:74-103`
- 任务系统正式负责推进中心任务上下文、用例执行上下文、生命周期控制状态、调度、等待、停止、完成和清理。`refactor/docs/03-architecture/06-任务系统归口方式.md:126-206`
- 结果归口状态不是历史记录，也不是报告页面；任务系统推进结果事实，但报告生成、结果展示、历史沉淀和对外报告交付不应混入任务系统内部。`refactor/docs/03-architecture/06-任务系统归口方式.md:208-213`
- SCOE 是二级领域模块，通过显式领域入口、显式发送请求、显式任务接入与统一运行骨架发生关系；它不拥有总骨架定义权。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:87-97`
- SCOE 固定目标解析应在 SCOE 领域边界内完成，再把结果作为明确目标引用送入发送主链；测试工具记录应由 SCOE 领域记录层消费标准发送结果，不应写进通用发送层。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:313-318`
- 结果 / 报告 / 交付边界尚未成形，当前代码只有本地历史、高速存储、SCOE 状态与记录、本地文件能力。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:146`

Scope decision:

- 必须下沉到任务系统：启动、停止、等待、调度、生命周期推进、任务级 / 用例级完成判断、是否继续下一步、何时清理局部执行对象。
- 必须下沉到 SCOE：固定目标、固定来源、领域加载态、领域确认态、领域成功条件、领域反馈语义、测试工具记录、SCOE 领域视图。
- 必须下沉到结果归口或后续结果边界：用例结果事实、任务汇总事实、报告素材、报告对象、对外交付回执、历史记录与运行事实之间的分层。
- Common sender 只能产出这些下游可消费的发送执行结果，不能替下游完成解释。

## 6. 1C cleanup 后应该如何服务 F04 / F09 / F10，但不替它们做 design

Evidence:

- F04 被归为 `Task orchestration + send chain`，其证据是任务系统负责启动、触发、调度，发送链只执行明确请求。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:121-122`
- F09 是用例级结果上报，F10 是任务级结果汇总；二者均依赖结果事实、任务生命周期和交付边界清理。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:127-130`
- F09 / F10 / F11 / F12 已被 gate 为 cleanup-first，而不是当前直接 design。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:49-55`
- 1A-1C scope 收口后才重新评估 F03-F06；F09-F12 必须等 result fact / local record / report material 三层分清后再进入 design。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:321-329`

Inference:

- 对 F04，Batch 1C 的价值是让任务系统未来能够向发送链发出清楚的发送执行请求，并拿到标准发送执行结果；它不负责设计“任务如何启动”。
- 对 F09，Batch 1C 的价值是避免把发送成功、发送统计、SCOE 发送记录误当成用例结果事实；它不负责设计“用例结果如何上报”。
- 对 F10，Batch 1C 的价值是避免把本地发送批次统计或历史记录误当成任务级汇总事实；它不负责设计“任务汇总如何形成或交付”。

Scope decision:

- Batch 1C cleanup 的交付边界是让 common sender 更像稳定的发送执行边界，而不是让它提前承载 F04 / F09 / F10 的业务对象。
- F04 / F09 / F10 后续可以消费 Batch 1C 收窄后的边界，但不能反过来把自己的生命周期、结果、报告或交付语义塞回 common sender。

## 7. 哪些目标适配细节必须 deferred

Evidence:

- 发送主链文档明确待决：发送主链是否需要再细分“通用目标适配”和“统一发送执行”两个层次，当前不细拆实现级分层。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:329-332`
- 手工发送是否必须全部汇入任务系统仍然 deferred。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:201-205`
- 结果归口是否进一步拆成“归集 / 交付”两层仍然 deferred。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:201-204`
- post-step3 明确将 F15 最小设备信息 / 设备列表投影列为 brainstorm-first，目标和字段粒度未定。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:268-273`
- post-step3 明确将 F17 独立参数 / 过程平台主体 defer；只有任务携带参数 / 触发输入子切片归入 F03 / F04 cleanup-first。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:299-315`
- SCOE 周期性主动发送动作究竟直接进入发送主链，还是先进入任务系统调度，仍待后续结合用例语义收紧。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:338-341`

Deferred:

- `connectionTargetsStore` 与 common sender 是否拆成“目标适配层 / 发送执行层”的实现结构。
- UDP remote host 目标的最终表达形式，以及当前 `connectionId:address` 字符串中间格式是否继续存在。
- `bluetooth` / `other` 这类目标类型是否进入统一发送能力；当前 sender 只支持 serial / network，不能从 store 的解析函数反推支持范围。`src/composables/frames/sendFrame/useUnifiedSender.ts:31-50`, `src/stores/connectionTargetsStore.ts:145-155`
- SCOE 固定目标的具体解析和配置来源；它应归 SCOE 边界或 Batch 1D，不归 Batch 1C common sender。
- F13 / F15 所需的交付目标、设备投影目标、中心侧目标识别规则。
- F17 独立参数查询、配置、转发、过程消息平台；与 F03 / F04 直接相关的任务携带参数 / 触发输入另行归口，不在 Batch 1C 里扩展。
- 手工发送是否全部汇入任务系统；Batch 1C 只要求手工发送若进入 common sender，也必须先成为显式发送请求。
- F09 / F10 的结果字段、汇总对象、报告素材与交付模型。

## Final scope decision

Scope decision:

- `useUnifiedSender` 应被收窄为通用发送执行边界：接受显式发送请求，处理通用目标差异，执行 serial / network 发送，返回标准发送执行结果。
- `connectionTargetsStore` 应被收窄为通用连接目标目录与校验边界：枚举、分组、状态投影、目标引用校验、通用路径解析。
- 任务生命周期、领域目标、SCOE 记录、领域反馈、结果事实、报告交付都不应继续沉积在 common sender。
- Batch 1C 的目标是给 F04 / F09 / F10 提供干净的发送边界前提，不替它们做 feature design。
