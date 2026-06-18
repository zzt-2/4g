# Decisions — 甲方对接闭环分析

> 本专题所有 D### 决策记录。status: active / superseded。永不删除。

---

## D001: testCase(caseTemplate) ↔ TaskTemplate 映射确认

> status: active
> date: 2026-06-17
> 取代：无(修正 topic-index:23 的非正式措辞,非取代某 D###)
> 被取代：无

### 决策

甲方用例(caseTemplate)与我们的 TaskTemplate 一一对应。精确化旧映射措辞:

- **旧(topic-index:23,S001)**: "甲方 testCase = 我们的 task(TaskDefinition)"
- **新(D001)**: "甲方 caseTemplate(getTestCaseAll 返回) = 我们的 TaskTemplate;甲方 task 下发的 executionPlan 节点 = 我们的 TaskInstance"

四层粒度厘清(基于 R001 真实证据):
- caseMenu(菜单目录): 我们不持有,可选 tags 凑假分类
- **caseTemplate(用例定义): ↔ TaskTemplate** ← 本决策核心
- caseSet(用例集): 本轮不实现
- **task(执行编排,含 executionPlan): 甲方建,下发 → 我们创建 TaskInstance**

### 理由

1. **协议层 + UI 层双重证据**: 04-任务管理.md 的 setTestTask 协议(testCaseInfo/executionPlan.layers.nodes)与 0531 HAR 的 caseTemplate UI 模型,共同印证 caseTemplate ↔ TaskTemplate 映射。
2. **用户困惑解除**: 用户原话"任务对应实例太麻烦"基于错误前提。真实映射是"甲方一次 setTestTask 下发 N 个 testCaseInfo(testCaseId) → 我们 N 个 TaskInstance",不是"我们的 Task ↔ 甲方 task"。
3. **推翻"任务对应实例太麻烦"担心**: task-service 已支持多实例并行(S001 确认),维护成本等于 N 个实例状态管理,无额外复杂度。
4. **taskMonitor/{id} 行为证据**: operationInfo 显示甲方确实 `POST /api/task/setTestTask` 下发,印证"甲方建 task,我们收"。⚠️ 此证据**只证明甲方会下发,不证明请求体结构**——协议结构以 04-任务管理.md 文档为准,不能用 taskFlowchart UI 模型反推。

### 排除的替代方案

- ❌ **"我们的 Task ↔ 甲方 task"整体映射**: 会让单个 Task 对象承担甲方整个 setTestTask(含 testCaseInfo 数组 + executionPlan.layers 多层)的复杂度,过度耦合。应拆成"N 个 TaskInstance 对应 N 个 testCaseId"。否决。
- ❌ **TaskDefinition ↔ caseTemplate**(旧措辞): TaskDefinition 是 TaskTemplate 的内核(无 templateId/tags/createdAt),不是可独立同步的顶层实体。caseTemplate 对应的是带元数据的 TaskTemplate。否决,修正措辞。
- ❌ **拿 taskFlowchart UI 模型当 setTestTask 协议格式**: taskFlowchart 带 positionX/positionY/background/edgeType/caseSet 等 UI 渲染字段,与协议层精简结构(layers/nodes/testCaseInfo.inputPars)是两套抽象。R001 初版犯过此错,二次核对纠正。否决,以文档为准。
- ❌ **实现 caseSet**: 协议层根本不存在 caseSet(04-任务管理.md 无此概念),它是甲方前端 UI 组织方式。用户"不支持"决定天然正确,无需再议。
- ❌ **菜单树分类**: 本轮用户决定 getTestCaseAll 返回扁平列表,不做 caseMenu 树。

### 影响范围

- **topic-index:23**: 措辞修正(见下方 topic-index 更新)
- **topic-index:57 "不做的"**: 继续生效(不做用例库独立实体/caseSet)
- **H007**: 粒度方向已厘清,可恢复实施
- **H009(待开)**: getTestCaseAll 实施——返回扁平 caseTemplate 列表,字段填空/默认值
- **types.ts**: GetTestCaseAllResponse 类型待补(实施轮)
- **northbound-service.ts:500**: handleGetTestCaseAll 待从 mock 换真实模板序列化

### 来源

- R001(本轮调研,基于 0531 HAR 真实流量)
- S011:233(原映射表,方向正确但措辞过时)
- 用户决定(2026-06-17): 扁平 caseTemplate + 字段填空 + 不支持 caseSet
- 触发原话: 见 voice.md 2026-06-17

---

## 待记录的决策

- getTestCaseAll 字段填充策略(填空/默认值)的具体值表 → H009 实施轮补(见 D002 §字段填充策略)
- 8800 端口 vs 我们 S011 的 80 端口差异 → 联调时确认
- **controlTestTask action 支持种类** → 04-任务管理.md 内部矛盾(参数表只列 abort,示例列 pause/continue/stop/abort 四种),需联调实测后补 D###。当前代码按四种实现,风险:若甲方只支持 abort,其他 action 调用会失败。

---

## D002: getTestCaseAll 数据源 = TaskTemplate(带"上报"标记)

> status: active
> date: 2026-06-17
> 取代：无
> 被取代：无

### 决策

getTestCaseAll 同步给甲方的用例,**数据源是 `taskService.listTemplates()`**,但 TaskTemplate 增加一个"是否上报给甲方"的标记。getTestCaseAll 只序列化**标记为上报**的模板。

- 单一数据源:本地模板即甲方用例的来源(打通 D001 的数据层)
- 用户控制权:不是所有模板都要给甲方,通过标记选择性上报
- 管理位置:在现有 TemplateListPage(模板管理页)管理,无需新建"用例目录"页

### 标记字段设计(待 H009 实施定稿)

初步方向(TaskTemplate 增加 metadata):
```ts
// 方案候选(实施轮敲定具体形态):
// A. metadata.syncToCustomer?: boolean
// B. tags 含约定值如 'publish' / 'sync-northbound'
// C. 独立字段 publishToCustomer?: { subSysType, menuId, ... }
```
H009 实施时定方案 A/B/C,本决策只锁定"数据源 = listTemplates + 选择性上报"。

### 理由

1. **打通 D001**: D001 定了 caseTemplate↔TaskTemplate 映射,但数据层一直是断点(getTestCaseAll 用 configuredTestCases 而非模板)。本决策让映射真正生效。
2. **量化可行**: caseTemplate 23 字段,18 个能从模板填/占位,5 个填空(caseId/checkPoints/execSteps/relationCaseSubSysType/parentId)。不阻塞。
3. **单一真相源**: 避免用户在"模板管理"和"用例目录"两处维护重复数据(B 选项的割裂问题)。
4. **保留控制权**: 标记机制让用户可选哪些模板上报(A 选项"全暴露"的问题被规避)。

### 排除的替代方案

- ❌ **A 全部模板序列化(无标记)**: 现有 4 个东方红模板会全暴露给甲方,且本地可能有调试用模板不该上报。过度耦合。否决。
- ❌ **B 维持 configuredTestCases(S008 JSON 编辑器)**: 与本地模板并行两套数据,维护两遍,易割裂。D001 映射继续悬空。否决。
- ❌ **D 只对齐协议结构,数据源后定**: 保守但让 D001 映射继续是纸上概念,H009 失去明确目标。否决。

### 字段填充策略(配合 D001 的"填空/默认值"决定)

| caseTemplate 字段 | 来源 | 示例值 |
|------------------|------|--------|
| outCaseId | templateId | "tpl-xxx" |
| caseName | name | "整机复位" |
| caseType | 固定 | "orbit"(或按业务定) |
| subSysId/subSysName/menuId/menuName | 全局配置(NorthboundConfig,**我们 laser 的**) | laser 的 subSysId/"激光载荷"/... |
| depSubSys/depSubNe | 全局配置(laser 域) | 按实际填 |
| durate/satelliteCount/stationCount | 默认值 | 600/1/1 |
| isParent/children | 固定 | false/[] |
| sortOrder/remark | 模板元数据或默认 | 序号/空 |
| priority/relationCaseId/relationCaseSubSysType/parentId | null/空 | — |
| **caseId**(甲方内部ID) | **不填,甲方自生成** | — |
| **execSteps** | 模板 steps 序列化(见 D003 同源映射) | 按 parId 命名规范生成 |
| **checkPoints** | null(暂不支持) | — |

> 注: 上方示例值原误用 ka 子系统样本("ka子系统"/"KPS"/"UE:1"),2026-06-18 D003 纠正:那些是兄弟子系统 ka 的数据,与我们 laser 无关。laser 的 subSysId/menuName 等用我们自己的全局配置。

### 影响范围

- **types.ts**: TaskTemplate 加"上报"标记字段(实施轮定方案 A/B/C)
- **task-template-storage.ts**: schema version 升级 + migration(标记默认 false)
- **northbound-service.ts:489**: getTestCaseAll 从 `configuredTestCases` 改为 `taskService.listTemplates()` 过滤标记
- **TemplateListPage.vue**: 模板编辑 UI 加"上报给甲方"开关/标签
- **configuredTestCases / setTestCatalogData**: S008 的 JSON 编辑器数据源**逐步废弃**(H009 后可移除,或降级为调试用途)
- **H009**: 实施本决策(标记字段 + 序列化器 + getTestCaseAll 切换 + UI 开关)

### 来源

- R002(工程量评估 + 本地关联验证,指出模板层断点)
- D001(caseTemplate↔TaskTemplate 映射,数据层需打通)
- 用户决定(2026-06-17): 选 C"模板加上报标记"
- 触发原话: 见 voice.md 2026-06-17

---

## D003: 翻译层模型 = 双向同源映射(推翻 R002 "翻译层站不住")

> status: active
> date: 2026-06-18
> 取代：无(推翻 R002 的错误结论 + 派生 agent 的核查报告)
> 被取代：无

### 决策

northbound↔task 的翻译层采用**双向同源映射**模型:parId↔frameId 的映射**由我们单方面定义**,上报(getTestCaseAll)和下发(setTestTask)两端共享同一份映射。

```
上报方向(getTestCaseAll):
  我们的 TaskTemplate.steps → 序列化成 caseTemplate
  parId 由我们命名,直接对应我们的 frameId/fieldId(如 "LAS.<frameId>.<fieldId>")

下发方向(setTestTask):
  甲方下发的 testCaseId = 我们当初上报的 outCaseId
  inputPars[].parId = 我们当初命名的 parId
  → 反查回 frameId/fieldId,重建 TaskInstance
```

两端同源,不存在"猜甲方语义"的问题。

### 核心认知纠正(推翻前序错误)

**事实(用户 2026-06-18 确认 + 附录 10-附录.md:141-156 系统分类表)**:
- 甲方 = 集成控制子系统(SOCC-CQ-CCS),下挂 5 个平级二级子系统
- 我们 = **激光载荷测试子系统(SOCC-CQ-LAS)**,是 5 个之一
- HAR 里的 ka 子系统(SOCC-CQ-KPS)是**另一个平级兄弟**,不是我们
- HAR 91 处 subSysName 全是 "ka子系统",**laser 数据一份都没有**
- 用例同步是**甲方前端点"用例同步"按钮 → 调我们的 getTestCaseAll → 我们发过去**;不是甲方填的

**被推翻的结论**:
- ❌ R002 "parId→frameId 翻译层站不住,88% 对不上" —— **错误**。错在拿 ka 的 parId(`NR_Parameters.px_*`/FTP/Ping)去对 laser 的 frame 库,两个子系统的命名空间本来就不互通。
- ❌ 派生 agent 核查报告 "直接映射可行性 0%" —— **基于错误前提,结论无效**。
- ❌ R002 建议"按用例类型整批映射,放弃逐参数翻译" —— **不再必要**。逐参数映射天然成立,因为两端都由我们定义。

**正确的理解**:
- parId 是**各子系统自定义、中心只透传不解析**的(07-参数配置与查询.md:117)
- ka 的 parId 是 ka 自己定义给自己用的,永远不会出现在 laser 的 frame 库里 —— **对不上是正常的、应该的**
- laser 的 parId 由我们定义,自然对应 laser 的 frame/field —— **翻译是自洽的**

### 理由

1. **同源保证**: 上报和下发用的是同一套我们定义的 parId 命名,映射表在我们手里,不存在外部依赖。
2. **文档印证**: 07-参数配置与查询.md:117 明确 parId 由子系统自定义、中心不解析。这是甲方设计的命名空间隔离机制。
3. **闭环验证**: 甲方下发的 testCaseId 就是我们上报的 outCaseId(用户确认),不存在甲方凭空造 laser 用例的情况。

### 排除的替代方案

- ❌ **按用例类型整批映射(R002 的建议)**: 基于 ka 数据对不上的错误判断。同源模型下逐参数映射天然成立,无需降级。否决。
- ❌ **扩展 frame 库补 ka 业务帧**: 我们根本不需要执行 ka 的业务(Ping/FTP/流媒体),那是 ka 子系统的事。否决。
- ❌ **硬写 parId→frameId 对照表(外部知识驱动)**: 映射不应来自"调研甲方语义",而应来自"我们上报时自己建立"。否决,改用命名规范自动生成。

### 影响范围

- **R002**: 翻译层部分需重写(从"站不住/中等工程"改为"同源映射/简单工程")
- **R001**: 标注 HAR 是 ka 数据,对 laser 仅有结构参考价值(caseTemplate 字段结构),无字段值参考价值
- **翻译层实施方向**: parId 命名规范 + 上报序列化器 + 下发反查器(两端共享映射),不再是"领域知识密集型调研"
- **D001/D002 不受影响**: caseTemplate↔TaskTemplate 映射 + 数据源(模板加上报标记)仍成立
- **本轮代码清理不受影响**: setTestTask 协议层结构(caseSet 删除/nodes 改字符串)与子系统无关,仍正确

### 来源

- 用户纠正(2026-06-18): "甲方那边有三个子系统,我们是其中一个,ka是另一个" + "用例是甲方那边前端点击用例同步按钮,我们这边给发过去的,不是他们填的" + "testCaseId 是我们当初上报的 outCaseId"(确认)
- 附录 10-附录.md:141-156 系统分类表(5 个子系统,LAS 是我们)
- HAR 证据: 91 处 subSysName 全是 ka,laser 0 处
- 07-参数配置与查询.md:117(parId 由子系统自定义,中心只转发不解析)
- 触发原话: 见 voice.md 2026-06-18
