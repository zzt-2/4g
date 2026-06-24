# [S013] 编辑实例弹窗深度重设计

> 2026-06-19~24 | 实施 | 状态:完成
> S006 后续兑现("编辑弹窗深度讨论留待压缩上下文后")。压缩后续接实施。

## 目标

S006 把 SendPage 整体重设计做了,但编辑弹窗只做了 hex 双显 + 卡片化的初版。本轮用户明确"压缩上下文后好好讨论编辑弹窗",深度重做输入交互/信息密度/表达式呈现。

## 记录

brainstorming(澄清 6 个问题)→ spec(`docs/superpowers/specs/2026-06-19-field-edit-dialog-redesign-design.md`)→ plan(`docs/superpowers/plans/2026-06-19-field-edit-dialog-redesign.md`, 8 task)→ executing-plans(inline)。

定案(用户逐项拍板):
- **双输入框联动**(左 Dec / 右 Hex 带 `0x` 前缀)取代"单框 + 全局 Dec/Hex 切换钮"。用户原话"左 dec 右 hex"+"不用换着选"。
- **禁科学计数法**(整数定长十进制串,uint64 超 safe int 用 BigInt)。
- **全局计算按钮**(committedValues 快照 + stale 灰显)。用户原话"实时算太吵"→ 手动提交语义。
- **字段 description 删常驻改整行 hover tooltip**。用户原话"我说的备注是,每个字段下面那条,我不想要"(纠正我把 field.description 误当实例级备注)。
- **表达式公式翻译显示**(`值 = 公式`,变量→来源字段名)。用户选"翻译后人话"。
- **bytes 字段单 Hex 框**(星座图 I/Q 字节流)。
- 字段行布局**紧凑无表头**(方案 B),grid 三列。

关键技术发现(写 plan 时挖出):`evaluateConditional` 早已返回 `matchedIndex`,只是 `evaluateFieldExpressions` 丢弃了。Task 1 透传它,公式显示就能用真实命中分支。

实施 8 task 全过,后修 3 个回归(tooltip DOM 兄弟节点 bug、bytes 单框、右栏长 hex 换行)。send 测试 189/189,tsc 0 错。用户 dev server 确认功能正常。

**附带:执行监控页右栏高度问题——5 次失败,搁置**。见 D011。

## 决策引用

- D011:本次新建——flex 高度链排查方法论(q-page-container 起逐环验证)+ 5 次失败元教训

## 范围确认

- 本轮在 scope 内(S006 明确留的后续)。
- 不改发送管线/表达式求值/帧模板编辑器。

## 后续

- 执行监控页(ExecutionListPage)右栏撑开整个页面——**未解决,搁置**。5 次修复尝试全失败(min-h-0 链 / overflow 分区 / h-full / q-page-container 锁高度)。证据:body 出竖向滚动条,撑到 q-page-container 层。需浏览器 DevTools 逐层查 computed height 定位断点,纯读代码反复失败。详见 D011 避免重蹈。
- 注:S011 已把 ExecutionListPage 拆成子组件(TaskDetailPanel 等),后续排查以 S011 后的组件结构为准,不是本 S013 描述的旧结构。
