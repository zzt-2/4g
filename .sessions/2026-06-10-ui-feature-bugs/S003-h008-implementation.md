# [S003] H008 实施 —— task step 级参数变化机制落地

> 2026-06-18 | 实施阶段 | 状态: 实施完成,待独立审查
> 来源: 执行 H008 v2 交接文档(字段级可变参数 + 表达式连续累积,合一实施)
> 2026-06-18 续接: 独立审查 pass-with-known-gaps,补清 console.info + accumulation 端到端集成测试

## 目标

执行 H008 v2:落地 task step 级参数变化机制。两个问题合一实施(共用 FieldValueResolver 骨架):问题二字段级可变参数 + 问题一表达式连续累积 + 顺手修两个 bug(progress 爆表 / maxIterations 覆盖)。

## 记录

### 报到 + 接收方验证(Trigger 5)

按 session-governance Trigger 5 验证 H008 的 4 条关键事实声称,全部 PASS:
1. fieldVariations 挂 TaskDefinition(任务级) — types.ts:113
2. resolveFieldValues 按 iteration 取值,repeat 传同一 iteration — task-iteration-loops.ts:140/170
3. UI 在 AdvancedConfigPanel,fieldId 自由文本无下拉 — AdvancedConfigPanel.vue:178-185
4. S-FPGA-004 expressionConfig 含自引用累加公式 `速度+速度步进` — frames-v2.json:1532-1555

额外发现 2 条 H008 未显式声明的关键缺口:
- **task 链路完全无 writeback**(SendPage 有,task-step-executors 没有)—— accumulation 要补的核心机制
- **command-ingress 也用 fieldVariations**(buildReadFileAndSendTask)—— 迁移时必须同步处理

### 6 个设计待决点敲定 + accumulation 路径用户拍板

5 点按 H008 倾向直接定(resolver 挂 SendStepConfig.fieldResolvers / formula 复用帧侧 / counter 穿透签名 / 联动 flag / 字段级混用校验)。第 5 点 iteration-counter 协同发现关键语义区分:`repeat.maxCount` 是 per-iteration 次数,`counter` 是跨 iteration 全局序号。

**accumulation 路径**用 AskUserQuestion 让用户拍板(带 preview 对比)。用户选推荐路径:**复用帧侧 self-ref + task 补 writeback**(偏离 H008 v2 原设计"task 层自建递推",但语义一致工程更优)。accumulation resolver 无 formula 字段,递推完全由帧侧 isSelfReferencing + Phase2/4 完成,task 只补 writeback 闭环。

### 实施

**类型层**:FieldValueResolver 联合类型(variation | accumulation) + SendStepConfig.fieldResolvers + 删 FieldVariation/TaskDefinition.fieldVariations + resolveStopCondition 删 fieldVariations 分支(修 maxIterations 覆盖 bug) + validation 加 duplicateResolverFieldId 校验。

**执行链路**:resolveFieldValues 重构(step 级 + counter + clamp + lastValues) + StepExecutionContext(step 级临时,跨 iteration 持久,step 边界重置) + writebackAccumulation + executeRepeatableSend(iterSent per-iteration + counter 全局累积 + writeback) + executeSteps stepContexts map + runTask + executeSendStep/buildSendRequest 签名 + error-policy retry 适配。

**关键 bug 修复**:repeat limit 逻辑。首版错把"无 repeat 无 resolver"和"有 repeat 无 maxCount"搞混(limit=maxCount ?? 1),导致 repeat with infinite maxCount 只发 1 次。修正:有 repeat 用 maxCount ?? Infinity,无 repeat 有 fieldResolvers 用 1。

**progress 爆表 bug**:stepsCompleted/countCompletedIterations 按 stepIndex 去重(repeat 多次 result 只算一次,取最差状态)。

**UI**:SendStepEditor 加"字段可变参数/累积"面板(字段下拉 listFieldReferences + variation/accumulation 切换 + 联动 flag) + AdvancedConfigPanel 删 fieldVariations + 两 editor composable 删 + 两 page 删绑定。

**command-ingress**:buildReadFileAndSendTask fieldVariations → step.config.fieldResolvers。

### 验证

- task + command-ingress **386 tests 全过**(含原有 + 新增 8 类覆盖 + 3 个 USER CASE)。
- USER CASE 覆盖用户拍板的核心场景:
  - variation maxCount=5 + iter=3 → counter 1-15 全局递增(15 值刚好发完)
  - variation maxCount=20(>15) → 前 15 取值,后 5 clamp 到第 15 个
  - accumulation a-b-a step 边界重置 → a2 从 initial 重新累积 [0,1,2,3,4],不接 a1
- tsc --noEmit 源码 **0 类型错误**(过滤 node_modules)。
- lint **0 新增 error**(本任务文件;3 个预先 error 在 display/storage-highspeed 非本任务)。
- build 未跑通:electron 打包阶段 EBUSY 文件锁(旧 app.asar 被 Windows 系统锁),发生在编译前,**环境问题非代码**。
- 预先存在的 6 个测试失败(heartbeat-timer 5 个 timer spy + connection-core 1 个 fixture 字段数)与本任务无关。

## 决策引用

- D001(外部,已 active):task 参数变化机制——两个需求都要,分开决策、合一实施。
- D002(新建):H008 实施形状落地 —— resolver 挂 SendStepConfig + accumulation 复用帧侧 self-ref + 6 个设计待决点最终方案 + accumulation 路径偏离记录。
- D6(外部,expression-engine-design.md:71):**不修订**(accumulation 不碰引擎)。

## 范围确认

- 本轮是否在 scope boundary 内:**是**。H008 v2 是本专题已拍板的合一实施任务。
- 未违反"明确不含":未碰 northbound/甲方对接、未给表达式引擎加赋值算子、未把 lastValues 塞进 TaskInstanceState、未合并 variation 和 accumulation 机制。

## 后续

1. **独立审查**:建议用 requesting-code-review skill 做独立审查(尤其 accumulation writeback 闭环 + counter 跨 iteration 语义)。
2. **build 环境锁解除后跑完整 build**:验证 .vue script 编译(vue-tsc 1.8.27 有 bug 跑不了,tsc 不检查 .vue)。
3. **运行时验证**:速度模拟帧 S-FPGA-004 在 task 下实际连续累积(需真实硬件或 mock 完整 send 链路)。
4. **沉淀 codestable**(实施稳定后):accumulation 公式归帧、task 只搬运 + writeback 这个职责切分,值得记到 codestable compound/decision。

## 续接(2026-06-18):独立审查 + 补清 known gaps

主对话派独立审查子 agent(压缩上下文后派发)。审查结论 **pass-with-known-gaps**(无 revise-required 问题):架构零违规、核心语义全部正确且有 USER CASE 测试覆盖、两个 bug 修复到位。详见审查报告(主对话留存)。

按用户要求(选 4:全做)补清两个 known gap:

### 1. 补清 4 处 [task-debug] console.info

审查指出 task-step-executors(每次发送都打,timer+repeat 高频噪声)/ use-task-editor / use-template-editor 遗留了排查 H008 期间的调试日志。本轮触达这些文件,顺手清理(代码精简审查):
- `task-step-executors.ts` buildSendRequest 内 console.info(删)
- `task-step-executors.ts` executeSendStep 内 console.info(删)
- `use-task-editor.ts` buildDefinition 内 console.info(删)
- `use-template-editor.ts` buildDefinition 内 console.info(删)

清理后 grep `\[task-debug\]` 在 task feature 下 0 残留。

### 2. 补 accumulation 端到端集成测试(填 known gap)

新增 `task/__tests__/task-accumulation-e2e.spec.ts`(2 tests)。与 task-service-state-selector 的 accumulation 测试不同,**不 mock resolvedFieldValues**——send service 内部调用真实 `frame-resolver.resolveFieldValues`,让帧侧 self-referencing 表达式(isSelfReferencing + Phase2 seed + Phase4 evaluate)真正算出递推结果,验证完整闭环:

- 测试1:accumulation field 跨 3 次发送持续累积(speed 0→1→2 注入,帧侧 0+1=1/1+1=2/2+1=3,writeback 喂回)
- 测试2:a-b-a step 边界重置(用真实帧侧递推验证 a2 从 initial 重新累积,不接 a1 的结果)

这填补了审查 agent 指出的 known gap("帧侧递推 + task writeback 从未在一条测试里联合验证")。现在 `speed = speed + step` 在真实 frame-resolver + task writeback 链路里跑通。

### 续接验证

- task + command-ingress + send **546 tests 全过**(含新增 2 个 e2e,send 原 158 个未受影响)。
- lint **0 新增 error**(本任务文件,3 个预先 error 仍在 display/storage-highspeed)。
- console.info 清理未破坏任何测试。
