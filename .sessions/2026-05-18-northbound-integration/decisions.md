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
| subSysId/subSysName/menuId/menuName | 全局配置(NorthboundConfig) | "2054..."/"ka子系统"/... |
| depSubSys/depSubNe | 全局配置 | "KPS"/"UE:1" |
| durate/satelliteCount/stationCount | 默认值 | 600/1/1 |
| isParent/children | 固定 | false/[] |
| sortOrder/remark | 模板元数据或默认 | 序号/空 |
| priority/relationCaseId/relationCaseSubSysType/parentId | null/空 | — |
| **caseId**(甲方内部ID) | **不填,甲方自生成** | — |
| **execSteps** | 模板 steps 序列化或空 | 待 H011 翻译层定 |
| **checkPoints** | null(暂不支持) | — |

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
