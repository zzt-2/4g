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
