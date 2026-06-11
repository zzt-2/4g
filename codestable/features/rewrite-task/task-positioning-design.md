# Task Positioning Design

> 2026-06-11 | 设计 | 状态: draft
> Direct contract: codestable/features/rewrite-task/task-real-design.md, codestable/features/rewrite-task/task-ui-overhaul-design.md
> Boundary guards: CLAUDE.md, codestable/quality/rewrite-frontend-conventions.md, codestable/quality/rewrite-frontend-checklist.md, codestable/quality/rewrite-review-checklist.md
> 来源: .sessions/2026-05-18-northbound-integration/S009-task-positioning-and-hook-mechanism.md

## 目标

澄清 task 在系统中的定位，将 task 从"创建即实例化"演进为"模板 + 实例化执行"模式，建立钩子机制和持久化层，配套 UI 双 tab。这是 task feature 的中等规模架构演进。

## 拍板决策（来自 S009）

| # | 决策 |
|---|------|
| 1 | task 是模板 + 实例化两层模型 |
| 2 | preHandle/afterHandle 在 northbound translator 翻译成 send-step（task 不内置 hook） |
| 3 | 持久化用 localStorage + JSON 导入导出 |
| 4 | 持久化层放 task feature 内（不另开 storage feature） |
| 5 | TaskDefinition 保守补字段（只补模板元数据，不动核心字段） |
| 6 | 钩子机制只做 task 内事件订阅（不含模板 CRUD 事件） |
| 7 | 钩子 API 是 `subscribe(handlers)` 风格，多订阅者，返回 unsubscribe |
| 8 | 模板库 UI 含列表 + 编辑 + 导入导出 + 标签筛选 |

## 改动范围

四个模块，分步独立推进：

| 模块 | 内容 | 依赖 |
|------|------|------|
| M1 模板/实例分离 | 新增 TaskTemplate 类型、template state、template service API | 无 |
| M2 钩子机制 | task service 暴露 subscribe API + 多触发点 + 移除 holder | 弱依赖 M1 |
| M3 持久化层 | template-storage + debounce + 导入导出 | 依赖 M1 |
| M4 UI 双 tab | TaskManagePage 拆分 + TemplateListPage + ExecutionListPage | 依赖 M1/M2/M3 |

## M1 模板/实例分离

### 类型设计

```ts
// task/core/types.ts 新增

export interface TaskTemplate {
  readonly templateId: string;       // UUID 自动生成
  readonly name: string;
  readonly tags: readonly string[];  // 自由文本标签
  readonly definition: TaskDefinition;
  readonly createdAt: string;        // ISO 8601
  readonly updatedAt: string;
}

// TaskDefinition 保持现状不动
// TaskInstanceState 保持现状不动
// TaskInstanceState 增加 optional templateId 用于追溯（不影响运行）
```

### service API

新增（task-service.ts）：

```ts
export interface TaskService extends TaskReader {
  // 现有 API 保持不动
  createTask(definition: TaskDefinition): TaskInstanceState;
  startTask(instanceId: string): void;
  // ... 其他现有 API

  // 新增 template API
  createTemplate(name: string, definition: TaskDefinition, tags?: string[]): TaskTemplate;
  listTemplates(): readonly TaskTemplate[];
  getTemplate(templateId: string): TaskTemplate | undefined;
  updateTemplate(templateId: string, updates: TemplateUpdates): TaskTemplate | undefined;
  deleteTemplate(templateId: string): boolean;
  instanciateTemplate(templateId: string): TaskInstanceState;  // 从模板创建实例并返回 instanceId
}

export interface TemplateUpdates {
  readonly name?: string;
  readonly tags?: string[];
  readonly definition?: TaskDefinition;
}
```

### state 改造

task-state.ts 新增：

```ts
const templates = new Map<string, TaskTemplate>();
```

与 `instances` Map 并列。templates 的 getter 同样返回 deepClone（保持不可变性约束）。

### instanciateTemplate 语义

```ts
instanciateTemplate(templateId: string): TaskInstanceState {
  const template = state.getTemplate(templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);
  // 拷贝 definition，不引用模板对象
  return createTaskInternal(template.definition, { templateId });
}
```

实例创建后与模板**完全解耦**：模板修改不影响已创建实例；实例运行不修改模板。

### 顺便修 DataCloneError

`use-task-editor.ts` 的 `buildDefinition()` 在传给 service 前，对每个 reactive 对象调 `toRaw()` 深层解包。这是 Vue 边界处理，不进 shared/deep-clone.ts（避免引 Vue 依赖）。

### 不变

- TaskDefinition 类型不动（核心字段保持）
- TaskInstanceState 类型不动（只加 optional templateId）
- createTask / startTask / pauseTask 等 API 保持
- task-builders.ts 不动
- task-iteration-loops.ts 不动

## M2 钩子机制

### 类型设计

```ts
// task/core/types.ts 新增

export interface TaskEventHandlers {
  onStepResult?: (instanceId: string, result: TaskStepResult) => void;
  onTaskSettled?: (instanceId: string, lifecycle: TaskLifecycleStatus) => void;
  onTaskLifecycleChange?: (
    instanceId: string,
    from: TaskLifecycleStatus,
    to: TaskLifecycleStatus
  ) => void;
}

export type Unsubscribe = () => void;
```

### service API

```ts
export interface TaskService {
  // 新增
  subscribe(handlers: TaskEventHandlers): Unsubscribe;
}
```

### 内部实现

task-state.ts 新增：

```ts
const subscribers = new Set<TaskEventHandlers>();

function emitStepResult(instanceId: string, result: TaskStepResult): void {
  for (const handler of subscribers) {
    try {
      handler.onStepResult?.(instanceId, result);
    } catch (error) {
      console.error('[task] onStepResult subscriber error', error);
    }
  }
}
// 类似 emitTaskSettled / emitTaskLifecycleChange
```

错误隔离：每个 subscriber 的回调用 try-catch 包裹，单个失败不影响其他。

### 触发点

| 事件 | 触发位置 |
|------|---------|
| onStepResult | task-iteration-loops.ts 的 addStepResult 之后（已有 onStepResult 调用点改造） |
| onTaskLifecycleChange | task-state.ts 的 updateLifecycle 内部，状态变化时 |
| onTaskSettled | lifecycle 变为 completed/failed/stopped 时（在 onTaskLifecycleChange 基础上派生） |

### feature-wiring 改造

移除 `stepResultHolder` 延迟绑定（feature-wiring.ts:138-193），改为：

```ts
taskService.subscribe({
  onStepResult: (id, result) => northboundService.handleStepResult(id, result),
  onTaskSettled: (id) => northboundService.handleTaskSettled(id),
});
```

订阅在 northboundService 创建后调用一次。

### northbound 改造

northbound-service.ts 新增：

```ts
handleTaskSettled(instanceId: string): void {
  // 替换当前的 await taskService.onSettled 主动轮询
  this.reportTaskResult(instanceId);
}
```

`processLayers` 不再 `await taskService.onSettled(instanceId)`，改为事件驱动。`onSettled` Promise API 可以保留（向后兼容）或标记 deprecated。

### 不变

- receive event source 的 subscribe 模式（参考但不改）
- result feature 的被动查询模式（仍是 `collectResult(instance)`）

## M3 持久化层

### 模块结构

```
features/task/
  services/
    task-template-storage.ts   // 新建
```

不放进 task-state.ts（state 是内存运行态）。不放进 task-service.ts（service 是领域 API）。独立 storage 模块。

### API

```ts
// task/services/task-template-storage.ts

export interface TaskTemplateStorage {
  loadAll(): readonly TaskTemplate[];
  saveAll(templates: readonly TaskTemplate[]): void;
}

export function createTaskTemplateStorage(): TaskTemplateStorage;
```

### 实现

```ts
const STORAGE_KEY = 'rw-task-templates';
const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly templates: readonly TaskTemplate[];
}

function loadAll(): readonly TaskTemplate[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const payload = JSON.parse(raw) as PersistedPayload;
    if (payload.version !== SCHEMA_VERSION) {
      // 后续支持 migration
      return [];
    }
    return payload.templates;
  } catch (error) {
    console.error('[task] Failed to load templates', error);
    return [];
  }
}

function saveAll(templates: readonly TaskTemplate[]): void {
  const payload: PersistedPayload = { version: SCHEMA_VERSION, templates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
```

### debounce

```ts
// task/composables/use-debounced-save.ts (or shared utility)
const debouncedSave = debounce((templates) => storage.saveAll(templates), 500);
```

每次模板变更（create/update/delete）后 debounce 500ms 写入。

### service 接 storage

```ts
// task-service 工厂
export function createTaskService(options: {
  // ... 现有 options
  templateStorage?: TaskTemplateStorage;  // 新增 optional
  onStepResult?: ...;  // M2 后改为 subscribe
}): TaskService {
  // createTemplate/updateTemplate/deleteTemplate 内部调用 storage 持久化
}
```

启动时（feature-wiring）调 `templateStorage.loadAll()` 灌进 state。

### 导入导出

```ts
// task/services/task-template-io.ts (新建)

export function exportTemplates(templates: readonly TaskTemplate[]): Blob {
  return new Blob([JSON.stringify({ version: SCHEMA_VERSION, templates }, null, 2)], {
    type: 'application/json',
  });
}

export function parseImportedFile(blob: Blob): Promise<readonly TaskTemplate[]> {
  // 解析 + 校验 schema version
  // 冲突处理：同 templateId 跳过
}
```

UI 用文件选择器和文件下载触发。

### 不持久化

- TaskInstanceState（活跃实例，刷新即丢，符合当前定位）
- 历史归档（后续接 storage-local-baseline）
- run-time step results（实时数据，量大）

## M4 UI 双 tab

### 页面结构

```
TaskManagePage.vue
  ├── QTab "模板管理" → TemplateListPage.vue
  └── QTab "执行监控" → ExecutionListPage.vue
```

TemplateListPage 和 ExecutionListPage 是 features/task/pages/ 下的新组件（或 features/task/components/ 下，根据现有约定）。

### TemplateListPage（模板管理）

布局：
- 顶部工具栏：新建模板按钮、导入按钮、导出按钮、标签筛选（QBtnToggle 多选）
- 主表格：name / tags / createdAt / updatedAt / 操作列（编辑/实例化/删除）
- 编辑器弹窗：复用现有 use-task-editor + 6 个 step editor 组件

交互：
- 新建 → 打开编辑器 → 保存（createTemplate）→ 列表刷新
- 编辑 → 打开编辑器（带初始值）→ 保存（updateTemplate）→ 列表刷新
- 实例化 → instanciateTemplate → 自动切到执行 tab
- 删除 → $q.dialog 确认 → deleteTemplate → 列表刷新
- 导入 → 文件选择 → parseImportedFile → 批量 createTemplate
- 导出 → exportTemplates → 浏览器下载

### ExecutionListPage（执行监控）

布局：
- 顶部工具栏：从模板创建按钮（弹模板选择器）
- 主表格：instanceId / templateName? / lifecycle / startedAt / 操作列（启动/暂停/恢复/停止/详情/删除）
- 实例详情面板（右侧抽屉或下方展开）：步骤进度、step 结果

交互：
- lifecycle=created 时可编辑（调 use-task-editor 编辑 definition）
- lifecycle=running/paused 时禁用编辑
- lifecycle 终态时禁用所有操作（除删除）

### 编辑器复用

use-task-editor 不动核心逻辑，新增：
- `openNewTemplate()` / `openEditTemplate(templateId)` 模式切换
- `saveTemplate()` 调 createTemplate/updateTemplate

或者新建 `use-template-editor.ts` 与 use-task-editor 并列（如果两者差异大）。倾向后者（职责清晰）。

### 不变

- 6 个 step editor 组件（SendStepEditor/WaitConditionStepEditor/...）保持
- TaskExecutionDetail.vue 保持
- task-columns.ts / history-columns.ts 保持

## 实施步骤

每步独立 design 章节、独立验收。

| Step | 模块 | 验收信号 |
|------|------|---------|
| s1 | M1 模板/实例分离 | createTemplate/listTemplates/updateTemplate/deleteTemplate/instanciateTemplate 单元测试通过；现有 task instance 流程不破；DataCloneError 修复 |
| s2 | M2 钩子机制 | taskService.subscribe API 可用；feature-wiring 移除 stepResultHolder；northbound 改用 subscribe 接事件 |
| s3 | M3 持久化层 | task-template-storage 读写循环通过；feature-wiring 启动加载模板；导入导出可循环 |
| s4 | M4 UI 双 tab | TaskManagePage 拆双 tab；模板 CRUD + 实例化 + 导入导出可用；execution tab 操作可用 |

## 规范合规检查

- [ ] 所有组件用 rw-dialog-xl / rw-text-label / rw-text-value 语义 class
- [ ] 无 inline style 消费 token
- [ ] QForm + :rules 校验
- [ ] v-for key 用 step.id/templateId/instanceId 不用 index
- [ ] options 数组 module level + as const
- [ ] 异步操作用 useAsyncAction（导入导出）
- [ ] 通知用 useNotify
- [ ] 删除操作有 $q.dialog 确认
- [ ] 列定义提取到 *-columns.ts
- [ ] shallowRef 用于大列表（模板列表）
- [ ] 持久化层 zero Vue/Pinia/Electron 依赖（纯 TS）

## 过度设计审查

- ✅ M1 TaskTemplate 是真实需求（用户拍板），不是假设
- ✅ M2 subscribe API 替换硬编码 holder，简化 wiring
- ✅ M3 storage 模块独立，task-service 不感知存储介质
- ✅ M4 双 tab 是用户明确拍板的 UI 形态
- ✅ 不引入 event bus / observable 抽象（subscribe API 够用）
- ✅ 不引入独立 storage feature（task feature 内自管）
- ✅ 不引入 task wrapper 模式（外封层已实现）

## 代码精简审查

- ✅ TaskTemplate 只加 5 字段（templateId/name/tags/createdAt/updatedAt），无多余
- ✅ TaskEventHandlers 3 个回调（onStepResult/onTaskSettled/onTaskLifecycleChange），覆盖核心场景
- ✅ TaskTemplateStorage 2 个方法（loadAll/saveAll），不细分 CRUD
- ✅ 导入导出独立模块（task-template-io.ts），不混进 storage

## 不做

- DataCloneError 之外的 bug 修复
- UI 视觉美化（等架构改完）
- 历史归档（接 storage-local-baseline 后续）
- 活跃实例持久化（断电恢复后续）
- 模板版本管理（直接覆盖）
- 模板分类树（用 tags 替代）
- preHandle/afterHandle task 内 hook（translator 处理）
- task wrapper 抽象（外封层已实现）
- inputPars 字段（fieldVariations 够用）
- 甲方字段全面补齐（保守策略）

## 后续

实施放新对话。设计文档完成后写 checklist：
- `codestable/features/rewrite-task/task-positioning-checklist.yaml`
- 4 个 step（s1-s4），每步独立 exit_signal + validation

实施完成后开审查对话，按 rewrite-review-checklist.md 走 pass / pass-with-known-gaps / revise-required / blocked。
