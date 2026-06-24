# [S014] 任务模板等待条件全覆盖测试数据 + 实测验证

> 2026-06-24 | 测试/验证 | 状态: 完成

## 目标

用户原话"帮我测一下任务的那些条件…任务模板的等待条件…需要一套帧定义和任务定义去测、去试它能不能用"。
本轮:① 造一套覆盖全面的 receive 测试帧定义 ② 造一套覆盖 9 operator + and/or + 3 onTimeout + 永久等待 + 中断 + sourceId + repeat.until + exitCondition 的测试任务定义 ③ 实测验证行为 ④ 发现的问题分类报告。

## 交付物

### 测试数据(可导入应用)
- `rewrite/public/test-data/wait-condition-test-frames.json` — 3 个 receive 帧(wt-status / wt-aux / wt-counter),覆盖数值(uint16 功率)/十六进制(uint32 状态字)/字符串枚举(状态串)/可空(可选遥测)/多 frameId 隔离。已用应用真实 `deserializeFrames` + `validateFrameAssetCollection` 验证 `ok:true, issues:[]`,可干净导入。
- `rewrite/public/test-data/wait-condition-test-tasks.json` — 21 个任务模板,用应用真实 `parseImportedFile` 验证可干净导入。operator 覆盖全 9 种:any/change/contains/eq/gt/gte/lt/lte/neq。

### 实测集成测试
- `rewrite/src/features/task/__tests__/wait-condition-coverage.spec.ts` — 31 个用例,跑真实执行路径(`createTaskService` → `executeWaitConditionStep` → `ConditionRegistry.processInput`),用 `createFakeReceiveEventSource.emit()` 模拟"收到一帧"。**31/31 全过**。

### 实测保真度说明
本沙箱无真实串口/回环硬件,UI 手测不可行。但等待条件全部执行逻辑是纯 JS 代码,`emit()` 驱动的是与生产**同一份代码**(`wireFeatures` 注入的 `ConditionRegistry` 同款),等价于"在应用里手动构造接收帧"。这是此环境能得到的最高保真实测。**测试数据 JSON 已通过应用真实导入路径验证**,用户可自行导入应用做真实回环手测(数据已备好)。

## 测试结果汇总(31 用例全过 = 行为符合代码语义)

### 9 种 operator — 全部行为符合 compare.ts 语义

| operator | 匹配条件 | 实测 | 用例数 |
|----------|---------|------|--------|
| eq | actual==threshold(数值或字符串) | ✓ 数值 100==100 匹配,150 不匹配 | 2 |
| neq | actual!=threshold | ✓ 50!=50 不匹配,80!=50 匹配 | 1 |
| gt | actual>threshold(严格) | ✓ 50 不匹配边界,51 匹配 | 1 |
| lt | actual<threshold(严格) | ✓ 50 不匹配边界,49 匹配 | 1 |
| gte | actual>=threshold(含边界) | ✓ 99 不匹配,100 边界匹配 | 1 |
| lte | actual<=threshold(含边界) | ✓ 101 不匹配,100 边界匹配 | 1 |
| contains | String(actual).includes(String(threshold)) | ✓ 'STANDBY' 不含 OK,'SYSTEM-OK' 含 | 1 |
| change | actual!=null 且 actual!==threshold | ✓ actual=0===threshold 不匹配,5 匹配 | 1 |
| any | actual!=null(threshold 被忽略) | ✓ null 不匹配,0 有值匹配 | 1 |

### 特殊分支
- **十六进制 0x 解析**:threshold `"0x0001"` → toNumber 解析为 1,与 actual=1 数值相等匹配 ✓。双向(actual 也可为 `"0x0001"` 字符串,threshold=1 匹配)✓。
- **null 字段**:字段 null/undefined 时,**除 any 外全部 operator 返回 false**(eq/gt 实测超时不匹配)✓。符合 matcher.ts:9 `value===null||undefined → return false`。

### 组合逻辑
- **AND**:部分满足不匹配,全满足才匹配 ✓。
- **OR**(跨 frameId):任一帧满足即匹配 ✓。
- **AND 短路**:第一项失败时整组失败(即使后续满足)✓。

### frameId 隔离
- 等 wt-status.power,发 wt-aux 同值帧(wt-power:100)**不该匹配** ✓。registry 按 frameId 建索引,wt-status 的 group 不在 wt-aux 候选集。

### onTimeout 策略 — **此处有非直觉发现(见下方 #2)**

| onTimeout | 实测终态 | 步骤推进 |
|-----------|---------|---------|
| continue | completed | 正常推进,**无 appliedPolicy 标记** ✓ |
| skip | completed | 推进,**wait result 标 appliedPolicy=skip-step** ✓ |
| fail + errorPolicy:stop | **stopped**(非 failed) | 后续 step 不执行,只 1 个 wait result ✓ |
| fail + errorPolicy:retry(用尽) | **failed** | 只记录 1 个 wait result(appliedPolicy=retry),中间重试不记 ✓ |

### 永久等待 + 中断
- **timeoutMs 省略**:不发帧一直等(50ms 后仍 running,不超时)✓;发匹配帧后通过 ✓。
- **被 stop 中断**:任务终态 **stopped**;**中断的 wait step 不记 step result**(stepResults 为空)✓ — 见下方发现 #3。

### sourceId 过滤
- 条件带 `sourceId:'source-A'`:source-B 的帧(值对但来源不对)不匹配,source-A 的帧匹配 ✓。
- 条件不带 sourceId:无 sourceId 的帧也能匹配(input.sourceId undefined 时跳过过滤)✓。
- **UI 确认无 sourceId 输入框**(ConditionTermEditor.vue),但**编辑 JSON 可配且生效**。按任务边界,UI 缺失不当 bug 报。

## 发现的问题清单(分类:代码 bug / 设计如此 / 测试数据问题)

### #1【代码 bug,已确认】fieldValueProvider 生产未接线 → repeat.until / exitCondition 失效

**根因**:`runtime/feature-wiring.ts:146-152` 的 `createTaskService({...})` **未传 `fieldValueProvider`**,而该 provider 是 `repeat.until` 和 `exitCondition` 的唯一数据源:
- `task-iteration-loops.ts:125` `checkExitCondition()`:`if (!ctx.fieldValueProvider) return false;` — 无 provider 时 exitCondition **永不触发**。
- `task-iteration-loops.ts:222`:`if (repeat?.until && ctx.fieldValueProvider)` — 无 provider 时 until **被跳过**,循环只靠 maxCount 停。

**实测确认**:
- `无 provider + repeat.until(wt-count==3)`:发满足 until 的帧 → 仍发满 maxCount=3 次才停(until 没生效)。
- `有 provider + repeat.until`:发满足帧 → 提前退出(calls < maxCount)。
- `无 provider + exitCondition(wt-count>=5)`:发满足帧 → 跑满 maxIterations=5 轮(exitCondition 没生效)。

**结论**:这是**真 bug**,非设计如此。数据模型(`StepRepeat.until` / `TaskStopCondition.exitCondition`)和 UI 都支持,求值逻辑也完整,唯独生产 wiring 漏接。wait-condition step 不受影响(走 push registry 不依赖 provider)。**已报告,不擅自修**(等用户决定是否单独开任务)。关联:S014 续接已知缺口。

### #2【行为澄清,非 bug】onTimeout=fail + errorPolicy:stop 终态是 stopped 不是 failed

**现象**:`onTimeout:'fail'` 超时后,配 `errorPolicy.onFailure:'stop'` → 任务终态 **stopped**,非直觉的 failed。

**根因**:`task-error-policy.ts:32` 的 `'stop'` 分支调 `updateLifecycle(instanceId, 'stop')` → 生命周期变 stopped。只有 `'retry'` 用尽(line 88 `updateLifecycle('fail')`)才 failed。

**结论**:这是**设计如此**(stop/pause/retry/skip-step 四种 errorAction 各有明确终态语义),不是 bug。但**对用户是反直觉的**——"fail" 这个 onTimeout 值名暗示失败,实际终态取决于 errorPolicy。建议(非强制)UI 在 onTimeout=fail 旁提示"终态由 errorPolicy 决定"。报告供参考。

### #3【行为澄清,非 bug】被中断的 wait/delay step 不记 step result

**现象**:任务 running 中 stop/pause,正在执行的 wait step 不会在 stepResults 留痕(stepResults 为空)。

**根因**:`task-iteration-loops.ts:338` `if (interrupted) return null;`,`executeSteps:282` `if (outcome === null) return false;` 跳过 `addStepResult`。

**结论**:**设计如此**(中断语义=该 step 没完成,不记结果合理)。但 UI 历史面板里看不出"中断在哪个 step",可能影响调试。报告供参考,非 bug。

### #4【疑似缺口,部分证伪】push 模型不看历史帧

**任务描述预期**:条件帧在 wait step 启动前到达会错过。

**实测细化**:
- **证伪一半**:wait step 的 group 在 `startTask` 同步入 running 时就已注册(`ensureSubscription` → `registerGroup`),所以"任务刚 start,立即发匹配帧"**能收到**(只要 group 已建)。
- **证实另一半**:帧在**无任何 task 订阅时**(group 注册前)到达 → 被丢弃(receiveEventSource 是纯 push,无缓冲),之后需重发。这是 push 模型固有特性,**设计如此**。

**结论**:registry 纯 push 是**设计如此**,不是 bug。实际影响很小(group 在 task start 时就建,只要帧在 start 后到达就不会丢)。**当 sourceId UI 缺失不当 bug**(按边界)。

### 其它:sourceId UI 缺失
按任务边界**不当 bug 报**(可能故意暂时不需要)。但已验证 JSON 可配且生效(#sourceId 测试通过)。

## 决策引用

- 无新建 D###(本轮是测试/验证 + 发现 bug 报告,无架构/接口决策)。发现 #1(fieldValueProvider 接线缺口)若用户决定修,届时单独记 D###。

## 范围确认

- 本轮在 scope boundary 内:是(造测试数据 + 实测 task 等待条件,归 ui-feature-bugs 专题)。

## 后续

- **待用户决定**:发现 #1(fieldValueProvider wiring 缺口)是否单独开任务修。这是唯一确认的真代码 bug,影响 repeat.until/exitCondition(任务级退出条件 + send step 重复退出),wait-condition step 不受影响。
- **用户可自行手测**:数据 JSON 已通过应用真实导入路径验证可导入,用户导入应用后可用串口/回环做真实硬件手测(测试数据已备好,21 任务覆盖全维度)。
- onTimeout=fail 终态反直觉(#2)是否要 UI 加提示,等用户决定。
