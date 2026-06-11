---
name: Task core + Result design 2026-05-06
description: task core 实现完成（330 tests）、result feature design 完成
type: project
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## Task Core 实现 — DONE

21 suites / 330 tests（+81 新 task core tests），lint 通过，边界检查通过。

文件：core/types.ts + lifecycle.ts + condition-matcher.ts + progress.ts + clone.ts + fixtures/task-fixtures.ts + __tests__/task-core.spec.ts

关键：condition matcher 使用自有 ConditionMatchInput 类型，不依赖 receive 内部。

## Result Feature Design — DONE

文档：codestable/features/rewrite-result/rewrite-result-design.md + checklist.yaml

核心决策：
- result owns 内部结果事实（CaseResult、TaskResultSummary、aggregation rules）
- result 不直接消费独立 send/receive event，所有素材经 TaskInstanceCompletion + TaskStepResult 统一进入
- result ≠ report ≠ northbound，三段分离
- TaskInstanceCompletion 是 result 的唯一素材入口

Result/Report/Northbound 三层：
- result（内部事实层）→ report（文件/格式层）→ northbound（对外交付层）
- 核心原则：三段分离，不互相穿透

**Why:** task core 是 service 层实现的前置；result design 锁定了三段分离原则，后续 report/northbound design 以此为基础。
**How to apply:** 下一步是 task service/state/selectors 实现（Conversation B）。task 完成后 result 可以开始实现。
