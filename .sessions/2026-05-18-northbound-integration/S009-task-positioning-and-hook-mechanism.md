# [S009] 任务定位讨论与钩子机制新发现

> 2026-06-11 | 讨论阶段 | 状态: 进行中
> 来源: S008 引出"任务定位模糊"根因问题
> 2026-06-11 续接：design 拍板 + H006 实施 s1-s4 全部完成

## 目标

澄清 task 在系统中的定位（模板 vs 实例、外封层、钩子机制），为后续持久化方案、UI 双 tab 设计、事件订阅架构拍板。这次讨论是 task feature 的**架构演进**决策，不是 bug 修复。

## 记录

### 五点定位拍板（用户原话）

| 点 | 拍板 |
|----|------|
| A 模板 vs 实例 | **模板**。任务定义是模板，存下来可复用，每次执行创建实例 |
| B 本地 vs 甲方/SCOE | **外封一层**。大唐/SCOE 都不是"另一种任务"，而是 task 外面套控制信封（preHandle/afterHandle/控制指令/上报节奏）。内核同一个 task |
| C getTestCaseAll vs setTestTask | **同概念**。甲方用例库 ↔ 我方任务模板库可双向对齐 |
| D UI 分页 | **双 tab**。Tab 1（模板管理：创建/编辑）、Tab 2（执行监控：执行/运行时编辑） |
| E 任务产物 | **钩子机制**。verdict/step 结果/TestReport 不是任务字段，是事件流。第三方模块订阅感兴趣的事件 |

### 第一批子 agent 调研结论

#### Agent 1: task feature 代码结构

- TaskDefinition 和 TaskInstanceState **类型上确实分离**（types.ts:107-176），通过 `definitionRef` 持有
- **但 service 层没有"模板"概念**：createTask 直接创建 instance（task-inst-1），definition 内嵌为配置快照
- 没有"创建模板"+"实例化执行"两步操作
- retryTask 是唯一能"复制 definition"的途径，但是从失败实例复制
- UI 上"保存"创建的是 lifecycle='created' 的实例
- 没有任何持久化代码（grep localStorage / fs 全无匹配）
- ID 自动递增，用户不能控制
- **关键洞察**：类型分离了，操作语义没分离。definition 是 instance 的配置快照，不是独立可复用资产

#### Agent 2: brainstorm + design 文档脉络

- `"不做任务模板"` 是 brainstorm 文档 `task-real-brainstorm.md:265` 的**笔误/遗漏**，从未在讨论中出现过
- 文档前面 Decision 1-9 都有理由字段，但"不做什么"列表是直接列举
- 原始定位：task 是**通用执行引擎**，触发来源是入口适配差异（rewrite-task-design.md:38-39）
- **钩子机制完全没在文档里提到**（除了内部 TaskInstanceCompletion 事件）
- 没考虑过第三方订阅 task 执行进度
- **关键洞察**：错误决策根因是 brainstorm 文档失实。钩子机制是设计盲区（明确排除 vs 没想到是两回事）

#### Agent 3: 事件通知现状

- 现有机制：**硬编码回调注入 + 延迟绑定**（feature-wiring.ts:138-193 用 stepResultHolder）
- task service 只暴露 `onStepResult` 一个回调（task-service.ts:44-52），构造时注入
- **没有任务终态事件**（onSettled 是 Promise API 不是订阅）
- **没有多订阅者支持**（只能注入一个回调）
- **没有 step 开始/失败/超时事件**（只有完成事件）
- receive event source 有标准 subscribe 模式可参考（adapters/ports.ts:8-10）
- northbound 通过 holder.current 直接赋值订阅
- **关键洞察**：要做钩子机制，需要从零构建但可参考 receive event source 模式

### 关键差距（现状 vs 期望）

| 维度 | 现状 | 用户期望 |
|------|------|---------|
| 类型 | Definition/Instance 分离 ✓ | 同 ✓ |
| 操作语义 | 创建即实例化（definition 是 instance 的快照） | 创建模板 + 实例化执行两步 |
| 持久化 | 无（刷新即丢） | 模板库可保存复用 |
| 事件 | 单回调硬编码（onStepResult） | 多订阅者钩子注册 |
| 上报 | northbound 通过 holder 注入 | 各模块公开订阅事件流 |
| UI | 创建+编辑+执行混合 | 双 tab（模板管理 / 执行监控） |
| 任务终态事件 | 无（只有 Promise onSettled） | settled/failed/stopped 事件 |

### 待讨论问题

#### 议题 1: 范围拍板

这是 task feature 的中等规模架构演进，**不是 bug 修复**。范围包括：
- 模板/实例分离（service + state 层）
- 持久化层（localStorage / fs / indexedDB？）
- 钩子机制（事件总线 / 多订阅者）
- UI 双 tab 重构

要做完一轮，工作量不小。是否确认要这轮做？

#### 议题 2: 优先级排序

四个子任务：
- a. 钩子机制（事件订阅基础设施）
- b. 模板/实例分离（service + state）
- c. 持久化层
- d. UI 双 tab

依赖关系：d 依赖 a/b/c；b 和 a 可以独立；c 依赖 b（模板都分离了才有意义持久化）。

可能顺序：a → b → c → d，或者 b → a → c → d。

#### 议题 3: 形状细化（开放问题）

**模板库形状**：
- 模板有 ID 吗？用户可见还是 UUID？
- 模板有版本吗？还是直接覆盖？
- 模板能导入导出吗？格式是 JSON？
- 模板有分类/标签/分组吗？

**实例化时机**：
- 用户在 Tab 1 选模板 → 点"运行" → 自动创建实例切到 Tab 2？
- 还是用户在 Tab 2 手动选模板创建？
- 多次实例化同一模板，实例怎么命名？

**钩子事件清单**：
- step 开始 / 完成 / 失败 / 超时（4 个？）
- task 创建 / 启动 / 暂停 / 恢复 / 停止 / 完成 / 失败（7 个？）
- 哪些是 must-have、哪些是 nice-to-have？

**钩子 API 形状**：
- `taskService.on('stepCompleted', handler)` 风格？
- `taskService.subscribe({ onStepCompleted, onSettled })` 风格？
- 多订阅者怎么去重？

**持久化范围**：
- 只持久化模板？
- 还是模板 + 活跃实例（断电恢复）？
- 还是模板 + 活跃实例 + 历史归档？

**持久化位置**：
- task feature 内（独立 storage 抽象）
- 还是独立 storage feature 统一管所有 feature 的持久化？

### 第二批子 agent 调研结论

#### Agent 4: 甲方 testCase 字段结构

- 甲方 testCase 字段丰富：id/name/isParent/children/type/runSubSys/depSubSys/depSubNe/satelliteCount/stationCount/durate/execSteps/checkPoints/inputPars/preHandle/afterHandle/fileHandle/priority 等
- 我方 TaskDefinition 缺失大量字段
- **preHandle/afterHandle 是跨系统协调钩子**（向 CMS/KPS/LPS 发指令），结构为 targetSysType+targetSysId+datas[{parId,parValue}]
- inputPars ≠ fieldVariations，是运行时参数（parId+value），不是迭代驱动

#### Agent 5: SCOE/大唐外封层形态

**重大发现**：
- 外封层**已经在 northbound + command-ingress feature 内完整实现**
- task 内核不感知外封存在，调用 task public API 完成翻译/控制/上报
- **task 不需要为此改变**
- 大唐外封：协议适配 + 输入翻译 + 输出翻译 + 控制指令 + 上报节奏 + executionPlan 调度
- SCOE 外封：协议适配 + 命令路由 + 确认帧 + 状态计数
- executionPlan 归 northbound，不归 task

**冲突点**：
- Agent 4：preHandle/afterHandle 必须在 task 内补 beforeHooks/afterHooks
- Agent 5：外封层完全在外部 feature 处理，task 保持纯粹
- 倾向 Agent 5：preHandle 在 translator 翻译成 task 的 send-step（发到 CMS），不需要 task 内置 hook

#### Agent 6: 持久化 pattern

**重大发现**：
- rewrite 已有 `runtime/persistence.ts` 统一抽象（FeaturePersistence 接口）
- 已有 `platform/files.ts` FileFacade
- 已有 `storage-local-baseline` 独立 feature（历史归档）
- 但 command-ingress 直接 localStorage，未走抽象层
- 各 feature 持久化"各自为政"，无 debounce、无 schema 版本管理

**容量评估**：
- 任务模板（100个）：2-5MB ⚠️ 接近 localStorage 5MB 上限
- 活跃实例（50个）：1-3MB
- 历史归档：不存 localStorage

**Agent 6 推荐**：
- 模板库：localStorage + JSON 导入导出
- 活跃实例：不持久化（断电恢复留作后续）
- 历史归档：复用 storage-local-baseline
- 持久化归属：**task feature 内**（不另开 storage feature）

### 6 个决策点（待用户拍板）

1. **preHandle/afterHandle 归属**：task 内 hook vs translator 翻译成 step（Agent 5 推荐）
2. **持久化技术**：localStorage vs IndexedDB vs JSON 文件（Agent 6 推荐 localStorage + JSON 导入导出）
3. **持久化归属**：task feature 内 vs 独立 storage feature（Agent 6 推荐 task 内）
4. **钩子机制范围**：只 task 内事件 vs 包括模板 CRUD 事件
5. **模板字段范围**：补哪些字段、忽略哪些
6. **模板库 UI 范围**：列表+编辑 vs 含导入导出+分类+搜索

## 后续

- ~~等用户对 6 个决策点拍板~~（已拍板）
- ~~拍板后写正式 design 文档（task-positioning-design.md）~~（已产出）
- ~~design 通过后开新对话实施~~（已实施）

---

## 续接：H006 实施 s1-s4 全部完成

> 2026-06-11 续接 | 实施阶段 | 状态: 完成

### 直接合同

- `codestable/features/rewrite-task/task-positioning-design.md`（M1-M4 设计 + 8 锁定决策）
- `codestable/features/rewrite-task/task-positioning-checklist.yaml`（s1-s4 + exit_signal + validation）

### 实施记录

#### s1 — 模板/实例分离 + DataCloneError 修复

- `core/types.ts`：新增 `TaskTemplate`、`TemplateUpdates` 接口；`TaskInstanceState` 加 optional `templateId`
- `state/task-state.ts`：新增 `templates Map` + 4 个模板状态 API（upsertTemplate/getTemplate/listTemplates/removeTemplate）
- `services/task-service.ts`：新增 6 个模板 API（createTemplate/listTemplates/getTemplate/updateTemplate/deleteTemplate/instanciateTemplate）+ `generateTemplateId()`（crypto.randomUUID + 降级）
- `composables/deep-raw.ts` 新增：Vue `toRaw` 深层递归解包，用于 composable 边界修复 DataCloneError
- `composables/use-task-editor.ts`：`buildDefinition()` 包装 `deepToRaw()`，修复保存模板/实例时 `structuredClone` 报 DataCloneError

#### s2 — 钩子机制（事件订阅）

- `core/types.ts`：新增 `TaskEventHandlers`（onStepResult/onTaskSettled/onTaskLifecycleChange）+ `Unsubscribe` 类型
- `state/task-state.ts`：新增 `subscribers Set<TaskEventHandlers>` + 内部 emit 函数；每个回调 try-catch 错误隔离；`updateInstance`/`addStepResult` 自动触发对应事件
- `services/task-service.ts`：新增 `subscribe(handlers): Unsubscribe`；移除 `options.onStepResult`
- `services/task-iteration-loops.ts`：移除 `ctx.onStepResult` 字段及所有 try-catch 块（emit 由 state 内部触发）
- `features/northbound/services/northbound-service.ts`：新增 `handleTaskSettled`；`start()`/`stop()` 内管 taskEventUnsub；`processLayers` 并行模式不再 await onSettled，顺序模式保留 await 保证次序
- `runtime/feature-wiring.ts`：移除 `stepResultHolder` 延迟绑定

#### s3 — 持久化层

- `shared/utils/debounce.ts` 新增：通用 debounce utility
- `services/task-template-storage.ts` 新增：`TaskTemplateStorage` 接口 + `createTaskTemplateStorage(kv?)`；key=`rw-task-templates`，schema v1；JSON parse 错误降级返回空
- `services/task-template-io.ts` 新增：`exportTemplates()` → Blob（pretty JSON）+ `parseImportedFile()` 带 schema 校验
- `services/task-service.ts`：options 加 `templateStorage?`；启动 loadAll 灌进 state；CRUD 后 debounce 500ms 写入

#### s4 — UI 双 tab

- `components/template-columns.ts` 新增：模板表格列定义（name/scheduleKind/tags/stepCount/updatedAt/actions）
- `composables/use-template-editor.ts` 新增：模板编辑器 composable（与 use-task-editor 并行，含 templateName/tags/tagInput + openNew/openEdit/save + addTag/removeTag）
- `components/TemplateListPage.vue` 新增：模板管理页（CRUD + 导入导出 + 标签 QChip 多选筛选 + 编辑器弹窗复用 6 个 step editor）
- `components/ExecutionListPage.vue` 新增：执行监控页（活动/历史 tab + 从模板创建弹模板选择器 + 详情面板 + 编辑器弹窗）
- `pages/TaskManagePage.vue` 重构：双 tab 容器（templates / executions）；模板页 `@instantiated` 自动切到执行 tab
- `components/task-columns.ts`：加 `templateId?` 列用于追溯
- `composables/use-task-list.ts`：`toTaskRow` 透传 `templateId`（exactOptionalPropertyTypes 安全）
- `components/task-labels.ts`：新增 `createBlankStepByKind()` 工厂，消除两个页面的 nextStepId+switch 重复

### 验证

- 226 个 task + task-integration 测试通过
- 新增/修改文件 ESLint 0 错误
- 全套 tsc 检查只剩与 use-task-editor 同类的 exactOptionalPropertyTypes 预存模式错误（不影响 esbuild 构建）

### 审查与修复

第一轮独立审查结论 `revise-required`，2 个 major + 4 个 minor。修复：

1. **TemplateListPage 搜索失效**（major）：`@update:search-model-value` 回调丢弃 payload → 改为 `onSearchChange(value: string)` 写入 `searchText.value`
2. **ExecutionListPage 详情面板 stale data**（major）：`selectedInstance` 原从缓存的 `selectedActiveRow[0]._original` 取，polling 刷新后不更新 → 改为通过 `selectedInstanceId` 从响应式 `activeRows`/`historyRows` 中按 id 实时查找
3. `:loading` 绑到导入/导出按钮，移除 `void isOperating` hack
4. `STATUS_FILTER_OPTIONS` 移到 `<script>` 模块级（O4）
5. `createBlankStepByKind` 抽到 task-labels.ts，消除两文件 nextStepId+switch 重复（O3）

### 已知限制

- 刷新后模板库还在：依赖 localStorage，需 manual 验证（已通过单元测试覆盖 storage 层）
- 模板实例化后只是切到执行 tab，不自动选中新实例（设计未强制要求）
- use-template-editor 与 use-task-editor 约 80% 重复代码，设计阶段已接受（保存/编辑状态不同，权衡为职责清晰）

### 后续

无（s1-s4 已通过审查）。下一步用户决定是否：
- 在 S008 北向任务联调中实际使用模板库
- 启动新专题讨论 preHandle/afterHandle 翻译层（S009 §6 决策点 1 未拍板）
- 启动新专题讨论历史归档接 storage-local-baseline

---

## 第二轮三 agent 审查 + 5 项修复

> 2026-06-11 续接 | 审查阶段 | 状态: 完成

### 三 agent 审查结论

| Agent | 范围 | 结论 |
|---|---|---|
| 前端规范 | s4 UI 6 个文件，逐条 Q/T/F/D/C/P/CM/O | **pass** — 33/36，4 处 nit |
| service/state 设计与精简 | s1-s3，design 形状 + 代码精简 + 边界 + 持久化 | **pass-with-known-gaps** — 4 minor |
| s2 钩子 + northbound 集成 | 订阅生命周期 + 错误隔离 + 顺序/并行 + 测试覆盖 | **pass-with-known-gaps** — 2 major |

### 5 项修复（一次性合并）

1. **`onTaskLifecycleChange` YAGNI**（minor）：未移除，加 JSDoc `Reserved for future UI/debug consumers` — 测试已覆盖，移除成本不值得
2. **storage schema mismatch 静默清空**（minor）：`task-template-storage.ts:31` `console.warn` → `console.error`，明确提示 "existing templates ignored (treat as data loss until migration is added)"
3. **`schedulePersist` 未复用 debounce**（minor）：`task-service.ts:91-103` 内联 `setTimeout+clearTimeout` → 改用 `shared/utils/debounce`，代码净减约 8 行
4. **`generateTemplateId` fallback 死代码**（minor）：`task-service.ts:27-32` 删 `Date.now+Math.random` 分支，Electron 30+ 必有 `crypto.randomUUID`
5. **`reportTaskResult` unhandled rejection**（major）：`northbound-service.ts:219` `void reportTaskResult(...)` → 加 `.catch((err) => console.error('[northbound] reportTaskResult failed', err))`，兜底 translator/getInstance/collectResult 同步阶段抛错

### 未修（可接受 gap）

- **design 与实现顺序模式措辞不一致**（s2 major）：northbound 顺序模式仍 `await options.taskService.onSettled(...)`，与 design 文字"改为事件驱动"矛盾，但实际行为正确（Promise 用于保序解锁下一节点，事件触发 reportTaskResult）。等真正迁移到事件计数器时再统一文档。
- **northbound 缺 handleTaskSettled 直测**（minor）：现有测试通过 setTestTask 间接覆盖。补直测要 mock event emit，工作量较大，暂缓。
- **4 处 nit**（前端规范）：chip 灰色映射、index key、text-negative vs rw-text-error、`w-[360px]` 任意值 — 全是视觉映射一致性优化，不阻断功能

### 验证

- 321 测试通过（task + northbound + task-integration）
- 所有变更文件 ESLint 0 错误

