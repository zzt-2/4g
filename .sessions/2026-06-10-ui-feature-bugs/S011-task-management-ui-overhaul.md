# S011 任务管理页 UI 重做

> 2026-06-23 | 实施 | 状态:完成（待用户实测）
> 2026-06-23 续接 | 执行 tab 推倒重写（用户反馈"乱七八糟/写得重"）
> 关联：专题 2026-06-10-ui-feature-bugs / H009 交接 / S010 样板 / D003 单次 emit / L4 no-wrap

## 目标

收 H009 交接，brainstorm-first 定方向后重做任务管理页（TaskManagePage + TemplateListPage + ExecutionListPage）。痛点三类：左右栏贴死/右栏窄 + 缺总览/全是表格 + 整体平淡灰扑扑。

## 记录

### brainstorm 定方向（10 个 AskUserQuestion）

10 个单选/多选问题澄清，结论：
1. tab 嵌套**保留换皮**（两级 `rw-segmented` / `rw-segmented--sub`，不重组）
2. 顶部**去 H1**，单行 toolbar + 按 tab 切按钮（对齐 S010）
3. 执行监控右栏**拓宽 ~400px + gap-6**（去 `rw-divider-l` 贴死）
4. **执行监控页加 KPI bar**（活动/运行中/暂停/待启动 + 历史 完成/失败/总计），模板页不加
5. 守 token，设计感和 S010 同级（frontend-design 在 S010 设计语言内做）
6. **拆组件**（page 薄壳 + `components/{templates,executions}/` 子目录 + dialog 独立）
7. monitor 逻辑统一**本次不做**（记后续新对话）
8. 主区布局：KPI 在上，左右分栏在下

spec 落档 `docs/superpowers/specs/2026-06-23-task-management-ui-overhaul-design.md`（commit `74bac90`），自查过（placeholder/consistency/scope/ambiguity 4 项）。

### 关键偏离（推翻 H009 预判）

- **H009 原预判**："spec 定了按 spec 实施，frontend-design 留给创意发散"。
- **用户明确推翻**："不要，文字描述，且用 frontend-design"。
- 故本次实施走 **brainstorm（文字）→ frontend-design 生成视觉实现**，不走 writing-plans 那套 spec→plan→execute。

### 实施（frontend-design skill）

**新建组件结构**（features/task/components/）：
```
TaskManageToolbar.vue          顶部：一级分段控件 + 搜索 + 按 tab 切按钮
templates/
  TemplateList.vue             模板单表全屏（无 KPI）
  TemplateEditDialog.vue       模板编辑弹窗（从 TemplateListPage 抽出）
executions/
  ExecutionList.vue            左半区：KPI bar + 二级分段 + 状态筛选 + 列表
  ExecutionKpiBar.vue          KPI bar（活动/历史计数 + 状态色）
  TaskDetailPanel.vue          右半区：任务详情卡片（created 手写 + 运行态调 TaskExecutionDetail）
  TaskEditDialog.vue           任务编辑弹窗（从 ExecutionListPage 抽出）
BatchSetTargetDialog.vue       批量设置发送目标（两页共用，scope 区分文案）
TemplatePickerDialog.vue       从模板创建任务（共用）
```

**TaskManagePage.vue 重写**：薄壳化，持 2 editor + tab 状态 + polling + 选中派生 + CRUD 转发。删除原 TemplateListPage(753) + ExecutionListPage(832) 两巨石单文件。

### 关键技术决策

| 点 | 决策 | 理由 |
|----|------|------|
| 分段控件 | 复用 S010 已建 `rw-segmented` / `rw-segmented--sub` | O3 不重复定义 |
| KPI bar 状态色 | `--rw-color-status-success/warning/danger` 给数字着色 | 治「平淡」痛点，守 token |
| dialog 表单字段 | **patchField emit 模式**（D003），子组件不 mutate editor prop，page 持锁在 editor ref 上赋值 | S010 DeviceEditDialog/SatelliteEditPanel 范式，linter `vue/no-mutating-props` 硬约束 |
| editor 传递 | page 持有 `useTemplateEditor`/`useTaskEditor` 实例，editor 对象作 prop 传给 dialog，**方法调用 OK（addTag/removeStep/updateStep 等），标量字段赋值走 patchField emit** | 区分方法（函数调用非 mutate）vs ref 字段赋值（mutate） |
| monitor 统一 | **本次不做** | 范围外，composable API 零改动不变量 |
| TaskExecutionDetail | 保留不动 | S009 续接5 用户亲改的滚动修复 |
| 状态筛选 chip 行 | 保留独立行（不并入二级分段） | 语义是"筛"非"切" |

### 踩坑修正

- **`vue/no-mutating-props` 24 个 lint 错误**：初版 dialog 直接 `v-model="props.editor.xxx.value"` / `@update:...="props.editor.xxx.value = $event"`。linter 全部标红。**修**：改 patchField emit 模式（与 S010 DeviceEditDialog 一致），page 接 `@patch-field` 在 editor ref 上赋值。`patchField<T>(field, value)` 泛型 + EditorField union 类型约束。
- **TaskDetailPanel 多余 useAsyncAction**：初版在子组件内又 `useAsyncAction()`（独立锁，不与父级共享）。**修**：改 `isOperating` prop 注入，子组件只读不持锁。
- **ExecutionList 未用 `props`**：删 `activeTaskCount` computed 后 `const props` 未引用。**修**：`defineProps<Props>()` 不赋值（template 直接访问 props）。
- **TaskManagePage 多语句内联 handler**：`@edit="templateEditor.openEdit($event.templateId); isTemplateEditOpen = true"`、搜索的逗号表达式。**修**：抽 `onEditTemplateRow`/`onSearchInput`/`onStatusFilterChange` 方法。

## 验证

| 项 | 结果 |
|----|------|
| lint（我的文件） | **0 新增 error** |
| lint（全项目） | 6 pre-existing baseline error（serial-handlers/display 测试/northbound 测试/storage 测试/HomePage），与 handoff 记录一致，均与本次无关 |
| tsc | 0 源码 error（仅 1 个 node_modules @vitejs/plugin-vue .d.mts 既有工具链报错） |
| task 测试 | **271/271 全过** |
| command-ingress + send 测试 | **330/330 全过** |
| build | 未跑（handoff 记 EBUSY 环境锁，非代码问题） |

## 决策引用

- D003（子组件 patchConfig 单次 emit 原则）：本次 dialog 全部走 patchField emit 模式，延续此决策。
- D007（flex 撑开陷阱）：DataTable 全部 `container-height="100%"` + flex 高度链，禁 `calc(100vh - Npx)`。
- 无新建 D###（纯 UI 重做，不动架构/接口；monitor 统一不做故不触发新决策）。

## 范围确认

- 本轮是否在 scope boundary 内：**是**（任务管理 UI 归 ui-feature-bugs 专题）。
- 未做：monitor 统一（记后续）、TaskExecutionDetail 改动（保留）、功能补全（不做）。

## 后续

- **待用户实测**：dev server 重启后看模板/执行两 tab + KPI bar + 右栏详情卡片 + 各弹窗 + 编辑器 patchField 字段联动。
- **monitor 统一**（ExecutionListPage 改用 use-task-monitor 消除重复）：开新对话做，可能新建 D###。
- **跨页面通病治理**（帧发送/帧定义等左右栏贴死问题）：H010/S012 全局 UI 治理对话，套用本次 + S010 的通病标准解法。
- **build 验证**：EBUSY 锁解除后跑一次完整 build（验证 .vue script 编译）。

## 续接：执行 tab 推倒重写（2026-06-23）

用户实测反馈"乱七八糟，写得重"，要求从头梳理。诊断三类问题：

| 问题 | 根因 |
|------|------|
| 右详情面板"挤到下面" | 父容器 `<div class="flex h-full gap-6 p-3">` **漏 no-wrap**（横排 flex 容器必须显式 no-wrap，L4 规则我之前只记到竖排 flex flex-col，漏了横排） |
| 写得重 | 造了 ExecutionList **巨型左半区组件**（KPI+二级分段+状态筛选+批量工具条+活动表+历史表 6 件事全塞一个组件），违背 S010"page 直接编排小块"范式 |
| padding 重复 | 外层 `p-3` + ExecutionList 根又 `p-3`，双重 padding |

### 重构（commit `fceae19`）

删 ExecutionList 巨石，page 直接编排（对齐 S010 CommandIngressPage）。executions/ 重组成 6 个小职责组件：
- `ExecutionKpiBar`（KPI 计数纯展示，去 flex-wrap 改 margin-right 间距）
- `ExecutionToolbar`（二级分段 + 状态筛选/清空历史，对齐 DockingToolbar）
- `ActiveTaskTable`（活动表 + 行内操作）
- `HistoryTaskTable`（历史表 + 重试/删除）
- `TaskDetailPanel`（右栏详情卡片，去重复 width:100%）
- `TaskEditDialog`（编辑弹窗，保留）

布局层级对齐 S010：
```
q-page flex flex-col h-full
└─ div.flex-1.min-h-0（tab 内容容器）
   └─ 执行 tab：div.flex.flex-col.h-full
      ├─ ExecutionKpiBar（flex-shrink-0）
      ├─ ExecutionToolbar（flex-shrink-0）
      └─ div.flex.flex-1.min-h-0.gap-6.no-wrap（主体分栏，no-wrap 关键）
         ├─ 左 exec-list-pane flex-1 min-w-0（列表区）
         └─ 右 TaskDetailPanel w-100 min-w-100 flex-shrink-0
```

### 续接踩坑

| 踩坑 | 修法 |
|------|------|
| `ref` 误从 `'quasar'` 导入（quasar 不导出 ref），整页组件树加载崩溃，右详情面板连带不渲染 | 从 `'vue'` 导入 ref（commit `e4e5b38`） |
| 横排 flex 漏 no-wrap → 右详情面板换行掉下去 | 父容器加 no-wrap；TaskDetailPanel 用 S010 双保险 `w-100 min-w-100 flex-shrink-0`（commit `eeffdb7`，后被 `fceae19` 重构吸收） |
| ExecutionList 巨石（KPI+分段+筛选+批量+两表全塞） | 删掉，page 直接编排小块（commit `fceae19`） |

### 续接验证

- lint 0 新增（我的文件）
- task 271/271 全过

### 续接教训（值得记长期）

**L4 的 `no-wrap` 规则适用于横排 flex 容器，不只是竖排 `flex flex-col`。** 我之前只记到"单列 flex 容器加 no-wrap"，漏了横排分栏（左列表+右详情这种）同样需要显式 no-wrap——否则子项宽度溢出时父级会换行。后续治理其它页面左右分栏通病时务必注意。这条建议补进 frontend-conventions L4 或后续 D###。

## 续接后续

- **待用户实测**：dev server 刷新后看执行 tab——KPI bar + 二级分段 + 左列表 + 右详情卡片是否都在正确位置、右详情不再换行掉下去。
- **L4 no-wrap 补充**：考虑补进 frontend-conventions L4（横排 flex 容器也需 no-wrap），或后续全局 UI 治理对话统一处理。
