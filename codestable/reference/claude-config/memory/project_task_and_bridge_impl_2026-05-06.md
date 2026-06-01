---
name: Task design + Bridge/M1 实现结果 2026-05-06
description: task design 完成、bridge G3/G4 解锁、M1 ReadonlyDeep 修复
type: project
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## Task Feature Design — 已完成

产出：
- codestable/features/rewrite-task/rewrite-task-design.md
- codestable/features/rewrite-task/rewrite-task-checklist.yaml

核心决策：
- task owns 调度模式（timed/trigger/sequence）、用例执行上下文、lifecycle（created→running→paused→stopped/completed/failed）、进度追踪、错误策略
- stop ≠ completed（重要：northbound 要求 stopped 状态）
- task→send 调用方式：await Promise<SendResult> + 可选 event
- error policy：retry/skip/stop/pause，默认 stop-on-first-failure

### Send open questions 已回答
- Write queue 归属：send owns transport-level write queue；task owns task-level 序列
- SendResult 同步/异步：Promise<SendResult> 为主 + 可选 event
- Send failure 影响 lifecycle：task 根据 errorPolicy 决定
- Send instance 配置持久化：send own config/settings/storage 联合确认

### Task open questions（deferred）
- SCOE 是否使用 task 编排 → deferred to SCOE design
- result/report 如何消费 TaskExecutionSummary → deferred to result/report design
- northbound task 命令映射 → blocked on 甲方 schema
- Trigger condition 表达能力 → 首轮单帧单字段

## Bridge G3/G4 — 已解锁

改动：package.json（+serialport, +@electron/rebuild）、quasar.config.ts（Vite external + asarUnpack）、新建 verify-serialport.mjs

验证：rebuild 成功、SerialPort.list() 枚举 8 端口、153 tests 通过

Open：hardware validation pending（WSL2 ttyS0-7 模拟）、package validation pending、Windows target 待配置

## M1 ReadonlyDeep — 已修复

改动：新建 shared/types/readonly-deep.ts，6 个 feature core/types.ts 改为 import

验证：153 tests 通过、lint 通过、rg 边界检查不变
