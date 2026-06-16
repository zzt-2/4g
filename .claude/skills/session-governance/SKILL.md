---
name: session-governance
description: Sessions 治理保障 skill。在 session 启动、写决策、扩大范围、写/收 handoff 等 5 个关键节点触发，确保 topic-index 范围边界、D### 决策记录、V### 验证记录、YAML 契约、handoff 验证清单等治理机制被实际执行。This skill should be used when starting a session in a project with .sessions/, writing session notes that contain decisions, expanding scope beyond original goals, writing or receiving handoff documents. Also triggered by CLAUDE.md routing rules at 5 lifecycle moments.
---

# Sessions Governance

## Trigger Routing

This skill is invoked at 5 lifecycle moments. Determine the current context and run the appropriate trigger:

| Context | Trigger |
|---------|---------|
| Starting or continuing a session in a project with `.sessions/` | Trigger 1: Session Start |
| Recording a decision (new direction, overturning previous plan, failed approach) | Trigger 2: Writing a Decision |
| Current task goes beyond the session's stated goal | Trigger 3: Expanding Scope |
| Creating an H### handoff document | Trigger 4: Writing Handoff |
| Starting work based on a previous handoff | Trigger 5: Receiving Handoff |

---

## Trigger 1: Session Start

**When**: New session or continuation in a project with `.sessions/`.

### Steps

1. Read the current topic's `topic-index.md` — extract scope boundary and invariants
2. Read `.sessions/_registry.yaml` — find all `status: active` topics
3. For each active topic, check `conflicts_with` and `depends_on` against current topic
4. Output confirmation summary:

```
## Session Start Confirmation

**Current topic**: [topic slug]
**Original goal**: [from scope boundary]
**Current scope**: [from scope boundary]
**Invariants**: [list key invariants]

**Active topic conflicts**: [list or "none"]
**Dependency status**: [are depended-on topics' outputs verified?]
**User voice**: [if voice.md exists: "N 条原话映射，最近 YYYY-MM-DD 态度：…"；否则 "voice.md 未建"]

Confirm: Is this session's scope within the above boundaries?
```

5. If user says "no" or scope is outside boundaries → **BLOCK** and require scope change record (see references/scope-change.md)

### Inflation Check

Count the number of S### files in the current topic directory:
- **>=8 files**: warn — "This topic has N sessions. Confirm scope is still aligned with original goal."
- **>=15 files**: **BLOCK** — require explicit scope change record before proceeding

---

## Trigger 2: Writing a Decision

**When**: Recording a decision in a session note.

### Decision Classification

Is this a **D### decision** or just a **process note** in S###?

D### criteria (any one is sufficient):
- Affects architecture or approach direction
- Overturns a previous decision
- Defines an interface or contract
- Records a failed approach and what was ruled out
- Affects other topics or shared artifacts

If not a D###, record in S### as usual. No further action needed.

### Steps for D### Decisions

1. Read the topic's `decisions.md` (create if not exists)
2. Check if the new decision conflicts with existing active decisions → **BLOCK** if conflict without explicit justification
3. Check if the new decision supersedes an existing decision → mark old as `superseded`
4. Add new D### entry using [references/D-template.md](references/D-template.md)
5. Check if the decision implies new work scope → if yes, trigger scope expansion check (Trigger 3)
6. **Record the user/advisor voice that triggered this decision** to the topic's `voice.md` (create if not exists), per [references/voice-quote.md](references/voice-quote.md) format — 极简，原话 + `→ D###`，不加说明：
   - Triggered by user/advisor voice → log the triggering quote with `→ D###`
   - Pure technical derivation (no voice trigger) → note `触发原话: 无（技术推导）` in the D### entry as escape hatch
   - While logging, also collect this session's other attitude-bearing user quotes (per 收录边界 in voice-quote.md)
   - A D### without a voice-origin annotation is considered governance-incomplete

### Failed Approach Recording

When an approach is verified as failed, must record in D###:
- Core failure mechanism (not just "it didn't work")
- What was ruled out (what approaches are now invalid)
- Reusable parts

See [references/D-template.md](references/D-template.md) for failed approach format.

When a new proposal reuses a previously-ruled-out approach → **BLOCK** and flag conflict with the relevant D###.

---

## Trigger 3: Expanding Scope

**When**: Current task goes beyond the session's stated goal or the topic's current scope.

### Steps

1. Read `topic-index.md` scope boundary section
2. Check "明确不含" (explicitly excluded) list
3. If the new task touches "明确不含" → **BLOCK** and require:
   - Explicit user confirmation to proceed
   - Scope change record in topic-index (see references/scope-change.md)
   - Decision record in decisions.md
4. If the new task is outside current scope but not in "明确不含" → warn and suggest:
   - Add to current scope (with scope change record)
   - Split into a new topic
5. Check session count (inflation check from Trigger 1)

---

## Trigger 4: Writing a Handoff

**When**: Creating an H### document.

### Enhanced Handoff Requirements

In addition to the standard handoff template, include these sections when applicable (see references/handoff-verify.md for full format):

1. **Receiver verification checklist** (always required)
2. **Interface change list** (when handoff involves code changes — see references/contract-schema.yaml)
3. **Failure data appendix** (when handoff mentions failed approaches)
4. **Known debt declaration** (when stated principles don't match current reality)
5. **Verification threshold contract** (when handoff involves verification system)
6. **User/advisor voice quotes** (when handoff conveys user key directives/attitude/constraints) — log verbatim to the topic's `voice.md` per [references/voice-quote.md](references/voice-quote.md) format (原话 + →产出，极简)

### Steps

1. Read current session's decisions from `decisions.md` — ensure all are referenced
2. Scan for interface changes (type signatures, prompt schemas, cross-module dependencies)
3. Check for failed approaches — ensure failure data is included, not just conclusions
4. Check for known debt (principle vs reality gaps)
5. Inject verification sections from [references/handoff-verify.md](references/handoff-verify.md)
6. For interface changes, generate YAML contract entries using [references/contract-schema.yaml](references/contract-schema.yaml)

---

## Trigger 5: Receiving a Handoff

**When**: Starting work based on a previous handoff.

### Steps

1. Read the handoff document
2. Identify at least 3 factual claims in the handoff
3. Verify each claim against actual files/code
4. Record verification results:

```
## Handoff Verification

Verified claims:
- [claim 1]: [PASS/FAIL] — [evidence]
- [claim 2]: [PASS/FAIL] — [evidence]
- [claim 3]: [PASS/FAIL] — [evidence]
```

5. Check interface changes declared in handoff — are they reflected in code?
6. Check parallel output dependencies — are all dependencies resolved?
7. If any FAIL → **BLOCK** and report to user
8. Check `_registry.yaml` for `depends_on` and `conflicts_with`
9. Confirm scope hasn't violated "明确不含"

---

## Session Note Templates

### S### Enhanced Template

When writing session notes, include these anchor sections:

```markdown
# [S###] 标题

> YYYY-MM-DD | 阶段 | 状态
> （追加时新增一行日期，如 > 2026-05-18 续接）

## 目标

[本轮要完成什么]

## 记录

[正文。内容随阶段自然变：讨论进程、关键事件、决策表格、设计细节、实施日志等均可]

## 决策引用

- D###：[一句话摘要]（如果是本 session 做出的，标注"新建"）
- 无决策

## 范围确认

- 本轮是否在 scope boundary 内：是 / 否（如果否，见 scope change record）

## 后续

[未决项、下一轮需要知道的]
```

### R### Template

When writing research notes:

```markdown
# [R###] 标题

> YYYY-MM-DD | 关联：专题 slug / D###

## 调研问题

[要回答什么问题]

## 发现

[调研结果]

## 结论

[回答调研问题]

## 对决策的影响

[这些发现是否影响现有决策？是否需要新建 D###？]
```

### H### Enhanced Sections

Add to the standard handoff template (see references/handoff-verify.md for full format):

```markdown
## 接收方验证（续接对话时必须完成）

- [ ] 已读取 topic-index 的不变量段落
- [ ] 已验证本文件中的至少 3 条关键事实声称（列出验证了哪些）
- [ ] 已检查 _registry.yaml 中本专题的 depends_on 和 conflicts_with
- [ ] 已确认当前范围未违反"明确不含"

## 接口变更（如有代码改动）

[See references/contract-schema.yaml for YAML format]

## 失败数据附录（如涉及路线失败）

[See references/D-template.md for failed approach format]

## 已知债务（如原则与现实有差距）

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|

## 验证阈值（如涉及验证体系）

| 验证项 | PASS 标准 | 阈值来源 | 历史通过率 |
|--------|----------|---------|-----------|
```

### voice.md Template

每个专题可选（首次有符合收录边界的原话时创建，与 `topic-index.md` 同构，无编号辅助文件）。完整规范见 [references/voice-quote.md](references/voice-quote.md)。

```markdown
# Voice — {专题标题}

> 用户/导师原话档案，按日期。除零信息推进/应答外都收，不去重。
> 仅标 →产出(可选) 和 ⟶冲突；导师/批注标来源。原话占主体，不加说明。

## 2026-06-10（示例）
- "大空白不是不好做就是有问题" → D001
- "方向太少"
- [转述]"之前方向太少，容易找不到合适的"
- 来源:批注5 "第二章逻辑断裂，重写"

## 2026-06-14（示例）
- ⟶ "试试原创方向" 推翻 2026-06-10
```

---

## Reference Files

- [D-template.md](references/D-template.md) — D### decision record format for decisions.md
- [V-template.md](references/V-template.md) — V### verification record format for verifications.md
- [contract-schema.yaml](references/contract-schema.yaml) — YAML step contract format
- [scope-change.md](references/scope-change.md) — Scope change record format for topic-index
- [handoff-verify.md](references/handoff-verify.md) — Handoff verification section format
- [voice-quote.md](references/voice-quote.md) — User/advisor voice quote format for voice.md
