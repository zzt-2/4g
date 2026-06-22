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
