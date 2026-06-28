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

## D003: 子组件 patchConfig 单次 emit 原则 —— 链式 emit 之间 props 异步回流导致 stale 覆盖

> status: active
> date: 2026-06-19
> 取代：无(记录 S003 可变参数输入清空 bug 的根因与教训,确立 Vue 受控组件 emit 编码原则)
> 被取代：无

### 决策

**在受控子组件(用 `emit('update:xxx')` 把改动上报父组件的组件)里,一次用户操作产生的多个字段变更必须合并到同一次 emit。** 严禁在同一 handler 里连续两次 emit 再让父组件分别接收——Vue 的 props 是**异步回流**的(同一 tick 内多次 emit,props.step 不会同步更新到第二次 emit 时还是旧快照)。

确立编码契约:`patchConfig({ ...props.step, ...patch })` 这类"以 props 为 base 做 spread"的写法,**只安全于单次 emit**。多次链接调用时,第二次的 `props.step` 是 stale 的,会把第一次刚 emit 的正确值又 spread 回旧值,**静默覆盖**。

### 核心失败机制

S003 可变参数值列表输入后被清空,根因不是输入解析、不是 blur 不可靠、不是 save 链路丢字段(均已用集成测试排除),而是:

```ts
// ❌ 失败写法(原 onVariationValuesInput)
function onVariationValuesInput(index, raw) {
  variationInputs.value = { ...variationInputs.value, [index]: raw };
  const values = parseVariationValues(raw);
  const current = fieldVariations.value[index];
  if (current) {
    updateFieldVariation(index, { ...current, values });   // emit 1: patchConfig({ fieldVariations: [正确值] })
  }
  if (!userEditedMaxCount.value && values.length > 0) {
    patchRepeat({ maxCount: values.length });              // emit 2: patchConfig({ repeat: {...} })
    //  ↑ patchConfig 内部 { ...props.step, ...patch }
    //    此时 props.step.fieldVariations 还是 [] (emit1 的回流未到)
    //    → next.fieldVariations = [] → 覆盖 emit1 的正确值
  }
}
```

emit 链路本身全通(日志证明 patchConfig → onStepUpdate → updateStep 全部到达,steps.value 写入正确)。但 emit2 读 `props.step` 时,Vue 还没把 emit1 的结果回流到 props(props 更新是异步的,要等 next tick)。所以 emit2 的 `{ ...props.step, repeat }` 里 `props.step.fieldVariations` 还是 `[]`,发出后把 emit1 的 `[1,2,3]` 覆盖成 `[]`。

### 否决了什么

- ❌ **在同一 handler 里多次链接 emit 再各自 patchConfig**:否决。props 异步回流保证不了第二次读到的 props 是第一次 emit 后的最新值。
- ❌ **用 blur-only 写 step 绕过**(S003 第一轮误判的修复方向):否决。blur 不可靠 + 治标不治本,真正问题是 emit 链不是 props 链。
- ❌ **派生 `:model-value="variation.values.join(',')"` 直接绑**:否决(S003 初始根因)。输入中重算会吞末尾逗号/空格、光标跳。这个用本地 ref 缓存解决,与 D003 的 emit 合并是两个独立修复。

### 可复用部分(教训)

1. **受控组件多字段联动 = 单次合并 emit**。修复后的正确写法:
   ```ts
   // ✅ 合并到同一次 emit
   function onVariationValuesInput(index, raw) {
     variationInputs.value = { ...variationInputs.value, [index]: raw };
     const values = parseVariationValues(raw);
     const current = fieldVariations.value[index];
     if (!current) return;
     const patch: Partial<SendStepConfig> = {
       fieldVariations: fieldVariations.value.map((v, i) => (i === index ? { ...current, values } : v)),
     };
     if (!userEditedMaxCount.value && values.length > 0) {
       patch.repeat = { ...(repeat.value ?? { intervalMs: 1000 }), maxCount: values.length };
     }
     patchConfig(patch);  // 一次 emit,带齐 fv + repeat
   }
   ```
2. **诊断要先确认代码真的生效**。本轮排查走过两个弯路:(a) 第一轮修复后"没变化"——实际是 Vite HMR 未真正加载新代码(日志行号对不上文件),应先确认运行版本;(b) 诊断日志加错文件(use-task-editor vs use-template-editor,TemplateListPage 用后者),导致 updateStep 日志不输出,误判事件链断。
3. **HMR 对 defineEmits/props 改动不可靠,需完全重启 dev server**。

### 具体数据(诊断日志铁证)

```
1. patchConfig emit fv=[1,2]   props.step.fv=[]          ← emit1 正确,但 props 还是旧值
2. onStepUpdate updated.fv=[1,2]                          ← 父组件收到 ✓
3. updateStep AFTER write fv=[1,2]                         ← steps.value 写入 ✓
4. patchConfig emit (no fv) next.fv=[] props.step.fv=[]    ← emit2 读 stale props,覆盖!
5. onStepUpdate updated.fv=[]                              ← 最终写成 []
```
step 4 是关键:emit2 的 patch 不含 fieldVariations,但 `{ ...props.step }` 把 stale 的 `[]` 带进了 next。

### 影响范围

- **编码契约(全项目受控组件)**:凡 `emit('update:xxx')` 上报 + handler 内多处字段变更,必须合并到单次 emit。审查现有受控组件(SendStepEditor / WaitConditionStepEditor / DelayStepEditor 等)是否有同类链接 emit。
- **本次修复**:仅 `SendStepEditor.vue` 的 `onVariationValuesInput` 改为合并 emit。task 257 tests 全过,tsc 0 错。
- **不碰**:core types / service / state / selector(全链路保留 fieldVariations 已证)。

### 来源

- S003 续接(2026-06-19,可变参数输入清空 bug 排查)
- 用户反馈"可变参数在我鼠标点别的地方之后,直接变空了"+"保存后还是空的"
- 诊断日志铁证(见具体数据)
- 触发原话:见 voice.md 2026-06-19

---

## D004: 进度双维度语义 —— steps(step 完成数)+ sends(发送次数)

> status: active
> date: 2026-06-19
> 取代：无(与 D002 的 progress 去重修复并存——D002 修爆表用的是 step 维度去重,D004 新增独立 sends 维度,两者互不干扰)
> 被取代：无

### 决策

`TaskProgress` 采用**双维度**而非替换:

- **steps 维度(保留)**:`stepsTotal/stepsCompleted` = step 完成数(按 stepIndex 去重,repeat 只算一次)。给"3 个 step 跑完 2 个"这类视图用。D002 的去重逻辑不变。
- **sends 维度(新增)**:`sendsTotal/sendsCompleted` = 实际发送次数。`sendsCompleted` = stepResults 中 send 且 sent 成功的行数(不去重,repeat 每次都算)。`sendsTotal` = `iteration 总数 × Σ(各 send step 每迭代发送次数)`。

### sendsTotal 计算规则(契约)

```
sendsTotal = (iteration 总数) × Σ(各 send step 的 per-iteration 发送次数)
```
- 各 send step 每迭代发送次数:`repeat ? (repeat.maxCount ?? null) : 1`
  - 无 repeat 单发 = 1
  - repeat 有 maxCount = maxCount
  - repeat 无 maxCount(until 条件/unbounded)= null → 该 step 贡献 null → **sendsTotal = null**
- iteration 总数 = `resolveIterationsTotal()`(immediate=1, timer/event 取 maxIterations, 无限=null)
- 任一因子为 null → sendsTotal = null

**UI 优先级契约**:消费方(TaskExecutionDetail / use-task-list / use-central-docking)优先显示 sends(sendsTotal 非 null 时),回退 steps。这样 repeat 任务显示"7/15",非 repeat 任务仍显示 step 完成数,两者都不丢信息。

### 用户语义验证

D001 原话"各重复5次迭代2次每次加1 → 共15次":1 个 send step repeat=5、iteration=3 → sendsTotal = 3 × 5 = 15 ✓。

### 否决了什么

- ❌ **替换 steps 维度为 sends**:否决。steps 维度对"几个 step 跑完"的视图有用(如 wait-condition/delay step 不发数据,sends 维度不覆盖它们)。双维度并存更准确。
- ❌ **给 TaskStepResult 加 repeatIndex/counter 字段来数 sends**:否决。sendsCompleted 直接数 stepResults 行数就够(repeat 每次已是独立行),不必改持久化结构。TaskProgress 不持久化(computed-on-read),改字段零迁移风险。

### 影响范围

- **core/types.ts**:TaskProgress +2 字段(sendsTotal: number|null, sendsCompleted: number)。
- **core/progress.ts**:新增 resolveSendsTotal() + sendsCompleted 计数。
- **UI 消费方(3 处)**:TaskExecutionDetail.vue(progressPct + progressLabel computed)、use-task-list.ts(toTaskRow)、use-central-docking.ts(docking 行)。
- **不改**:TaskStepResult / task-iteration-loops / 持久化序列化 / steps 维度逻辑。
- **测试**:task-core.spec.ts 新增 7 个 sends 维度用例(单发/repeat×iteration/until null/无限 null/多 step 累加/failed 不计)。现有 progress 断言(无 repeat 用例)steps 维度语义未变,保留。

### 来源

- S004(2026-06-19,进度计数改造)
- 用户反馈"重复好几次,但进度只有 1/1"
- D001 原话语义("各重复5次迭代2次每次加1 → 共15次")
- 触发原话:见 voice.md 2026-06-19

---

## D005: 串口 4 参数透传链补全 —— 语义层 flowControl 抽象 + dataBits 不加 9

> status: active
> date: 2026-06-19
> 取代：无(落实 S005 串口配置项写死问题。9d35a5f 只做了类型层 + Settings UI 层的半截,透传链未通)
> 被取代：无

### 决策

串口连接补全 4 个配置项(数据位/停止位/校验位/流控)的**完整透传链**:renderer 表单 → adapter → IPC → main `new SerialPort()`。commit 9d35a5f 此前只在 `types.ts`/`validation.ts`/`ConnectionSettings.vue` 加了类型与 UI,但**实际连接链路 3 处断点**导致参数从未到达 serialport:

1. `platform-bridge.ts` `SerialConnectConfig` 缺 4 字段 → main 端类型拿不到
2. `real-serial-adapter.ts` `transport.connect({...})` 只重建 4 字段 → 字段在到 IPC 前被丢
3. `serial-handlers.ts` `new SerialPort({path,baudRate,autoOpen})` → 没传参数,全用 serialport 默认 8N1

本次三处全补,新建弹窗 `NewConnectionDialog.vue` 也加 4 个 q-select(此前只有系统设置页能改)。

### flowControl 语义层抽象(none/hardware/software)

serialport v13 **不再有单一 `flowControl` 字段**,流控拆成独立布尔 `rtscts`(硬件)/`xon`/`xoff`(软件)。决策:**语义层/UI 层保持 `'none'|'hardware'|'software'` 三选一抽象**(UI 友好,与既有 types.ts/validation.ts/ConnectionSettings.vue 一致),**只在 main 的 `toFlowControlFlags()` 转布尔**:
- `hardware` → `{ rtscts: true }`
- `software` → `{ xon: true, xoff: true }`
- `none` → `{}`

不在类型/UI 层暴露 rtscts/xon/xoff,避免用户面对 4 个布尔开关。

### dataBits 不加 9

serialport v13 的 dataBits **只支持 5/6/7/8,不接受 9**。任务原述"数据位 5-9"是按通用串口标准写的,但 serialport 实际上限是 8。加 9 会产生一个 `new SerialPort` 时必然抛错的无效选项。决策:**保持 5-8**(与既有 types.ts/validation.ts/ConnectionSettings.vue 一致)。

### 否决了什么

- ❌ **把 flowControl 在类型层直接暴露成 rtscts/xon/xoff 布尔**:否决。UI 不友好(4 个开关 vs 1 个下拉),且破坏既有 3 处一致的语义抽象。转换成本应集中在 main 单点。
- ❌ **dataBits 加到 9**:否决(用户确认"不支持9就不加")。serialport v13 不接受,是无效选项。
- ❌ **改 ConnectionSettings.vue**:否决。它已适配 4 字段(走 `service.connect(updated)` → `upsertConfig` 持久化),是已有的"编辑入口",无需改。
- ❌ **给 ConnectionCard 加编辑按钮**:否决。应用本就没有"编辑连接"概念(连接只能删了重建),本次不引入新交互;新建弹窗 + 系统设置页已覆盖配置需求。

### 影响范围

- **类型**:`src/shared/platform-bridge.ts` `SerialConnectConfig` +4 可选字段(与 `SerialTransportConfig` 同形,便于 adapter 直接透传)。`types.ts`/`validation.ts` 不动(9d35a5f 已做)。
- **透传链**:`src/features/connection/adapters/real-serial-adapter.ts` connect() +4 字段。transport.ts/preload/ipcMain 透明无需改(IPC 结构化克隆,标量字段正常传)。
- **main**:`src-electron/main/serial-handlers.ts` `new SerialPort()` 传 4 参数 + 新增 `toFlowControlFlags()`。
- **UI**:`NewConnectionDialog.vue` 串口表单 +4 q-select(复用 ConnectionSettings 的 PARITY_LABELS/FLOW_CONTROL_LABELS 中文映射),resetForm/onSubmit 同步。
- **fixture**:`connection-fixtures.ts` `serialTransportConfigFixture` +4 字段(与 normalize 默认 8/1/none/none 一致),否则 `connection-core.spec` 的 `toEqual(config)` 失败。
- **测试**:connection feature 65/65 通过;tsc(过滤 node_modules 噪音)0 错;lint 0 错。

### 来源

- S005(2026-06-19,串口配置项写死修复)
- commit 9d35a5f(此前只做半截:类型+Settings UI,透传链未通)
- serialport v13 API(WebSearch 确认 dataBits 5-8、流控拆布尔)
- 用户拍板"不支持9就不加"
- 触发原话:见 voice.md 2026-06-19

---

## D006: 打包串口检测修复 —— npmRebuild:true + 枚举失败 throw 透传 renderer devtool

> status: active
> date: 2026-06-19
> 取代：无(记录 S005 打包后别的电脑检测不到串口的根因方向与修法。**根因待目标机实测最终确认**,本决策记录的是高置信度方向 + 诊断基础设施)
> 被取代：无

### 决策

打包后别的电脑检测不到串口,根因方向(高置信度,待目标机实测最终确认):**原生模块 `@serialport/bindings-cpp` 的 `.node` 没有用 electron ABI 重编**,目标机加载的是 Node ABI 的 .node,`SerialPort.list()` 抛错。两个直接原因:

1. `quasar.config.ts` **`npmRebuild: false`** —— electron-builder 打包时不重编原生模块。
2. `package.json` `postinstall` 只有 `quasar prepare`,**没有 electron-rebuild** —— 开发环境靠历史手动 rebuild 碰巧能用,换机器/CI 会断。

放大问题:`serial-handlers.ts` 枚举失败 `catch → console.error → return []` **静默吞错**,前端收到空数组分不清"加载失败"还是"无设备",用户无从诊断。

### 修复

- **`quasar.config.ts`**:`npmRebuild: false` → `true`(打包时 electron ABI 重编原生模块)。asarUnpack 保持(`**/*.node` + `**/@serialport/**` 已在)。
- **`package.json` postinstall**:加 `electron-rebuild -f -w serialport`(`@electron/rebuild` 已在 devDependencies,CLI 已存在于 .bin),保证开发环境也用 electron ABI。

### 枚举错误透传 renderer devtool 的路径选择

关键约束(用户):错误必须 **renderer DevTools console 可见**——打包后用户在目标机双击 exe **看不到 main 进程的 console**(main console 只在开发或带终端启动时可见)。三条路径评估:

- ❌ **改 `enumerateSerialPorts` 返回契约为 `{ports, error?}`**:否决。牵动 platform-bridge/transport.ts/preload/real-serial-adapter/多个 mock 和测试 facade 签名,爆炸半径大。
- ❌ **main 推 `transport:event` 的 error 事件**:否决。renderer 端**当前无人订阅 transport 事件**(onEvent 全项目无消费者),要先建消费链,改动大。
- ✅ **main 失败时 throw(让 ipcRenderer.invoke 的 Promise reject)+ renderer refreshResources try/catch**:采纳。签名全不变(`Promise<readonly SerialPortCandidate[]>` 仍数组,reject 是 Promise 标准语义),real-serial-adapter 无 catch 异常自然冒泡,只改 main(throw+详细 log)和 ConnectionPage(try/catch+console.error+notify)两处。错误经 reject 链到达 renderer,DevTools console + Notify 双通道可见。

main 仍保留 `console.error` 带完整 stack(开发时 main 控制台可见,双重保险)。

### 否决了什么

- ❌ **保留 `return []` 静默吞错**:否决。这正是用户"不知道为啥"的直接原因。
- ❌ **只靠 main console 诊断**:否决。打包后目标机看不到 main console,用户必须能在 renderer devtool 拿到错误。
- ❌ **本地 build 实测打包作为完成判据**:当前不能。topic-index 记录 build 环境有 EBUSY 文件锁(环境问题非代码),本地 build 跑不通。**最终验证必须用户在目标机跑打包版**,诊断基础设施(throw+console.error+notify)已做扎实,目标机一跑就能定位真实错误(预期是 `Cannot find module .../serialport.node` 或 `compiled against a different Node version`)。

### 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| 打包串口根因未实测最终确认 | 验证前不宣称"修好了" | 高置信度方向(npmRebuild+ABI)+ 诊断基础设施就位,但未经目标机实测 | 用户在目标机跑打包版,SerialPort.list() 成功或拿到具体错误 |
| 本地 build 跑不通(EBUSY) | build 是打包问题的唯一实证 | 环境文件锁阻塞,非代码 | 解除文件锁后本地 `npm run build` 跑通 |

### 影响范围

- **打包配置**:`quasar.config.ts` npmRebuild true;`package.json` postinstall 加 electron-rebuild。
- **错误透传**:`serial-handlers.ts` handleEnumerateSerialPorts 改 throw + 详细 log(带 stack);`ConnectionPage.vue` refreshResources 加 try/catch + console.error + notify.error。
- **不动**:real-serial-adapter(无 catch,异常自然冒泡)/ composite-adapter / transport.ts / preload / onEvent 事件链。
- **未验证项**:本地 build(EBUSY 环境锁)、目标机实测(必须用户做)。

### 来源

- S005(2026-06-19,打包串口检测修复)
- quasar.config.ts npmRebuild:false(铁证)
- preload onEvent 全项目无消费者(grep 证实)→ 否决"推 error 事件"路线
- 用户约束"得是 devtool 控制台能看到的,不然那边看不见"
- 触发原话:见 voice.md 2026-06-19

---

## D007: flex `max-height:100%` 撑开陷阱 —— 全屏列表/表格布局正确解法

> status: active
> date: 2026-06-19
> 取代：无
> 被取代：无

### 决策

全屏三栏(或类似)布局里,当某栏内容是**会全量渲染的组件**(q-table virtual-scroll / q-list / 大量 DOM)时,**不能靠 `max-height:100%` 拦截溢出**。正确解法是给该内容区一个**不受子内容影响的固定 flex 边界**:`flex:1 1 0; min-height:0; overflow:hidden`(或 overflow-y:auto),用 `overflow:hidden` 钳制,而非依赖子组件的 `max-height`。

### 核心失败机制

`max-height: 100%` 的语义是"不超过父级高度"。但父级(flex 容器)的高度**被子组件自身撑开**——子组件(q-table 全量渲染行)按内容自然长高 → 把 flex 父级顶高 → `100%` 基准跟着涨 → 子组件继续长 → **死循环撑开整个布局,最终页面整体滚动**。

flex 子项默认 `min-height: auto`(=内容高度),这会阻止 flex 项收缩到内容以下,是撑开的另一个帮凶。

### 否决了什么(两次误判,均已 ruled out)

1. **否决"修 page 高度链"路线**(第1次修):给 `q-page` 改 `h-full` + `min-height:0`,表格传 `container-height="100%"`。失败原因:`100%` 是 maxHeight,拦不住 q-table 撑开父级。**高度链本身没断,断在内容组件这层**。
2. **否决"page 加 overflow 治标"路线**(第2次修):`.send-page` 加 `height:100% + overflow:hidden`,DataTable 包裹层加 `overflow-hidden`,左栏 q-item-section 加 `min-width:0`。用户反馈"完全没用"。失败原因:page 的 overflow 把溢出**裁掉而非滚动**,且左栏 q-list 没被钳制照样撑开;`min-width:0` 加在 `q-item-section` 上,但实际渲染文字的 `.q-item__label` 在深层,scoped 穿透不到,ellipsis 不触发。

两次都盯着 page → 三栏容器这条链,没意识到**内容组件本身就是撑开源**。

### 正确解法(第3次,验证通过)

照搬 DisplayPage 验证过的 `__panels` 模式(`flex:1 1 0; min-height:0`),三栏及滚动区**全部从 UnoCSS class 改成 scoped CSS 显式声明**:
- 三栏容器:`display:flex; flex:1 1 0; min-height:0`
- 各栏:`flex-direction:column; min-height:0; overflow:hidden`(固定宽栏加 width,弹性栏加 `flex:1 1 0; min-width:0`)
- 滚动区(左/右):`flex:1 1 0; min-height:0; overflow-y:auto`
- **关键多一层**(DisplayPanel 不需要,q-table 需要):`.send-page__table-wrap { flex:1 1 0; min-height:0; overflow:hidden }` 钳制 q-table

左栏 ellipsis:`min-width:0` + `:deep(.q-item__label) { white-space:nowrap; overflow:hidden; text-overflow:ellipsis }`(scoped 必须用 :deep 穿透到 Quasar 内部)。

### 可复用部分(本项目其它全屏页面布局)

- **模式**:任何"固定视口 + 多栏 + 某栏内容会全量渲染"的页面,套用本决策的 scoped CSS 结构(三栏容器 flex:1 1 0 min-height:0 + 各栏 overflow:hidden + 内容区 overflow:hidden/auto + q-table 类组件额外包一层 overflow:hidden)。
- **DisplayPage 为何不需要 table-wrap 那层**:它的内容是 DisplayPanel(独立组件自管高度),不撑开。**判断标志**:内容组件是否 virtual-scroll 全量渲染 / 是否按内容自然长高。
- **scoped 穿透 Quasar 内部**:改 `.q-item__label` / `.q-field__native` 等 Quasar 内部 class 必须用 `:deep()`,否则 scoped 选择器命中不到。
- **`min-height:0` 是 flex 溢出生效的必要条件**:flex 子项默认 min-height:auto 会撑开,必须显式归零。

### 具体数据

- 用户实测:加载几十个模板 → 页面整体滚动,中间不滚,左右被挤开(第1/2次修复后"完全没用")
- DisplayPage 对照:同样 `q-page flex flex-col h-full` 无 page 级 overflow 却能用,差异仅在内容区组件类型(DisplayPanel vs q-table)
- 第3次修复后用户确认"都好了"

### 影响范围

- **本专题**:SendPage.vue 三栏 + 编辑弹窗布局(已落地)
- **未来**:任何全屏多栏列表/表格页参考本模式;尤其 q-table virtual-scroll + rows-per-page-options=[0] 全量渲染场景
- **不含**:DisplayPage(已正确,无需改)

### 来源

- S006(2026-06-19,SendPage UI 重设计 + flex 高度修复)
- 用户两次反馈"还是被挤开""完全没用"(触发根因重诊断)
- DisplayPage.vue `__panels` 模式对照(决定性证据)

## D008: 批量设置发送目标的语义——改任务级 defaultTargetId + 清空 step 级覆盖

> status: active
> date: 2026-06-22
> 取代：无
> 被取代：无

### 决策

任务管理两页（模板/执行监控）的"批量设置发送目标"操作语义：**写 `definition.defaultTargetId`（任务级兜底字段）+ 同时清空所有 send step 的 `SendStepConfig.targetId`（step 级覆盖）**。由纯函数 `applyDefaultTargetOverride(definition, targetId)` 实现一次性原子改写。

### 理由

- 用户原话"设置所有的（直接改,不加属性）"——意图是"批量统一指向一个连接"。
- 现状有两层 targetId：任务级 `defaultTargetId`（兜底）+ step 级 `SendStepConfig.targetId`（覆盖,优先级更高）。
- 若只改任务级、不动 step 级：已单独设了 step 级 targetId 的 step 仍走自己的旧值,任务级对它们不生效——**达不到"设置所有的"的统一效果**。
- 所以必须同时清空 step 级覆盖,让所有 send step 统一回退到任务级 defaultTargetId。这才是用户要的语义。
- "不加属性"：不引入"是否启用批量"开关字段,直接改现存的 defaultTargetId + step targetId。

### 排除的替代方案

- **只改 step 级 targetId,不动任务级**（初版实现 `applySendStepTargetOverride`）：被用户纠正。理由：用户后续追加"任务级的发送目标,建议加到表格里",说明用户心智模型是"任务级"为批量入口;且改任务级 + 清 step 覆盖比"遍历每个 step 写"更省事（一次写一个字段）。初版纯函数已改名重写为 `applyDefaultTargetOverride`。
- **只改任务级,保留 step 级覆盖**：否决。达不到统一效果（见理由）。
- **加"是否启用批量"开关字段**：否决。用户明说"不加属性"。

### 影响范围

- **本专题**：
  - `core/task-builders.ts` 新增 `applyDefaultTargetOverride`（纯函数,不可变）
  - `composables/use-template-editor.ts` + `use-task-editor.ts` 各加 `setAllStepTargetOverrides()`（复用纯函数,单条编辑里也能用）
  - `components/TemplateListPage.vue` + `ExecutionListPage.vue` 页面级批量入口（batchMode + 工具栏按钮 + dialog + 遍历调纯函数 + service.updateTemplate/updateTask）
  - `__tests__/task-batch-set-target.spec.ts` 7 个单测
- **约束**：`updateTask` 只允许 `lifecycle === 'created'` 实例更新。执行监控批量时过滤 editable,非 created 跳过并提示。
- **不含**：不引入新的"是否启用"字段;不改 step 级 targetId 的单步编辑能力（SendStepEditor 仍可单独覆盖）。

### 来源

- S008(2026-06-22,任务管理批量设置发送目标)
- 用户原话"任务管理,模板和执行监控,都需要加一个批量设置发送目标,可以设置所有的（直接改,不加属性）。"
- 用户追加"最好别替换字段的目标,而是改那个任务级的"（触发语义从 step 级改为任务级）
- AskUserQuestion 用户选"改任务级 + 清空所有 step 级覆盖"（确认清空语义）

---

## D009: 无边框窗口方案 —— frame:false 全自定义 + DevTools dev-only + windowControl bridge 契约

> status: active
> date: 2026-06-22
> 取代：无（落实 S009 三件事:去系统标题栏 + 自定义三按钮 + DevTools 默认开）
> 被取代：无

### 决策

Electron 主窗口壳层改造三件事,确定方案:

1. **`frame: false` 全自定义无边框窗口**(否决 `titleBarStyle: 'hidden' + titleBarOverlay`)。
2. **DevTools dev 自开 / prod 不开**,用 `process.env.DEV` 判断,`openDevTools({ mode: 'detach' })`。
3. **新增 `windowControl` bridge 命名空间**(与 transport/file/http/ftp/storage 同级),renderer 直读不经 `src/platform/` facade。

### 1. frame:false vs titleBarStyle:hidden —— 选 frame:false

**理由**:
- 用户明确原话"把最小化、放大缩小、关闭三个按钮**放到标题栏**" → 意图是**自画三按钮**,不是藏标题文字留系统按钮。`titleBarStyle:'hidden'` 的卖点是"保留系统窗口控制按钮只藏标题",与用户意图相反。
- 项目 builder **只有 linux target**(`quasar.config.ts:85-109`)。`titleBarStyle:'hidden' + titleBarOverlay` 的 overlay 在 **Linux 上支持不稳**(overlay 主要为 Win11/macOS 设计);`frame:false` 是 Electron 跨平台一致的无边框方案。
- 自画按钮 + CSS `-webkit-app-region: drag` 是 Electron 无边框窗口的**标准做法**,Win/Linux 一致,无需为 macOS traffic lights 特殊处理(builder 也没 mac target)。

**排除的替代方案**:
- ❌ **`titleBarStyle: 'hidden' + titleBarOverlay`**:否决。与用户"自画三按钮"意图相反 + Linux overlay 不稳。
- ❌ **macOS traffic lights 特殊适配**:否决。builder 无 mac target,Win/Linux 一致即可,不为不存在的平台加复杂度。

### 2. DevTools dev-only 自开

**理由**:
- 用户要"默认打开",但**最终用户(prod)不需要** DevTools 弹窗——那是开发工具。dev/prod 分流是行业惯例。
- 用 `process.env.DEV`(Quasar 注入,现有 `index.ts:59` 已用它分流 loadURL/loadFile)判断,零新机制。
- `mode: 'detach'` 独立窗口,不遮应用界面(用户能看到完整 UI,同时有 DevTools)。
- prod 要开 DevTools 走单独"调试模式"开关——**本次不做**(用户没要求 prod 常开)。

**排除的替代方案**:
- ❌ **prod 也常开 DevTools**:否决。影响最终用户体验,用户没要求。
- ❌ **用 quasar.config electron `debug:true`**:否决。那会开 inspectPort + 主进程 inspector,不是 renderer DevTools,且 prod 也会带上。
- ❌ **碰 `vite-plugin-vue-devtools`**:不碰。那是 Vue 组件树 devtools(`quasar.config.ts:3,39`),与 Electron DevTools 是两回事。

### 3. windowControl bridge 契约

新增命名空间(与业务 facade 同级):

```ts
interface WindowControlBridge {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;  // 返回切换后状态供点击即时反馈
  isMaximized(): Promise<boolean>;     // 组件初始化取初始图标态
  close(): Promise<void>;
  onMaximizeChange(callback: (maximized: boolean) => void): () => void;  // 订阅最大化变化,返回取消订阅
}
```

**最大化图标同步走事件推送而非轮询**(对齐现有 `transport:event` 推送模式):
- main 监听 `win.on('maximize'/'unmaximize')` → `webContents.send('window:maximize-changed', bool)`
- renderer `onMaximizeChange(cb)` 订阅,图标在 `fullscreen` / `fullscreen_exit` 间切
- 组件 mount 时先 `isMaximized()` 取初始态(避免图标初始错位)

**renderer 直读 bridge 不经 `src/platform/` facade**:
- 窗口控制是壳层 UI 能力,与 transport/file 等业务 facade 同级,无业务语义封装需求
- 无 caching 需求(不像 transport facade 要缓存连接实例)
- 少一层抽象,改动面最小

**IPC 命名沿用 `domain:action` 风格**(对齐 `transport:serial-connect` / `file:read-text`):
- `window:minimize` / `window:maximize-toggle` / `window:is-maximized` / `window:close` / `window:maximize-changed`

**排除的替代方案**:
- ❌ **renderer 轮询 isMaximized()**:否决。不实时 + 浪费 IPC。事件推送更优。
- ❌ **给 windowControl 也建 `src/platform/window-control.ts` facade + get/reset 缓存**:否决。无 caching 需求,过度抽象。
- ❌ **把 window IPC 塞进现有 transport: domain**:否决。窗口控制与传输无关,domain 语义不符。

### 影响范围

- **主进程**:`src-electron/main/index.ts`(`frame:false` + `openDevTools` + register/cleanupWindowHandlers)、`src-electron/main/window-handlers.ts`(**新增**)
- **类型**:`src/shared/platform-bridge.ts`(新增 `WindowControlBridge` + 加到 `RewritePlatformBridge`)
- **preload**:`src-electron/preload/index.ts`(新增 `windowControlBridge` 实现 + expose)
- **渲染层**:`src/app/AppShell.vue`(q-toolbar 加 3 按钮 + drag/no-drag 区 + 最大化图标响应式)
- **不含**:业务 feature / `src/platform/` 业务 facade / `_archive-legacy` / 新依赖
- **未验证项**(待用户做):dev server 完全重启后 GUI 实测三件事;解锁后 prod build。

### 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| dev GUI 未实测 | 验证前不宣称"跑通了" | 代码 + lint + tsc(我的文件)过,build 卡 EBUSY 环境锁未编到代码 | 用户重启 dev server 实测三件事 |
| prod build 未跑通 | build 是打包问题唯一实证 | app.asar 被进程锁(D006 同款环境问题),rimraf 清理失败 | 解除文件锁后本地 build 跑通 |

### 来源

- S009(2026-06-22,Electron 窗口壳层改造)
- 用户原话"把devtool默认打开,以及去掉默认标题栏,把最小化、放大缩小、关闭三个按钮放到标题栏"
- Electron 35 BrowserWindow API(frame/titleBarStyle/openDevTools/-webkit-app-region)
- 现有 IPC 命名约定(file-handlers/serial-handlers 的 `domain:action`)
- 触发原话:见 voice.md 2026-06-22

---

## D010: 接收帧高频卡顿——storage appendLocalRecords O(N·M) 治本 + 测试基建范围扩张 + backgroundThrottling:false

> status: partially-superseded（续接二轮的"攒批治本"被 D013 推翻:攒批照样 O(N) 卡,且治的是本不该存在的僵尸写入路径。D010-B 的内存优化 mutable push/Set 索引/clearLastIssue 仍有效,被路径A appendLocalRecords 保留）
> date: 2026-06-23（续接 2026-06-23:补 backgroundThrottling:false 治"切走再回来卡";续接 2026-06-25:二轮彻底治本,见末尾续接段;续接 2026-06-26:二轮治本被 D013 部分推翻）
> 取代：无
> 被取代：D013（续接二轮部分）

### 决策

三条合一记录(同一性能优化任务 S012 内):

**(A) 范围扩张:修 pre-existing 测试基建。** `vitest.config.ts` 加 `@vitejs/plugin-vue` 的 `vue()` 插件 + `pnpm add -D @vitejs/plugin-vue`(已作为 vite-plugin-vue-devtools 间接依赖装在 pnpm store,顶层未暴露)。修前所有 import 了 `frame/index.ts`(re-export `FrameSelector.vue`)的测试(receive/runtime/storage 整套)在当前工作树**集体跑不起来**(vite 报 "Install @vitejs/plugin-vue to handle .vue files")。

**(B) 性能治本:storage `appendLocalRecords` 改 append-only 增量,消除每帧 O(N) merge/排序/多次深拷贝。** 加快速路径 `canAppendInOrderFast`(新 records 单调递增+id 全新+首条≥现有末条时走 append,跳过 `mergeStorageLocalRecords`),否则回退全量 merge(保留乱序/去重语义)。配套:`storage-state` 加 `appendRecords`(增量 concat + 返回 merged+snapshot 复用)+ `getLastRecordCapturedAtMs`/`hasRecordId` 轻量 accessor(读末条/查 id 不触发全量深拷贝)。

**(C) 续接:BrowserWindow `backgroundThrottling: false`。** 用户补报第三症状"切走再回来卡"(多人独立复现)。根因(强代码推断):webPreferences 默认 `backgroundThrottling:true` 节流失焦窗口 routingTick → 真 hardware 持续推数据堆积 → 回前台惊群一次性 drain 超大尖峰。治本一行配置关闭节流。上位机常驻前台,后台占 CPU 可接受。

### 理由

**(A)** 不修测试基建,S012 的 Phase 1 证据(routingTick 基准)+ 阶段 4 验证(receive/runtime/storage 测试)都跑不起来。用户拍板"加 vue 插件到 vitest.config"。

**(B)** 实证根因:trace 里 timer#4(routingTick setInterval)每次回调 300-430ms,占主线程几乎全部。从 trace 提取时间戳分析:间隔 mean=332ms(被超时回调拖垮的 100ms setInterval),drain 空时 0.3ms → 瓶颈由"处理数据帧"触发。Node 基准证明 routingTick 服务层 12 帧只 5.5ms,**服务层不是瓶颈**;持续推帧采样证明**单 tick 耗时随累积 storage records 线性增长**(2000 records → 62ms,56x)。反推 trace:12 帧/秒 × 15 分钟 ≈ 10800 records → 单 tick ~330ms,命中。根因是 `appendLocalRecords` 每帧把全部历史 records 深拷贝 2-3 次 + 排序一次。

### 排除的替代方案

- **只调大定时器间隔(100ms→1000ms)**:糊弄,回调重活还在,只是触发频率降,根因没解决。明确否决。
- **单纯清 debug log**:可证明的小改进(console.log 高频确实重,基准 10万次 742ms vs 不打 23ms),但只能解释一部分不是全部。node 基准 routingTick 含 log 也才 5.5ms。作为 3a 做了,但非治本。
- **拆 frame barrel 去掉 .vue re-export**:范围更大、风险更高,且 vue 插件方案一行修复更治本(测试基建就该支持 .vue)。
- **storage records 加滚动上限(像 receive events 的 50 窗口)**:会丢历史数据,语义改变。本次不做,记后续(若 prod 实测仍卡再考虑,或 append 改异步批量攒批写)。

### 影响范围

- `rewrite/vitest.config.ts`(加 vue 插件)+ `package.json`(@vitejs/plugin-vue devDep)——测试基建,所有测试受益。
- `rewrite/src/features/storage-local-baseline/services/storage-local-service.ts`(appendLocalRecords fast path + canAppendInOrderFast helper)
- `rewrite/src/features/storage-local-baseline/state/storage-state.ts`(appendRecords/getLastRecordCapturedAtMs/hasRecordId 新方法)
- `rewrite/src/features/storage-local-baseline/__tests__/storage-append-perf.spec.ts`(新增性能回归测试)
- `rewrite/src/runtime/__tests__/routing-tick-perf.spec.ts`(新增 Phase 1 证据基准)
- `rewrite/src/runtime/routing-tick.ts` + `receive/core/processor.ts` + `receive/services/receive-service.ts`(清 debug log)
- **契约不变**:appendLocalRecords/StorageStateContainer 既有方法签名未改(appendRecords 等是新增),排序/隔离/去重语义全部保留(storage-service-state-selector 7 测试过)。

### 来源

- S012(2026-06-23,接收帧高频卡顿性能优化)
- trace `rewrite/docs/Trace-20260623T093434.json` + `perf-summary.md`(prod,无 source map)
- Node 基准实测数据(见 S012):routingTick 5.5ms / append 2000 records 62ms(旧)→18.65ms(新)/ 端到端 62ms→34ms
- 用户纠正:"一秒十几帧指的是我真的收到十几帧,不是100ms的定时器"
- 用户补充新证据:"开久了卡"
- 用户拍板范围扩张:"加 vue 插件到 vitest.config(推荐)" + "把那一堆日志该清的清一下?说是开久了卡(顺便想想还可能是啥)"
- 触发原话:见 voice.md 2026-06-23

### 续接(2026-06-25):二轮彻底治本——分离 appendRoutedRecords(snapshot-free)+ mutable push + id Set + clearLastIssue + 攒批写盘

**背景**:用户报 backgroundThrottling 修复后"还是不行。依然卡",给新 trace(25MB)。新决定性证据:**"拔串口立刻好"** → 卡顿 100% 在"帧流入后的处理路径"。新 trace 最长 Long Task 617ms 内部全是单个 timer#4 回调纯 JS(consoleCall=0,推翻 log 假设;GC 仅 40ms)。

**前一轮 fix(D010-B)为何没治本**:`canAppendInOrderFast` 只省了 merge+sort,**3 次全量深拷贝原封未动**:① `getSnapshot().records` 备份(回滚用)、② `appendRecords` 返回 snapshot、③ adapter `writeMaterial` 内 `cloneStorageValue`、④ 隐藏的 `setLastIssue(undefined)` 内部 `return snapshot()`。prod-scale 基准钉死:10k=99ms / 20k=203ms 完美 O(N) 线性。反推 prod 600ms ≈ 60k records。

**根因盲区**:前三轮 Node 基准只测到 state.appendRecords 的 merge+sort(5.5ms),没测 service 完整调用链(深拷贝全漏),且 warmup 只 2000 records 看不到真实 O(N)。

**治本(用户拍板 A 方案,routingTick 路径分离)**:
1. 新增 `appendRoutedRecords`(snapshot-free,只返回 `{ ok }`):routingTick 经 fanOutToStorage 调它,彻底跳过被丢弃的 snapshot 深拷贝。`appendLocalRecords`(公开 API,返完整结果)保立即写盘 + 失败感知契约,给其它调用方。
2. `appendRecords` 改 **mutable push**(O(新条数))取代 `[...全量, ...新]`(O(N) 数组重建)。
3. `hasRecordId` 改 **Set 索引**(O(1))取代 O(N) 遍历(canAppendInOrderFast 每帧 id 冲突兜底)。
4. 新增 `clearLastIssue`(O(1),不返 snapshot)取代路由路径的 `setLastIssue(undefined)`(返 snapshot = 全量深拷贝)——**这是前三轮漏掉的隐藏元凶**。
5. 写盘失败回滚用 `truncateRecords`(`records.length = count`,O(1))取代 `getSnapshot().records` 全量备份。
6. **攒批写盘**:appendRoutedRecords 累计 dirty 计数,阈值 50 才全量 writeMaterial 一次(摊销 O(1)/帧);runtime.destroy 调 `flushPendingWrites` 防丢数据。

**效果(实测)**:路由路径 5k=0.01ms / 20k=0.01ms(旧 11.5/49.8ms),ratio 0.58(O(1)),降 5000 倍。prod 60k 单帧 ~600ms → ~0.01ms。

**否决的替代方案**:
- ❌ **B 方案(不可变结构共享/immer)**:大炮打蚊子。routingTick 的 snapshot 本被丢弃,不需要结构共享那么重;改动面大(重写 storage-state + 所有 clone + 重验隔离测试),性价比最差。
- ❌ **C 方案(records 滚动上限)**:丢历史数据,History 页查不到早期记录,语义改变。
- ❌ **appendLocalRecords 直接攒批**:破坏公开 API"立即感知写盘失败+回滚"契约(storage-service-state-selector 测试钉死)。改用分离 appendRoutedRecords 给路由路径。

**契约影响**:
- `StorageLocalService` 接口 +2 方法(appendRoutedRecords / flushPendingWrites),appendLocalRecords 签名不变(保完整契约)。
- `StorageStateContainer` +4 方法(appendRecords 加 quickSnapshot 参数 / truncateRecords / getRecordCount / clearLastIssue),getSnapshot 深拷贝隔离契约**原样保留**(reader/History 页按需付代价)。
- `fanOutToStorage` 改调 appendRoutedRecords(原调 appendLocalRecords);integration 测试 mock 从 spy appendLocalRecords 改 spy appendRoutedRecords + 加 flushPendingWrites 默认。

### 影响范围(续接二轮)

- `storage-local-baseline/services/storage-local-service.ts`:appendLocalRecords 重构走 applyRoutedAppend 共享核心 + 新增 appendRoutedRecords/flushPendingWrites + 攒批写盘。
- `storage-local-baseline/state/storage-state.ts`:mutable push + id Set 索引(recordIds)+ truncateRecords/getRecordCount/clearLastIssue + appendRecords quickSnapshot 参数。
- `runtime/bridges/receive-storage-bridge.ts`:fanOutToStorage 改调 appendRoutedRecords。
- `runtime/index.ts`:destroy 调 flushPendingWrites。
- `storage-local-baseline/__tests__/storage-append-no-growth.spec.ts`:治本回归测试(ratio + 绝对值)。
- 5 个 integration/runtime 测试 mock 更新(fanout-consumer-order / routing-tick-regression / routing-tick-error-isolation / history-fieldname-resolution / runtime/helpers)。
- `analyze-longtask.py`(新增 trace 内部事件树分析工具,扒 Long Task 内部定位元凶)。

### 来源(续接二轮)

- S012 续接二轮(2026-06-25)
- 新 trace `rewrite/docs/Trace-20260625T171046.json`(25MB,prod,无 source map)+ analyze-longtask.py
- 用户决定性证据:"拔串口立刻好"
- prod-scale 基准:10k=99ms / 20k=203ms(旧)/ 0.01ms(新)
- 触发原话:见 voice.md 2026-06-25

---

## D011: flex 高度链排查方法论——必须从 q-page-container 起逐环验证 computed height,禁止凭读代码猜

> 失败路线记录 + 方法论。S013 编辑弹窗重设计附带的 ExecutionListPage 右栏高度问题,5 次修复全失败后搁置。

### 决策(方法论约束)

排查"内容撑开页面/flex 滚动不生效"类问题时,**禁止**只读代码凭 CSS 推断就改。必须:

1. **浏览器 DevTools 实测**:打开撑开状态,F12 Elements 从最外层 `<body>` 往内逐层点,记录每层 **computed height**(是固定值还是 auto/被撑开)。定位"第一个 height 变 auto/超出视口"的层 = 真正断点。
2. **从 q-page-container 起,不从 q-page 内部起**:Quasar 的 `q-page-container` 默认只有算出来的 `min-height`(基于 header/footer),**没有显式 height**。所以 `q-page` 的 `h-full`(height:100%)引用的是父级的 **height**——父级只有 min-height 时,height:100% 解析为 **auto,失效**。这是非直觉的:你以为 `h-full` 锁住了,其实没有。
3. **对照"已知工作"的页面逐环对比**(如 SendPage/DisplayPage),列出**全部**差异再动手,不能只挑一个看着像的改。

### 失败路线(5 次,全部 ruled out)

- **改 q-page 内部 flex 链**(`min-h-0` / `overflow-hidden` / `flex-1`):改了 q-page → 中间容器 → ExecutionListPage 根 → 右栏 全链 5 环,**无效**。因为断点在 q-page **之上**(q-page-container),不在 q-page 之下。
- **`min-h-full` → `h-full`**(q-page):理论上对,但 q-page-container 没显式 height → h-full 引用空 → 失效。
- **给 q-page-container 加 `height:100% + overflow:hidden`**(AppShell):理论最对,但用户反馈**仍不行**。可能 scoped 样式没穿透到 Quasar 内部渲染的 q-page-container DOM,或 height:100% 的父级(q-layout)也没显式 height。**未验证**(用户决定搁置)。

### ruled out 的具体结论

- `q-page` 内部怎么改 flex/min-h-0 都救不了——断点在它父级。**以后排查先看 q-page-container,不要先钻 q-page 内部**。
- 不能假设 `h-full` 生效——先确认它的引用链(父→祖→…→有显式 height 的祖先)每一环都有显式 height。

### 可复用部分

- **systematic-debugging 的价值**:5 次失败全是违反了"先 gather evidence(at component boundary)再改"——纯读代码猜。第 6 次按方法论要浏览器实测时,用户已失去耐心搁置。教训:**这类问题第一次就该要求浏览器 DevTools 数据,不要试图纯前端代码推断**。
- D007(flex max-height:100% 撑开陷阱)是同类知识的另一面(D007 讲 q-table 全量渲染撑破 flex,本 D011 讲 q-page 高度链断在 container 层)。两者合起来覆盖"全屏列表/表格页高度问题"的主要陷阱。

### 影响范围

- AppShell.vue 有未验证的 `q-page-container { height:100%; overflow:hidden }` 改动(commit `6feae8e`/`b40e2b8`),可能无效或被 scoped 限制。后续排查时**先验证这行到底生没生效**(DevTools 看 q-page-container 的 computed height)。
- S011 已把 ExecutionListPage 拆成子组件(TaskDetailPanel 等),后续排查以 S011 后的结构为准。

### 来源

- S013(编辑弹窗深度重设计附带的 ExecutionListPage 右栏高度问题)
- 用户证据:"除了最上面的激光模拟器标题栏,别的都被撑开" + body 出竖向滚动条 + 撑到 q-page-container 层
- 触发原话:"依然是完全撑开" / "没用啊?它依然会给顶起来" / "依然不行,不管了"(搁置)
- 5 次失败 commit:009f271 / 104c917 / 7202e5d(已 revert) / 97e6d74(已 revert) / 6feae8e+b40e2b8(未验证)

## D012: 等待条件三处修复 —— fieldValueProvider 接线 + onTimeout=fail 终态改 failed + KPI 加已停止计数

> status: active
> date: 2026-06-24
> 取代：无
> 被取代：无

### 决策

S014 测试发现的三处问题,用户拍板"全部一起修",三条一并落地:

1. **fieldValueProvider 生产接线(真 bug 修复)**:`runtime/feature-wiring.ts:146` 的 `createTaskService` 加 `fieldValueProvider: () => receiveEventSourceBridge.getLatestFieldValues()`;`ReceiveEventSourceBridge` 加 `getLatestFieldValues()`(emit 时按 fieldId 扁平 merge 维护最新快照)。让 `repeat.until` / `exitCondition` 在生产生效(原 bug: 未接 → 永不触发)。
2. **onTimeout=fail 终态改 failed(符合直觉)**:`task-error-policy.ts:32` 的 `'stop'` 分支从 `updateLifecycle('stop')`(=stopped) 改成 `updateLifecycle('fail', {error})`(=failed)。手动 `stopTask` 仍走 `'stop'`→stopped, 与错误失败区分。
3. **KPI 加「已停止」计数**:`ExecutionKpiBar.vue` 在历史区加「已停止」项(stopped 任务原在 KPI 凭空消失)。

### 理由

1. fieldValueProvider:`StepRepeat.until` / `TaskStopCondition.exitCondition` 的数据模型、UI、求值逻辑都完整,唯独生产 wiring 漏接——这是 S014 实测确认的真 bug(三向验证:无 provider 时 repeat.until 跳过/exitCondition return false;有 provider 时都生效)。wait-condition step 不受影响(走 push registry)。bridge 是值的自然汇聚点(唯一 emit 调用点上游),且已连 taskService,接 `getLatestFieldValues()` 最小侵入。
2. onTimeout 终态:`onTimeout:'fail'` + `errorPolicy.onFailure:'stop'` 原终态是 stopped(非直觉——"fail" 暗示失败却显示"已停止")。根因:手动 stop 和 errorPolicy stop 共用 `updateLifecycle('stop')`→stopped,只有 retry 用尽才 failed。最小改法是 errorPolicy 的 stop 分支改走 fail——手动 stopTask 完全不受影响(仍 stopped),两者自然区分,不需要给 action 加 stopReason 的大改。
3. KPI stopped:stopped 任务(selectors `TERMINATED_LIFECYCLES` 含 stopped)会进历史表(显示"已停止"灰),但 KPI 只统计 completed/failed → stopped 在 KPI 消失,用户(原话"似乎目前没有已停止的计数")看不到手动停止/中断的任务数。加一项补全。

### 排除的替代方案

- **fieldValueProvider 数据源**:否决"从 receiveService/storage 取最新帧"——那些是 raw 字节/outcome,未解码成 fieldValues;bridge.getLatestFieldValues 是已解码标量(routing-tick 构造 matchInput 时已解码),最直接。否决"新建独立 latestFieldValues store"——bridge 已是汇聚点,重复造。
- **onTimeout 终态**:否决"给 action 'stop' 加 stopReason: 'manual'|'error-policy'"——影响面扩到 types/状态机/state/历史过滤/UI map,太大。否决"保持现状只加 UI 提示"——治标不治本,反直觉终态仍在。选最小改法(error-policy stop→fail),手动 stop 语义不变。
- **fieldId 冲突**:pull 路径(getLatestFieldValues 按 fieldId 扁平)跨帧重名会覆盖,这是现有 ConditionMatchInput.fieldValues 契约的固有约束(push 路径靠 registry frameId 索引隔离,pull 路径 fieldId 需用户保证全局唯一)。不为此改契约。

### 影响范围

- `runtime/bridges/receive-event-source-bridge.ts`:加 `getLatestFieldValues()` + `latestFieldValues` 字段 + emit 维护 + clear 清空。
- `runtime/feature-wiring.ts:146-152`:createTaskService 加 fieldValueProvider。
- `features/task/services/task-error-policy.ts:31-33`:'stop' 分支改 'fail'。
- `features/task/components/executions/ExecutionKpiBar.vue`:加「已停止」项 + `--stopped` 样式。
- 测试断言更新(终态 stopped→failed):`task-service-state-selector.spec.ts`(2 处)、`task-error-strategies.spec.ts`(2 处)、`command-ingress-task-ack-chain.spec.ts`(1 处)、`connection-lifecycle-boundaries.spec.ts`(2 处)、`wait-condition-coverage.spec.ts`(3 处)。全是 errorPolicy stop 触发的错误失败用例(手动 stop 用例不变)。
- 新增回归测试:`wait-condition-coverage.spec.ts` 加 fieldValueProvider 接线生效(bridge.getLatestFieldValues + repeat.until/exitCondition)+ 手动 stopTask 仍 stopped(共 6 用例)。

### 来源

- S014 实测发现(fieldValueProvider 三向验证)+ 用户原话决策("1可以修"/"2感觉是不是弄成符合直觉比较好"/"全部一起修")
- 触发原话:"似乎目前没有已停止的计数"(→ KPI stopped 计数)
- 验证数据:task 全套 317/317 + 受影响集成 19/19 全过;pre-existing 5 失败(tcp-receive-datapath 4 + event-truncation 1)经 baseline 比对确认与本修复无关

---

## D013: routingTick 僵尸写入路径根除——推翻 D010 续接二轮的"攒批治本"+ 否决滚动上限的错误前提

> status: active
> date: 2026-06-26
> 取代：D010（续接二轮部分:攒批治本）
> 被取代：无

### 决策

**砍掉 routingTick 里 `fanOutToStorage` 这条无条件写 records 的路径(B 路径)及其全部死代码,并给 startTickDriver 加 in-flight guard 防并发雪崩。** records 的唯一合法写入入口是 DisplayPage 的"记录"按钮(`appendLocalRecords`,路径 A)。这是对 D010 续接二轮"攒批治本"结论的推翻——治的是一条本不该存在的僵尸写入路径,优化它没有意义,根除它才对。

### 核心失败机制(D010 续接二轮为何没治本,且为何该推翻)

D010 续接二轮(2026-06-25)声称"路由路径降 5000 倍(20k:49.8ms→0.01ms)",但:

1. **那 5000 倍是假象**——测的是"不触发攒批的那一帧"(0.01ms)。攒批满 50 触发的全量深拷贝一个字没碰。
2. **运行埋点实锤没解决**:2026-06-26 用户在 prod 运行埋点(routingTick 四段计时),`storage×6(peak 894ms)`,6 次写盘每次峰值 ~1s,13 事件 ~1s、27 事件 ~1.5s **随 N 线性涨**。攒批写盘触发 `writeMaterial` → fake adapter `cloneStorageValue` 对整个 N 数组全量深拷贝 = O(N),和续接二轮之前一模一样,只是从"每帧小写"变成"每 50 条一次大写",单次峰值更高。
3. **续接二轮否决"records 滚动上限(C 方案)"的前提是错的**——它以为 routingTick 写的 records 是给 History 页用的(否决理由"丢历史数据,History 页查不到早期记录")。但代码实锤:routingTick 写的 record.fields.key 是裸 `f.fieldName`,History 页 `useHistoryData.ts:122` 要 4 段 `groupId:frameId:fieldId:fieldName` 才画点——**B 路径的数据 History 永远画不出,是僵尸写入(无开关/格式错/无人正确消费)**。给僵尸写入加滚动上限是给死数据加 cap,毫无意义。

**真正的根因链**(三方确认:运行埋点 + 代码 + 用户症状):
- 用户症状:"连串口立刻卡成一坨,断开立刻好,必须重启"——和 D010 续接二轮记录的"拔串口立刻好"是同一症状,但续接二轮治错了地方(优化内存深拷贝而非根除写入)。
- 生产用 fake adapter(`feature-wiring.ts:101`),records **从不落盘**(real adapter 在生产零引用,bootstrap 从不调 loadLocalRecords),所谓"全量重写磁盘"在生产不存在——卡顿是内存里 N 无限增长 + 攒批触发全量深拷贝。
- `setInterval(100ms)` 无并发保护,单 tick 超 100ms 后并发 tick 各自抢全量深拷贝 → 雪崩冻屏 → 只能重启。

### 否决了什么

- ❌ **续接二轮的"攒批治本"(D010 续接二轮第 6 点)**:攒批没治本,反而把"每帧小写"变成"每 50 条一次大写",单次峰值更高。攒批逻辑(`WRITE_BATCH_THRESHOLD`/`pendingWriteCount`/`batchWrites`)+ `appendRoutedRecords`/`flushPendingWrites`/`fanOutToStorage` 全部作为死代码删除。
- ❌ **续接二轮否决"滚动上限"的理由**(以为 B 路径数据给 History 用):前提错误,B 路径是僵尸写入。
- ❌ **给 routingTick 写 records 路径做任何优化(append-only/分片/滚动上限)**:治标。B 路径本身就该不存在,优化它是浪费。正确做法是根除。

### 可复用部分(D010 续接二轮中保留的)

D010 续接二轮的内存层优化 **不是全错**,以下保留并继续服务路径 A(`appendLocalRecords`):
- `appendRecords` mutable push(O(新增))
- `hasRecordId` Set 索引(O(1))
- `clearLastIssue`(O(1) 不返 snapshot)
- `truncateRecords`(O(1) 写盘失败回滚)
- `canAppendInOrderFast` 快速路径

这些在 D013 后归入 `appendAndPersist`(原 `applyRoutedAppend` 简化,去掉 batchWrites 参数,恒立即写盘),只服务路径 A。

### 影响范围

- **删除**:`runtime/bridges/receive-storage-bridge.ts`(整文件,`fanOutToStorage`+`toStorageRecord`)、`storage-local-baseline/__tests__/storage-append-no-growth.spec.ts`(测已删的 appendRoutedRecords)。
- **runtime**:`routing-tick.ts` 删 fanOutToStorage 调用 + storageMs 计时段(RoutingTickTimings 去掉 storageMs 字段);`index.ts` startTickDriver 加 in-flight guard(`tickInFlight` flag,上一 tick 未完成则跳过本次 setInterval 触发)+ destroy 删 `flushPendingWrites` 调用。
- **storage-local-baseline**:`storage-local-service.ts` 删 `appendRoutedRecords`/`flushPendingWrites` 方法(接口 + 实现),`applyRoutedAppend` 简化为 `appendAndPersist`(去 batchWrites 参数 + 攒批逻辑,恒立即写盘)。**保留** `appendLocalRecords`(路径 A,DisplayPage 录制按钮用,History 靠它)。
- **测试**:routing-tick-perf.spec storage 段 bench 退役;"开久了卡" bench 删除;4 个 integration(fanout-consumer-order/routing-tick-regression BF-1 块/routing-tick-error-isolation)删/改 storage 相关测试;helpers/history mock 清理 appendRoutedRecords/flushPendingWrites;routing-tick.spec 去 storageMs 断言。新增回归:routing-tick.spec "routingTick 不写 storage(D013)"+ bootstrap-integration "tick 不并发(in-flight guard)"。
- **契约**:StorageLocalService 接口 -2 方法(appendRoutedRecords/flushPendingWrites);RoutingTickTimings -1 字段(storageMs)。getSnapshot 深拷贝隔离契约原样保留(reader/History 按需付代价)。

### 验证

- 受影响 8 文件 39/39 过(含 2 个新回归)。
- 全量 11 failed / 1868 passed;stash 基线比对 11 = 11(baseline 1877 passed → 我的 1868 passed,差 9 是删的死代码测试,非回归)。
- tsc src/ 0 错;lint 我的文件 0 错。
- 11 failed 全 pre-existing(event-truncation 1 + tcp-receive-datapath 4 + heartbeat-timer 5 + frame-service-state-selector 1,后两个与 storage/routing 零关系)。
- **待用户目标机实测**:连串口跑,看 `[routingTick] slow over 5s: storage×N` 警告是否消失(storage 段已移除,应只剩 drain/parse/display)。

### 来源

- S015(2026-06-26,routingTick 僵尸写入根除 + tick 防雪崩)
- 运行埋点实锤:`[routingTick] slow over 5s: storage×6(peak 894ms) | peakEvents=13`(用户 prod console)
- 用户决定性症状:"连串口立刻卡 / 断开立刻好 / 必须重启"
- 用户直觉纠正:"我没开记录才对,这有什么要记的吗?" → 触发对 B 路径存在必要性的质疑
- 代码三方确认:receive-storage-bridge.ts:14(key=裸 fieldName) vs useHistoryData.ts:122(要 4 段 key) vs feature-wiring.ts:101(生产 fake adapter)
- 触发原话:见 voice.md 2026-06-26

---
