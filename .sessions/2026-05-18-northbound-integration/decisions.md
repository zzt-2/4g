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

> status: active(partially-superseded)
> date: 2026-06-17
> 取代：无
> 被取代：部分被 D004 推翻(2026-06-22)
>
> > 部分被 D004 推翻:上报标记不再挂 TaskTemplate(CustomerSyncMeta 删除),改归 command-ingress 映射表。**数据源仍是 listTemplates/getTemplate 不变**,只是"哪些模板上报 / 可覆盖哪些字段"的规则从模板字段移到独立映射表。

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

---

## D004: 映射表归 command-ingress(推翻 D002 的耦合设计)

> status: active
> date: 2026-06-22
> 取代：D002 的"挂 TaskTemplate"部分(数据源不变)
> 被取代：无

### 决策

「是否上报给甲方」+ 「甲方可覆盖哪些字段」这两个规则,**由 command-ingress feature 维护一张「task 模板 → 甲方用例」映射表持有**,不再挂在 task 的 TaskTemplate 上。getTestCaseAll 的数据源仍是 task 模板定义(走 `taskService.getTemplate`),但"哪些模板上报 / 各自可覆盖哪些字段"的规则从 command-ingress 映射表读。

**三层职责划分(H009 不变量)**:
- **task feature**:纯粹的执行引擎。TaskTemplate 只有 templateId/name/tags/definition/时间戳,**不带任何甲方字段**。本轮(D002 实施)加的 CustomerSyncMeta + TaskInstanceState.source/customerTaskId 全删。
- **command-ingress feature**:负责"和甲方对接"。维护 CatalogMapping 映射表(templateId / enabled / overridablePaths / outCaseId / reportedAt),localStorage key `northbound-docking-catalog-mappings`。
- **northbound feature**:协议层。getTestCaseAll 读 command-ingress 映射表(过滤 enabled)→ 取 task 模板定义 → encode。setTestTask decode 的 overridablePaths 从快照(上报时由 encode 写入,来源已是映射表)读。**不持有业务规则,规则从 command-ingress 传进来**。

**数据流(D004 后)**:
```
task 模板(纯粹,无甲方字段)
  ↓ command-ingress 映射表(记录"模板X上报给甲方,可覆盖字段Y/Z")
  ↓ northbound encode(模板定义 + 映射规则 → caseTemplate)
  ↓ getTestCaseAll 返回甲方 + 存快照(overridablePaths 来自映射表)
  ↑ setTestTask 下发 → northbound decode(快照 + 映射规则 → 覆盖后的 definition)
  ↑ task createTask 执行
```

### 理由

1. **职责解耦**:任务系统(task feature)本该只管"怎么执行任务"。把"要不要给甲方""甲方能改哪些字段"塞进 task 模板,是跨职责耦合 —— 任务模板被迫关心甲方的存在。映射表归 command-ingress 后,task 模板保持纯粹。
2. **command-ingress 已有对接基础设施**:use-central-docking 已管 config/devices/catalog 三份数据 + localStorage 持久化,映射表作为第四份数据自然挂入,无需新建 feature。
3. **翻译器往返一致性不变**:encode 生成的 parId,decode 必须能定位回(D003 双向同源)。改的只是 overridablePaths 的**来源链**(模板字段 → 映射表),往返逻辑零改动,10 个 translator 测试核心断言全保留。

### 排除的替代方案

- ❌ **维持 D002(CustomerSyncMeta 挂 TaskTemplate)**:跨职责耦合,任务系统被迫感知甲方。用户明确反对("其实我不是很想把是否上报给甲方和任务模板那边耦合到一起,这不好")。否决。
- ❌ **northbound 自己持映射表**:违反"northbound 是协议层不持有业务规则"不变量。否决。
- ❌ **把映射表做成 task feature 的元数据(非 customerSync 命名)**:无论字段叫什么,只要挂在 TaskTemplate 上就是耦合。否决。

### 影响范围

- **task/core/types.ts**:删 CustomerSyncMeta + TaskTemplate.customerSync + TemplateUpdates.customerSync + TaskInstanceState.source/customerTaskId(S012 已执行)
- **task/composables/use-template-editor.ts**:删 syncEnabled/overridablePathsText 状态及相关 save/openEdit/resetForm 逻辑(S012 已执行)
- **task/components/TemplateListPage.vue**:删"上报给甲方"开关 + 路径编辑器(S012 已执行)
- **command-ingress/core/catalog-mapping.ts**:新建 — CatalogMapping 接口 + CRUD + localStorage 持久化(S012 已执行)
- **command-ingress/composables/use-central-docking.ts**:加 catalogMappings 第四份数据 + saveMapping/deleteMapping(S012 已执行)
- **northbound/core/testcase-sync-translator.ts**:`encodeTaskTemplateToTestCase(template, config)` → `encodeSourceToTestCase(source, mapping, config)`,新增 EncodeSource 接口(S012 已执行)
- **northbound/services/northbound-service.ts**:加 setCatalogMappings 方法 + handleGetTestCaseAll 数据源改为映射表(S012 已执行)
- **northbound 保留**(H009 明确不动):path-resolver / reported-snapshot-storage / report-data-collector / test-report-generator / decode 链路逻辑 / CustomerResponse.datas 字段
- **D002**:标记 partially-superseded(数据源仍是 listTemplates/getTemplate 不变,只是上报标记移走)

### 来源

- H009(2026-06-19 方向调整 handoff,用户指出耦合错误)
- S012(2026-06-22 实施,本决策落地)
- 触发原话: 见 voice.md 2026-06-19(H009)+ 2026-06-22(S012 录入)

---

## D005: auth 出站请求加显式前置校验(password/username 非空 + access_token 缺失报错)

> status: active
> date: 2026-06-23
> 取代：无
> 被取代：无

### 决策

`auth.ts` 的 `login()` 在发请求前**必须显式校验** `password` / `username` 非空,收到响应后**必须校验** `access_token` 存在。任一不满足直接抛明确错误,**绝不**让 undefined 被 `JSON.stringify` 静默吞掉、或把失败响应当成功。

### 理由

1. **同 bug 复发两次(S011 + S013),证明代码无防御**:S011(2026-06-13)定位"password 缺失(JSON.stringify 自动省略 undefined)",当时只在笔记里写了"附带建议(未修)"——结果 S013(2026-06-23)同一 bug 又犯。不加固防御,第三次复发只是时间问题。
2. **根因不可控(配置/持久化/UI 多路径都可能让 password 变空),防御层是兜底**:S013 还定位到 `persistConfig` 漏存 password 的缺陷(已修),但运行时仍可能有其他路径让 `config.password` 为空/undefined。auth 层的前置校验是**最后一道兜底**,确保无论上游怎么丢,都不会发出缺字段的 body 招致甲方 400。
3. **失败响应误读为成功(S011 bug #2)**:旧代码把无 `access_token` 的错误响应当成功缓存,打印误导性的"登录成功,token 有效期 0s"。必须改成无 token 即抛错。

### 排除的替代方案

- ❌ **只在 UI 层校验(password 必填)**:UI 校验是第一道(S013 也加了),但 UI 不是唯一入口——脚本/测试/其他调用方都可能绕过 UI 直接构造 config。auth 层必须自校验。否决"只靠 UI"。
- ❌ **靠 JSON.stringify 的 undefined 省略"自然暴露"问题**:这正是 bug 本身。省略导致请求体缺字段,甲方报"参数校验异常",排查链路长。必须前置拦截。否决。
- ❌ **失败响应静默缓存(旧行为)**:误导日志("登录成功"实为失败)+ 后续所有出站请求带 undefined token 必然失败,排查更难。否决,必须报错。

### 影响范围

- **`auth.ts`**:`login()` 开头加 password/username 非空检查(抛错,不发请求);响应解析后加 `access_token` 存在检查(无则抛错)。返回的 AuthService 接口不变。
- **`auth.spec.ts`**:+2 测试 case(undefined password / 空串 password 都抛错且不发请求)。9/9 过。
- **`use-central-docking.ts`**:`persistConfig` 补 password 字段(并行修复,根因之一),`PersistedConfig` 接口 + 函数同步加。+1 测试文件 `docking-config-persistence.spec.ts`(3 case)。
- **`DockingConfigDialog.vue`**:password 输入框加必填 rules(UI 第一道校验)。
- 不影响 D001~D004(翻译/映射/数据源方向不变)。

### 来源

- S011(2026-06-13,同 bug 首次定位,笔记"附带建议(未修)")
- S013(2026-06-23,同 bug 复发,本轮加固防御)
- 用户原话"目前又 tm 连不上了"(实为登录被拒)→ 触发本轮
- 触发原话: 见 voice.md 2026-06-23

---

## D006: getTestCaseAll 走 FTP 文件传输(datas 是文件内容,不是 HTTP 响应体字段)

> status: active
> date: 2026-06-23
> 取代：无(推翻我此前基于错误代码实现的脑补理解,非取代某 D###)
> 被取代：无

### 决策

getTestCaseAll 的用例数据**走 FTP 文件传输**,不走 HTTP 响应体。完整流程:

```
甲方: POST getTestCaseAll(请求体只有信封字段,不带 ftpInfo)
  ↓
我们 handleGetTestCaseAll:
  1. 取映射表 + 模板 → encode → testCases 数组
  2. 序列化文件内容: JSON.stringify({ datas: testCases })   ← {datas:[...]} 包裹,不是裸数组
  3. FTP 上传到【我们自己配的 config.ftp】+【我们自己建的路径】:
     remotePath = `${config.ftp.basePath}/${yyyy-mm-dd}/testcase_all.json`
  4. 回应 getTestCaseAll: statusCode:1,响应体【只有信封字段,无 datas】
  5. 主动调 fileTranslationComplete(tranType:'upload', result:'success', filePath:remotePath)
     → 告诉甲方"文件传完了,在这个路径",甲方自己去 FTP 取
```

**四个关键点**:
1. **`datas` 是 FTP 文件 `testcase_all.json` 里的内容**,不是 HTTP 响应体字段。文档响应参数表(03-用例管理.md:73-91)根本无 datas 字段。
2. **FTP 地址/账号/端口我们自己配**(DockingConfigForm 加输入框),不用甲方请求里的 ftpInfo。
3. **路径我们自己建**:`basePath/yyyy-mm-dd/testcase_all.json`(加日期前缀,避免多份混一起)。
4. **上传后立即调 fileTranslationComplete** 通知甲方(不是另一场景,是同一条链的通知环节)。

### 文档铁证(03-用例管理.md)

- **L5**:"由于消息可能过大,所以采用 json 文件传输方式,文件后缀为 .json" —— 默认就是文件传输,非"备用"
- **L73-91 响应参数表**:无 `datas` 字段(只有 method/requestId/subSysType/subSysId/sessionId/statusCode/msg)
- **L158-517**:"测试用例属性信息**文件格式**定义",L163 `{"datas":[...]}` —— datas 是文件内容
- **L57 ftpInfo**:虽标注"此对象为备用",但结合 L5 看,实际意思是"FTP 地址可由请求方指定或二级子系统自定",**用户拍板用我们自己配的 config.ftp**

### 排除的替代方案(我此前错的理解,记录避免重蹈)

- ❌ **datas 走 HTTP 响应体,L586 那样的实现**:基于 S006 mock 时代错误代码的脑补。文档响应表无 datas 字段。**否决**,响应体只回信封。
- ❌ **FTP 地址用甲方请求里的 ftpInfo**:用户明确否决("ftp配置我们自己设,我能看见用户密码和ip端口")。ftpInfo 虽在协议里,但我们用自己的 config.ftp。
- ❌ **fileTranslationComplete 是独立场景,与 getTestCaseAll 无关**:错误理解。用户明确"甲方通过 fileTranslationComplete 了解在哪",它就是 getTestCaseAll 走 FTP 后的通知环节。
- ❌ **路径用 ftpInfo.dir**:用户明确"路径自己写,我们自己建路径",用 `basePath/yyyy-mm-dd/testcase_all.json`。

### 影响范围(下一轮 S015 / S014 续接实施)

- **`handleGetTestCaseAll`**(northbound-service.ts:543-587)重写:
  - 序列化改 `JSON.stringify({ datas: testCases })`(加包裹)
  - FTP 上传改用 `activeConfig.ftp`(我们配的),remotePath = `basePath/yyyy-mm-dd/testcase_all.json`
  - 响应体删 datas(L586 改成只回信封)
  - 上传后调 `reportFileTranslationComplete`(tranType:'upload', filePath:remotePath)
- **`DockingConfigForm` + `use-central-docking`**:加 FTP 配置 5 字段(host/port/username/password/basePath)输入框 + saveConfigAndConnect 传 ftp + 持久化
- **`NorthboundConfig.ftp`** 字段已存在(L54-60),无需改类型
- **顺带打通 `uploadTestReportAndNotify`**(L188-235):FTP 配置 UI 修好后,这条链(TestReport 上传 + testDataFileTranslationComplete)也能通(L196 不再早退)
- **测试**:handleGetTestCaseAll 相关单测要重写(原断言 parsed.datas 现在应不存在,改为断言 FTP 上传被调用 + fileTranslationComplete 被调)

### 待联调确认的字段细节(不阻塞代码框架)

- **fileType**:文档文件类型标识表(01-概述与约定.md:160-228)无 TestCase 类型。先占位 `TestCase`,联调有反馈再改。
- **fileIndex**:文档(05:502)说"中心下发时携带,未携带填 0"。先填 0。
- **`testDataFileTranslationComplete` vs `fileTranslationComplete`**:用户被问时先答前者,但讨论指向后者(通用版,带 tranType)。两者字段不同(ftpServerIP 大写 vs ftpServerIp 小写 + tranType)。联调确认 getTestCaseAll 通知用哪个。当前代码两个方法都有(reportTestDataFileComplete L774 / reportFileTranslationComplete L779)。

### 来源

- 03-用例管理.md L5/L73-91/L158-517(铁证:datas 是文件内容非响应体)
- 05-文件传输与结果上报.md L455-589(fileTranslationComplete 协议)
- 用户原话(2026-06-23 续接):
  - "你 tm 觉得我会跟你扯淡吗?这个流程是很明确的。因为他们用例都用的 tm 的 ftp,不然我在这折腾?"(纠正我"FTP 是备用"的脑补)
  - "ftp配置我们自己设,我能看见用户密码和 ip 端口。然后,路径自己写,我们自己建路径,甲方通过 fileTranslationComplete 了解在哪"(FTP 自配 + 路径自建 + fileTranslationComplete 通知)
  - "testDataFileTranslationComplete"(被问用哪个接口时的回答,但与后续讨论存在张力,见待澄清项)
- 触发原话: 见 voice.md 2026-06-23

---

## D007: FTP 主动/被动模式联调踩坑定位法 + 否决"关服务端被动模式"

> status: active
> date: 2026-06-24
> 取代：无
> 被取代：无

### 决策

(1) **FTP 文件传输联调出现"我方通甲方不通"时,默认假设:两端各自决定主动/被动模式,数据通道方向不同导致穿越防火墙能力不同。** 我方(basic-ftp)走被动(出站方向)能穿过"只放行 21"的防火墙,甲方 Java(默认主动,数据通道是服务端反向连客户端)在隔离网络必失败。正解是甲方代码加 `ftpClient.enterLocalPassiveMode();`,**不是改服务端配置**。

(2) **否决"关掉服务端被动模式"这条排查路径。** 关服务端被动会把唯一能工作的一端(我方上传)也搞死,且治不了甲方主动模式的病根。

(3) **定位方法定型**:用 `curl -v`(注意 PowerShell 下用 `curl.exe` 别用别名)从两端分别测被动读取,对比谁通谁不通;最终在 FTP 服务端 tcpdump 抓甲方 Java 的控制通道命令,看发的是 `PASV/EPSV`(被动)还是 `PORT/EPRT`(主动)。

### 核心失败机制

FTP 协议有控制通道(21)和数据通道(被动高位端口 / 主动客户端端口)两条:

- **被动模式(PASV)**:客户端 → 服务端高位端口(出站方向,和连 21 同向)
- **主动模式(PORT)**:服务端 → 客户端高位端口(入站方向,需客户端开端口给服务端连进来)

甲方 worker 所在网络"只放行了 21"(甚至公网都连不上,yum 都装不了)。于是:
- 被动模式数据通道(出站)能穿过 → 我方 basic-ftp + 甲方 curl 都能通
- 主动模式数据通道(入站)穿不过 → 甲方 Java(Commons Net FTPClient 默认主动)必然失败,表现为 worker 侧 `ConnectException: 拒绝连接`

### 否决了什么

- ❌ **关掉 vsftpd 被动模式(`pasv_enable=NO`)**:把我方(basic-ftp 只能被动)数据通道也搞死,从"我方通甲方不通"变成"两边都不通",治标不治本(甲方主动模式病根仍在)。甲方曾误走此路,产生 `ETIMEDOUT 10.15.5.93:18914`。
- ❌ **注释 vsftpd pasv_* 配置项企图"关被动"**:vsftpd `pasv_enable` 默认值就是 YES,**注释掉 = 用默认值 = 被动仍开着**,不是关闭。甲方误以为"注释=关闭",实际回到 baseline。
- ❌ **改服务端 `pasv_address`**:本轮排查曾假设服务端 PASV 返回了内网 IP,但 `quote PASV` 实测返回 `10.15.5.93` 正确,排除此假设。
- ❌ **怀疑 worker 到 10.15.5.93 网络隔离**:甲方 worker `telnet 10.15.5.93 21` 成功(`220 vsFTPd 3.0.3`),控制通道通,排除网络隔离。
- ❌ **我方改主动模式配合甲方**:basic-ftp 对主动模式支持极弱,改了大概率传不动,且不应为甲方 bug 牺牲我方正常链路。

### 可复用部分(定位 SOP)

1. **先确认两端控制通道都通**:`telnet <ftp-ip> 21` 各自测。都通 → 不是网络隔离。
2. **两端分别 curl 被动测读取**:
   - PowerShell: `curl.exe -v --user 'user:pass' "ftp://ip/path"`(注意 `curl.exe` 绕开 Invoke-WebRequest 别名;密码含 `!` 用单引号或 `set +H`)
   - 两端都成功 → 网络 + 服务端 + 文件 + 权限全正常,病根在客户端代码
   - 一端成功一端失败 → 失败端到 FTP 之间有防火墙挡数据端口
3. **服务端 tcpdump 抓控制通道命令**(排除已知能通的 IP):
   ```bash
   tcpdump -i any -A -s 0 'tcp port 21 and host <ftp-ip> and src host not <我方IP> and dst host not <我方IP>'
   ```
   让目标端触发一次读取,看抓到的命令:
   - `PASV`/`EPSV` → 走被动 → 模式不是病根,另查
   - `PORT`/`EPRT` → 走主动 = 病根坐实 → 客户端加 `enterLocalPassiveMode()`
4. **结论判定铁律**:同一台机器、同一 FTP、同样被动,curl 能读 Java 不能读 → 100% 是 Java 代码没走被动。

### 具体数据(本轮)

- 甲方日志首报:`fileType=CfgParam, filePath=/laser/2026-06-23/testcase_all.json, ServiceException(读取FTP远程文件失败: ConnectException: 拒绝连接)`,堆栈 `FileTransRecordWorker.readRemoteFile(:210) → processCaseInfoRecord(:140)`
- 甲方 telnet:`Connected to 10.15.5.93. 220 (vsFTPd 3.0.3)` → 控制通道通
- 我方 curl(10.15.4.54):`229 Entering Extended Passive Mode (|||40089|)` → `226 Transfer complete.` ✓
- 甲方 worker curl:被动读取成功 ✓(用户确认"成功啊?")
- 我方 tcpdump 抓到的是自己上传序列(`EPSV` → `STOR testcase_all.json` → `226 Transfer complete`),证明服务端被动模式工作正常(`pasv_enable=YES` 默认生效)
- vsftpd.conf 实情:`#pasv_enable=YES` / `#pasv_min_port=50000` / `#pasv_max_port=50100` 全注释 → 被动开 + 随机端口(baseline)
- **未抓到甲方 Java 的包**(需甲方触发 readRemoteFile),但 curl 两端通已足够定论:病根在甲方 Java 走主动模式

### 影响范围

- **我方代码**:零改动。basic-ftp 走被动(`ftp-handlers.ts` 默认),上传链路正常,不背锅。
- **甲方代码**:`FileTransRecordWorker.readRemoteFile`(java:210) connect+login 后加一句 `ftpClient.enterLocalPassiveMode();`
- **服务端配置**:vsftpd.conf 无需改(被动已开且工作)。若甲方 Java 切被动后仍偶发端口问题,再考虑固定 `pasv_min_port/max_port` + 放行(本轮未走到这步)
- **后续 FTP 类联调**:本 SOP 可复用于任何"我方通甲方不通"的 FTP 文件传输排查(TestReport.json 上传链若遇同类问题同法)
- **不影响 D006**:getTestCaseAll 走 FTP 的协议流程不变,本轮是传输层联调踩坑,非协议层

### 待办(联调未闭合项)

- [ ] 抓甲方 Java 的控制通道命令,坐实"走主动模式"(预期看到 `PORT`/`EPRT`)
- [ ] 甲方加 `enterLocalPassiveMode()` 后重跑 readRemoteFile,确认通
- [ ] 验证通过后,可考虑在 DockingConfigDialog 加 FTP 连通性自检按钮(我方 access() + 探测数据通道),把"控制通但数据超时/甲方主动模式"这类问题在上报前暴露 —— 非本轮范围,单列

### 来源

- 甲方日志(2026-06-23 23:09):readRemoteFile ConnectException 拒绝连接
- 甲方 telnet / 我方 curl / 甲方 worker curl / 我方 tcpdump(2026-06-24 联调实测数据)
- vsftpd.conf 实情(甲方贴出)
- 触发原话: 见 voice.md 2026-06-24

---
