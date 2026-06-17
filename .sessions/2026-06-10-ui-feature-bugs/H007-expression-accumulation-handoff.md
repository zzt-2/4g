# H007 — 表达式累加问题(两条线 + 业务决策)Handoff

> 2026-06-17 | 调研+修复 handoff | 状态: 待业务拍板 + 待新对话执行
> 上游: H003-speed-simulation-debug / S010-task-parameter-variation | 主对话统筹

## 背景:这是"一个大问题",实际是两条线

用户说"任务那边,表达式有大问题,还不咋好弄"。主对话调研发现这其实是**两条独立的线**,根因相同(表达式引擎无状态 vs 业务要状态回写),但**范围、难度、解法完全不同**:

| 线 | 范围 | 状态 | 难度 |
|----|------|------|------|
| **A. send 链路速度模拟** | 单帧发送页 | 代码写了(commit 4375857),单测过,**运行时不生效** | 小-中(调试) |
| **B. task 链路字段累加** | 任务迭代/fieldVariations | **完全没动**,且需先做业务决策 | 大(可能改架构) |

共同根因(三层):
1. **引擎层**:`shared/expression/` 设计为纯函数、无赋值算子、`VariableMap` 是 `ReadonlyMap`。设计文档 D6 决策:"引擎不持有状态/缓存"。"明确不做:不做赋值"。
2. **send 层**:send 完成后没把表达式结果回写实例。H002 写了 writeback(`SendPage.vue:231-244`)但运行时失效。
3. **task 层**:`task-iteration-loops.ts` 的 `resolveFieldValues`(L132-146)只按 iteration 取离散值表 `variation.values[iteration]`,**没有"上次结果回写"通道**。

## ⚠️ 业务决策点(动手前必须拍板)

**这是阻塞性的——不拍板就开对话修,大概率白做。**

S010(2026-05-18 专题,`S010-task-parameter-variation-and-repeat-semantics.md`)把决策摆出来了但**从未拍板**。问题:

> "速度步进累加"到底要哪种?
> - **选项 1 — 连续累积**:速度 = 速度 + 步进,每次发送在上次结果上加。需要给引擎/实例加状态回写机制(违反设计 D6"无状态",或新增 mutable 变量层)。
> - **选项 2 — 离散值列表**:用户预设一组值 `[v0, v1, v2...]`,第 N 次发送用第 N 个值。现有 `fieldVariations` 已支持,只需 UI 修复 + 进度 bug。

S010:74-80 给的主对话推荐:**先做选项 2(离散值列表),砍掉连续累积,直到业务真出现连续累积需求**。理由:旧系统(`src/stores/frames/sendTasksStore.ts:35-38`)也不支持连续累积,离散值能覆盖绝大部分步进场景。

**用户必须先回答**:你的真实场景是哪种?(看旧系统怎么做的?还是你确实需要连续累积?)

## 两条线的具体任务

### 线 A:send 速度模拟运行时调试(难度小-中)

**前提**:无论选选项 1 还是 2,send 页单帧的速度模拟都得能工作。当前 commit 4375857 单测过但运行时不生效。

任务(按 H003-speed-simulation-debug.md 的排查方向):
1. **加 console.log 追踪实际帧数据**(H003:59-78 给了具体日志点)——这是从 2026-06-11 至今**一直没人做**的关键一步。
2. 确认 5 个运行时假设(H003:49-55)哪个不成立:
   - 实际帧的 `expressionConfig.variables.sourceType` 是不是 `current_field`?
   - runtime 注入的 `variableProvider` 和测试是否一致?
   - UI 回写时机有没有竞态?
   - 表达式中文名(`速度`)vs sourceId(`speed`)映射对不对?
   - 回写后 `saveSendInstances()` 有没有持久化?
3. 定位后修复,运行时验证"步进=1 连发 3 次,速度 0→1→2→3"。

**这条线不依赖业务决策**——无论连续累积还是离散值,单帧发送页的回写链路都得通。可以先做。

### 线 B:task 链路字段累加(难度大,依赖业务决策)

**前提**:必须先拍板上面的业务决策。

- 如果**选项 2(离散值)**:任务变为"小修"——修 `fieldVariations` UI + 进度 bug(`progress.ts:7` stepsPerIteration 不计 repeat 导致爆表;`types.ts:259-269` maxIterations 被 fieldVariations 静默覆盖)。S010:74 推荐这条路。
- 如果**选项 1(连续累积)**:任务变为"大改"——按 S010:51-56 的 5 步缺口清单:
  1. `TaskInstanceState` 加 `mutableVariables: Map<string, VariableValue>`
  2. `SendStepConfig` 加 `variableUpdates?: Record<string, string>`
  3. **表达式引擎加赋值机制**(违反 D6,需先建 D### 决策推翻/修订 D6)
  4. `executeSendStep` 完成后回写
  5. `buildSendRequest` 合并 mutableVariables

## 调研任务:新对话要做的

### 第一步:业务决策(用户回答,不是 agent 调研)
向用户确认:连续累积 vs 离散值列表?旧系统怎么做?——**这一步不解决,不要进第二步**。

### 第二步(决策后):分线执行
- **线 A 总是要做**(send 运行时调试),不依赖决策。
- **线 B 按决策结果**:
  - 选项 2 → 小修(fieldVariations UI + 进度 bug),可在线 A 之后顺手做
  - 选项 1 → 大改,先建 D### 决策(修订 D6 "无状态"原则),再按 5 步缺口清单实施。建议单独开专题。

### 不要做
- 不要在用户拍板前碰 task 链路(fieldVariations / TaskInstanceState 架构)
- 不要为"看起来应该支持"就给引擎加赋值(违反 D6,需决策背书)
- 不要忽略 send 链路的运行时调试(那是线 A,独立于线 B)

## 接收方验证(续接对话时必须完成)

- [ ] 已读取 topic-index 的不变量(表达式引擎 D6 无状态原则)
- [ ] 已验证至少 3 条关键事实声称:
  - 声称1: send 链路 commit 4375857 单测过但运行时不生效 → 验证: [git log + 读 H003]
  - 声称2: task 链路 resolveFieldValues(L132-146)只取离散值表 → 验证: [读 task-iteration-loops.ts]
  - 声称3: 表达式引擎无赋值算子、VariableMap 是 ReadonlyMap → 验证: [读 shared/expression/]
- [ ] **已向用户确认业务决策(连续累积 vs 离散值)**——若未确认 → 阻断,向用户问
- [ ] 已读 H003-speed-simulation-debug.md(线 A 排查手册)和 S010(线 B 决策上下文)

## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| send 速度模拟运行时不生效 | 单帧发送应支持自引用累加 | commit 4375857 代码在,单测过,运行时失效 | 线 A 加日志追踪定位 |
| task 字段累加未实现 | (取决于业务决策) | 完全没动 | 业务拍板后实施 |
| 引擎 D6"无状态"原则 | 设计约束 | 与连续累积需求冲突 | 若选连续累积,需建 D### 修订 D6 |
| step.repeat 进度爆表 | 进度计算应准确 | progress.ts:7 不计 repeat | 小修,线 B 选项 2 顺手修 |
| maxIterations 被 fieldVariations 覆盖 | stopCondition 应尊重 | types.ts:259-269 静默覆盖 | 小修,线 B 选项 2 顺手修 |

## 后续

1. **用户先回答业务决策**(连续累积 vs 离散值)
2. 线 A(send 调试)可立即开新对话做,不依赖决策
3. 线 B 按决策结果开对话:选项 2 在 ui-feature-bugs 专题下小修;选项 1 建议新开专题并先建 D### 修订 D6
4. 完成后回主对话,更新 topic-index + S010 的"未拍板"状态

## 相关文件(绝对路径)

- 引擎:`rewrite/src/shared/expression/{compile,evaluate,_internal,dependency,types,functions}.ts`
- 设计约束:`codestable/features/2026-05-08-expression-engine/expression-engine-design.md`(D6 + 明确不做)
- send 用法(已尝试修):`rewrite/src/features/send/core/frame-resolver.ts`、`rewrite/src/pages/SendPage.vue:215-244`
- task 用法(未修):`rewrite/src/features/task/services/task-iteration-loops.ts:132-189`、`task-step-executors.ts:19-45`
- 问题记录:`.sessions/2026-05-18-northbound-integration/S010-task-parameter-variation-and-repeat-semantics.md`(线 B 决策)、`.sessions/2026-06-10-ui-feature-bugs/H003-speed-simulation-debug.md`(线 A 排查)
- 相关 commit:`4375857`(send 侧修复,单测通运行时未通)
