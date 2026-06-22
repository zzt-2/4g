# [S007] 接收帧匹配计数到 48 卡死（累计型冻结）

> 2026-06-21 | 阶段:实施完成 | 状态:待用户目标机验证（跑到 48 之后继续不卡）

## 目标

排查"接收帧匹配计数到 48 就卡死不再增长"——典型累计型卡死（重启就好，跑到 48 又死）。任务要求先定位"48 是什么"（破案钥匙），再加日志确认、单点修复。以主对话子任务形式执行，完成后回主对话报告。

## 记录

### 破案钥匙：48 = EVENT_LIMIT(50) − 2

connection state 的 events 数组是**滚动窗口**（`lifecycle.ts:17` `const EVENT_LIMIT = 50`，`appendEvent` 用 `.slice(-50)` 裁剪）。连接建立产生 `connect-requested` + `connected` 两个非 data 事件占 2 槽，剩 48 槽给 data 帧。**用户说的"卡在 48"就是 data 帧填满剩余槽位的临界点。**

### 根因（一句话）

`ConnectionService.collectEventsAfter` 用**数组下标** `beforeLength` 取本轮新增事件，而 events 是**长度恒为 50 的滚动窗口**。累计到 50 后 `beforeLength` 恒为 50，`slice(50)` **永远返回 `[]`** → `drainAdapterEvents` 拿不到新 data 事件 → routingTick 不再路由给 receiveService → 匹配帧计数永久冻结。

数据链路：
```
serial data → splitBySyncWord → emitToRenderer → adapter → connectionService
  state.events 滚动窗口(EVENT_LIMIT=50)
  ↓ drainAdapterEvents（tick driver 每 100ms）
  collectEventsAfter(beforeLength)  ← 满后恒返回 []
  ↓ routingTick 拿不到 data
  receiveService 收不到 → 匹配计数不再涨
```

关键旁证：**rxBytes 走独立 counters 字段，不受 events 截断影响**，会一直涨——所以"路由断而非数据断"（设备/串口没问题，串口助手能正常收）。

### 复现验证（TDD：先写失败测试锁定根因）

新增 `src/__tests__/integration/routing-truncation-freeze.spec.ts`，模拟生产路径（分批 push + 多次 drain，而非一次性 push 100 再 drain）。修复前测试输出**精确吻合现象**：

| 场景 | 期望 | 修复前实际 |
|------|------|-----------|
| 推 60 data 一次 drain | 60 | **48**（丢 12，正是"卡在 48"） |
| 三轮各 30 连续 drain | 30/30/30 | **30/18/0**（越界后归 0 冻结） |

注：`event-truncation.spec.ts` 团队已有"buffer 截断到 50"的测试，但都是"一次性 push 100 再 drain"或"绕过 connection 直接喂 receive"，**没有一个覆盖"分批 + 多次 drain"的真实生产节奏**，恰好掩盖了此 bug。

### 修复（单点）

`rewrite/src/features/connection/services/connection-service.ts`：

| 改动 | 内容 |
|------|------|
| 删 `collectEventsAfter` | 下标法在滚动窗口上失效，是 bug 根源 |
| `applyEvents` 返回本轮新事件 | 直接克隆 `createTransportEventSnapshot(normalized)` 入结果，与 events 是否截断彻底解耦 |
| connect/disconnect/write/drain/cleanup | 改为累积 `applyEvents` 返回值 + 命令自身注入的 request/error 事件，不再依赖下标 |
| `scheduleReconnect` / `handleAdapterDisconnects` | 返回派生的 `reconnect-scheduled` 事件，drain 并入结果（修复中顺带发现并补上的回归：否则 reconnect 事件会漏） |

### 验证

| 项 | 结果 |
|----|------|
| 复现测试 | ✅ 修复前红（48 / 30-18-0），修复后绿 |
| connection 全套 | ✅ 全过 |
| 我的代码 typecheck | ✅ 0 TS 错误 |
| 全量回归 | ✅ 1454 passed；仅 heartbeat-timer 5 个失败 |
| heartbeat 5 个失败 | ✅ `git stash` baseline 验证：改动前就存在，vitest fake-timer 环境问题，与本次无关 |

连带改的 1 个测试（契约更新，附注释）：`connection-state-service-selector.spec.ts` cleanup outcome events 从 `[disconnected]` → `[cleanup, disconnected]`——与 disconnect 路径返回 `[disconnect-requested, disconnected]` 的既有契约对齐（旧下标法偶然排除了开头的 cleanup 事件）。

## 决策引用

- 无 D###。本次是纯技术推导的根因修复，修复路径唯一：不推翻方向、不定义新接口（applyEvents 返回值是其内部实现细节）、collectEventsAfter 失败是 bug 非被选中的方案失败。按 session-governance Trigger 2 判定不构成 D###。
- 关联前序：H005（接收管线调试）同主题，本次是其下游 routingTick 路径的容量边界 bug。

## 范围确认

- 本轮在 scope boundary 内：是。本 topic = "多功能交叉 bug 根因分析修复"，receive 管线卡死属此范畴（H005 同主题）。
- 未触及"明确不含"。

## 后续

- **待用户目标机验证**：跑到 48 之后继续接收，确认匹配计数持续增长不再冻结（红线要求，代码层已验证，设备层待确认）。
- **未修的独立问题 B（拆帧异常）**：用户提的"同样帧重复三次 / 长度三次"指向 `serial-handlers.ts`/`network-handlers.ts` 的 `splitBySyncWord`——其 `positions.length < 2` 时一帧都不 emit（半帧/单帧丢数据），"长度三次"像帧内字段被误识别成同步字 `0x1ACFFC1D`。是粘包补丁（FIXME，commit 5ab5f18）的 bug，FPGA 修复帧定界后整个补丁会删。它是问题 A 的**可能诱因之一**（拆帧异常会加速填满 50），但非 A 根因。
- **`[ROUTE-TICK]`/`[RX-SVC]`/`[RX-PROC]` 临时调试日志**：H006/S005 时期遗留，topic-index 未决项已记，待统一清理。
