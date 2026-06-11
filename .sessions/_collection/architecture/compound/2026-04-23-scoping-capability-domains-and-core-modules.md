---
doc_type: explore
type: architecture-scoping-memo
memo_type: architecture scoping memo
status: current
date: 2026-04-23
summary: 基于 04/05/06/07、甲方主题拆解与当前代码热点的能力域与核心模块范围界定 memo，不将 08/09 或 spike 视为已批准结论。
tags:
  - architecture
  - scoping
  - capability-domains
  - core-modules
  - task-system
  - scoe
  - northbound-boundary
---

# Architecture Scoping Memo: 全系统能力域与核心模块范围界定

## Scope

- 本文是 `architecture scoping memo`，只回答能力域、优先层次、核心交叉模块、先清哪些、先别动哪些、哪些边界现在拍板、哪些延后。
- 本文不写实现方案，不写 spec 字段，不写代码改法。
- `04/05/06/07` 与当前代码是主证据面；`08/09` 与 spike 只作为提案级材料和反证材料，不视为已批准结论。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:58-93`; `refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:75-188`; `refactor/docs/03-architecture/06-任务系统归口方式.md:83-103`; `refactor/docs/03-architecture/07-SCOE 的架构位置.md:87-97`; `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:20-27`

## Findings

### F1. 当前最稳的不是“正式模块树”，而是“内部骨架边界语言”

- `Evidence:` `04` 已把一级内部事实收敛为 `子系统运行主体 / 中心任务上下文 / 用例执行上下文 / 生命周期控制状态 / 结果归口状态`，并明确主状态单点归口，展示态、记录态、缓存态不得反向塑造主状态。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:58-93,120-139,215-231`
- `Evidence:` `05` 已把接收主链与发送主链都限定为显式输入/显式输出边界，不再允许依赖共享状态回读补齐语义。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:31-42,75-188,273-310,449-453`
- `Evidence:` `06` 已把任务系统定位为独立能力域，且明确 `中心任务上下文 > 用例执行上下文 > 本地发送执行对象`。`refactor/docs/03-architecture/06-任务系统归口方式.md:83-103,126-213`
- `Evidence:` `07` 已把 SCOE 限定为二级领域模块，而不是一级骨架能力。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:87-97,135-153`
- `Inference:` 现在真正收敛的是“哪些东西不能再混写”“哪些对象不能互相冒充”，而不是“正式模块/目录已经落成”。
- `Decision:` 本轮以边界语言收口，不把当前代码目录或 `08/09` 的模块层名直接当成正式架构树。
- `Deferred:` 北向边界内部是否正式拆成 `接入层 / 对外交付层`，本轮不作为已批准结论。`refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:79-130`

### F2. 当前代码热点清楚，但热点不等于正式骨架

- `Evidence:` `receiveFramesStore` 同时处理输入队列、SCOE 短路、解析结果更新、表达式计算、统计、触发条件检查，并把 `DataItem[]` 推给 `sendTasksStore`。`src/stores/frames/receiveFramesStore.ts:852-891,1015-1139,1186-1228`
- `Evidence:` `sendTasksStore`、`useSendTaskManager`、`useSendTaskExecutor`、`useSendTaskController`、`FrameSendPage.vue`、`taskManager.ts` 共同持有任务创建、启动、暂停、停止、等待触发、等待调度、页面入口和 unload 清理。`src/stores/frames/sendTasksStore.ts:145-185,401-426,533-562`; `src/composables/frames/sendFrame/useSendTaskManager.ts:15-23,180-222`; `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-518,658-760,900-976`; `src/composables/frames/sendFrame/useSendTaskController.ts:26-57,161-166`; `src/pages/FrameSendPage.vue:153-193,264-400`; `src/boot/taskManager.ts:17-48`
- `Evidence:` `useUnifiedSender` 已是统一发送落点雏形，但仍含 `network:scoe-udp:scoe-udp-remote` 特判。`src/composables/frames/sendFrame/useUnifiedSender.ts:107-160`
- `Evidence:` SCOE 同时占据独立状态、接收入口、统一发送复用和发送任务复用。`src/stores/scoeStore.ts:18-24,216-341`; `src/composables/scoe/commands/readFileAndSend.ts:118-157`
- `Inference:` 当前代码热点说明“哪里会放大返工”，不说明“哪里就是最终骨架中心”。
- `Decision:` 第三步必须围绕热点做逐功能映射，但不得把热点直接升格为正式能力域。
- `Deferred:` 哪些热点最终保留为长期核心模块，哪些只是过渡性技术债，要到第三步逐功能映射再定。

### F3. 甲方主线已经足够清楚，但外围能力不应抢前置位

- `Evidence:` 甲方主题拆解把能力拆为基础信息、资产维护、任务主链、结果回传、参数协同、运维保活等主题。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:14-40,84-147,149-196,220-272`
- `Evidence:` 后续必须跑通的主线是：中心下发任务 -> 任务中带用例和参数 -> 我方接收任务并启动执行 -> 中心可能停止任务 -> 每个用例完成后上报结果 -> 整个任务完成后输出任务报告。`后面对接所需功能清单.md:109-115`
- `Evidence:` 结果字段、心跳交互形式、报告交付方式仍未收稳。`后面对接所需功能清单.md:94-105,261-279,352-393,423-440`
- `Inference:` 当前应先围绕任务主链、结果归集、最小对外状态能力收口，不能让完整资产体系、完整参数体系、完整运维体系反客为主。
- `Decision:` 主线优先级围绕“任务进入、执行推进、结果归集、最小状态投影”，外围能力只保留边界位。
- `Deferred:` 心跳最终靠近协同可见性还是运维控制，本轮不冻结。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:256-272`

## Capability domains

- `Decision:` 本轮采用 6 个能力域作为 scoping taxonomy，而不是最终模块树：
  1. `协同接入与状态可见性`
  2. `资产管理`
  3. `任务承接与运行编排`
  4. `参数与运行期信号协同`
  5. `结果归集与交付`
  6. `运维控制与系统可用性`
- `Evidence:` 这 6 组可由甲方主题拆解直接归并出来。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:14-40,84-147,149-196,220-272`
- `Inference:` 这组划分足够支撑当前 memo 的能力域收口，但还不足以证明正式文档序列应直接按这 6 域展开。
- `Deferred:` “协议/文件公共前提”“告警/过程类上报”本轮不升格为一级能力域，但第三步必须保留为独立观察位。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:43-83,198-218`

### D1. 协同接入与状态可见性

- `Evidence:` 甲方要求至少存在身份信息、状态查询、心跳等对外可见能力。`后面对接所需功能清单.md:123-140,238-279`
- `Evidence:` 当前代码没有独立北向协同模块，暴露的还是系统/文件/串口/网络/接收/存储/历史/定时器能力。`src/api/common/index.ts:6-34`; `src-electron/preload/api/index.ts:14-31`
- `Decision:` 该域在架构上必须保留为一级能力域，但当前只收“不可与内部运行对象同构”这一条硬边界。
- `Deferred:` 是否正式拆成 `接入层 / 对外交付层`，本轮不拍板。

### D2. 资产管理

- `Evidence:` 甲方资产语义是 `用例 / 脚本 / 菜单`，并与任务执行分离。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:116-147`
- `Evidence:` 当前代码中的显式资产是 `frameTemplates / sendFrameInstances / receive config / SCOE config`。`src/stores/frames/frameTemplateStore.ts:13-89`; `src/stores/frames/sendFrameInstancesStore.ts:27-137`; `src/layouts/useAppLifecycle.ts:47-59`
- `Inference:` 当前已有“本地技术资产域”，但还不是甲方语义下的完整用例资产域。
- `Decision:` 本轮只把它收口为“本地通信/测试资产域”，不把它误写成完整 `case/script/menu` 系统。
- `Deferred:` `case/script/menu` 与现有 frame/instance 的关系留到第三步再定。

### D3. 任务承接与运行编排

- `Evidence:` `06` 已明确任务系统独立归口，并负责推进中心任务、用例上下文、生命周期与任务相关结果归口。`refactor/docs/03-architecture/06-任务系统归口方式.md:83-103,126-213`
- `Evidence:` 当前最接近的代码现实是本地 send-task 体系，而非正式中心任务对象。`src/stores/frames/sendTasksStore.ts:145-185,401-426`
- `Decision:` 这是当前主线中的核心能力域，且第三步应优先围绕它做功能映射。

### D4. 参数与运行期信号协同

- `Evidence:` 甲方把参数查询、配置、转发、反馈与数据转发单列成主题。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:220-250`
- `Evidence:` 当前代码里的触发条件与参数变化主要通过 `receiveFramesStore`、`mappings`、`useSendTaskTriggerListener`、SCOE 参数文件注入串起来。`src/stores/frames/receiveFramesStore.ts:1058-1139,1186-1228`; `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`; `src/composables/scoe/commands/readFileAndSend.ts:41-117`
- `Decision:` 该域应保留，但本轮只把它视为任务主线的支撑域，不提前扩展成完整参数平台。

### D5. 结果归集与交付

- `Evidence:` 甲方明确要求每用例结果上报、任务级结果汇总、JSON 报告、报告交付。`后面对接所需功能清单.md:282-393`
- `Evidence:` 当前结果侧代码主要是本地历史分析、高速存储和文件能力，不是正式结果对象或报告交付边界。`src/stores/historyAnalysis.ts:173-229`; `src/stores/highSpeedStorageStore.ts:198-264`; `src/api/common/filesApi.ts:9-80`
- `Decision:` 这是当前主线中的核心能力域，但本轮只收口到“结果事实”和“本地记录”必须分层，暂不提前冻结交付边界内部结构。
- `Deferred:` 结果归口是否进一步拆成“归集”与“交付”两层，留到第三步或后续专题。

### D6. 运维控制与系统可用性

- `Evidence:` 甲方把升级、心跳、重启放在运维保活主题里。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:252-272`
- `Evidence:` 当前代码里的对应现实主要是网络连接、beforeunload 清理、SCOE 常开状态更新。`src/boot/taskManager.ts:17-48`; `src/stores/scoeStore.ts:293-341`
- `Decision:` 该域需要保留，但当前不应抢占任务主线前置位。

## Priority layers

- `Decision:` 关键功能、支撑功能、边缘功能按主线压力分层，而不是按现有代码目录分层。

### 关键功能

- `Decision:` `任务接收 / 任务启动 / 任务停止 / 统一运行状态 / 用例结果上报 / 任务级结果汇总与报告边界` 属于关键功能。
- `Evidence:` 这些能力都在功能清单主线里，且是 must-have。`后面对接所需功能清单.md:144-209,213-393`
- `Inference:` 第三步逐功能映射时，优先级必须围绕这组能力，而不是先围绕完整资产体系或完整运维体系。

### 支撑功能

- `Decision:` `本地技术资产`、`参数/触发信号协同`、`统一发送/目标解析`、`最小身份与状态投影`、`最小保活能力` 属于支撑功能。
- `Evidence:` 这些能力是任务主线运行和对外最小协同的支撑面。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:116-147,220-272`; `src/composables/frames/sendFrame/useUnifiedSender.ts:69-177`

### 边缘功能

- `Decision:` `完整 case/script/menu 管理`、`完整参数查询/配置全集`、`完整告警体系`、`升级/重启`、`历史分析增强`、`高速存储增强` 属于边缘功能。
- `Evidence:` 这些能力现在不是联调主线前置位，且当前代码现实也主要是工具层或局部功能。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:116-147,198-218,252-272`; `src/stores/historyAnalysis.ts:173-229`; `src/stores/highSpeedStorageStore.ts:198-264`

## Core cross-cut modules

### C1. `src/stores/frames/receiveFramesStore.ts`

- `Evidence:` 同时承担输入承接、SCOE 短路、解析后更新、表达式、统计、触发。`src/stores/frames/receiveFramesStore.ts:852-891,1015-1139,1186-1228`
- `Inference:` 它是“接收事实 vs 运行输入 vs 显示/记录副作用”混层最集中的地方。
- `Decision:` 认定为一号核心交叉模块。

### C2. send-task cluster

- `Evidence:` `sendTasksStore`、`useSendTaskManager`、`useSendTaskExecutor`、`useSendTaskController`、`FrameSendPage.vue`、`taskManager.ts` 共同承载本地任务编排和生命周期外围语义。`src/stores/frames/sendTasksStore.ts:145-185,401-426,533-562`; `src/composables/frames/sendFrame/useSendTaskManager.ts:15-23,180-222`; `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-518,658-760,900-976`; `src/composables/frames/sendFrame/useSendTaskController.ts:26-57,161-166`; `src/pages/FrameSendPage.vue:153-193,264-400`; `src/boot/taskManager.ts:17-48`
- `Inference:` 它是“中心任务语义最容易被本地执行对象冒充”的地方。
- `Decision:` 认定为二号核心交叉模块簇。

### C3. `useUnifiedSender + connectionTargetsStore`

- `Evidence:` 当前它已是逻辑 target -> 物理路径 -> 统一发送执行的收口点，但仍含领域固定目标特判。`src/composables/frames/sendFrame/useUnifiedSender.ts:107-160`; `src/stores/connectionTargetsStore.ts:172-197`
- `Inference:` 它是未来通用发送边界最自然的落点，也是最容易被领域规则反侵的地方。
- `Decision:` 认定为三号核心交叉模块。

### C4. SCOE 接入簇

- `Evidence:` `scoeStore`、`readFileAndSend`、`receiveFramesStore` 内 SCOE 分流共同决定了 SCOE 如何压迫总骨架。`src/stores/scoeStore.ts:18-24,216-341`; `src/composables/scoe/commands/readFileAndSend.ts:118-157`; `src/stores/frames/receiveFramesStore.ts:899-991,1015-1019`
- `Inference:` 它不是边角模块，而是验证“领域模块 vs 通用骨架”边界是否真的成立的压力点。
- `Decision:` 认定为四号核心交叉模块。

## Pre-implementation cleanup candidates

- `Decision:` 第一优先是 `receiveFramesStore`。
- `Evidence:` 文档已明确接收主链不应继续混入显示、历史、任务触发、测试工具等多方向副作用。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:182-188,449-453`
- `Inference:` 如果第三步不先把它按“运行输入 / 显示副作用 / 领域入口”拆读，后续所有功能映射都会被共享状态误导。

- `Decision:` 第二优先是 send-task cluster。
- `Evidence:` 当前停止语义直接写成 `completed`，`completed` 后任务即被删除；`waiting-schedule` 在 UI 可停，但控制器不承认它可停。`src/composables/frames/sendFrame/useSendTaskController.ts:26-57,161-166`; `src/stores/frames/sendTasksStore.ts:401-426`; `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-368`
- `Inference:` 这说明“生命周期事实”与“本地执行状态”仍高度混叠，第三步不处理会直接影响任务主线映射。

- `Decision:` 第三优先是 `useUnifiedSender + connectionTargetsStore`。
- `Evidence:` 文档已明确通用发送链不应长期承载固定领域目标、领域记录回写、领域反馈帧拼装。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:266-286,321-327,444-447`
- `Inference:` 这是最适合在加功能前先收窄责任边界的通用模块。

- `Decision:` 第四优先是 SCOE 接入点，而不是整个 SCOE 域。
- `Inference:` 当前更该先优化的是“它如何进入接收链/发送链/任务系统”，不是先大动 SCOE 业务层。

## Do-not-touch-yet areas

- `Decision:` 暂不提前动 `historyAnalysis`、`highSpeedStorageStore`、`filesAPI` 这类记录/存储/工具层。
- `Evidence:` `04` 已把记录态和缓存态从运行骨架中降级。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:178-214`
- `Evidence:` 当前这些模块也更像本地记录和工具能力，而非主线运行事实。`src/stores/historyAnalysis.ts:173-229`; `src/stores/highSpeedStorageStore.ts:198-264`; `src/api/common/filesApi.ts:9-80`

- `Decision:` 暂不把 `frameTemplateStore / sendFrameInstancesStore` 升格为甲方资产域骨架。
- `Evidence:` 甲方资产语义是 `case/script/menu`，当前代码现实仍是 frame-centric。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:116-147`; `src/stores/frames/frameTemplateStore.ts:13-89`; `src/stores/frames/sendFrameInstancesStore.ts:27-137`

- `Decision:` 暂不让升级/重启/完整告警体系抢占当前主线前置位。
- `Evidence:` 这些能力不属于当前必须先跑通的任务执行闭环。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:198-218,252-272`

- `Decision:` 暂不把 `09` 的 `接入层 / 对外交付层` 二分写成正式架构前提。
- `Evidence:` 当前它仍是提案层，而非代码现实或已批准结论。`refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:79-130,147-201,224-279`

## Now vs later decisions

### 现在必须拍板

- `Decision:` 五类一级内部事实成立，且不得再由页面态、记录态、缓存态、本地任务态冒充。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:58-93,215-231`
- `Decision:` 接收主链只输出显式运行输入或领域接管输入，不拥有生命周期解释权。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:75-188`
- `Decision:` 任务系统是独立归口层，不是页面工作台、接收链或发送链延长线。`refactor/docs/03-architecture/06-任务系统归口方式.md:83-103`
- `Decision:` 本地发送执行对象不得等同 `中心任务上下文`。`refactor/docs/03-architecture/06-任务系统归口方式.md:163-180`
- `Decision:` 发送主链只做通用发送，不再吸收领域固定目标、领域反馈、领域记录。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:266-286,321-327`
- `Decision:` SCOE 维持二级领域模块定位，不拥有通用主链或统一运行骨架定义权。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:87-97,135-153`

### 应该延后

- `Deferred:` 北向边界内部是否正式拆成 `接入层 / 对外交付层`。`refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:79-130`
- `Deferred:` 心跳归 `协同可见性` 还是 `运维控制`。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:256-272`
- `Deferred:` 结果归口是否再拆“归集 / 交付”两层。`refactor/docs/03-architecture/06-任务系统归口方式.md:57-60`
- `Deferred:` 手工发送是否必须全部汇入任务系统。`refactor/docs/03-architecture/06-任务系统归口方式.md:111-114`
- `Deferred:` `case/script/menu` 与现有 `frame/instance/config` 的关系。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:116-147`; `src/stores/frames/frameTemplateStore.ts:13-89`

## Risks of premature optimization

- `Decision:` 最大风险一是把 `08/09` 的 proposal 反压成硬边界。
- `Evidence:` `08`、`09` 都把内部骨架与北向边界说得比当前代码现实更稳。`refactor/docs/03-architecture/08-功能清单与目标架构对比（第二轮）.md:11-18,43-58`; `refactor/docs/03-architecture/09-中心协同接入与对外交付边界.md:11-16,79-130`

- `Decision:` 最大风险二是把现有 `sendTasksStore` 路径直接升级成中心任务骨架。
- `Evidence:` 当前 stop/completed/delete 语义本身就不稳。`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`; `src/stores/frames/sendTasksStore.ts:401-426`

- `Decision:` 最大风险三是把 `receiveFramesStore.groups/mappings/allReceiveFrameData` 继续当事实源。
- `Evidence:` `04/05/06/07` 都在反复禁止共享状态回读定义运行事实。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:223-231`; `refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:449-453`; `refactor/docs/03-architecture/06-任务系统归口方式.md:342-349,446-460`; `refactor/docs/03-architecture/07-SCOE 的架构位置.md:231-255`

- `Decision:` 最大风险四是提前优化北向对象命名、报告对象、心跳流程。
- `Evidence:` 结果字段、报告交付方式、心跳形式都还未收稳。`后面对接所需功能清单.md:94-105,261-279,352-393,423-440`

- `Decision:` 最大风险五是把 frame-centric 资产过早等同于甲方 `case/script/menu` 资产骨架。
- `Evidence:` 当前证据只支持“本地技术资产域已存在”，不支持“甲方资产域已落在这里”。`src/stores/frames/frameTemplateStore.ts:13-89`; `src/stores/frames/sendFrameInstancesStore.ts:27-137`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-原文主题拆解.md:116-147`

## Next-step handoff

### 第三步逐功能映射应围绕的模块

- `Decision:` 第三步优先围绕以下 5 个模块簇展开：
  1. `receiveFramesStore + useSendTaskTriggerListener`
  2. `sendTasksStore + useSendTaskManager/useSendTaskExecutor/useSendTaskController + FrameSendPage.vue + taskManager.ts`
  3. `useUnifiedSender + connectionTargetsStore`
  4. `scoeStore + readFileAndSend + receiveFramesStore 内 SCOE 分流`
  5. `historyAnalysis + highSpeedStorageStore + filesAPI`
- `Inference:` 前 4 组是运行主线与领域边界热点；第 5 组不是先做交付设计，而是用来判“结果事实 vs 本地记录”。

### 第三步必须进入讨论的 5 个问题

1. `Decision:` 当前代码里最接近 `中心任务上下文 / 用例执行上下文` 的事实源分别在哪里，哪些只是 UI 态、缓存态或局部执行态？
2. `Decision:` `receiveFramesStore` 当前产出里，哪些应算“运行输入”，哪些只是显示、统计、记录副作用？
3. `Decision:` `sendTasksStore/useSendTask*` 里的哪些字段与状态还能保留为“本地执行载体”，哪些绝不能上升为中心任务事实？
4. `Decision:` 现有 `frame/instance/config` 与未来 `case/script/menu` 是上下层关系，还是两套不同资产语义？
5. `Decision:` 当前代码里“结果事实”“本地记录”“报告素材”分别落在哪些模块，SCOE 的结果又应落在哪一层？

## 结尾归类

### 本轮已收敛结论

- 五类一级内部事实成立，且不得再由页面态、记录态、缓存态、本地任务态冒充。
- 接收主链只出显式运行输入/领域接管输入，不再承担生命周期解释权。
- 任务系统是独立归口层，本地发送执行对象不得等同中心任务上下文。
- 发送主链只做通用发送，不再长期承载领域固定目标或领域反馈语义。
- SCOE 保持二级领域模块定位，不拥有通用主链或统一运行骨架定义权。
- 第三步应围绕 `receive -> task -> send -> scoe -> result/local-record` 这五个热点模块簇展开。

### 只是工作假设

- 6 个能力域足够作为当前 scoping taxonomy。
- 协同接入与状态可见性未来大概率需要位于内部骨架之外的独立边界层。
- 当前 frame-centric 资产可视为“本地技术资产域”雏形。
- 结果归口与对外交付未来大概率需要进一步分层，但本轮不冻结其内部结构。

### 必须留到第三步逐功能映射再定

- 北向边界是否正式拆成 `接入层 / 对外交付层`。
- 心跳归属与交互形式。
- `case/script/menu` 与现有 `frame/instance/config` 的关系。
- 结果归口是否再拆“归集 / 交付”两层。
- 手工发送是否必须全部纳入任务系统。
- 当前热点模块里哪些是长期骨架，哪些只是过渡性技术债。
