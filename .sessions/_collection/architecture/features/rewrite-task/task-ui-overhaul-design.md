# Task UI Overhaul Design

> 2026-06-11 | 设计 | 状态: draft
> Direct contract: codestable/features/rewrite-task/task-real-design.md, codestable/features/rewrite-ui-architecture/pages-task-send-command-design.md
> Boundary guards: CLAUDE.md, codestable/quality/rewrite-frontend-conventions.md, codestable/quality/rewrite-frontend-checklist.md

## 目标

修复 task 管理 UI 的全部 bug，补齐设计文档中规划但未实现的 UI 功能，将 TaskManagePage.vue 中的内联代码重构为独立组件。

## 改动范围

### Bug 修复（7+2 处）

| # | 文件 | 位置 | 当前 | 修正 |
|---|------|------|------|------|
| B1 | task-labels.ts | ADD_STEP_OPTIONS | `'o_send'` | `'send'` |
| B2 | TaskManagePage.vue | onAddStep switch | `case 'o_send'` | `case 'send'` |
| B3 | TaskManagePage.vue | updateSendStepField | `!== 'o_send'` | `!== 'send'` |
| B4 | TaskManagePage.vue | template v-if | `=== 'o_send'` | `=== 'send'` |
| B5 | TaskManagePage.vue | FieldEditWidget direction | `"o_send"` | `"send"` |
| B6 | TaskManagePage.vue | 复制上一步按钮 | `=== 'o_send'` | `=== 'send'` |
| B7 | TaskExecutionDetail.vue | formatStepResult | `case 'o_send'` / `result.kind === 'o_send'` | `'send'` |
| B8 | TaskManagePage.vue | schedule kind v-if | `'o_timer'` (待验证) | `'timer'` |
| B9 | TaskManagePage.vue | validation severity | `'o_error'` (待验证) | `'error'` |

注：`STEP_KIND_LABELS.send.icon = 'o_send'` 是 Quasar 图标名，**不改**。

### 新建组件

#### C1: FrameSelector

**位置**: `rewrite/src/features/frame/components/FrameSelector.vue`
**导出**: `features/frame/index.ts`

帧选择器，供 send step（选发送帧）和 wait-condition step（选接收帧）复用。

```ts
interface Props {
  modelValue: string | null;
  direction?: 'send' | 'receive';  // 默认不过滤
  label?: string;
  disable?: boolean;
}
interface Emits {
  'update:modelValue': [value: string | null];
}
```

数据源: `frameAssetService.listFrames({ direction })` → `{ value: id, label: name }` options。

#### C2: ConditionTermEditor

**位置**: `rewrite/src/widgets/ConditionTermEditor.vue`

单个条件编辑器，复用于 4 处：wait-condition 条件 / event schedule 条件 / exitCondition / step.repeat.until。

```ts
interface Props {
  modelValue: ConditionTerm;
  showLogicOperator?: boolean;  // 是否显示 AND/OR 切换，列表中非首项显示
  direction?: 'send' | 'receive';  // 帧过滤方向
  disable?: boolean;
}
interface Emits {
  'update:modelValue': [value: ConditionTerm];
}
```

内部结构：
1. FrameSelector（direction prop 过滤）
2. 字段选择 QSelect（依赖 frameId → `frameAssetService.listFieldReferences({ frameId })`）
3. 运算符 QSelect（options 来自 `COMPARISON_OPERATORS` 常量）
4. 阈值 QInput
5. logicOperator QBtnToggle（showLogicOperator 时显示，选项: AND/OR）

联动：frameId 变化时清空 fieldId；fieldId 变化时清空 threshold。

#### C3: SendStepEditor

**位置**: `rewrite/src/features/task/components/SendStepEditor.vue`

```ts
interface Props {
  step: SendStepConfig;
  stepName: string;
  stepIndex: number;
  hasPreviousSendStep: boolean;  // 是否显示"复制上一步"按钮
  disable?: boolean;
}
interface Emits {
  'update:step': [config: SendStepConfig];
  'update:stepName': [name: string];
  'copyPrevious': [];
}
```

内部结构：
1. 步骤名称 QInput
2. FrameSelector（direction='send'）
3. SendTargetSelector
4. FieldEditWidget（frame 选中后显示字段编辑）
5. 发送后延时 QInput（intervalAfterMs）
6. 复制上一步字段值 QBtn（条件显示）
7. **步骤重复配置**（可折叠）：
   - 重复间隔 QInput（repeat.intervalMs）
   - 最大重复次数 QInput（repeat.maxCount）
   - 终止条件列表（repeat.until: ConditionTermEditor[]）

#### C4: WaitConditionStepEditor

**位置**: `rewrite/src/features/task/components/WaitConditionStepEditor.vue`

```ts
interface Props {
  step: WaitConditionConfig;
  stepName: string;
  disable?: boolean;
}
interface Emits {
  'update:step': [config: WaitConditionConfig];
  'update:stepName': [name: string];
}
```

内部结构：
1. 步骤名称 QInput
2. 条件列表（ConditionTermEditor[]，可添加/删除）
3. 超时时间 QInput（timeoutMs）
4. 超时策略 QSelect（onTimeout: continue/skip/fail）

#### C5: DelayStepEditor

**位置**: `rewrite/src/features/task/components/DelayStepEditor.vue`

```ts
interface Props {
  step: { durationMs: number };
  stepName: string;
  disable?: boolean;
}
interface Emits {
  'update:step': [config: { durationMs: number }];
  'update:stepName': [name: string];
}
```

简单：步骤名称 + 持续时间。

#### C6: AdvancedConfigPanel

**位置**: `rewrite/src/features/task/components/AdvancedConfigPanel.vue`

```ts
interface Props {
  stopCondition?: TaskStopCondition;
  errorPolicy: TaskErrorPolicy;
  fieldVariations?: readonly FieldVariation[];
  disable?: boolean;
}
interface Emits {
  'update:stopCondition': [value: TaskStopCondition | undefined];
  'update:errorPolicy': [value: TaskErrorPolicy];
  'update:fieldVariations': [value: FieldVariation[]];
}
```

内部结构：
1. QExpansionItem（默认折叠）
2. 停止条件：最大迭代次数 + 最大持续时间
3. **退出条件**：ConditionTermEditor[]（exitCondition）
4. 失败策略 QSelect（onFailure）+ 重试次数 + 重试间隔
5. **可变参数编辑器**：FieldVariation[]
   - 每项：fieldId（QInput）+ values（多值输入，逗号分隔或逐条添加）

### 修改文件

| 文件 | 改动 |
|------|------|
| `features/frame/index.ts` | 导出 FrameSelector |
| `features/frame/components/FrameSelector.vue` | 新建 |
| `widgets/ConditionTermEditor.vue` | 新建 |
| `features/task/components/SendStepEditor.vue` | 新建 |
| `features/task/components/WaitConditionStepEditor.vue` | 新建 |
| `features/task/components/DelayStepEditor.vue` | 新建 |
| `features/task/components/AdvancedConfigPanel.vue` | 新建 |
| `features/task/components/task-labels.ts` | 修复 o_send + 新增 label |
| `features/task/composables/use-task-editor.ts` | 补 step repeat / field variation / exit condition 管理 |
| `pages/TaskManagePage.vue` | 大幅重构：修复 bug + 提取步骤编辑器为组件 + 接新组件 |
| `widgets/TaskExecutionDetail.vue` | 修复 o_send |
| `features/task/components/task-labels.ts` | 修复 ADD_STEP_OPTIONS |

### 不改

- task/core/types.ts（类型已完整）
- task/core/task-builders.ts（工厂函数已正确使用 'send'）
- task/core/lifecycle.ts、condition-matcher.ts、progress.ts（核心逻辑不动）
- task/services/task-service.ts（service API 不动）
- send/receive/frame/connection 核心逻辑

## 设计决策

### D1: FrameSelector 放 frame feature

遵循 SendTargetSelector 模式（放 features/send/components/），selector 组件归属数据源 feature，不放 widgets/。通过 feature public index.ts 导出供跨 feature 消费。

### D2: ConditionTermEditor 放 widgets

跨 feature 复用（task 的 4 处 + command-ingress + northbound），属于通用编辑器模式。

### D3: Step editor 组件化

从 TaskManagePage.vue 提取步骤编辑为独立组件，每个 step kind 一个组件。页面只负责：步骤列表渲染 + 添加/删除 + 传递数据。

### D4: Event schedule 条件复用 ConditionTermEditor

Event schedule 的触发条件和 wait-condition 使用同一个 ConditionTerm 类型，UI 复用 ConditionTermEditor。

### D5: Phase 2 功能这轮一起做

Step repeat、exitCondition、fieldVariation 虽然设计文档标 Phase 2，但用户要求一轮完成。类型已就绪，只需补 UI。

### D6: use-task-editor 扩展

composable 新增：
- `updateStepRepeat(index, repeat)` — 管理 step.repeat
- `addExitCondition()` / `removeExitCondition(index)` — 管理 stopCondition.exitCondition
- `addFieldVariation()` / `removeFieldVariation(index)` / `updateFieldVariation(index, variation)` — 管理 fieldVariations

## 实施步骤

1. **Bug 修复**: B1-B9 全部修正
2. **FrameSelector**: 新建 + 导出
3. **ConditionTermEditor**: 新建 + COMPARISON_OPERATORS label map
4. **task-labels.ts**: 补充新 label（repeat、exit condition、field variation 相关）
5. **DelayStepEditor**: 最简单，先做验证组件模式
6. **WaitConditionStepEditor**: 接 ConditionTermEditor
7. **SendStepEditor**: 接 FrameSelector + FieldEditWidget + repeat 配置
8. **AdvancedConfigPanel**: exitCondition + fieldVariation + errorPolicy
9. **use-task-editor.ts**: 补 repeat / exitCondition / fieldVariation 管理
10. **TaskManagePage.vue**: 替换内联代码为组件调用 + 修 event schedule 条件
11. **TaskExecutionDetail.vue**: 修复 o_send
12. **验证**: build + lint + 手工测试

## 规范合规检查

- [ ] 所有组件用 rw-dialog-xl / rw-text-label / rw-text-value 语义 class
- [ ] 无 inline style 消费 token
- [ ] QForm + :rules 校验
- [ ] v-for key 用 step.id 不用 index
- [ ] options 数组 module level + as const
- [ ] 异步操作用 useAsyncAction
- [ ] 通知用 useNotify
- [ ] 删除操作有 $q.dialog 确认
- [ ] 列提取到 *-columns.ts（已有）
- [ ] shallowRef 用于大列表

## 后续

无。本轮全部完成。
