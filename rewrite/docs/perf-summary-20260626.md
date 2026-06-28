# Performance trace 摘要

> 由 `analyze-perf.py` 生成。原始 trace 24MB，已压缩为结论。

## 1. 总体

- **主线程**: pid=31248, tid=25744, name=`CrRendererMain`
- **录制跨度**: 606049.72s
- **主线程事件数**: 55642
- **Long Tasks (>50.0ms)**: 18 个

## 2. 主线程耗时按类别 (cat)

| 类别 | 耗时 | 占比 |
|---|---|---|
| `devtools.timeline` | 21.40s | 22.2% |
| `v8` | 18.79s | 19.5% |
| `disabled-by-default-devtools.timeline` | 18.63s | 19.3% |
| `v8.execute` | 18.38s | 19.0% |
| `disabled-by-default-v8.inspector` | 17.88s | 18.5% |
| `cppgc` | 974.1ms | 1.0% |
| `blink` | 170.5ms | 0.2% |
| `renderer` | 111.1ms | 0.1% |
| `input` | 110.4ms | 0.1% |
| `disabled-by-default-v8.compile` | 29.6ms | 0.0% |
| `navigation` | 606μs | 0.0% |

> 类别速查: `devtools.timeline`(渲染相关), `v8`(脚本/GC), `blink`(布局/绘制), `disabled-by-default-devtools.timeline`(细分), `bootstrap`(启动)。占比高 = 该类是瓶颈所在。

## 3. 主线程耗时按事件名 (top 15)

| 事件 | 耗时 | 占比 |
|---|---|---|
| `RunTask` | 18.62s | 19.3% |
| `v8.callFunction` | 17.93s | 18.6% |
| `RunMicrotasks` | 17.90s | 18.6% |
| `v8::Debugger::AsyncTaskRun` | 17.88s | 18.5% |
| `TimerFire` | 17.84s | 18.5% |
| `MinorGC` | 565.1ms | 0.6% |
| `V8.GCScavenger` | 560.7ms | 0.6% |
| `V8.GC_SCAVENGER` | 555.5ms | 0.6% |
| `V8.GC_SCAVENGER_SCAVENGE` | 550.6ms | 0.6% |
| `CppGC.IncrementalSweep` | 531.0ms | 0.6% |
| `V8.GC_SCAVENGER_SCAVENGE_PARALLEL_PHASE` | 472.5ms | 0.5% |
| `V8.GC_SCAVENGER_SCAVENGE_PARALLEL` | 431.6ms | 0.4% |
| `CppGC.SweepInLowPriorityTask` | 189.3ms | 0.2% |
| `V8.StackGuard` | 171.5ms | 0.2% |
| `V8.HandleInterrupts` | 171.3ms | 0.2% |

> 高耗时事件名速查: `FunctionCall`(JS函数), `TimerFire`(定时器), `EventDispatch`(事件), `Layout`(重排), `UpdateLayoutTree`(样式重算), `Paint`(绘制), `Layerize`, `Commit`(合成层提交), `ParseHTML`, `EvaluateScript`, `GC`(垃圾回收)。

## 4. Long Tasks (> 50.0ms) —— 卡顿元凶

按耗时降序,前 10 个:

| # | 开始 | 耗时 | 内部耗时最高的几件事 |
|---|---|---|---|
| 1 | 606035.33s | **1.13s** | RunTask(1.13s), TimerFire(1.13s), v8::Debugger::AsyncTaskRun(1.13s), v8.callFunction(1.13s) |
| 2 | 606048.53s | **1.12s** | RunTask(1.12s), TimerFire(1.12s), v8::Debugger::AsyncTaskRun(1.12s), v8.callFunction(1.12s) |
| 3 | 606030.86s | **1.12s** | RunTask(1.12s), TimerFire(1.12s), v8::Debugger::AsyncTaskRun(1.12s), v8.callFunction(1.12s) |
| 4 | 606037.63s | **1.11s** | RunTask(1.11s), TimerFire(1.11s), v8::Debugger::AsyncTaskRun(1.11s), v8.callFunction(1.11s) |
| 5 | 606038.83s | **1.11s** | RunTask(1.11s), TimerFire(1.11s), v8::Debugger::AsyncTaskRun(1.11s), v8.callFunction(1.11s) |
| 6 | 606032.03s | **1.07s** | RunTask(1.07s), TimerFire(1.07s), v8::Debugger::AsyncTaskRun(1.07s), v8.callFunction(1.07s) |
| 7 | 606043.12s | **1.07s** | RunTask(1.07s), TimerFire(1.07s), v8::Debugger::AsyncTaskRun(1.07s), v8.callFunction(1.07s) |
| 8 | 606046.43s | **1.07s** | RunTask(1.07s), TimerFire(1.07s), v8::Debugger::AsyncTaskRun(1.07s), v8.callFunction(1.07s) |
| 9 | 606044.22s | **1.05s** | RunTask(1.05s), TimerFire(1.05s), v8::Debugger::AsyncTaskRun(1.05s), v8.callFunction(1.05s) |
| 10 | 606033.13s | **1.04s** | RunTask(1.04s), TimerFire(1.04s), v8::Debugger::AsyncTaskRun(1.04s), v8.callFunction(1.04s) |

> 每个 Long Task 内部看 cat 分布能定位是'脚本太重'还是'渲染太重':

### Long Task 内部类别分布 (前 5 个)

**Task #1 (1.13s)**:
- `devtools.timeline`: 1.33s (118%)
- `v8`: 1.18s (104%)
- `disabled-by-default-devtools.timeline`: 1.13s (100%)
- `v8.execute`: 1.13s (100%)
- `disabled-by-default-v8.inspector`: 1.13s (100%)

**Task #2 (1.12s)**:
- `devtools.timeline`: 1.32s (118%)
- `v8`: 1.17s (104%)
- `disabled-by-default-devtools.timeline`: 1.12s (100%)
- `v8.execute`: 1.12s (100%)
- `disabled-by-default-v8.inspector`: 1.12s (100%)

**Task #3 (1.12s)**:
- `devtools.timeline`: 1.31s (117%)
- `v8`: 1.16s (104%)
- `v8.execute`: 1.12s (101%)
- `disabled-by-default-devtools.timeline`: 1.12s (100%)
- `disabled-by-default-v8.inspector`: 1.12s (100%)

**Task #4 (1.11s)**:
- `devtools.timeline`: 1.32s (119%)
- `v8`: 1.15s (104%)
- `v8.execute`: 1.12s (101%)
- `disabled-by-default-devtools.timeline`: 1.11s (100%)
- `disabled-by-default-v8.inspector`: 1.11s (100%)

**Task #5 (1.11s)**:
- `devtools.timeline`: 1.30s (117%)
- `v8`: 1.15s (104%)
- `v8.execute`: 1.11s (100%)
- `disabled-by-default-devtools.timeline`: 1.11s (100%)
- `disabled-by-default-v8.inspector`: 1.11s (100%)


## 5. 热点函数 Top 30

按累计 self+children 时间排序(实际是 dur 累加,含调用):

| 函数 | URL | 行 | 累计耗时 | 调用次数 |
|---|---|---|---|---|
| `n` | `index-B8jgIARL.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-B8jgIARL.js) | 2 | 2.9ms | 4 |
| `s` | `index-B8jgIARL.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-B8jgIARL.js) | 2 | 1.9ms | 9 |
| `n` | `StatusBadge-Ddy88SvR.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/StatusBadge-Ddy88SvR.js) | 1 | 493μs | 11 |
| `r` | `index-B8jgIARL.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/index-B8jgIARL.js) | 2 | 237μs | 5 |
| `_` | `AppShell-BIPKwFrs.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/AppShell-BIPKwFrs.js) | 1 | 203μs | 2 |
| `t` | `TouchPan-B1_5x0Hs.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/TouchPan-B1_5x0Hs.js) | 1 | 189μs | 4 |
| `u` | `TouchPan-B1_5x0Hs.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/TouchPan-B1_5x0Hs.js) | 1 | 149μs | 1 |
| `u` | `AppShell-BIPKwFrs.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/AppShell-BIPKwFrs.js) | 1 | 110μs | 1 |
| `g` | `DisplayPage-UGBDJOrp.js` (file:///C:/Users/Administrator1/AppData/Local/Programs/LCT-Commander/resources/app.asar/assets/DisplayPage-UGBDJOrp.js) | 1 | 35μs | 3 |

## 6. 高频调用栈 (热点函数 + 其父调用链)

出现次数最多的调用链(根函数 < ... < 触发点):

- `EventDispatch < v < lo < ft < n` × 24

## 7. 任务大小分布 + 过载窗口(高频小任务过载检测)

- **总任务数**: 1303
- **平均任务时长**: 14.3ms
- **最长任务**: 1.13s
- **过载窗口数**(100ms 内占用 >60%): **20**

⚠️ **检测到主线程过载**: 即使没有单个 >50ms 长任务,大量小任务(5-15ms)持续占满主线程也会造成卡顿。这正是'一秒十几帧'场景的典型特征。

任务时长分桶(数量 + 该桶总耗时):

| 桶 | 任务数 | 总耗时 | 说明 |
|---|---|---|---|
| `<2ms` | 1204 | 87.8ms | 极轻(事件派发/微任务) |
| `2-5ms` | 13 | 41.9ms | 轻 |
| `5-15ms` | 62 | 372.3ms | 中(高频回调区,积少成多) |
| `15-50ms` | 6 | 168.1ms | 较重 |
| `50-100ms` | 0 | 0μs | 重(已算 Long Task) |
| `>100ms` | 18 | 17.95s | 极重(严重卡顿) |

占用率最高的 5 个 100ms 窗口:

- 窗口1 @606035.32s: 1 个任务,占用 1134%
- 窗口2 @606048.52s: 1 个任务,占用 1122%
- 窗口3 @606037.62s: 9 个任务,占用 1119%
- 窗口4 @606030.82s: 13 个任务,占用 1118%
- 窗口5 @606038.82s: 1 个任务,占用 1108%


## 8. 定时器归类 (TimerFire 哪个定时器最凶)

高频定时器是'一秒十几帧'过载的常见元凶。即便 prod 无 source map,
按 timerId 归类也能看出'是不是同一个定时器在反复触发':

| timerId | 触发次数 | 累计 dur |
|---|---|---|
| `timer#4` | 34 | 17.83s |
| `timer#1` | 18 | 585μs |
| `timer#4182` | 1 | 31μs |
| `timer#4183` | 1 | 407μs |
| `timer#4184` | 1 | 761μs |
| `timer#4185` | 1 | 14μs |
| `timer#4186` | 1 | 6μs |
| `timer#4187` | 1 | 6μs |
| `timer#4188` | 1 | 7μs |
| `timer#4189` | 1 | 32μs |
| `timer#4190` | 1 | 463μs |
| `timer#4191` | 1 | 279μs |
| `timer#4192` | 1 | 14μs |
| `timer#4193` | 1 | 465μs |
| `timer#4194` | 1 | 203μs |

> 最高频定时器 `timer#4` 触发 **34** 次。对照项目代码里的 setInterval/setTimeout(尤其 polling 1000ms / 接收循环)确认归属。

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
