# Handoff: 本地 TCP 环路集成

> 来源: H001 续接 | 交接目标: 接通本地 127.0.0.1 TCP 环路，使数据从 send 发出经 TCP 到 receive 解析跑通
> 文件名: H002-local-tcp-loopback-handoff.md

## 任务

接通 rewrite 系统的本地 TCP 环路。改动集中在 runtime bootstrap 和 connection adapter 路由，不改 feature core/service/state 层。

## 直接合同

无独立 feature design（这是接线活不是新 feature）。合同是现有代码事实：

- `rewrite/src/app/rewriteRuntime.ts` — 当前 bootstrap 只创建 serial adapter
- `rewrite/src/runtime/feature-wiring.ts` — wireFeatures 只接受单个 adapter
- `rewrite/src/features/connection/adapters/real-network-adapter.ts` — 已实现但从未使用
- `rewrite/src/features/connection/adapters/index.ts` — 未导出 network adapter
- `rewrite/src/runtime/routing-tick.ts` — fanOutToStorage 定义了但没调用

## 边界护栏（新对话开始时必读）

用子 agent 并行读取：

### Agent 1：架构约束
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-quality-rules.md`（重点 R5 Electron 边界、R14 依赖注入显式）
- `codestable/quality/rewrite-review-checklist.md`（§5 结构与依赖、§7 Electron/Platform、§8 高频数据）

### Agent 2：现有接线状态
- `rewrite/src/app/rewriteRuntime.ts`
- `rewrite/src/runtime/feature-wiring.ts`
- `rewrite/src/runtime/index.ts`
- `rewrite/src/runtime/routing-tick.ts`
- `rewrite/src/features/connection/adapters/real-network-adapter.ts`
- `rewrite/src/features/connection/adapters/real-serial-adapter.ts`
- `rewrite/src/features/connection/adapters/index.ts`
- `rewrite/src/features/connection/core/types.ts`（TransportKind 定义）

## 实施前检查

开始写代码前确认：
1. 直接合同已列出 — 见上方
2. 覆盖旧系统可观测行为 — TCP 连接（tcp-client/tcp-server/udp）在旧系统中已使用，新系统已有实现只需接线
3. 涉及 feature 归口 — connection（adapter 路由）、runtime（bootstrap + wiring）
4. 外部只通过 public API — 是，composite adapter 仍实现 ConnectionTransportAdapter 接口
5. 涉及 Electron/preload/main API — 否，main TCP handlers 已实现，不改
6. 涉及 SCOE/northbound/高速数据 — 否
7. 验证方式 — pnpm build + pnpm lint + 现有 tests 不回归 + 手动 TCP 环路验证

## 具体改动

### 改动 1：导出 network adapter

`rewrite/src/features/connection/adapters/index.ts` 加导出 `createRealNetworkAdapter`。

### 改动 2：创建 composite adapter

`rewrite/src/features/connection/adapters/composite-transport-adapter.ts`（新文件）：

- 接受 `serialAdapter?` 和 `networkAdapter?`
- 实现 `ConnectionTransportAdapter` 接口
- `connect(config)` 按 `config.kind` 路由：serial → serialAdapter，tcp-* / udp → networkAdapter
- 没有对应 adapter 时返回 invalid-config 错误（不静默成功）
- 其他方法（disconnect/write/cleanup/drainEvents）按 connectionId 或 config 分发

### 改动 3：bootstrap 同时创建两个 adapter

`rewrite/src/app/rewriteRuntime.ts`：
- 同时创建 `createRealSerialAdapter` 和 `createRealNetworkAdapter`
- 用 composite adapter 组合后传入 `createRewriteRuntime`

### 改动 4：fanOutToStorage 调用

`rewrite/src/runtime/routing-tick.ts`：
- 在 `fanOutToDisplay` 后加 `fanOutToStorage` 调用

## 不要做什么

- 不改 feature core/service/state 层 — 已验收
- 不改 main 进程 network-handlers — 已完整
- 不改 preload IPC 路由 — 已完整
- 不引入新 DI 容器或新 adapter 接口 — ConnectionTransportAdapter 已够用
- 不把 adapter 选择逻辑塞进 runtime — runtime 只做装配，路由逻辑归 composite adapter
- 不让 runtime 变成所有 feature 依赖的杂物箱（review-checklist §5 禁止项）
- 不违反 R14：service 依赖通过工厂函数传入

## 验证

```bash
pnpm -C rewrite build   # 零错误
pnpm -C rewrite lint    # 零错误
pnpm -C rewrite test    # 现有 815+ tests 不回归
```

手动验证：启动应用 → 创建 TCP server（127.0.0.1:5002）→ 创建 TCP client 连 server → 发送帧 → 确认 receive 收到数据。

## Lane 判定

Lane B：需求清晰，改动集中（3-4 文件 + 1 新文件），单对话可完成。
