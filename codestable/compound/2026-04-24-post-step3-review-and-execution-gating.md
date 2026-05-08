---
doc_type: explore
type: execution-gating-memo
memo_type: post-step3 review and execution gating
status: current
date: 2026-04-24
summary: Conservative post-step3 review that validates prior feature-to-architecture mapping against spike, scoping, architecture notes, and current hotspot code, then assigns cleanup-first / brainstorm / design-now / defer gates.
tags:
  - execution-gating
  - cleanup-first
  - post-step3-review
  - capability-domains
---

# Post-step3 review and execution gating

## Context recap

本 memo 承接两份已收敛材料，不重开能力域划分。

Evidence:

| 输入 | 本轮使用方式 |
| --- | --- |
| `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md` | 作为 capability domain、current code map、cross-cut hotspot 的主要证据面。该文指出当前 repo 更像本地运行骨架，不是中心协同骨架；send task 是本地执行系统，不是总系统任务骨架；结果/报告/交付边界尚未成形。见该文 `28-34`, `65-80`, `82-100`, `119-136`。 |
| `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md` | 作为第二步边界拍板：现在最稳定的是边界语言，不是模块树；先清高交叉热点，再决定任务、状态、发送、结果边界。见该文 `26-55`, `156-171`, `190-205`, `207-222`。 |
| `easysdd/compound/2026-04-23-feature-to-architecture-mapping-pass.md` | 作为“之前第三步回应”的落盘版本和高价值输入，但不自动采信。该文给出 F01-F20 gate、cleanup batch 和最终分组。见该文 `20-30`, `172-193`, `245-312`, `330-388`。 |

本轮也复核了甲方功能清单、`04-09` 架构文档和热点代码簇。子 agent 已分别完成 inventory memo、mapping memo、challenge memo、validation memo；主 agent 保留最终 gate 裁决、冲突仲裁、cleanup batch 排序和 design/brainstorm/defer 收口。

## Findings

1. 第三步回应的大方向站得住，但它只能作为 execution gating memo，不能升级为 architecture approval 或 feature design approval。

Evidence: spike 已将当前能力域分成中心协同、任务调度、接收、发送、SCOE、结果/存储/报告六类，并明确当前代码缺少中心协同与结果交付边界，见 `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:138-147`。scoping memo 也明确热点模块只是必须先清的交叉点，不是正式架构树，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:132-154`。

Inference: 第三步把 F03-F06、F09-F10 判为 cleanup-first，与前两步一致；但把 F01/F02 判为 design-now，更多依赖“薄边界可以并行”的假设，不是已有代码已经支撑。

Gate decision: 保守策略下，F01/F02 从 prior `design-now` 下调为 `cleanup-first`。如果后续只做不含任务态、结果态、状态字段、错误码字典的极薄 identity/envelope 边界，它们可重新申请 design-now。

2. 第一批 cleanup 必须压住三个主链热点：接收事实/触发、副作用混层；send-task 生命周期事实/本地执行态混叠；通用发送边界被领域特判反侵。

Evidence: scoping memo 将 `receiveFramesStore`、send-task cluster、`useUnifiedSender + connectionTargetsStore` 列为第一批清理候选，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:156-171`。代码上，`receiveFramesStore` 在统一接收入口内同时处理解析、统计、缓存、分组更新、表达式计算和触发检查，见 `src/stores/frames/receiveFramesStore.ts:805-1228`；send-task cluster 同时承载任务列表、状态索引、触发监听、计时器和 stop/pause/resume 事实，见 `src/stores/frames/sendTasksStore.ts:145-568`、`src/composables/frames/sendFrame/useSendTaskController.ts:26-166`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-972`；通用发送里已有 SCOE 固定目标和领域记录副作用，见 `src/composables/frames/sendFrame/useUnifiedSender.ts:69-177`。

Inference: 只要 F03-F06 要落地，现有代码会诱导把中心任务事实错误绑定到本地 send task 状态，或把接收分组/映射当作任务事实来源。

Gate decision: F03-F06 全部 `cleanup-first`，不能直接 design。

3. 结果链不能直接从 history/storage/files 推出设计；F09-F12 至少要先清“结果事实 / 本地记录 / 报告素材”层次。

Evidence: spike 指出本地历史/高速存储存在，但结果事实、报告对象、交付边界未形成，见 `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:119-136`。scoping memo 明确不要预先搬动 `historyAnalysis/highSpeedStorage/filesAPI`，也不要把本地记录直接升级成结果事实，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:173-186`。代码上 `historyAnalysis` 主要是本地历史查询和 CSV 导出，见 `src/stores/historyAnalysis.ts:157-397`；`highSpeedStorageStore` 是本地存储配置/状态，见 `src/stores/highSpeedStorageStore.ts:18-264`；`filesAPI` 是通用 Electron 文件包装，见 `src/api/common/filesApi.ts:9-81`。

Inference: F09/F10 的结果上报和汇总会反压任务生命周期；F11/F12 如果先做 design，会把结果对象、记录对象、报告素材混成一个对象。

Gate decision: F09、F10、F11、F12 全部 `cleanup-first`。F11 的“字段枚举”可在结果事实边界清楚后再走 brainstorm 或合同确认，但当前主 gate 不是 brainstorm。

4. SCOE 是条件性 cleanup 插队项，不应默认进入第一批主线，也不应被排除在边界清理之外。

Evidence: `07-SCOE 的架构位置.md` 将 SCOE 定义为二级领域，不应定义主状态，也应通过显式接收/发送/任务边界接入，见 `refactor/docs/03-architecture/07-SCOE 的架构位置.md:87-97`, `135-153`, `172-197`, `271-338`, `353-447`。当前代码中 `receiveFramesStore` 对 `scoe-tcp-server` 有短路分流，见 `src/stores/frames/receiveFramesStore.ts:899-1021`；`scoeStore` 与 `readFileAndSend` 直接依赖固定 UDP 目标和 send task manager，见 `src/stores/scoeStore.ts:18-311`、`src/composables/scoe/commands/readFileAndSend.ts:21-157`。

Inference: 若首批需求涉及 SCOE 任务、SCOE 文件发送或 SCOE 触发，SCOE access 必须进入 cleanup batch；若首批只处理中心任务主链，可作为 batch 1D 条件项。

Gate decision: SCOE access 是 `cleanup-first` 条件项，不是 design-now。

5. 第三步把 F07/F08/F11-F15 都放入 brainstorm 过于粗糙；应区分“方向不清楚”和“边界未清理”。

Evidence: 甲方清单明确主线是中心下发任务、携带用例和参数、启动/停止、用例结果、JSON 报告，见 `后面对接所需功能清单.md:109-115`；也明确结果字段尚未确定，见 `后面对接所需功能清单.md:94-105`。`09` 将身份、状态、心跳、结果、报告都描述为对外投影/交付边界，不是内部对象，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:224-279`, `296-336`, `351-390`。

Inference: F07/F08/F13/F14/F15 的目标/交互/字段仍不够清楚，适合后续 brainstorm；F11/F12 不是“想不清楚”，而是会压结果边界，所以应 cleanup-first。

Gate decision: F07、F08、F13、F14、F15 进入后续 brainstorm；F11、F12 下调为 cleanup-first。

## Validation of prior step-3 response

### Supported by spike / scoping / code

| 第三步判断 | Evidence | Validation |
| --- | --- | --- |
| F03-F06 不该直接进 design | scoping 将任务接收、启动、停止、统一状态列为主线但要求先清任务/接收/发送边界，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:114-128`, `156-171`；`04` 明确中心任务不等于现有 send task，见 `refactor/docs/03-architecture/04-运行主状态与状态边界.md:50-101`。 | 站得住。 |
| 第一批 cleanup 是 receive/trigger、send-task、send-routing | spike hotspot H1-H3 与 scoping cleanup 顺序一致，见 `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:205-260`、`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:156-171`。 | 站得住。 |
| SCOE 不是主骨架，但触碰时要先清 | scoping 将 SCOE 定为二级 domain，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:147-154`；`07` 也禁止 SCOE 定义主状态。 | 站得住，但应标为条件项。 |
| F16/F18/F19 不抢主线 | 甲方清单将独立参数配置、完整用例管理、升级重启、完整告警列为非第一批，见 `后面对接所需功能清单.md:509-550`。 | 站得住。 |

### Reasonable inference, not hard conclusion

| 第三步判断 | Inference | Conservative correction |
| --- | --- | --- |
| F01 固定身份源可 design-now | 只要身份源不碰任务态、状态查询、结果对象，它可能是薄边界。 | 当前没有稳定 northbound 模块，`09` 的接入/交付拆分仍是 proposal，不宜直接 design。主 gate 下调为 `cleanup-first`。 |
| F02 公共消息外壳可 design-now | Envelope 可以薄做，但一旦绑定错误语义、状态字段、结果字段，就会提前冻结 F07/F09/F14。 | 主 gate 下调为 `cleanup-first`。只有纯 envelope containment 可重新申请 design-now。 |
| F13 报告/数据文件交付应 brainstorm | 交付方式、完成通知、中心是否拉取文件仍未定。 | 保留 `brainstorm`，但不是因为代码脏，而是 delivery model 方向未定。 |
| F17 全部 defer | 独立参数查询/配置可 defer，但任务携带参数和触发输入会压 F03/F04。 | 拆分：任务携带参数/触发输入 `cleanup-first`；独立参数过程平台 `defer`。 |

### Premature convergence

| 第三步位置 | Problem | Final decision |
| --- | --- | --- |
| F01/F02 `design-now` | 把“描述清楚”当成“可设计”；但 northbound access/delivery 仍未被前两步批准为正式模块。 | 下调为 `cleanup-first`。 |
| F11/F12 放入 brainstorm | 混淆“字段未定”和“边界未清”。结果对象与报告对象方向并非完全没想清楚，而是会反压结果事实边界。 | F11/F12 主 gate 改为 `cleanup-first`。 |
| F16-F20 粗粒度 defer | F16/F17/F20 有与主线输入/交付有关的子切片，不能一概忽略。 | 保留主体 defer，同时把任务输入资源引用、任务参数、文件交付候选放回对应主线 gate。 |

## Feature inventory

本 inventory 不按页面标题抄写，而按能力域和主线角色归类。

| 能力域 | 主线角色 | 功能 |
| --- | --- | --- |
| Center collaboration / northbound boundary | 对外身份、消息入口、投影和交付外壳 | F01 固定身份源；F02 公共消息外壳；F07 状态查询/自检投影；F08 心跳保活；F13 报告/测试数据文件交付与完成通知；F14 错误/拒绝语义归口；F15 最小设备信息/设备列表投影；F20 中心文件获取请求 |
| Task orchestration / run main state | 中心任务事实、启动停止、生命周期 | F03 接收测试任务与上下文建立；F04 任务启动；F05 任务停止/中止控制；F06 统一执行状态事实；F17 中的任务携带参数/触发输入 |
| Receive chain | 输入事实、触发候选、领域分流 | F03 的任务输入；F04 的触发/启动输入；F17 的任务参数/过程输入；SCOE 接收接入 |
| Send chain | 明确发送请求、通用发送结果、目标解析 | F04 的执行发送；F09/F10 可能触发上报发送；SCOE 文件发送 |
| SCOE secondary domain | 二级领域接入，不定义主状态 | SCOE 任务/文件发送/接收分流相关子切片 |
| Result / report / local record | 用例结果、任务汇总、报告素材和交付 | F09 用例级结果上报；F10 任务级结果汇总；F11 结果字段/结果对象边界/运行记录/异常归一；F12 JSON 报告生成；F13 交付 |
| Asset / parameter / ops extension | 非第一批主线或只作为主线输入片段 | F16 用例资产与脚本同步；F17 独立参数查询/配置/过程消息；F18 告警上报；F19 运维控制 |

## Feature -> capability-domain map

| Feature | Capability domain | Evidence / Inference |
| --- | --- | --- |
| F01 固定身份源 | Center collaboration / external projection | Evidence: `09` 将身份作为对外投影而非内部任务对象，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:224-279`。Inference: 可薄做，但当前 northbound 边界不是已批准正式模块。 |
| F02 公共消息外壳 | Center collaboration / message envelope | Evidence: `09` 将外部请求翻译为内部输入，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:147-201`。Inference: envelope 不应提前包含 F14 错误体系。 |
| F03 接收测试任务与上下文建立 | Task orchestration + receive chain | Evidence: `06` 明确任务系统独立于接收/发送/页面，并接收显式输入，见 `refactor/docs/03-architecture/06-任务系统归口方式.md:74-103`, `326-390`。 |
| F04 任务启动 | Task orchestration + send chain | Evidence: `06` 将启动、触发、调度归任务系统；发送链只执行明确请求，见 `refactor/docs/03-architecture/06-任务系统归口方式.md:126-213`、`05-接收主链与发送主链组织方式.md:196-329`。 |
| F05 任务停止/中止控制 | Task orchestration / lifecycle | Evidence: 甲方清单明确 stop required、pause/continue 当前不需要，见 `后面对接所需功能清单.md:54-65`；当前 controller stop 会把任务改成 completed，见 `src/composables/frames/sendFrame/useSendTaskController.ts:26-57`。 |
| F06 统一执行状态事实 | Run main state | Evidence: `04` 要求主状态 single writer，派生投影不能反写事实，见 `refactor/docs/03-architecture/04-运行主状态与状态边界.md:120-139`, `215-231`。 |
| F07 状态查询/自检投影 | Center collaboration / projection | Evidence: `09` 将状态查询描述为投影，非内部对象，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:224-279`。Inference: 查询粒度和字段仍不清。 |
| F08 心跳保活 | Center collaboration / liveness projection | Evidence: `09` 将 keepalive 作为外部入口/投影问题，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:147-201`, `224-279`。Inference: 心跳是状态快照、连接保活还是任务保活仍未定。 |
| F09 用例级结果上报 | Result fact + task lifecycle + northbound delivery | Evidence: 甲方清单要求用例完成即 report，见 `后面对接所需功能清单.md:67-92`；spike 指出结果/报告交付边界缺失，见 `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:119-136`。 |
| F10 任务级结果汇总 | Result fact + task lifecycle | Evidence: 同 F09；`06` 将任务完成/清理归任务系统，见 `refactor/docs/03-architecture/06-任务系统归口方式.md:126-213`。 |
| F11 结果字段/对象边界/记录/异常 | Result fact boundary | Evidence: 结果字段未知，见 `后面对接所需功能清单.md:94-105`；历史/记录不是运行事实，见 `refactor/docs/03-architecture/04-运行主状态与状态边界.md:178-214`。 |
| F12 JSON 报告生成 | Report material / report object | Evidence: 甲方清单要求任务 JSON 报告，见 `后面对接所需功能清单.md:67-92`；`09` 区分 report object 与 delivery action，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:351-390`。 |
| F13 报告/数据文件交付与完成通知 | Delivery boundary | Evidence: `09` 拆分报告对象、交付动作和完成通知，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:351-390`。Inference: push/pull/文件请求模型未定。 |
| F14 错误/拒绝语义归口 | Northbound error contract | Evidence: `09` 将外部 error/reject semantics 归北向边界，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:296-336`。Inference: 错误分类和映射策略未定。 |
| F15 最小设备信息/设备列表投影 | Center collaboration / device projection | Evidence: 甲方清单将其列为支撑功能而非第一主线，见 `后面对接所需功能清单.md:401-505`。Inference: 最小字段和设备范围未定。 |
| F16 用例资产与脚本同步 | Asset/case/script support | Evidence: 完整用例管理和脚本上传下载不在第一批，见 `后面对接所需功能清单.md:509-550`。 |
| F17 参数协同与过程消息 | Split: task input support vs standalone parameter/procedure platform | Evidence: 当前前提是参数随任务用例带入，尚无独立参数查询配置，见 `后面对接所需功能清单.md:30-53`。 |
| F18 告警上报 | Ops / alarm extension | Evidence: 完整告警不是第一批，见 `后面对接所需功能清单.md:509-550`。 |
| F19 运维控制 | Ops control extension | Evidence: 升级/重启不是第一批，见 `后面对接所需功能清单.md:509-550`。 |
| F20 中心文件获取请求 | Delivery model candidate / file retrieval | Evidence: `09` 讨论交付边界，但没有批准实现层，见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:351-390`。Inference: 可作为 F13 brainstorm 的候选模型，不能单独 design。 |

## Feature -> core-module / hotspot map

| Feature | Core module / hotspot pressure | Evidence |
| --- | --- | --- |
| F01 | Northbound boundary missing; may pressure connection identity/config if over-designed | `09` 是 proposal-like boundary，scoping 未批准 northbound split 为当前正式模块，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:207-222`。 |
| F02 | Northbound envelope; risks freezing F14/F07/F09 fields | `09` explicitly separates external request translation from internal facts,见 `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:147-201`。 |
| F03 | `receiveFramesStore`, `useSendTaskTriggerListener`, send-task cluster | 接收 store 同时触发 task，见 `src/stores/frames/receiveFramesStore.ts:1186-1228`；trigger listener 反读 mappings，见 `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`。 |
| F04 | send-task cluster, `FrameSendPage.vue`, `useUnifiedSender` | 当前 executor 负责本地任务类型和完成状态，见 `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-972`；页面直接发起发送和任务弹窗，见 `src/pages/FrameSendPage.vue:109-193`。 |
| F05 | send-task controller/store/lifecycle | stop 标 completed，pause/resume 不完整，见 `src/composables/frames/sendFrame/useSendTaskController.ts:26-166`；store completed 会 remove task，见 `src/stores/frames/sendTasksStore.ts:401-426`。 |
| F06 | run main state vs page/send monitor/history projections | `04` 禁止页面、send monitor、receive groups、history 反向塑造主事实，见 `refactor/docs/03-architecture/04-运行主状态与状态边界.md:215-231`。 |
| F07 | F06 projection, not storage/source module | 状态查询只能从 run facts 派生，不能先由页面/记录字段定义。 |
| F08 | F06/F07 projection plus northbound timing semantics | 心跳若绑定 task lifecycle 会反压 F06。 |
| F09 | send-task completion, result fact boundary, delivery boundary | 当前任务完成与删除耦合，见 `src/stores/frames/sendTasksStore.ts:401-568`；结果边界未成形。 |
| F10 | task summary fact vs local records | `historyAnalysis/highSpeedStorage/filesAPI` 都不是任务结果事实，见 `src/stores/historyAnalysis.ts:157-397`, `src/stores/highSpeedStorageStore.ts:18-264`, `src/api/common/filesApi.ts:9-81`。 |
| F11 | result fact / local record / exception boundary | 字段未知且异常归一会横跨 F05/F09/F10/F14。 |
| F12 | result/report boundary + files API observation | JSON report 不能直接等于 local file export。 |
| F13 | delivery boundary + files API observation + possible F20 | `filesAPI` 只是通用文件包装，见 `src/api/common/filesApi.ts:9-81`。 |
| F14 | northbound error/reject + lifecycle errors | 不应被 F02 envelope 先冻结。 |
| F15 | device projection + identity/status boundary | 不能从现有连接目标自动推出设备列表事实。 |
| F16 | asset/case/script store candidates not yet core | scoping 明确不要把 frame assets 升级成 case/script/menu，见 `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:173-186`。 |
| F17 | Split pressure: receive/trigger/task input vs standalone parameter platform | 任务参数随用例带入是主线输入；独立参数查询配置不是第一批。 |
| F18 | Alarm extension, no first-batch hotspot ownership | 当前不抢主线。 |
| F19 | Ops control extension, no first-batch hotspot ownership | 当前不抢主线。 |
| F20 | Delivery candidate, not file subsystem design | 可参与 F13 brainstorm，不单独进入实现设计。 |

## Per-feature next gate

| Feature | Next gate | Evidence | Inference | Gate decision |
| --- | --- | --- | --- | --- |
| F01 固定身份源 | cleanup-first | Northbound boundary 尚未成为正式模块；`09` 只是对外交付边界建议。 | 薄 identity 可独立，但当前直接 design 容易绑定状态/结果/任务。 | 从 prior design-now 下调。 |
| F02 公共消息外壳归口 | cleanup-first | 外部请求应翻译为内部输入，不定义内部事实，见 `09:147-201`。 | Envelope 若提前包含错误/状态/结果字段，会冻结 F07/F09/F14。 | 从 prior design-now 下调。 |
| F03 接收测试任务与上下文建立 | cleanup-first | `receiveFramesStore` 与 trigger/listener/sendTasksStore 混层。 | 直接 design 会把 receive groups/mappings 当任务事实。 | 先清接收事实与触发候选。 |
| F04 任务启动 | cleanup-first | send-task executor 直接管理本地任务类型、定时、触发和完成。 | 中心任务启动不能直接等同当前 local send start。 | 先清 send-task lifecycle。 |
| F05 任务停止/中止控制 | cleanup-first | 甲方只要 stop；当前 stop -> completed，pause/resume 不完整。 | 直接 design 会继承错误生命周期语义。 | 先清 stop/abort/completed/error 事实。 |
| F06 统一执行状态事实 | cleanup-first | `04` 要求 single writer 和投影不可反写。 | 现有页面/monitor/receive/history 都可能反压事实。 | 先定 run fact 边界。 |
| F07 状态查询/自检投影 | brainstorm | `09` 只给投影位置。 | 查询字段、粒度、是否含自检仍不清。 | 后续走 `.agent/skills/easysdd-feature-brainstorm/SKILL.md`。 |
| F08 心跳保活 | brainstorm | `09` 仅把 keepalive 放在对外入口/投影层。 | 心跳语义是连接保活、状态快照还是任务保活未定。 | 后续 brainstorm。 |
| F09 用例级结果上报 | cleanup-first | 结果/报告交付边界缺失；任务完成与本地状态耦合。 | 直接 design 会把 local completion/records 当 result fact。 | 先清结果事实与任务完成边界。 |
| F10 任务级结果汇总 | cleanup-first | 任务 summary 依赖 F06/F09。 | 直接 design 会把 history/storage 汇总误当任务事实。 | 先清 result/task summary boundary。 |
| F11 结果字段/对象边界/运行记录/异常归一 | cleanup-first | 字段未知；记录不是主事实。 | 字段表可后续 brainstorm，但对象层次必须先清。 | 主 gate cleanup-first。 |
| F12 JSON 报告生成 | cleanup-first | JSON report 依赖结果对象和报告对象边界。 | 直接 design 会把 file export 当 report object。 | 先清 result/report material boundary。 |
| F13 报告/测试数据文件交付与完成通知 | brainstorm | `09` 区分 report object、delivery action、completion notice。 | push/pull、文件请求、交付完成语义仍不清。 | 后续 brainstorm，F20 可作为候选模型。 |
| F14 错误/拒绝语义归口 | brainstorm | `09` 将 error/reject 归北向边界。 | 错误分类、拒绝条件、内部错误映射未定。 | 后续 brainstorm；不允许 F02 先冻结。 |
| F15 最小设备信息/设备列表投影 | brainstorm | 属支撑功能，不在第一主线。 | 设备范围和最小字段不清，不能从 connectionTargets 直接推出。 | 后续 brainstorm。 |
| F16 用例资产与脚本同步 | defer | 完整 case/script/menu 不在第一批。 | 任务输入里资源引用可作为 F03 边界备注，不单独设计。 | defer。 |
| F17 参数协同与过程消息 | split: cleanup-first / defer | 参数当前随任务用例带入，无独立参数配置。 | 任务携带参数压 F03/F04；独立 get/set/forward/msgReport 不抢主线。 | 任务输入子切片 cleanup-first；独立平台 defer。 |
| F18 告警上报 | defer | 完整告警不在第一批。 | 不应抢占主线状态/错误语义。 | defer。 |
| F19 运维控制 | defer | 升级/重启不在第一批。 | 不应牵引中心协同主线。 | defer。 |
| F20 中心文件获取请求 | defer | 交付边界尚未定。 | 可作为 F13 brainstorm 候选，不能单独 implementation design。 | defer as feature; candidate inside F13 brainstorm。 |

## Cleanup-first batch candidates

### Batch 1A: receive input fact and trigger boundary

Modules:

| Module | Why first | Blocks |
| --- | --- | --- |
| `src/stores/frames/receiveFramesStore.ts` | 现在同时做接收事实、解析、统计、缓存、分组、表达式、触发、SCOE 分流。 | F03, F04, F06, F17 task-input slice, SCOE receive access |
| `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts` | 触发监听反读 receive mappings，说明触发输入和接收存储边界未清。 | F03, F04, F06, F17 task-input slice |

Evidence: `receiveFramesStore` 中 `processReceivedFrame` 及后续链路集中处理多类副作用，见 `src/stores/frames/receiveFramesStore.ts:805-1228`；trigger listener 根据 task status 和 received frame 直接触发任务并反读 mappings，见 `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-183`。

Gate decision: 第一批 cleanup 入口。

### Batch 1B: send-task lifecycle and local execution state

Modules:

| Module | Why first | Blocks |
| --- | --- | --- |
| `src/stores/frames/sendTasksStore.ts` | 同时承载 tasks、status indexes、trigger listener、remove/clear/stopAll。 | F03, F04, F05, F06, F09, F10 |
| `src/composables/frames/sendFrame/useSendTaskManager.ts` | 当前任务创建/管理入口会被误用为中心任务入口。 | F03, F04 |
| `src/composables/frames/sendFrame/useSendTaskExecutor.ts` | 本地 sequential/timed/triggered 执行器容易被误升格为中心任务 executor。 | F04, F06, F09 |
| `src/composables/frames/sendFrame/useSendTaskController.ts` | stop/pause/resume/completed 语义不适合直接外放。 | F05, F06 |
| `src/pages/FrameSendPage.vue` | 页面持有任务监控和弹窗入口，不应成为任务事实来源。 | F04, F06 |
| `src/boot/taskManager.ts` | boot cleanup 是运行退出兜底，不应成为生命周期事实。 | F05, F06 |

Evidence: store 状态和 controller/executor 行为见 `src/stores/frames/sendTasksStore.ts:145-568`、`src/composables/frames/sendFrame/useSendTaskController.ts:26-166`、`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-972`。

Gate decision: Batch 1A 之后立即清；F03-F06 设计前置条件。

### Batch 1C: unified sender and connection target boundary

Modules:

| Module | Why first | Blocks |
| --- | --- | --- |
| `src/composables/frames/sendFrame/useUnifiedSender.ts` | 通用发送内含表达式计算、目标解析、串口/网络分支、stats、SCOE 记录副作用。 | F04, F09, F10, SCOE send access |
| `src/stores/connectionTargetsStore.ts` | 目标解析是通用发送边界，不应承载领域目标规则。 | F04, F13, F15, SCOE send access |

Evidence: `useUnifiedSender` 中 SCOE 固定目标和记录副作用见 `src/composables/frames/sendFrame/useUnifiedSender.ts:154-160`；target path 校验见 `src/stores/connectionTargetsStore.ts:172-197`。

Gate decision: 与 Batch 1B 并列或紧随其后；不能让 SCOE/任务/结果特判反侵通用发送。

### Batch 1D: SCOE access, conditional

Modules:

| Module | Why conditional | Blocks |
| --- | --- | --- |
| `src/stores/scoeStore.ts` | SCOE 目前直接连网络、统一发送、test tool、状态配置。 | 首批含 SCOE 时的 F04/F09/F13 |
| `src/composables/scoe/commands/readFileAndSend.ts` | 直接创建 timed send task，默认固定 SCOE UDP 目标。 | SCOE 文件发送、SCOE task access |
| `src/stores/frames/receiveFramesStore.ts` SCOE 分流 | 接收链有 SCOE source short-circuit。 | SCOE receive access |

Evidence: `scoeStore`、`readFileAndSend`、`receiveFramesStore` SCOE 分流见 `src/stores/scoeStore.ts:18-311`、`src/composables/scoe/commands/readFileAndSend.ts:21-157`、`src/stores/frames/receiveFramesStore.ts:899-1021`。

Gate decision: 若首批任务包含 SCOE，用 1D 插队；否则不抢 1A-1C。

### Observation only: result/local-record/report material

Modules:

| Module | Current role | Decision |
| --- | --- | --- |
| `src/stores/historyAnalysis.ts` | 本地历史查询、metadata、CSV export。 | 暂不搬动；作为 F09-F12 边界证据。 |
| `src/stores/highSpeedStorageStore.ts` | 本地高速存储配置/状态。 | 暂不搬动；不能升级为 result fact。 |
| `src/api/common/filesApi.ts` | Electron 文件 API 包装。 | 暂不搬动；不能升级为 report delivery boundary。 |

Gate decision: 不进入第一批 cleanup module list，但 F09-F12 设计前必须明确它们不是结果事实层。

## Brainstorm candidates

这些功能适合后续进入 `.agent/skills/easysdd-feature-brainstorm/SKILL.md`，原因必须是“目标/价值/方案方向本身还没想清楚”，不是“代码太脏”。

| Feature | Why brainstorm |
| --- | --- |
| F07 状态查询/自检投影 | 查询对象、字段粒度、自检是否独立于运行状态都未定。 |
| F08 心跳保活 | 心跳语义未定：连接保活、状态快照、任务保活、还是中心协同 liveness。 |
| F13 报告/测试数据文件交付与完成通知 | delivery model 未定：主动推送、中心拉取、完成通知与文件可用性的关系未定。 |
| F14 错误/拒绝语义归口 | 错误分类、拒绝条件、内部异常到外部语义的映射策略未定。 |
| F15 最小设备信息/设备列表投影 | 最小设备字段、设备范围、是否由连接目标投影都未定。 |
| F20 as F13 delivery candidate | 仅作为“中心拉取文件”交付模型候选进入 F13 brainstorm；不作为独立 feature design。 |
| F11 field-list slice only | 结果事实边界 cleanup 后，如果字段仍不确定，再只对字段枚举和外部合同走 brainstorm。 |

## Design-now candidates

Strict conservative gate 下，本轮没有第一批真正可以直接进入 feature design 的功能。

Evidence:

| Candidate from prior step | Why not design-now now |
| --- | --- |
| F01 固定身份源 | 当前缺 northbound boundary 的正式落点；身份一旦绑定状态、任务、结果字段，就会反压 F03-F15。 |
| F02 公共消息外壳 | Envelope 一旦包含错误、状态、结果字段，就会提前冻结 F07/F09/F14。 |

Gate decision: `design-now` list is empty for this round.

Conditional re-entry rule:

| Feature | May re-enter design-now only if |
| --- | --- |
| F01 | 只定义固定身份源归口，不含任务态、结果态、状态查询字段、设备列表字段、连接生命周期设计。 |
| F02 | 只定义消息外壳归口，不含错误码字典、状态字段、结果字段、报告字段、内部对象 schema。 |

## Deferred items

| Feature | Deferred scope |
| --- | --- |
| F16 用例资产与脚本同步 | 完整 case/script/menu CRUD、同步协议、资产库设计 defer。任务输入里的资源/脚本引用只作为 F03 边界备注。 |
| F17 standalone parameter/procedure platform | 独立 `getPars/setPars/forward/msgReport`、参数查询配置平台 defer。任务携带参数/触发输入不 defer，归入 F03/F04 cleanup-first。 |
| F18 告警上报 | 完整告警体系 defer，避免抢占 F14 错误语义和 F06 状态事实。 |
| F19 运维控制 | 升级、重启等运维控制 defer。 |
| F20 中心文件获取请求 | 独立实现 defer；只可作为 F13 delivery brainstorm 候选。 |

## Conservative downgrade suggestions

如果用户倾向于“多清理、少冒进”，下列 prior design-now 或 prior brainstorm 项应下调。

| Prior gate | Feature | Conservative gate | Reason |
| --- | --- | --- | --- |
| design-now | F01 固定身份源 | cleanup-first | Northbound boundary 尚未正式落点，identity 不能先绑定任务/状态/结果。 |
| design-now | F02 公共消息外壳 | cleanup-first | Envelope 不能先冻结 F14/F07/F09 字段。 |
| brainstorm | F11 结果字段/对象边界/记录/异常 | cleanup-first | 主问题不是方向不明，而是结果事实、本地记录、异常归一层次未清。 |
| brainstorm | F12 JSON 报告生成 | cleanup-first | 主问题不是报告价值不明，而是 result/report object/material/delivery 边界未清。 |
| defer | F17 task-carried params / trigger input slice | cleanup-first | 该子切片会压 F03/F04，不能等同独立参数平台 defer。 |

## Next-step handoff

下一轮最应该继续推进的问题，不写实现，不写 spec。

1. 先写 cleanup scope memo for Batch 1A：`receiveFramesStore` 最小输出应是什么，哪些副作用必须移出或隔离，trigger candidate 与 display/history/SCOE 分流如何保持输入边界。

2. 再写 cleanup scope memo for Batch 1B：中心任务事实、用例执行上下文、本地 send execution object 三者如何降级/隔离，哪些现有状态不能外放为 lifecycle fact。

3. 同步写 send boundary cleanup memo for Batch 1C：common sender 只接受什么显式 request、返回什么通用 result，领域目标/记录/反馈副作用如何下沉。

4. 如果首批含 SCOE，补 Batch 1D scope：SCOE 只能通过 explicit receive/send/task inputs 接入，不能定义主状态，也不能把固定 UDP 目标写进 common sender。

5. 在 1A-1C scope 收口后，再重新评估 F03-F06；F09-F12 必须等 result fact / local record / report material 三层分清后再进入 design。

## Final lists

### 1. 第一批最该先清的核心模块名单

| Priority | Modules |
| --- | --- |
| Batch 1A | `src/stores/frames/receiveFramesStore.ts`; `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts` |
| Batch 1B | `src/stores/frames/sendTasksStore.ts`; `src/composables/frames/sendFrame/useSendTaskManager.ts`; `src/composables/frames/sendFrame/useSendTaskExecutor.ts`; `src/composables/frames/sendFrame/useSendTaskController.ts`; `src/pages/FrameSendPage.vue`; `src/boot/taskManager.ts` |
| Batch 1C | `src/composables/frames/sendFrame/useUnifiedSender.ts`; `src/stores/connectionTargetsStore.ts` |
| Batch 1D conditional | `src/stores/scoeStore.ts`; `src/composables/scoe/commands/readFileAndSend.ts`; `src/stores/frames/receiveFramesStore.ts` 内 SCOE 分流 |

### 2. 第一批不该直接进 design 的功能名单

| Gate reason | Features |
| --- | --- |
| cleanup-first | F01 固定身份源；F02 公共消息外壳归口；F03 接收测试任务与上下文建立；F04 任务启动；F05 任务停止/中止控制；F06 统一执行状态事实；F09 用例级结果上报；F10 任务级结果汇总；F11 结果字段/结果对象边界/运行记录/异常归一；F12 JSON 报告生成；F17 任务携带参数/触发输入子切片 |
| brainstorm-first | F07 状态查询/自检投影；F08 心跳保活；F13 报告/测试数据文件交付与完成通知；F14 错误/拒绝语义归口；F15 最小设备信息/设备列表投影 |
| defer | F16 完整用例资产与脚本同步；F17 独立参数/过程平台；F18 告警上报；F19 运维控制；F20 中心文件获取请求独立实现 |

### 3. 第一批适合后续进入 `.agent/skills/easysdd-feature-brainstorm/SKILL.md` 的功能名单

| Feature | Scope |
| --- | --- |
| F07 | 状态查询/自检投影目标和字段粒度 |
| F08 | 心跳保活语义和归属 |
| F13 | 报告/测试数据交付模型和完成通知语义 |
| F14 | 错误/拒绝语义分类和映射策略 |
| F15 | 最小设备信息/设备列表投影字段和范围 |
| F20 | 仅作为 F13 的 pull-based delivery candidate |
| F11 | 仅限结果字段枚举；前提是结果事实边界已 cleanup |

### 4. 第一批真的可以直接进 design 的功能名单

无。

Strict conservative gate 下，F01/F02 也不直接进 design。它们只能在后续证明仍是极薄 identity/envelope 边界时重新申请 design-now。

### 5. 第一批应该明确 defer 的功能名单

| Feature | Deferred scope |
| --- | --- |
| F16 | 完整用例资产、脚本同步、菜单/资产库设计 |
| F17 | 独立参数查询/配置、forward、msgReport、过程消息平台 |
| F18 | 完整告警上报体系 |
| F19 | 升级、重启等运维控制 |
| F20 | 中心文件获取请求的独立实现设计 |
