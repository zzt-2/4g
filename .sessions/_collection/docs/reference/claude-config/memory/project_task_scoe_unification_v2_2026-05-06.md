---
name: Task/SCOE/Send 统一决策 2026-05-06
description: task 定位为通用执行引擎、step 多态化、SCOE 复用 task 编排、send/task design 已更新
type: project
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## 执行引擎统一决策

文档：codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md

核心决策：
- task = 通用执行引擎（不是"本地发送调度"）
- step 多态化：send-step / wait-condition-step / delay-step
- SCOE 不需要自己的执行器，翻译命令为 TaskDefinition 通过 task 执行
- send 不变，只做单帧发送
- 条件匹配归 task/core，wait-condition 和 trigger 共用
- QueueModel 不受影响，transport-level FIFO

场景映射：
- 本地定时：[send-step] × N
- 本地触发：[wait-condition-step] → [send-step]
- 本地序列：[send-step, delay-step, send-step, ...]
- SCOE 命令：[send-step(命令帧), wait-condition-step(完成条件), send-step(确认帧)]
- Northbound 用例：[send-step, delay-step, ...] 序列

Design 更新状态：
- send design：已更新（owner 表 + SCOE interaction + open questions 回答）
- task design：已更新（定位重写 + step 多态化 + SCOE 边界锁定 + send open questions 回答）

**Why:** unification + send v2 + task v2 是实现轮的直接合同。
**How to apply:** 实现轮以此为准。SCOE design 起草时也以此为基础。
