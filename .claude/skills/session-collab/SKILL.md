---
name: session-collab
description: Use at the START of every non-trivial conversation — BEFORE any analysis or response. Classifies rounds into 1xx-5xx phases, enforces mandatory reads, manages session notes/handoff, and dispatches sub-agents. Also triggers mid-conversation when writing notes, creating handoff, or splitting conversations.
---

# Session Workflow

## 必读规则（不读不执行）

以下触发条件任一命中时，必须先读对应文件。跳过 = 违规。
读完才能继续当前操作。不允许"先干再看"。

| 触发条件 | 必须读 |
|----------|--------|
| 写 session note 或 topic index | [session-management.md](docs/workflow/session-management.md) 的模板段 |
| 创建 handoff 文档 | [session-management.md](docs/workflow/session-management.md) 的 Handoff 规则段 |
| 阶段收口（1xx/2xx 跨 3+ session） | [session-management.md](docs/workflow/session-management.md) 的收口流程段 |
| 拆分对话 | [session-management.md](docs/workflow/session-management.md) 的对话拆解段 |
| 跨对话衔接 | [session-management.md](docs/workflow/session-management.md) 的衔接最小清单 |
| 进入 1xx 且涉及代码改动 | [discussion-feasibility.md](docs/quality/discussion-feasibility.md) |
| 进入 feature / issue 的长期工件阶段 | [shared-conventions.md](easysdd/reference/shared-conventions.md) |
| 进入高复杂度 lane | [thesis-extension.md](easysdd/reference/thesis-extension.md) |
| 进入 2xx 高复杂度设计 | [design-phase.md](docs/workflow/design-phase.md) |
| 进入 5xx 收尾 | [session-management.md](docs/workflow/session-management.md) 的 Retro 段 |
| 派发子 agent 做代码阅读 | 本 skill 的子 agent 调度段 |

---

## 核心原则

### 主动触发

非平凡对话开始时，主动走入口判型（见下），不等用户调用。对话结束时主动检查收尾清单。

### 分层真相源

当前项目不是“单文件唯一真相源”，而是按工件类型分层：

| 类型 | 主路径 | 能放什么 | 不能放什么 |
|------|--------|----------|------------|
| 对话过程记录 | `.sessions/` | 讨论进程、决策过程、未决项、交接上下文 | 长期 feature / issue / architecture 正式工件 |
| 长期工程工件 | `easysdd/` | feature / issue / architecture / compound / shared reference | 逐轮对话推进细节 |
| 高复杂度编排工件 | `.sessions/{topic}/slices.json` + slice handoff | 多线程实施依赖、切片边界、独立审查入口 | 低中复杂度默认工作流的唯一状态 |

topic index 和 handoff 仍只做引用和提炼，不原文复制。写任何文件前先看对应层级里是否已有相同内容，有则引用不重写。

### 逐步规划

每轮只规划下一轮。远期阶段留一行占位，不预编排。详细议程只能从实际讨论中产生。

---

## 入口判型

新对话启动时的路由判断。先以代码现实和当前工件状态为事实基线，不把旧日志或目标态直接当成当前事实。

### 阶段判型

| 阶段 | 编号 | 判定条件 | 目标 |
|------|------|----------|------|
| 讨论/分析 | 1xx | 影响面不清、边界未锁、有开放分歧 | 摸清事实，不进设计 |
| 设计 | 2xx | 事实已清、需定方案、不落代码 | 形成稳定方案；低中复杂度产出 EasySDD design/checklist，高复杂度再下游切片 |
| 实施 | 3xx | 边界已锁、兼容策略已锁 | 按 design / handoff 落地实现 |
| 审查与验证 | 4xx | 实施完成、需确认质量 | 审查代码、集成验证（build + lint + 基础功能） |
| 文档更新 | 5xx | 结果需归档、spec/convention 需同步 | 更新文档 + retro 反思回顾 |

实施中重新出现开放分歧 → 退回 1xx 讨论/分析。

### 交接分支

可叠加在任何阶段上的附加状态。满足任一条即进入：

- 当前对话不宜继续
- 需要拆专题
- 需要交叉审查
- 需要换线程
- 需要压缩状态给下一轮

一旦进入，主目标从继续推进切换为产出承接材料。

### 拆分建议

满足任一条拆分信号时输出拆分方案：

- 话题切换（引入了与主线不同的新方向）
- 角色冲突（同时在 1xx 讨论和 3xx 实施）
- 上下文饱和（agent 开始遗忘或矛盾）
- 用户明确要求

同时不命中不拆信号：仍在收敛中、强依赖未解。

输出：建议拆成几个、什么顺序、哪些可以并行。拆分粒度和策略详见 [session-management.md](docs/workflow/session-management.md) 的对话拆解段。

### 当前轮能否直接进设计

进入 2xx 设计前必须同时满足：

1. **前序阶段已收口**：前序 1xx 讨论的未决项已全部解决，或已明确推迟并记录在 session note 中（不能假装没看到未决项就跳过）
2. **全面检索已完成**（同专题已有 3+ 讨论文档时）：分批调用子 agent（每批 2-3 个，总计至少 7-8 个），扫描已有 note、convention、quality、代码现状、历史日志、外部实践，补遗漏、验判断、找盲区
3. **讨论收口已完成**（讨论阶段跨 3+ session 时）：已产出讨论收口 note（全量决策 + 完整影响范围），用户已确认，前序 note 已归档
4. **可行性硬检查已通过**：涉及代码改动的决策，`docs/quality/discussion-feasibility.md` 中的 B1/B2/B3 三项硬检查全部通过。不涉及代码改动时标注豁免
5. **6 问覆盖检查已完成**：6 个覆盖问题全部回答（含"不适用"标注），无未解决的待定项

任一条件不满足，不能进 2xx 设计。

### 当前轮能否直接实施

以下任一条为真时不能进 3xx 实施：影响面不清、边界未锁、兼容策略未锁、仍有开放分歧、设计阶段跨 3+ session 但没有设计收口 note、跨模型设计审查未通过。

### 规划深度控制

当前轮结束时，**只输出下一轮的具体安排**。更远的阶段在 topic index 里留一行占位（如"设计阶段：待讨论"），不预先编排详细议程。

详细议程只能从实际讨论中产生。agent 不能在没有讨论的情况下自己编排后续阶段"讨论什么"。

---

## 目录结构

```
easysdd/
  architecture/                  <- 长期架构工件
  features/                      <- feature 设计 / checklist / acceptance
  issues/                        <- issue report / analysis / fix-note
  compound/                      <- learning / trick / decision / explore
  reference/                     <- shared-conventions + thesis extension

.sessions/
  YYYY-MM-DD-HHMM-简短主题/       <- 专题文件夹
    topic-index.md                 <- 可选
    S101-xxx.md                    <- session note
    handoff-S102.md                <- 可选
    slices.json                    <- 高复杂度 lane 的编排状态
    archive/                       <- 收口后归档前序 note
  _standalone/                     <- 不属任何专题的单次 note
```

- `easysdd/` 承担长期工程工件，`.sessions/` 承担过程与编排工件
- 专题文件夹是平目录，日期精确到分钟
- session note 文件名 `Sxxx-简短描述.md`，百位数表示阶段（1xx=讨论、2xx=设计、3xx=实施、4xx=审查、5xx=文档）
- 编号取当前阶段已有最大值 +1，写文件时才确定

---

## 子 agent 调度

### 默认派发原则

**代码阅读、文件扫描、事实调查类任务默认用子 agent 完成。** 主对话在做任何代码阅读前先问"这个子 agent 能做吗?"。

不派发的情况：需要整体架构判断、需要与用户交互确认、任务太简单不值得切分。

### 主线程角色

主线程是编排者和验收者，不是主力实现者。

| 主线程做 | 主线程不做 |
|----------|-----------|
| 理解目标和边界 | 自己写大段代码 |
| 切分独立工作单元 | 串行做可并行的事 |
| 给子 agent 写清晰 prompt | 替子 agent 补全边界条件 |
| 收集和验收子 agent 产出 | 盲目信任子 agent 结果 |
| 做最终判断 | 把判断权下放给子 agent |

### 子 agent prompt 最小结构

```
1. 目标：一个明确的交付物（"做完 X，产出 Y 文件"）
2. 范围：哪些文件/模块可以动，哪些不能动
3. 约束：必须遵循的现有模式、禁止事项
4. 产出：交付物的具体形式（文件路径、格式、验收标准）
5. 上下文：必读文件列表（最小集，不超过 3 个）
```

### 产出回收

子 agent 完成后主线程必须：读产出 → 验证（lsp_diagnostics / 测试）→ 对齐（符合交付标准?）→ 不盲信（不符时先诊断再决定修还是重做）。

### 依赖编排

| 情况 | 处理 |
|------|------|
| A 的产出是 B 的输入 | 等 A 完成再开 B |
| A 和 B 无依赖 | 并行派发 |
| A 和 B 有轻微依赖 | 主线程先定接口，再并行 |

---

## Session 管理详细规则

以下场景**必须先读 [session-management.md](docs/workflow/session-management.md)**，按其中规则执行：

- 写 session note（模板、各类型填写规则、写入节奏）
- 创建或维护 topic index
- 创建 handoff 文档（简单交接 vs 复杂交接、8 条核心原则）
- 阶段收口与归档（收口时机、流程、note 写法、设计收口额外要求）
- 拆分对话（拆分信号、策略、审查级别）
- 跨对话衔接（衔接最小清单、阅读量控制）
- Retro 反思回顾（5xx 收尾阶段）

不读不执行。

---

## 去重检查

写 session note、topic index、handoff 之前，先读已有文件。已有文件包含相同内容时引用不重复：
- topic index 的"已确认结论"只写一句话摘要 + 指向 note（如"单主 dataset，见 S101 决策段"）
- handoff 的"已确认判断"写"继承 Sxxx 全部已确认判断"，不逐条复制
- 长期 design / checklist / acceptance / issue 工件写在 `easysdd/`，session note 只引用路径，不复制正文
- 只写增量：新产生的结论、变更的判断、本轮特有的上下文

---

## 收尾检查

结束前检查：

1. 是否需要写 session note（非平凡对话都应留一份）
2. 是否需要交接工件（进入交接分支时）
3. 同专题内还有后续对话时，**必须**生成交接文档（handoff），不需要等用户提醒
4. 结论或实施结果与原方案有分叉时，是否需要退回更早阶段（1xx/2xx）或同步给相关对话
5. 如果有 topic index，是否需要更新
6. **去重检查**：新写的文件与已有文件是否有重复，有则改为引用

---

## 输出模板

每次入口判型至少输出：

1. **路径**：一行串起结论（如 `分析 → 先补材料 → 暂不实施`）
2. **阶段**：1xx-5xx 中的当前阶段
3. **交接**：是否进入交接分支
4. **拆分**：是否建议拆分 + 拆分方案
5. **先读**：最小必读集
6. **不做**：当前轮不要做什么（具体，不写空泛警告）
7. **收尾补**：结束前需要补什么
