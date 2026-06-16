# H008 — 甲方任务/用例/实例 粒度调研 Handoff

> 2026-06-16 | 调研 handoff | 状态: 待新对话执行
> 上游: S011 / H007 | 主对话统筹

## 背景:为什么需要这个调研

H007 把"getTestCaseAll 响应真实化"交接给新对话,但**只定了边界,没定粒度方案**。在交接准备阶段,主对话发现粒度问题需要**基于甲方最新文档 + 真实接口报文**才能拍板,旧文档(本专题 S001/S003 读过的 V1.0.4)和会话转述不足以下结论——用户已经在 HAR 联调时发现过一次"文档和真实流量对不上"(S008 第四轮),所以**任何粒度结论都必须由真实报文支撑**。

同时,用户对粒度方向存在困惑(见下方 User Voice),需要新对话先用真实证据厘清"甲方到底有几层概念",再回答映射怎么凑。

## 用户的核心困惑(原话见 voice.md 2026-06-16)

- 之前想法:我的任务 → 甲方任务,我的单帧 → 甲方实例
- 看了别人的(参考实现)后怀疑:可能得是任务对应实例
- 觉得"任务对应实例太麻烦"
- **关键约束(用户转述,需验证)**:"甲方只有同步实例,任务得自己新建"
- 想知道:现有设计要怎么凑到甲方那边

## 现有假设(待新文档/报文验证,不是结论)

主对话基于**旧文档 + S011 agent 调研**得出一个初步假设,但明确标注为**待验证**:

> 甲方有三层概念:testCase(长期用例库,双方通过 getTestCaseAll 同步)、task(临时执行编排,只有甲方建,不下发给我们存)、执行实例(executionPlan 跑起来才存在)。
> 映射假设:我们的 TaskTemplate ↔ 甲方 testCase;我们的 TaskInstance ↔ 执行实例;甲方的 task 我们不持有。

**⚠️ 这个假设不能直接用。** 它来自:
1. `03-用例管理.md` / `04-任务管理.md`(V1.0.4 旧拆分版,在 `rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/`)
2. S011 第 229-238 行的 agent 转述(非甲方原文)
3. topic-index:23 的旧映射"testCase = task(TaskDefinition)"——**注意这里写的是 TaskDefinition 不是 TaskTemplate,与 S011 精细化后的"TaskTemplate"措辞不一致,本身就需要厘清**

如果甲方新文档改了用例/任务的数据结构(很可能,因为 HAR 已证明 V1.0.4 也不全准),这个假设可能整体作废。

## 调研任务:新对话要回答的问题

**前提:用户提供甲方最新接口文档 + 真实接口报文(见"需要用户提供的证据")后,新对话才能开始。**

### 必答问题(按顺序)

**Q1. 甲方到底有几层概念?**
- 看新文档 + getTestCaseAll 真实响应,确认是"用例/任务/实例"三层,还是两层,还是别的。
- 关键判定:getTestCaseAll 返回的每个条目,代表的是"可执行用例定义"、"执行实例"、还是"任务"?字段证据列出来。
- "甲方只有同步实例,任务得自己新建"这句话的真实含义是什么?(是同步 testCase 不是实例?还是 task 确实由甲方建?)

**Q2. getTestCaseAll 的真实数据结构长什么样?**
- 协议层响应 + FTP 上 `testcase_all.json` 文件内容,各贴关键片段。
- 是两层树(isParent/children)还是扁平?字段有哪些?哪些必填?
- 跟旧文档(03-用例管理.md 的 datas[] 树)对比,差异在哪?

**Q3. setTestTask 的真实请求体长什么样?**
- executionPlan / testCaseInfo / taskId 的真实结构。
- 甲方下发时,一个 setTestTask 通常带几个 testCaseInfo?executionPlan 的 layers/nodes 真实长啥样?

**Q4. 我们现有的 TaskTemplate / TaskInstance 怎么映射才合理?**
- 基于 Q1-Q3 的真实证据,重新评估映射方向。
- 现有模型(见下方"现有代码事实")哪些字段对得上、哪些对不上、哪些是多余的。
- 特别回答:用户担心"任务对应实例太麻烦"——在真实模型下,这个担心成立吗?维护成本到底多大?

**Q5. 4 个具体凑合方案**(每个给"可行性 + 成本 + 风险"):
- 模板怎么分类成甲方菜单树?(现有 TaskTemplate 只有 tags,无 category)
- 模板的 steps 怎么塞进甲方用例字段?(execSteps 文本? inputPars? 省略?)
- 单帧要不要单独作为用例上报?(整机复位=12 帧,要不要拆成 12 个用例)
- 我方缺失的甲方字段(runSubSys/depSubSys/durate/priority...)怎么填?

### 输出要求

- 每个结论必须**引用真实报文/文档原文**作为证据,不接受纯转述。
- 如果新文档和旧文档冲突,**以新文档 + 真实报文为准**,并在 handoff 里标注冲突点。
- 粒度方向如果推翻了 topic-index:23 的旧映射,必须明确指出,主对话会据此更新决策。

## 现有代码事实(供新对话对照,不需重新调研)

| 概念 | 类型 | 文件 | 字段概要 |
|------|------|------|---------|
| TaskTemplate | 长期模板 | `rewrite/src/features/task/core/types.ts:184` | templateId/name/tags/definition/createdAt/updatedAt |
| TaskDefinition | 模板内核 | types.ts:107 | id/name/steps/send\|wait-condition\|delay/schedule/stopCondition/fieldVariations/errorPolicy |
| TaskInstanceState | 运行实例 | types.ts:164 | instanceId/definitionRef(快照)/lifecycle/currentStepIndex/templateId?(追溯) |
| 现有模板示例 | 4 个真实东方红模板 | `rewrite/src/features/task/fixtures/dongfanghong-tasks.ts` | 整机复位23步12帧/激光器初始化9步7帧/建链自检4步2帧/速率扫描3步0帧 |
| DEFAULT_TEST_CATALOG | mock 用例目录 | `rewrite/src/features/command-ingress/components/docking-labels.ts:73` | 当前是两层树 mock(1菜单+1用例),待替换 |
| getTestCaseAll handler | 入站处理 | `rewrite/src/features/northbound/services/northbound-service.ts:500` | 从 configuredTestCases 读取,可被 setTestCatalogData 喂入 |
| setTestTask 处理 | 入站执行 | northbound-service.ts:289 processExecutionPlan / :346 createAndStartTask | 遍历 executionPlan → translateTestCaseToMockTaskDefinition → taskService.createTask |
| taskId↔instanceId 映射 | 运行期状态 | northbound-service.ts:353 state.mapTaskId | 已实现,运行期记忆,不持久化甲方 task |

模板/实例分离是 S009 拍板 + H006 实施完成的(见 `codestable/features/rewrite-task/task-positioning-design.md`),不要推翻这个分离。

## 需要用户提供的证据(调研前提)

新对话开始前,用户需要提供:

1. **甲方最新接口文档**(用户提到"得看他们的新文档")——特别是用例管理、任务管理相关章节的最新版。放 `rewrite/docs/`,文件名带版本/日期。
2. **真实接口报文**(用户说"具体接口请求和返回值 让我去拿"):
   - `getTestCaseAll` 真实响应(协议层 + FTP 的 testcase_all.json 文件内容)
   - `setTestTask` 真实请求体
   - 如有 `getSubSysState`、`controlTestTask` 真实报文也一起
   - 拿法参考上次:抓 HAR 或找甲方要样例报文,放 `rewrite/docs/`

证据没到位前,**不要凭旧文档拍板**。

## 不要做

- 不要改任何代码(本轮纯调研)
- 不要推翻 task 模板/实例分离(S009 已定)
- 不要把甲方内部存储格式(menuId/outMenuId 那套)当协议格式
- 不要重新发明模板序列化格式
- 不要碰联调网络层(已通)
- 不要在本轮做真实用例执行链路、报告生成

## 接收方验证(续接对话时必须完成)

- [ ] 已读取 topic-index 的不变量段落(scope boundary + 不做的 + 已确认结论)
- [ ] 已验证本文件中的至少 3 条关键事实声称:
  - 声称1: TaskTemplate 在 types.ts:184 → 验证: [读文件确认]
  - 声称2: getTestCaseAll handler 在 northbound-service.ts:500 → 验证: [读文件确认]
  - 声称3: S011 第 229-238 行有映射表 → 验证: [读 S011 确认]
- [ ] 已检查 _registry.yaml 中本专题(northbound-integration)的 depends_on 和 conflicts_with
- [ ] 已确认用户已提供新文档 + 真实报文(若未提供 → 阻断,向用户要)
- [ ] 已确认当前范围(纯调研)未违反"明确不含"(本专题不做真实执行/报告)

## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| getTestCaseAll 返回 mock 数据 | 应返回真实 task 模板列表 | DEFAULT_TEST_CATALOG mock 占位 | 本调研产出映射方案后,下一轮实施替换 |
| topic-index:23 映射措辞过时 | 映射应精确到类型 | 写的是 "task(TaskDefinition)" 而非 TaskTemplate | 本调研厘清粒度后,主对话更新 topic-index + 建 D### 决策 |
| 没有 GetTestCaseAllResponse 类型 | 出站响应应有强类型 | types.ts 只有 Request,无 Response | 实施轮补类型 |

## 后续

1. 本调研产出"粒度映射方案 + 证据"后,回主对话
2. 主对话据此建 D### 决策记录(更新/确认 testCase↔TaskTemplate 映射)
3. 更新 topic-index:23 的映射措辞
4. 再开 H009 实施"getTestCaseAll 真实化"(替换 mock)
