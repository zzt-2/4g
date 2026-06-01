<!-- OMC:START -->
<!-- OMC:VERSION:4.12.0 -->

# oh-my-claudecode - Intelligent Multi-Agent Orchestration

You are running with oh-my-claudecode (OMC), a multi-agent orchestration layer for Claude Code.
Coordinate specialized agents, tools, and skills so work is completed accurately and efficiently.

<operating_principles>
- Delegate specialized work to the most appropriate agent.
- Prefer evidence over assumptions: verify outcomes before final claims.
- Choose the lightest-weight path that preserves quality.
- Consult official docs before implementing with SDKs/frameworks/APIs.
</operating_principles>

<delegation_rules>
Delegate for: multi-file changes, refactors, debugging, reviews, planning, research, verification.
Work directly for: trivial ops, small clarifications, single commands.
Route code to `executor` (use `model=opus` for complex work). Uncertain SDK usage → `document-specialist` (repo docs first; Context Hub / `chub` when available, graceful web fallback otherwise).
</delegation_rules>

<model_routing>
`haiku` (quick lookups), `sonnet` (standard), `opus` (architecture, deep analysis).
Direct writes OK for: `~/.claude/**`, `.omc/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`.
</model_routing>

<skills>
Invoke via `/oh-my-claudecode:<name>`. Trigger patterns auto-detect keywords.
Tier-0 workflows include `autopilot`, `ultrawork`, `ralph`, `team`, and `ralplan`.
Keyword triggers: `"autopilot"→autopilot`, `"ralph"→ralph`, `"ulw"→ultrawork`, `"ccg"→ccg`, `"ralplan"→ralplan`, `"deep interview"→deep-interview`, `"deslop"`/`"anti-slop"`→ai-slop-cleaner, `"deep-analyze"`→analysis mode, `"tdd"`→TDD mode, `"deepsearch"`→codebase search, `"ultrathink"`→deep reasoning, `"cancelomc"`→cancel.
Team orchestration is explicit via `/team`.
Detailed agent catalog, tools, team pipeline, commit protocol, and full skills registry live in the native `omc-reference` skill when skills are available, including reference for `explore`, `planner`, `architect`, `executor`, `designer`, and `writer`; this file remains sufficient without skill support.
</skills>

<verification>
Verify before claiming completion. Size appropriately: small→haiku, standard→sonnet, large/security→opus.
If verification fails, keep iterating.
</verification>

<execution_protocols>
Broad requests: explore first, then plan. 2+ independent tasks in parallel. `run_in_background` for builds/tests.
Keep authoring and review as separate passes: writer pass creates or revises content, reviewer/verifier pass evaluates it later in a separate lane.
Never self-approve in the same active context; use `code-reviewer` or `verifier` for the approval pass.
Before concluding: zero pending tasks, tests passing, verifier evidence collected.
</execution_protocols>

<hooks_and_context>
Hooks inject `<system-reminder>` tags. Key patterns: `hook success: Success` (proceed), `[MAGIC KEYWORD: ...]` (invoke skill), `The boulder never stops` (ralph/ultrawork active).
Persistence: `<remember>` (7 days), `<remember priority>` (permanent).
Kill switches: `DISABLE_OMC`, `OMC_SKIP_HOOKS` (comma-separated).
</hooks_and_context>

<cancellation>
`/oh-my-claudecode:cancel` ends execution modes. Cancel when done+verified or blocked. Don't cancel if work incomplete.
</cancellation>

<worktree_paths>
State: `.omc/state/`, `.omc/state/sessions/{sessionId}/`, `.omc/notepad.md`, `.omc/project-memory.json`, `.omc/plans/`, `.omc/research/`, `.omc/logs/`
</worktree_paths>

## Setup

Say "setup omc" or run `/oh-my-claudecode:omc-setup`.

<!-- OMC:END -->

# 全局个人协作偏好

以下规则跨项目通用，所有对话都应遵守。

## 协作风格

- 默认先讨论、先澄清、先锁边界，再进入执行
- facts-first / findings-first：先列事实和发现，再补总结
- 当前轮目标必须压窄，不顺手扩范围、补旧事项
- 没有新鲜验证证据，不宣称完成
- 规范书面中文

## 子 Agent 调度规则

按任务大小分级调度。主线程始终负责控场、汇总和拍板。

### 并发控制

- 一次最多同时开 3 个子 agent，不超发
- 需要开很多时，一批完成后再开下一批
- 后续批次可以利用前一批的产出来修正自己的 prompt 或范围

### 小任务（1-2 个文件，无需验证链）

主线程直接完成，不开子 agent。

### 中任务（3+ 文件，需要测试验证）

- **讨论阶段**：积极派 explore agent 并行检索相关代码和文档，不自己单线程查
- **执行阶段**：多独立任务时必须拆给 executor 子 agent 并行，不串行
- **验证阶段**：必须由独立 agent（code-reviewer / verifier）做，不自审自验

### 大任务（跨对话、跨模块、跨前后端）

- 比中任务更需要积极使用子 agent
- 每个对话内部按中任务规则执行
- 跨对话协作使用项目级的协作机制
- 典型拆分：讨论锁目标 → 规划拆任务 → 实施（1-3 个对话）→ 验证收尾

## 历史对话查阅

当用户提及之前对话的内容时，使用 `session_search` 工具按关键词搜索历史记录。
如果需要查看完整对话，用 `~/.claude/scripts/jsonl-to-md.mjs` 将 JSONL 转为可读 markdown。

## OMC 与 Superpowers 分层

- `OMC` 负责 agent 编排、team 调度、并行执行和运行时承载
- `OMC` 不是主流程，不替代项目级主流程
- `Superpowers` 只默认作为质量护栏：`test-driven-development`、`systematic-debugging`、`requesting-code-review`、`verification-before-completion`
- 不把 `Superpowers` 的完整 workflow 叠加为第二套主流程

## 自动提交规则

- **每个对话只提交一次**，在对话即将结束时（所有任务完成、准备收尾时）统一 commit
- **中途不提交**，不管完成了多少步骤、改了多少文件
- **commit 消息**：简明概括本对话完成的所有工作
- **例外**：用户明确要求提交时立即执行；对话涉及长时间运行的实验/训练时，可在实验启动前提交一次防丢失

**Why:** 碎 commit（每步一提）让 git log 噪音极大，30 次提交/3 天反而降低可读性。之前因"整块"定义模糊，实际执行成了每步一提。

## .sessions/ 专题管理

使用 `.sessions/` 目录管理跨对话的讨论、决策和交接过程。任何项目只要存在 `.sessions/` 目录就适用以下规则。

### 专题注册表

`.sessions/_registry.yaml` 是全局专题注册表。每条记录含：slug、title、status（active / dormant / closed）、created、last_updated、description。

**开新专题前必须查注册表**：若已有同方向专题且未 closed，应续旧专题而非另起炉灶。除非用户明确要求开新专题。

**开新专题时必须登记**：在 `_registry.yaml` 中新增条目。slug 格式为 `YYYY-MM-DD[-HHMM]-主题简名`。

### 编号体系（强制）

每个专题内的文件必须使用统一编号：

- `S` 前缀 = session note（讨论、决策、实施记录）
- `R` 前缀 = research note（调研、分析）
- `H` 前缀 = handoff（跨对话交接）
- 3 位递增编号：`S001`、`S002`、`R001`、`H001`...
- 文件名格式：`{前缀}{编号}-{简短描述}.md`

**禁止**使用 `NOTE-001`、`HANDOFF-001`、`handoff-v3.md`、`session-note.md`、`postmortem.md` 等无前缀或随机命名。

### 新建 vs 追加规则

- 专题起步时建 `S001-主题简述.md`
- 后续对话续接同一专题时，**默认追加到当前最后一个 S###**，不新建
- 只有以下情况才开新 S###：
  - 有大量新内容需要记录，且与当前 S### 的主题有明显区别
  - 追加会导致新旧内容冲突或理解困难（比如旧文件只需改几十行，但新内容要写上百行才能说明白）
  - 内容性质变了（S 切到 R，或反过来）
- 新开 S### 时编号 = 当前最大号 +1

### topic-index.md（每个专题必须）

每个专题**必须**有 `topic-index.md`，内容含：专题标题和状态、进展线索（按编号列出每个文件摘要）、已确认结论、未决项、当前位置。

新建专题时同步创建 `topic-index.md`。新增 session note / research note 后，若变更不大（补充细节、修措辞），直接更新上一条进展线索而非追加新条目；只有实质新阶段才新增条目。

### 专题生命周期

- `active`：正在推进
- `dormant`：暂停，可能续接
- `closed`：已完成，不再更新

续接专题时先读 `topic-index.md`，再读最新 session note / handoff。续接后更新注册表 last_updated。

### Session note 模板

每个 session note 必须包含以下锚点段落，段落内部允许自然展开。不需要的段落写"无"不要省略段落。

```markdown
# [S###] 标题

> YYYY-MM-DD | 阶段 | 状态
> （追加时新增一行日期，如 > 2026-05-18 续接）

## 目标

[本轮要完成什么]

## 记录

[正文。内容随阶段自然变：讨论进程、关键事件、决策表格、设计细节、实施日志等均可]

## 后续

[未决项、下一轮需要知道的、待观察事项等。无则写"无"]
```

### Handoff 模板

每个 handoff 必须包含以下锚点段落。不需要的段落写"无"不要省略段落。

```markdown
# Handoff: [交接主题]

> 来源: S### | 交接目标: [一句话]
> 文件名: H###-{简短描述}.md

## 已完成边界

[做了什么、当前做到哪一步]

## 不要做什么

[踩过的坑、已排除的方向、必须避免的做法]

## 必读

[下一轮对话开始时必须读的文件列表，按优先级排]

## 下一轮

[具体可执行的下一步任务]
```

## 全局禁止事项

- 不把当前轮范围外的事项顺手塞进交付物
- 不先给结论再补事实
- 不跳过验证就宣称完成
- 不执行 `git reset --hard`、`git checkout -- .`、`git restore` 等会丢弃未提交改动的命令
- 不跳过 `.sessions/_registry.yaml` 查重就开新专题
- 不在 `.sessions/` 内使用无前缀或随机命名——必须用 `S`/`R` 编号
- 不创建没有 `topic-index.md` 的 `.sessions/` 专题

@RTK.md
