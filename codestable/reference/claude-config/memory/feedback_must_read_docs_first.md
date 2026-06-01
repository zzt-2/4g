---
name: 必读文档不能跳过
description: 写 handoff / 开新对话 / 做实施前必须先读规范文档，不能跳过
type: feedback
originSessionId: 8870d692-70b2-47eb-b96e-4fa9f09ac2cd
---
写 handoff、开新对话、做任何 rewrite 实施之前，必须先读 CLAUDE.md 中列出的必读文档，尤其是 `codestable/reference/session-handoff-templates.md`（决定了交接格式和结构）。不能自编格式。

**Why:** 用户在 CLAUDE.md 中反复强调"必须先读"、"不允许跳过、略读或凭记忆"，但实际执行中经常跳过。2026-05-19 写 H002 时没读 handoff 模板就自己编格式，被用户指出。

**How to apply:** 任何涉及 rewrite 的对话开头，按 CLAUDE.md "重写主线必读"列表逐个读取。写 handoff 时必须对照 session-handoff-templates.md 中的对应模板结构。
