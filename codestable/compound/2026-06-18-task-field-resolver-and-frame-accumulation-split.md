---
doc_type: compound
type: cross-feature-decision
status: draft
date: 2026-06-18
summary: task step 级参数变化机制(字段级可变参数 + 表达式连续累积)的跨 feature 职责切分——accumulation 公式归帧管,task 只搬运 + writeback(自动),不重造递推。用户只填离散值列表(FieldVariation),累积是 task 自动行为。
tags:
  - rewrite
  - task
  - send
  - frame
  - expression-engine
  - field-resolver
  - accumulation
  - cross-feature
---

# Task 字段解析器与帧累积公式职责切分

## 1. 背景与问题

task feature 需要"任务期间参数变化"能力,用户拍板两个独立问题(D001):

- **问题一(表达式连续累积)**:任务期间参数连续,每次根据上次值计算。例 `速度 = 速度 + 步进`。连续性边界 = 单个 step(step 内 repeat×iteration 全局递增,step 边界重置)。
- **问题二(字段级可变参数)**:离散值列表下沉到字段级,重复次数响应式联动(一次性触发),clamp 到最后一个值。

两机制底层共用骨架(step 内 repeat 计数器 + 取值策略调度),但机制独立(step 级二选一,不混用)。

核心设计问题是 **accumulation 的递推公式放哪**:
- 选项 A:task 层自建递推(formula 从帧复制到 task step,task 层调表达式引擎求值,维护 lastValues Map)。
- 选项 B:task 只声明"这个字段走累积 + initial",递推完全复用 send 链路 frame-resolver 已有的 self-referencing 表达式机制,task 只补 writeback 闭环。

## 2. 决策(选项 B:公式归帧,task 只搬运)

**accumulation 公式归帧管,task 只搬运 + writeback。**

- 帧的 `expressionConfig`(如 S-FPGA-004 的 `速度+速度步进`)是 formula 的唯一真理源。
- send 链路 `frame-resolver.ts` 已有完整的 self-referencing 表达式机制:
  - `isSelfReferencing(field)` 识别自引用字段(expressionConfig.variables 含 sourceType=current_field 且 sourceId=field.id)。
  - Phase 2:从 `userFieldValues[fieldId]` 取上次值当 seed(无则用 defaultValue/0)。
  - Phase 4:`evaluateFieldExpressions` 求值公式,结果写入 `values[fieldId]`,随 `resolveFieldValues` 返回进 `SendResult.resolvedFieldValues`。
- task 层只做一件事:**`executeSendStep` 成功后,把 `sendResult.resolvedFieldValues` writeback 到 step 级 `lastValues`,下次 buildSendRequest 合进 `userFieldValues` 当帧侧 seed**。
- **accumulation 不是用户声明的 resolver**(续接简化,见下)。

这与 `SendPage.vue` 手动发送的手动 writeback 是**完全同一个机制**——task 链路原本缺失,本次补全。

### 续接简化:accumulation 从 resolver 改为自动 writeback

初版把 accumulation 做成"用户填的 resolver"(`{ kind, fieldId, initial }`),但用户指出"步进表达式自己递增不需要任务里填"。核查帧侧确认:isSelfReferencing + Phase2(defaultValue 种子)+ Phase4 全部帧侧自给自足,task 唯一要做的是 writeback。

**accumulation 彻底改为 task 自动行为**:
- writeback 改自动:发送成功后无条件把整个 `resolvedFieldValues` 写回 stepContext.lastValues(非自引用字段回写也无害,被覆盖)。
- initial 不由 task 填,帧侧 defaultValue 是种子。
- 单发 send step(无 repeat)也走 writeback(跨 iteration 自动累积)。
- 用户零配置:只要帧有自引用表达式 + step 重复发送,就自动连续累积。

## 3. FieldVariation(用户唯一需要填的:离散值列表)

accumulation 简化后,`fieldResolvers` 改名 **`fieldVariations`**,只剩离散值列表:

```ts
interface FieldVariation { fieldId: string; values: readonly (string | number)[] }
```

挂 `SendStepConfig.fieldVariations`(与 repeat 同层)。按 step 内 counter 索引取值,clamp 到最后一个。

挂 `SendStepConfig.fieldVariations`(与 repeat 同层)。按 step 内 counter 索引取值,clamp 到最后一个。同一 fieldId 不能重复(validateTaskDefinition 校验)。accumulation 无挂载点——它是 task 自动行为,只要帧有自引用表达式就生效。

## 4. step 内执行骨架(counter 语义)

关键语义区分(用户原话"各重复5次迭代2次每次加1 → 迭代1=1-5,迭代2=6-10"):

- `repeat.maxCount` 是【每 iteration】的发送次数(per-iteration limit)。repeat 循环用局部计数 `iterSent`,每 iteration 从 0 开始。
- `stepExecCtx.counter` 是 step 内【跨 iteration 累积】的全局序号(1-based),resolver 用它取值。iter0 发 maxCount 次(counter 1..maxCount),iter1 接着(counter maxCount+1..2*maxCount)。
- `stepExecCtx.lastValues` 是 accumulation 字段上次值(step 级临时,不进 TaskInstanceState)。
- stepExecCtx 在 `runTask` 内 `Map<stepIndex, StepExecutionContext>`,跨 iteration 持久(同 step 累积),step 边界(不同 stepIndex)天然隔离,task 结束丢弃。

### resolveFieldValues 取值

- variation:`values[min(counter-1, values.length-1)]`(clamp 到最后一个)。
- accumulation:`lastValues.get(fieldId) ?? initial`(递推由帧侧完成,task 只喂 seed)。

### writeback(executeRepeatableSend 内)

发送成功后,把 `sendResult.resolvedFieldValues` 中属于 accumulation 字段的值写回 `stepExecCtx.lastValues`,下次 resolveFieldValues 取出注入 userFieldValues 当帧侧 seed。形成闭环:task lastValues ↔ userFieldValues ↔ 帧侧 seed/evaluate。

## 5. 选项 A 被否决的理由

- **重复**:帧侧 self-referencing 机制已完整(commit 4375857),task 层重造是重复实现递推。
- **两份 formula 真理源**:formula 在帧 expressionConfig 和 task step 各一份,易不一致(改帧忘改 task,或反之)。
- **违反 D6 风险**:task 层调表达式引擎求值递推,虽然引擎本身仍纯函数,但增加了 task 对引擎求值时机的依赖。选项 B 让 task 层零表达式求值代码。
- **语义无差异**:选项 A 和 B 都满足"单 step 边界 / repeat×iteration 全局递增 / 公式归帧"语义,选项 B 工程更优。

## 6. 影响的 feature 边界

| feature | 职责 | 不做 |
|---------|------|------|
| task | step 编排、counter 累积、lastValues 临时存储、writeback 触发、resolveFieldValues 取值注入 | 不求值公式、不持有 formula、不碰帧定义 |
| send(frame-resolver) | self-referencing 识别、Phase2 seed、Phase4 evaluate、产出 resolvedFieldValues | 不感知 task、不持有跨发送状态 |
| frame | expressionConfig 定义(formula 真理源) | 不参与运行时求值调度 |
| expression-engine(shared) | 纯函数求值 | 零状态、零 Vue/Pinia/Electron(D6 不变) |

## 7. 验证要点

- accumulation step 边界重置:a-b-a 任务,第二个 a 从 initial 重新累积(测试 USER CASE 验证 a2=[0,1,2,3,4] 不接 a1)。
- counter 跨 iteration 全局递增:variation maxCount=5 + iter=3 → counter 1-15,15 值刚好发完。
- clamp:counter 超过 values.length 保留最后一个(maxCount=20 > 15 → 后 5 次用第 15 个值)。
- writeback 闭环:mock sendResult.resolvedFieldValues 验证下次 resolveFieldValues 取到回写值。
- 速度模拟帧 S-FPGA-004 在 task 下连续累积(复用其 expressionConfig,task 补 writeback 后自动递推)。

## 8. 来源

- D001(`2026-06-10-ui-feature-bugs/decisions.md`):两问题合一实施拍板。
- D002(`2026-06-10-ui-feature-bugs/decisions.md`):实施形状落地 + accumulation 路径偏离记录。
- H008 v2(`2026-06-10-ui-feature-bugs/H008-field-level-variable-parameters-handoff.md`):交接文档(原设计选项 A,实施时改选项 B)。
- S010(`2026-05-18-northbound-integration/S010-task-parameter-variation-and-repeat-semantics.md`):原始问题 + 三 agent 调研。
- 用户拍板(voice.md 2026-06-18):accumulation 选"复用帧侧 self-ref + task 补 writeback"推荐路径。
