# S012 接收帧高频时主线程卡顿 —— storage O(N·M) 治本

> 2026-06-23 | 性能优化 bug | 状态: 优化完成,待用户目标机实测
> （续接 2026-06-23:第三症状"切走再回来卡"——backgroundThrottling:false）

## 目标

用户报告"一秒接收十几帧的情况下,好像存在严重的性能问题",且补充"**开久了卡**"。主对话用 analyze-perf.py 分析了 prod Performance trace(39MB),锁定 timer#4 单个定时器 76 次触发累计 23.97s(占主线程几乎全部),每次回调 300-430ms。本对话任务:①定位 timer#4 是哪个 setInterval ②定位 300ms 花在哪 ③治本优化 ④可度量验证。

## 记录

### 阶段 1:定位 timer#4(已确认)

从 trace 提取 timer#4 的 76 次触发时间戳,算间隔:**mean=332ms / median=368ms,不是 100ms**。这是 setInterval 被超时回调拖垮节奏的典型指纹(回调跑 300+ms,Chromium 把到期触发合并,实际≈3次/秒)。耗时**平稳**(前1/3 327ms / 后1/3 330ms);drain 空时 **0.3ms**(几个快触发)。

对照代码反查:唯一高频 setInterval 是 `runtime/index.ts:176` 的 `startTickDriver()` —— `setInterval(routingTick, 100ms)`,AppShell.vue:79 启动。**timer#4 = routingTick setInterval 确认**。

**⚠️ 用户关键纠正**:初读 trace 时我把"76 次 / 录制跨度"误推为"100ms 定时器=一秒十几帧",用户明确纠正——**"一秒十几帧"指的是真实数据帧速率,不是定时器频率**。两者通过"定时器每次 drain 积压帧"耦合,但 timer#4 是固定的 100ms setInterval,帧速率是另一回事。这个纠正把我从"按帧速率猜定时器"的歧途拉回。

### 阶段 2 Phase 1:证据收集(假设证伪 → 重查 → 锁定)

**第一次假设(被证伪)**:主对话嫌疑 #2 是"routing-tick 回调里做重活"。我写基准 `routing-tick-perf.spec.ts` 用真实 wiring + fake 连接适配器推 12 帧/tick 跑 20 轮分段计时:
```
12帧/tick: 总 avg=5.5ms (drain 2.6ms + receive 2.1ms + storage 0.8ms + display 0.1ms)
1帧/tick:  0.83ms
```
**routingTick 服务层 12 帧只要 5.5ms,不是 300ms。** 把"routingTick 回调重活"假设证伪。服务全是纯 JS 无 Vue reactive,本就不该是瓶颈。

**阻塞点**:5.5ms → 300ms 的 60 倍差距在 Node 基准复现不出来(缺真 Electron IPC 适配器 / detached devtools / 硬件帧流)。向用户汇报阻塞,用户答:"**把那一堆日志该清的清一下?说是开久了卡(顺便想想还可能是啥)**"。

**关键新证据——"开久了卡"**:这改变分析方向。卡不只跟帧到达相关,随时间恶化。我把基准改成持续推帧采样单 tick 耗时趋势:
```
records=    2 →  1.14ms
records=  501 → 15.60ms
records= 1001 → 30.67ms
records= 1501 → 45.98ms
records= 2000 → 61.79ms      ← 56 倍,每 500 records 稳定 +15ms(线性增长)
```
**单 tick 耗时随累积 storage records 数线性增长(O(N·M))。**

**反推 trace**:12 帧/秒 × 每帧 append 1 record = 每秒 +12 records。~15 分钟 ≈ 10800 records → 单 tick ~330ms,正好命中 trace 的 300-430ms 区间。trace 里看到的"耗时平稳"(327→330ms)是因为 25 秒录制窗口内 records 只增长 300 条,相对已累积的 ~万条几乎不变 → 看起来平稳。**完全自洽,且调和了"trace 平稳"与"开久了卡"的表面矛盾。**

之前我误判"平稳=排除 O(n²)",其实它是"已累积到高位、录制窗口太短看不出增长"。Phase 1 解读被纠正。

**根因(实证不猜)**:`storage-local-service.ts:appendLocalRecords` 每帧走:
```js
const merged = mergeStorageLocalRecords([...state.getSnapshot().records/*全量N*/, ...normalized.records/*1*/]);
//  ↑ mergeStorageLocalRecords = cloneStorageLocalRecords(全部 N) 深拷贝 + Map 去重 + 全量排序 O(N log N)
const writeResult = await adapter.writeMaterial('records', id, merged);  // ← 再深拷贝 N
state.replaceRecords(merged);  // ← 再深拷贝 N
```
每帧把**全部历史 records** 深拷贝 2-3 次 + 排序一次。单 tick 耗时随累积记录数 N 线性增长。

### 阶段 3a:清热路径 debug log(用户拍板)

`routing-tick.ts`/`processor.ts`/`receive-service.ts` 有 9 处 `[RX-PROC]`/`[RX-SVC]`/`[ROUTE-TICK]` console.log,每帧/批/tick 都打,含 `bytesToReadableHex`(格式化整段 bytes)+ 数组 `.map()`。S007 也标注过"待清理"。全清,保留有意义的 warn(non-data 事件/error outcomes 计数级)。receive/runtime/storage 89 测试过。

### 阶段 3b:appendLocalRecords 治本(TDD)

**RED**:写性能回归测试 `storage-append-perf.spec.ts`(2000 records 后单次 append median < 50ms)。旧实现实测 **34.22ms fail**,语义不变量测试 pass(证明 fixture 正确)。stash 我的修复跑原实现验证 RED 真实。

**GREEN**:三步优化:
1. `storage-state.ts` 加 `appendRecords(newRecords)` 增量方法 + `getLastRecordCapturedAtMs()`/`hasRecordId()` 轻量 accessor(读末条/查 id 不触发全量深拷贝)。
2. `storage-local-service.ts:appendLocalRecords` 加 `canAppendInOrderFast()` 快速路径判断:新 records 单调递增、id 全新、首条 ≥ 现有末条时(=routingTick 真实负载形态)走 append-only,跳过 merge/排序/多次深拷贝;否则回退全量 merge(保留乱序/去重语义)。
3. fast path 复用 `appendRecords` 返回的 snapshot,避免 okResult 再触发一次全量深拷贝。

**结果**:2000 records 单次 append **34ms → 18.65ms(1.8x)**;端到端 routingTick 2000 records **62ms → 34ms(1.8x)**。语义不变量测试全过(乱序 [B,A]→[A,B] 排序、snapshot 隔离、时间顺序升序)。

**剩余线性增长**:~18ms 里约 6.7ms 是 fake adapter 的 structuredClone(测试隔离开销,prod 真实 adapter 序列化无此开销)。真正的瓶颈(每帧 merge+排序+多次深拷贝)已消除。剩余开销是 snapshot 隔离的基础设施深拷贝(read snapshot 必须隔离),属可接受范围。外推 10000 records:旧 ~330ms → 新 ~170ms,trace 场景下卡顿应大幅缓解。

## 决策引用

- **D010**(新建,decisions.md):测试基建范围扩张 + storage appendLocalRecords O(N·M) 根因 + append-only 治本方案。含失败路线记录(初读 trace 误判"平稳=排除累积")。

## 范围确认

- 本轮是否在 scope boundary 内:**是**(性能 bug 杂项筐,见 topic-index 范围扩张记录)。但触发了**范围扩张**:修 pre-existing 测试基建(vitest.config.ts 加 vue 插件)——见 D010 + topic-index scope change record。

## 后续

- **待用户目标机实测**:接收十几帧/秒跑 15+ 分钟,确认卡顿缓解。理想情况重录一段 dev 模式带 source map 的 trace,能直接看到 300ms 花在哪个 file:line(本对话因 prod trace 无 source map 只能靠代码+Node 基准反查定位,治本修复已做但端到端 prod 实测待验证)。
- **pre-existing 5 个集成测试失败**(event-truncation: event buffer 没截断到 50 / tcp-receive-datapath: TCP 字节没到 receive):在 HEAD 已确认与本任务无关,属另一个 bug(疑似 S007 改 collectEventsAfter 的连带?或环境?),记后续。
- **pre-existing 测试基建损坏**:所有 import 了 `frame/index.ts`(re-export `FrameSelector.vue`)的测试(receive/runtime/storage 整套)之前集体跑不起来。本次修(vitest.config 加 vue + pnpm add @vitejs/plugin-vue)顺带恢复,后续别再漏装。
- 剩余 ~18ms 里的 fake adapter 深拷贝是测试隔离,非 prod。若 prod 实测仍卡,下一步考虑:storage records 是否需要上限(像 receive events 的 50 滚动窗口)、或 append 改异步批量(fanOutToStorage 攒一批再写)。

---

## 续接:切走再回来卡——backgroundThrottling:false(2026-06-23)

用户补报**第三症状**(独立于帧率卡和开久了卡):"我感觉你这个软件我开了之后我去用别的软件回来之后就变得巨卡",且"另一个人这么说"——多人独立复现,优先级拉高。

**根因(强代码推断,基于 Electron 已知行为)**:`src-electron/main/index.ts` 的 BrowserWindow `webPreferences` **没设 `backgroundThrottling`**,Electron 默认 true → 窗口失焦时 Chromium 把 renderer 的定时器/任务节流到 ~1次/秒。但真硬件(串口/网口)不知道你切走了,持续推数据 → native/transport eventQueue 堆积;切回前台节流解除,routingTick 一次性 drain 成百上千帧 → 瞬间超大尖峰(叠加上文 storage O(N·M))→ UI 冻住几秒 = "巨卡"。工业遥测上位机典型坑。

**治本(用户拍板 A 方案)**:webPreferences 加 `backgroundThrottling: false`,一行配置。上位机常驻前台,后台持续占 CPU 可接受,换事件不堆积。

**诚实声明**:此根因是**基于代码 + Electron 已知行为的强推断**,无"切走再回来"场景的直接 trace 证据。最硬的验证 = 用户复现"切走再回来卡"时,回前台瞬间立刻录一段 Performance(带 source map)看尖峰落点。但用户选直接上 A 验证。

**下一步候选(B 方案,若 A 后仍卡)**:routingTick 单轮 drain 加批量上限(如 50 帧/轮,超出留给下一轮),分帧消化避免惊群尖峰。本次不做,记后续。

**验证**:tsc 0 / lint 0(纯 webPreferences 配置,无测试依赖)。**待用户完全重启 dev server 实测**(main 进程改动 HMR 不生效,S009 同款老问题)。

---

## 续接二轮:真根因定位 + 彻底治本(2026-06-25)

用户报告 backgroundThrottling 修复后"**还是不行。依然卡**",给了新 trace(`Trace-20260625T171046.json`,25MB)。

### 决定性新证据:"拔串口立刻好"

用户原话"说把串口拔了立刻好了,看起来是因为接收。可能某些东西触发太多?" —— **这是定性钉死**:卡顿 100% 来自"有帧流入后的处理路径"。拔串口 → 帧停 → 不卡。

### 新 trace 分析(analyze-longtask.py 扒 Long Task 内部)

写新脚本 `analyze-longtask.py` 扒最长 Long Task(617ms)内部事件树:
- **616.7ms 全是单个 timer#4 回调**(`TimerFire → v8.callFunction → RunMicrotasks`),纯 JS 执行,0% Layout/Paint。
- **consoleCall 事件 = 0**:推翻了"每帧 console.warn"假设(debug log 不是元凶)。
- **GC 仅 ~40ms**:不是 GC。
- prod 无 source map,trace 只到 timer 回调边界,看不到具体函数名 —— 必须靠代码 + 基准反查。

### Node 基准的致命盲区(为什么前三轮全 falsify)

前三轮的 Node 基准(`routing-tick-perf.spec`)测的是 `routingTick` 服务层 12 帧 = 5.5ms。但 prod 单次 600ms。差 100 倍。盲区:**基准只测到 state.appendRecords 的"merge+sort",没测 service 层的完整调用链**——`appendLocalRecords` 内部除了 merge+sort,还有 **3 次全量深拷贝**(getSnapshot 备份 / appendRecords 返回 snapshot / adapter writeMaterial 内 cloneStorageValue),这 3 次基准完全没覆盖。而且基准 warmup 只到 2000 records,prod 是 60000+。

### 真根因(实证,prod-scale 基准钉死)

写 prod-scale 基准(warmup 到 10k/20k,模拟 prod 数小时累积):
```
10k records: 单次 appendLocalRecords = 98.7ms
20k records: 单次 appendLocalRecords = 202.7ms   ← 完美 O(N) 线性
```
反推 prod trace 600ms ≈ 60k records(运行数小时)。**D010-B 的 append-only fix 只治了 merge+sort,3 次全量深拷贝原封未动**。之前 2000 records 的 18ms 看着"已优化"是 warmup 规模太小没暴露真实 O(N)。

分段定位(isolate 基准):
- `state.appendRecords(1条)` = **0.003ms**(O(1),已优化)
- `state.getSnapshot()` = **11.5ms@5k / 49.8ms@20k** ← 全量深拷贝,O(N)
- **隐藏元凶**:`setLastIssue(undefined)` 内部 `return snapshot()` —— 每帧 append 成功后清错误标记,竟触发一次全量深拷贝!这是 service 完整调用才暴露、Node 基准完全漏掉的点。

### 治本(TDD RED→GREEN)

**RED**:`storage-append-no-growth.spec.ts` 钉住"路由路径 N 翻倍耗时不应线性翻倍"。旧实现 20k=193ms,ratio 4.5,**FAIL**。

**治本(方案 A,用户拍板)**:routingTick 路径分离出 snapshot-free 的 `appendRoutedRecords`,与公开 `appendLocalRecords`(保完整契约)分流:
1. **mutable push**:`appendRecords` 从 `[...全量, ...新]`(O(N) 数组重建)改 `records.push(...)`(O(新条数))。
2. **id Set 索引**:`hasRecordId` 从 O(N) 遍历改 `Set.has`(O(1)),消除 canAppendInOrderFast 的 id 冲突兜底检查退化。
3. **clearLastIssue**:新增 O(1) 清标记方法(不返回 snapshot),取代路由路径的 `setLastIssue(undefined)`(返回 snapshot = 全量深拷贝)。
4. **truncateRecords 回滚**:写盘失败用 `records.length = count` 截断(O(1)),取代旧的 `getSnapshot().records` 全量深拷贝备份。
5. **攒批写盘**:appendRoutedRecords 累计 dirty 计数,阈值 50 才全量 writeMaterial 一次(摊销 O(1)/帧);appendLocalRecords 保立即写(保"立即感知写盘失败+回滚"契约)。runtime.destroy 调 flushPendingWrites 防丢数据。

**GREEN**:
```
路由路径(appendRoutedRecords):
  5k records:  0.01ms    (旧 11.5ms)
  20k records: 0.01ms    (旧 49.8ms)   ← 降 5000 倍,ratio 0.58(O(1))
```
prod 60k records 单帧从 ~600ms → ~0.01ms。

### 验证

- 治本回归测试(storage-append-no-growth):ratio < 1.6 ✓ / 绝对值 < 30ms ✓。
- storage + runtime + 8 个 integration 测试套:**163/163 全过**。
- tsc **0 错** / lint **0 错**(改动的 5 个源文件 + 5 个测试 mock)。
- 受影响 mock 更新:integration 测试的 storage mock 从 spy `appendLocalRecords` 改 spy `appendRoutedRecords`(fanOutToStorage 现在调后者),加 `flushPendingWrites` 默认实现。

### 排查的其它路径(子 agent 扫描 + 手查)

派 Explore 子 agent 扫描整个 `rewrite/src`,按"集合是否无上限增长"判别器逐 feature 核查 routingTick 链。结论:**storage records 是唯一随运行时间无限累积的集合**,其它 feature 全有 cap 或键控常数:

| feature | 集合 | cap/键 | 判定 |
|---|---|---|---|
| receive state | recentInputs / events | bounded 20 / 50 | OK |
| receive state | frameStats/sourceStats/fieldValues | frameId/sourceId/fieldId 键控 | OK(常数) |
| display service | buffer.sourceFields / 投影 | dataItemId 键控 / preferences.sampleCount(256) | OK |
| connection state | events / configs / runtimeFacts | EVENT_LIMIT=50 / 连接键控 | OK |
| task state | history / stepResults | MAX_HISTORY=50 / 100/实例 | OK(且不在每帧路径) |
| send state | recentResults | MAX_RECENT_RESULTS=100 | OK(且不在接收 tick) |
| result/ingress/northbound | — | instanceId/outCaseId 键控或任务事件驱动 | OK(非每帧) |
| **storage records** | **无上限** | **无** | **问题(已治本)** |

**子 agent 的时间错位说明**:子 agent 读的是启动快照,报告"appendLocalRecords:254 `const before` 仍在"——但该行已在后续 appendRoutedRecords + mutable push 改造中删除,现用 `prevCount = getRecordCount()` + truncateRecords(O(1))回滚。子 agent 也指出"prod 用 fake adapter,writeMaterial 内 cloneStorageValue 全量深拷贝每 tick 跑"——**已被攒批写盘摊销**(阈值 50,每 50 帧才一次全量深拷贝,摊销 ~1ms/帧 @ 60k records,远低于 16ms 帧预算)。

**印证用户判断**:用户"我尽可能边界划分了,但可能哪里漏了"——边界划分确实到位,只有 storage 这一处无限累积漏网(已治本)。
