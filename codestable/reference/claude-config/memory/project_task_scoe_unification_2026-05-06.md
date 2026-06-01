---
name: Task/SCOE/Send 统一 + Task design review 2026-05-06
description: 执行引擎统一决策、task/send design 修订、10 项 review 修复、shared 模块提取决策
type: project
originSessionId: 90ec2772-4575-4b76-9bbd-42b6fa2d18bf
---
## 执行引擎统一决策

产出：codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md

核心决策：
- task 定位为通用执行引擎（不是"本地发送任务调度"）
- TaskStepDefinition 多态化：send / wait-condition / delay
- SCOE 命令 = [send-step, wait-condition-step, send-step]
- SCOE/northbound 是 task 的入口适配器，不拥有自己的执行器
- send 不变（单帧发送）

## Design 修订

Task design 大幅修订（15+ edits）：
- 定位重写、类型多态化、SCOE 升级为主要消费者、条件匹配归属 task/core
- 后续 review 修复 10 项：single/sequence 合并、TaskStepResult 类型、trigger+wait-condition 两层机制、onTimeout/errorPolicy 交互、性能约束、stepResults 有上限

Send design 小幅修订（5 edits）：compound doc 引用、SCOE 改经 task 交互、owner 表更新

Checklist 全面重写：多态 step、WaitCondition、SCOE fixture、性能检查项

## Shared 模块提取决策

经旧代码和 design 交叉分析，确定提取两个共享模块：
- shared/condition-operators/ — 比较算子（eq/neq/gt/lt/gte/lte/change/any）
- shared/timer/ — TimerRegistry（register/clear/pauseAll/resumeAll/clearGroup）

CLAUDE.md 新增 shared/ 提取规则：2+ feature 出现或明确跨 feature 基础能力时提取

## 下一步

1. 提取 shared/ 模块（已有提示词）
2. SCOE design 起草（基于修订后的 task design）
3. 更新 target-structure 和 feature-boundaries 中 task 的描述
