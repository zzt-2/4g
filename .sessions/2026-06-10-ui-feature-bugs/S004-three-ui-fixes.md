# [S004] 三个 UI 修复 —— 进度计数 / 保存按钮 disable / 发送失败提示

> 2026-06-19 | 实施阶段 | 状态: 完成
> 来源: S003 续接后用户提出的三个新问题(voice.md 2026-06-19)

## 目标

修 S003 续接后用户提出的三个 UI 问题:
1. 进度计数回退(重复好几次但进度只有 1/1)
2. 编辑弹窗保存按钮 disable 导致响应式问题
3. 发送失败错误提示(鼠标悬停显示具体报错)

## 记录

### 问题 1:进度计数(核心改动)

**核查结论:不是 bug 回退,是语义分歧。** progress.ts(D002 修过的版本)按 stepIndex 去重——repeat 5 次只算 1 个 step 完成 → 显示 1/1。D002 当初去重是为修"爆表"(stepsCompleted > stepsTotal),但牺牲了 repeat 细粒度。

用户语义(D001 原话"各重复5次迭代2次每次加1 → 共15次"):进度应反映**实际发送次数**(repeat × iteration),而非 step 完成数。

**方案:双维度进度。** 保留 steps 维度(step 完成数,给"step 跑了几个"的视图用),新增 sends 维度:
- `sendsCompleted`:stepResults 中 send 且 sent 成功的行数(repeat 每次都算,不去重)
- `sendsTotal`:iteration 总数 × Σ(各 send step 每迭代发送次数)。maxCount 未定义/until 条件/iteration 无限时为 null(无法预算)

UI 消费方(TaskExecutionDetail / use-task-list / use-central-docking)优先显示 sends(sendsTotal 非 null),回退 steps。

TaskProgress 仅 computed-on-read 不持久化(已用集成测试 + agent 调查确认),改类型零迁移风险。

改动:core/types.ts(+2 字段)、core/progress.ts(resolveSendsTotal + sendsCompleted 计数)、3 处 UI 消费方。task+command-ingress 392 tests 全过(新增 7 个 sends 维度用例)。

### 问题 2:保存按钮去 disable(小改)

ExecutionListPage / TemplateListPage 编辑弹窗保存按钮有 `:disable="editor.hasErrors.value"`。hasErrors 依赖 validationIssues,而 validate() 只在 save() 内调用(无 watch 实时校验),导致 disable 状态响应式滞后/错乱。save() 本身已有 `if (!validate()) return null` 拦截,disable 冗余。去掉后点击保存即触发校验,错误通过 validationIssues 列表展示。两处同步删除。

### 问题 3:发送失败错误提示 tooltip(小改)

之前步骤状态列表里失败步骤只显示笼统"发送失败"。新增 `failureTooltipText()`:优先取 `sendResult.error.message`(具体报错),缺失时回退到 `SEND_RESULT_STATUS_MAP` 的失败 kind 标签。鼠标悬停(300ms 延迟,max-width 320px)显示。TaskExecutionDetail.vue 步骤状态行的结果 span 加 q-tooltip。

## 决策引用

- **D004(新建)**:进度双维度语义(steps + sends)。确立 sendsTotal 计算规则与 UI 优先级契约。
- D002(sends 设计的对照):D002 当时去重是为修爆表,D004 新增独立 sends 维度,与 steps 维度并存,互不干扰。
- D003(本专题前一决策,可变参数输入清空):与本轮无关。

## 范围确认

- 本轮在 scope boundary 内:是(三个都是 UI bug/feature 修复,属本专题"UI 与 Feature Bug 集中修复")。

## 后续

- 三个问题全部完成并提交(f5a193b 进度 / 0defbf7 保存按钮 / 0894437 错误提示)。
- 手动验证待用户做(重启 dev server 后):进度应显示 `x/15` 而非 `1/1`;保存按钮不再 disable;失败步骤悬停显示具体报错。
- 潜在:`use-task-list.ts` / `use-central-docking.ts` 的 `n/m` 改成 sends 后,表格行视觉变化大(1/1 → 7/15),需用户确认符合预期。
