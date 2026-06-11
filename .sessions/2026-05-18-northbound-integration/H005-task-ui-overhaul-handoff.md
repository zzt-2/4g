# Handoff: Task UI Overhaul 实施

> 来源: S008 | 交接目标: 按 design + checklist 实施 TaskManagePage 全面修复和补全
> 文件名: H005-task-ui-overhaul-handoff.md

## 已完成边界

- 设计文档已写好：`codestable/features/rewrite-task/task-ui-overhaul-design.md`
- Checklist 已写好：`codestable/features/rewrite-task/task-ui-overhaul-checklist.yaml`
- Service readiness audit 通过：19/19 service API 就绪，无 gap
- 前端规范已提取：conventions / checklist / quickref 规则已审计
- 过度设计审查通过：FrameSelector 移到 frame feature 内（不放开 widgets/），ConditionTermEditor 放 widgets/
- `o_send` bug 精确定位：7 处 breaking + 2 处疑似（B1-B9）
- Phase 2 功能（step repeat / exitCondition / fieldVariation）本轮一起做

## 不要做什么

- 不改 task/core/types.ts（类型已完整）
- 不改 task/core/task-builders.ts（工厂函数已正确用 'send'）
- 不改 task/services/task-service.ts（service API 不动）
- 不改 send/receive/frame/connection 核心逻辑
- 不改 STEP_KIND_LABELS 里的 icon: 'o_send'（那是 Quasar 图标名，正确）
- 不引入第三方 UI 库
- 不用 inline style 消费 token
- 不用 index 做 v-for key
- 不在 setup() 里定义 options 数组

## 必读

按顺序读：

1. `codestable/features/rewrite-task/task-ui-overhaul-design.md` — 直接合同
2. `codestable/features/rewrite-task/task-ui-overhaul-checklist.yaml` — 实施步骤
3. `codestable/quality/rewrite-frontend-conventions.md` — 前端规范
4. `codestable/quality/rewrite-frontend-checklist.md` — 前端自检
5. `codestable/reference/rewrite-frontend-quickref.md` — 速查卡
6. 当前实现（对照参考）：
   - `rewrite/src/pages/TaskManagePage.vue`
   - `rewrite/src/features/task/composables/use-task-editor.ts`
   - `rewrite/src/features/task/components/task-labels.ts`
   - `rewrite/src/widgets/TaskExecutionDetail.vue`
7. 复用参考：
   - `rewrite/src/features/send/components/SendTargetSelector.vue` — selector 组件模式
   - `rewrite/src/widgets/FieldEditWidget.vue` — 字段编辑 widget 模式
   - `rewrite/src/features/frame/services/frame-asset-service.ts` — 数据源 API

## 关键设计决策（已拍板，不要改）

1. FrameSelector 放 `features/frame/components/`（遵循 SendTargetSelector 模式）
2. ConditionTermEditor 放 `widgets/`（跨 feature 复用 4 处）
3. Step editor 组件化：SendStepEditor / WaitConditionStepEditor / DelayStepEditor 各一个组件
4. Event schedule 条件复用 ConditionTermEditor
5. Phase 2 功能这轮一起做（repeat / exitCondition / fieldVariation）
6. use-task-editor composable 补 repeat / exitCondition / fieldVariation 管理函数

## 下一轮

按 checklist s1 → s12 顺序实施。每步完成后标 done。最终验证 build + lint + test 通过。
