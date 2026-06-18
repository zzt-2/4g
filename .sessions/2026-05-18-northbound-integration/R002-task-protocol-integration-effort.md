# R002 — task 系统 ↔ 甲方协议 对接工程量评估

> 2026-06-17 | 关联: H008 / D001 / R001 / inbound-translator.ts TODO
> 证据来源: 现有代码(task/frame feature 源码) + 04-任务管理.md + 03-用例管理.md

> ⚠️ **2026-06-18 重大认知纠正(见 D003)**: 本文件的**翻译层评估部分(发现1、鸿沟、工程量结论)基于错误前提,已被推翻**。
>
> **错误根源**: 派生 agent 用 HAR 里 **ka 子系统**的 parId(`NR_Parameters.px_*`/FTP/Ping)去对照我们 **laser** 的 frame 库,得出"88% 对不上,翻译层站不住"。但 ka 与 laser 是平级兄弟子系统,parId 命名空间隔离(07-参数配置与查询.md:117),对不上是**正常的**。
>
> **正确认知(D003)**: 用例是我们通过 getTestCaseAll **主动上报**给甲方的(D002),parId 由我们定义,自然对应我们的 frame/field。上报和下发**双向同源**,翻译天然成立,不是"领域知识密集型"工程。
>
> **本文件仍有效的部分**: UI/UX 鸿沟评估(northbound 0 个 .vue)、本地关联验证(实例层已通/模板层断点)、工程量拆块的结构。**无效的部分**: 翻译层"站不住/中等工程"结论 → 应为"同源映射/简单工程"。
>
> 以下原文保留作为**错误路线记录**(治理要求留档,防重蹈覆辙),阅读时请以 D003 为准。

## 调研问题

用户问:"我们这边任务和甲方接起来要怎么做?是不是大工程?"

具体拆成 3 个子问题:
1. 两边结构差在哪?(鸿沟是什么)
2. 现有基础设施够不够支撑对接?(地基是否就绪)
3. 真正要写的代码量有多大?(工程量量级)

## 发现 1:鸿沟只有一处 —— parId 到 frameId/fieldId 的翻译

### 我们的 task 结构(已成熟)

```
TaskTemplate (定义,长期保存)
  └ definition: TaskDefinition
      ├ steps: TaskStepDefinition[]
      │   ├ send    { frameId, userFieldValues: {fieldId: value}, targetId }
      │   ├ wait-condition { conditions: [{frameId, fieldId, operator, threshold}] }
      │   └ delay   { durationMs }
      ├ schedule / errorPolicy / stopCondition
```

执行引擎完整:`task-service` + `task-step-executors` + `lifecycle` + `condition-matcher` + `target-resolution`,带全套测试。

### 甲方下发的 TestCaseInfo(协议层,R001 已厘清)

```
TestCaseInfo
  ├ testCaseId
  ├ inputPars: [{ parId, value }]    ← 只有这两个字段!
  ├ deviceIds / masterTest / testMode / ephMode / orbitInfo(都可选)
```

### 鸿沟

| 甲方侧 | 我们侧 | 鸿沟 |
|--------|--------|------|
| `inputPars[].parId` | `send.frameId` + `userFieldValues` | 🔴 **parId 怎么变成 frameId?** —— 这就是 `inbound-translator.ts:25-30` TODO 说的"parId → frameId/fieldId 映射表不存在" |
| `inputPars[].value` | `send.userFieldValues[fieldId]` | 🟡 value 要塞进哪个 fieldId?也靠映射表 |
| 无显式 step 序列 | `steps[]` 有序 | 🟡 一个用例有几个 step?顺序? —— 需要从用例定义(caseTemplate.execSteps)或参数依赖推断 |
| `testCaseId` | `TaskTemplate.templateId` | 🟢 D001 已定:caseTemplate ↔ TaskTemplate |
| `deviceIds` | `send.targetId` | 🟡 device → target 映射(但 target 有 fallback 机制,target-resolution.ts) |

**核心结论: 鸿沟的本质是"甲方给的是参数键值对,我们要的是 step 序列 + frameId"。中间需要一个翻译层。**

## 发现 2:地基几乎全就绪,不缺执行能力

| 基础设施 | 状态 | 证据 |
|----------|------|------|
| frame 体系 | ✅ 成熟 | `dongfanghong-frames.ts` 67KB,176 个 frame/field 定义,有 editor/validation/service/state + e2e 测试 |
| task 执行引擎 | ✅ 就绪 | task-service/step-executors/lifecycle/condition-matcher 全套 + 测试 |
| TaskTemplate 持久化 | ✅ 就绪 | task-template-storage.ts(localStorage, schema version) |
| 入站接收 | ✅ 就绪 | handleSetTestTask 已实现,setTestTask → testCaseInfo → processLayers(本轮已修对齐文档) |
| 出站报告 | ✅ 就绪 | outbound-translator + test-report-generator + FTP 上传 |
| **parId→frameId 映射表** | ❌ **不存在** | inbound-translator.ts TODO 明说"this mapping table does not exist yet" |
| **caseTemplate.execSteps 解析** | ❌ 不存在 | 甲方用例的执行步骤描述(文本/结构)我们还没解析 |
| 真实设备对接 | ❌ 不存在 | send-service/receive-event-source 现在是 fake adapter |

**关键判断: 这不是"从零造执行引擎"的大工程。地基 70% 就绪,真正缺的是中间那层翻译。**

## 发现 3:工程量量级 —— 中等,核心是翻译层

把对接拆成 5 块,按工程量排序:

### 块 A: parId → frameId/fieldId 映射表 + 翻译器(核心,中等)

这是最大的工作量。要做的事:
1. **设计映射表 schema**: `parId → { frameId, fieldId, stepRole: 'send-value' | 'wait-threshold' }`
2. **数据来源**: 从甲方 caseTemplate 的 paramList(HAR 有真实例子,如 `Delay_AfterCFUN_1`/`NR_Parameters.px_PingNum`/`guardtime`/`PingLimitExpect`)反推每个 parId 对应哪个 frame 的哪个字段
3. **翻译器实现**: `translateTestCaseToTaskDefinition(tc: TestCaseInfo) → TaskDefinition` —— 把 inputPars[] 翻译成 send/wait steps

**工作量**: 需要先搞清甲方到底有多少种 parId(HAR 里 caseTemplateParam 有样本),每种都要对应到一个 frame。这是**领域知识密集型**,不是纯代码工作——要懂"Delay_AfterCFUN_1 对应哪条指令的哪个字段"。

**当前占位**: inbound-translator.ts 现在是 mock(固定 1.5s delay step),`translateTestCaseToTaskDefinition` 直接调 mock。这个占位**已经能让联调跑通流程**(甲方下发 → 我们 mock 执行 → 报告回传闭环),只是执行的不是真实指令。

### 块 B: 用例同步 getTestCaseAll(中等,R001 已定方向)

D001 已定:返回扁平 caseTemplate 列表,字段填空/默认值。
- 要做: 把我们的 TaskTemplate 序列化成 caseTemplate 结构(32 字段,大部分填占位)
- 工作量: 1 个 translator 函数 + 类型对齐,约半天

### 块 C: controlTestTask 联调验证(小,阻塞在 NAT)

action 种类文档矛盾(abort vs 四种),需 NAT 恢复后实测。代码已按四种实现,风险低。

### 块 D: 真实设备 send/receive 对接(大,但与 northbound 解耦)

fake-send-service / fake-receive-event-source 要换成真实适配器。但这是**设备层**工作,和 northbound 协议解耦——northbound 把 TestCaseInfo 翻译成 TaskDefinition 后,执行靠 task 引擎,引擎再调 send/receive。设备对接是独立工程,不阻塞 northbound 闭环验证。

### 块 E: 执行结果真实性(中,部分就绪)

test-report-generator 已实现,但生成的报告内容(sigReport/数据文件)现在靠 mock。真实数据要等设备对接(块 D)。

## 工程量总判断

| 维度 | 评估 |
|------|------|
| 整体定性 | **中等工程,不是大工程**。地基就绪,核心缺翻译层 |
| 阻塞 northbound 闭环的最小工作量 | **块 A(翻译层)+ 块 B(getTestCaseAll)**。这俩做完,联调能验证"甲方下发用例 → 我们翻译成真实 task → 执行(可先 mock send)→ 报告回传"全链路 |
| 块 A 的真正难点 | 不是代码,是**领域映射知识**:甲方 N 种 parId 各对应哪个 frame/field。需要对照 frame 库(176 定义)逐个确认 |
| 现在能跑通的最小闭环 | mock 翻译层已经在跑(inbound-translator 现状)。能验证协议握手/接收/报告回传,只是执行的是假动作 |
| 与设备对接的关系 | 解耦。设备对接(块 D)是独立工程,不阻塞 northbound 协议验证 |

## 建议的推进顺序(回答"怎么做")

1. **现在(本轮已完成)**: 类型对齐文档(D001 + 代码清理)—— 消除协议层/UI 层混淆
2. **H009**: getTestCaseAll 真实化(块 B)—— 让甲方能看到我们的用例。方向已定,半天工作量
3. **H010 关键调研**: parId 样本采集 —— 把 HAR 里 caseTemplateParam 的真实 parId 全列出来,对照 frame 库评估映射可行性。**这是块 A 的前置调研,决定翻译层真实工作量**
4. **H011**: 翻译层实施(块 A)—— 如果 H010 证明 parId 能映射,就实现 translateTestCaseToTaskDefinition
5. **并行/后续**: 设备对接(块 D)—— 独立工程,不阻塞 1-4

## UI/UX 鸿沟评估(2026-06-17 追加)

用户提醒"逻辑通了发现没法做成 UI"。核查现有 UI 后,发现 UI 是工程量的**第二块大头**,且有个被忽视的事实。

### 现有 task UI 盘点(已成熟)

| 组件 | 能力 | 文件 |
|------|------|------|
| `TaskManagePage` | 双 tab:模板管理 + 执行监控 | `pages/TaskManagePage.vue` |
| `TemplateListPage` | 模板 CRUD / 导入导出 / tag 过滤 / 实例化 | `components/TemplateListPage.vue` |
| `ExecutionListPage` | 执行实例列表 + 状态过滤 + step 详情 + 历史 | `components/ExecutionListPage.vue` |
| `SendStepEditor` | frameId 选择 / 字段值编辑 / target / repeat | `components/SendStepEditor.vue` |
| `WaitConditionStepEditor` | conditions 编辑(frameId/fieldId/operator/threshold) | `components/WaitConditionStepEditor.vue` |
| `DelayStepEditor` | 延时编辑 | `components/DelayStepEditor.vue` |

**结论**: step 级编辑 UI 完整,能渲染和编辑翻译层产出的所有 step 类型(send/wait-condition/delay)。

### 🔴 最大鸿沟:northbound 完全没有 UI

核查发现 `src/features/northbound/` **0 个 .vue 文件**,UI 侧 **0 处引用** northbound/getTestCaseAll/setTestTask。

这意味着:甲方下发用例、用例同步、任务执行、报告回传**全发生在后台,用户在界面上看不到任何与甲方交互的痕迹**。

### 好消息:甲方下发的实例天然能展示

`handleSetTestTask` → `createTask` 创建的 TaskInstance 进的是**同一个 taskService**。所以 ExecutionListPage(读 taskService 实例)**天然能展示甲方下发的实例**,不需要新建列表组件。只是用户**分不清哪些是本地启动、哪些是甲方下发**。

### UX 鸿沟清单(用户视角的断点)

| 用户想知道/想做的事 | 现状 | 缺什么 |
|---------------------|------|--------|
| 甲方下发了哪些用例给我? | ❌ 看不到 | 需 UI 展示收到的 setTestTask(可复用 ExecutionListPage,加"来源"标记) |
| 我的用例同步给甲方了吗?(getTestCaseAll) | ❌ 无感知 | 需"用例同步"状态展示(同步时间/数量/失败原因) |
| 甲方下发的用例,参数是什么?(inputPars) | 🟡 step 详情能看,但 parId↔frame 关系不直观 | 翻译层成熟后,step 详情自动展示。短期可加"原始报文"查看 |
| 甲方任务和我的本地任务怎么区分? | ❌ 混在一起 | ExecutionListPage 加"来源"列(本地/甲方taskId) |
| 与甲方的连接状态?(login/heartbeat) | ❌ 无 UI | 需 northbound 连接状态指示器(类似 ConnectionPage) |
| 执行结果回传给甲方了吗? | ❌ 无感知 | 报告回传状态展示 |

### frontend-design skill 适用性判断

用户提到加了 frontend-design skill。**核查后判断:当前不适用**。理由:
- 该 skill 强调"大胆美学方向""独特字体""令人难忘的视觉"(brutalist/maximalist/retro-futuristic)
- 本项目是**工业上位机软件**(东方红卫星测试),用 Quasar + Vue,有成熟设计系统(`rw-color-surface`/`rw-divider-b`/`rw-text-value` 等 token)
- 当前需求是**功能 UI 兜底**(northbound 无 UI),不是**美学不够独特**
- 在工业软件里搞视觉创新会破坏现有设计系统一致性

**何时可能用得上**: 如果将来要把 TaskManagePage 做成"任务指挥中心"式的信息密度界面(多面板/实时流/状态总览),且需要突破 Quasar 默认观感时,可考虑。但前提是先有功能 UI。

### UI 工程量判断

| UI 工作项 | 工作量 | 依赖 |
|-----------|--------|------|
| ExecutionListPage 加"来源"标记(区分本地/甲方) | 小 | 无,可立即做 |
| northbound 连接状态指示器 | 小 | 无 |
| getTestCaseAll 同步状态展示 | 小 | 依赖 H009 |
| "原始报文/参数"查看(翻译层未成熟前) | 小 | 无 |
| 翻译层 step 详情的自然展示 | 0(已支持) | 依赖 H011 |
| 报告回传状态展示 | 中 | 依赖报告生成 |

**结论**: UI 不是从零建设(地基在),核心是给 northbound 补"可见性"——让用户看到甲方交互的全过程。多数是小工作量,且依赖翻译层(H011)和同步(H009)的产出。

## 与本地 task 系统的关联(2026-06-17 验证)

用户问"这块和我自己的任务那边咋关联"。验证后结论:**关联分两层,实例层已打通,模板层是断点**。

### ✅ 实例层(运行时):已打通,同一 taskService

证据链(feature-wiring.ts):
- `:141` 创建单一 `taskService` 实例
- `:169` 注入本地执行链(UI 用的)
- `:184` **同一个 `taskService` 实例**注入 `createNorthboundService`

→ northboundService 调 `taskService.createTask`/`startTask`/`stopTask`/`subscribe`(northbound-service.ts:328/334/355/635),创建的甲方 TaskInstance 进的是**和本地 UI 完全相同的状态树**。

→ **ExecutionListPage 天然能展示甲方下发的实例**(它读 taskService 实例,不区分来源)。这是真的,不是推断。

→ controlTestTask 的 stop/pause/resume 也能直接作用到对应实例(通过 state.mapTaskId 反查)。

**唯一 UX 斪点**: ExecutionListPage 现在没法区分"本地启动"vs"甲方下发"的实例。TaskInstanceState 有 `templateId?`(从模板创建则填),但甲方实例从 inputPars 翻译而来,templateId 可能为空。**H012 要补"来源"标识**(如 `source?: 'local' | 'northbound'` + 关联的 customerTaskId/testCaseId)。

### 🔴 模板层(定义层):断点,数据没同步

这是关联的另一半,也是 **H009 的核心问题**。

证据(northbound-service.ts:489):
```
getTestCaseAll 上传的是 configuredTestCases,不是本地 TaskTemplate
```

现状:
- `configuredTestCases` 来自 UI 的"用例目录"JSON 编辑器(S008 做的,在 CommandIngressPage 的"用例目录"tab)
- 本地 TaskTemplate 在 `taskService.listTemplates()`(TemplateListPage 读)
- **两个数据源,互不相通**

D001 定的映射(caseTemplate ↔ TaskTemplate)目前**只是类型层概念,数据层没接**。

→ H009 要做的不只是"返回 caseTemplate 结构",还要决定:**getTestCaseAll 的数据从哪来?**
- **选项 A**: 从 `taskService.listTemplates()` 序列化(真正打通 D001 映射,本地模板即甲方用例)
- **选项 B**: 维持 configuredTestCases(保留 S008 的 JSON 编辑器,与本地模板并行)
- **选项 C**: 两者并存(本地模板可选"上报给甲方")

这是 H009 实施前必须拍板的设计选择,会影响整个 UI 形态(用户在哪管理"要给甲方的用例")。

### 关联全景图

```
本地侧                              甲方侧
─────                              ─────
TaskTemplate (TemplateListPage)  ──┐
                                   │ 模板层映射(D001,数据层断点)──→  caseTemplate (getTestCaseAll)
                                   │                              ←─  [H009 要接]
TaskInstance (ExecutionListPage) ←─┘ 实例层(已通,同一 taskService) ──→ setTestTask 下发
   │                                                                  ↓
   └─ source?: local|northbound  ←── [H012 要补] ──→  controlTestTask 控制
```

## 对决策的影响

- **不需要新 D###**: 工程量评估是过程性结论,不改变现有架构决策(D001 映射方向仍成立)
- **建议拆分后续 H###**: H009(getTestCaseAll)/ H010(parId 映射调研)/ H011(翻译层实施)/ **H012(northbound UI 可见性)**,避免一个巨大 H### 难以追踪
- **明确"大工程"误解来源**: 用户感觉"大"可能因为看到了甲方复杂 UI 模型(caseSet/taskFlowchart)。但协议层(R001 厘清后)很简单,执行地基也成熟。真正的工作量集中在两块:① parId→frameId 翻译层(领域知识密集)② northbound UI 可见性(补"能看到甲方交互"的功能 UI)
- **frontend-design skill 暂不启用**: 当前是功能 UI 需求非美学需求,且工业软件需保持设计系统一致性

## 与"之前讨论"的关系

用户提到"之前记得有些讨论"。本轮在 .sessions/ 搜 preHandle/afterHandle/翻译层/映射表 **无命中**。topic-index:最后"已知未做"列了"preHandle/afterHandle 翻译层"——这是**当前 topic-index 的措辞**,不是历史讨论记录。推测:preHandle/afterHandle 可能是更早(rewrite 之前/其他仓库)的术语,对应现在的 inbound/outbound translator。本评估用现有代码实际命名(inbound-translator/outbound-translator)为准。
