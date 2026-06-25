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

---

## 续接:三处修复落地 (2026-06-24)

> 2026-06-24 续接 | 修复 | 状态: 完成

### 目标

用户反馈 S014 报告的 4 个问题:"1可以修"(fieldValueProvider)、"2感觉是不是弄成符合直觉比较好"(onTimeout 终态)、"似乎目前没有已停止的计数"(KPI stopped)、"你是不是没给我能用的发送帧?只有接收帧呢?这我咋测"(数据缺 send 帧)。用户拍板"全部一起修(一个 commit)"。

### 修复(见 D012)

1. **fieldValueProvider 接线(真 bug)**:`feature-wiring.ts:146` 加 `fieldValueProvider: () => bridge.getLatestFieldValues()`;`receive-event-source-bridge.ts` 加 `getLatestFieldValues()`(emit 时按 fieldId 扁平 merge)。
2. **onTimeout=fail 终态 failed**:`task-error-policy.ts:32` 'stop' 分支 `updateLifecycle('stop')`→`updateLifecycle('fail',{error})`。手动 stopTask 不变(仍 stopped)。
3. **KPI 加「已停止」计数**:`ExecutionKpiBar.vue` 历史区加 stopped 项。
4. **数据修正**:frames.json 补 2 个 send 镜像帧(wt-status-cmd/wt-counter-cmd,字节布局与 receive 帧一致供 echo 回环);tasks.json 修 repeat.until/exitCondition 的 send step 引用(原误引 receive 帧 wt-status → 改 wt-counter-cmd)+ 去掉 known-gap 标记;新增 `wait-condition-test-README.md` echo server 手测指南(应用无内置回环入口,需本地 TCP echo server)。

### 验证

- task 全套 **317/317** + 受影响集成(task-error-strategies/command-ingress-task-ack-chain/connection-lifecycle-boundaries)**19/19** 全过。
- 新增 6 回归用例(bridge.getLatestFieldValues 3 + repeat.until/exitCondition 接线生效 2 + 手动 stopTask 仍 stopped 1),wait-condition-coverage **37/37**。
- 终态断言更新 10 处(errorPolicy stop 触发的错误失败 stopped→failed),全是错误失败用例,手动 stop 用例不变。
- JSON 经应用真实导入路径验证:5 帧(2 send+3 receive) ok:issues:0;21 模板可解析;所有 send step 引用 send 帧。
- lint 0 / tsc(我的文件)0 错。
- **pre-existing 5 失败**(tcp-receive-datapath 4 + event-truncation 1)经 baseline 比对(stash 我的改动跑同 spec)确认与本修复无关——baseline 同样失败。

### 关键发现:并发提交

本轮发现 HEAD 已被并行会话推进 8 个 commit(northbound docking/command-ingress 批次历史),我的 S014 commit `1a7dcf2` 仍在历史中(position 10)。本轮修复作为未提交 working tree 变更叠在新 HEAD 上。无冲突(并行会话改 northbound/command-ingress,我改 task error-policy/bridge/KPI,无文件重叠)。

### 决策引用

- D012(新建):三处修复 —— fieldValueProvider 接线 + onTimeout=fail 终态 failed + KPI stopped 计数。

### 范围确认

- 本轮在 scope boundary 内:是(S014 测试发现的 bug 修复,归本专题)。

### 后续

- 用户可导入数据 + 起 echo server 做真实硬件回环手测(README 已备)。
- fieldValueProvider pull 路径的 fieldId 全局唯一约束(跨帧重名覆盖)记在 D012 + bridge 注释,后续若多帧 fieldId 重名场景需注意。

---

## 未决发现:发送帧需发两次接收侧才更新 (2026-06-25,待新对话排查)

> 2026-06-25 | 用户实测反馈 | 状态: 未确认,转新对话

### 症状(用户原话)

"我试着发那个状态帧,每次都是得发送两次,接收那边才变?很奇怪。感觉哪里有问题。"

即:用 `wt-status-cmd`(send 镜像帧)经 echo 回环发,接收侧 `wt-status` 的字段值**第一次发送不更新,第二次发送才更新**。确定性可复现("每次都是")。

### 排查起点(给新对话,未验证,按可能性排序)

1. **receive 帧识别/缓冲 off-by-one(最可能符合"必须两次")**:routing-tick.ts drain → receiveService.drainInputSource 的帧匹配,若第一次 echo 的字节因粘包/残留/缓冲未对齐到 sync 边界,第一次 drain 只拿到不完整帧被丢/挂起,第二次发的字节补齐才识别成功。重点看 receive 帧匹配器的 sync 对齐 + 缓冲保留逻辑。
2. **我的测试数据问题(需先排除,我造的数据)**:`wt-status-cmd`(send) 与 `wt-status`(receive) 字节布局声称对齐,但 ① identifierRules 都只查 sync 字节 0x1ACFFC1D,两者都匹配同一字节流(send 不进 receive 池所以不冲突,但要确认) ② autoChecksum sum32 的 startFieldIndex/endFieldIndex(0..4)是否覆盖正确字段 ③ 字段长度/字节序是否有细微差导致第一次帧校验失败第二次"撞上"。**新对话第一步应核对我的 frames.json 两帧字段布局是否真字节对齐**。
3. **routingTick 轮询模型**:routingTick 是 setInterval(300-430ms/次)轮询 drain,发一次后字节要等下次 tick。但这只解释"延迟",不解释"必须两次",优先级低。
4. **echo server 分块回显**:若 echo server 逐块而非整帧回显,第一次发可能只拿到半帧。取决于用户用的 echo server 实现。

### 注意

- 症状是确定性的("每次都是"),不是偶发 → 大概率不是性能/时序竞态,是逻辑/数据问题。
- 若排查确认是 #2(我的测试数据字节不对齐),修 frames.json 即可,非代码 bug。
- 若是 #1,是 receive 管线真 bug,可能影响所有 receive 帧(不只测试数据),优先级高。
- 关联文件:routing-tick.ts / receiveService.drainInputSource / receive 帧匹配器 / public/test-data/wait-condition-test-frames.json

---

## 未决 bug 深查: 发两次接收表格才更新 (2026-06-25,取证阶段,未修复)

> 2026-06-25 | systematic-debugging Phase 1 取证 | 状态: 根因未最终确认,待续

### 症状(用户两次确认,确定性可复现)

第一次反馈:"发那个状态帧,每次都是得发送两次,接收那边才变。"
第二次反馈(关键澄清):"我手动发了两次 [等待条件测试] 状态遥测帧-发送镜像(回环用),我弄了两个实例,功率分别是 25 和 100,**我只有连续点两次发送,表格里的值才会变**。而且我确认**两次是一个**(同一实例),且接收那边**计数+2**。"
第三次确认:"我确确实实发出了两个一样的帧,而第二次接收到表格内容才变。"

**确定的事实**:
- 发送的是 `wt-status-cmd`(send 镜像帧),echo 回环
- 同一个发送实例点两次(功率 25 或 100 不变)
- 接收侧**计数+2**(两次发送都被接收管线计数)
- 但**表格/等待条件只在第二次发送后才更新**
- 即:第一次发送的字节"到了"(计数+1)但字段值没进表格;第二次发送才进

### 已排除的假设

- ❌ **测试数据字节不对齐**:诊断测试(临时,已删)直接对 `matchReceiveFrame` 喂手工构造的 20 字节(sync+5字段),**完整匹配 wt-status,issues:[]**。字节布局正确,非数据问题。
- ❌ **帧识别丢帧**:帧被识别了(否则计数不会 +2,且 matchReceiveFrame 对完整字节返回 matched)。

### 关键证据(根因线索,指向 receive 帧匹配不校验完整性)

诊断测试发现 `matchReceiveFrame`(receive/core/frame-matcher.ts)**只校验 identifierRules(sync 字节),不校验帧总长度**:
- 完整 20 字节(sync+5字段)→ matched ✓
- **只有 sync 前 4 字节(不完整帧)→ 也 matched!**(isRuleMatched 只看 startIndex/endIndex 的 sync,slice(0,4)够了就过)
- 前导垃圾字节+帧 → unmatched(sync 不在 offset 0)

→ 结论:**任何"前 4 字节是 sync"的 batch 都被判为 wt-status matched**,不管后面字段齐不齐。

配合 field-parser.ts:185-194:字段 endOffset > bytes.length 时该字段**被 truncated 跳过**(不进 fields 输出)。routing-tick.ts:56-58 `fieldValues[fieldId]=value` 只对解码出的字段设值 → truncated 字段不在 fieldValues 里 → 表格无新值/条件不满足。

### 当前最可能假设(待验证)

第一次发送的字节被 TCP/echo **分片**,第一次 routingTick 拿到的 batch 只有 sync(4字节)或 sync+部分字段 → matchReceiveFrame 误判 matched(因不校验长度)→ field-parser 把数据字段全 truncated → fieldValues 缺 wt-power 等 → 表格不更新/条件不满足。第二次发送补齐(或完整到达)→ 字段齐全 → 表格更新。

**但未验证的关键点**:
1. 用户的 echo 是否真的分片?(localhost TCP 通常整包,但 socket.pipe(socket) + Node data 事件可能分片)
2. "计数+2"到底是 matchedCount+2 还是别的计数器(rxBytes/表格行数)?若是 matchedCount+2 则两次都 matched(符合"不完整也 matched");若是别的计数器则假设不同。
3. 是否 SendPage 发送侧有问题(如第一次 send 字节没真正写出,只有第二次写出)?——用户说"确确实实发出了两个一样的帧",倾向排除发送侧,但需确认"计数+2"是 receive 侧计数。

### 待续(下一上下文)

1. **首要**:确认"计数+2"是 receive 的 matchedCount(看 receive-state.ts 统计)还是 connection 的 rxBytes/事件数。这决定假设方向。
2. 写诊断测试**复现真实 echo 回环**(参考 tcp-send-receive-loopback.spec.ts 的 sendAndWaitForEcho),连发两次同帧,打印每次 routingTick 的 outcome.kind + fields + matchedCount delta。看第一次到底是 matched+truncated 还是别的。
3. 若确认是"不完整 batch 误判 matched",根因在 matchReceiveFrame 不校验帧长度 → 修法:matched 前校验 bytes.length >= 帧字段总长(field-parser 已有 truncated 检测,可在 matcher 层加长度门槛,或让 truncated 字段不触发 matched)。
4. 若 batch 是完整的(20字节全到)但仍不更新表格 → 转向 display fanOut / Vue 响应性 / SendPage 发送侧排查。

### 关联文件
- receive/core/frame-matcher.ts(matchReceiveFrame,不校验长度)— 嫌疑#1
- receive/core/field-parser.ts:185-194(truncated 字段跳过)
- receive/core/processor.ts(processReceiveBatch,无跨 batch 缓冲)
- runtime/routing-tick.ts:50-69(构造 matchInputs,只取 matched outcome 的 fields)
- runtime/bridges/connection-to-receive.ts(每 data event 一个 batch)
- public/test-data/wait-condition-test-frames.json(wt-status-cmd/wt-status,字节布局已验证正确)
- 参考工作样本:src/__tests__/integration/tcp-send-receive-loopback.spec.ts(sendAndWaitForEcho 模式)
