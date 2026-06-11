---
doc_type: reference
type: fix-prompt
status: active
date: 2026-05-14
summary: 三页面审计修复执行提示词。由审计报告产出，直接复制到新对话使用。
---

# 三页面审计修复执行提示词

## Lane 判定

Lane A (Fastforward)。每项修复范围明确、不跨模块、验证路径短。按优先级顺序执行即可。

## 直接合同

- 本提示词
- codestable/quality/rewrite-frontend-conventions.md（已更新 O2/C4）
- codestable/quality/rewrite-frontend-checklist.md（已更新 I 组 O2 条目）
- codestable/quality/rewrite-quality-rules.md
- codestable/reference/rewrite-frontend-quickref.md（新建速查卡）

## 边界护栏

- CLAUDE.md

## 审计背景

Send / CommandIngress / Task 三个页面已完成全面审计，发现 🔴 10 项系统性问题 + 🟡 19 项局部问题。本文档是完整的修复清单和执行指引。规范已在上一轮完成调整（O2 扩大、C4 合并语义 class 表、速查卡创建）。

## 修复清单

### P0 — 立即修复（运维可见性 + DRY 恶化根因）

#### P0-1: use-frame-preview.ts catch {} 静默吞错误

- **文件**: `rewrite/src/features/send/composables/use-frame-preview.ts`
- **行号**: ~88
- **问题**: `fullPreview` computed 内 `catch {}` 空块，帧构建 bug 完全不可见
- **修复**: 在 catch 中添加 `console.warn('frame preview failed', err)` 或将错误加入 issues 数组
- **验证**: 确认 catch 块不再为空

#### P0-2: deepClone 提取到 shared/

- **涉及文件**:
  - `rewrite/src/features/send/state/send-state.ts` (行~12)
  - `rewrite/src/features/task/state/task-state.ts` (行~14)
  - `rewrite/src/features/connection/core/clone.ts` (行~16)
- **问题**: 三处完全相同的 `deepClone` 函数（均用 structuredClone）
- **修复**:
  1. 在 `rewrite/src/shared/utils/` 下创建 `deep-clone.ts`，导出 `deepClone`
  2. 三个文件改为 `import { deepClone } from '@/shared/utils/deep-clone'`
  3. 删除各文件中的本地 `deepClone` 定义
  4. 确认 `connection/core/clone.ts` 中的其他导出不受影响（如有 `cloneConnection` 等，保留）
- **验证**: `pnpm -C rewrite build && pnpm -C rewrite lint`

#### P0-3: hexToBytes 去重

- **涉及文件**:
  - `rewrite/src/features/command-ingress/services/command-ingress-service.ts` (行~316-326)
  - `rewrite/src/features/command-ingress/core/highlight.ts` (行~85-92)
- **问题**: 两个文件各自实现了完全相同的 `hexToBytes(hex: string): number[]`
- **修复**:
  1. 在 `rewrite/src/features/command-ingress/core/` 下创建 `utils.ts`（或放在 `shared/utils/` 如果其他 feature 也可能需要）
  2. 导出共享的 `hexToBytes`
  3. 两个文件改为 import 共享版本
  4. 删除本地定义
- **验证**: `pnpm -C rewrite build && pnpm -C rewrite lint`

#### P0-4: formatElapsed 提取到 shared/

- **涉及文件**:
  - `rewrite/src/pages/TaskManagePage.vue` (行~299-309)
  - `rewrite/src/widgets/TaskExecutionDetail.vue` (行~52-62)
- **问题**: 两处完全相同的 `formatElapsed` 函数
- **修复**:
  1. 在 `rewrite/src/shared/utils/` 下创建 `format.ts`，导出 `formatElapsed`
  2. 两个文件改为 import
  3. 删除本地定义
- **验证**: `pnpm -C rewrite build && pnpm -C rewrite lint`

---

### P1 — 本迭代修复（系统性 DRY + 死代码）

#### P1-1: noopVariableProvider 去重

- **涉及文件**:
  - `rewrite/src/features/send/composables/use-frame-preview.ts` (行~14-16)
  - `rewrite/src/features/send/services/send-service.ts` (行~109-111)
- **问题**: 两处 noop/empty VariableProvider 实现
- **修复**:
  1. 在 `rewrite/src/features/send/core/` 或 `adapters/` 下定义 `NOOP_VARIABLE_PROVIDER` 常量
  2. 两处 import 同一个
- **验证**: `pnpm -C rewrite build`

#### P1-2: toActiveRow/toHistoryRow 统一

- **涉及文件**:
  - `rewrite/src/pages/TaskManagePage.vue` (行~59-83)
  - `rewrite/src/features/task/composables/use-task-list.ts` (行~10-25)
- **问题**: 两套转换逻辑并存，进度计算方式不一致（页面手动算 vs composable 用 calculateProgress）
- **修复**:
  1. 确认 `use-task-list.ts` 的 `toTaskRow`/`toHistoryRow` 使用了 `calculateProgress`
  2. 删除 `TaskManagePage.vue` 中的内联 `toActiveRow`/`toHistoryRow`
  3. 从 `use-task-list.ts` 导入并使用（或直接调用 composable）
- **验证**: 对比修复前后活动表格和历史表格的进度显示是否一致

#### P1-3: toggleFavorite 提取到 frame/

- **涉及文件**:
  - `rewrite/src/pages/SendPage.vue` (行~77-88)
  - `rewrite/src/pages/FrameListPage.vue` (行~91 附近)
- **问题**: 两处完全相同的 toggleFavorite 函数
- **修复**:
  1. 在 `rewrite/src/features/frame/composables/` 下创建 `use-toggle-favorite.ts`
  2. 导出 `useToggleFavorite()` composable，内部封装 frame 取出、clone、翻转、upsert、失败 notify 的完整逻辑
  3. 两个页面改为 import 并使用
- **验证**: `pnpm -C rewrite build && pnpm -C rewrite lint`

#### P1-4: selectedProgress 改用 calculateProgress

- **文件**: `rewrite/src/pages/TaskManagePage.vue` (行~117-126)
- **问题**: `selectedProgress` computed 内联重写了进度计算，与 `core/progress.ts` 的 `calculateProgress` 分叉
- **修复**: 改为 `import { calculateProgress } from '@/features/task/core/progress'` 并直接调用
- **验证**: 确认右侧面板进度展示字段（totalSteps/stepsCompleted/stepsFailed/stepsSkipped/elapsedMs）都正确

#### P1-5: use-task-list.ts / use-task-monitor.ts 消费或删除

- **涉及文件**:
  - `rewrite/src/features/task/composables/use-task-list.ts`
  - `rewrite/src/features/task/composables/use-task-monitor.ts`
- **问题**: 两个 composable 存在但未被 TaskManagePage 消费，页面用内联代码替代
- **修复路径 A（推荐）**: 让 TaskManagePage 消费这两个 composable（与 P1-2 合并执行）
- **修复路径 B**: 如果页面当前的内联实现更简洁，则删除这两个 composable 文件
- **决策依据**: 比较两种方案的代码量，选更简洁的
- **验证**: 确认无残留 import，`pnpm -C rewrite build` 通过

#### P1-6: evaluateFieldPreview 清理死导出

- **涉及文件**:
  - `rewrite/src/features/send/core/index.ts` (行~48)
  - `rewrite/src/features/send/index.ts` (行~37)
- **问题**: `evaluateFieldPreview` 双层导出但无外部消费者
- **修复**: 先 grep 确认无消费者，然后从两个 index.ts 中移除重导出。保留函数本身的定义（内部还在用）
- **验证**: `pnpm -C rewrite build`

#### P1-7: CommandIngressPage 7 处硬编码 px → class/UnoCSS

- **文件**: `rewrite/src/pages/CommandIngressPage.vue`
- **行号**: ~299, 345, 382, 423, 545, 560, 576
- **问题**: `style="width: 320px"` / `style="min-height: 400px"` 等 7 处硬编码像素值
- **修复**:
  - 布局容器宽度 → UnoCSS class（如 `w-80` `min-h-100`）
  - 弹窗宽度 → `rw-dialog-*` class
  - input 宽度等组件内部尺寸可接受 Quasar style prop，但应提取为命名常量
- **验证**: grep `style=".*\d+px` 确认已清理

---

### P2 — 下一迭代（组件拆分 + 状态管理改进）

#### P2-1: TaskManagePage 拆分（~1008→~200 行 + 5 子组件）

- **文件**: `rewrite/src/pages/TaskManagePage.vue`
- **拆分方案**:

| 子组件 | 职责 | 来源行数 | 预估行数 |
|--------|------|----------|----------|
| `TaskActiveTable` | 活动任务表格（列定义、slot 模板、行操作按钮） | 381-481 | ~120 |
| `TaskHistoryTable` | 历史记录表格（列定义、slot 模板、重试/删除） | 483-545 | ~80 |
| `TaskDetailPanel` | 右侧面板（created/running/terminal 三种视图） | 548-651 | ~110 |
| `TaskEditorDialog` | 编辑弹窗（基本信息+调度+步骤+高级配置） | 654-997 + 239-365 | ~380 |
| `TaskStepEditor` | 步骤编辑区（send/wait-condition/delay） | 编辑器内步骤部分 | ~180 |

- **注意**: 拆分时同步消费 use-task-list.ts / use-task-monitor.ts（P1-5）
- **验证**: `pnpm -C rewrite build && pnpm -C rewrite lint`，手工验证页面功能不变

#### P2-2: CommandIngressPage 拆分（~648 行）

- **文件**: `rewrite/src/pages/CommandIngressPage.vue`
- **拆分方案**:

| 子组件 | 职责 |
|--------|------|
| `ScoeMonitorPanel` | 监控 Tab（统计面板 + 命令日志表格） |
| `ScoeConfigPanel` | 配置 Tab（卫星表格 + 配置编辑） |
| `CentralDockingPanel` | 对接 Tab |
| `HighlightRuleDialog` | 高亮规则编辑弹窗 |
| `StatsGrid` | 统计面板展示 |

- **验证**: 同上

#### P2-3: editor composable 封装 update 方法

- **文件**: `rewrite/src/features/task/composables/use-task-editor.ts`
- **问题**: 外部通过 `editor.stopCondition.value = {...}` 直接修改内部 ref
- **修复**: 为 stopCondition/errorPolicy 等提供 `updateStopCondition()` / `updateErrorPolicy()` 方法
- **验证**: grep `editor.stopCondition.value =` / `editor.errorPolicy.value =` 确认已消除

#### P2-4: getSnapshot 增量优化

- **涉及文件**: `command-ingress/core/state.ts` + `task/state/task-state.ts`
- **问题**: 每秒全量 deepClone（structuredClone）
- **修复**: 改为字段级 getter 或增量快照，只 clone 变化部分
- **验证**: 轮询期间观察 GC 压力是否降低（非阻塞项）

---

### P3 — 顺手改

#### P3-1: SendPage onEditConfirm 用 useAsyncAction

- **文件**: `rewrite/src/pages/SendPage.vue` (行~230-244)
- **修复**: 替换手动 `isSaving` ref + try/finally 为 `executeAction('edit', ...)`

#### P3-2: onSave/onSaveAndStart 错误处理

- **文件**: `rewrite/src/pages/TaskManagePage.vue` (行~258-272)
- **修复**: 用 `executeAction` 包裹或 try/catch + `notify.error`

#### P3-3: SendTargetSelector refreshTargets 错误处理

- **文件**: `rewrite/src/features/send/components/SendTargetSelector.vue` (行~21-23)
- **修复**: 加 try/catch，失败时 `notify.error`

#### P3-4: command-ingress 静默 catch 补 log

- **文件**: `rewrite/src/features/command-ingress/services/command-ingress-service.ts`
- **行号**: ~159, ~205, ~220
- **修复**: 空 catch 块添加 `console.warn`

#### P3-5: v-for key 修正

- **SendPage**: 行~455-456，issues 用 index → 加注释说明安全或用组合 key
- **CommandIngressPage**: 行~386，DataRecord 用 timestamp_idx → 给 DataRecord 加 id
- **TaskManagePage**: 行~716, ~839，ConditionTerm 用 index → 给 ConditionTerm 加 id

#### P3-6: StatusBadge info 改 computed

- **文件**: `rewrite/src/widgets/StatusBadge.vue` (行~7)
- **修复**: `const info = props.statusMap[props.status]` → `const info = computed(() => props.statusMap[props.status] ?? { label: props.status, color: 'grey' })`

#### P3-7: Docking 面板内联 statusMap 提取

- **文件**: `rewrite/src/pages/CommandIngressPage.vue` (行~499-507)
- **修复**: 提取到 `docking-status-maps.ts` 模块级常量

#### P3-8: SCHEDULE_KIND_MAP 查找辅助函数

- **文件**: `rewrite/src/pages/TaskManagePage.vue`
- **行号**: ~413, 504, 564, 621
- **修复**: 提取 `resolveScheduleKindDisplay(kind)` 返回 `{ color, label }`

#### P3-9: selectedRows 改 computed

- **文件**: `rewrite/src/pages/SendPage.vue` (行~107-109)
- **修复**: `shallowRef + watch` 改为 `computed`

#### P3-10: command-ingress 死代码清理

- **文件**: `rewrite/src/features/command-ingress/services/command-ingress-service.ts` (行~229)
- **修复**: 删除无用的 `createHandleLoadSatelliteId(satelliteConfigs)` 调用

#### P3-11: TaskExecutionDetail inline style 消费 token

- **文件**: `rewrite/src/widgets/TaskExecutionDetail.vue` (行~147)
- **修复**: `style="background: var(--rw-color-surface-elevated)"` → 用语义 class

#### P3-12: protocol adapter 错误向上传递

- **文件**: `rewrite/src/features/command-ingress/adapters/scoe-protocol-adapter.ts` (行~108-109)
- **修复**: 通过回调或事件将解析错误传递给上层

#### P3-13: updateSendStepField unknown 类型

- **文件**: `rewrite/src/pages/TaskManagePage.vue` (行~324)
- **修复**: `value: unknown` → 根据参数 key 定义联合类型或泛型

#### P3-14: 模板 as 断言

- **文件**: `rewrite/src/pages/CommandIngressPage.vue` (行~441, 442, 452, 462)
- **修复**: 列定义绑定 SatelliteConfig 类型，让 DataTable 事件回调自动推导

#### P3-15: 模板非空断言

- **文件**: `rewrite/src/pages/TaskManagePage.vue` (行~601-603)
- **修复**: `selectedInstance!` → 在 handler 中加 null guard

---

## 执行指引

### 执行顺序

1. **P0 全部**（4 项，预估 35 分钟）→ build + lint 验证
2. **P1 全部**（7 项，预估 105 分钟）→ build + lint 验证
3. **P3 顺手改**（15 项，预估 60 分钟）→ build + lint 验证
4. **P2 拆分**（按迭代计划排期，不在本对话执行）

### P0-P1 每项修复后

- `pnpm -C rewrite build`
- `pnpm -C rewrite lint`
- 如失败，修复后再验证

### 全部完成后

- 运行 `pnpm -C rewrite test`（如有相关测试）
- 在修复文件中 grep 确认：
  - `catch {}` / `catch () {}` 无残留
  - `deepClone` 只在 shared/ 定义
  - `hexToBytes` 只在一处定义
  - `formatElapsed` 只在 shared/ 定义
  - `noopVariableProvider` / `NOOP_VARIABLE_PROVIDER` 只在一处定义
- 产出实施摘要：
  - `Changed files:` 改了什么文件、改了什么
  - `Verify evidence:` 跑了什么验证命令、结果是什么
  - `Open issues:` P2 拆分项和暂未修复的问题

### 不做什么

- 不执行 P2 拆分（下一迭代）
- 不改旧系统代码
- 不改 Electron main/preload 层
- 不改 frame/connection 页面（已审计过）
- 不改测试文件
- 不引入新依赖
