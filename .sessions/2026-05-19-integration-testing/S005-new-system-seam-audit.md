# [S005] 新系统接缝审计

> 2026-05-19 | 调研 | 完成
> 9 个 agent 分 3 批并行，覆盖 bridges / adapters / platform / routingTick / service seams / persistence / connection lifecycle / receive pipeline / 现有测试

## 目标

审计 rewrite 新系统的 runtime 接缝、adapter 边界和持久化时序，识别所有集成级别的断裂风险，产出事实报告。

## 记录

### 一、高风险接缝（7 项）

#### H1. fanOutToStorage 未 await，错误被吞掉

- **位置**：`routing-tick.ts:42`
- **事实**：`fanOutToStorage(outcomes)` 是 async 函数但调用时未 await，存储失败被静默忽略
- **影响**：接收数据可能永远不写入存储，且无任何错误提示
- **建议测试**：集成测试中 mock storage 失败，验证错误是否传播

#### H2. 事件截断导致永久丢失（EVENT_LIMIT=50）

- **位置**：`connection/core/lifecycle.ts:17`、`receive/state/receive-state.ts:184`
- **事实**：连接层 `appendEvent` 使用 `slice(-50)` 丢弃旧事件；接收层 `bounded` 使用 `slice(0, 50)` 丢弃新事件
- **影响**：高频数据下超过 50 的事件永久丢失，不可恢复
- **建议测试**：压力测试，模拟 1000+ 事件/秒，验证截断行为和计数准确性

#### H3. LazyPersistence 启动竞态

- **位置**：`rewriteRuntime.ts:51-53`
- **事实**：`initPersistenceAsync` 是 fire-and-forget，不等待完成。setDelegate 前所有 load() 返回空数据、所有 save*() 静默丢弃
- **影响**：用户可能在数据加载完成前操作帧数据，覆盖刚加载的内容；或误以为保存成功
- **建议测试**：时序竞争测试，验证 setDelegate 前后的 load/save 行为

#### H4. save*() 方法无任何调用方

- **位置**：`persistence.ts:70-91`
- **事实**：saveFrames/saveConnections/saveSettings/saveAll 已实现，但搜索整个 rewrite/src/ 无任何业务代码调用。无自动保存、无退出钩子、无定时检查点
- **影响**：所有运行时修改（帧增删改、连接配置、设置）仅在内存中，应用关闭或崩溃即丢失
- **建议测试**：数据丢失回归测试，验证退出/崩溃后数据是否持久化

#### H5. TCP Server 事件队列溢出丢弃

- **位置**：`network-handlers.ts:86-96`
- **事实**：事件队列 maxQueueDepth=100，满时 shift 丢弃最旧事件（包括连接/断开/数据事件）
- **影响**：高频连接/断开或大量数据时，关键事件可能被丢弃
- **建议测试**：压力测试，快速连接/断开大量 client，验证事件队列行为

#### H6. readModel 硬编码为空 Map

- **位置**：`processor.ts:269`
- **事实**：`readModel: new Map()`，跨帧变量解析功能已实现（expression-pass.ts 208-216 行有 frame_field 查询逻辑）但无法使用
- **影响**：跨帧表达式（如 `frame_B.field_x + 1`）永远返回 undefined
- **建议测试**：集成测试，验证 readModel 构建和传递后跨帧表达式的正确性

#### H7. composite adapter drainEvents() serial 为 null 时 TypeError

- **位置**：`composite-adapter.ts:88-99`
- **事实**：serialAdapter 为 undefined 时 drainEvents() 直接访问 `.drainEvents()` 会抛 TypeError；connect/write/disconnect 有 null 检查但 drainEvents 没有
- **影响**：无串口环境下调用 drainEvents() 崩溃
- **建议测试**：边界测试，serialAdapter 为 undefined 时的所有操作

### 二、中风险接缝（10 项）

#### M1. routingTick 无背压机制

- **位置**：`routing-tick.ts` 全链路
- **事实**：100ms tick 间隔，无背压机制。一次 drain 产出大量事件时，后续 tick 继续累积，可能内存暴增
- **建议测试**：压力测试，模拟 1000+ 事件/秒持续运行

#### M2. drainInputSource 同步阻塞

- **位置**：`receive-service.ts:230-238`
- **事实**：`for...of` 同步遍历事件，每个事件调用 ingest，大量事件时单次 tick 耗时过长
- **建议测试**：性能测试，验证大量事件时的 tick 耗时

#### M3. receive-storage-bridge / receive-display-bridge 静默失败

- **位置**：`receive-storage-bridge.ts:31-32`、`receive-display-bridge.ts:28-29`
- **事实**：下游失败时返回 0 但不抛异常、不记录错误信息
- **影响**：数据写入存储或显示更新失败时无法感知
- **建议测试**：故障注入测试，mock 下游失败，验证错误传播

#### M4. receive-event-source-bridge 处理器无异常隔离

- **位置**：`receive-event-source-bridge.ts:17-19`
- **事实**：单个处理器异常会中断全部处理器执行
- **建议测试**：异常隔离测试

#### M5. connection-backed-writer 事件依赖脆弱

- **位置**：`connection-backed-writer.ts:30-32`
- **事实**：依赖 `find()` 查找 write-accepted 事件，事件缺失时可能返回 0 字节数
- **建议测试**：事件缺失场景测试

#### M6. Preload 类型推断不一致

- **位置**：`preload/index.ts:35-43, 60-68`
- **事实**：connect 时依赖返回值推断类型，事件监听依赖 `target.role` 推断，两者可能不同步。connect 返回成功前事件先到达时类型推断会失败
- **建议测试**：竞态测试，connect 和事件同时到达

#### M7. connections/settings 启动恢复缺失

- **位置**：`rewriteRuntime.ts:58-81`
- **事实**：frames 能恢复，connections 和 settings 完全未实现恢复。ConnectionService 无批量替换 API
- **影响**：用户每次启动需重新配置连接和设置
- **建议测试**：恢复完整性测试

#### M8. autoConnect 配置存在但逻辑缺失

- **位置**：`types.ts:60`
- **事实**：`autoConnect?: boolean` 配置已定义，UI 有开关，但 connection-service 中完全不检查此属性
- **影响**：用户开启自动连接但不生效
- **建议测试**：配置驱动集成测试

#### M9. 重连定时器潜在泄漏

- **位置**：`connection-service.ts:248`
- **事实**：reconnect 定时器使用 Map 管理，长时间运行+多次重连可能导致泄漏
- **建议测试**：长时间运行内存泄漏测试

#### M10. 字段键冲突（无来源区分）

- **位置**：`receive-state.ts:118-119`
- **事实**：`fieldKey` 只用 `frameId:fieldId`，同帧同字段多次到达会覆盖，无来源区分
- **建议测试**：多源并发接收测试

### 三、低风险接缝（5 项）

| 编号 | 接缝 | 位置 | 说明 |
|------|------|------|------|
| L1 | composite adapter 路由覆盖 | composite-adapter.ts:10-26 | 路由完全覆盖所有 TransportKind，无风险 |
| L2 | TCP server/client 模式差异 | real-network-adapter.ts:20-38 | 配置相同，错误语义正确区分 |
| L3 | UDP remote 校验 | real-network-adapter.ts:119-141 | 提前验证，错误信息清晰，已有测试 |
| L4 | 表达式错误传播 | processor.ts:240-314 | 错误传播路径清晰，标准化错误码，降级处理合理 |
| L5 | Platform facade 缓存 | platform/index.ts:46-58 | 单例缓存模式一致，有手动清除机制 |

### 四、现有集成测试覆盖审计

**已有覆盖（3 个 spec 文件）**：
- `feature-wiring.spec.ts`：桥接器单元级数据转换测试
- `routing-tick.spec.ts`：单次 tick 成功/失败/空事件路径
- `bootstrap-integration.spec.ts`：端到端 runtime 创建 → 连接 → 推数据 → tick

**mock 与真实行为差异**：
- Fake adapter 同步立即返回，真实 adapter 有 I/O 延迟
- Mock service 返回空快照，真实 service 维护可变状态和副作用
- 未测试 tick 执行期间连接断开、大量数据积压、长时间运行的资源清理

**分界线**：现有测试覆盖了"单个 tick 的同步控制流和数据格式"；缺失"多次 tick 的异步状态管理、真实 I/O 交互、跨 feature 数据一致性"。

### 五、按测试类型分级的接缝清单

| 测试类型 | 接缝 | 数量 |
|----------|------|------|
| **真 TCP 集成** | H5 事件队列溢出、M6 preload 类型竞态、M9 重连定时器 | 3 |
| **fake adapter 集成** | H1 fanOut 未 await、H2 事件截断、H7 drainEvents null、M1 背压、M2 同步阻塞、M3 静默失败、M4 异常隔离、M5 事件依赖、M10 字段键冲突 | 9 |
| **Vitest 时序/持久化** | H3 LazyPersistence 竞态、H4 save 无调用方、M7 恢复缺失 | 3 |
| **需先修 bug** | H6 readModel 空、M8 autoConnect 缺失 | 2 |

## 后续

1. **S006 综合阶段**需将本报告 7+10+5=22 个接缝与 S001-S004 的发现去重合并
2. H6（readModel 空）和 M8（autoConnect 缺失）是功能缺失而非集成测试缺口，建议从集测清单中移出，归入 feature 实施计划
3. H1（fanOutToStorage 未 await）和 H4（save 无调用方）是代码 bug，建议在集测前先修复
4. 22 个接缝中有 9 个适合 fake adapter 集成测试（可在 Vitest 中完成），3 个需要真 TCP，3 个是时序/持久化测试
