---
name: 三线并行结果 2026-05-06
description: send 实现完成、bridge Phase 1-3 完成、SCOE design + outbound routing 决策完成
type: project
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## Send 实现 — DONE

20 suites / 249 tests（+96 新 send tests），lint 通过，边界检查通过。
Verdict: pass-with-known-gaps（真实硬件/runtime 验证 deferred by design）。

结构：core（types/encode/checksum/validation/clone）+ adapters（ports/fake）+ fixtures + state + selectors + services + index.ts

## Connection Bridge Phase 1-3 — DONE

改动：shared/platform-bridge.ts（transport bridge 类型）、main/serial-handlers.ts（IPC handlers）、preload（typed bridge）、platform/transport.ts（facade）、connection/adapters/real-serial-adapter.ts。

Verdict: pass-with-known-gaps（WSL2 无真实串口、TCP/UDP adapter 未实现、packaged build 未验证）。

## SCOE Design — DONE

文档：codestable/features/rewrite-scoe/rewrite-scoe-design.md + checklist.yaml

核心决策：SCOE 是"外部指令适配器"模式的第一个实现，定义了 ExternalCommandAdapter 通用模式供 northbound 复用。

## Outbound Routing 决策 — DONE

文档：codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md

4 个决策：
- D1: SCOE 命令帧 targetId 来自 ScoeCommand 配置，指向下位机连接
- D2: Northbound targetId 通过 deviceId 映射或 defaultTargetId
- D3: 首轮确认帧只支持固定值（expression runtime deferred）
- D4: 首轮不做 task-level 并发协调，依赖 send QueueModel

**Why:** 记录当前断点——send 已实现，task 实现（依赖 send public API）是下一步最大缺口。
**How to apply:** task 实现轮以 send v2 + task v2 + unification + outbound routing 为直接合同。
