# Handoff: Task Positioning 实施

> 来源: S009 | 交接目标: 按 design + checklist 实施 task 模板/实例分离 + 钩子机制 + 持久化层 + UI 双 tab
> 文件名: H006-task-positioning-handoff.md

## 已完成边界

- 设计文档已写好：`codestable/features/rewrite-task/task-positioning-design.md`
- Checklist 已写好：`codestable/features/rewrite-task/task-positioning-checklist.yaml`
- 8 个核心决策已拍板（详见 design 拍板决策表）
- 第一批 3 个 + 第二批 3 个子 agent 调研完成，关键事实已固化在 S009
- 外封层（northbound + SCOE）已确认不需要 task 改变（Agent 5 结论）
- 持久化基础设施已确认（runtime/persistence.ts + localStorage pattern）

## 不要做什么

- 不改 TaskDefinition 核心字段（保持 id/name/steps/schedule/stopCondition/fieldVariations/errorPolicy）
- 不改 TaskInstanceState 现有字段（只加 optional templateId）
- 不改 task-builders.ts / lifecycle.ts / condition-matcher.ts / progress.ts 核心逻辑
- 不改 send/receive/frame/connection/result 核心逻辑
- 不在 shared/deep-clone.ts 引 Vue 依赖（DataCloneError 修在 composable 边界）
- 不引入 event bus / observable 抽象（subscribe API 够用）
- 不引入独立 storage feature（task feature 内自管）
- 不引入 task wrapper 模式（外封层已实现）
- 不做历史归档（接 storage-local-baseline 后续）
- 不做活跃实例持久化（断电恢复后续）
- 不补 inputPars 字段（fieldVariations 够用）
- 不全面补齐甲方字段（保守策略，详见 design 不做清单）
- 不做 preHandle/afterHandle task 内 hook（translator 处理）
- 不做 UI 视觉美化（等架构改完）
- 不做模板版本管理（直接覆盖）
- 不做模板分类树（用 tags 替代）
- 不引入第三方 UI 库
- 不用 inline style 消费 token
- 不用 index 做 v-for key

## 必读

按顺序读：

1. `codestable/features/rewrite-task/task-positioning-design.md` — 直接合同
2. `codestable/features/rewrite-task/task-positioning-checklist.yaml` — 实施步骤
3. `.sessions/2026-05-18-northbound-integration/S009-task-positioning-and-hook-mechanism.md` — 拍板过程 + 6 个子 agent 调研结论
4. `codestable/quality/rewrite-frontend-conventions.md` — 前端规范
5. `codestable/quality/rewrite-frontend-checklist.md` — 前端自检
6. `codestable/reference/rewrite-frontend-quickref.md` — 速查卡
7. 当前实现（对照参考）：
   - `rewrite/src/features/task/core/types.ts`
   - `rewrite/src/features/task/state/task-state.ts`
   - `rewrite/src/features/task/services/task-service.ts`
   - `rewrite/src/features/task/core/task-iteration-loops.ts`
   - `rewrite/src/pages/TaskManagePage.vue`
   - `rewrite/src/features/task/composables/use-task-editor.ts`
   - `rewrite/src/runtime/feature-wiring.ts`
   - `rewrite/src/features/northbound/services/northbound-service.ts`
8. 复用参考：
   - `rewrite/src/features/task/adapters/ports.ts`（receive event source subscribe 模式）
   - `rewrite/src/runtime/persistence.ts`（FeaturePersistence 抽象）
   - `rewrite/src/features/command-ingress/composables/use-central-docking.ts`（localStorage pattern）
   - `rewrite/src/widgets/ConditionTermEditor.vue`（widget 组件模式）

## 关键设计决策（已拍板，不要改）

### 模板/实例分离
1. TaskTemplate 5 字段：templateId（UUID 自动生成）/name/tags/definition/createdAt/updatedAt
2. instanciateTemplate 拷贝 definition，实例与模板完全解耦（修改模板不影响已创建实例）
3. TaskInstanceState 加 optional templateId 用于追溯（不影响运行）

### 钩子机制
4. 钩子 3 事件：onStepResult / onTaskSettled / onTaskLifecycleChange
5. 钩子 API 是 subscribe(handlers): Unsubscribe，多订阅者，错误隔离
6. 移除 feature-wiring 的 stepResultHolder 延迟绑定

### 持久化
7. localStorage key: rw-task-templates，schema version: 1
8. debounce 500ms 写入
9. 导入冲突：同 templateId 跳过
10. 活跃实例不持久化（断电恢复留作后续）

### UI
11. 双 tab：模板管理（CRUD + 导入导出 + 标签筛选）+ 执行监控（活跃实例 + 详情面板）
12. use-template-editor 与 use-task-editor 并列（职责清晰）
13. 实例化后自动切到执行 tab
14. DataCloneError 修在 use-task-editor.ts 的 buildDefinition（toRaw 深层解包）

## 下一轮

按 checklist s1 → s4 顺序实施。每步完成后标 done，独立验收。

- **s1 完成后**可单独交付：template API 可用，instance 流程不破，DataCloneError 修复
- **s2 完成后**可单独交付：事件订阅 API 可用，northbound 改造完成
- **s3 完成后**可单独交付：持久化可用，模板刷新不丢
- **s4 完成后**整轮完成：UI 双 tab 可用

任一步 fail 不阻塞其他步的 design（独立性已分析）。

实施完成后开审查对话，按 `rewrite-review-checklist.md` 走 pass / pass-with-known-gaps / revise-required / blocked。
