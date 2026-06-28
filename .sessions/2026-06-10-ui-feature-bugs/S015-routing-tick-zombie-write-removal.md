# S015 routingTick 僵尸写入路径根除 + tick 防雪崩

> 2026-06-26 | 实施 | 状态: 实施完成,待用户目标机实测
> 关联决策: D013(新建,推翻 D010 续接二轮)

## 目标

根治"连串口立刻卡成一坨,断开立刻好,必须重启"的卡顿。前序 S012 续接二轮声称治本(prod 降 5000 倍),但用户 prod 运行埋点实锤未解决。本轮重新定位真根因并根除。

## 记录

### 起点:运行埋点实锤 + 决定性新症状

用户在 prod 跑了 routingTick 四段计时埋点(前序会话加的),console 持续刷:
```
[routingTick] slow over 5s: storage×6(peak 894ms) | peakEvents=13
```

读日志关键信号:
- **storage 段占 99%**。drain/parse/display 全个位数 ms,是噪声。
- storage 单段峰值 0.9–1.6s,**随 peakEvents 线性涨**:13 事件 ~1s、27 事件 ~1.5s。
- 同症状新表述:"连串口立刻卡/断开立刻好/必须重启"——和 D010 续接二轮"拔串口立刻好"是同一句话,但续接二轮治错了地方。

### 定位根因:三层实锤

**第一层(代码)**:追 `storage` 段。state 层(storage-state.ts)已 O(新增)(mutable push/Set/clearLastIssue),无辜。元凶在 `applyRoutedAppend` 的 `writeMaterial` → fake adapter `cloneStorageValue` 全量深拷贝(整个 N 数组)= O(N)。

**第二层(用户直觉 + 消费端实锤)**:用户质疑"我没开记录才对,这有什么要记的吗?"。核查发现**两条独立写 records 路径**:
- 路径 A(DisplayPage 录制按钮):受 `isRecording` 控制,key=`${groupId}:${dataItemId}:${fieldName}`(3段),匹配 History 页解析。**合法**。
- 路径 B(routingTick→fanOutToStorage):无条件写,key=裸 `f.fieldName`(1段),History 页 `useHistoryData.ts:122` 要 4 段才画点 → **B 数据 History 永远画不出**。**僵尸写入**(无开关/格式错/无人正确消费)。

**第三层(生产 wiring 实锤)**:生产用 `createFakeLocalMaterialAdapter`(feature-wiring.ts:101,纯内存 Map),`createRealLocalMaterialAdapter` 在生产零引用,bootstrap 从不调 `loadLocalRecords`。所以 records **从不落盘**——卡顿不是磁盘 I/O,是内存 N 无限增长 + 攒批满 50 触发全量深拷贝。"连上立刻卡"=连上后数据进来攒批到 50 就深拷贝;"断开立刻好"=断开后不再追加不再触发;"必须重启"=setInterval(100ms) 无并发保护,单 tick 超 100ms 并发 tick 各自抢全量深拷贝 → 雪崩。

### 为什么 D010 续接二轮没治本且该推翻

续接二轮(2026-06-25)声称"路由路径降 5000 倍(20k:49.8ms→0.01ms)",但:
1. 那 5000 倍是测**不触发攒批的那一帧**(0.01ms)。攒批满 50 触发的全量深拷贝一个字没碰。
2. 攒批把"每帧小写"变成"每 50 条一次大写",**单次峰值更高**。
3. 续接二轮否决"records 滚动上限"的理由(以为 B 数据给 History 用)前提错——B 是僵尸写入,给僵尸加 cap 无意义。

### 治本(D013,用户拍板"彻底清理+优化路径A")

**核心删除**:
- `routing-tick.ts`:删 fanOutToStorage 调用 + storageMs 计时段(RoutingTickTimings 去 storageMs 字段)。
- `runtime/bridges/receive-storage-bridge.ts`:整文件删除。
- `runtime/index.ts`:destroy 删 `flushPendingWrites` 调用;**startTickDriver 加 in-flight guard**(`tickInFlight` flag,上一 tick 未完成则跳过本次 setInterval 触发)止血并发雪崩。

**死代码清理(storage 层)**:
- `storage-local-service.ts`:删 `appendRoutedRecords`/`flushPendingWrites`(接口+实现);`applyRoutedAppend` 简化为 `appendAndPersist`(去 batchWrites 参数+攒批逻辑,恒立即写盘)。
- **保留** `appendLocalRecords`(路径A)+ D010 内存优化(mutable push/Set/clearLastIssue/truncate/canAppendInOrderFast)归入 appendAndPersist。

**逐项核验死代码边界**(回应用户"应该没删掉有用的东西吧"):fanOutToStorage/appendRoutedRecords/flushPendingWrites/攒批逻辑在删调用后全部无生产调用者(只有测试和自己互相调用);appendLocalRecords 被 DisplayPage:459 调用必须保留;applyRoutedAppend 被 appendLocalRecords 调用保留(简化)。

**测试处置**(派 Explore agent 逐文件确认):
- 删 `storage-append-no-growth.spec.ts`(测已删方法)。
- `routing-tick-perf.spec.ts`:storage 段 bench 退役 + "开久了卡" bench 删除,保留 drain/receive/display 分段诊断。
- `fanout-consumer-order.spec.ts`:去 5 个 storage 测试,callOrder 去 'fanout-storage'。
- `routing-tick-regression.spec.ts`:删 BF-1 块(BF-1 fix 随功能退役),保留 BF-3。
- `routing-tick-error-isolation.spec.ts`:删 2 个 storage failure 测试,弱化 display failure 测试。
- `helpers.ts`/`history-fieldname-resolution.spec.ts`:mock 清理 appendRoutedRecords/flushPendingWrites。
- `routing-tick.spec.ts`:去 storageMs 断言。
- **新增 2 回归**:`routing-tick.spec.ts` "routingTick 不写 storage(D013)"+ `bootstrap-integration.spec.ts` "tick 不并发(in-flight guard, 慢 drain mock 50ms + 5ms interval 验峰值≤1)"。

## 决策引用

- **D013**:新建。routingTick 僵尸写入路径根除,推翻 D010 续接二轮的攒批治本 + 否决滚动上限的错误前提。
- D010:标记 partially-superseded(续接二轮部分推翻,内存优化保留给路径A)。

## 范围确认

- 本轮在 scope boundary 内:是(性能 bug 根因修复,延续 S012 系列卡顿治理)。

## 验证(诚实标注)

| 验证项 | 结果 |
|---|---|
| 受影响 8 文件 | ✅ 39/39 过(含 2 新回归) |
| 全量测试 | ✅ 11 failed / 1868 passed |
| stash 基线比对 | ✅ baseline 11 = 我的 11(0 新增失败;passed 差 9 是删的死代码测试) |
| tsc src/ | ✅ 0 类型错误(node_modules 的 @vitejs/plugin-vue 报错是工具自身已知问题) |
| lint 我的文件 | ✅ 0 错误(修了 displayCount 未使用遗留) |
| 11 failed 归属 | 全 pre-existing:event-truncation 1 + tcp-receive-datapath 4 + heartbeat-timer 5 + frame-service-state-selector 1(后两个与 storage/routing 零关系) |
| **运行时实测** | ⚠️ **未做,需用户在目标机**:连串口跑,看 `[routingTick] slow` 的 storage 段是否消失(应只剩 drain/parse/display)。我不宣称"跑通"。 |

## 后续

- **待用户目标机实测**:这是本轮治本的最终判据。前序 S012/续接二轮都栽在"代码+Node 基准过、prod 仍卡"(H011 教训)。本轮证据更强(运行埋点实锤 + 用户症状 + 三方代码确认),但仍需 prod 实测坐实。
- 若 prod 实测 storage 段消失但仍有卡顿:看 drain/parse/display 三段谁慢(埋点保留,去掉 storage 段后自动只剩三段)。
- 路径 A(appendLocalRecords)低频(用户点记录才每秒一条),暂不需要滚动上限;若以后 records 真持久化(接 real adapter)或录制时长很长导致 N 涨,再考虑。
