# [S001] Agent12 — H002 TCP 接线实际状态事实报告

> 2026-05-19 | 调查 | 状态: 完成

## 目标

验证 H002 handoff 描述的 TCP 环路接线改动是否已落地，评估 composite adapter 完整度、bootstrap 路由正确性、fanOutToStorage 调用链和实际 TCP 环路证据。

## 记录

### 1. Composite Adapter 实现完整度

**文件**: `rewrite/src/features/connection/adapters/composite-adapter.ts`（全文 101 行）

**已完成的方法**：

| 方法 | 实现状态 | 说明 |
|------|---------|------|
| `connect` | 完整 | 按 `config.kind` 路由到 serial / network adapter，无匹配返回 `invalid-config` 错误 |
| `disconnect` | 完整 | 两个 adapter 都有则并行 disconnect，返回第一个 ok 的结果 |
| `write` | 完整 | 先试 serial，失败则试 network，都无则返回 `write-failed` |
| `cleanup` | 完整 | 并行清理两个 adapter，聚合 events，任一失败则整体失败 |
| `drainEvents` | 完整 | 依次从两个 adapter 拉事件并合并 |

**已覆盖的边界情况**：

1. `resolveAdapter` 对未知 kind 返回 null → `connect` 返回 `invalid-config`（行 31-37）
2. 两个 adapter 都不存在时 `disconnect` 走 fallback（行 54），但可能 null dereference——见下方问题
3. 两个 adapter 都不存在时 `write` 返回 `write-failed`（行 70-74）
4. `cleanup` 和 `drainEvents` 对 `undefined` adapter 使用 `??` 防护（行 79-80, 91, 95）

**未覆盖 / 潜在问题**：

1. **`disconnect` 的 null dereference 风险**（行 54）：
   - `return (serialAdapter ?? networkAdapter)!.disconnect(connectionId);`
   - 当 `serialAdapter` 和 `networkAdapter` 都是 `undefined` 时，表达式为 `undefined!.disconnect(...)`，运行时抛 TypeError。
   - `CreateCompositeAdapterOptions` 两个属性都是 optional（行 12-15），调用方可以传 `{}`。
   - **严重度**: 中。实际 bootstrap 始终至少有一个 adapter（见下方分析），所以生产路径不会触发。但如果有人单独测试 `createCompositeAdapter({})` 则会暴露。

2. **`write` 方法用"试错"而非"路由"策略**（行 58-64）：
   - 先试 serial adapter 的 write，如果 ok 就返回；不 ok 则试 network。
   - 这意味着：如果 serial adapter 存在但不拥有该 connectionId，它会返回一个错误结果，然后 fallback 到 network adapter。
   - 与 `connect` 方法用 `config.kind` 明确路由的做法不一致。`connect` 知道目标 kind，但 `write` 只收到 `TransportWriteRequest`（只有 `connectionId` + `bytes`），没有 kind 信息。
   - **是否是 bug**: 取决于 adapter 实现对"不属于我的 connectionId"的 write 请求是否返回错误而非静默。`real-serial-adapter.ts` 未读取（不在任务范围），但 `real-network-adapter.ts` 用 `configStore.get(request.connectionId)` 查找（行 117），找不到时行为待确认。

3. **无单元测试文件**: 搜索 `*composite*test*` 和 `**/__tests__/*composite*` 均无结果。composite adapter 没有独立测试。

### 2. Bootstrap 路由正确性

**文件**: `rewrite/src/app/rewriteRuntime.ts`（全文 116 行）

**接线链路**：

```
bootstrapRewriteRuntime()
  → transportFacade 存在时创建 serialAdapter (行 39-41)
  → transportFacade 存在时创建 networkAdapter (行 43-44)
  → createCompositeAdapter({ serialAdapter, networkAdapter }) (行 45)
  → createRewriteRuntime({ connectionAdapter }, lazyPersistence) (行 49)
  → createRewriteRuntime 内部 wireFeatures({ connectionAdapter }) (runtime/index.ts 行 114)
  → wireFeatures 用 adapter 创建 connectionService (feature-wiring.ts 行 86-88)
```

**关键事实**：

1. `serialAdapter` 和 `networkAdapter` 共用同一个 `transportFacade`（行 40, 43）。这是正确的——两个 adapter 内部通过不同 IPC channel 与 main 通信。
2. `transportFacade` 为 null 时（非 Electron 环境），两个 adapter 都是 `undefined`，composite adapter 变为空壳。此时 `disconnect` 的 null dereference 不会触发，因为 `createRewriteRuntime` 在 `connectionAdapter` 为 undefined 时用 `createNoOpConnectionAdapter()`（runtime/index.ts 行 113）——但实际 bootstrap 始终传入 composite adapter（行 49），即使内部是空的。
3. **待确认**: 空 composite adapter（serial=undefined, network=undefined）的 `disconnect` null dereference 是否会在 `destroy()` 路径触发。`destroy()` 调用 `connectionService.cleanup()`（runtime/index.ts 行 194），走 adapter 的 `cleanup` 方法——`cleanup` 有 `??` 防护，没问题。但用户手动 disconnect 一个从未连接的 ID，会走 `disconnect` 方法——此时触发 null dereference。

**wireFeatures 路由验证**：

`wireFeatures` 只接受单个 `connectionAdapter`（feature-wiring.ts 行 63-64），现在传入的是 composite adapter。后续 `ConnectionBackedSendWriter` 和 `ConnectionBackedTargetResolver` 都通过 `connectionService` 操作，而 `connectionService` 持有 composite adapter。

**结论**: wireFeatures 路由正确。composite adapter 对 `connect` 按 kind 明确路由，对 `write` 用试错策略。

### 3. fanOutToStorage 调用链

**文件**: `rewrite/src/runtime/routing-tick.ts`（行 42）

**调用链路**：

```
routingTick(features)
  → connectionService.drainAdapterEvents()   // 从 composite adapter 拉事件
  → 过滤 data events (有 bytes 的)
  → ConnectionToReceiveInputSource(dataEvents)
  → receiveService.drainInputSource(source)  // 解析
  → fanOutToDisplay(displayService, outcomes) // 行 41
  → fanOutToStorage(storageService, outcomes) // 行 42 ✅ 已调用
  → 构建 matchInputs → receiveEventSourceBridge.emit() // 行 62
```

**fanOutToStorage 实现**（`receive-storage-bridge.ts`）：

- 只处理 `kind === 'matched'` 且有 `input` 且 `fields.length > 0` 的 outcome（行 5-8）
- 转换为 `StorageLocalRecord` 并调用 `service.appendLocalRecords(records)`（行 31）

**storageService 实际实现**：

`wireFeatures` 中（feature-wiring.ts 行 71-72）：
```ts
const adapter = createFakeLocalMaterialAdapter();
const storageService = createStorageLocalService({ adapter });
```

**关键发现**: storageService 用的是 `FakeLocalMaterialAdapter`，不是真实文件写入 adapter。这意味着：

- `fanOutToStorage` 调用路径已接通（routing-tick.ts 行 42）
- 但 `appendLocalRecords` 写入的是内存 fake adapter，不会持久化到磁盘
- `feature-wiring.ts` 行 71 硬编码 fake adapter，没有 bootstrap 级别的真实 adapter 注入点

**待确认**: 是否存在其他路径将 storage 数据持久化。persistence 层（`rewriteRuntime.ts` 行 51-53）只保存 frames/connections/settings，不保存 storage records。

**结论**: fanOutToStorage 调用已加入 routing tick，但 storage 底层是 fake adapter（内存），不会真正写入数据。这是设计选择（storage-local-baseline 尚未接入真实文件 I/O），不是 bug。

### 4. TCP 环路实际跑过的证据

**代码层面**：

- `real-network-adapter.ts` 有完整实现（195 行），支持 tcp-client/tcp-server/udp 三种 kind
- `connection-network-adapter.spec.ts` 有 31 个测试用例，使用 mock transport facade
- 这些测试验证 adapter 逻辑正确性，但不涉及真实 TCP socket

**集成测试层面**：

- `routing-tick.spec.ts` 有 5 个测试用例，全部使用 mock features
- mock helpers（`helpers.ts`）中的 `createMockWiredFeatures` 不创建真实 adapter
- 没有端到端集成测试

**手动验证层面**：

- H002 handoff（行 95）描述了手动验证步骤："启动应用 -> 创建 TCP server -> 创建 TCP client -> 发送帧 -> 确认 receive 收到数据"
- **没有找到任何记录证明该手动验证已执行**
- 没有 `.sessions/` 下的验证报告、截图或日志
- 没有集成测试 session note 记录成功/失败结果

**结论**: 没有发现实际跑过 TCP 环路的证据。代码接线已完成，但端到端验证未执行或未记录。

## 后续

1. **composite adapter 测试缺口**: 缺少独立单元测试，建议至少覆盖：(a) 空 options 的 null safety、(b) connect 路由正确性、(c) write 试错策略与 kind 路由的一致性
2. **disconnect null dereference**: 当 `serialAdapter` 和 `networkAdapter` 都为 undefined 时，composite adapter 的 `disconnect` 方法会抛 TypeError。建议加防护或改为 `connect` 时记录 kind → adapter 映射，后续 disconnect/write 按映射路由
3. **write 路由策略不一致**: `connect` 用 kind 路由，`write` 用试错。如果底层 adapter 对不属于自己的 connectionId 返回 ok（而非错误），write 会错路由。待确认 real-serial-adapter 对未知 connectionId 的行为
4. **storage 写入是 fake**: 如需真正持久化 storage records，需要创建真实 storage adapter 并在 wireFeatures/bootstrap 中注入
5. **TCP 环路端到端验证**: 代码接线完成但无执行证据，需手动或自动化集成测试验证
