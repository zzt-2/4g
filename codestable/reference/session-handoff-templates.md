# 会话交接文档模板

> 每个模板可直接复制到新对话开头，按 `{占位符}` 填充后使用。
> 所有模板都假设新对话没有历史上下文，必须自包含。

---

## 模板 1：Brainstorm 启动

```markdown
## 任务

我需要对 rewrite 项目的 {模块名} 做 brainstorm。需要讨论清楚：
- 要解决什么问题
- 核心行为是什么
- 明确的"不做什么"

先读以下文档获取上下文，然后开始 brainstorm 讨论。

## 必读文档

用子 agent 并行读取：

### Agent 1：规划上下文
- codestable/compound/2026-05-07-runtime-next-phase-global-planning.md（重点看和 {模块名} 相关的章节）

### Agent 2：架构约束
- codestable/architecture/rewrite-target-structure.md
- {如果涉及 platform/boundary} codestable/architecture/boundary-desktop-capability-access.md
- {如果涉及 feature 交互} codestable/architecture/rewrite-feature-interaction-matrix.md

### Agent 3：旧代码参考（如适用）
- {旧系统相关代码路径，如 src/ 下的相关 store/component/handler}

## 约束

- brainstorm 目标是定方案，不是写代码
- facts-first：先列事实和发现，再补总结
- 讨论结果需要能直接喂给 cs-feat-design 作为输入
- 不确定的点必须标出来，不猜

## 完成标准

brainstorm 结束时需要产出一个清晰的结论，包含：
1. 要做什么（核心行为描述）
2. 不做什么（边界）
3. 关键设计决策点
4. 给 design 阶段的输入清单
```

---

## 模板 2：cs-feat Design 启动

```markdown
## 任务

为 rewrite 项目的 {feature slug} 走 cs-feat design 阶段。
按 cs-feat-design skill 的流程产出 {slug}-design.md 和 {slug}-checklist.yaml。

## 直接合同

- {feature slug} 的 brainstorm 结论（如有）：codestable/features/{slug}/{slug}-brainstorm.md
- {如有 roadmap} 对应 roadmap item：codestable/roadmap/{roadmap-slug}/{roadmap-slug}-items.yaml 中的 item #{n}
- 全局规划：codestable/compound/2026-05-07-runtime-next-phase-global-planning.md 第十四节（模块拆分表）

## 边界护栏（必读）

用子 agent 并行读取：

### Agent 1：架构约束
- codestable/architecture/rewrite-target-structure.md
- codestable/quality/rewrite-quality-rules.md
- codestable/quality/rewrite-review-checklist.md

### Agent 2：Feature 边界与交互
- codestable/architecture/rewrite-feature-boundaries.md
- codestable/architecture/rewrite-feature-interaction-matrix.md
- {如果涉及跨 feature} 检查依赖的 feature 的 public API（rewrite/src/features/{dep-feature}/index.ts）

### Agent 3：旧代码参考（如适用）
- {旧系统相关代码路径}
- codestable/compound/2026-05-07-old-system-investigation-scoe-expression-visualization.md（如涉及表达式/SCOE/可视化）

### Agent 4：现有代码状态
- rewrite/src/features/{当前 feature}/ 下所有已有文件（了解骨架）
- rewrite/src/shared/ 下相关工具（确认已有什么可复用）

## 约束

- design 必须覆盖：名词层（数据结构/类型）+ 编排层（流程/交互）+ 验收契约（怎么算做完）
- 如果发现内容超出预期（checklist 步骤 > 8 或预估行数接近 1000），主动拆成两个 feature
- 所有跨 feature 交互必须通过 public API，不得直接 import 内部文件
- selector 返回值必须只读
- 使用 {cs-feat-design / cs-feat-ff} skill

## 注意

- 如果 brainstorm 阶段有未决问题，design 阶段必须解决或标注为 blocked
- 读旧代码时只提取可复用模式和需要消灭的反模式，不搬旧代码
```

---

## 模板 3：cs-feat Impl 启动

```markdown
## 任务

按 design 实现 rewrite 项目的 {feature slug}。
严格遵循 {slug}-design.md 和 {slug}-checklist.yaml，不临场扩大边界。

## 直接合同

- codestable/features/{slug}/{slug}-design.md
- codestable/features/{slug}/{slug}-checklist.yaml

## 边界护栏（必读）

- codestable/compound/2026-05-07-runtime-next-phase-global-planning.md（第十四节模块全景表）
- codestable/architecture/rewrite-target-structure.md
- codestable/quality/rewrite-quality-rules.md

## 实施前检查

开始写代码前确认：
1. 直接合同已列出 ✅
2. 覆盖哪些旧系统可观测行为：{列出}
3. 涉及哪些 feature 归口：{列出}
4. 外部是否只通过 public API 访问：{确认}
5. 是否涉及 Electron/preload/main API：{是/否}
6. 是否涉及 SCOE/指令接入/northbound/高速数据：{是/否}
7. 哪些行为可自动 fixture / 手工 checklist / runtime 验证：{列出}

## 子 agent 策略

- **独立子任务拆给 executor agent 并行**：{列出可并行的实现任务}
- **如果有多个独立文件/模块要实现**：每个拆一个 executor
- **验证阶段**：完成后派独立 verifier agent 检查

## 使用 skill

cs-feat-impl

## 约束

- 按 checklist 步骤逐条推进，每步完成后更新 checklist status
- 不临场扩大边界，遇到超出 design 范围的问题先记录，不直接实现
- 实现完成后跑 pnpm build + pnpm lint
- 实施摘要包含：Changed files / Verify evidence / Open issues
```

---

## 模板 4：cs-feat Accept 启动

```markdown
## 任务

验收 rewrite 项目的 {feature slug}。对照 design 和 checklist，逐层核对实现是否完整。

## 直接合同

- codestable/features/{slug}/{slug}-design.md
- codestable/features/{slug}/{slug}-checklist.yaml
- 实际代码改动：{git diff 或改动文件列表}

## 边界护栏

- codestable/quality/rewrite-review-checklist.md
- codestable/compound/2026-05-07-runtime-next-phase-global-planning.md（模块全景表）

## 验收流程

用独立 verifier agent 执行，不自审自验：

### Agent 1：合同对照
- 逐条核对 checklist 中所有 status: done 的步骤
- 对照 design.md 确认每个设计点都有代码对应
- 列出：已覆盖 / 未覆盖 / 部分覆盖

### Agent 2：代码质量
- pnpm build 通过？
- pnpm lint 通过？
- 测试覆盖了 design 中定义的关键行为？
- 没有 import 边界违规（不 import 其他 feature 内部文件）
- selector 返回值是只读的

### Agent 3：架构合规（如果涉及跨 feature 或 platform）
- 跨 feature 交互是否通过 public API
- runtime 是否只做接线不做判断
- main 是否没有业务逻辑

## 使用 skill

cs-feat-accept

## 验收结论格式

- pass / pass-with-known-gaps / revise-required / blocked
- 如有 known-gaps，列出具体缺口和补齐计划
```

---

## 模板 5：cs-roadmap 启动

```markdown
## 任务

为 rewrite 项目的 {roadmap 名称} 走 cs-roadmap 流程。
产出 {slug}-roadmap.md 和 {slug}-items.yaml。

## 直接合同

- 全局规划：codestable/compound/2026-05-07-runtime-next-phase-global-planning.md 第十四节
- brainstorm 结论（如有）：{brainstorm 文档路径}

## 边界护栏（必读）

用子 agent 并行读取：

### Agent 1：架构与约束
- codestable/architecture/rewrite-target-structure.md
- codestable/architecture/rewrite-feature-boundaries.md
- codestable/architecture/rewrite-feature-interaction-matrix.md

### Agent 2：依赖的 feature 状态
- 检查本 roadmap 依赖的上游 feature 是否已有 public API
- rewrite/src/features/{dep-feature}/index.ts
- 如果上游 feature 未实现，标注为 blocked

### Agent 3：旧代码参考
- {旧系统相关代码}
- codestable/compound/2026-05-07-old-system-investigation-scoe-expression-visualization.md（如适用）

## Roadmap 要求

- 每个子 feature 可独立验收
- 子 feature 之间有明确的依赖顺序
- 每个 item 说明：做什么、依赖哪个 item、产出什么、验收标准
- 总 items 数控制在 3-8 个

## 使用 skill

cs-roadmap

## 子 agent 策略

- roadmap 拆解完成后，每个 item 按模板 2（cs-feat design）启动
- 无依赖的 items 可以并行推进（用不同对话或子 agent）
```

---

## 模板 6：通用调研/摸底

```markdown
## 任务

调研 rewrite 项目中 {调研主题} 的现状，产出事实报告，不做任何设计或实施。

## 调研范围

{具体要回答的问题列表}

## 子 agent 策略

按调研维度拆分，每个 agent 独立汇报：

### Agent 1：{维度 1}
- 读：{文件列表}
- 回答：{问题列表}

### Agent 2：{维度 2}
- 读：{文件列表}
- 回答：{问题列表}

### Agent 3：{维度 3}
- 读：{文件列表}
- 回答：{问题列表}

## 汇报要求

- 中文
- facts-first：先列事实，再补总结
- 给出文件路径和行号
- 不确定的地方标注"待确认"，不猜
```

---

## 模板使用速查

| 场景 | 用哪个模板 | skill |
|------|-----------|-------|
| 想法模糊，需要讨论 | 模板 1 Brainstorm | cs-brainstorm |
| 方案清晰，开始设计 | 模板 2 Design | cs-feat-design / cs-feat-ff |
| 设计已批准，开始写代码 | 模板 3 Impl | cs-feat-impl |
| 代码写完，需要验收 | 模板 4 Accept | cs-feat-accept |
| 工作量太大，需要拆解 | 模板 5 Roadmap | cs-roadmap |
| 纯调研摸底，不写代码 | 模板 6 调研 | 无（直接执行） |
