# Rewrite connection feature 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-08
> 关联方案 doc：codestable/features/rewrite-connection/rewrite-connection-design.md

## 1. 接口契约核对

对照方案第 4.11/4.12 节逐一核查：

**接口示例逐项核对**：
- [x] `ReconnectPolicy` 类型（core/reconnect.ts:3-9）：5 个 readonly 字段齐全 → 一致
- [x] `getReconnectPolicy(kind)` 返回值（core/reconnect.ts:50-52）：serial→disabled, tcp-client→(10,1s,30s,2x), tcp-server→(10,1s,30s,2x), udp→(5,1s,10s,2x) → 一致
- [x] `nextReconnectDelay(policy, attempt)` 计算 min(initial*multiplier^attempt, maxDelay)（core/reconnect.ts:54-56） → 一致
- [x] `shouldReconnect(policy, attempt)` 逻辑 enabled && (maxAttempts===0 || attempt < maxAttempts)（core/reconnect.ts:59-62） → 一致
- [x] `createRealNetworkAdapter(options)` 返回 ConnectionTransportAdapter（adapters/real-network-adapter.ts:53-55） → 一致
- [x] `connect()` 按 config.kind 转换为 TransportConnectConfig 并调用 transport.connect()（real-network-adapter.ts:75-76） → 一致
- [x] `selectReconnectStatus(state, connectionId)` 返回 {isActive, attempt, nextAt?, policy} 只读快照（selectors/connection-selectors.ts:126-142） → 一致

**名词层"现状 → 变化"逐项核对**：
- [x] 新增 RealNetworkAdapter：声称统一处理 tcp-client/tcp-server/udp → 代码 `NETWORK_KINDS` Set 实现 → 一致
- [x] mapBridgeEvent 提取到共享位置：声称搬到 adapters/internal/ → 实际落地 adapters/internal/map-bridge-event.ts → 一致
- [x] mapBridgeEvent disconnected 修复：声称保留 target → 代码 disconnected case 含 target 扩展 → 一致

**重连编排流核对**（design 4.12 mermaid 图）：
- [x] Connected → Disconnected → Reconnecting → Waiting → Reconnecting/Connected/Exhausted 全路径在 connection-service.ts scheduleReconnect + handleReconnectTimerFired 中有实际落点

## 2. 行为与决策核对

对照方案第 4.1/4.5/4.12 节：

**需求摘要逐项验证**：
- [x] RealNetworkAdapter 统一处理三种网络传输：20 个 adapter 测试覆盖 tcp-client/tcp-server/udp 行为
- [x] 重连策略按 transport kind 差异化：19 个纯函数测试覆盖全部 4 种 kind
- [x] 重连编排 service 层实现：8 个 service 测试覆盖调度、backoff、耗尽、取消
- [x] serial 默认不重连：getReconnectPolicy('serial').enabled === false → 一致

**明确不做逐项核对**（第 2 节 Boundary guards + 第 4.15 节）：
- [x] ConnectionTransportAdapter port 接口未修改（5 方法签名无变化）
- [x] RealSerialAdapter 未修改（只改了 import 路径）
- [x] UI 组件/页面路由/runtime wiring 未实现
- [x] config 字段 schema/IPC channel/错误码枚举未冻结
- [x] TCP \r\n 切包未在 connection 实现（deferred to receive）
- [x] 高速存储 short-circuit 未实现（deferred to runtime）
- [x] SCOE fixed source/target 未实现（deferred）
- [x] serial 自动重连写死 disabled

**关键决策落地**：
- [x] D1 重连是 service 层关注点：timer 管理、policy 查询、state 更新均在 connection-service.ts 内部
- [x] D2 Adapter 不跟踪 client 列表：real-network-adapter.ts 只有 configStore Map<string, TransportConfig>
- [x] D3 重连状态不可变：selector 返回 clone，reducer 不可变更新

**跨层纪律核对**：
- [x] core/ 无 Vue/Pinia/Electron 依赖：grep 确认零命中
- [x] adapter 只通过 TransportFacade 访问 platform：grep 确认无直接 IPC/Node import
- [x] selector 返回只读快照：全部使用 clone 函数

**挂载点反向核对（可卸载性）**：
- [x] 外部引用全部通过 index.ts public API：send/ports.ts、send/fake-connection-writer.ts、receive/core/types.ts 共 3 处，均 import from @/features/connection
- [x] 无直接引用 internal 模块的违规行为：grep 确认
- [x] **拔除沙盘推演**：删除 connection/ 后仅 3 个文件编译失败（send 2 处 + receive 1 处），均为合法的 public API 消费方

## 3. 验收场景核对

对照方案第 4.14 节验证计划：

- [x] **S1 TCP client config 校验**：类型签名保证 + validation 单测覆盖
- [x] **S2 TCP server listener + client 事件序列**：network adapter 单测覆盖（connects as listener + maps client connected + disconnects all）
- [x] **S3 UDP write 无 remote**：单测 `returns write-failed for UDP without remote target` 覆盖
- [x] **S4 重连策略 backoff 计算**：19 个纯函数测试覆盖 attempt 0-100 的指数退避 + maxDelay 上限
- [x] **S5 重连 maxAttempts 耗尽**：service 单测 `reaches maxAttempts → reconnect-exhausted` 覆盖
- [x] **S6 重连取消（disconnect）**：service 单测 `disconnect cancels pending reconnect` 覆盖
- [x] **S7 重连取消（cleanup）**：service 单测 `cleanup cancels all pending reconnects` 覆盖
- [x] **S8 Selector 只读**：clone 函数保证，guard 静态扫描确认
- [x] **S9 core 无平台依赖**：grep 确认 zero Vue/Pinia/Electron/Node import
- [x] **S10 不包含 receive/send/task/SCOE/result/report/northbound**：grep 确认零跨 feature import

**反向核对项**：
- [x] renderer 不直接访问 Node/Electron → grep 确认
- [x] feature 间不 import connection internal state → grep 确认
- [x] 不得用 static/fixture/fake adapter 宣称 hardware/package/customer validation 完成 → 承认 runtime/hardware 为 pending

## 4. 术语一致性

对照方案第 4.12 节命名 grep 代码：

- `ReconnectPolicy`：代码 2 处定义 + 引用，一致 ✓
- `getReconnectPolicy`：代码 3 处（定义 + core/index.ts + selectors），一致 ✓
- `nextReconnectDelay`：代码 2 处（定义 + core/index.ts），一致 ✓
- `shouldReconnect`：代码 3 处（定义 + core/index.ts + service），一致 ✓
- `createRealNetworkAdapter`：代码 3 处（定义 + adapters/index.ts + feature/index.ts），一致 ✓
- `selectReconnectStatus`：代码 3 处（定义 + selectors/index.ts + feature/index.ts），一致 ✓
- `reconnect-scheduled` / `reconnect-exhausted`：types.ts TRANSPORT_EVENT_KINDS + lifecycle reducer + service，一致 ✓
- `reconnectAttempt` / `reconnectNextAt`：types.ts + clone.ts + lifecycle.ts，一致 ✓

防冲突：无新概念名与已有代码冲突 ✓

## 5. 架构归并

本 feature 的架构影响范围：

**名词归并**：
- [x] `rewrite-target-structure.md`：已在 connection feature 目录下，无需修改目标结构文档（目录结构未变）
- [x] `rewrite-feature-boundaries.md`：connection 的 owner/not owner 边界已在设计 §4.2 明确，且设计本身引用此文档为直接合同。新增的重连策略和 network adapter 不改变已有边界定义 → 不需要更新

**动词骨架归并**：
- [x] connection → receive/send/SCOE/status 交互已在 `rewrite-feature-interaction-matrix.md` 明确。本次新增的重连事件不改变交互矩阵（reconnect-scheduled/exhausted 是 connection 内部事件，消费方通过 selector 只读访问） → 不需要更新

**跨层纪律归并**：
- [x] `rewrite-quality-rules.md`：已有的 "core 无 Vue/Pinia/Electron" 纪律得到遵守 → 不需要更新

评估总结：本次 feature 在已有架构框架内实现，未引入新模块、未改变目录结构、未改变 feature 间交互方向。架构 doc 无需更新。

## 6. requirement 回写

方案 frontmatter 无 `requirement` 字段。

本 feature 是已有 connection feature 的扩展（TCP/UDP adapter 接入 + 重连策略），是 runtime 层能力的补全，不是新用户可感能力。

结论：无 requirement 回写。

## 7. roadmap 回写

方案 frontmatter 无 `roadmap` / `roadmap_item` 字段。

本 feature 由 `codestable/compound/2026-05-07-runtime-next-phase-global-planning.md` 第十四节 connection-complete 行驱动，属于 Wave 2 策略执行。

结论：非 roadmap 起头，不更新 items.yaml。global-planning.md 的 connection-complete 行完成状态应在后续 roadmap review 中更新。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。平台层 TransportFacade API 和 feature 层 ConnectionTransportAdapter port 均已在现有文档中描述。

## 9. 遗留

**后续验证**：
- CONN-RUNTIME-001：TCP/UDP 真实连接 runtime 验证（需真实 TCP server/client/UDP 环境）
- CONN-RUNTIME-002：重连 runtime 验证（需真实断线场景）
- CONN-HW-001：真实 TCP/UDP 硬件验证

**已知限制**：
- Serial 自动重连写死 disabled（需启用时改 core 代码并补充 discovery 前置检查）
- UDP 多目标发送等 platform writeTo 扩展
- TCP \r\n 切包归属由 receive design 决定
- `createFakeConnectionTransportAdapter` 导出在 feature public API barrel 中，导致预已存在的 guard test 失败（不在本次 scope）

**实现阶段"顺手发现"**：
- 无
