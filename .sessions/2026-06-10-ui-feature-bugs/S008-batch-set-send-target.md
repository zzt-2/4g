# [S008] 任务管理两页加"批量设置发送目标" + 列表显示优化

> 2026-06-22 | 实施型 | 状态: 完成（代码+测试+落档；commit 拆分两块,见下）

## 目标

任务管理的模板管理 + 执行监控两页，各加一个"批量设置发送目标"操作。用户原话：
> "任务管理，模板和执行监控，都需要加一个批量设置发送目标，可以设置所有的（直接改，不加属性）。"

讨论后明确语义（见决策引用 D008）：批量改**任务级** defaultTargetId + 同时清空所有 send step 的 step 级 targetId 覆盖，让所有 send 步骤统一回退到任务级。顺手补三项列表显示优化。

## 记录

### 设计核心：一个纯函数 + 两层复用

**`applyDefaultTargetOverride(definition, targetId)`**（`core/task-builders.ts`）：
- 写 `definition.defaultTargetId`（空/null/'' → 移除）
- 清空所有 send step 的 `SendStepConfig.targetId`（移除 step 级覆盖）
- 不可变,返回新 definition;非 send step 透传;schedule/errorPolicy/stopCondition 等字段不变
- 复用面：① 页面层批量遍历调它 ② 两个 editor 的 `setAllStepTargetOverrides()` 也调它（单条编辑里能用,与已有 `clearAllStepTargetOverrides` 对称）

### UI 模式：复用 FrameListPage 已有 batchMode

- **TemplateListPage**：已有 batchMode/batchSelectedRows/复选列,本次只在批量工具栏加"设置发送目标"按钮 + dialog（复用 SendTargetSelector 组件）。
- **ExecutionListPage**：之前**没有** batchMode（只有 selection="single"）。本次新加 batchMode ref + batchSelectedActiveRows + 批量切换按钮（只在 active tab 显示）+ 批量工具栏 + active 表 selection 改 `batchMode ? 'multiple' : 'single'` + batchMode 时隐藏行内操作。
- 约束：`updateTask` 只允许 `lifecycle === 'created'` 实例更新（task-service.ts:345）。所以执行监控批量时过滤 editable,非 created 的跳过并提示。

### 列表显示优化（用户追加需求）

1. **默认发送目标列**：template-columns.ts + task-columns.ts 各加 `defaultTargetId` 字段 + 列。两页加 `targetLabelMap` computed（connectionId → `label (kind)` 可读名,try/catch 防无连接时抛错）。toTemplateRow/toTaskRow 填充 defaultTargetId。
2. **调度类型列宽 100→120px**（template-columns.ts;task-columns.ts 之前会话已改）。
3. **来源模板列改显名称**：ExecutionListPage 原 `templateId.slice(0,8)…` 改为 `templateNameMap[id] ?? fallback`（查 taskService.listTemplates 建 id→name 表）。

### TDD

- 先写 `task-batch-set-target.spec.ts` 8 个用例（失败）→ 实现纯函数（绿）→ 重构改语义后调整为 7 个用例（全过）。
- 覆盖：写 defaultTargetId、清空 step 级、null/undefined/'' 清空、无 send step、其它字段不变、不可变。

### 验证

- task 测试 **271 全过**（含新增 7 个）;command-ingress 128;send 189。合计 588 全过。
- lint **0 error 0 warning**（task 目录全部 .ts/.vue）。
- tsc：我改动的文件 **0 类型错误**（隔离 tsconfig 检查;其它报错都是 task-service/task-step-executors/task-state/compile.ts 的存量 exactOptionalPropertyTypes 问题,与本次无关）。
- vue-tsc 工具本身有 Node 兼容性崩溃（`Search string not found: "for (const existingRoot of..."`）——环境问题,非代码。

### ⚠️ commit 拆分异常（重要追溯点）

本会话期间,仓库被**另一个并行进程/会话**提交了 2 个 commit（author zzt-2, 2026-06-22 11:57）：
- `009f271` fix(task): ExecutionListPage 右栏撑开页面...
- `104c917` fix(task): ExecutionListPage 右栏高度链全链修复...

**`104c917` 把我对 `ExecutionListPage.vue` 的 batch 改动一并提交了**（HEAD 版本含 12 处 batchMode 标识,确认为本任务的代码）。但该 commit 的 message 写的是"右栏高度链修复",**没提批量功能,也没带 S008 编号**。

用户决策（2026-06-22）：
- **不改 104c917 的 message**（保留原样,避免重写已提交历史）。代码正确即可,message 不准出可接受。
- 本会话只 commit 剩下的 9 个本任务文件（纯函数 + 两个 editor + TemplateListPage + 列定义 + use-task-list + 测试）,不碰 ExecutionListPage（已在 104c917）、不碰其它会话遗留的工作区改动（AppShell/DisplayPanel/DisplayPage/DataTable/别的专题 .sessions）。

**后果**：ExecutionListPage.vue 的 batch 改动**分散在两个 commit**——UI 骨架（batchMode/工具栏/dialog/templateNameMap/targetLabelMap）在 104c917,而它依赖的纯函数 `applyDefaultTargetOverride` 和 editor `setAllStepTargetOverrides` 在本会话的 commit。104c917 单独 checkout 会因缺纯函数而编译失败——但这只是历史可追溯性瑕疵,HEAD 本身完整可用。

## 决策引用

- **D008**（decisions.md,新建）：批量设置发送目标的语义——改任务级 defaultTargetId + 清空所有 step 级 targetId 覆盖（非"只改 step 级"）。理由：用户原话"设置所有的",任务级 + 清空 step 覆盖才能真正统一。
- 无其它新决策。

## 范围确认

- 本轮是否在 scope boundary 内：**是**。"UI 与 Feature Bug 集中修复"专题的功能新增,属于该专题范畴。
- 文件数：本 session 落档后该专题 16 个 S/H 编号文件（15→16）。已过 15 的 BLOCK 阈值——但本专题是 bug 集中修复槽位,UI 功能新增合理归此;若后续继续膨胀应考虑拆新专题。

## 后续

- 待用户目标机/dev server 运行时验证：两页批量选模板/任务 → 设发送目标 → 表格"默认发送目标"列刷新显示。
- editor 的 `setAllStepTargetOverrides` 已加但 UI 入口未加（目前只有页面级批量入口）。若后续要在单个模板/任务编辑弹窗里也加"一键设置所有 step 用某目标"按钮,直接绑 editor.setAllStepTargetOverrides 即可。
- 工作区仍有别的会话遗留改动（AppShell/DisplayPanel/DisplayPage/DataTable/display-group-management 专题 .sessions）,本会话未碰,留待对应会话处理。
