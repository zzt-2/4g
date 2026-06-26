# Performance trace 摘要

> 由 `analyze-perf.py` 生成。原始 trace 39MB(11.9万行)，已压缩为结论。

## 1. 总体

- **主线程**: pid=1412, tid=23404, name=`CrRendererMain`
- **录制跨度**: 343561.01s
- **主线程事件数**: 47527
- **Long Tasks (>50.0ms)**: 67 个

## 2. 主线程耗时按类别 (cat)

| 类别 | 耗时 | 占比 |
|---|---|---|
| `devtools.timeline` | 27.72s | 21.8% |
| `v8` | 24.94s | 19.6% |
| `disabled-by-default-devtools.timeline` | 24.88s | 19.6% |
| `v8.execute` | 24.50s | 19.3% |
| `disabled-by-default-v8.inspector` | 24.09s | 18.9% |
| `cppgc` | 740.2ms | 0.6% |
| `renderer` | 122.0ms | 0.1% |
| `input` | 120.4ms | 0.1% |
| `blink` | 109.2ms | 0.1% |
| `disabled-by-default-v8.compile` | 14.6ms | 0.0% |
| `loading` | 41μs | 0.0% |

> 类别速查: `devtools.timeline`(渲染相关), `v8`(脚本/GC), `blink`(布局/绘制), `disabled-by-default-devtools.timeline`(细分), `bootstrap`(启动)。占比高 = 该类是瓶颈所在。

## 3. 主线程耗时按事件名 (top 15)

| 事件 | 耗时 | 占比 |
|---|---|---|
| `RunTask` | 24.77s | 19.5% |
| `v8.callFunction` | 24.10s | 18.9% |
| `RunMicrotasks` | 24.04s | 18.9% |
| `v8::Debugger::AsyncTaskRun` | 24.03s | 18.9% |
| `TimerFire` | 24.01s | 18.9% |
| `MinorGC` | 625.0ms | 0.5% |
| `V8.GCScavenger` | 618.6ms | 0.5% |
| `V8.GC_SCAVENGER` | 613.3ms | 0.5% |
| `V8.GC_SCAVENGER_SCAVENGE` | 607.1ms | 0.5% |
| `V8.GC_SCAVENGER_SCAVENGE_PARALLEL_PHASE` | 527.3ms | 0.4% |
| `V8.GC_SCAVENGER_SCAVENGE_PARALLEL` | 493.5ms | 0.4% |
| `CppGC.IncrementalSweep` | 444.1ms | 0.3% |
| `CppGC.SweepInTask` | 210.4ms | 0.2% |
| `V8.StackGuard` | 176.5ms | 0.1% |
| `V8.HandleInterrupts` | 176.3ms | 0.1% |

> 高耗时事件名速查: `FunctionCall`(JS函数), `TimerFire`(定时器), `EventDispatch`(事件), `Layout`(重排), `UpdateLayoutTree`(样式重算), `Paint`(绘制), `Layerize`, `Commit`(合成层提交), `ParseHTML`, `EvaluateScript`, `GC`(垃圾回收)。

## 4. Long Tasks (> 50.0ms) —— 卡顿元凶

按耗时降序,前 10 个:

| # | 开始 | 耗时 | 内部耗时最高的几件事 |
|---|---|---|---|
| 1 | 343546.94s | **431.7ms** | RunTask(431.7ms), TimerFire(431.7ms), v8::Debugger::AsyncTaskRun(431.6ms), v8.callFunction(431.6ms) |
| 2 | 343542.01s | **426.1ms** | RunTask(426.1ms), TimerFire(426.1ms), v8::Debugger::AsyncTaskRun(426.1ms), v8.callFunction(426.1ms) |
| 3 | 343538.31s | **400.5ms** | RunTask(400.5ms), TimerFire(400.4ms), v8::Debugger::AsyncTaskRun(400.4ms), v8.callFunction(400.4ms) |
| 4 | 343541.61s | **400.1ms** | RunTask(400.1ms), TimerFire(399.3ms), v8::Debugger::AsyncTaskRun(399.3ms), v8.callFunction(399.3ms) |
| 5 | 343538.71s | **391.5ms** | RunTask(391.5ms), TimerFire(391.5ms), v8::Debugger::AsyncTaskRun(391.4ms), v8.callFunction(391.4ms) |
| 6 | 343539.87s | **389.2ms** | RunTask(389.2ms), TimerFire(389.1ms), v8::Debugger::AsyncTaskRun(389.1ms), v8.callFunction(389.1ms) |
| 7 | 343551.70s | **387.7ms** | RunTask(387.7ms), TimerFire(387.6ms), v8::Debugger::AsyncTaskRun(387.6ms), v8.callFunction(387.6ms) |
| 8 | 343552.09s | **387.3ms** | RunTask(387.3ms), TimerFire(387.2ms), v8::Debugger::AsyncTaskRun(387.2ms), v8.callFunction(387.2ms) |
| 9 | 343536.79s | **384.1ms** | RunTask(384.1ms), TimerFire(384.1ms), v8::Debugger::AsyncTaskRun(384.1ms), v8.callFunction(384.1ms) |
| 10 | 343537.92s | **383.9ms** | RunTask(383.9ms), TimerFire(383.9ms), v8::Debugger::AsyncTaskRun(383.9ms), v8.callFunction(383.9ms) |

> 每个 Long Task 内部看 cat 分布能定位是'脚本太重'还是'渲染太重':

### Long Task 内部类别分布 (前 5 个)

**Task #1 (431.7ms)**:
- `devtools.timeline`: 496.9ms (115%)
- `v8`: 445.5ms (103%)
- `disabled-by-default-v8.inspector`: 433.0ms (100%)
- `v8.execute`: 431.7ms (100%)
- `disabled-by-default-devtools.timeline`: 431.7ms (100%)

**Task #2 (426.1ms)**:
- `devtools.timeline`: 470.6ms (110%)
- `v8`: 435.4ms (102%)
- `disabled-by-default-v8.inspector`: 428.1ms (100%)
- `disabled-by-default-devtools.timeline`: 426.1ms (100%)
- `v8.execute`: 426.0ms (100%)

**Task #3 (400.5ms)**:
- `devtools.timeline`: 485.9ms (121%)
- `v8`: 419.7ms (105%)
- `v8.execute`: 412.5ms (103%)
- `disabled-by-default-v8.inspector`: 400.8ms (100%)
- `disabled-by-default-devtools.timeline`: 400.5ms (100%)

**Task #4 (400.1ms)**:
- `devtools.timeline`: 466.7ms (117%)
- `v8`: 415.6ms (104%)
- `v8.execute`: 410.1ms (103%)
- `disabled-by-default-devtools.timeline`: 400.1ms (100%)
- `disabled-by-default-v8.inspector`: 399.7ms (100%)

**Task #5 (391.5ms)**:
- `devtools.timeline`: 429.9ms (110%)
- `v8`: 399.5ms (102%)
- `disabled-by-default-v8.inspector`: 393.3ms (100%)
- `disabled-by-default-devtools.timeline`: 391.5ms (100%)
- `v8.execute`: 391.4ms (100%)


## 5. 热点函数 Top 30

按累计 self+children 时间排序(实际是 dur 累加,含调用):

| 函数 | URL | 行 | 累计耗时 | 调用次数 |
|---|---|---|---|---|
| `n` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 8.1ms | 54 |
| `d` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 2.1ms | 36 |
| `s` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 1.1ms | 6 |
| `G` | `QTooltip-CD6yUTwD.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/QTooltip-CD6yUTwD.js) | 1 | 854μs | 11 |
| `k` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 678μs | 1 |
| `F` | `QTooltip-CD6yUTwD.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/QTooltip-CD6yUTwD.js) | 1 | 530μs | 11 |
| `start` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 369μs | 2 |
| `_u` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 260μs | 12 |
| `dn` | `_plugin-vue_export-helper-DpeNfPt3.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/_plugin-vue_export-helper-DpeNfPt3.js) | 2 | 260μs | 5 |
| `a` | `touch-BuP0YvFa.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/touch-BuP0YvFa.js) | 1 | 126μs | 1 |
| `l` | `touch-BuP0YvFa.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/touch-BuP0YvFa.js) | 1 | 45μs | 3 |
| `r` | `index-CiRxPPNe.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-CiRxPPNe.js) | 2 | 30μs | 1 |

## 6. 高频调用栈 (热点函数 + 其父调用链)

出现次数最多的调用链(根函数 < ... < 触发点):

- `EventDispatch < v < lo < ft < n` × 24
- `EventDispatch < Ke < onClick < lo < ft < vf` × 24
- `EventDispatch < D < Js < c <  < ` × 18
- `EventDispatch < D < Di < V < ot < onClick` × 12
- `EventDispatch < onClick < lo < ft < n` × 6
- `EventDispatch < _ < k` × 6
- `EventDispatch < Z < C < S < lo < ft` × 6

## 7. 任务大小分布 + 过载窗口(高频小任务过载检测)

- **总任务数**: 2157
- **平均任务时长**: 11.5ms
- **最长任务**: 431.7ms
- **过载窗口数**(100ms 内占用 >60%): **67**

⚠️ **检测到主线程过载**: 即使没有单个 >50ms 长任务,大量小任务(5-15ms)持续占满主线程也会造成卡顿。这正是'一秒十几帧'场景的典型特征。

任务时长分桶(数量 + 该桶总耗时):

| 桶 | 任务数 | 总耗时 | 说明 |
|---|---|---|---|
| `<2ms` | 1954 | 111.1ms | 极轻(事件派发/微任务) |
| `2-5ms` | 88 | 276.7ms | 轻 |
| `5-15ms` | 47 | 287.9ms | 中(高频回调区,积少成多) |
| `15-50ms` | 1 | 17.2ms | 较重 |
| `50-100ms` | 1 | 99.9ms | 重(已算 Long Task) |
| `>100ms` | 66 | 23.98s | 极重(严重卡顿) |

占用率最高的 5 个 100ms 窗口:

- 窗口1 @343546.91s: 9 个任务,占用 433%
- 窗口2 @343542.01s: 27 个任务,占用 431%
- 窗口3 @343538.21s: 26 个任务,占用 405%
- 窗口4 @343543.91s: 51 个任务,占用 402%
- 窗口5 @343541.61s: 24 个任务,占用 401%


## 8. 定时器归类 (TimerFire 哪个定时器最凶)

高频定时器是'一秒十几帧'过载的常见元凶。即便 prod 无 source map,
按 timerId 归类也能看出'是不是同一个定时器在反复触发':

| timerId | 触发次数 | 累计 dur |
|---|---|---|
| `timer#4` | 76 | 23.97s |
| `timer#1` | 25 | 814μs |
| `timer#2273` | 1 | 44μs |
| `timer#2274` | 1 | 3.4ms |
| `timer#2279` | 1 | 904μs |
| `timer#2278` | 1 | 19μs |
| `timer#2281` | 1 | 17μs |
| `timer#2282` | 1 | 2.2ms |
| `timer#2284` | 1 | 468μs |
| `timer#2283` | 1 | 132μs |
| `timer#2285` | 1 | 50μs |
| `timer#2286` | 1 | 63μs |
| `timer#2289` | 1 | 39μs |
| `timer#2290` | 1 | 17μs |
| `timer#2287` | 1 | 473μs |

> 最高频定时器 `timer#4` 触发 **76** 次。对照项目代码里的 setInterval/setTimeout(尤其 polling 1000ms / 接收循环)确认归属。

## 9. 匹配到项目源码的可疑函数 (rewrite/src 内)

无热点函数的 URL 落在 rewrite/src 内。可能原因:
- 瓶颈在第三方库/框架代码(node_modules / quasar / vue 内部),非项目代码
- trace 没带 source map 信息(dev 模式带,prod 不带)
- 瓶颈是渲染层(Layout/Paint/Composite)而非 JS 函数,看 §2/§3 的类别占比

结合 §2 类别占比 + §3 事件名 + §4 Long Task 定位是哪一类瓶颈。

## 10. 建议排查顺序

1. **先看 §4 Long Task + §7 过载窗口**: 卡顿元凶。
   - 单个 >50ms 长任务 → 看其内部 cat(§4),定脚本/渲染/GC 哪类
   - 无长任务但 §7 过载窗口多 → **高频小任务过载**(典型'一秒十几帧'),看 §8 定时器 + §5 热点
2. **看 §8 定时器**: 最高频 timerId 对照代码 setInterval/setTimeout(尤其 polling/接收循环)
3. **看 §9 项目源码命中**: 命中函数是首要优化目标。prod trace 无命中时按 §2/§3 类别反推
4. **看 §3 事件名**: TimerFire/FunctionCall 高 → 定时器/函数高频; Layout/Paint 高 → 渲染
5. **看 §6 调用栈**(如有): 高频调用链根函数是优化入口
