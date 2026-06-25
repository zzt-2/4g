# H011 接收帧卡顿性能优化——交接(三个症状,三次修复均未解决,根因待新 trace 锁定)

> 2026-06-23 | 关联:S012(含续接) / D010(A/B/C 三条均已实施且均被证伪) / topic 2026-06-10-ui-feature-bugs
> 用户原话:"还是不行。依然卡。我打算给你新的文件让你看看。此外,目前上下文爆了,你先写个交接文档,我压缩之后再让你看"

⚠️ **本交接的核心信息:已经做过的三个修复都治标未治本,卡顿依然存在。新对话不要重复这三个方向,等用户给新 trace/文件,重新从证据出发。**

## 用户报告的三个症状(均未解决)

1. **"一秒接收十几帧的情况下,好像存在严重的性能问题"** — 原始报告。
2. **"开久了卡"** — 随时间恶化。
3. **"开软件→用别的软件→回来巨卡"** — 后台/失焦触发,用户+同事多人独立复现。

修复后用户明确反馈三个都"**依然卡**"。

## 已经做过的修复(全部 commit,均未解决问题)

| 症状假设 | 修复 | commit | 实证依据 | 现状 |
|---|---|---|---|---|
| storage appendLocalRecords O(N·M)(每帧全量深拷贝+排序) | append-only 快速路径 `canAppendInOrderFast` + 轻量 accessor | `2ec0ca5` | Node 基准:2000 records 单 tick 62ms→34ms(1.8x) | **真瓶颈待证,prod 仍卡** |
| 热路径 9 处 debug log([RX-PROC]/[RX-SVC]/[ROUTE-TICK] 每帧打+hex 格式化) | 全清,保留有意义的 warn | `2ec0ca5` | console.log 高频确实重(基准 10万次 742ms vs 不打 23ms) | 小改进,非主因 |
| webPreferences 默认 backgroundThrottling:true 节流失焦 routingTick→堆积→惊群 | `backgroundThrottling: false` 一行 | `c882a04` | **纯代码推断,无直接 trace 证据** | **被证伪,prod 仍卡** |

**顺带修了一个 pre-existing 测试基建**:`vitest.config.ts` 加 `@vitejs/plugin-vue`(commit `2ec0ca5`)。修前所有 import 了 `frame/index.ts`(re-export `FrameSelector.vue`)的测试(receive/runtime/storage 整套)**集体跑不起来**。修后 89 测试恢复。这个修复本身是好的,保留。

## 接收方验证(续接对话时必须完成)

- [ ] 已读取 topic-index 的不变量段落(2026-06-10-ui-feature-bugs/topic-index.md)
- [ ] 已验证本文件中的至少 3 条关键事实声称:
  - 声称1:timer#4 = `runtime/index.ts:176` 的 `setInterval(routingTick, 100ms)` → 验证:trace 时间戳分析间隔 mean=332ms(被超时回调拖垮的 100ms setInterval),drain 空时 0.3ms。**PASS**(代码 + trace 双证)
  - 声称2:routingTick 服务层 12 帧仅 5.5ms(非 300ms) → 验证:`routing-tick-perf.spec.ts` 实测 drain 2.6ms+receive 2.1ms+storage 0.8ms+display 0.1ms。**PASS**
  - 声称3:三个修复都未解决卡顿 → 验证:用户明确反馈"还是不行。依然卡"。**PASS(用户原话)**
- [ ] 已检查 _registry.yaml 中本专题的 depends_on 和 conflicts_with(无)
- [ ] 已确认当前范围未违反"明确不含"(性能优化在 bug 杂项筐范围内)

## ⚠️ 关键:为什么三个修复都没用(失败数据附录)

### 失败的根本原因:定位证据全部来自"代码 + Node 基准",缺少 prod 运行时直接证据

**核心失败机制**:我在 Node + fake adapter 环境里测 routingTick,得到了"服务层只 5.5ms""storage O(N·M)"等结论,但这些**复现不出 prod 的 300ms**。Node 基准缺三样东西:
1. **真 Electron 连接适配器**(real-serial/network-adapter 经 IPC 从主进程 drain,我的 fake 是内存 splice)
2. **detached DevTools 的开销**(S009 让 devtools 默认开)
3. **真实硬件帧流 + Vue 渲染层**

300ms 和 5.5ms 之间这 60 倍差距,从没在 Node 复现出来过。我把它归因到 storage O(N·M)(有数据支撑,是真的一个瓶颈)和 backgroundThrottling(纯推断),但**这两个修了之后还卡**,说明真正的主因还没找到——可能是:
- **Vue 渲染层**(DisplayPage 表格/统计卡片/图表 每帧 reactive 重算重渲染)——我从来没在带 DOM 的环境里测过
- **真 IPC drain 的开销**(高频小消息过 IPC 的序列化/反序列化)
- **Detached DevTools 本身**(开着 devtools 录 trace 时,devtools 自己的开销会显著放大主线程负担——prod 用户也可能开着 devtools?)
- **别的 setInterval**(我只确认了 timer#4 是 routingTick,但 trace 里还有 timer#1 25次等,没深查)

### 已排除方向(新对话别再走)

- ❌ routingTick 服务层回调做重活(Node 基准 5.5ms,服务层纯 JS 无 Vue reactive)
- ❌ "一秒十几帧 = 100ms 定时器频率"(用户明确纠正:帧速率≠定时器频率)
- ❌ backgroundThrottling 导致惊群(关了还卡)
- ❌ storage appendLocalRecords 是唯一主因(修了 O(N·M) 还卡——它是一个真瓶颈但可能不是卡顿的主因,或不是唯一主因)

### 可复用部分

- `routing-tick-perf.spec.ts` + `storage-append-perf.spec.ts`:Node 基准框架,可继续用来跑对照实验
- vitest 加了 vue 插件,receive/runtime/storage 测试现在能跑了(之前 broken)
- timer#4 的 trace 时间戳分析代码(在对话历史里,Python 脚本)可复用

## 用户即将给的新文件

用户说"我打算给你新的文件让你看看"——**很可能是新的 Performance trace(可能带 source map 的 dev 录制,或 prod 重录)**。新对话收到后:
1. **优先用 source map 版本**(能直接定位 file:line)。
2. 如果还是 prod 无 source map,先重跑 `analyze-perf.py`(`python analyze-perf.py <trace.json> --out perf-summary.md`,项目根),看 Long Task / 热点函数 / 定时器归类有没有变化。
3. **重点查之前没查的方向**:Vue 渲染层(Layout/Paint/Composite 类别占比,perf-summary §2/§3)、热点函数里有没有落到 rewrite/src 的(§9)、高频调用栈(§6)。
4. 如果新 trace 显示 bottleneck 在渲染层,要搭组件测试环境(happy-dom/jsdom + @vue/test-utils,当前项目**没有**这套基础设施,需要先装)。

## 接口变更

```yaml
contracts:
  - id: C001
    type: interface-addition
    description: "storage-state 加 appendRecords/getLastRecordCapturedAtMs/hasRecordId 三个新方法(治本 O(N·M))"
    location: "rewrite/src/features/storage-local-baseline/state/storage-state.ts"
    change: "新增方法,既有 replaceRecords/getSnapshot 签名未改。appendRecords 返回 {merged, snapshot}。"
    consumed_by: "storage-local-service.ts appendLocalRecords fast path"
    verification_result: "PASS(语义不变量测试全过,storage 89 测试过)"
    verified_by: "storage-append-perf.spec.ts + storage-service-state-selector.spec.ts"
  - id: C002
    type: config-change
    description: "BrowserWindow webPreferences 加 backgroundThrottling: false"
    location: "rewrite/src-electron/main/index.ts"
    change: "新增一行配置"
    consumed_by: "Electron main 进程窗口创建"
    verification_result: "代码层 PASS(tsc 0/lint 0);运行时未验证(用户反馈仍卡)"
    verified_by: "无运行时验证"
```

## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| 性能卡顿根因未真锁定 | 用户要求"治本不堆屎山" | 三次修复均未解决,根因待新 trace | 新对话用新 trace(优先 source map 版)重新定位 |
| pre-existing 5 个集成测试失败 | 测试应全绿 | event-truncation + tcp-receive-datapath 在 HEAD 就失败,与本任务无关 | 另开任务查(疑似 S007 改 collectEventsAfter 连带) |
| 没有 Vue 组件测试基建 | 性能优化需能测渲染层 | 项目测试全是纯逻辑,无 happy-dom/jsdom/@vue-test-utils | 若新 trace 指向渲染层,必须先搭 |

## 验证阈值

| 验证项 | PASS 标准 | 阈值来源 | 历史通过率 |
|--------|----------|---------|-----------|
| storage append 单次耗时 | 2000 records 后 median < 50ms | 60fps 帧预算 16ms 放宽(含 fake adapter 深拷贝开销) | Node 基准通过(18.65ms),但 prod 仍卡 |
| tsc | 0 error | 项目一贯标准 | 通过 |
| lint | 0 新增 error | 项目一贯标准 | 通过 |
| **prod 运行时卡顿缓解** | **用户主观"不卡了"** | **用户验收(唯一真标准)** | **FAIL——三个修复后仍卡** |

## 给接收方的硬性建议(别重蹈覆辙)

1. **先收新文件,别从代码开始猜**。我这次最大的教训就是从代码 + Node 基准推 prod 行为,推偏了。
2. **如果新 trace 有 source map,第一件事是看 Long Task 内部热点函数落在哪个 file:line**——这是 prod 无 source map trace 给不了的。
3. **区分"Node 测得出的瓶颈"和"prod 才有的瓶颈"**。storage O(N·M) 在 Node 是真的(62ms),但 prod 卡顿的 300ms 可能主要在 Node 测不到的渲染层/IPC。
4. **考虑用户是否开着 DevTools**。detached devtools(S009 默认开)本身会让主线程变重。如果新 trace 是开着 devtools 录的,要先排除 devtools 自身开销。
5. **Vue 渲染层是最可能没查到的方向**:DisplayPage 表格(每帧 push 行)、统计卡片、图表,这些在 routingTick 触发 snapshot 变化后会 reactive 重算重渲染。我从没在带 DOM 的环境验证过。
6. **诚实优先**:如果新 trace 还是定位不准,告诉用户需要搭组件测试环境才能精确测渲染层,别再靠代码推断。

## 相关文件 / commit 索引

- 原始 trace:`rewrite/docs/Trace-20260623T093434.json`(39MB,prod 无 source map,**别读进上下文**)+ `rewrite/docs/perf-summary.md`(摘要,可直接读)
- 分析脚本:`analyze-perf.py`(项目根)
- 我的基准:`rewrite/src/runtime/__tests__/routing-tick-perf.spec.ts` + `rewrite/src/features/storage-local-baseline/__tests__/storage-append-perf.spec.ts`
- 治本修复代码:`storage-local-service.ts`(canAppendInOrderFast)/ `storage-state.ts`(appendRecords 等)/ `routing-tick.ts`(清 log)/ `src-electron/main/index.ts`(backgroundThrottling)
- commit:`2ec0ca5`(storage 治本 + log + 测试基建)+ `c882a04`(backgroundThrottling)
- session:`S012-receive-perf-storage-append.md`(含续接段)/ 决策 `D010`(decisions.md,A/B/C 三条)/ voice.md(用户原话,2026-06-23 两段)
- **未 push**,未碰 `_archive-legacy/`
