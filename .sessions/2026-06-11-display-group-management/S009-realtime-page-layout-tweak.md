# [S009] 实时测试页布局调整（标题改名 + stat 并入录制行 + 行高压缩）

> 2026-06-22 | UI 调整 (1xx) | active
> 2026-06-22 续接 用户反馈"那六个你靠右，间距大点，不然容易挤开"
> 上游: S008（接收页鬼畜已修，主干绿） | 直接合同: 无（纯 UI/样式）

## 目标

按用户原话完成实时展示页 UI 调整（经历 3 轮迭代，最终方案见下）：
1. 标题"实时展示" → "实时测试"，侧边栏菜单同步。
2. 统计指标（匹配率…字节数）并入底栏录制控件行，不再单独成块。
3. 表格行高压缩（用户原话"行间距小一些改成一半"→"砍到现在三分之二"→"完全没变化"）。

纯 UI/样式，无需 TDD；改完跑 display 测试确认无回归。

## 记录

### 改动 1：标题改名（2 文件）

| 文件 | 改动 |
|------|------|
| `rewrite/src/pages/DisplayPage.vue:495` | `<h1>实时展示</h1>` → `<h1>实时测试</h1>` |
| `rewrite/src/app/AppShell.vue:32` | 导航菜单 `{ label: '实时展示', to: '/display' }` → `'实时测试'` |

（grep 确认全仓只有这两处"实时展示"字样。）

### 改动 2：stat 并入录制行（DisplayPage.vue）

**迭代**：初版把 stat 从表格上方移到表格下方独立成块（grid 6 列 → flex 单行）→ 用户反馈"stat 我打算让它和开始录制那按钮一行，别单独了" → 把 stat 嵌入 bottom-bar 左侧组（和录制按钮同行，用竖分隔线隔开）→ 续接用户反馈"那六个你靠右，间距大点，不然容易挤开" → 最终方案把 stat 移到右侧组。

**最终布局**（bottom-bar 单行，`justify-between` 两组）：
- **左侧组**：录制按钮 + REC 指示 + 记录数
- **右侧组**（`.display-page__bottom-stats`，`gap: --rw-space-6` 加大间距）：6 个 stat-item（匹配率/总批次/已匹配/未匹配/错误/字节数）+ `|` 竖分隔线 + 刷新 ms + 数据源 StatusBadge

**CSS**：
- 删掉独立 `.display-page__stats` 容器样式
- `.display-page__stat-item` 改 `inline-flex baseline`（label+value 同行）
- `.display-page__bottom-divider`（1px 竖线，`align-self: stretch`）现在分隔 stat 区与刷新/数据源区（在右侧组内部）
- `.display-page__bottom-stats { gap: var(--rw-space-6) }`（注：项目无 `--rw-space-5` token，用 space-6 更大间距，避免挤开）

### 改动 3：表格行高压缩（DataTable.vue + DisplayPanel.vue）

**迭代与根因（systematic-debugging）**：

| 尝试 | 方案 | 结果 |
|------|------|------|
| 1 | DisplayPanel scoped `:deep(.data-table .q-table tbody td)` padding 4px | **没生效** |
| 2 | 改 `:deep(.q-table tbody td)` padding 2px + line-height 1.15 | **没生效** |
| 3 | DataTable `compact` prop + 自己 scoped `&.data-table--compact :deep(tbody td)` | 用户反馈"没用" |

**根因（尝试 1/2）**：父组件 DisplayPanel scoped `:deep(X)` 编译成 `[data-v-父scope] X`（后代选择器）。`X` 首个 class（`.q-table`/`.data-table`）落在**子组件 DataTable 根元素**上，根元素自身不是后代 → 后代选择器匹配失败。

**最终方案（双保险，确保生效）**：
- `DataTable.vue` 加 `compact?: boolean` prop（默认 false，不影响其他 6 个页面）
- q-table 同时绑 `:dense="compact"`（**quasar 官方属性，padding 8→4，确定生效**）+ 条件 class `data-table--compact`
- DataTable 自己 scoped CSS（proven 嵌套模式）`&.data-table--compact :deep(tbody td) { padding: 2px; line-height: 1.15 }` 进一步压到目标
- `DisplayPanel.vue` 传 `compact` + `:virtual-scroll-item-size="20"`

**量化**：quasar 默认 td 纵向 padding 8px + line-height 1.5（content ~21px）= 行高 ~36px → compact 后 padding 2px + line-height 1.15（content ~16px）= 行高 ~20px。

**教训**：父组件 scoped `:deep` 穿透子组件时，选择器首个 class 不能落在子组件根元素上。要穿透子组件内部样式，优先用 prop 让子组件自己控制，或确保 `:deep(X)` 的 X 首个元素是真正的后代（非根）。

## 决策引用

- 无 D###（纯 UI 调整，无架构/接口/方向变化）

## 范围确认

- 本轮是否在 scope boundary 内：**是**（display-group-management feature 的 UI 调整，S005 已有 UI 修复先例）
- 未触碰：图表弹窗、分组下拉、DisplayPanel 交互逻辑（除 compact 透传）、bridge/projection/persistence

## Step 验证状态

- **Test**：`npx vitest run src/features/display` → **61/61 pass**（4 文件）
- **Lint**：改动 4 文件（DisplayPage/AppShell/DisplayPanel/DataTable）**0 error**
- **预存问题（非本轮）**：`src/features/receive` 4 文件 FAIL（vite-plugin-vue 解析 .vue 失败），topic-index 已记为预存；本轮未碰 receive
- **运行时验证**：待用户回测——dev server 需重启（DataTable.vue 共享组件改动热重载可能不全）

## 后续

- 用户运行时确认三处视觉效果（**提示：重启 `npm run dev`**，因 DataTable 共享组件改动）
- 如 compact 行高仍偏紧/偏松，调 DataTable scoped CSS 的 padding/line-height 数值即可（不影响其他页面）
