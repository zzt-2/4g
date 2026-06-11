---
name: Send design + Connection bridge prep 结果 2026-05-06
description: 两条并行线的产出摘要、open questions、blockers
type: project
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## Send Feature Design — 已完成

产出：
- codestable/features/rewrite-send/rewrite-send-design.md
- codestable/features/rewrite-send/rewrite-send-checklist.yaml（10 steps + 16 checks）

核心决策：send owns 单帧发送生命周期（构帧→target解析→transport write→结果输出）

### Open Questions（需 task design 或讨论确认）
1. **send-task 边界**: write queue 归属、SendResult 同/异步、send instance 配置持久化、send 是否了解 task、send failure 是否影响 task lifecycle
2. **expression runtime**: send 是否执行 expression，还是只接受 resolved values — 建议后者
3. **checksum 策略完整列表**: 需实现阶段从 legacy 补齐
4. **receive trigger 与 send**: 建议所有发送经 send public service，触发方是 task/runtime 不是 receive

### 实现前必须确认
1. task design 确认 send-task 调用方式
2. expression runtime 归属
3. send instance 配置持久化方案
4. connection bridge ready 状态
5. checksum 策略完整列表
6. 旧 send instance JSON 样例可用性
7. queue 行为 runtime 证据需求

### 与 task 边界建议
- task owns 调度/编排/序列/pause/resume/stop/retry
- send owns 单帧执行（build→write→result）
- send 不了解 task 存在，只接收 SendRequest + context
- task 不 import send internal state

## Connection Bridge Prep — 已完成

### Gate Checklist
- G1 serialport 兼容性: PASS
- G2 electron-rebuild 流程: PASS
- G3 Vite external 配置: **BLOCK**（需添加 serialport + bindings-cpp 到 rollupOptions.external）
- G4 asarUnpack 配置: **BLOCK**（需添加 **/*.node + serialport 目录）
- G5 typed preload bridge shape: PASS
- G6 main resource lifecycle: PASS
- G7 queue/batch 参数: PASS（保守默认值: maxBatchBytes=4096, maxBatchWindowMs=50, maxQueueDepth=100）
- G8 现有测试: PASS（153 tests）

### 高风险
- R1: serialport 13 需源码编译（C++ 工具链已齐备）
- R2: WSL2 无法枚举真实串口（开发态用 virtual/mock，最终 Linux 原生）
- R3: asar 打包后 .node 路径（需精确 asarUnpack）

### 实现前置
1. pnpm -C rewrite add serialport
2. pnpm -C rewrite add -D @electron/rebuild
3. 配置 quasar.config.ts Vite external + asarUnpack
4. 验证 dev 模式 main 能 require('serialport')

**Why:** 记录两条并行线的断点和 blocker，后续对话据此分流。
**How to apply:** send 的 open questions 需 task design 解答；bridge 的 G3/G4 是具体配置改动可以立即做。
