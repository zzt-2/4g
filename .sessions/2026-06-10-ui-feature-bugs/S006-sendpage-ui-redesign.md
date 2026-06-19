# [S006] SendPage(帧发送页)UI 重设计 + flex 高度链陷阱修复

> 2026-06-19 | 实施 | 完成
> （讨论型任务转实施:brainstorming → spec → plan → executing-plans 全流程）

## 目标

用户反馈帧发送页三类问题:① 三栏被挤开、页面整体滚动(应各栏独立滚)② 左栏帧列表丑(高度不一/标题换行/不想要字段数)③ 实例编辑弹窗乱、无设计、无十六进制(`1acffc1d` 被转十进制乱写)。讨论拍板方向后实施。

## 记录

### 讨论阶段(brainstorming)

先用 session-governance 报到 + frontend-design skill 加载审美基线(约束在现有 SCSS token 体系内,不硬编码视觉值)。

**关键澄清**:用户说的"编辑弹窗"有歧义——代码里有两个"编辑":A 实例编辑(填发送值,SendPage 内联 dialog + FieldEditWidget)vs B 帧字段定义编辑(FrameFieldEditorDialog,改帧结构)。用户确认是 **A(实例编辑)**。

**交互模型拍板**:保留"帧模板库 + 帧实例"模型(选项 A),点帧建实例,不引入"无实例"概念。布局骨架不动。

**分段确认的设计**(spec `docs/superpowers/specs/2026-06-19-sendpage-ui-redesign-design.md`):
1. 高度链:照搬 DisplayPage 的 `q-page flex flex-col h-full` + scoped `min-height:0` 模式
2. 左栏:单行 ellipsis + 去 fieldCount + 收藏/未收藏图标区分
3. 编辑弹窗:Dec/Hex 全局切换(q-btn-toggle)+ 数值字段双显(对侧 hint)+ badge 色块→分组卡片(左侧色条)+ flex 滚动(不写死 60vh)
4. 右栏:四块水平分隔线→卡片化 + 发送区钉底 + 构建问题并入参数卡
5. 表格操作列:5 图标→编辑 + 更多菜单(用户选 a,弃拖拽)
6. 视觉层次:背景纵深 surface-app > surface-base > surface-app(原想用 surface-elevated,但发现它从未在 app.scss 定义)

**计划期发现的两坑**(已修正进 plan):
- DataTable `:style="{ maxHeight: containerHeight }"`,不传走默认死高度 → 必须显式传 `100%`
- `--rw-color-surface-elevated` 从未在 app.scss 定义(SendPage hex-preview 用了但回退透明)→ 统一改用 `surface-app`

### 实施阶段(executing-plans,inline 模式)

8 个 Task:
- T1 `numeric-field-format.ts` util(TDD,18 测试纯函数,hex/dec 转换+解析+范围校验,复用 encode.ts 解析概念)
- T2 FieldEditWidget 卡片化 + hex 双显(整文件重写)
- T3-7 合并重写 SendPage.vue(高度链/左栏/弹窗/右栏/操作列都在同一文件,分 Edit 易漂移,改一次性 Write)
- T8 回归验证

**测试 fixture 修正**:计划里 `1acffc1d` 期望值我算错成 450184733,实际 `0x1ACFFC1D = 449838109`。代码是对的,改测试。

**验证结果**:send 7 文件 176 测试全过;task+command-ingress 20 文件 392 测试全过;全套 25 个 .vue 解析失败是**预存环境问题**(e35a6a7 baseline 对照证明,改动前同样失败),净增通过;tsc 0 源码 error;样式基线扫描 0 硬编码(修正了唯一 2px→`--rw-space-0-5`);lint 我的 5 文件 0 error。

### 修复阶段:两次误判后定位真因(详见 D007)

用户实测:**高度仍被挤开、左栏 ellipsis 没生效**。

- 第1次修(Task3 期间):`q-page` h-full + min-height:0 + 表格传 100% —— 无效
- 第2次修:`.send-page` 加 height:100%+overflow:hidden,DataTable 包裹层 overflow-hidden,左栏 q-item-section min-width:0 —— **用户反馈"完全没用"**
- **转折**:对比 DisplayPage(同样 q-page flex,col,无 page 级 overflow 却能用)→ 差异在内容区:DisplayPage 是 DisplayPanel(自管高度),SendPage 是 q-table(virtual-scroll 全量渲染)+ q-list,**会撑破 flex**
- 第3次(最终):三栏及滚动区全部改 scoped CSS(照搬 DisplayPage `__panels` 的 `flex:1 1 0; min-height:0`),关键多一层 DisplayPage 不需要的 `.send-page__table-wrap { overflow:hidden }` 钳制 q-table。左栏 ellipsis 补 `:deep(.q-item__label)`。**用户确认"都好了"**。

核心教训见 **D007**(`max-height:100%` 撑开陷阱)。

### 涉及文件

- `rewrite/src/features/send/composables/numeric-field-format.ts`(新建 + 测试)
- `rewrite/src/features/send/index.ts`(导出 util)
- `rewrite/src/widgets/FieldEditWidget.vue`(卡片化 + hex)
- `rewrite/src/pages/SendPage.vue`(高度链 + 左栏 + 弹窗 + 右栏 + 操作列)
- `rewrite/src/features/send/components/instance-columns.ts`(操作列 200→80)
- spec:`docs/superpowers/specs/2026-06-19-sendpage-ui-redesign-design.md`
- plan:`docs/superpowers/plans/2026-06-19-sendpage-ui-redesign.md`

## 决策引用

- D007:新建 —— flex `max-height:100%` 撑开陷阱(失败路线记录,含两次误判 + 正确解法)
- 无其他新建决策(交互模型/卡片化/hex 双显均在本 session 拍板,属设计实现细节,记 spec 不记 D)

## 范围确认

- 本轮是否在 scope boundary 内:**是**(本专题"UI 与 Feature Bug 集中修复",帧发送页 UI 重设计属此范围)

## 后续

- **编辑弹窗深度讨论留到压缩上下文后**:用户明确"我打算之后压缩上下文后,好好讨论"(当前弹窗虽有 hex 双显+卡片化,但用户认为仍需进一步打磨 UI/UX)
- spec/plan 归档在 `docs/superpowers/`(非 .sessions/,与 session 治理分离,合规)
- 工作区有一批预存的非本任务改动(package.json/quasar.config.ts/ConnectionPage.vue/dongfanghong-frames.json 等),来源不明,未触碰,待用户处理
