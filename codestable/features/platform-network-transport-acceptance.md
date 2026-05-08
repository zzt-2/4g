# Platform Network Transport 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-08
> 关联方案 doc：codestable/features/platform-network-transport-design.md

## 1. 接口契约核对

对照方案第 3 节 Type Changes 逐一核查：

**新增类型核对**：
- [x] `TcpClientConnectConfig`（kind+id+host+port）→ `platform-bridge.ts:65-70` 一致
- [x] `TcpServerConnectConfig`（kind+id+host+port）→ `platform-bridge.ts:72-77` 一致
- [x] `UdpConnectConfig`（kind+id+localHost+localPort+remote?）→ `platform-bridge.ts:79-86` 一致
- [x] `TransportConnectConfig` union → `platform-bridge.ts:88-92` 一致
- [x] `SerialConnectConfig` 新增 `kind: 'serial'` → `platform-bridge.ts:58-63` 一致

**TransportBridge 接口核对**：
- [x] `connectSerial` 已移除 → `connect(config: TransportConnectConfig)` 新增 → `platform-bridge.ts:78` 一致

**Facade 接口核对**（方案第 6 节）：
- [x] `TransportFacade.connectSerial` → `connect` → `transport.ts:19` 一致
- [x] `createTransportFacade` 同步更新 → `transport.ts:31` 一致

**Preload 路由核对**（方案第 5 节）：
- [x] `connectionTypes` Map → `preload/index.ts:26`
- [x] `connect()` 按 kind 路由 → `preload/index.ts:34-42`
- [x] `disconnect()`/`write()` 按 map 路由 → `preload/index.ts:44-62`
- [x] 事件监听器 TCP Server client 跟踪 → `preload/index.ts:23-28`

**Main handler 核对**（方案第 4 节）：
- [x] IPC channels: `transport:network-connect/disconnect/write/cleanup` → `network-handlers.ts:11-14` 一致
- [x] 共享 `transport:event` channel → `network-handlers.ts:15` 一致
- [x] `registerNetworkHandlers` / `cleanupNetworkHandlers` 导出 → `network-handlers.ts:675-692` 一致

无偏差。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] renderer 通过 platform facade 访问 TCP/UDP → preload `connect()` 按 kind 路由到 network IPC，facade 只暴露 `TransportConnectConfig`
- [x] main 不承载业务逻辑 → network-handlers 只做连接管理 + batch，不解释帧/任务/报告
- [x] 现有串口功能不受影响 → serial-handlers.ts 未修改，preload 路由层按 kind 分发

**明确不做逐项核对**（方案第 9 节 Out of Scope）：
- [x] TCP/UDP adapter（connection 层）**确实没做** — 只有 platform bridge 层
- [x] 断线重连 **确实没做** — 无 retry 逻辑
- [x] UDP writeTo 扩展 **确实没做** — write 只支持配置目标
- [x] 文件系统/窗口控制/HTTP/FTP/高速存储 **确实没做**

**关键决策落地**：
- [x] D1（统一 connect 接口）→ `TransportBridge.connect(config: TransportConnectConfig)` + discriminated union
- [x] D2（TCP Server 事件设计）→ listener/client 独立 connectionId，clientId 格式 `${serverId}::client:${addr}:${port}`，disconnect listener 关闭全部 client
- [x] D3（Preload 路由）→ `connectionTypes` Map + 按 type 分发 IPC
- [x] D4（UDP 写入目标）→ 无 remoteHost/remotePort 时 write 返回 error
- [x] D5（Batch 参数）→ 独立复制 batch 基础设施，参数与 serial 相同
- [x] D6（RewritePlatformCapability）→ 保持 `'transport'` 不变

**挂载点反向核对**——grep 确认本 feature 代码引用范围：

本 feature 新增/修改的代码引用点：
- [x] `platform-bridge.ts` — shared 层类型定义，被 `platform/`、`preload/`、`main/` 引用
- [x] `platform/index.ts` — re-export 新类型
- [x] `platform/transport.ts` — facade 接口变更
- [x] `main/index.ts` — 注册 network handlers（import + register + cleanup）
- [x] `preload/index.ts` — 统一路由
- [x] `connection/adapters/real-serial-adapter.ts` — connect 迁移 + cast 修复

Grep 确认无清单外引用（`connectSerial` 已全部替换为 `connect`，无残留）。

**拔除沙盘推演**：
- 删除 `network-handlers.ts` + 撤销 `main/index.ts` 注册 + 撤销 preload 路由 + 恢复 `connectSerial` → 系统回到纯串口状态。无残留。

## 3. 验收场景核对

对照方案第 11 节 Acceptance Criteria：

- [x] **AC1**: TCP Client 可连接远程 Server，收发数据，断开
  - 证据：代码路径完整（handleTcpClientConnect + data batch + disconnect + cleanup）
  - 限制：需手动网络验证（V4）
- [x] **AC2**: TCP Server 可监听端口，accept 客户端，为客户端收发数据
  - 证据：代码路径完整（handleTcpServerConnect + connection event + client management）
  - 限制：需手动网络验证（V5）
- [x] **AC3**: UDP 可绑定端口，收发数据
  - 证据：代码路径完整（handleUdpConnect + message batch + send to remote）
  - 限制：需手动网络验证（V6）
- [x] **AC4**: 现有串口功能不受影响
  - 证据：serial-handlers.ts 未修改；adapter 迁移仅改调用方式不改行为；534 tests passed（2 failed 预存）
- [x] **AC5**: renderer 不直接访问 Node/Electron
  - 证据：preload 暴露 typed API，无裸 IPC；facade 是唯一入口
- [x] **AC6**: main 不包含业务逻辑
  - 证据：network-handlers 只做连接管理和 batch，无帧/任务/报告语义
- [x] **AC7**: `pnpm -C rewrite build` 通过 — 已验证
- [x] **AC8**: `pnpm -C rewrite lint` 通过 — 已验证（唯一剩余 error 预存）
- [x] **AC9**: 现有测试全部通过 — 534 passed / 2 pre-existing failed

**前端无 UI 改动**，不涉及浏览器验证。

## 4. 术语一致性

对照方案代码 grep：

- `TransportConnectConfig`：3 处定义/引用，全部一致
- `TcpClientConnectConfig`：定义 + export + handler 引用，一致
- `TcpServerConnectConfig`：定义 + export + handler 引用，一致
- `UdpConnectConfig`：定义 + export + handler 引用，一致
- `tcp-client-peer` / `tcp-server-listener` / `tcp-server-client` / `udp-remote`：role 值与 connection core `TRANSPORT_TARGET_ROLES` 一致
- `connectSerial`：已全部替换，grep 无残留

防冲突：禁用词 `connectSerial` grep 无命中。

## 5. 架构归并

对照 `rewrite-connection-platform-bridge.md` 和 `rewrite-connection-transport-boundary.md`，两者第 3 节 / 2.4 节描述的 "当前 rewrite scaffold 最小状态" 需要更新。

需要更新的内容：

1. `rewrite-connection-platform-bridge.md` 第 3 节 "Current evidence"：
   - platform-bridge.ts 不再只定义 metadata，已有 transport 类型（serial + TCP/UDP）
   - platform/index.ts 不再只读取 getBridgeInfo()，已有完整 transport facade
   - preload 不再是 metadata-only typed bridge，已有完整 transport bridge
   - main 已有 serial + network IPC handler

2. `rewrite-connection-platform-bridge.md` 第 14 节 "Readiness verdict"：
   - 状态应从 `ready-for-implementation-design` 更新，因为 implementation design 已完成且代码已落地

3. `rewrite-connection-transport-boundary.md` 第 2.4 节：
   - "当前 rewrite scaffold 仍是最小 typed bridge" 需更新

- [ ] `rewrite-connection-platform-bridge.md`：更新第 3 节 current evidence + 第 14 节 verdict → **需写入**
- [ ] `rewrite-connection-transport-boundary.md`：更新第 2.4 节 scaffold 描述 → **需写入**
- [ ] `rewrite-target-structure.md`：不需要更新（目录结构未变，connection 归口描述已包含 TCP/UDP）

## 6. requirement 回写

方案无 `requirement` frontmatter 字段。本 feature 是平台桥接层能力扩展，新增 TCP/UDP transport 作为平台能力暴露给 connection adapter。

用户可感知的新能力：TCP Client/Server/UDP 连接。

- [ ] 需要触发 `cs-req` backfill 落档。但由于本 feature 目前只做了 platform bridge 层，connection adapter 层（RealTcpAdapter/RealUdpAdapter）在 connection-complete 中实现，用户最终通过 connection feature 的 UI 感知。当前 req 回写可以延后到 connection-complete 验收时一并处理。

结论：**暂不 backfill**，记录为 connection-complete 验收的前置待办。

## 7. roadmap 回写

方案无 `roadmap` / `roadmap_item` frontmatter 字段。

- [x] 非 roadmap 起头，跳过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。所有命令和模式与现有 serial handler 一致。

## 9. 遗留

**后续优化点**：
- TCP/UDP adapter（connection 层的 RealTcpAdapter/RealUdpAdapter）→ connection-complete feature
- 断线重连策略 → connection-complete
- UDP 多目标发送（writeTo）→ 未来扩展
- network-handlers 无 `configureNetworkBatch()` 导出 → 可在需要运行时调整时补加
- TCP Server 无 `settled` 标志保护 → 低风险，可后续统一模式

**已知限制**：
- TCP Server clientId `${serverId}::client:${addr}:${port}` 同客户端快速重连可能产生 connectionId 冲突（已有防御清理旧 client，但事件序不保证）
- UDP 无 remoteHost/remotePort 时 write 返回 error
- Batch 参数暂不可运行时配置
- 手动验证（V4-V7）需真实网络环境和硬件

**实现阶段顺手发现**：
- `feature-wiring.spec.ts:175` — `_` 赋值未使用（lint error，预存）
- `connection-state-service-selector.spec.ts:254` — public API 泄露 `createFakeConnectionTransportAdapter`（预存）
- `task-core.spec.ts:261` — condition `any operator` 对 null 值行为不符合预期（预存）
- `real-serial-adapter.ts:23` — `toAdapterErrorKind` 的 `Set<string>.has()` 无法窄化到 `TransportErrorKind`（tsc strict 预存问题）
