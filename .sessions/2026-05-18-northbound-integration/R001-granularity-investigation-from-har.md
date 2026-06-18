# R001 — 甲方任务/用例/实例 粒度调研(基于 0531 HAR)

> 2026-06-17 | 关联: H008 / S011 / topic-index:23
> 证据来源: `rewrite/docs/10.15.5.53.har` (2026-06-11 抓取,甲方前端真实流量,53 条 entry)

> ⚠️ **2026-06-18 重大认知纠正(见 D003)**: 本调研所基于的 HAR **全是 ka 子系统(KPS)的数据,不是我们 laser(LAS)的**。HAR 91 处 subSysName 全是 "ka子系统",laser 0 处。ka 与我们是甲方下挂的**平级兄弟子系统**(附录 10-附录.md:141-156)。
>
> **本文件结论的适用边界**:
> - ✅ **结构参考价值仍成立**: caseMenu/caseTemplate/caseSet/task 的**字段结构和四层概念**是甲方通用模型,与子系统无关。Q1(四层概念)结论有效。
> - ✅ **setTestTask/getTestCaseAll 协议层结构**(对照 04-任务管理.md)仍成立,已用于代码清理。
> - ❌ **所有具体字段值(caseName="单用例-Ping上行"、parId="NR_Parameters.px_*"、depSubSys="KPS" 等)对我们 laser 无参考价值**——那是 ka 的业务,不是我们的。
> - ❌ **不能用 HAR 的 parId 样本评估"翻译层可行性"**(R002 初版犯过此错,见 D003 推翻)。
>
> 真正的 laser 数据需 NAT 恢复后从 laser 视角抓,或等 getTestCaseAll 实施后我们自己生成。

## 调研问题

回答 H008 的 5 个必答问题(Q1-Q5),厘清甲方概念粒度,确定我们的 TaskTemplate/TaskInstance 怎么映射。

**前提澄清**: H008 要求"用户提供甲方最新接口文档 + 真实报文(getTestCaseAll/setTestTask)"。本轮**用户因 NAT 连不上无法新抓报文**,但经核查,0531 这份旧 HAR 含有比预期丰富得多的甲方内部数据模型——虽然不含 getTestCaseAll(那是我们→甲方入站接口,甲方前端抓不到),但完整暴露了甲方用例管理/任务编排/执行监控的真实数据结构,足以回答粒度问题。**结论可靠度: 高(结构层面);字段值层面仅对 ka 有效,对 laser 无参考(见 D003)**。

## 发现:甲方系统是四层概念(非三层)

HAR 证明甲方内部数据模型如下,每层都有真实字段证据:

### ① caseMenu — 用例分类目录(菜单树)

接口 `GET /admin/caseMenu/list?subSysId=...`,响应字段:

```json
{
  "menuId": "2056280846849810434",
  "subSysId": "2054755014554107905",
  "subSysName": "ka子系统",
  "outMenuId": "b1dbf93c073347db9a8cb3d63f846560",   // 外部 ID(给我们用的)
  "outParentId": "0",                                  // 外部父 ID
  "parentId": null,                                    // 内部父 ID
  "parentMenuName": null,
  "menuName": "功能验证"                                // 20 个顶层菜单
}
```

性质: 用例的**分类目录**,长期存在,甲方维护。示例菜单: 功能验证/基本业务连通性/典型应用场景测试/单星性能测试/应用技术试验/星内切换测试/移动性管理测试...

### ② caseTemplate — 用例定义(可执行用例,核心)

接口 `GET /admin/caseTemplate/list?subSysId=...&menuId=...`,响应字段(32 条用例):

```json
{
  "caseId": "2055191715914780674",                    // 内部 ID
  "outCaseId": "V3_Test_TraffBeamAccess",             // 外部 ID(给我们用的)
  "subSysId": "2054755014554107905",
  "subSysName": "ka子系统",
  "menuId": "2056280846849810434",                    // 归属菜单
  "menuName": "功能验证",
  "caseName": "单用例-业务波束接入",
  "isParent": false,
  "caseType": "orbit",                                // 用例类型
  "depSubSys": "KPS",                                  // 依赖子系统
  "depSubNe": "UE:1",                                  // 依赖网元
  "execSteps": "",                                     // 执行步骤(此例为空)
  "checkPoints": null,                                // 校验点
  "relationCaseSubSysType": null,
  "relationCaseId": "",
  "priority": null,
  "satDiffManufacture": false,
  "satelliteCount": 1,                                 // 卫星数
  "stationCount": 1,                                   // 站点数
  "durate": 600,                                       // 时长(秒)
  "remark": "",
  "parentId": null,
  "sortOrder": 1,
  "children": []
}
```

性质: **可执行用例定义**,长期保存在甲方用例库。每个用例归属一个 menuId。

用例参数(单独接口 `GET /admin/caseTemplateParam/list?caseId=...`),每用例 5-11 个参数:

```json
{
  "paramId": "...",
  "outParamId": "Delay_AfterCFUN_1",                  // 外部参数 ID
  "caseId": "...",
  "paramName": "开机指令后的等待时长",
  "defaultValue": "18",
  "paramValue": "18",                                  // 当前值(可覆盖默认)
  "paramUnit": "min",
  "paramValueType": "string",
  "paramType": "0",
  "valueList": [                                       // 可选值枚举
    {"paramValue": "18", ...},
    {"paramValue": "333", ...}
  ]
}
```

典型参数: `Delay_AfterCFUN_1`(开机等待)/`NR_Parameters.px_PingNum`(Ping包数)/`guardtime`(保护时间)/`PingLimitExpect`(时延门限)/`NR_Parameters.px_BusinessServerIP`(业务IP)...

### ③ caseSet — 用例集(多用例打包)

接口 `GET /admin/caseSet/listForDrag`,响应字段:

```json
{
  "caseSetId": "2060998437935554561",
  "caseSetName": "特斯拉测试",                          // 用户起的名字
  "cases": [                                           // 引用多个 caseId
    {"caseId":"...","caseName":"单用例-UDP并行","outCaseId":"V3_Test_Udp_ULDL","caseType":"orbit"},
    {"caseId":"...","caseName":"单用例-UDP上行","outCaseId":"V3_Test_Udp_UL",...},
    {"caseId":"...","caseName":"单用例-UDP下行","outCaseId":"V3_Test_Udp_DL",...}
  ]
}
```

性质: **用例的分组打包**,用户可把多个用例捆成一个集合一次性执行。如"特斯拉测试"(3个UDP用例)、"苹果测试"(3个用例)、"test0524"(5个用例)。

### ④ task — 任务(一次性执行编排,最上层)

接口 `GET /admin/task/list` + `GET /admin/taskFlowchart/getAll?taskId=...`,核心结构:

**task 基本信息字段**:

```json
{
  "taskId": "2061049099725586433",
  "outTaskId": "T_178022737246337558",
  "siteId": "2050895591810056194",
  "siteName": "重庆",
  "subSysId": "2054755014554107905",
  "subSysName": "ka子系统",
  "taskName": "测试0531",
  "taskType": "计划执行",
  "immediate": false,                                  // S001 甲方确认始终 true,此处前端显示是计划态
  "repeatCount": 1,
  "isEnd": false,
  "orbitProtectTime": 30,                              // 轨道保护时间
  "delayedExecTime": null,
  "status": "CREATED",                                 // CREATED/RUNNING/...
  "currentRound": null,
  "startedTime": null,
  "completedTime": null,
  "executorId": 1,
  "executorName": "房",
  "controlStatus": "0",
  "controlMsg": null
}
```

**executionPlan(taskFlowchart 的 nodeList/edgeList)**:

```
开始(start) ─┬─→ 苹果测试(caseSet,含3个用例) ─┐
            └─→ 单用例-FTP上传(case) ──────────┴─→ 单用例-FTP下载(case)
```

nodeList 节点类型:
- `nodeType:0` 开始节点
- `nodeType:1` 单用例节点(引用 testcaseId)
- `nodeType:2` 用例集节点(引用 caseSetId,内含 cases[])

每个节点带 `deviceIds`(指定执行设备)/`masterTest`/`testMode`/`ephMode` 等执行参数。

### 🔑 铁证:甲方真的向我们下发 setTestTask

`taskMonitor/{id}` 的 `operationInfo` 字段:

```
调用服务异常: [404] during [POST] to [http://127.0.0.1:8800/api/task/setTestTask]
  [TaskClient#setTestTaskRaw(URI,SetTestTaskRequest)]: [<!doctype html><html...
```

**证明**:
1. 甲方建好 task 后,**确实调用** `POST /api/task/setTestTask` 下发给我们(2026-05-31 尝试时我们返回 404,因为当时服务没起/路径不对)
2. 甲方的 Feign 客户端叫 `TaskClient#setTestTaskRaw`,接收 `SetTestTaskRequest` 类型
3. 调用目标是 `http://127.0.0.1:8800` —— 即甲方期望我们的服务跑在 8800 端口(注意:不是我们 S011 联调用的 80,这个差异需后续确认)

## Q1 回答:甲方几层概念

**四层**(见上),不是 H008 假设的三层。但与我们的映射时,**关心两层就够**:
- **caseTemplate**(用例定义)—— 长期库,通过 getTestCaseAll 同步
- **task 节点**(executionPlan 里的用例/用例集引用)—— 临时执行,通过 setTestTask 下发

caseMenu(菜单)和 caseSet(用例集)是我们**可以不持有**的甲方内部组织方式。

### 用户困惑的真实含义(破案)

用户原话"甲方只有同步实例,任务得自己新建" + "任务对应实例太麻烦":

**真相**: 用户看的是"参考实现"(另一家的对接代码),那家可能把映射搞复杂了。甲方真实系统里:
- 甲方**自己建 task**(task/list 33 条)、**自己编排 executionPlan**、然后向我们下发
- 我们**不建 task**,只接收 setTestTask
- 用户担心的"任务对应实例太麻烦"是把"我们的整个 Task 概念"塞进了"甲方 task"。其实甲方一个 task 下发 N 个 caseId,每个 caseId 在我们这边是**一个 TaskInstance**

## Q2 回答:getTestCaseAll 真实结构

**本轮无 getTestCaseAll 真实响应**(入站接口,甲方前端抓不到)。但 HAR 反推出甲方期望我们返回的 caseTemplate 结构(见上 ②)。

**关键发现**: V1.0.4 文档(03-用例管理.md)描述的 getTestCaseAll 响应 datas[] 是两层树(isParent/children),HAR 里 caseTemplate 也是 isParent/children 但**实际全是扁平**(`isParent:false` + `children:[]`)。说明文档的树形能力存在但实际未用。

→ **本轮用户已决定**: getTestCaseAll 返回**扁平 caseTemplate 列表**(决策见 D001)。

## Q3 回答:setTestTask 真实结构

> ⚠️ **本节 2026-06-17 二次核对后重写**。初版误把甲方前端 UI 模型(taskFlowchart)当成 setTestTask 协议格式,经用户提醒后通读 04-任务管理.md 发现是两套结构。详见"协议层 vs UI 层差异表"。

HAR 没抓到 setTestTask 的请求体(只抓到甲方调我们时 404 的错误记录)。**不能从 taskFlowchart 反推协议格式**——taskFlowchart 是甲方前端的流程图渲染模型(带 positionX/positionY/background/edgeType 等 UI 字段),setTestTask 是协议层精简结构,两者不同。

### setTestTask 协议层真实结构(04-任务管理.md 原文实锤)

**顶层字段**(请求消息参数表,1-132 行):

| 字段 | 类型 | 要求 | 说明 |
|------|------|------|------|
| method | 字符串 | 必选 | "setTestTask" |
| requestId | 数字 | 必选 | 0~2147483648,关联请求响应 |
| subSysType | 字符串 | 必选 | 子系统类型(如 ADS) |
| subSysId | 字符串 | 必选 | 子系统id,<15字符 |
| sessionId | 数字 | 必选 | 流程上下文id |
| resources | 对象数组 | 必选 | 依赖资源(见下) |
| taskId | 字符串 | 必选 | 任务id,<20字符(如 T_001) |
| taskName | 字符串 | 可选 | 任务名字 |
| immediate | 布尔 | 必选 | 是否立刻执行 |
| repeatCount | 数字 | 必选 | 用例重复执行次数 |
| isEnd | 布尔 | 必选 | 是否本次任务最后一次下发 |
| orbitProtectTime | 数字 | 可选 | 弧段保护时长(秒) |
| **testCaseInfo** | 对象数组 | 必选 | 用例信息(见下) |
| ftpInfo | 对象 | 可选 | 备用,文件上传 |
| **executionPlan** | 对象 | 必选 | 执行计划(见下) |

**resources[]**(资源,精简版):
```
[{satelliteId, loadIds[](废弃但兼容保留), payload:[{ip, payloadId}]}]
```

**testCaseInfo[]**(用例信息,每个用例):
```
{
  testCaseId,           // 必选,测试用例id
  deviceIds[],          // 可选,设备id
  masterTest,           // 可选,是否主测(主叫/被叫)
  testMode,             // 可选,1:业务波束接入/2:随遇转业务接入
  ephMode,              // 可选,1:全网星历/2:预置星历
  orbitInfo[],          // 可选,弧段信息(subSysId/satelliteId/satelliteType/cellIds/stationId/orbitId/loopNum/startTime/endTime)
  inputPars[]           // 可选,用例入参 —— 只有 {parId, value} 两个字段!
}
```

**executionPlan**(执行计划,精简到极致):
```
{
  layers: [
    {
      layer: 1,          // 层序号(从1开始)
      parallel: false,   // 该层是否并行执行
      nodes: ["TC-TLM-001", "TC-S-001"]   // 该层包含的测试用例ID列表 —— 纯字符串!
    },
    {layer: 2, parallel: true, nodes: [...]}
  ]
}
```

### 🔴 协议层 vs HAR UI 层差异表(核心发现)

| 维度 | 文档协议层(04-任务管理.md 实锤) | HAR UI 层(taskFlowchart,之前误用) | 差异性质 |
|------|------|------|------|
| **executionPlan 结构** | `{layers:[{layer, parallel, nodes:[testCaseId字符串]}]}` 3字段 | nodeList+edgeList,nodeType 0/1/2,带 positionX/positionY/background/edgeType | 🔴 两套完全不同。协议是精简层级+并行+ID数组,UI 是流程图渲染模型 |
| **testCaseInfo 参数** | `inputPars:[{parId, value}]` 2字段 | paramList(paramId/outParamId/paramName/paramValue/paramUnit/valueList) | 🔴 参数格式完全不同。协议是极简键值对,UI 是带元数据对象 |
| **用例引用** | `testCaseId` 单字段 | testcaseId+outCaseId+caseName+caseType | 协议只要 ID,UI 带冗余展示字段 |
| **资源** | resources:[{satelliteId, loadIds, payload:[{ip,payloadId}]}] | satelliteList(带 siteId/name/satelliteType/manufacturer) | 🔴 协议精简,UI 是展示对象 |
| **caseSet** | **文档协议层不存在 caseSet 概念** | HAR 有 caseSetId/caseSetName/cases[] | 🔴 caseSet 是甲方内部 UI 概念,协议层不传递。印证用户"caseSet 暂不支持"决定正确 |
| **nodes 内容** | 纯 testCaseId 字符串数组 | node 对象(带 deviceIds/testMode/ephMode) | 🔴 协议层 nodes 只存 ID,执行参数在 testCaseInfo 里 |

### controlTestTask 结构(04-任务管理.md 581-690)

请求体极简:`{method, requestId, subSysType, subSysId, sessionId, taskId, action}`。

⚠️ **文档内部矛盾**:
- 参数表(607行)action 备注:**只列了 "终止(任务及当正在执行的用例): abort"**
- 示例报文(654-656行)action: **写了 pause / continue / stop / abort 四种**

→ 联调时需实测甲方到底支持哪几种 action。当前代码(topic-index:34)按四种实现,待联调验证。

### 结论修正

1. **executionPlan 真实结构 = layers/nodes/parallel**(文档原文)。topic-index:39 早期描述是对的,我反而被 HAR 带偏。纠正回来。
2. **testCaseInfo 比想象的简单**:testCaseId + deviceIds + 可选 inputPars(只有 parId/value)。
3. **不能拿 taskFlowchart 当协议格式**——它是甲方内部 UI 模型。HAR 对 setTestTask 的价值仅在于证明"甲方确实会下发"(taskMonitor 的 404 错误记录),**不能用来反推请求体结构**。
4. **caseSet 协议层不存在**:甲方前端用 caseSet 组织 UI,但下发给我们时按 layers/nodes 扁平化。用户"caseSet 不支持"决定天然正确。

## Q4 回答:现有模型怎么映射

基于 HAR(甲方 UI 层)+ 04-任务管理.md(协议层)双重证据,确认 S011 第 233 行映射表**方向正确**,精确化:

| 我们(types.ts) | 甲方(协议层 04-任务管理.md) | 对齐度 | 说明 |
|----------------|----------------|--------|------|
| **TaskTemplate** (184) | **caseTemplate**(getTestCaseAll 返回的用例定义) | 高 | 都是"可执行定义的长期保存"。templateId↔outCaseId,name↔caseName,definition.steps↔execSteps |
| **TaskDefinition** (107) | caseTemplate 的执行内核 | 中 | steps/send\|wait\|delay 对应 execSteps 语义,格式不同(我们结构化,甲方文本/参数) |
| **TaskInstance** (164) | **executionPlan.layers.nodes 里的一个 testCaseId** + 对应 testCaseInfo 条目 | 高 | setTestTask 下发 → 我们按 testCaseInfo 每个 testCaseId createTask 一个实例。definitionRef↔testCaseId |
| TaskTemplate.tags | caseMenu (menuId/menuName) | 低 | 我们 tags 自由字符串,甲方 menuId 强分类。本轮决定:tags 凑假分类或单菜单 |
| (无) | inputPars(testCaseInfo 里的 {parId,value}) | 低 | 协议层参数极简键值对,我们的 fieldVariations 语义更丰富。本轮决定:实例化时 inputPars 可忽略或映射成 fieldVariation |
| (无) | caseSet / caseTemplateParam(HAR UI 层概念) | — | 协议层无 caseSet;caseTemplateParam 是甲方内部参数管理,setTestTask 下发只用 inputPars |

**用户"任务对应实例太麻烦"的担心不成立**: 映射不是"我们的 Task ↔ 甲方 task",而是"甲方一次 setTestTask 下发 N 个 testCaseInfo → 我们 N 个 TaskInstance"。维护成本等于"N 个实例的状态管理",task-service 已支持多实例并行(S001 确认)。

## Q5 回答:4 个凑合方案

基于本轮用户决定:

| 方案 | 决定 | 可行性 | 成本 | 风险 |
|------|------|--------|------|------|
| 模板怎么分类成菜单树 | **扁平,不分类树** | 高 | 低 | menuId 用占位或我们的 tags 凑一个假 menu |
| steps 怎么塞进甲方字段 | **填空/默认值** | 高 | 低 | execSteps 填 steps 摘要文本或空,paramList/checkPoints 填空数组 |
| 单帧要不要单独作用例 | 不拆 | 高 | 低 | 一个 TaskTemplate = 一个 caseTemplate,不拆帧 |
| 缺失字段怎么填 | **填空/默认值,只保证结构合规** | 高 | 低 | depSubSys/durate/satelliteCount 等填合理占位(null/0/"") |

## 结论

1. **粒度方向已明确**: TaskTemplate↔caseTemplate, TaskInstance↔executionPlan.layers.nodes 的 testCaseId(+对应 testCaseInfo)。S011 映射表方向正确,推翻"任务对应实例太麻烦"的担心。
2. **topic-index:23 措辞需更新**: "testCase = task(TaskDefinition)" → 精确为 "testCase(caseTemplate) = TaskTemplate"。见 D001。
3. **getTestCaseAll 设计方向**: 扁平 caseTemplate 列表 + 字段填空/默认值。转 H009 实施。
4. **setTestTask 协议层结构明确**: layers/nodes/parallel + testCaseInfo(testCaseId+inputPars) + resources。**不能拿 taskFlowchart(UI 层)反推协议格式**。
5. **本轮证据充分**: 不需要用户再抓报文。两个待联调实测项:① 8800 端口 vs 我们 S011 的 80 端口差异;② controlTestTask 的 action 到底支持 abort 单种还是 pause/continue/stop/abort 四种(文档内部矛盾)。

## 对决策的影响

- **新建 D001**: 确认 testCase↔TaskTemplate 映射,修正 topic-index:23 过时措辞。
- **更新 topic-index**: 加 H008 完成记录 + R001 引用 + 修正映射。
- **关闭 H008**: 调研完成,方向清晰。
- **开 H009(后续)**: 实施 getTestCaseAll 真实化。

## ⚠️ 二次核对记录(2026-06-17)

用户对 setTestTask 结论提出"感觉怪怪的",触发二次核对。通读 04-任务管理.md 后发现**初版 Q3/Q4 误把甲方前端 UI 模型(taskFlowchart)当成 setTestTask 协议格式**。已重写 Q3,补充"协议层 vs UI 层差异表"。

**教训**: HAR 抓到的是甲方前端流量,其数据结构是**内部 UI 渲染模型**(带坐标/颜色/流程图边),与**对外协议格式**(精简的层级+ID数组)是两套抽象。不能用 UI 模型反推协议格式。HAR 对 setTestTask 的唯一可靠价值是 taskMonitor 的 404 错误记录——它只证明"甲方会向我们下发",不证明"请求体长什么样"。

协议层结构以 04-任务管理.md 原文为准。

### 代码差距已修复(2026-06-17)

二次核对后发现现有代码(`northbound/core/types.ts` + `services/northbound-service.ts`)有 3 处 UI 残留,**已全部修复**:

| 差距 | 性质 | 修复 |
|------|------|------|
| `ExecutionPlan.caseSets` + `CaseSet` interface | 🔴 协议层无此概念(UI 残留) | 删除字段 + interface + 整段 caseSet 展开逻辑(`resolveNode` 退化) |
| `ExecutionPlanNode` 对象 + `nodes: ExecutionPlanNode[]` | 🟡 文档 nodes 是纯字符串数组 | 删 interface,`nodes: readonly string[]`,`resolveNode(node)` 改成直接查表 |
| `TestCaseInfo` 6 个字段强必填 | 🟢 文档标注可选 | `deviceIds/masterTest/testMode/ephMode/orbitInfo/inputPars` 改 `?` 可选 |

**验证**:
- northbound-service.spec.ts 39/39 全过(含改写的 caseSet 展开测试 → 改为纯字符串 nodes 测试)
- 5 个 heartbeat-timer.spec.ts 失败为**预存问题**(git stash 到干净代码后同样 5 failed),与本轮无关
- 改动文件:`types.ts` / `northbound-service.ts` / `index.ts` / `northbound-service.spec.ts`

**结论修正**: 现有代码当初作者其实**基本是照文档协议层写的**(只是注释写"HAR-aligned"造成误导),3 处 UI 残留已清。代码现与 04-任务管理.md 100% 对齐。

## 证据索引(便于后续引用)

| 证据 | 位置 | 用途 | 可靠度 |
|------|------|------|--------|
| **setTestTask 协议结构** | `04-任务管理.md` 1-390(参数表+示例) | **协议层请求体结构,以文档为准** | 高(文档原文) |
| **controlTestTask 协议结构** | `04-任务管理.md` 581-690 | 协议层控制结构;⚠️ action 参数表只列 abort,示例列4种,内部矛盾 | 高(结构)/ 待测(action) |
| caseMenu 20 条菜单 | HAR: `GET /admin/caseMenu/list` | 证明菜单层存在(UI 层) | 中(UI 模型,非协议) |
| caseTemplate 32 条用例 | HAR: `GET /admin/caseTemplate/list` | caseTemplate 字段参考(UI 层,getTestCaseAll 返回结构需对照 03-用例管理.md) | 中 |
| caseTemplateParam | HAR: `GET /admin/caseTemplateParam/list` | 证明甲方内部参数管理(UI 层,协议层用 inputPars) | 中 |
| caseSet 3 个集合 | HAR: `GET /admin/caseSet/listForDrag` | 证明 caseSet 是甲方 UI 概念,**协议层不存在** | 中(印证 D001 决定) |
| task + taskFlowchart | HAR: `GET /admin/task/list` + `taskFlowchart/getAll` | 甲方内部任务/编排模型(UI 层)。⚠️ 不能当 setTestTask 协议格式 | 低(仅参考) |
| **setTestTask 下发铁证** | HAR: `taskMonitor/{id}` 的 operationInfo | **仅证明甲方会调我们 `POST /api/task/setTestTask`**,不证明请求体结构 | 高(行为证据) |
| taskResult 执行结果 | HAR: `GET /admin/taskResult/detail` | 甲方内部结果结构(UI 层) | 中 |

## 待联调实测项

1. **setTestTask 真实请求体**:文档结构明确,但字段是否全部下发、可选字段甲方实际填不填,需联调抓真实请求体验证。
2. **controlTestTask action 种类**:文档参数表 vs 示例矛盾(abort 单种 vs pause/continue/stop/abort 四种),联调实测甲方支持哪几种。
3. **8800 端口 vs 80 端口**:HAR taskMonitor 显示甲方调 `127.0.0.1:8800`,我们 S011 联调用 80,联调时确认甲方配置的端口。
4. **getTestCaseAll 真实响应**:本轮无此报文(入站接口),H009 实施后联调验证甲方能否解析我们的扁平 caseTemplate。
