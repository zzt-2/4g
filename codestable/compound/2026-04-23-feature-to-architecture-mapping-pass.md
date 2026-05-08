---
doc_type: explore
type: feature-to-architecture-mapping-pass
memo_type: feature-to-architecture mapping memo
status: current
date: 2026-04-23
summary: 基于第二步 architecture scoping memo、第一步 capability-domain spike、甲方功能拆解与当前代码热点，对后续功能做 capability/module mapping、优先级排序与 per-feature gate 裁决。
tags:
  - architecture
  - feature-mapping
  - capability-domains
  - core-modules
  - task-system
  - result-delivery
  - cleanup-first
---

# Feature-to-Architecture Mapping Memo

## Scope

- 本轮只做 `feature-to-architecture mapping pass`。
- 本文不重开架构，不写实现方案，不写 spec 字段，不预建大而全抽象。
- 本文沿用第二步已确认的 6 个 capability domains 与 5 组核心热点，不把当前热点直接升格为正式架构。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:57-68,130-177,226-242`
- 本文的 gate 含义如下：
  - `cleanup-first`：方向基本清楚，但会直接压到高交叉、边界脏、返工放大器模块。
  - `brainstorm`：目标或契约面仍未收稳，下一步更适合先做 feature brainstorm，而不是直接 design。
  - `design-now`：目标清楚、落点低交叉、且不依赖核心 cleanup 先完成。
  - `defer`：现在推进会抢主线，或上游边界未定，或收益明显低于风险。
- 并行输入已纳入 `analyst` 的 `feature inventory`、`architect` 的 `touchpoint map`、`test-engineer` 的 `validation map`、`critic` 的 collision notes；最终排序与 gate 裁决仍由主 agent 统一裁定。

## Working assumptions

- 当前真正要先跑通的主线仍是：`任务进入 -> 执行推进 -> 用例结果回传 -> 任务结果/报告 -> 交付闭环`。`后面对接所需功能清单.md:109-115`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:48-55`
- 当前最危险的不是“还没想出模块名”，而是把 `receiveFramesStore`、send-task cluster、`useUnifiedSender + connectionTargetsStore`、SCOE 接入簇这几组热点误当成已经可以承接 feature design 的稳定骨架。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:38-46,132-171`
- 结果相关功能不能默认直接落到 `historyAnalysis + highSpeedStorageStore + filesAPI`，因为这组当前更像本地记录/工具层，而不是正式结果事实与交付边界。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:97-102,173-177`; `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:119-136`

## 1. Feature Inventory

| ID | Feature | Flow | Priority | Notes |
| --- | --- | --- | --- | --- |
| F01 | 固定身份源 | 协同接入 / 公共协议 | 关键 | `subSysType / subSysId / sessionId` 的稳定来源 |
| F02 | 公共消息外壳归口 | 协同接入 / 公共协议 | 关键 | `method / requestId / Response` 外壳，不含细粒度错误码 |
| F03 | 接收测试任务与上下文建立 | 任务主链 | 关键 | `taskId / sessionId / testCaseInfo / inputPars / resources` |
| F04 | 任务启动 | 任务主链 | 关键 | `immediate` 与显式启动边界都在这里收口 |
| F05 | 任务停止 / 中止控制 | 任务主链 | 关键 | 当前只明确 `stop` 必需，`abort` 语义仍待确认 |
| F06 | 统一执行状态事实 | 任务主链 / 状态可见性 | 关键 | 在线、空闲/执行中、当前用例、异常、最近结果 |
| F07 | 状态查询 / 自检投影 | 协同接入与状态可见性 | 关键 | `getSubSysState` 风格的对外状态投影 |
| F08 | 心跳保活 | 协同接入与状态可见性 / 运维控制 | 关键 | 链路监视，但归属与响应语义未冻结 |
| F09 | 用例级结果上报 | 结果主链 | 关键 | `testCaseResultReport` |
| F10 | 任务级结果汇总 | 结果主链 | 关键 | 任务完成事实、全用例汇总、任务级结果对象 |
| F11 | 结果字段 / 结果对象边界 / 运行记录 / 异常归一 | 结果主链支撑 | 支撑 | 主要是“结果事实 vs 本地记录”收口 |
| F12 | JSON 报告生成 | 结果主链 | 支撑 | `TestReport.json` |
| F13 | 报告 / 测试数据文件交付与完成通知 | 结果主链 / 文件交付 | 支撑 | `testDataFileTranslationComplete` / `fileTranslationComplete` |
| F14 | 错误 / 拒绝语义归口 | 公共协议 / 状态可见性 | 支撑 | 成功、失败、拒绝、不可执行、状态不允许 |
| F15 | 最小设备信息 / 设备列表投影 | 状态可见性支撑 | 支撑 | 只讨论“最小对外设备画像”，不等于完整设备平台 |
| F16 | 用例资产与脚本同步 | 资产管理 | 边缘 | `case/script/menu` 同步与脚本上传下载 |
| F17 | 参数协同与过程消息 | 参数与运行期信号协同 | 边缘 | 直接查配、转发、反馈、`msgReport` |
| F18 | 告警上报 | 状态可见性 / 事件外显 | 边缘 | 设备告警、子系统告警 |
| F19 | 运维控制（升级 / 重启） | 运维控制与系统可用性 | 边缘 | `softwareUpgrade` / `neControl` |
| F20 | 中心文件获取请求 | 结果 / 文件旁支 | 边缘 | `ccSysGetFileRequest`，当前仍是“暂保留” |

## 2. Feature -> Capability-Domain Map

| ID | Feature | Primary domain | Secondary domain | Basis |
| --- | --- | --- | --- | --- |
| F01 | 固定身份源 | 协同接入与状态可见性 | 公共协议 | 所有消息都要求携带 `subSysType/subSysId/sessionId`，但当前代码没有独立 northbound boundary。`后面对接所需功能清单.md:123-140`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:63-71`; `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:138-147` |
| F02 | 公共消息外壳归口 | 协同接入与状态可见性 | 公共协议 | 请求/响应一一对应，`method + Response` 是统一外壳。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:63-71` |
| F03 | 接收测试任务与上下文建立 | 任务承接与运行编排 | 参数与运行期信号协同 | 任务携带用例和参数进入执行上下文。`后面对接所需功能清单.md:42-53,144-163`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:48-73` |
| F04 | 任务启动 | 任务承接与运行编排 | 协同接入与状态可见性 | 任务接收与启动是两步。`后面对接所需功能清单.md:167-186`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:143-150` |
| F05 | 任务停止 / 中止控制 | 任务承接与运行编排 | 协同接入与状态可见性 | 控制动作与生命周期推进共属任务域。`后面对接所需功能清单.md:54-65,190-209`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:110-126` |
| F06 | 统一执行状态事实 | 任务承接与运行编排 | 协同接入与状态可见性 | 对外状态投影依赖内部统一运行事实。`后面对接所需功能清单.md:213-234`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:28-36,190-197` |
| F07 | 状态查询 / 自检投影 | 协同接入与状态可见性 | 运维控制与系统可用性 | `getSubSysState` 是对外查询面，不等于内部任务状态。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/02-设备、状态与告警.md:115-132,193-207` |
| F08 | 心跳保活 | 协同接入与状态可见性 | 运维控制与系统可用性 | 心跳被写成链路监视，但也与 `setPars.heartbeatTimer` 相连。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/07-运维控制与链路保活.md:61-80,112-128` |
| F09 | 用例级结果上报 | 结果归集与交付 | 任务承接与运行编排 | 单用例完成后主动上报。`后面对接所需功能清单.md:67-79,282-303`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:89-106,144-160` |
| F10 | 任务级结果汇总 | 结果归集与交付 | 任务承接与运行编排 | 任务级结果与任务结束事实强绑定。`后面对接所需功能清单.md:307-326`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:108-121,162-189` |
| F11 | 结果字段 / 结果对象边界 / 运行记录 / 异常归一 | 结果归集与交付 | 公共协议 | 当前最缺的是结果事实、记录态、异常语义的分层。`后面对接所需功能清单.md:94-105,423-488`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:97-102,173-177` |
| F12 | JSON 报告生成 | 结果归集与交付 | 文件交付 | `TestReport.json` 是任务级交付物。`后面对接所需功能清单.md:330-348`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:53-61`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:108-121` |
| F13 | 报告 / 测试数据文件交付与完成通知 | 结果归集与交付 | 协同接入与状态可见性 | 交付是结果主链出口，不是内部记录。`后面对接所需功能清单.md:352-369`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:44-88,125-143` |
| F14 | 错误 / 拒绝语义归口 | 协同接入与状态可见性 | 公共协议 | 错误语义是所有 northbound response 的公共外壳问题。`后面对接所需功能清单.md:373-393`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:63-71` |
| F15 | 最小设备信息 / 设备列表投影 | 协同接入与状态可见性 | 资产管理 | 只保留最小设备画像，不把它扩成完整设备平台。`后面对接所需功能清单.md:492-505`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/02-设备、状态与告警.md:47-113` |
| F16 | 用例资产与脚本同步 | 资产管理 | 任务承接与运行编排 | 文档明确资产维护不是任务执行，但资产对象含执行语义。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例资产与脚本维护.md:15-24,56-178,197-240` |
| F17 | 参数协同与过程消息 | 参数与运行期信号协同 | 任务承接与运行编排 | 文档有独立参数/转发/反馈/过程上报主题，但当前主线已明确参数跟任务走。`后面对接所需功能清单.md:30-53,513-520`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/06-参数协同与过程消息.md:15-23,53-181` |
| F18 | 告警上报 | 协同接入与状态可见性 | 运维控制与系统可用性 | 这是事件外显面，不是主线执行闭环。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/02-设备、状态与告警.md:134-164,209-223` |
| F19 | 运维控制（升级 / 重启） | 运维控制与系统可用性 | 协同接入与状态可见性 | 升级与重启是系统可用性动作。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/07-运维控制与链路保活.md:44-59,82-97,101-141` |
| F20 | 中心文件获取请求 | 结果归集与交付 | 资产管理 | 是文件旁支，不是稳定主链。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:92-109,174-179` |

## 3. Feature -> Core-Module Map

| ID | Feature | Current modules / hotspots | State surface | External collaboration surface | Mapping note |
| --- | --- | --- | --- | --- | --- |
| F01 | 固定身份源 | 当前没有稳定 northbound 模块；相邻只有 `src/api/common/index.ts`、`src-electron/preload/api/index.ts`、`src/stores/settingsStore.ts`。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:67-80,140-147` | `subSysType / subSysId / sessionId` | 所有请求 / 响应 / 通知 | 低交叉，但不能直接绑定到任务/结果对象上。 |
| F02 | 公共消息外壳归口 | 同 F01；当前只是公共 API 壳，不是业务边界。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:67-80` | `method / requestId / Response` 壳 | 所有 northbound message | 适合先做 envelope 归口，不宜顺手把错误码体系一并冻结。 |
| F03 | 接收任务与上下文建立 | send-task cluster；如果参数/信号直接落地，还会撞 `receiveFramesStore + useSendTaskTriggerListener`。`src/stores/frames/sendTasksStore.ts:145-185,533-562`; `src/stores/frames/receiveFramesStore.ts:1186-1228`; `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183` | `taskId / sessionId / currentCase / inputPars / resources` | `setTestTask` | 当前最危险的误映射是把中心任务直接压成现有 send task。 |
| F04 | 任务启动 | send-task cluster + `useUnifiedSender + connectionTargetsStore`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-518,658-976`; `src/composables/frames/sendFrame/useUnifiedSender.ts:69-177`; `src/stores/connectionTargetsStore.ts:172-197` | `waiting -> running -> currentCase` | `immediate`、`startTestCaseList` | 启动不是单纯按钮动作，而是任务状态机与发送落地共同变更。 |
| F05 | 任务停止 / 中止控制 | send-task cluster，尤其 `useSendTaskController.ts` 与 `sendTasksStore.ts`。`src/composables/frames/sendFrame/useSendTaskController.ts:23-65,159-166`; `src/stores/frames/sendTasksStore.ts:401-426` | `running / paused / waiting-* -> stop/abort` | `controlTestTask` | 当前 `stopTask -> completed -> removeTask`，说明控制语义和任务闭环还混在一起。 |
| F06 | 统一执行状态事实 | `receiveFramesStore + useSendTaskTriggerListener` 与 send-task cluster 共同争夺事实源。`src/stores/frames/receiveFramesStore.ts:1015-1139,1186-1228`; `src/stores/frames/sendTasksStore.ts:145-185`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:132-165` | 在线、当前任务、当前用例、异常、最近结果 | 状态查询、心跳、拒绝语义、结果闭环都依赖它 | 这是最该先清的“事实源”问题，不是一个纯对外 feature。 |
| F07 | 状态查询 / 自检投影 | 直接模块落点尚无；依赖 F06 的统一状态事实。相邻只有 app shell / settings / local status。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:138-147` | `status + data(stepName/deviceId/keyPars/msg)` | `getSubSysState` | 外部契约面未稳，且不能直接从现有页面态拼装。 |
| F08 | 心跳保活 | 直接模块落点尚无；与 F06 状态事实共享投影源，且与参数体系相连。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/07-运维控制与链路保活.md:61-80,112-128` | 在线性、最小状态、timer | `heartbeat` | 归属与有无响应都未定，不能直接借当前本地定时器语义下结论。 |
| F09 | 用例级结果上报 | send-task cluster + `receiveFramesStore` 输入边界；结果侧又必须避免直接落到 `historyAnalysis/highSpeedStorageStore/filesAPI`。`src/stores/frames/receiveFramesStore.ts:1015-1139`; `src/stores/frames/sendTasksStore.ts:401-426`; `src/stores/historyAnalysis.ts:173-229`; `src/api/common/filesApi.ts:9-80` | `taskId / testCaseId / loopIndex / result / msg` | `testCaseResultReport` | 结果事实先要从本地执行态里剥出来。 |
| F10 | 任务级结果汇总 | send-task cluster + `historyAnalysis/highSpeedStorageStore/filesAPI` 边界。`src/stores/sendTasksStore` 无独立任务留痕；`historyAnalysis` 只是本地分析。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:119-136` | 任务开始/结束、全用例结果、整体 result/msg | `TestReport` 任务级部分 | 这是“任务事实”和“本地记录”的第一处正面碰撞点。 |
| F11 | 结果字段 / 结果对象边界 / 运行记录 / 异常归一 | 当前只有 `historyAnalysis`、`highSpeedStorageStore`、`filesAPI` 这类工具邻接面。`src/stores/historyAnalysis.ts:173-229`; `src/api/common/filesApi.ts:9-80` | 结果字段、日志字段、异常字段的归属 | 所有结果消息与报告 | 必须先定“结果事实 vs 本地记录 vs 诊断材料”，否则报告和回执都容易混写。 |
| F12 | JSON 报告生成 | 当前没有正式报告模块，只看到本地文件工具和本地记录工具。`src/api/common/filesApi.ts:9-80`; `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:123-136` | `task-level + case-level + detail-level` | `TestReport.json` | 适合作为结果边界清楚之后的交付对象，不适合先反推内部事实。 |
| F13 | 报告 / 测试数据文件交付与完成通知 | `filesAPI` 是本地工具，northbound 交付层尚无。与 F12、F14 共享外部契约面。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:44-88,125-143,220-232` | `fileType / filePath / result / msg` | `testDataFileTranslationComplete` / `fileTranslationComplete` / FTP | “文件传完”不等于“业务受理成功”，当前不能直接落到本地文件 API。 |
| F14 | 错误 / 拒绝语义归口 | 需要同时触达任务、状态、结果三块外显面；当前没有专门 northbound rejection layer。`后面对接所需功能清单.md:373-393`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:120-126` | `statusCode / msg / handleCode` | 所有请求响应 | 它共享 F06/F07/F08/F09/F10 的状态与结果事实，不能孤立设计。 |
| F15 | 最小设备信息 / 设备列表投影 | 当前没有设备 northbound domain；相邻只有 settings/local capability。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:140-147` | `deviceId / type / status / swVer` 最小集 | `getDeviceList` / `getDeviceInfo` / `deviceInfoReport` | 最小设备画像可以讨论，但不应直接膨胀成完整设备平台。 |
| F16 | 用例资产与脚本同步 | 当前代码落点仍是 frame-centric：`frameTemplateStore`、`sendFrameInstancesStore`、`filesAPI`。`src/stores/frames/frameTemplateStore.ts:13-89`; `src/stores/frames/sendFrameInstancesStore.ts:27-137`; `src/api/common/filesApi.ts:9-80` | `case/script/menu/inputPars/checkPoints` | `getTestCaseAll`、脚本上传下载、增删改菜单/用例 | 它看似资产 CRUD，实际上会倒逼任务与报告边界。 |
| F17 | 参数协同与过程消息 | `receiveFramesStore + useSendTaskTriggerListener`；若带 SCOE 参数注入，还会撞 `readFileAndSend`。`src/stores/frames/receiveFramesStore.ts:1058-1139,1186-1228`; `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`; `src/composables/scoe/commands/readFileAndSend.ts:41-117` | 参数值、trigger input、relationId、过程消息 | `getPars / setPars / *Forward / parsSetFeedback / msgReport` | 这是“参数协同”与“任务推进输入”共用同一热点的典型例子。 |
| F18 | 告警上报 | 直接模块落点尚无；不应默认混到 F07 状态查询。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/02-设备、状态与告警.md:134-164,209-223` | 设备 / 子系统告警事件 | `deviceAlarmReport` / `subSysAlarmReport` | 当前先保留边界位，不进入主线。 |
| F19 | 运维控制（升级 / 重启） | 直接模块落点尚无；只看到网络连接、beforeunload、SCOE 常开状态更新等局部能力。`src/boot/taskManager.ts:17-48`; `src/stores/scoeStore.ts:293-341` | `neType / optType / ftpInfo` | `softwareUpgrade` / `neControl` | 不应抢主线前置位。 |
| F20 | 中心文件获取请求 | `filesAPI` 邻接，但主链稳定性不足；文档自身也写“暂保留”。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:92-109,174-179` | 任务级 / 用例级文件请求上下文 | `ccSysGetFileRequest` | 现在讨论它会抢占结果与资产主线。 |

## 4. Shared Hotspots and Collision Points

### C1. 任务主链 x 参数协同 / 过程消息

- `Evidence:` 文档把 `04-任务主链` 和 `06-参数协同与过程消息` 分成两组，但功能清单已明确当前入口不是独立参数平台，而是“任务进来，参数跟着任务里的用例进来”。`后面对接所需功能清单.md:30-53`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/06-参数协同与过程消息.md:15-23`
- `Evidence:` 代码里参数/信号直接压在 `receiveFramesStore -> sendTasksStore.handleFrameReceived -> useSendTaskTriggerListener` 这条链上。`src/stores/frames/receiveFramesStore.ts:1186-1228`; `src/stores/frames/sendTasksStore.ts:553-562`; `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
- `Inference:` 看起来是“参数协同”功能，实际会改任务推进入口与 trigger-input boundary。
- `Gate impact:` F03/F04/F05/F17 不能直接 design；默认先走 `cleanup-first`。

### C2. 任务主链 x SCOE 接入

- `Evidence:` `receiveFramesStore` 对 `scoe-tcp-server` 做前置分流；`readFileAndSend` 直接复用 `useSendTaskManager/createTimedTask/startTask`；SCOE 发送又走统一发送与同一 send-task cluster。`src/stores/frames/receiveFramesStore.ts:1015-1021`; `src/composables/scoe/commands/readFileAndSend.ts:118-157`; `src/stores/scoeStore.ts:276-311`
- `Inference:` SCOE 虽然是二级领域模块，但现在直接抢占任务与发送骨架。
- `Gate impact:` 任何 SCOE 相关 case 若要并入主线，先下调到 `cleanup-first`。

### C3. 北向任务执行 x 本地 / 手工发送工作台 x SCOE 发送

- `Evidence:` 文档上这三者看似是不同语义；代码里它们共享 send-task cluster 与 `useUnifiedSender + connectionTargetsStore`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-976`; `src/composables/frames/sendFrame/useUnifiedSender.ts:101-160`; `src/stores/connectionTargetsStore.ts:172-197`
- `Evidence:` 当前 `completed -> removeTask`，`stopTask -> completed`。`src/stores/frames/sendTasksStore.ts:401-426`; `src/composables/frames/sendFrame/useSendTaskController.ts:23-57`
- `Inference:` 本地执行态正在冒充正式任务生命周期。
- `Gate impact:` F03/F04/F05/F06 必须先清 send-task cluster。

### C4. 用例资产 / 脚本维护 x 任务执行编排

- `Evidence:` 文档明确资产维护不是任务执行。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例资产与脚本维护.md:15-24`
- `Evidence:` 但资产对象里已含 `inputPars / execSteps / checkPoints / preHandle / afterHandle` 等执行语义。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例资产与脚本维护.md:66-74,197-240`
- `Evidence:` 当前代码落点却是 frame-centric，而不是 case-centric。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:102-117`
- `Inference:` 一旦提前拍资产模型，就会反向定义任务与报告对象，不是纯 CRUD 设计。
- `Gate impact:` F16 当前 gate 维持 `defer`；若被提前拉起，先走 `brainstorm`，不能直接 design。

### C5. 结果 / 文件 / 报告回传 x 本地记录 / 历史 / 高速存储

- `Evidence:` 对外交付出口是 `testCaseResultReport`、文件完成通知、`TestReport.json`。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:44-121,125-232`
- `Evidence:` 当前代码里结果邻接面几乎都只是本地记录工具：`historyAnalysis`、`highSpeedStorageStore`、`filesAPI`。`src/stores/historyAnalysis.ts:173-229`; `src/api/common/filesApi.ts:9-80`
- `Inference:` 现在若直接开结果 / 报告设计，最容易把本地记录误当成北向结果事实。
- `Gate impact:` F09/F10 先 `cleanup-first`；F11/F12/F13 先 `brainstorm`。

## 5. Priority Order

1. `Batch A cleanup`：`receiveFramesStore + useSendTaskTriggerListener`
   - 先把“运行输入 / trigger input / SCOE 入口 / 显示副作用”拆读清楚。
2. `Batch B cleanup`：send-task cluster
   - `sendTasksStore + useSendTaskManager/useSendTaskExecutor/useSendTaskController + FrameSendPage.vue + taskManager.ts`
   - 先把“本地执行载体 vs 中心任务事实”拆清。
3. `Batch C cleanup`：`useUnifiedSender + connectionTargetsStore`
   - 先把“通用发送落地 vs 领域特判”收窄。
4. `First design lane after cleanup`：F03/F04/F05/F06
   - 任务接收、启动、停止、统一执行状态事实。
5. `Second design lane after cleanup`：F09/F10
   - 用例级结果上报、任务级结果汇总。
6. `Parallel low-cross design lane`：F01/F02
   - 固定身份源、公共消息外壳归口。
7. `Parallel brainstorm lane`：F07/F08/F11/F12/F13/F14/F15
   - 状态查询、心跳、结果字段/报告/交付、错误语义、最小设备信息。
8. `Defer lane`：F16/F17/F18/F19/F20
   - 资产、参数、告警、运维、中心文件获取请求。

## 6. Per-Feature Next Gate

| ID | Feature | Evidence | Inference | Gate decision |
| --- | --- | --- | --- | --- |
| F01 | 固定身份源 | 所有消息都要带 `subSysType/subSysId/sessionId`，且当前代码没有稳定来源。`后面对接所需功能清单.md:123-140`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:63-71` | 只要限定为“身份源归口”，它不必先压到核心热点。 | `design-now` |
| F02 | 公共消息外壳归口 | `method + Response`、`requestId`、`sessionId` 已是统一规则。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:63-71` | 只做 envelope 归口时低交叉；不要把错误码体系一起锁死。 | `design-now` |
| F03 | 接收测试任务与上下文建立 | 任务是入口，且当前代码最接近任务的只有本地 send-task。`后面对接所需功能清单.md:144-163`; `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:82-100` | 如果直接 design，几乎必然会把中心任务对象压到本地 send-task 或 trigger-input 链上。 | `cleanup-first` |
| F04 | 任务启动 | 接收与启动是两步；启动又会落到 send-task cluster 与统一发送路径。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:75-91,143-150`; `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-976` | 先清 send-task lifecycle 再做 feature design。 | `cleanup-first` |
| F05 | 任务停止 / 中止控制 | 当前 `stopTask -> completed`，`completed -> removeTask`。`src/composables/frames/sendFrame/useSendTaskController.ts:23-57`; `src/stores/frames/sendTasksStore.ts:401-426` | 当前停止语义会直接污染任务闭环与结果时机。 | `cleanup-first` |
| F06 | 统一执行状态事实 | 现在最容易被页面态、本地任务态、接收副作用冒充。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:28-36,190-197` | 这是所有状态查询、心跳、拒绝语义、结果闭环的上游事实。 | `cleanup-first` |
| F07 | 状态查询 / 自检投影 | `getSubSysState` 的 `status`、`data` 明细结构都还未收稳。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/02-设备、状态与告警.md:115-132`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-甲方沟通拆解.md:97-100` | 契约面比实现更先卡住，且依赖 F06 清理后的状态事实。 | `brainstorm` |
| F08 | 心跳保活 | 文档内部对“是否有响应”自相矛盾，且周期与 `setPars` 相连。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/07-运维控制与链路保活.md:73-80,112-128`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-甲方沟通拆解.md:65-78` | 目标清楚，但交互方式、归属、超时口径都没定。 | `brainstorm` |
| F09 | 用例级结果上报 | 单用例结果上报是已确认主线；当前却没有稳定的结果事实边界。`后面对接所需功能清单.md:282-303`; `easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:119-136` | 先清任务事实与结果事实，再开 design。 | `cleanup-first` |
| F10 | 任务级结果汇总 | 任务级结果必须汇总所有用例，但当前任务事实与本地记录没有分层。`后面对接所需功能清单.md:307-326`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:97-102,173-177` | 如果直接 design，最容易把任务汇总绑在错误的本地记录面上。 | `cleanup-first` |
| F11 | 结果字段 / 结果对象边界 / 运行记录 / 异常归一 | 功能清单明确“结果字段还没确认”；同时当前结果邻接模块更像本地记录。`后面对接所需功能清单.md:94-105,423-488`; `src/stores/historyAnalysis.ts:173-229` | 这是典型的“目标清楚，结果对象边界未清”的 brainstorm 题。 | `brainstorm` |
| F12 | JSON 报告生成 | `TestReport.json` 是交付物，但报告内容层次和字段还未冻结。`后面对接所需功能清单.md:330-348`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:108-121,162-189` | 不宜用当前本地记录结构直接反推报告对象。 | `brainstorm` |
| F13 | 报告 / 测试数据文件交付与完成通知 | 报告交付方式、文件完成与业务受理边界未定。`后面对接所需功能清单.md:352-369`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-甲方沟通拆解.md:122-124` | 适合先把交付链和受理判定讲清，再进入 design。 | `brainstorm` |
| F14 | 错误 / 拒绝语义归口 | 当前只有粗粒度 `statusCode=1/2` 与局部 `handleCode`，远不够支撑拒绝/不可执行/超时差异。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:120-126`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-甲方沟通拆解.md:43-57,147-155` | 这是契约问题，不应在当前热点上顺手拍板。 | `brainstorm` |
| F15 | 最小设备信息 / 设备列表投影 | 功能清单只说“最好提前想清楚最小设备信息”，并明确这不等于完整设备管理。`后面对接所需功能清单.md:492-505` | 可以先 brainstorm 最小画像；完整设备对象链当前不应抢主线。 | `brainstorm` |
| F16 | 用例资产与脚本同步 | 资产维护不是主线；而且 `case/script/menu` 与现有 `frame/instance/config` 的关系未定。`后面对接所需功能清单.md:522-536`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:77-83,199-205` | 现在推进会抢主线。若有人坚持推进，先做 brainstorm，而不是 design。 | `defer` |
| F17 | 参数协同与过程消息 | 当前明确参数跟任务走，不应把独立参数接口当第一优先级；同时它又共享 `receiveFramesStore + useSendTaskTriggerListener` 热点。`后面对接所需功能清单.md:30-53,513-542`; `src/stores/frames/receiveFramesStore.ts:1186-1228` | 主线未清时推进它，只会放大任务入口与 trigger 边界返工。 | `defer` |
| F18 | 告警上报 | 文档有设备 / 子系统告警，但 scoping 已明确完整告警体系不该抢主线。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/02-设备、状态与告警.md:134-164`; `easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:182-183` | 先保留边界位即可。 | `defer` |
| F19 | 运维控制（升级 / 重启） | 功能清单已明确升级/重启不属于当前主线。`后面对接所需功能清单.md:544-546`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/07-运维控制与链路保活.md:44-59,82-97` | 推进收益低于对主线的干扰。 | `defer` |
| F20 | 中心文件获取请求 | 文档自身写“是否有需求场景待定，暂保留”。`refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:92-109,174-179` | 现在讨论它会抢结果主链和资产主线的位置。 | `defer` |

## 7. Cleanup-First Batch Candidates

- `F03 接收测试任务与上下文建立`
- `F04 任务启动`
- `F05 任务停止 / 中止控制`
- `F06 统一执行状态事实`
- `F09 用例级结果上报`
- `F10 任务级结果汇总`

补充说明：

- `F17 参数协同与过程消息` 当前 gate 是 `defer`；但如果后续主线 case 明确依赖 runtime trigger / signal forwarding，它会直接从 `defer` 下调到 `cleanup-first`，而不是先 design。
- `F11/F12/F13` 不列入 `cleanup-first` 批次，不是因为它们低风险，而是因为它们的首要阻塞更偏契约 / 对象边界，应先 `brainstorm`。

## 8. What Can Enter Brainstorm

以下功能适合进入 `.agent/skills/easysdd-feature-brainstorm/SKILL.md`：

- `F07 状态查询 / 自检投影`
- `F08 心跳保活`
- `F11 结果字段 / 结果对象边界 / 运行记录 / 异常归一`
- `F12 JSON 报告生成`
- `F13 报告 / 测试数据文件交付与完成通知`
- `F14 错误 / 拒绝语义归口`
- `F15 最小设备信息 / 设备列表投影`

备注：

- `F16 用例资产与脚本同步` 当前总 gate 仍是 `defer`；若有人要提前推进，下一步也必须先走 brainstorm，而不是 design。

## 9. What Can Enter Design Now

- `F01 固定身份源`
- `F02 公共消息外壳归口`

边界说明：

- `F01` 只适合讨论“身份源归口”，不适合顺手绑定任务态、结果态或设备全模型。
- `F02` 只适合讨论 envelope 归口，不适合一并冻结 `F14` 的错误 / 拒绝语义。

## 10. What Must Defer

- `F16 用例资产与脚本同步`
- `F17 参数协同与过程消息`
- `F18 告警上报`
- `F19 运维控制（升级 / 重启）`
- `F20 中心文件获取请求`

## 11. Recommended First Cleanup Batch

### Batch 1A: trigger-input boundary

- `src/stores/frames/receiveFramesStore.ts`
- `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`

`Evidence:`

- `receiveFramesStore` 同时承担队列、SCOE 分流、解析结果更新、表达式、统计、触发检查，并把 `DataItem[]` 推给 `sendTasksStore`。`src/stores/frames/receiveFramesStore.ts:852-891,1015-1139,1186-1228`
- `useSendTaskTriggerListener` 反向读取 `receiveFramesStore.mappings` 做 trigger 条件解释。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`

`Inference:`

- 这是“接收事实 vs trigger input vs 领域入口”最脏的交界面；不先清，F03/F04/F06/F17 的 mapping 都会偏。

### Batch 1B: task-lifecycle boundary

- `src/stores/frames/sendTasksStore.ts`
- `src/composables/frames/sendFrame/useSendTaskManager.ts`
- `src/composables/frames/sendFrame/useSendTaskExecutor.ts`
- `src/composables/frames/sendFrame/useSendTaskController.ts`
- `src/pages/FrameSendPage.vue`
- `src/boot/taskManager.ts`

`Evidence:`

- 这组共同持有任务创建、启动、等待触发、等待调度、停止、页面入口和 unload 清理。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:40-46,138-165`
- `completed -> removeTask`，`stopTask -> completed`。`src/stores/frames/sendTasksStore.ts:401-426`; `src/composables/frames/sendFrame/useSendTaskController.ts:23-57`

`Inference:`

- 这里必须先把“本地执行载体”和“中心任务事实”拆开，否则 F03/F04/F05/F06/F09/F10 都会被本地工作台语义绑死。

### Batch 1C: send-routing boundary

- `src/composables/frames/sendFrame/useUnifiedSender.ts`
- `src/stores/connectionTargetsStore.ts`

`Evidence:`

- 所有发送最终都收敛到统一目标解析与 serial/network 落地；SCOE 仍有特判。`src/composables/frames/sendFrame/useUnifiedSender.ts:101-160`; `src/stores/connectionTargetsStore.ts:172-197`

`Inference:`

- 不先收窄通用发送边界，F04/F09/F10 乃至未来任何 northbound task-driven send 都会被领域规则反侵。

### Batch 1D: SCOE 接入簇（紧随其后，不抢 1A/1B/1C 的第一位）

- `src/stores/scoeStore.ts`
- `src/composables/scoe/commands/readFileAndSend.ts`
- `src/stores/frames/receiveFramesStore.ts` 内 `scoe-tcp-server` 分流

`Evidence:`

- SCOE 直接占接收入口、统一发送、发送任务复用三处。`src/stores/scoeStore.ts:216-341`; `src/composables/scoe/commands/readFileAndSend.ts:118-157`; `src/stores/frames/receiveFramesStore.ts:1015-1019`

`Inference:`

- 如果选定的第一批 case 明确带 SCOE，这组应立即插入 cleanup-first；否则放在 Batch 1 之后即可。

### Not first-cleanup, but must stay under observation

- `src/stores/historyAnalysis.ts`
- `src/stores/highSpeedStorageStore.ts`
- `src/api/common/filesApi.ts`

`Reason:`

- 这组当前更适合作为“结果事实 vs 本地记录”判断面，而不是第一批动手清的主模块。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:173-177`

## 12. Next-Step Handoff

1. 先开一个只针对 `Batch 1A + Batch 1B + Batch 1C` 的 cleanup scoping memo。
   - 目标不是写代码，而是把 `trigger-input boundary`、`task-lifecycle boundary`、`send-routing boundary` 的清理边界定住。
2. 并行开 `brainstorm`：
   - `F07/F08` 一组：状态查询 / 心跳
   - `F11/F12/F13` 一组：结果字段 / 报告 / 交付
   - `F14/F15` 一组：错误语义 / 最小设备画像
3. 只有当 `Batch 1A + 1B` 清理边界收口后，再让 `F03/F04/F05/F06` 进入 feature design。
4. 只有当“结果事实 vs 本地记录”边界收口后，再让 `F09/F10` 进入 feature design。
5. `F16/F17/F18/F19/F20` 保持冻结，不抢当前主线。

## Final Cut Lists

### 第一批最该先清的核心模块名单

- `src/stores/frames/receiveFramesStore.ts`
- `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`
- `src/stores/frames/sendTasksStore.ts`
- `src/composables/frames/sendFrame/useSendTaskManager.ts`
- `src/composables/frames/sendFrame/useSendTaskExecutor.ts`
- `src/composables/frames/sendFrame/useSendTaskController.ts`
- `src/pages/FrameSendPage.vue`
- `src/boot/taskManager.ts`
- `src/composables/frames/sendFrame/useUnifiedSender.ts`
- `src/stores/connectionTargetsStore.ts`

SCOE 补位名单（若首批 case 明确压到 SCOE）：

- `src/stores/scoeStore.ts`
- `src/composables/scoe/commands/readFileAndSend.ts`
- `src/stores/frames/receiveFramesStore.ts` 内 `scoe-tcp-server` 分流

### 第一批不该直接进 design 的功能名单

- `F03 接收测试任务与上下文建立`
- `F04 任务启动`
- `F05 任务停止 / 中止控制`
- `F06 统一执行状态事实`
- `F07 状态查询 / 自检投影`
- `F08 心跳保活`
- `F09 用例级结果上报`
- `F10 任务级结果汇总`
- `F11 结果字段 / 结果对象边界 / 运行记录 / 异常归一`
- `F12 JSON 报告生成`
- `F13 报告 / 测试数据文件交付与完成通知`
- `F14 错误 / 拒绝语义归口`
- `F15 最小设备信息 / 设备列表投影`

### 第一批适合进入 `.agent/skills/easysdd-feature-brainstorm/SKILL.md` 的功能名单

- `F07 状态查询 / 自检投影`
- `F08 心跳保活`
- `F11 结果字段 / 结果对象边界 / 运行记录 / 异常归一`
- `F12 JSON 报告生成`
- `F13 报告 / 测试数据文件交付与完成通知`
- `F14 错误 / 拒绝语义归口`
- `F15 最小设备信息 / 设备列表投影`

### 第一批真的可以直接进 design 的功能名单

- `F01 固定身份源`
- `F02 公共消息外壳归口`

### 如果用户倾向于更保守、更多清理，哪些功能应从 `design-now` 下调到 `cleanup-first`

- `F01 固定身份源`
  - 下调条件：如果设计范围不再只是“身份源归口”，而是要把身份字段直接绑定到当前页面态、任务态或结果态。
- `F02 公共消息外壳归口`
  - 下调条件：如果设计范围不再只是 envelope，而是要顺手把 `F14` 错误 / 拒绝语义、状态查询、结果回执字段一起冻结。

保守口径下的结论：

- `design-now` 会缩到零或只剩 F01/F02 的 very-thin boundary 版本。
- 主线应先做 `Batch 1A + 1B + 1C` cleanup，再回头讨论任何任务 / 状态 / 结果 feature design。
