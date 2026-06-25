# 设计：storage appendLocalRecords 每帧全量深拷贝性能治本（方案 A）

> date: 2026-06-25
> topic: 2026-06-10-ui-feature-bugs（S012 续接第三轮）
> status: 待实施
> 取代：无（落实 D010-B 的未竟部分——前一次 fix 只治了 merge+sort，没治全量深拷贝）

## 1. 背景与根因（已用数据证实）

### 症状
- prod 接收帧时主线程严重卡顿，单 tick 达 300-600ms；**拔串口立刻好转**。
- 新 trace（Trace-20260625T171046）：timer#4（routingTick setInterval）34 次触发，单回调均值 399ms，最长 617ms；每个 Long Task 内部 cat = `v8.execute`(100%) + `disabled-by-default-v8.inspector`(100%)，0% Layout/Paint——纯 JS 执行开销。

### 根因
`appendLocalRecords` 的 fast-path（D010-B 引入）虽省了 `mergeStorageLocalRecords` 的全量排序+merge 深拷贝，但**每帧仍对全量 N 条 records 做 3 次 O(N) `structuredClone` 深拷贝**：

1. `state.getSnapshot().records`——fast-path 开头取 `before` 备份（写盘失败回滚用）。`createSnapshot` 内对 records/historyMaterials/csvMaterials/legacyMaterials **全部**深拷贝。
2. `appendRecords` 内部返回时调 `snapshot()` → `createSnapshot()` → 又一次全量 `cloneStorageLocalRecords(records)`。
3. adapter `writeMaterial('records', id, merged)` 内 `cloneStorageValue(value)`（fake）/ `JSON.stringify`（real）——又一次全量处理。

实测（`storage-append-prod-scale.spec.ts`）单次 append 耗时随累积记录数 N **线性增长**：
| records N | 单次 append | 每次深拷贝成本 |
|---|---|---|
| 2,000 | ~18ms | ~6ms |
| 10,000 | **98.7ms** | 26ms |
| 20,000 | **202.7ms** | 52ms |
| ~60,000（prod 数小时）| ~600ms（=trace 实测）| — |

O(N) 线性，倍率与 N 成正比。prod 运行数小时累积到数万条 records 时，单 tick 600ms 命中 trace。

### 为什么"拔串口就好"
帧停止流入 → 不再调 `appendLocalRecords` → 不再每帧深拷贝全量 records → 主线程空闲。

### 为什么 D010-B（前一次 fix）没治本
那次只把 merge+sort 换成 append-only concat，省了"排序+merge 的深拷贝"，但**剩下 3 次纯隔离用深拷贝原封未动**。误以为 2000 records 的 18ms 就是终点——warmup 规模太小，没暴露真实 O(N)。这是 H011 handoff 记录的"storage 治本已证伪"结论的错误来源：治了一半不是没治。

## 2. 关键事实（设计依据）

**routingTick 每帧调 `appendLocalRecords`，但其返回的 snapshot 在 routingTick 里被直接丢弃。** 已验证：
- `receive-storage-bridge.ts:31`：`const result = await service.appendLocalRecords(records); return result.ok ? records.length : 0;`——只读 `result.ok`，不读 `result.snapshot.records`。
- routingTick 本身（`routing-tick.ts:48`）只取 `fanOutToStorage` 的返回数字，不碰 storage snapshot。

真正消费 `getSnapshot()`/`listLocalRecords()` 的是 History 页（`useHistoryData.ts`）按需查询——低频、用户触发。

所以"routingTick 路径每帧生成一个被丢弃的全量深拷贝快照"是 100% 纯浪费。

## 3. 硬约束（不可违反）

`storage-service-state-selector.spec.ts:35-38` 钉死的隔离契约：
```ts
const snapshot = service.getSnapshot();
(snapshot.records[0]).fields[0] = { key: 'temperature', value: 100 };
expect(service.getSnapshot().records[0]!.fields[0]!.value).toBe(20.5); // 内部 state 不变
```
即：**`getSnapshot()` 返回的快照必须与 internal state 深隔离**（调用方 mutate 快照不能污染 state）。这是契约，A 方案不动它。

## 4. 设计（方案 A）

核心思路：**让 routingTick 高频路径不再生成全量快照，只增量 append + 攒批写盘；隔离深拷贝只在显式 reader（`getSnapshot()`/`listLocalRecords()`）时按需发生。**

### 4.1 state 层：`appendRecords` 不再返回全量 snapshot

`storage-state.ts` 的 `appendRecords(newRecords)` 当前返回 `{ merged, snapshot }`，其中 snapshot 是全量深拷贝。改为：

- `appendRecords(newRecords)` 只做增量 concat（仅深拷贝 newRecords），返回 **轻量结果**：`{ appendedCount: number }`（或 void）+ 一个**轻量回滚句柄**。
- 回滚句柄用于"写盘失败时撤销 append"：因为 append 是 `records = [...records, ...clone(newRecords)]`，撤销只需记录 append 前的长度 `prevLength`，回滚时 `records = records.slice(0, prevLength)`。**O(newRecords.length) 而非 O(N)**。
- 新增 `rollbackAppend(prevLength: number)` 方法。

`getSnapshot()`（reader 用）深拷贝语义**不变**——仍全量 `cloneStorageLocalRecords(records)`，但只在 History 页查询时触发，不是每帧。

### 4.2 service 层：`appendLocalRecords` fast-path 不再取 before/不返回 snapshot

`storage-local-service.ts` fast-path 改为：

```ts
if (canAppendInOrderFast(state, normalized.records)) {
  const prevLength = state.getRecordCount();          // O(1) 读长度,不深拷贝
  state.appendRecords(normalized.records);            // 增量 concat,仅深拷贝新增
  const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, /* 增量 or 全量? */);
  if (!writeResult.ok) {
    state.rollbackAppend(prevLength);                 // O(new) 撤销
    return failedWithAdapter(state, writeResult.error); // 这里仍 getSnapshot(全量),但只在失败时
  }
  state.setLastIssue(undefined);
  return { ok: true, validation: normalized.validation, snapshot: state.getSnapshot() };
  // ↑ 注:成功路径仍返回 snapshot 以保持契约(测试 fanout-consumer-order / selector-immutability 依赖)。
  //   但 routingTick 丢弃它。若要进一步省,可加 append-only 变体不返回 snapshot(见 4.3)。
}
```

**关键优化点**：去掉 fast-path 开头的 `const before = state.getSnapshot().records`（深拷贝①）——回滚改用 `rollbackAppend(prevLength)`，O(new) 而非 O(N)。

### 4.3 adapter 写盘：攒批 vs 全量

写盘是第三个 O(N)。两个子选项：

- **A1（最小改动）**：writeMaterial 仍传全量 merged，但**不在每帧调**——攒批（如每 N 条或每 T ms flush 一次）。需要给 storage 加 flush 缓冲 + destroy 时 flush。
- **A2（治本写盘）**：adapter 从"全量覆盖写"改成"增量追加写"。但 fake adapter 是内存 Map（无追加概念），real adapter 是 `writeTextFile` 全量覆盖（JSON 不支持追加）。要改成 append-only 日志格式（每帧 append 一行 JSONL），读取时聚合——改动大，触及 adapter 契约 + 读取逻辑。

**本轮选 A1（攒批）**：routingTick 路径 appendLocalRecords 内部攒批，定时 flush。理由：A2 触及 adapter 契约（fake/real 都要改 + 读取聚合），爆炸半径大；A1 改动集中在 service 一层。

但攒批引入新复杂度（flush 时机、destroy 时 flush、攒批期间读到的数据不一致）。**评估后决定：先只做 4.1+4.2（去掉 2 次深拷贝：before + appendRecords 内 snapshot），写盘那次的 O(N) 用攒批解决与否看实测。** 因为：
- 4.1+4.2 去掉深拷贝①②后，fast-path 只剩深拷贝③（adapter 写盘）。
- 若 fake adapter（prod wireFeatures 用的就是 fake）的 `cloneStorageValue` 仍是 O(N)，单帧仍有 1 次 O(N)。
- 所以攒批（A1）是必要的，否则只省 2/3。

**最终方案 = 4.1 + 4.2 + 4.3-A1（攒批写盘）**。

### 4.4 fanOutToStorage 适配

`receive-storage-bridge.ts` 不变（仍调 appendLocalRecords，仍只读 result.ok）。攒批在 service 内部透明完成。

## 5. 攒批设计细节（4.3-A1）

`createStorageLocalService` 内部维护：
- `pendingRecords: StorageLocalRecord[]`——攒批缓冲。
- `flushTimer` / 攒批阈值（如 50 条或 500ms）。

`appendLocalRecords` fast-path：
1. 增量 append 到 state（O(new)，4.1）。
2. push 到 pendingRecords（O(1)）。
3. 若 pendingRecords 达阈值或距上次 flush 超 500ms → flush：`adapter.writeMaterial('records', id, state.getCanonicalRecords())`。
   - 注：flush 时仍全量写（adapter 契约），但**频率从每帧降到每 50 帧/500ms**，摊销 O(N/50)。
4. 立即返回 ok（不等 flush，flush 异步）。

风险：destroy 时必须 flush（否则丢最后一批）。`createRewriteRuntime.destroy()` 已有清理钩子，加 flush。

## 6. 不变式（测试要钉死）

1. **隔离不变**：`getSnapshot()` 返回的快照 mutate 不影响 state（既有测试 storage-service-state-selector.spec.ts:35-38 不变）。
2. **顺序不变**：时间顺序 append 后 records 仍按 capturedAt 升序（既有测试不变）。
3. **乱序回退**：乱序 append 仍走全量 merge fallback（既有测试不变）。
4. **写盘失败回滚**：adapter writeMaterial 失败时 state 恢复（既有测试 storage-service-state-selector.spec.ts:55-82，但回滚机制从 replaceRecords(before) 改为 rollbackAppend(prevLength)）。
5. **新增性能不变式**：累积 20000 records 后单次 append 耗时 **< 5ms**（旧 202ms，目标 ~constant）。这是本轮核心回归测试。
6. **攒批正确性**：destroy 后所有 pending records 都已 flush（新增测试）。

## 7. 验证计划

- TDD：先写回归测试（不变式 5：大 N 下 append < 5ms）→ RED（当前 202ms）→ GREEN（修复后）。
- 全套 storage 测试不回归（storage-service-state-selector / storage-append-perf / selector-immutability / fanout-consumer-order / routing-tick-regression）。
- prod 验证（用户做）：重启 dev server，连串口跑数小时，观察是否还卡。**这次有可证伪的量化预期**：单次 append（不含异步 flush）应从 ~200ms@20k 降到 < 5ms（O(1)）；routingTick 整体单 tick 应从 600ms 降到 < 20ms（drain+receive+display+append 增量，flush 异步不阻塞）。

## 8. 范围边界

- **改**：`storage-state.ts`（appendRecords 返回值 + rollbackAppend）、`storage-local-service.ts`（fast-path + 攒批）、`storage-append-perf.spec.ts`（阈值从 50ms 收紧）、新增 prod-scale 回归测试。
- **不改**：`getSnapshot()` 深拷贝隔离契约、adapter 契约（fake/real 不动）、receive/display 路径、routingTick 本身。
- **不做**：A2（增量日志写盘，触及 adapter 契约）、B（不可变结构共享，改动过大）、C（滚动上限，丢数据）。

## 9. 已知风险

| 风险 | 缓解 |
|---|---|
| 攒批期间 History 页读到不含 pending 的旧数据 | flush 阈值小（50条/500ms），延迟可接受；或 reader 读 state.getSnapshot()（含已 append 的，pending 只是未写盘的，state 已含）|
| destroy 时 flush 失败丢数据 | flush 失败记 lastIssue，不静默 |
| rollbackAppend 与攒批交互 | 写盘失败回滚 state，pending 中对应记录也要移除 |
