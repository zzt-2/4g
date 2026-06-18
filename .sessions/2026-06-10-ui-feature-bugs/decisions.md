# Decisions — UI 与 Feature Bug 集中修复

> 本专题所有 D### 决策记录。status: active / superseded。永不删除。

---

## D001: task 参数变化机制——两个需求都要,分开决策、合一实施

> status: active
> date: 2026-06-17（2026-06-17 续接：推翻"分开实施"，改为"分开决策/设计记录，合一实施共用骨架"）
> 取代：无（落实 S010 待拍板的三个问题，非取代某 D###）
> 被取代：无

### 决策

用户拍板 S010 三个待拍板问题（位于 `2026-05-18-northbound-integration/S010-task-parameter-variation-and-repeat-semantics.md`），结论：**两个需求都要**。

用户区分了两个**问题**（独立机制，step 级二选一，不混用、不合并机制本身），但实施上**合一**（共用 step 内执行骨架）。分清"决策/设计记录分开"和"实施合一"：

- **分开**指的是**决策与设计记录**层面：两个问题语义独立，分别记录清楚（问题二字段级可变参数 / 问题一表达式连续累积），各自有自己的语义段落。**不要在设计没想清楚时捆一起拍脑袋**——S010 当时的坑就是这个。
- **合一**指的是**实施**层面：主对话（2026-06-17）讨论后发现两机制**底层共用骨架**（step 内 repeat 计数器 + 取值策略调度 FieldValueResolver），决定**一个对话同时实施两个问题**（H008 v2），避免重复搭骨架 / 跨对话协作对不上。

两个问题：
- **问题一（表达式连续累积）**：任务期间参数连续，每次根据上次值计算。例 `速度 = 速度 + 步进`。连续性边界 = **单个 step**（step 内 repeat×iteration 全局递增，step 边界重置）。公式归帧管（写帧 expressionConfig），task 只搬运 + step 级临时上下文存上次值。不碰引擎不违反 D6。
- **问题二（字段级可变参数 + 数目驱动重复次数）**：离散值列表下沉到 step/字段级，重复次数响应式联动（一次性触发），clamp 到最后一个值。

**合一实施的技术依据**：两机制共用 `FieldValueResolver` 骨架（variation 查表 / accumulation 算公式），差异只在取值函数。repeat 索引穿透链路、step 级临时上下文、clamp 逻辑三者共用。详见 H008 v2 的"设计：共用的 step 内执行骨架"。

### 问题二的具体语义（用户原话归纳，实施时以此为准）

1. **可变参数从"任务级 fieldVariations"下沉到"字段级"** —— 每个字段自己挂一个值列表，而非任务级统一管。
2. **重复次数响应式联动**：用户每次编辑某字段的可变参数列表时，重复次数自动跟着这次编辑的数目变。**之后用户手动改重复次数，不再被覆盖**（联动是"一次性触发"，不是持续约束）。
3. **索引规则**：每次重复索引 +1；加 1 没值了就**保留最后一个值**（不停止、不报错）。
4. **数值驱动举例**（用户原话）：
   - 填 15 个值 → 重复次数自动变 15
   - 手动把重复改 5、迭代改 3 → 分 3 轮、每轮 5 次、共 15 次、刚好发完
   - 迭代改 1、重复 5 → 只发前 5 个
   - 重复改 20（>15）→ 发完 15 次后，剩 5 次重复用第 15 个值
5. **跨字段值列表长度不一致**：字段A有15个、字段B有3个，重复15次时，B 第4-15次保留 B 的第3个值（与单字段规则一致）。

### 理由

1. **用户业务场景真实存在**：S010 推荐的"先做离散、砍掉连续累积"是基于"旧系统也不支持连续累积、业务可能没用过"的推测。用户本轮明确否决——连续累积是真实需求，不能砍。
2. **分开做避免范围爆掉**：问题一要动 task 实例状态层（甚至牵扯表达式引擎契约），问题二是纯数据模型+UI+索引逻辑。两者技术栈、风险、难度完全不同，捆一起会让决策和实施都僵住。S010 已证明。
3. **问题二先做不阻塞问题一**：字段级可变参数是离散模式，不碰引擎，不违反 D6（见下），独立可交付。问题一需要更深的设计讨论（实例状态形状、是否动 D6），慢慢来。

### 排除的替代方案

- ❌ **"先做离散砍掉连续累积"（S010 推荐方向）**：用户否决。连续累积是真实需求，不是可选优化。
- ❌ **在设计没想清楚时捆两个问题拍脑袋**：S010 已证明会导致范围爆掉、拍不了板。否决。但**想清楚后合一实施**（共用骨架）是允许的，不算此条。
- ❌ **两个问题完全独立实施（v1 H008 的方向）**：推翻。主对话讨论后发现两机制共用 step 内执行骨架，硬拆要靠"预留接口"猜，猜错返工。合一实施（H008 v2）。
- ❌ **把 variation 和 accumulation 合并成一种机制**：用户拍板机制独立（step 级二选一），只是共用骨架，不合并机制本身。混用会产生索引对齐/步调不一致问题，无收益。
- ❌ **问题二也走"连续累积"机制 / 问题一也走离散值列表**：两个问题机制不同，各归各位。

### 影响范围

- **两个问题合一实施（H008 v2）**：一个对话同时做。改动范围见 H008"代码现状"+"设计待决"。
- **问题一关键约束：不违反 D6**。最终设计（H008 v2 已敲定）：状态存 **step 级临时执行上下文**（step 跑完丢弃），不进 TaskInstanceState；accumulation 公式来自帧 expressionConfig（帧管）；引擎仍是纯函数。**D6 不需要修订**。
  - 推翻了 S010 缺口清单里"挂 TaskInstanceState.mutableVariables"的设想——那会破坏"单 step 边界重置"语义。改挂 step 级临时。
- **问题二**：fieldVariations 下沉到 step/字段级 + StepRepeat.maxCount 响应式联动 + clamp 取值。
- **顺手修两个 bug**：progress 爆表（progress.ts:5）、maxIterations 静默覆盖（types.ts:261-271）。
- **D6（表达式引擎设计 `codestable/features/2026-05-08-expression-engine/expression-engine-design.md:71`）**：**不修订**。H008 v2 设计确认不碰引擎。

### 来源

- S010（`2026-05-18-northbound-integration/S010-task-parameter-variation-and-repeat-semantics.md`，三个待拍板问题）
- 用户拍板（2026-06-17 本轮，含 v1→v2 的"合一实施"转折）
- 触发原话：见 voice.md 2026-06-17

---

## D002: H008 实施形状落地 —— resolver 挂 SendStepConfig + accumulation 复用帧侧 self-ref

> status: active
> date: 2026-06-18
> 取代：无（落实 H008 v2 设计待决 6 点 + 记录 accumulation 路径偏离）
> 被取代：无

### 决策

H008 实施完成,最终形状(6 个设计待决点的落地):

1. **resolver 挂 `SendStepConfig.fieldResolvers`**(与 repeat 同层,非更细字段级)。`FieldValueResolver` 是 variation | accumulation 联合类型。
2. **accumulation formula 不复制,运行时复用帧侧 expressionConfig**。accumulation resolver 只有 `{ kind, fieldId, initial }`,**无 formula 字段**(偏离 H008 v2 原设计,见下)。
3. **counter 穿透签名**:`executeSendStep` / `buildSendRequest` / `resolveFieldValues` 全链路加 `counter: number` + `lastValues: Map` 参数。`TaskStepResult` 不加 repeat 索引字段(内部用)。
4. **响应式联动**:SendStepEditor 内 `userEditedMaxCount` flag(组件局部,不持久化)。编辑 variation values 时若 flag=false 同步 maxCount,手动改 maxCount 置 true。
5. **iteration-counter 协同**:`repeat.maxCount` 是【每 iteration】发送次数,`stepExecCtx.counter` 是 step 内【跨 iteration 累积】全局序号(resolver 用)。两者区分:repeat 循环用 per-iteration 局部 `iterSent`,counter 单独累积。
6. **字段级混用**:step 内"字段A variation + 字段B accumulation"合法;同一字段两种非法(validateTaskDefinition 加 duplicateResolverFieldId 校验)。

### accumulation 路径偏离 H008 v2 原设计(关键)

H008 v2 原设计是"task 层自建 stepContext.lastValues + 递推公式求值(formula 从帧复制)"。**实施时发现更优路径**(用户拍板选推荐路径):accumulation 不在 task 层重造递推,而是**复用 send 链路 frame-resolver.ts 已有的 self-referencing 表达式机制**(isSelfReferencing + Phase2 seed + Phase4 evaluate)。

task 层只做一件事:**executeSendStep 成功后把 `sendResult.resolvedFieldValues` 中 accumulation 字段的值 writeback 到 stepContext.lastValues,下次 resolveFieldValues 取出注入 userFieldValues 当帧侧 seed**。这与 SendPage.vue:227-244 的手动 writeback 是完全同一个机制,task 链路原本缺失,本次补全。

理由:
- 帧侧递推机制已完整存在(commit 4375857),task 层重造是重复 + 两份 formula 真理源(帧 + task)易不一致。
- accumulation resolver 退化成"声明 + initial + 回写开关",不存 formula,无 lastValues 求值逻辑。task 层零表达式求值代码,不违反 D6。
- 语义完全一致:单 step 边界 / repeat×iteration 全局递增 / 公式归帧。

### 续接(2026-06-18):进一步简化 —— accumulation 从 resolver 改为自动 writeback

主对话讨论时用户指出"步进这种表达式自己递增,不需要任务里填"。核查帧侧 frame-resolver.ts 确认:isSelfReferencing 识别 + Phase2 用 defaultValue 种子 + Phase4 evaluate 全部帧侧自给自足,task 唯一要做的是 writeback。

**accumulation 从"用户声明的 resolver"彻底改为"task 自动行为"**:
- 删 FieldValueResolver union 的 accumulation 分支;fieldResolvers 改名 **fieldVariations**,只剩离散值列表(用户真要填的)。类型从 union 退化回单一 interface `{ fieldId, values }`。
- writeback 改自动:executeRepeatableSend / executeStepCore 内,发送成功后无条件把整个 `resolvedFieldValues` 写回 stepContext.lastValues(下次 buildSendRequest 合进 userFieldValues 当帧侧 seed)。非自引用字段回写也无害(被覆盖)。
- initial 不再由 task 填,帧侧 defaultValue 是种子(Phase2 已这么做)。
- UI 删 accumulation 面板/类型切换,只留 variation 面板。
- 单发 send step(无 repeat)也走 writeback(跨 iteration 自动累积):executeStepCore 加 stepExecCtx 参数,所有 send step 都有 stepContext。

这彻底落实"公式归帧、task 只搬运"的职责切分——task 层连 fieldId 声明都不需要了。只要帧有自引用表达式 + step 重复发送,就自动连续累积。用户零配置。

验证:task+command-ingress+send **543 tests 全过**(accumulation 用例改为"自动行为"验证:不声明 resolver,mock send 返回 resolvedFieldValues 验证 writeback;e2e 用真实 frame-resolver 验证 `speed = speed + step` 闭环)。lint 0 新增 error。

### 排除的替代方案

- ❌ **task 层自建递推 + formula 复制(H008 v2 原设计)**:否决。重复帧侧机制 + 两份 formula 真理源。
- ❌ **resolver 挂更细字段级(SendStepConfig 内每字段带 resolver)**:否决。与 repeat 同层语义更清晰,UI 形态匹配,改动小。
- ❌ **counter 和 repeat 循环计数共用**:否决。用户语义"repeat×iteration 全局递增"要求 counter 跨 iteration 累积,但 repeat.maxCount 是 per-iteration 的,两者必须区分(否则 counter 跨 iteration 后 repeat 循环立即退出)。
- ❌ **TaskStepResult 加 repeat 索引字段**:否决。UI 无消费方,加了污染类型。

### 影响范围

- **类型**:`types.ts`(FieldValueResolver / SendStepConfig.fieldResolvers / 删 FieldVariation + TaskDefinition.fieldVariations / resolveStopCondition 删 fieldVariations 分支)、`index.ts` 导出、`task-builders.ts`、`task-validation.ts`(加 fieldResolvers 校验)。
- **执行链路**:`task-iteration-loops.ts`(resolveFieldValues 重构 + StepExecutionContext + executeRepeatableSend + counter 穿透 + writebackAccumulation + executeSteps stepContexts map + runTask)、`task-step-executors.ts`(executeSendStep/buildSendRequest 签名)、`task-error-policy.ts`(retry 适配新签名)。
- **进度 bug**:`progress.ts`(stepsCompleted/countCompletedIterations 按 stepIndex 去重)。
- **UI**:`SendStepEditor.vue`(加 fieldResolvers 面板 + 联动 flag)、`AdvancedConfigPanel.vue`(删 fieldVariations)、`use-task-editor.ts` + `use-template-editor.ts`(删 fieldVariations)、`ExecutionListPage.vue` + `TemplateListPage.vue`(删绑定)。
- **command-ingress**:`task-builder.ts`(buildReadFileAndSendTask fieldVariations → step.config.fieldResolvers)。
- **D6(表达式引擎设计)**:**不修订**(accumulation 不碰引擎,复用帧侧纯函数机制)。
- **速度模拟帧 S-FPGA-004**:无需改帧定义,task 链路补 writeback 后自动连续累积。

### 验证证据

- task + command-ingress **386 tests 全过**(含原有 + 新增 8 类覆盖 + 3 个 USER CASE)。
- tsc --noEmit 源码 **0 类型错误**。
- lint **0 新增 error**(本任务文件)。
- build 未跑通:electron 打包阶段 EBUSY 文件锁(旧 app.asar 被系统锁),**环境问题非代码**(发生在编译前)。
- 预先存在的 6 个测试失败(heartbeat-timer 5 + connection-core 1)与本任务无关(timer spy / fixture 字段数)。

### 来源

- H008 v2 设计待决 6 点(主对话敲定倾向,本轮落地确认)
- 用户拍板 accumulation 路径(选"复用帧侧 self-ref + task 补 writeback"推荐项)
- 触发原话:见 voice.md 2026-06-18(用户选 accumulation 推荐路径)

---

## 待记录的决策

- 无(D002 已补全 resolver 挂载形状 + step 骨架最终形状)
