# [S001] 甲方对接闭环讨论

> 2026-05-18 | 讨论 | 已完成
> 2026-05-19 续接 — 甲方回复确认

## 目标

基于甲方 V1.0.1 接口文档（31 个接口），逐段分析"甲方控制我们任务、我们回传结果"链路是否闭环，识别断点，拍板决策，为后续 northbound feature 设计做准备。本对话只讨论不实施。

## 记录

### 一、甲方文档拆分

甲方原始文档 7455 行 / 31 接口，由子 agent 拆分为 11 个文件，存放在 `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`：

| 文件 | 接口数 | 核心接口 |
|------|--------|---------|
| 00-index.md | — | 全接口索引、方向标记、TBD 清单 |
| 01-概述与约定.md | — | 文档元信息、消息约定 |
| 02-设备管理.md | 5 | getDeviceList, deviceInfoReport, getDeviceInfo, setDeviceInfo, getSubSysState |
| 03-用例管理.md | 7 | getTestCaseAll, testCaseFileUpload, modifyTestCaseFile, testCaseFileDownload, addTestCaseMenu, addTestCase, deleteTestCase |
| 04-任务管理.md | 3 | **setTestTask**, ccSysGetFileRequest, **controlTestTask** |
| 05-文件传输与结果上报.md | 3 | testDataFileTranslationComplete, fileTranslationComplete, **testCaseResultReport** |
| 06-告警上报.md | 2 | deviceAlarmReport, subSysAlarmReport |
| 07-参数配置与查询.md | 4 | testCaseGetParsForward, testCaseSetParsForward, getPars, setPars |
| 08-系统维护.md | 4 | softwareUpgrade, **heartbeat**, neControl, parsSetFeedback |
| 09-数据转发与实时上报.md | 3 | dataTransmit, **msgReport**, sigReport |
| 10-附录.md | — | 模板、编码表 |

4 个核心接口完整保留请求/响应参数表和示例。

### 二、我方系统文档调查

并行派 3 个子 agent 读取：

**Agent A — 我方 northbound 系统文档（6 份）：**

1. **northbound-overlap-and-gap-map.md**（2026-04-28）
   - 基于**旧甲方文档**写的 gap 分析
   - 5 条危险等价红线仍有效：旧 send task ≠ setTestTask、旧 history/CSV ≠ TestReport、串口 target ≠ deviceId 等
   - 后面对接最小闭环：任务接收、启动、停止、状态、用例结果、JSON 报告、报告交付

2. **outbound-routing-and-response-decisions.md**（2026-05-06）
   - D2: Northbound 任务 targetId 优先从请求 deviceId 经 deviceTargetMap 映射，兜底用 defaultTargetId
   - 三条出站路径统一模型：入站触发 → 翻译 → TaskDefinition → taskService.startTask
   - 多个未决项（X1-X6）：回报遥测、确认帧遥测、多任务协调、SCOE 任务可见性等

3. **boundary-northbound-collaboration-delivery.md**
   - 北向边界分两层：**接入层**（承接外部请求）和**交付层**（投影+交付）
   - 接入层四类入口：任务接入、控制、查询、保活
   - 7 种对外视图从 5 个内部骨架对象投影而来
   - 外部协同对象 ≠ 内部骨架对象，投影对象不反向定义内部对象

4. **command-ingress-design.md**
   - 当前对接 SCOE 串口协议：TransportEventConsumer 链 + ProtocolAdapter + 6 种 Handler
   - SEND_FRAME 和 READ_FILE_AND_SEND 翻译为 TaskDefinition
   - P5 预留了 NorthboundProtocolAdapter stub（canHandle 返回 false）

5. **result-report-brainstorm.md**（修正后 MVP）
   - 原始 design 评估为过度设计，大幅简化
   - MVP 4 件事：runtime 编排 task 终态传 result → judgeCaseVerdict 纯函数 → 内存 state map → 只读 selector
   - 不需要 task feature 做改动，用已有的 onSettled + getInstance

6. **rewrite-result-design.md**（原始完整版，作扩展参考）
   - result/report/delivery 三段分离
   - CaseResult / TaskResultSummary / ResultAggregationRule 等完整体系
   - MVP 不按此实施，保留为扩展参考

**综合结论：我方 northbound 能力"完整但不均匀"。** 架构边界定义完整、SCOE 入站设计就绪、出站路由已解决、结果归口有 MVP 方案。**最大缺口是 northbound feature 自身**——没有 HTTP server、没有 FTP、没有甲方请求翻译器、没有出站回报构造器。

**Agent B — 任务系统代码：**

- TaskDefinition：id, name, steps(send/wait-condition/delay), schedule(ScheduleDriver: immediate/timer/event), stopCondition, fieldVariations, errorPolicy
- TaskService：createTask, startTask, pauseTask, resumeTask, stopTask, removeTask, retryTask, updateTask, stopAll, onSettled
- 生命周期：created → running → paused/stopped/completed/failed
- step 完成后记录 TaskStepResult（多态：send/wait-condition/delay），实时写入 stepResults
- onSettled 是 Promise resolve 机制（非事件）
- 当前代码仍部分用旧类型体系（TaskSchedulingMode），design 文档的 ScheduleDriver discriminated union 是 Phase 2 目标

**Agent C — 甲方 4 个核心接口详细规格：**

完整的字段级记录见拆分文档 04/05/09。关键结构：

**setTestTask 请求：**
- executionPlan.layers[].layer/parallel/nodes — 层级串并行模型
- testCaseInfo[].testCaseId/deviceIds/inputPars — 用例信息+入参
- immediate, repeatCount, isEnd — 控制字段
- resources, ftpInfo — 资源和 FTP 配置

**testCaseResultReport 请求：**
- taskId, testCaseId, loopIndex, result(success/fail/tbd), msg

**msgReport 请求：**
- taskId, testCaseId, stepInfo[](id/name/result/msg/msgTime) — 批量步骤

**甲方测试报告 JSON 格式（testDataFileTranslationComplete 上传的报告文件）：**
- 顶层：subSysType/subSysId/sessionId/taskId/startTime/endTime/result/msg
- testCaseList[]: testCaseId/resources/deviceIds/startTime/endTime/checkPoints[]/statisticsItems[]/attachItems[]/result/msg/processAndDatas[]/testParsInfo[]
- checkPoints: checkPoint/expectValue/testValue/result/msg
- processAndDatas: stepName/initPars/setPars/resultDatas/startTime/endTime

### 三、Q1 任务闭环分析

逐段检查甲方 → 我们 → 甲方的闭环：

#### 3.1 getTestCaseAll（甲方查我们有什么用例）

甲方带 ftpInfo 查询，我们上传 JSON 到 FTP。JSON 格式是树形菜单+用例列表，含 id/name/isParent/inputPars/checkPoints 等。

**断点：我们没有"用例"实体。** 后续决策：testCase = task，帧列表直接转换为甲方格式。

#### 3.2 setTestTask（甲方下发任务）

翻译需求逐字段分析：

| 甲方字段 | 翻译目标 | 状态 |
|---------|---------|------|
| executionPlan.layers[].nodes[] | task 实例序列 | 需翻译（后确认：每 node = 一个 task） |
| testCaseInfo[].inputPars | frame field values | 需映射（parId → fieldId） |
| repeatCount | stopCondition.maxIterations | 直接映射 |
| immediate=true | createTask + startTask | 直接映射 |
| isEnd=true | 一次下发 | 直接映射（已确认） |
| resources/orbitInfo | 存着不处理 | 透传 |

**初始断点：executionPlan 层级并行模型。** TaskDefinition.steps 是平铺列表。后确认：testCase=task，并行=多 task 实例同时 startTask，不需要 step 级并行。

#### 3.3 controlTestTask（甲方控制任务）

| 甲方 action | 我们 API | 映射 |
|------------|---------|------|
| abort | stopTask() | 直接 |
| pause | pauseTask() | 直接 |
| continue | resumeTask() | 直接 |
| stop | stopTask() | 直接 |

**这段通了。** 需要 taskId↔instanceId 映射表。

#### 3.4 msgReport（步骤进度上报）

甲方期望实时上报 stepInfo[]，含 id/name/result/msg/msgTime。

**断点：** task 执行 step 完成后只写内部状态（addStepResult），没有外部事件/回调。需要：
- step 完成事件 hook（代码改动）
- step 名称映射（stepIndex → 名称）
- msgReport 构造 + HTTPS POST

#### 3.5 testCaseResultReport（用例结果上报）

甲方期望每个用例完成后上报 result(success/fail/tbd) + loopIndex。

我们 result MVP：judgeCaseVerdict → passed/failed/stopped。

映射：passed→success, failed→fail, stopped→tbd。judgeCaseVerdict 已返回 stopped，直接映射。

**初始断点："用例级" verdict。** 后确认：testCase=task，task 级 verdict 直接映射，不需要额外层。

**verdict 判定依据的确认过程：**
- 初始分析时提出：一个帧发出去，success/fail 由什么决定？
- 用户确认：**发帧 + 检测接收参数**。task 典型 steps = send step + wait-condition step
- wait-condition matched → success, timeout/不匹配 → fail, task 被 stop → tbd
- 这直接使用 task 已有的 ConditionTerm 机制，不需要额外层

#### 3.6 测试数据文件交付（testDataFileTranslationComplete）

**完全缺失：** 无文件生成、无 FTP、无通知。决策：**不做，不告诉甲方。**

#### 3.7 测试报告

甲方期望详细 JSON 报告（checkPoints 有 expectValue/testValue/result、statisticsItems、processAndDatas 等）。

**缺失：** report 只有 placeholder。决策：**MVP 糊弄版，只填 result+时间+基本用例列表，不填详细 checkPoints。不告诉甲方。**

### 四、Q2 HTTPS 服务放哪里

**结论：main process 放 HTTP server，renderer 处理业务逻辑，通过 IPC bridge 通信。**

理由：
- main process 负责"平台资源访问"（网络监听是平台能力）——CLAUDE.md 允许
- 请求翻译、协议语义在 renderer —— CLAUDE.md 禁止 main 承载业务规则
- 与 serialport/TCP 同一模式：main 管传输层，renderer 管语义层

架构切分：
```
甲方 HTTPS POST → main process (HTTPS server + TLS)
    → IPC bridge 传 request body 到 renderer
    → renderer：解析、翻译、调用 task/result service
    → 返回响应给 main → 回给甲方
```

库选择：Fastify（轻量+TypeScript 友好）或 Express，用户说随便。

需要用户决策（待定）：自签名证书？双向 TLS？并发上限？

### 五、Q3 翻译层的形状

**结论：northbound feature 内的独立模块。**

- 不是 shared/（涉及外部 schema 知识，不是纯工具函数）
- 不是 command-ingress 的一部分（两个不同外部系统）
- 双向独立：inbound-translator（甲方 JSON → TaskDefinition）+ outbound-translator（内部事实 → 甲方格式）

翻译层结构设想：
```
northbound feature/
  adapter/
    inbound-translator.ts    — translateSetTestTask, translateControlAction, resolveInputPars
    outbound-translator.ts   — buildMsgReport, buildTestCaseResult, buildTestReport
    config.ts                — 映射表：parId→fieldId, deviceTargetMap 等
```

### 六、Q4 与 command-ingress 的关系

**结论：独立 feature，复用模式不共享实现。**

| 维度 | command-ingress (SCOE) | northbound (甲方) |
|------|----------------------|------------------|
| 传输层 | 串口/TCP 字节流 | HTTPS JSON |
| 协议 | SCOE 二进制 | RESTful JSON |
| 命令模型 | 6 种固定功能码 | 4 类入口 |
| 生命周期 | 无（单次命令） | 有（session、多批次、控制） |

两者共用模式：外部请求 → 翻译 → TaskDefinition → task service。但协议、生命周期、确认机制完全不同，合并会增加耦合。两套协议长期共存。

### 七、Q5 旧 gap 分析有效性

**仍有效的：**
- 5 条危险等价红线
- 内部执行能力可复用
- 外部事务语义必须新建
- "northbound 是独立边界"
- 任务生命周期基线

**需要更新的：**

| 旧假设 | 新事实 | 影响 |
|--------|--------|------|
| 用例/任务枚举未确认 | 现已确认 success/fail/tbd | verdict 映射可定稿 |
| 报告格式未确认 | 现已详细定义 | 可推进（但 MVP 糊弄版） |
| FTP 规则未确认 | setTestTask 携带 ftpInfo | 需 FTP 上传能力 |
| executionPlan 未分析 | layers 并行模型已定义 | 后确认：多 task 实例并行 |
| 用例目录树未分析 | getTestCaseAll 树形 JSON | 需格式转换 |
| 多批次未分析 | isEnd 字段 | 已确认甲方 always isEnd=true |
| msgReport 未详细分析 | 支持批量 stepInfo | 需 step 级事件 |

### 八、决策过程（按时间线）

**第一轮决策：**
- testCaseId = 帧，不建独立用例实体
- 不做并行执行
- 测试数据文件不做
- 测试报告糊弄版
- HTTPS 放 main process
- northbound 独立 feature
- 用例级结果判断可加，注意解耦不一路连到底

**用户修正：** "用例还是换成 task 吧" → 甲方 testCase = 我们的 task（TaskDefinition）。setTestTask 的 testCaseInfo[] 每项 → 一个 task 实例。

**决策影响：**
- 并行变为可行：多 task 实例同时 startTask，task service 原生支持
- verdict 直接用 task 级，不需要额外用例级判断层
- executionPlan 处理：parallel=true 层同时 createTask+startTask，parallel=false 层顺序执行

**用户补充决策：**
- heartbeat 纳入 MVP
- getSubSysState 做
- 测试报告和测试数据文件不做也不告诉甲方

**第二轮：verdict 判定依据确认**
- 用户确认：发帧 + 检测接收参数（不是只看 send 成功）
- task steps = send step + wait-condition step
- 这直接使用 ConditionTerm 机制

**第三轮：代码验证**
- result feature 代码实查确认：judgeCaseVerdict 存在且完整，但 result service 是被动的
- task step 事件确认缺失：step 完成只写内部状态，无外部通知
- HTTPS/FTP outbound 确认缺失

**第四轮（2026-05-19）：甲方回复**
- immediate 实际使用中按 true 设置
- isEnd 实际使用中一次发完（true）
- 甲方说明：接口参照了原入网认证的一二级接口，部分字段暂未用到
- 结论：setTestTask 处理是最简路径

### 九、代码验证详细结果

**已有的（内部 feature 层）：**

| 能力 | 文件 | 关键行号 | 说明 |
|------|------|---------|------|
| verdict 判断 | `result/core/judge.ts` | 15-19 | passed/failed/stopped，完整逻辑 |
| isStepFailed 辅助 | `result/core/judge.ts` | 4 | step 级失败判定 |
| result service | `result/services/result-service.ts` | 5-9 | collectResult/getVerdict/getSnapshot/clear，被动 API |
| result public API | `result/index.ts` | — | export CaseVerdict/CaseVerdictKind/judgeCaseVerdict/createResultService/selectors |
| task 终态感知 | `task-service.ts` | 66, 273 | onSettled，Map<string, ()=>void> + Promise |
| settle resolve | `task-lifecycle-manager.ts` | 39-45, 73, 79 | completeTask/failTask 中 resolveSettle |
| stop 中也 resolve | `task-service.ts` | 223, 234 | stopTask/stopAll |
| step 结果实时写入 | `task-iteration-loops.ts` | 162, 171, 222 | send/repeatable/其他 step 完成立刻 addStepResult |
| stepResults 存储 | `task/state/task-state.ts` | 137-165 | addStepResult，最多保留 100 次迭代 |
| platform bridge | `platform/index.ts` | 29-39 | window 全局 bridge |
| transport facade | `platform/transport.ts` | — | enumerateSerialPorts/connect/disconnect/write/onEvent |
| file facade | `platform/files.ts` | — | readTextFile/writeTextFile/showSaveDialog/showOpenDialog |

**确认缺失的：**

| 缺失 | 影响 | 改动范围 |
|------|------|---------|
| step 级事件通知 | msgReport 无驱动源 | task-iteration-loops.ts 加回调 hook |
| HTTPS outbound client | 无法 POST testCaseResultReport/msgReport | platform facade 新增 |
| FTP 上传 | getTestCaseAll 文件上传无通道 | platform facade 新增 |
| result 自动消费 onSettled | 需手动调 collectResult | northbound feature 接线 |
| 报告生成 | 只有 placeholder | northbound feature 实现 |

**placeholder 位置：**
- `command-ingress/composables/use-task-report.ts:7-9` — reportTasks() 抛 "Not implemented"
- `command-ingress/composables/use-central-docking.ts:26-28` — connect() 抛 "Not implemented"

### 十、待向甲方确认事项 — 已全部清零

~~1. immediate=false 怎么启动~~ → 甲方确认 always true
~~2. isEnd 多批次~~ → 甲方确认 always true
~~3. 报告格式简化~~ → 不问，悄悄不做
~~4. 测试数据文件~~ → 不问，悄悄不做

甲方说明：接口参照了原入网认证的一二级接口，部分字段暂未用到。

### 十一、MVP 接口最终状态

| 接口 | 方向 | 映射 | 状态 |
|------|------|------|------|
| setTestTask | 甲方→我们 | testCaseInfo[] 每项 → task(send+wait-condition) | 逻辑通，immediate=true, isEnd=true |
| controlTestTask | 甲方→我们 | abort→stop, pause→pause, continue→resume, stop→stop | 通 |
| testCaseResultReport | 我们→甲方 | onSettled→collectResult→verdict→success/fail/tbd | 有基础需接线 |
| msgReport | 我们→甲方 | step 完成→stepInfo | 缺 step 事件（G1） |
| heartbeat | 甲方→我们 | 简单响应 | 需实现 |
| getSubSysState | 甲方→我们 | 状态查询响应 | 需实现 |
| getTestCaseAll | 甲方→我们 | task 定义列表→甲方 JSON→FTP 上传 | 需格式转换+FTP |

### 十二、未决项（设计时再定）

- getTestCaseAll 是否纳入 MVP？需要 FTP 能力
- HTTPS 库选型（Fastify/Express）
- taskId ↔ instanceId 映射表放在哪里（northbound feature 内部？runtime？）
- sessionId 生命周期管理
- step 名称映射方案（G2 待验证）
- TLS 配置（自签名？双向？）

### 十三、northbound feature 需要建的东西（全量清单）

**入站：**
- HTTPS server（main process，监听 5001）
- 请求分发器（URL → handler）
- setTestTask handler：解析 executionPlan → 创建 task 实例
- controlTestTask handler：解析 action → 调用 task lifecycle API
- heartbeat handler：构造响应
- getSubSysState handler：查询系统状态构造响应
- getTestCaseAll handler：task 定义列表 → 甲方 JSON → FTP 上传 → 响应
- 入站翻译器：甲方 JSON → 内部类型
- taskId↔instanceId 映射表
- sessionId 管理

**出站：**
- HTTPS client facade（platform 层，用于 POST 到甲方）
- testCaseResultReport 发送：onSettled → collectResult → 翻译 → POST
- msgReport 发送：step 完成事件 → 翻译 → POST
- 出站翻译器：内部事实 → 甲方 JSON 格式

**基础设施：**
- platform HTTPS facade（main ↔ renderer IPC）
- platform FTP facade（文件上传）
- task step 完成回调 hook（task feature 内部改动）

## 后续

- 验证 G2（step 名称映射）和 G5（getTestCaseAll 格式转换）
- 完成 runtime 真实连接能力（串口/TCP mock → 真实）
- 本地端到端验证：手动建 task → 发帧 → 收响应 → 条件匹配 → verdict
- 以上全通后再设计实施 northbound feature
