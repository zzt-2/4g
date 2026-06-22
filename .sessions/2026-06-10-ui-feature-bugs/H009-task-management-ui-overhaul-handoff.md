# H009 任务管理页 UI 重做交接

> 2026-06-23 | 关联：专题 2026-06-10-ui-feature-bugs / S010（指令接入页 UI 重做样板）/ S006（SendPage UI 重设计样板）
> 类型：brainstorm-first UI 重做任务交接（**不是上来改代码**，先 brainstorm 定方向再实施）

## 一句话任务

用户反馈"任务管理那边也丑"，要像 S010（指令接入页 UI 重做）那样重做。本交接文档把现状、样板设计语言、不变量、通病、易踩坑点全列清楚，让新对话不重复踩坑。

---

## 触发原话（用户，2026-06-23，S010 收尾时）

- "我打算开个新对话，把任务管理那边也改一下？我感觉那边也丑"
- "SCOE 列表左侧那个，太窄了，列表都给挤一起了，且左右两栏没有间隔，贴死了，很难看"
- "**别的地方也有这个问题，比如帧发送、帧定义啥的，都有，且不止我说的这个，我打算多开几个对话，都给搞搞**"

→ **关键**：左右栏贴死/列表太窄是**跨页面通病**，任务管理页只是其中之一。本任务治任务管理页，但交接文档把通病写清楚，后续帧发送/帧定义等对话可复用同一套修法。

---

## 强制流程（别跳）

1. **报到**：读 `.sessions/2026-06-10-ui-feature-bugs/topic-index.md`（本任务归此专题，command-ingress/task 这类 feature 的 UI 都归这）+ `.sessions/_registry.yaml`。本任务下一个 session 编号 **S011**（S010 已用于指令接入页）。
2. **brainstorm-first**：用户需求未定死，**必须先调用 brainstorming skill**，和用户讨论清楚哪里不满意/期望形态/H1 留不留/三层 tab 要不要拍平。**不许跳过 brainstorm 直接改代码**。参考 S006/S010 的同款流程：brainstorm → spec → plan/executing-plans。
3. **规范必读**（用户原话"别忘规范"，指的就是这套）：动手前完整读 `codestable/quality/rewrite-frontend-conventions.md`（含 L4 flex 最小必要）+ `codestable/reference/rewrite-frontend-quickref.md`（含绝对禁止清单）。CLAUDE.md "重写主线必读"段要求 UI 任务必须读这两份。
4. **实施走 frontend-design**：用户在 S010 明确说"用那个 frontend-design"——但 S010 实际没调用（因为按既定 spec 重做 + 严格守 token，frontend-design 自由风格会冲突）。本任务同理：**spec 定了就按 spec 实施**，frontend-design 留给"需要创意视觉发散"时用。

---

## 现状事实（已探查，别重复 grep）

### 文件结构（三层）

```
pages/TaskManagePage.vue (49 行, 薄壳)
  ├─ H1「任务管理」(line 19) + q-tabs 切两个 tab (line 21-29)
  └─ activeTab === 'templates' → TemplateListPage
     activeTab === 'executions' → ExecutionListPage

features/task/components/
  ├─ TemplateListPage.vue (753 行, 单文件巨石)
  ├─ ExecutionListPage.vue (832 行, 单文件巨石, 含三层 tab 嵌套)
  ├─ SendStepEditor.vue / WaitConditionStepEditor.vue / DelayStepEditor.vue / AdvancedConfigPanel.vue
  │   (4 个 step editor 子组件，两个 ListPage 共用)
  ├─ task-columns.ts (7 列) / template-columns.ts (7 列) / history-columns.ts (6 列)
  ├─ scheduleKindMap.ts / taskStatusMap.ts (Quasar color 字符串映射)
  └─ composables/
     ├─ use-template-editor.ts (return 30+ 字段/handler)
     ├─ use-task-editor.ts (return 30+ 字段/handler, 几乎同上)
     ├─ use-task-list.ts (rows/historyRows/refresh/selectAllRows)
     └─ use-task-monitor.ts (selectedId/instance/progress/displayStatus/...)
        ⚠️ ExecutionListPage 没用 use-task-monitor，自己重复实现了一遍 selectedInstance/progress/displayStatus computed (ExecutionListPage.vue:143-189)

widgets/TaskExecutionDetail.vue (执行详情组件，S009 续接5 用户亲改过滚动: no-wrap + 右栏 h-full)
```

### 路由

`rewrite/src/router/routes.ts:14`：`{ path: 'tasks', component: TaskManagePage.vue }`，挂 AppShell 下（`routes.ts:6`）。

### ExecutionListPage 的三层 tab 嵌套（认知负担最高的点）

1. **外层**（TaskManagePage）：q-tab「模板管理 / 执行监控」
2. **中层**（ExecutionListPage:428）：q-tabs「活动任务 / 历史记录」
3. **底层**（ExecutionListPage:433）：q-chip 状态筛选行

### 左右分栏贴死问题（用户痛点直击）

**ExecutionListPage**（有分栏）：
- `:414` 外层 `flex`
- 右栏 `:580` `<div class="w-[360px] flex-shrink-0 ... rw-divider-l">` —— **`w-[360px]` 写死 + `rw-divider-l` 1px 细线贴死，无 gap**
- 左栏 `flex-1` **没设 `min-w-0`**，表格列宽累加 880px+，窄屏挤压

**TemplateListPage**：无分栏，全屏单表。

### 已知 UI 痛点（探查判断，供 brainstorm 参考）

1. **三层 tab 嵌套**（page→内 tab→chip 筛选），认知负担高，违反 S010 单层分段控件设计语言。
2. **ExecutionListPage 右栏 360px 写死贴死**，窄屏挤压左表。
3. **两个 page 巨石单文件**（753/832 行），dialog 编辑器内联 280+ 行，与 S010「page 薄壳 + components/ 子目录」范式脱节。
4. **container-height 用 `calc(100vh - Npx)` magic number**（200/280），与 SendPage 的 `flex:1 1 0 + min-height:0` 模式不一致，窗口缩放易破。
5. **无 KPI bar / 卡片化**：活动任务数、运行中、历史汇总等指标全是表格列，没有一眼总览。
6. **执行详情区两套 UI 重复**（created 态手写 :582-614 / 运行态调 TaskExecutionDetail :617-633），use-task-monitor 未用，逻辑重复。
7. **多处硬编码**：列宽 `'width: 120px'` 字符串、`w-[360px]`/`w-80` Tailwind 任意值、`q-chip color="grey-3" text-color="grey-8"` Quasar 调色板硬编码。

---

## 样板设计语言（S010 + S006，照着做）

新对话实施时，任务管理页要对齐这两套样板：

### page 结构（S010 范式）
- **page 薄壳**（TaskManagePage 可保留薄壳角色，砍 H1 或缩小，把 q-tab 换成分段控件 `rw-segmented`）
- **子组件按 tab 语义分子文件夹**（`features/task/components/{templates,executions}/` 或类似），扁平根目录放跨 tab 共用的
- **dialog 各自独立组件**，不内联在 page

### 视觉元素（S010 已建，直接复用）
- **分段控件**：`rw-segmented`（一级）/ `rw-segmented--sub`（二级），定义在 `rewrite/src/css/layers/_utilities.scss`。一级 tab + 嵌套二级 tab 都用它，二级视觉重量弱化。
- **KPI bar**：参考 `CommandIngressPage` 的 `StatsKpiBar.vue`，**全部指标压一行**（flex-wrap 兜底窄屏，别分两行——S010 续接用户实测反馈两行不好看）。
- **卡片化**：`rw-panel-base` 包独立区块（S010 的 SatelliteEditPanel 基本信息卡/命令配置卡是范例）。

### 左右分栏正确写法（S010 续接刚定的，通病标准解法）
- **父容器加 `gap-6`**（间距），**不用 `rw-divider-r/l` 1px 细线贴死**。
- **列表栏宽度**：根据内容定，别太窄（S010 卫星列表 w-60→w-72 即 240→288px，因为 240 放不下 ID+命令数+操作列）。任务页列表栏宽度 brainstorm 时实测确认。
- **左栏 `flex-1 min-w-0`**（min-w-0 防表格列累加撑破）。
- **DataTable 用 `container-height="100%"`**（D007 flex 撑开陷阱解法），**禁用 `calc(100vh - Npx)` magic number**。

### 高度链（SendPage/DisplayPage 验证过的）
```
q-page flex flex-col h-full + scoped min-height:0
└─ div.flex-1.min-h-0 (tab 内容容器)
   └─ 各 tab 内部按需 flex
```
**遵守 L4 + S009 续接5 教训**：不预防性堆 `flex-1 min-h-0 overflow-hidden`，只在表格/滚动边界加 overflow + min-h-0，拿满父级用 `w-full`/`h-full`，单列 flex 容器加 `no-wrap`。

---

## 不变量（不许违反）

1. **composable API 零改动**：`use-template-editor`/`use-task-editor`/`use-task-list`/`use-task-monitor` 的 return 签名不动。如果 brainstorm 发现需要改（比如统一 ExecutionListPage 用 use-task-monitor 消除重复），**先和用户确认，单独开任务，不在本次做**。
2. **task core/index.ts public API 零改动**：纯领域层，不动业务逻辑。
3. **TaskExecutionDetail.vue 滚动修复保留**（S009 续接5 用户亲改：no-wrap + 右栏 h-full），别破坏。
4. **路由不变**：TaskManagePage 仍 AppShell 下 page，路径 `/tasks`。
5. **token 系统**：所有颜色/间距/圆角/字号走 `--rw-*` token 或 `rw-*` 语义 class，0 硬编码（C4）。**禁 inline `style="color: var(--rw-...)"`，用语义 class**（rw-text-label/value/desc、rw-divider-b/t/l、rw-panel-base、rw-dialog-sm/md/lg/xl）。
6. **边缘 padding 硬约束**（用户强调"两边贴边难看"，S010 voice.md 已记）：所有容器边缘必须有 padding，内容不贴边。
7. **删除操作二次确认**（Q5）：`$q.dialog` + cancel，不用 `window.confirm`。
8. **禁空 catch**（O2）。

---

## 跨页面通病（本任务治任务管理页，但通病写清楚供后续对话复用）

用户原话："别的地方也有这个问题，比如帧发送、帧定义啥的，都有"。后续每个页面 UI 重做对话都该治这些通病：

| 通病 | 标准解法 | 样板出处 |
|------|---------|---------|
| 左右栏 `rw-divider-r/l` 1px 细线贴死无间距 | 父容器 `gap-6` 替代分隔线 | S010 续接 |
| 列表栏太窄挤一起 | 宽度按内容实测，≥ 内容所需（ID+列+操作列），别拍脑袋 240px | S010 续接（240→288） |
| `container-height="calc(100vh - Npx)"` magic number | DataTable `container-height="100%"` + flex 高度链 | D007/S006 |
| 预防性堆 `flex-1 min-h-0 overflow-hidden` | 按场景精确加，滚动边界才加 overflow+min-h-0，拿满用 w-full/h-full | L4/S009续接5 |
| Quasar 默认下划线 tab 难看 | `rw-segmented` 分段控件 | S010 |
| 巨石单文件 page | page 薄壳 + components/ 子目录分子文件夹 | S006/S010 |
| dialog 内联在 page | dialog 各自独立组件 | S010 |
| Quasar 调色板硬编码（`color="grey-3"`）| 走 `--rw-color-*` token 或语义 class | C1/C4 |

**后续对话**：帧发送页（SendPage 已 S006 重做过，可能只剩细节）、帧定义页、其他页面——每个开独立对话，各自 brainstorm → spec → 实施，但都套用这套通病解法。

---

## 接收方验证清单（续接对话必须完成）

- [ ] 已读 `topic-index.md` 的不变量段落 + scope boundary
- [ ] 已验证本文件至少 3 条关键事实声称：
  - [ ] TaskManagePage 是薄壳 + q-tab 切两个 ListPage（验：读 `pages/TaskManagePage.vue`）
  - [ ] ExecutionListPage 右栏 `w-[360px] rw-divider-l` 贴死无 gap（验：读 `ExecutionListPage.vue:580` 附近）
  - [ ] ExecutionListPage 没用 use-task-monitor，自实现 selectedInstance/progress（验：读 `ExecutionListPage.vue:143-189` + grep use-task-monitor 引用）
- [ ] 已查 `_registry.yaml` 中 `2026-06-10-ui-feature-bugs` 的状态（active）+ 无 conflicts_with
- [ ] 已确认范围在 ui-feature-bugs 专题边界内（任务管理 UI 归此专题）
- [ ] brainstorm-first 已排进流程，没打算跳过

## 接口变更（本交接不涉及代码改动，纯交接文档）

无。本文件是任务交接，下一对话（S011）才动代码。S011 实施时若有 composable 接口调整需求，需先和用户确认 + 可能新建 D###。

## 已知债务（原则与现实差距，S011 实施时注意）

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| ExecutionListPage 自实现 monitor 逻辑不用 use-task-monitor | DRY/O3（2+ 处重复模式必须提取） | use-task-monitor 存在但 ExecutionListPage 重复实现 | S011 UI 重做时顺手统一（需确认语义一致） |
| 列宽 magic number 进 columns.ts 字符串 | C4（token 化，T2 QTable headerStyle px 是 API 要求不视为违规） | task-columns.ts 等硬编码 `'width: 120px'` | 列宽本身可保留（T2 豁免），但容器尺寸/间距要走 token |
| scheduleKindMap/taskStatusMap 用 Quasar color 字符串 | C1（颜色走 token/Quasar brand） | 字符串 `'primary'/'grey'` 混用 | 重做时统一走 Quasar brand（positive/warning/negative/grey）或 statusMap 模式 |

## 用户/导师原话（需落档到 voice.md）

续接 S011 开对话时，把以下原话记到 `.sessions/2026-06-10-ui-feature-bugs/voice.md` 的 `## 2026-06-23` 段：

- "我打算开个新对话，把任务管理那边也改一下？我感觉那边也丑" → H009/S011（触发任务管理页 UI 重做）
- "SCOE 列表左侧那个，太窄了，列表都给挤一起了，且左右两栏没有间隔，贴死了，很难看" → S010 续接 + H009（左右栏贴死/列表窄通病，任务页同款）
- "别的地方也有这个问题，比如帧发送、帧定义啥的，都有，且不止我说的这个，我打算多开几个对话，都给搞搞" → H009（跨页面通病，后续多对话治理）
- "这轮改的挺不错的" → S010（对指令接入页 UI 重做结果的肯定，S010 闭环）

---

## 范围控制提醒

- **brainstorm 时若用户想补功能**（比如任务管理的某个缺失功能、批量操作扩展），明确告知是范围扩张，建议拆后续任务，本次只做 UI 重做（除非用户坚持）。
- **若用户想统一 ExecutionListPage 用 use-task-monitor**（消除重复），这是逻辑重构非纯 UI，单独确认 + 可能新建 D###，不在 UI 重做里顺手做（除非用户明确说一起）。
- **TaskExecutionDetail 的滚动修复**（S009 续接5）是用户亲改的，别在 UI 重做里动它，除非用户明确要求。

## 完成后必须做

1. 跑 `pnpm lint`（0 新增 error，baseline 有 6 个 pre-existing 无关）+ command-ingress/task/send 相关测试。
2. 实测：dev server 打开任务管理页，模板/执行两个 tab 都点一遍，编辑器弹窗开一遍，执行详情滚动正常。
3. 落档 S011（新建 `.sessions/2026-06-10-ui-feature-bugs/S011-task-management-ui-overhaul.md`）+ 更新 topic-index（加 S011 条目 + 最后更新行 + 当前位置段）+ `_registry.yaml` last_updated + voice.md（用户原话）。
4. git commit message 带 `[S011]`，拆 commit（feat 代码 + docs 落档）按现有风格。
5. **不要 push**（远程没通），**不要碰 `_archive-legacy/`**。
