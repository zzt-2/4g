# Agent 7: S011 UI 基础设施阶段验收标准与缺口提取

> 来源: `.sessions/2026-04-23-rewrite-main-thread/S011-ui-infrastructure-and-pages.md`
> 范围: 05-13 部分（Wave 0-4 + 审计），对应源文件第 13-87 行

---

## 问题 1: Wave 0 Task 类型重组 30 项，是否全部有测试？

### 事实

- 源文件第 17-26 行描述 Wave 0 提交 `3e9cb1b`：task-real-design 的 30 项类型重组全部落地，涉及 21 个文件，净增约 200 行。
- 列出的具体改动包括：`ScheduleDriver` discriminated union、`runTask` 统一循环、`ConditionRegistry` group 支持、`FieldVariation`/`StepRepeat`/`TimerService` 新类型、G1-G3 返回值变更。
- **S011 正文中未提及这 30 项是否逐项有测试覆盖**，也未引用测试数量或测试命令输出。

### 交叉证据

- 第 243 行"后续"部分提到"12 个 known-gap 测试（7 reconnect + 4 expression + 1 bootstrap）"，说明存在已知未覆盖的测试缺口，但这些缺口不直接对应 Wave 0 的 30 项。
- S011 标题行提到"811 tests baseline"，但这是 UI 准备前的存量，不是 Wave 0 新增。

### 结论

**待确认。** S011 未提供 30 项重组的逐项测试覆盖证据。需查看 `3e9cb1b` 提交的 diff 和对应 test 文件变更来确认。已知 12 个 known-gap 测试缺口中无一项明确指向 Wave 0 task 类型重组，但不能排除部分重组项仅做了类型变更而缺少行为测试。

---

## 问题 2: Wave 1-3 Expression 集成到 receive 的验证方式？

### 事实

- 源文件第 32 行描述："receive processor 表达式集成 — `compile -> evaluate -> mark fields` 后处理 pass 完整实现，表达式引擎正式接入 receive 数据流"。
- 提交 `7716245`，14 个文件，+484/-92 行。
- **S011 正文中未描述具体的验证方式**（如测试命令输出、新增测试数量、fixture 验证、手工检查等）。
- 第 243 行后续提到"4 expression"已知缺口测试。

### 交叉证据

- 早期 session 中提到 expression engine 自身有独立测试（见 memory 中 `project_expression_engine_status.md`），但 receive processor 集成这一步的验证方式在 S011 中无记载。
- "完整实现"是声明性描述，不是验证证据。

### 结论

**待确认。** S011 记录了 expression 集成到 receive processor 的实现事实（compile -> evaluate -> mark fields 管线），但未记录验证方式。已知存在 4 个 expression 相关 known-gap 测试，说明部分集成路径可能缺少自动化覆盖。需查看 `7716245` 提交的 test 文件变更确认。

---

## 问题 3: Wave 4 connection selectors dead surface 删除（142 行），是否导致回归？

### 事实

- 源文件第 45 行："删除 connection selectors dead surface（142 行）"，属于 Wave 4 提交 `67fe632`（5 文件，+42/-155 行）。
- **关键反转**：源文件第 57 行在后续"设计-代码对齐审计修正"（提交 `767c5ff`）中明确记录："恢复此前误删的 `status-timer.ts` 和 `connection-selectors.ts`"。

### 分析

- 这意味着 142 行 dead surface 删除操作**误删了实际仍有消费方的代码**（至少包括 `connection-selectors.ts` 和 `status-timer.ts`），在后续审计修正提交中被恢复。
- S011 未记录这个"误删 -> 恢复"过程是否引入了中间状态的回归，也未记录恢复后是否跑过完整测试。

### 结论

**存在已知回归风险，已通过恢复修复。** Wave 4 删除 142 行 dead surface 时误删了 `connection-selectors.ts` 和 `status-timer.ts`，在紧接的审计修正提交 `767c5ff` 中恢复。S011 未记录恢复后的验证证据（如测试通过、lint 通过、build 通过）。恢复操作本身说明最初的 dead surface 判断不够准确——被删代码并非真正的 dead surface。

---

## 问题 4: 设计-代码对齐审计发现的 8 个不一致，修复后是否验证？

### 事实

- 源文件第 48-57 行描述提交 `767c5ff`：8 个文件，+367/-17 行。
- 具体修复内容包括：
  - `pages-task-send-command-design.md`: Service Readiness Audit 标注、D-T5 Phase 2 标注、D-T7 术语修正、D-T10 方法签名重写
  - `pages-frame-connection-design.md`: selector 引用更新
  - `send-real-design.md`: `evaluateFieldPreview` 签名、expression API 名称、`configurable` 可选
  - `frame-real-design.md`: `legacy.ts` 路径修正
  - `frame/index.ts`: 移除死 re-export
  - 恢复误删的 `status-timer.ts` 和 `connection-selectors.ts`
- **S011 正文中未记录修复后的验证步骤**（如 `pnpm build`、`pnpm lint`、测试运行输出）。

### 分析

- 8 项修复中，前 5 项是文档对齐（修改 design doc 使其与代码一致），不涉及运行时验证。
- `frame/index.ts` 移除死 re-export 是代码变更，需验证无消费方引用被断开。
- 恢复误删文件是代码变更，需验证恢复后测试通过。
- 整体提交 `767c5ff` 是在 Wave 0-4 全部完成后、UI 页面实施前的中间态，S011 未在此处插入验证环节。

### 结论

**待确认。** 文档对齐类修复（5 项）无需运行时验证，属于自然对齐。但代码变更类修复（移除死 re-export、恢复误删文件）应有测试/lint/build 验证证据，S011 未记录。由于后续同日完成了 85 文件的大提交 `1ae3a6c`（6 页面实现），如果那次提交的 build/lint 通过，则间接覆盖了审计修正的回归验证——但这是推断而非记录的事实。

---

## 汇总

| 问题 | 结论 | 关键缺口 |
|------|------|----------|
| Wave 0 30 项测试覆盖 | 待确认 | S011 无逐项测试覆盖记录；需查 `3e9cb1b` diff |
| Expression 集成验证方式 | 待确认 | S011 仅声明"完整实现"，无验证方式记录；已知 4 个 expression known-gap |
| Dead surface 删除回归 | 已修复但有风险 | 误删已恢复，但恢复后无验证证据记录 |
| 审计 8 项修复验证 | 部分无需、部分待确认 | 文档对齐无需验证；代码变更无验证证据记录 |

### 共性模式

S011 的 05-13 Wave 0-4 + 审计部分存在一个系统性缺口：**实现和修复的描述都是声明性的（"完成"、"落地"、"修复"），但缺少对应的验证证据**（测试命令输出、build/lint 结果、测试数量变化）。这与后续 05-15 部分的风格一致——大提交 `1ae3a6c` 的 85 文件变更同样缺少验证输出记录。

### 建议的补充验证动作

1. 检查 `3e9cb1b`、`7716245`、`67fe632`、`767c5ff` 四个提交对应的 test 文件变更
2. 对这四个提交分别运行 `pnpm -C rewrite test` 确认当前测试通过
3. 特别关注 `connection-selectors.ts` 恢复后的消费方是否完整
