# H008 — task step 级参数变化机制（字段级可变参数 + 表达式连续累积，共用骨架）

> 2026-06-17 | 实施交接（v2 合并版） | 状态: 待新对话实施
> 上游: S010（`2026-05-18-northbound-integration/S010-task-parameter-variation-and-repeat-semantics.md`）/ S002 / D001（本专题 `2026-06-10-ui-feature-bugs`）
> 主对话统筹

## 版本说明

**v1（已废弃）** 曾把"字段级可变参数"和"表达式连续累积"当两个独立机制、两个独立对话做。

**v2（当前，2026-06-17 更新）** 主对话讨论后发现两机制**底层共用骨架**（step 内 repeat 索引递增 + 取值策略调度），决定**合并到一个对话实施**。D001 的"分开"指的是"分开决策/设计记录"，不指"实施必须分两个对话"。实施合一是工程优化，避免重复搭骨架。

⚠️ **实施时若用户问"要不要分两个对话"**：已拍板合一（选择 1），不要拆。

## 背景与定位

用户拍板（D001）：task 参数变化机制分两个**问题**。本 handoff 同时实施**两个问题**，因为它们共用 step 内执行骨架：

- **问题一（表达式连续累积）**：任务期间参数连续，每次根据上次值计算。例 `速度 = 速度 + 步进`。
- **问题二（字段级可变参数 + 数目驱动重复次数）**：离散值列表下沉到字段级，重复次数响应式联动。

## 用户拍板的语义（实施时以此为准，原话见 voice.md）

### 两个机制的关系

**两个独立机制，step 级二选一**（不混用、不合并机制本身）：
- 用户语义层：一个 step 的某字段，要么用可变参数（手填值列表），要么用连续累积（公式递推）。不混用。
- **底层共用骨架**：step 内 repeat 计数器 + 取值调度，只换"取值函数"。工程上复用，不重复搭。

用户原话："我想的是独立机制，因为它们用处不同？而且你知道怎么合并吗？我不知道" → 决定：**机制独立（二选一），骨架共用（选择 X）**。不硬合并机制，因为混用会产生索引对齐/步调不一致问题，且无收益。

### 连续性边界（问题一的关键语义，已拍板）

- **连续性边界 = 单个 step**。每次进入一个 step，计数器重置。
- 例子（用户原话）：任务发 `a-b-a`，各重复5次，迭代2次，每次加1：
  - 第一个 a：迭代1 = 1-5，迭代2 = 6-10
  - 第二个 a：迭代1 = 1-5，迭代2 = 6-10（**重置**，不接第一个 a 的 10 变成 11-15）
- 跨 step 不连续（否决了"帧类型全局计数器"方案）。

### "每次加1" = 每次 repeat（已拍板）

- counter 在 step 内 **repeat × iteration 全局递增**。迭代1发5次(1-5)，迭代2发5次(6-10)。
- repeat 是"步进次数"，iteration 是"分批发"，组合起来按**总发送次数**递增。

### 问题二（字段级可变参数）语义

1. **可变参数从"任务级"下沉到"字段级/step 级"**：当前 `fieldVariations` 挂在 `TaskDefinition`（任务级），改成 step 级。
2. **重复次数响应式联动（一次性触发）**：
   - 用户编辑某字段的可变参数列表时 → 重复次数（`StepRepeat.maxCount`）自动跟着这次编辑的数目变。
   - **联动只在"编辑可变参数"时触发**。之后用户手动改重复次数，**不再被覆盖**。
   - 实现含义：不是 watch/computed 持续绑定，是"编辑可变参数"的 handler 里同步写一次 maxCount。
3. **索引规则（每次重复 +1，取完保留最后一个）**：索引超出值列表长度 → **保留最后一个值**（clamp，不停止、不报错）。
4. **数值驱动举例**（用户原话）：
   - 填 15 个值 → 重复次数自动变 15
   - 手动把重复改 5、迭代改 3 → 分 3 轮、每轮 5 次、共 15 次、刚好发完
   - 迭代改 1、重复 5 → 只发前 5 个
   - 重复改 20（>15）→ 发完 15 次后，剩 5 次重复用第 15 个值
5. **跨字段值列表长度不一致**：字段A有15个、字段B有3个，重复15次时，B 第4-15次保留 B 的第3个值。

### 问题一（连续累积）语义

1. **连续性边界 = 单个 step**（见上）。
2. **公式归帧管，不归任务管**（用户原话："语义耦合在帧。如果需要不同的，我宁愿多定义一个帧类型"）。
   - 即：累加公式（如 `速度 = 速度 + 步进`）写在**帧字段的 expressionConfig** 里，不写在 task step 上。
   - task 只是"用这个帧 + 把每次结果存下来喂下次"。
   - 复用 send 链路已有的 writeback 机制（commit 4375857）。
3. **不碰表达式引擎 / 不违反 D6**：状态存 step 级临时执行上下文（step 跑完丢弃），引擎仍是纯函数。详见"设计：共用的 step 内执行骨架"。
4. **accumulation 公式里的变量取值顺序**（已拍板，选 c）：公式求值时，变量先查 step 的 lastValues（accumulation 之间互相引用），再查 userFieldValues（固定值）。都支持。
5. **重复次数联动只对 variation 生效**：accumulation 没有"值列表长度"概念，不联动 maxCount（用户自己定 repeat 次数）。

## 接收方验证（续接对话时必须完成）

- [ ] 已读取 topic-index 的不变量段落
- [ ] 已验证本文件中的至少 3 条关键事实声称：
  - 声称1：`fieldVariations` 当前挂在 `TaskDefinition`（任务级） → 验证：`rewrite/src/features/task/core/types.ts:113`
  - 声称2：`resolveFieldValues` 按 `iteration` 索引取值，repeat 循环传同一个 iteration → 验证：`task-iteration-loops.ts:132-146` + `:150-189`
  - 声称3：当前 UI 在 `AdvancedConfigPanel.vue`（任务级面板），fieldId 是自由文本输入无下拉 → 验证：`AdvancedConfigPanel.vue:162-200`
  - 声称4：速度模拟帧 S-FPGA-004 的 expressionConfig 已含自引用累加公式 `速度+速度步进` → 验证：`public/data/templates/frames-v2.json:1532-1555`
- [ ] 已检查 `_registry.yaml` 中本专题的 depends_on 和 conflicts_with
- [ ] 已确认当前范围：**两个问题一起做**（选择 1，v2 合并版），不要拆回两个对话

## 必读（实施前）

1. **本 handoff**（语义 + 代码现状 + 共用骨架设计 + 设计待决）
2. **D001**（`2026-06-10-ui-feature-bugs/decisions.md`）—— 两个问题的边界 + "分开决策、合一实施"的说明
3. **S010**（`2026-05-18-northbound-integration/S010-task-parameter-variation-and-repeat-semantics.md`）—— 原始问题发现 + 三 agent 调研
4. **voice.md 2026-06-17**（用户原话，语义以原话为准）

## 设计：共用的 step 内执行骨架（主对话已敲定）

### 核心抽象：FieldValueResolver

每个 send step 的每个"会变的字段"挂一个 resolver，二选一：

```ts
type FieldValueResolver =
  | { kind: 'variation'; fieldId: string; values: readonly (string | number)[] }
  | { kind: 'accumulation'; fieldId: string; formula: string; initial: number | string };
```

- **variation（问题二）**：手填值列表，按 counter 索引取，clamp 到最后一个。
- **accumulation（问题一）**：公式递推，首次用 `initial`，之后用 `eval(formula, vars)`，结果写回 lastValues。
- 一个 step 内，**各字段独立选自己的 resolver 类型**（字段A用variation、字段B用accumulation 可以共存），但**同一字段不能同时是两种**。

> ⚠️ 注意：上面"字段A用variation、字段B用accumulation"是字段级的二选一，不是"机制合并"。主对话已确认这种字段级混用是允许的（不同字段不同用途），要避免的是"同一字段既查表又算公式"。

### Step 内执行流程

```
进入 step（executeRepeatableSend）:
  1. 创建 stepContext = {
       counter: 0,
       lastValues: new Map<fieldId, value>(),   // accumulation 的"上次值"，step 级临时
     }
  2. 每次 repeat（counter++）:
     a. 对每个有 resolver 的字段：
        - variation: value = values[min(counter-1, values.length-1)]
        - accumulation:
            value = counter===1 ? initial
                                : eval(formula, resolveVars(formula, stepContext, stepConfig))
            stepContext.lastValues.set(fieldId, value)   // 写回供下次引用
     b. 把这些值 merge 进 userFieldValues，送进 buildSendRequest
     c. 执行 send
  3. step 结束（repeat 循环退出），stepContext 丢弃（天然实现"step 边界重置"）
```

### accumulation 公式变量取值（resolveVars，已拍板选 c）

公式 `速度 = 速度 + 步进` 里的变量解析顺序：
1. 先查 `stepContext.lastValues`（accumulation 字段之间互相引用，如 `速度` 引用上次的 `速度`）
2. 再查 `stepConfig.userFieldValues`（固定值，如 `步进`）
3. 都没有 → 该变量 undefined（按现有表达式引擎的未定义行为处理）

### 共用骨架的两条链路改动

1. **repeat 索引穿透**（两机制共用）：`executeRepeatableSend` 的 `count`（repeat 索引）要传进 `executeSendStep` → `buildSendRequest`，作为 counter。
2. **stepContext 穿透**（accumulation 用）：step 级临时 map 要在 step 开始时创建、在 repeat 每次时读写、step 结束时丢弃。挂在 `TaskExecutionContext` 或传参。

### 关键：状态边界

- **lastValues 是 step 级临时，不进 TaskInstanceState**。step 跑完即丢。这完美匹配"单 step 边界重置"语义，且不污染实例状态、不动 D6。
- accumulation 的 `formula` 来自帧的 expressionConfig（帧管），task 只是搬运。

## 代码现状（精确 file:line，已由 explore agent 核查）

### 1. fieldVariations 类型 + 挂载点（任务级）

- 类型：`rewrite/src/features/task/core/types.ts:43-48`
  ```ts
  export interface FieldVariation {
    readonly fieldId: string;
    readonly values: readonly (string | number)[];
  }
  ```
- 挂在 `TaskDefinition.fieldVariations`：`types.ts:113`
- builder 镜像：`task-builders.ts:58`
- ⚠️ 当前**不在** `SendStepConfig`（`types.ts:60-67` 只有 `userFieldValues`/`variables`/`repeat`）

### 2. resolveFieldValues（按 iteration 取值，要改成 step 内 counter 取值）

`rewrite/src/features/task/services/task-iteration-loops.ts:132-146`：
```ts
function resolveFieldValues(
  baseValues, fieldVariations, iteration,
) {
  if (!fieldVariations || fieldVariations.length === 0) return baseValues ?? {};
  const result = { ...(baseValues ?? {}) };
  for (const variation of fieldVariations) {
    if (iteration < variation.values.length) {
      result[variation.fieldId] = variation.values[iteration]!;
    }
  }
  return result;
}
```
- 索引是 `iteration`（外层 task 循环索引）——**不对**，要改成 step 内 counter（repeat×iteration 全局递增）
- 取值无 clamp：`iteration >= values.length` 时**不写入**——**不对**，要改成 clamp 到最后一个
- 在 `task-iteration-loops.ts:321-323` re-export 给 executor

### 3. executeRepeatableSend（repeat 循环传同一个 iteration，repeat 索引丢失）

`task-iteration-loops.ts:150-189`：
```ts
while (count < maxCount) {
  const result = await ctx.stepExecutors.executeSendStep(
    instanceId, step, iteration, stepIndex, definition,  // ← iteration 固定，count/repeat 索引没传进去
  );
  ...
  count++;
}
```
- `repeat.maxCount` 在 `:167` 读取一次
- **`count`（repeat 索引）没有传入 `executeSendStep` / `buildSendRequest` / `resolveFieldValues`**。核心 gap：要把 count 作为 counter 穿进去。

### 4. buildSendRequest

`task-step-executors.ts:19-45`：
```ts
return {
  frameId: stepConfig.config.frameId,
  targetId: resolvedTargetId ?? '',
  userFieldValues: resolveFieldValues(
    stepConfig.config.userFieldValues,
    definition.fieldVariations,   // ← 任务级，要改成 step 级
    iteration,                     // ← 要改成 step 内 counter
  ),
  variables: stepConfig.config.variables,
  context: { source: 'task', taskId: definition.id, stepIndex },
};
```

### 5. StepRepeat 类型

`types.ts:50-56`：
```ts
export interface StepRepeat {
  readonly intervalMs: number;
  readonly until?: readonly ConditionTerm[];
  readonly maxCount?: number;   // ← variation 响应式联动的目标字段
}
```

### 6. TaskInstanceState（无 mutable 状态）

`types.ts:164-180`：只有 lifecycle + 计数 + stepResults，**无任何 per-run 可变字段**。`TaskStepResult`（`types.ts:156-160`）带 `iteration` 但**不带 repeat 索引**。
- **accumulation 的 lastValues 不进这里**（step 级临时，不污染实例状态）。

### 7. UI 现状（任务级，要迁到 step/字段级）

- **可变参数编辑**：`AdvancedConfigPanel.vue:162-200`，fieldId 是**自由文本 q-input**（无下拉），values 是逗号分隔文本。挂载在任务级面板。
- **重复配置编辑**：`SendStepEditor.vue:126-179`（`q-expansion-item label="重复配置"`），`maxCount` 在 `:142-149`，`patchRepeat` 在 `:44-46`。
- 任务级面板绑定点（迁移后要拆掉 field-variations 绑定）：`ExecutionListPage.vue:841,845`、`TemplateListPage.vue:538,542`

### 8. 字段下拉 API（就绪）

`FrameAssetService.listFieldReferences(query)`（`frame-asset-service.ts:104-106`），返回 `FrameFieldReference[]`（含 `{ fieldId, fieldName }`）。已有用法先例：`ConditionTermEditor.vue:30`。`AdvancedConfigPanel.vue:12` 已注入 `frameService`。

### 9. 速度模拟帧的现成 accumulation 公式（问题一可直接复用）

`public/data/templates/frames-v2.json:1532-1555`（S-FPGA-004 "速度模拟"）：
```json
"expressionConfig": {
  "expressions": [{ "condition": "true", "expression": "速度+速度步进" }],
  "variables": [
    { "identifier": "速度步进", "sourceType": "current_field", "sourceId": "p2_..." },
    { "identifier": "速度", "sourceType": "current_field", "sourceId": "lOsGa8u4..." }  // 自引用
  ]
}
```
- 这是**已存在的帧级累加公式**。问题一实施时，task 要做的是：执行这个帧时，把上次结果喂回 `速度` 变量。
- ⚠️ 注意：send 链路（SendPage）已有这个帧的 writeback（commit 4375857），task 链路要照搬一套（step 级临时上下文）。

### 10. 顺手修的两个 bug（本 handoff 范围内）

- **进度爆表**：`progress.ts:5` `stepsPerIteration = steps.length`，但 repeat 每次 `addStepResult`，导致 `stepResults` 数量 > steps.length，进度 > 100%。相关 `countCompletedIterations`（`progress.ts:55-65`）也依赖 `iterResults.length >= stepsPerIteration`。
- **maxIterations 静默覆盖**：`types.ts:261-271` `resolveStopCondition`，有 fieldVariations 时 `maxIterations = max(values.length)`，丢弃用户在 UI 设的 `stopCondition.maxIterations`。迁移到 step 级后这个分支要么消失要么重写。

## 设计待决（实施对话先敲定再写代码）

1. **resolver 挂哪**：
   - 方案 A：挂 `SendStepConfig.fieldResolvers`（每个 send step 一份 resolver 列表，跟 repeat 同层）
   - 方案 B：挂到更细的字段级（`SendStepConfig` 内每个字段配置带 resolver）
   - 倾向 A（与 repeat 同层，语义清晰，改动小），但实施对话需结合 UI 形态确认。

2. **accumulation 的 formula 从帧 expressionConfig 怎么取**：
   - 问题一语义是"公式归帧管"。task step 配 accumulation resolver 时，formula 是从帧的 expressionConfig 读（运行时查帧），还是在 task 里复制一份？
   - 倾向：task 只声明"这个字段走 accumulation + initial 值"，formula 运行时从帧 expressionConfig 取（避免数据冗余/不一致）。

3. **repeat 索引怎么穿进去（签名改动）**：
   - `executeRepeatableSend` → `executeSendStep` → `buildSendRequest` → `resolveFieldValues` 链路上加 counter 参数。
   - 注意 `executeSendStep` 签名（`task-step-executors.ts`）和 `TaskStepResult` 是否要加 repeat 索引字段（加了 UI 能显示"第几次重复"，不加则只内部用）。

4. **响应式联动实现（问题二）**：
   - 不是 watch/computed 持续绑定，是"编辑可变参数"的 handler 里同步写一次 `maxCount`。
   - 需要区分"这次 maxCount 变更是联动触发的"vs"用户手动改的"。可在 editor 里用一个临时变量记录"上次联动值"，手动改后不再覆盖；或用一个 flag 标记"用户已手动改过 maxCount，后续编辑可变参数不再联动"。

5. **iteration 和 counter 的协同**：
   - 用户举例"迭代3轮×重复5次=15次发完15个值"。需确认 15 个值是按 step 内全局 counter 取（第1轮用1-5，第2轮用6-10，第3轮用11-15）——**是的，counter 在 step 内 repeat×iteration 全局递增**（已拍板）。但实现上，外层 iteration 循环每进入一次，内层 repeat 循环的 counter 是接着上次还是重置？按"step 内全局递增"语义，counter 在 step 开始时初始化、iteration 循环进来不重置（只在 step 边界重置）。

6. **字段级混用的边界**：允许 step 内"字段A用variation、字段B用accumulation"（已确认）。但要禁止"同一字段既variation又accumulation"——加类型约束或运行时校验。

## 不要做

- ❌ **不要给表达式引擎加赋值算子**（违反 D6）。accumulation 的递推由 task 层的 stepContext.lastValues 实现，引擎只算纯表达式。
- ❌ **不要把 accumulation 的 lastValues 塞进 TaskInstanceState**（那会破坏单 step 边界语义，且污染实例状态）。lastValues 是 step 级临时。
- ❌ **不要把 variation 和 accumulation 合并成一种机制**（用户拍板机制独立，只是共用骨架）。
- ❌ **不要碰 northbound / 甲方对接**（另一个专题）。
- ❌ 不要跳过前端规范检查（lint 要 0 新增 error）。

## 验收标准

### 共用骨架
- [ ] repeat 索引穿透 executeRepeatableSend → executeSendStep → buildSendRequest
- [ ] step 级临时上下文（counter + lastValues）在 step 开始创建、结束丢弃
- [ ] step 内 counter 在 repeat×iteration 全局递增；step 边界重置

### 问题二（字段级可变参数）
- [ ] 字段级可变参数：在 send step 上能配置每个字段（或 step）的值列表
- [ ] 字段下拉用 `listFieldReferences`（不再自由文本输 fieldId）
- [ ] clamp 到最后一个值（跨字段长度不一致也 clamp）
- [ ] 编辑可变参数 → maxCount 联动一次；之后手动改 maxCount 不被覆盖
- [ ] 用户的 4 个举例场景全部通过：
  - 填15 → maxCount=15
  - maxCount=5 + iteration=3 → 3轮×5次=15次发完
  - maxCount=5 + iteration=1 → 只发前5个
  - maxCount=20（>15）→ 15次后重复第15个值

### 问题一（连续累积）
- [ ] accumulation resolver：首次用 initial，之后用公式递推
- [ ] lastValues step 级临时，step 结束丢弃（验证第二个 a 从 initial 重新开始）
- [ ] 公式变量取值：lastValues 优先，userFieldValues 其次
- [ ] 用户例子验证：任务发 a-b-a 各重复5次迭代2次每次加1 → 第一个a迭代1=1-5/迭代2=6-10，第二个a迭代1=1-5/迭代2=6-10
- [ ] 速度模拟帧 S-FPGA-004 在 task 下能连续累积（复用其 expressionConfig）

### 顺手修的 bug
- [ ] 进度爆表 bug 修复（progress 不再 >100%）
- [ ] maxIterations 静默覆盖 bug 修复

### 通用
- [ ] task 现有测试不破，新增覆盖：字段级可变参数 + repeat 索引取值 + clamp + accumulation 递推 + step 边界重置
- [ ] lint 0 新增 error

## 已知债务（交接时声明）

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| fieldVariations 在任务级 | 用户要 step/字段级 | 任务级，UI 在 AdvancedConfigPanel | 本 handoff 实施 |
| resolveFieldValues 按 iteration 取值 | 用户要 step 内 counter 取值 | task-iteration-loops.ts:132-146 | 本 handoff 实施 |
| repeat 索引在链路中丢失 | 取值需 counter | executeRepeatableSend 没传 count | 本 handoff 实施 |
| task 链路无 accumulation 递推 | 用户要连续累积 | 完全没有 | 本 handoff 实施 |
| 进度爆表 | 进度应 ≤100% | progress.ts:5 不计 repeat | 本 handoff 顺手修 |
| maxIterations 静默覆盖 | stopCondition 应被尊重 | types.ts:261-271 | 本 handoff 顺手修 |

## 相关文件（绝对路径）

- 类型：`rewrite/src/features/task/core/types.ts`（FieldVariation:43-48 / TaskDefinition:107-116 / StepRepeat:50-56 / SendStepConfig:60-67 / TaskInstanceState:164-180 / resolveStopCondition:261-271）
- builder：`rewrite/src/features/task/core/task-builders.ts:58`
- 取值：`rewrite/src/features/task/services/task-iteration-loops.ts`（resolveFieldValues:132-146 / executeRepeatableSend:150-189 / re-export:321-323）
- 请求构建：`rewrite/src/features/task/services/task-step-executors.ts:19-45`
- 进度：`rewrite/src/features/task/core/progress.ts:4-42`
- UI：`rewrite/src/features/task/components/AdvancedConfigPanel.vue:162-200`（可变参数）/ `SendStepEditor.vue:126-179`（重复）/ `ExecutionListPage.vue:841,845` / `TemplateListPage.vue:538,542`
- editor：`rewrite/src/features/task/composables/use-task-editor.ts` / `use-template-editor.ts`
- 字段下拉：`rewrite/src/features/frame/services/frame-asset-service.ts:104-106`
- 表达式引擎（**只读引用，不改**）：`rewrite/src/shared/expression/` + `rewrite/src/features/send/core/frame-resolver.ts`
- 速度模拟帧（accumulation 公式现成参考）：`public/data/templates/frames-v2.json:1532-1555`
- 测试：`rewrite/src/features/task/__tests__/task-core.spec.ts` / `task-service-state-selector.spec.ts`
- 上游决策：`2026-06-10-ui-feature-bugs/decisions.md` D001 / `2026-05-18-northbound-integration/S010-...md`

## 后续

1. 新对话实施（建议先敲定 6 个设计待决 → design → implement → 自检 → 审查）
2. 实施完成后回主对话，更新 topic-index + 补 D###（resolver 挂载形状最终方案 + step 骨架最终形状）
3. 沉淀：accumulation 公式归帧、task 只搬运行的这个职责切分，值得记到 codestable compound/decision（实施稳定后）
