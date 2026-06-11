# [Agent 8] S011 05-15 部分（六页面实现 + 审计修复）验收标准与缺口提取

> 来源文件: `.sessions/2026-04-23-rewrite-main-thread/S011-ui-infrastructure-and-pages.md`
> 审计报告: `codestable/quality/ui-audit-2026-05-15.md`

---

## 问题 1: 85 文件大提交后 build/lint/test 的具体结果

### 事实

1. S011 正文在描述 `1ae3a6c`（85 文件, +8652/-1383 行）时，**没有记录该 commit 自身的 build/lint/test 结果**。session note 直接跳到后续的审计修复、对标修复和基础设施收尾。（来源: S011 第 92-131 行，`1ae3a6c` 段落）

2. 最接近的验证数据来自 S014（Runtime Real 主控对话）阶段 7 的测试/验证汇总（来源: S014 第 94-100 行）：
   - 803 tests passed（receive-real 完成后）
   - routing-tick 15 tests
   - expression-engine 330 tests
   - pnpm lint + pnpm build 通过
   - 架构审计：Feature 边界隔离 A+，0 穿透

3. 但 S014 的测试数据标注时点为"receive-real 完成后"，对应的是更早期的 baseline（803 tests），不是 85 文件大提交之后的值。85 文件大提交新增了 `feature-wiring.spec.ts`、`routing-tick.spec.ts` 改写和 `helpers.ts` 等测试文件，test 数量应有变化。

4. 后续的 UI 审计修复 commit `c94e099` 的审计文档（`ui-audit-2026-05-15.md` 第 93-101 行）在"审查验证"段落明确要求"每批次完成后运行 `pnpm -C rewrite build` + `pnpm -C rewrite lint`"，但未记录实际运行结果。

### 结论

**待确认**。85 文件大提交（`1ae3a6c`）自身没有留下 build/lint/test 通过的直接证据。最接近的证据是 S014 汇总的"pnpm lint + pnpm build 通过 + 803 tests passed"，但时点不完全对应。审计修复阶段同样没有记录实际验证结果。

### 缺口

- 缺少 `1ae3a6c` 提交后的精确 build/lint/test 截图或日志
- 缺少审计修复 commit 后的 build/lint 验证记录
- 后续的持久化层（S012）是否有重新验证，可作为间接证据，但不在本报告范围

---

## 问题 2: P0 三项是否影响数据通路

### 事实

三项 P0 问题描述（来源: `ui-audit-2026-05-15.md` 第 23-27 行）：

| # | 问题 | 位置 | 性质 |
|---|------|------|------|
| P0-1 | 任务编辑器弹窗 300+ 行未拆分、无 QForm 包裹，:rules 不生效 | TaskManagePage.vue:617-932 | UI 结构 + 表单验证缺失 |
| P0-2 | 编辑实例弹窗无 QForm，:rules 不生效 | SendPage.vue:490-516 | UI 结构 + 表单验证缺失 |
| P0-3 | 高亮规则弹窗缺 @hide 清理（editingHighlightRules 未重置） | CommandIngressPage.vue:546 | 生命周期/状态管理缺陷 |

### 分析

- **P0-1 和 P0-2**：影响的是表单校验规则（`:rules`）不生效，属于 UI 输入验证层。数据通路（service 调用、状态写入、selector 读取）不受影响 -- 用户仍然可以提交表单，只是缺少前端校验，可能传入非法值。对数据通路的完整性无阻断，但会降低输入质量防护。
- **P0-3**：`editingHighlightRules` 在弹窗关闭时未重置，属于 UI 状态泄漏。关闭弹窗再打开时会看到上一次编辑的残留数据。不影响高亮规则的数据存储和匹配逻辑。

### 结论

三项 P0 **均不影响数据通路**。全部属于 UI 交互层缺陷：
- P0-1/P0-2：前端表单校验缺失，service 层和状态管理层不受影响
- P0-3：UI 状态泄漏，高亮规则的存储和运行时匹配不受影响

### 缺口

- P0-1/P0-2 的 `:rules` 不生效意味着 service 层可能接收到未校验的数据。目前待确认 service 层自身是否有防御性校验。若无，则非法值可能写入状态。

---

## 问题 3: "10 个 feature service 层全部 100%"的证据

### 事实

1. S011 记录（来源: S011 第 217-219 行）：

   > "通过代码审查确认 10 个 feature service 层全部 100% 完整实现，零 stub/TODO/空壳。display feature 已含星座图（`projectScatter`）和波形图（`projectChartSeries`）数据投影层，缺的只是 ECharts 渲染组件。"

2. S014 阶段 7 同步记录（来源: S014 第 90 行）：

   > "确认 10 个 service 全部 100% 完成"

3. session note 中**没有**逐个 feature 列出审查结果的表格或清单。只有上述一句话式结论。

4. 代码目录验证（当前文件系统状态，12 个 feature 目录）：
   - 有 service 文件的 feature（11 个）：command-ingress, connection, display, frame, receive, result, send, settings, status, storage-local-baseline, task
   - 无 service 文件的 feature（1 个）：report（仅有 core/ 和 index.ts）
   - `.gitkeep` 不是 feature

5. 数量对不上：session note 说"10 个"，但文件系统显示 11 个 feature 有 service 文件。可能的解释：
   - report 没有独立 service 层（只有 core），被排除
   - 某个 feature（如 settings 或 storage-local-baseline）可能当时尚未被视为独立 service
   - **待确认**：S011 写"10 个"时具体指哪 10 个

### 结论

**证据不充分**。Session note 只有结论性描述（"代码审查确认...零 stub/TODO/空壳"），没有逐 feature 的审查记录、grep 结果或 TODO/stub 扫描输出。无法从 session note 中还原审查的具体过程和每个 feature 的判定细节。

### 缺口

- 缺少逐 feature 的审查清单（每个 feature 的 service 文件是否有 TODO/stub/空函数）
- 缺少自动化扫描证据（如 `grep -r "TODO\|stub\|FIXME" features/*/services/` 的输出）
- "10 个"的数量与实际 11 个有 service 的 feature 不一致，待确认计算口径
- report feature 明确没有 service 层，但 session note 未解释为何排除或包含

---

## 问题 4: SendPage P0 Bug 修复后是否有回归测试

### 事实

1. Bug 描述（来源: S011 第 221-225 行）：`SendPage.vue` 第 41 行 `direction: 'o_send'` 应为 `'send'`（FrameDirection 枚举合法值只有 `'send'` 和 `'receive'`），导致 `matchesQuery` 过滤掉所有帧，发送页帧列表始终为空。

2. 修复 commit（`978e48a`）：1 文件 2 处改动（+2/-2），将 `'o_send'` 改为 `'send'`。涉及两处：
   - 第 41 行 `refreshFrameList()` 中的过滤参数
   - 第 575 行 `FieldEditWidget` 组件的 `direction` prop

3. 回归测试情况：
   - 该 commit 只改动 `.vue` 文件，不涉及 `.spec.ts` 文件
   - Session note 未记录修复后运行过任何测试
   - Commit message 未提及测试验证

4. 这是一个 UI 层面的值错误（硬编码字符串与枚举不匹配），现有单元测试可能无法覆盖到（页面组件通常不在 Vitest 单测范围内，页面交互测试依赖手动 checklist）。

### 结论

**无回归测试证据**。修复 commit 没有附带测试文件改动，session note 没有记录修复后的验证步骤。这是 UI 组件层的硬编码字符串错误，目前项目不对此类页面组件错误做自动化测试（Vitest 覆盖的是 service/core/adapter 层），验证依赖手动操作。

### 缺口

- 缺少修复后的手动验证记录（如"确认 SendPage 帧列表正常显示"的 checklist 条目）
- 缺少对该字段与 FrameDirection 枚举一致性的自动化校验（TypeScript 类型检查可能覆盖，但 `'o_send'` 是合法 string，不一定能被类型系统捕获，取决于 FrameDirection 的定义方式）
- 如果 FrameDirection 定义为 `type FrameDirection = 'send' | 'receive'`，则 TypeScript 应能在编译期捕获 `'o_send'` 错误 -- **待确认**实际编译时是否有报错（如果有，说明该 bug 存在期间 build 未通过或有类型绕过）

---

## 汇总

| 问题 | 结论 | 证据充分度 | 缺口严重度 |
|------|------|-----------|-----------|
| Q1: build/lint/test 结果 | 无直接证据，S014 有间接证据 | 低 | 中（大提交无验证记录是流程缺口） |
| Q2: P0 是否影响数据通路 | 均不影响，全部是 UI 交互层 | 高 | 低 |
| Q3: Service 100% 证据 | 仅有结论，无逐 feature 审查记录 | 低 | 中（无法验证"零 stub"声明） |
| Q4: SendPage 回归测试 | 无测试证据 | 低 | 中（核心页面 P0 bug 无验证闭环） |
