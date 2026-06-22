# H010 全局 UI 治理（体检 + 改最刺眼的几个）交接

> 2026-06-23 | 关联：专题 2026-06-10-ui-feature-bugs / S006(SendPage 样板) / S010(CommandIngressPage 样板) / H009(任务管理页交接)
> 类型：全局 UI 体检 + 治理任务交接。**不是单页重做**，是横扫所有页面的视觉/布局统一治理。

## 一句话任务

用户反馈"不少地方不好看，我指的是大块的分布，以及边角的零碎的分布"。要开新对话**全局过一遍所有页面**，产出体检报告 + 直接改最刺眼的 2-3 个页面，剩下的拆后续对话。

**用户拍板的范围**（2026-06-23 AskUserQuestion）："体检 + 改最刺眼的几个"——这个对话本身做：① 全局体检出报告 ② 直接改最刺眼的 2-3 个页面 ③ 剩下的拆后续对话。

---

## 触发原话（用户，2026-06-23）

- "然后是不是最好还有一个，去把别的那些页面都搞搞？感觉不少地方不好看。我指的是大块的分布，以及边角的零碎的分布"
- [AskUserQuestion 选]"体检 + 改最刺眼的几个"

→ **两类问题**：
1. **大块分布**：页面整体骨架（H1 碍事、分栏贴死、tab 难看、magic number 高度、巨石单文件、三层嵌套）
2. **边角零碎分布**：padding/间距/对齐（贴边、挤、没留白、硬编码颜色/尺寸）

---

## 强制流程（别跳）

1. **报到**：读 `.sessions/2026-06-10-ui-feature-bugs/topic-index.md`（本任务归此专题）+ `_registry.yaml`。下一个 session 编号 **S012**（S010 指令接入页 / S011 任务管理页已预留）。
2. **brainstorm-first**：用户需求"不少地方不好看"未定死，**必须先 brainstorm**——确认改哪几个最刺眼的、每个页面具体怎么改、统一治理还是逐页。**不许跳过 brainstorm 直接改代码**。
3. **规范必读**（用户原话"别忘规范"）：`codestable/quality/rewrite-frontend-conventions.md`（L4 flex 最小必要）+ `codestable/reference/rewrite-frontend-quickref.md`（绝对禁止清单）。
4. **本对话产出**：体检报告（可用本交接文档的现成体检，见下）+ 实施改动（2-3 个最刺眼页面）+ 剩余页面的后续拆分建议。

---

## 现成体检报告（已探查，别重复扫）

**全局页面清单**（10 个，路由 `rewrite/src/router/routes.ts`）：

| 页面 | 状态 | 行数 |
|------|------|------|
| HomePage | 待体检 | 367 |
| ConnectionPage | 待体检 | 255 |
| FrameListPage | 待体检 | 427 |
| FrameEditorPage | 待体检 | 190 |
| SendPage | ✅ S006 已重做 | — |
| DisplayPage | 待体检 | 716 |
| TaskManagePage | 📋 H009 已交接（S011 做） | — |
| CommandIngressPage | ✅ S010 已重做 | — |
| SettingsPage | 待体检 | 119 |
| HistoryPage | 待体检 | 187 |

### 7 个待体检页面按严重度排序

#### 🔴 刺眼（本对话优先改）

**1. HistoryPage（187 行）**
- 左右分栏贴死无 gap：`w-80`（L88）+ `flex-1`（L114），左栏 `min-width:280px` inline magic
- `CHART_HEIGHTS` 硬编码 420/340/280/240px（L52-57）
- `q-btn-toggle`（L118）旧式，不是 rw-segmented 分段控件
- `<q-page style="background:...">`（L85）inline style 违反 C4

**2. FrameListPage（427 行）**
- `container-height="calc(100vh - 160px)"`（L346）magic number，违反 flex 高度链
- 右栏 `w-[320px]`（L400）Tailwind 任意值 + `flex-shrink-0`，无 min-w-0/gap，分栏贴死
- 表格 chip 大量 Quasar 调色板硬编码 `color="positive/info/warning/grey/negative"`（L250-260, L361, L378）
- 筛选 chip 手搓 q-btn 三态，不是 rw-segmented

#### 🟡 一般（可本对话顺手清，或拆后续）

**3. DisplayPage（716 行）**——骨架已 token 化较好（`display-page__panels` flex gap 已走 var，L690），主要欠：
- 716 行巨石偏胖（与 SendPage/CommandIngressPage 的 page 薄壳 + components/ 子目录范式有差距）
- 模板内 `color="negative/grey"` 按钮 + inline statusMap `color:'grey'/'positive'`（L614）硬编码
- H1「实时测试」（L495）碍事可删

**4. FrameEditorPage（190 行）**——薄壳 + dialog 独立组件已符合 S010 风格，边角问题：
- `max-w-[1120px]`（L112）任意值
- `bg-negative text-white` banner（L135）硬编码
- `text-h6`（L117）Quasar 标题类

**5. SettingsPage（119 行）**——占位项多：
- H1「系统设置」（L9）碍事
- `q-badge color="grey"` 硬编码 ×3（L31/51/71）
- `:deep(.settings-group__field) max-width:400px`（L117）magic

#### 🟢 基本 OK（只清 H1 + 零碎硬编码，可批量快速过）

**6. ConnectionPage（255 行）**：删 H1（L133）+ 收 `color="grey"`（L184）。dialog 已独立成 NewConnectionDialog，结构清爽。

**7. HomePage（367 行）**：删 H1（L134）。scoped CSS token 化彻底，整体规范。

### 全局通病确认（横扫所有页面都能套用）

| 通病 | 命中页面 | 标准解法 | 样板出处 |
|------|---------|---------|---------|
| H1 大标题碍事 | HomePage/ConnectionPage/DisplayPage/SettingsPage/FrameEditorPage(text-h6) | 砍 H1（左侧导航 AppShell drawer 已标当前页） | S010 |
| 左右栏 rw-divider 贴死无 gap | HistoryPage/FrameListPage | 父容器 `gap-6` 替代分隔线 | S010 续接 |
| `calc(100vh-Npx)` magic number | FrameListPage | DataTable `container-height="100%"` + flex 高度链 | D007/S006 |
| Quasar 调色板硬编码 `color="grey/positive/..."` | FrameListPage/HistoryPage/SettingsPage/ConnectionPage/DisplayPage | 走 `--rw-color-*` token 或 statusMap 模式 + Quasar brand(primary/positive/warning/negative/grey) | C1/C4 |
| Quasar 旧式 toggle 非 rw-segmented | HistoryPage(q-btn-toggle) | 换 `rw-segmented` 分段控件 | S010 |
| inline `style="..."` 违反 C4 | HistoryPage(L85) | 用语义 class（rw-text-*/rw-divider-*/rw-panel-base/rw-dialog-*） | C4 |
| Tailwind 任意值 `w-[320px]`/`max-w-[1120px]` | FrameListPage/FrameEditorPage | 走 UnoCSS spacing scale（w-80=320px 已有）或 scoped CSS var token | C4 |
| 巨石单文件 | DisplayPage(716) | page 薄壳 + components/ 子目录分子文件夹 | S006/S010 |

---

## 推荐本对话实施范围（brainstorm 时和用户确认）

基于体检严重度 + 用户"改最刺眼的几个"意图，**推荐本对话改 HistoryPage + FrameListPage 两个刺眼页**（+ 顺手清 ConnectionPage/HomePage 的 H1 作为快速批量项）。理由：
- HistoryPage + FrameListPage 命中所有通病（贴死/magic/toggle/硬编码），改完这俩，标准解法就立稳了，后续页面照抄。
- DisplayPage 716 行巨石瘦身是大工程，建议拆单独对话（像 S010 那样组件化拆分）。
- SettingsPage/FrameEditorPage 边角清理可批量，但优先级低，可放后续。

**brainstorm 时把这个推荐给用户确认**，用户可能想调整（比如"先改 DisplayPage"或"全改了"）。

---

## 样板设计语言（S010 + S006，照着做）

实施时对齐这两套样板：

### page 结构（S010 范式）
- **page 薄壳** + **components/ 下按 tab/区块语义分子文件夹**
- **dialog 各自独立组件**，不内联

### 视觉元素（S010 已建，直接复用）
- **分段控件**：`rw-segmented`（一级）/ `rw-segmented--sub`（二级），定义在 `rewrite/src/css/layers/_utilities.scss`。替换所有 Quasar 默认下划线 tab 和 q-btn-toggle。
- **KPI bar**：参考 `CommandIngressPage` 的 `StatsKpiBar.vue`，**全部指标压一行**（flex-wrap 兜底，别分两行——S010 续接用户实测反馈）。
- **卡片化**：`rw-panel-base` 包独立区块。

### 左右分栏正确写法（S010 续接刚定，通病标准解法）
- **父容器 `gap-6`**（间距），**不用 `rw-divider-r/l` 1px 细线贴死**。
- **列表栏宽度**：按内容实测，别太窄（S010 卫星列表 240→288px）。
- **左栏 `flex-1 min-w-0`**（min-w-0 防表格列累加撑破）。
- **DataTable `container-height="100%"`**（D007 flex 撑开陷阱解法），**禁 `calc(100vh - Npx)`**。

### 高度链（SendPage/DisplayPage 验证过的）
```
q-page flex flex-col h-full + scoped min-height:0
└─ div.flex-1.min-h-0 (内容容器)
```
**遵守 L4 + S009 续接5**：不预防性堆 `flex-1 min-h-0 overflow-hidden`，只在表格/滚动边界加 overflow + min-h-0，拿满父级用 `w-full`/`h-full`，单列 flex 容器加 `no-wrap`。

---

## 不变量（不许违反）

1. **各页面 composable/service/core API 零改动**：纯 UI 重做，不动业务逻辑。若 brainstorm 发现需改接口，先和用户确认 + 可能新建 D###，不在本次顺手做。
2. **路由不变**：10 个 page 路由不动（`routes.ts`）。
3. **token 系统**：所有颜色/间距/圆角/字号走 `--rw-*` token 或 `rw-*` 语义 class，0 硬编码（C4）。**禁 inline `style="color: var(--rw-...)"` 和 `style="width: Npx"`**，用语义 class。
4. **边缘 padding 硬约束**（用户强调"两边贴边难看"，S010 voice.md 已记）：所有容器边缘必须有 padding。
5. **Quasar 调色板规范**：用 brand（primary/positive/warning/negative/grey）+ statusMap 模式，不裸用 `grey-3/grey-8` 等数字调色板。
6. **删除二次确认**（Q5）：`$q.dialog` + cancel。
7. **禁空 catch**（O2）。
8. **AppShell 布局别破坏**：S009 续接4 转向旧代码范式（显式 padding-top:50px + 清 Quasar padding + q-layout height:100% 钉视口），别在改 page 时动了全局高度链。

---

## 接收方验证清单（续接对话必须完成）

- [ ] 已读 `topic-index.md` 的不变量段落 + scope boundary
- [ ] 已验证本文件至少 3 条关键事实声称：
  - [ ] HistoryPage 左右分栏贴死（`w-80` L88 + `flex-1` L114 无 gap，`min-width:280px` inline）
  - [ ] FrameListPage `container-height="calc(100vh-160px)"` magic（L346）+ Quasar 调色板硬编码（L250-260）
  - [ ] rw-segmented 分段控件已存在（验：读 `rewrite/src/css/layers/_utilities.scss` 找 `rw-segmented`）
- [ ] 已查 `_registry.yaml` 中 `2026-06-10-ui-feature-bugs` 状态 active + 无 conflicts_with
- [ ] 已确认范围在 ui-feature-bugs 专题边界内
- [ ] brainstorm-first 已排进流程

## 接口变更

无。本交接纯文档。S012 实施时若有接口调整需求，先和用户确认。

## 已知债务（S012 实施注意）

| 债务 | 原则 | 当前状态 | 触发解决 |
|------|------|---------|---------|
| DisplayPage 716 行巨石 | page 薄壳 + 子目录范式 | 单文件堆 panel 配置 + 模板 | 拆单独对话组件化（不在 S012 顺手，除非用户要求） |
| Quasar 数字调色板遍地 | C1（走 brand/token） | grey-3/grey-8 等散落多页 | S012 改到的页面顺手统一，未改到的拆后续 |
| CHART_HEIGHTS magic | C4 | HistoryPage L52 硬编码 px | S012 改 HistoryPage 时提取 token 或 scoped var |

## 用户/导师原话（需落档到 voice.md）

续接 S012 开对话时，把以下原话记到 `.sessions/2026-06-10-ui-feature-bugs/voice.md` 的 `## 2026-06-23` 段（和 H009 同日期，追加）：

- "然后是不是最好还有一个，去把别的那些页面都搞搞？感觉不少地方不好看。我指的是大块的分布，以及边角的零碎的分布" → H010/S012（触发全局 UI 治理任务）
- [AskUserQuestion 选]"体检 + 改最刺眼的几个" → H010（本对话范围：体检 + 改 2-3 个刺眼页 + 拆后续）

---

## 后续对话拆分建议（本对话产出后）

S012 做完后，剩余页面按优先级拆后续对话：
1. **DisplayPage 组件化瘦身**（716 行→薄壳+子目录，像 S010 那样）—— 单独对话
2. **SettingsPage/FrameEditorPage 边角清理**（H1 + 硬编码 badge/banner）—— 可合一个对话批量清
3. **帧发送/帧定义细节**（用户 H009 提过"帧发送、帧定义啥的都有问题"，若 S006/S012 没覆盖完）—— 视情况

每个后续对话都复用 H010 的"全局通病标准解法表" + 样板设计语言，不重复踩坑。

## 完成后必须做

1. 跑 `pnpm lint`（0 新增 error，baseline 6 pre-existing）+ 改动页面相关测试。
2. 实测：dev server 打开改过的页面，逐个确认视觉 + 交互 + 滚动正常。
3. 落档 S012（新建 `.sessions/2026-06-10-ui-feature-bugs/S012-global-ui-governance.md`）+ 更新 topic-index（加 S012 + 最后更新行 + 当前位置）+ `_registry.yaml` last_updated + voice.md。
4. git commit message 带 `[S012]`，拆 commit。
5. **不要 push**，**不要碰 `_archive-legacy/`**。
