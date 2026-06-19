---
doc_type: design-spec
topic: sendpage-ui-redesign
date: 2026-06-19
status: approved-pending-implementation
related:
  - rewrite/src/pages/SendPage.vue
  - rewrite/src/widgets/FieldEditWidget.vue
  - rewrite/src/features/send/components/instance-columns.ts
  - .sessions/_collection/architecture/rewrite-ui-style-baseline.md
---

# SendPage(帧发送页)UI 重设计

## 1. 背景与问题

用户反馈帧发送页存在三类问题,代码审查后又发现若干坑,汇总如下:

### 1.1 用户反馈

| # | 问题 | 根因 |
|---|------|------|
| F1 | 页面整体滚动,三栏没各自独立滚(中间不滚,左右被挤开) | `q-page class="min-h-full"` 使 q-page 可往下长,内部 `<div class="flex h-full">` 的 `h-full` 失效(父级是 min-height 非 height),三栏 `overflow-*` 无高度边界可触发 |
| F2 | 左栏帧列表丑:不同模板高度不一、标题换行 | 每个 item 双行(name + "N 个字段"),长名折行挤第二行;`q-item-label` 无 `ellipsis` |
| F3 | 不想显示"有几个字段" | `frame.fieldCount` 第二行是噪音 |
| F4 | 编辑弹窗(实例编辑,填发送值)太乱、无 UI/UX 设计 | `FieldEditWidget` 三段用 `q-badge` 色块 + `flex items-center` 平铺,无分组卡片/层次/对齐网格 |
| F5 | 编辑弹窗无十六进制;输入 `1acffc1d` 被转十进制乱写 | 数值字段无 hex 输入;`onNumericInput` 把无法 `Number()` 的串当字符串存,而右栏 `fieldToHex` 只在 `typeof === 'number'` 时转 hex,显示口径不一致 |

### 1.2 代码审查追加发现

| # | 问题 | 位置 |
|---|------|------|
| A1 | 中栏表格用死高度 `container-height="calc(100vh - 100px)"` | `SendPage.vue:455` |
| A2 | 右栏发送按钮 `mt-auto`,内容多时被推走或悬中 | `SendPage.vue:547` |
| A3 | 编辑弹窗 body `rw-dialog-scroll-body` 写死 `max-height: 60vh` | `_utilities.scss:74-77` |
| A4 | 表格操作列 200px 挤 5 个图标(编辑/复制/删除/上移/下移),拥挤 | `instance-columns.ts:68-75` |
| A5 | 字段名 `min-w-[80px]` 硬编码,长名截断短名留白 | `FieldEditWidget.vue:123,189` |
| A6 | 右栏四块用水平分隔线堆叠,像表格不像面板 | `SendPage.vue:494-544` |

## 2. 不变量与约束

- **样式基线**:`rewrite-ui-style-baseline.md` 为事实源。颜色/背景/边框/阴影/间距/圆角/字体层级必须走 `--rw-*` token 或 Quasar 语义 prop;禁止硬编码视觉值;UnoCSS 只承担结构性 utility(`min-h-0`、`overflow-*`、`flex` 等)。
- **交互模型**:保留"帧模板库 + 帧实例"模型(用户拍板选项 A)。左栏点帧创建实例,中栏表格列实例,编辑弹窗改实例字段值。不引入"无实例"概念。
- **高度链范式**:沿用项目内已验证的 `DisplayPage.vue` 模式(`q-page flex flex-col h-full` + scoped `min-height: 0`)。
- **不改 feature 逻辑**:发送管线、`resolveFieldValues`、表达式回写、可变参数等业务逻辑不动。本次只动 UI 与显示/输入口径。

## 3. 设计

### 3.1 高度链修复(地基)

照搬 `DisplayPage.vue` 验证过的模式,打通高度链:

```
q-page (height 链根) — flex flex-col h-full + scoped min-height:0
└─ div.flex.flex-1.min-h-0          (三栏容器,min-h-0 让子项 overflow 生效)
   ├─ 左栏 w-[240px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden
   │  ├─ 搜索区 flex-shrink-0
   │  └─ 帧列表 flex-1 overflow-y-auto min-h-0
   ├─ 中栏 flex-1 flex flex-col min-h-0 overflow-hidden
   │  ├─ 工具条 flex-shrink-0
   │  └─ 表格区 flex-1 min-h-0 (DataTable 不再用 container-height)
   └─ 右栏 w-[300px] flex-shrink-0 flex flex-col min-h-0
      ├─ 内容区 flex-1 overflow-y-auto min-h-0
      └─ 发送区 flex-shrink-0 (钉底部)
```

**关键改动**:
- `q-page class="send-page min-h-full"` → `q-page class="send-page flex flex-col h-full"`
- `.send-page` scoped 加 `min-height: 0`(flex 子项 overflow 生效的必要条件)
- 删 `container-height="calc(100vh - 100px)"`,表格用 `flex-1 min-h-0` 包裹自然撑满。需确认 `DataTable.vue` 支持不传 container-height 时的自适应(实施时验证,若不支持则传 `100%`)。
- 右栏发送按钮区从 `mt-auto` 改 `flex-shrink-0`,内容区独立滚。

### 3.2 左栏帧列表重设计

**目标**:统一高度、标题不换行、去字段数噪音。

结构(收藏分组 + 全部分组均适用):

```
q-item.frame-item (clickable, 单行)
├─ q-item-section avatar: 收藏状态图标(收藏=o_star 实心,未收藏=o_bookmark 轮廓)
├─ q-item-section: 名称(ellipsis,nowrap)
└─ q-item-section side: 收藏切换按钮(o_star / o_star_border)
```

样式(token-backed):
- `.frame-item__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`
- 删除"{{ frame.fieldCount }} 个字段"第二行 → 所有 item 高度统一
- 长名加 `:title` 原生 tooltip(悬停显示全名,零依赖)
- 悬停/选中态用 `surface-selected` token + 左侧 primary 色条(`box-shadow inset` 或 border-left,值取 token)

### 3.3 编辑弹窗(实例编辑)重设计 — 核心

#### 3.3.1 十六进制双显机制

**问题**:数值字段无 hex,且 `1acffc1d` 这类输入被当字符串乱存,显示口径不一致。

**设计**:
- 弹窗内新增响应式状态 `hexMode: Ref<boolean>`(默认 false=Dec),作用于所有数值字段。
- 数值字段定义:input 类型 + dataType ∈ {uint8/int8/uint16/int16/uint32/int32/uint64/int64}。float/double 不参与 hex(非整数)。
- **输入框显示**:
  - Dec 模式:显示十进制。
  - Hex 模式:输入框值带 `0x` 前缀,大写。
- **输入解析**(统一口径,修 F5):
  - 用户输入 → 解析函数 `parseNumericInput(raw, hexMode, dataType)`:
    - 若以 `0x`/`0X` 开头 → 按十六进制解析(BigInt 处理 64 位)。
    - 否则 hexMode=true 时也按十六进制;hexMode=false 时按十进制。
    - 解析成功 → 存 `number`(64 位超 Number.MAX_SAFE_INTEGER 时存 string 形式,与现有 uint64 处理一致)。
    - 解析失败 → 标记该字段错误(不静默当字符串存)。
  - `1acffc1d` 在 hexMode 下 → 存 `450184733`(number);右栏 `fieldToHex` 统一显示 `0x1ACFFC1D`。
- **对侧换算提示**(常驻):每个数值字段输入框下方 `hint` 显示对侧值。Dec 模式 hint = `Hex=0x1ACFFC1D`;Hex 模式 hint = `Dec=450184733`。
- **复用**:右栏 `fieldToHex` 显示口径与弹窗一致(都走同一换算工具函数,提到 shared util)。

#### 3.3.2 分组卡片布局(替代 badge)

三段(可调字段 / 自动计算 / 固定字段)从 `q-badge` 色块 → 带标题的卡片:

```
┌─ 可调参数 ────────────────[Dec|Hex]─┐   ← 卡片标题 + hex 切换按钮(仅可调卡)
│  指令码   [输入框]   描述             │
│  端口     [输入框]                   │
│  地址     [输入框]   0x00FF           │
│             ↑ hint 行(对侧换算)      │
└──────────────────────────────────────┘
┌─ 自动计算(只读)─────────────────────┐
│  校验和   0x3F   ← 自动算             │
│  总长度   12                          │
└──────────────────────────────────────┘
┌─ 固定字段(只读)─────────────────────┐
│  帧头     0xAA                        │
└──────────────────────────────────────┘
```

卡片样式(token-backed):
- 卡片容器:`rw-panel-base` 背景 + `rw-divider` 边框(token border-width/color)+ 圆角 token + padding spacing token。
- 卡片标题:`text-caption` + `text-weight-medium` + 左侧色条(可调=primary / 计算=warning / 固定=grey),色条用 border-left + token 宽度,替代 badge。
- 字段行:CSS Grid 对齐(`grid-template-columns: label列 auto 1fr`),label 列宽度用 token 或 grid 自然对齐,不用硬编码 `min-w-[80px]`。
- 只读字段(计算/固定):用浅色背景展示行(`surface-elevated` 或 inset 背景),不用输入框,明确不可编辑。

#### 3.3.3 弹窗整体结构

```
┌─ 编辑帧实例:XXX ────────────────[×]─┐
│ 名称  [________]                      │   ← 顶部:实例元信息(flex-shrink-0)
│ 备注  [______________________]        │
├──────────────────────────────────────┤
│  ┌ 可调参数 ──── [Dec|Hex] ┐          │
│  │ ...                      │          │   ← 中部:字段卡片区
│  └──────────────────────────┘          │      flex-1 min-h-0 overflow-y-auto
│  ┌ 自动计算 ───────────────┐          │      (不再写死 60vh)
│  │ ...                      │          │
│  └──────────────────────────┘          │
├──────────────────────────────────────┤
│              [取消]  [确认]            │   ← 底部:操作(flex-shrink-0)
└──────────────────────────────────────┘
```

- 弹窗 body 从 `rw-dialog-scroll-body`(写死 60vh)改为 `flex-1 min-h-0 overflow-y-auto`,由 flex 自然分配,最大高度由弹窗 `rw-dialog-lg` + 视口约束。
- `_utilities.scss` 的 `.rw-dialog-scroll-body` 保留(其它弹窗在用),SendPage 编辑弹窗不复用它,改用自己的 flex 布局。

### 3.4 右栏重设计

四块水平分隔线 → 分组卡片:

- 实例信息卡片、帧预览卡片、参数卡片、发送卡片(钉底部)。
- 卡片样式与编辑弹窗一致(`rw-panel-base` + 圆角 + spacing gap)。
- Hex 预览块保留 `surface-elevated` 深色背景。
- 构建问题**不再单独成块**,合并进参数卡片,问题字段行内红字(`text-negative`)提示。
- 发送区 `flex-shrink-0` 钉底部,上方内容区 `flex-1 overflow-y-auto min-h-0`。

### 3.5 表格操作列收纳

现状 5 图标(编辑/复制/删除/上移/下移)挤 200px。改为(用户选 4.2a):
- 「编辑」主按钮外露(primary 色)。
- 其余(复制/删除/上移/下移)收进 `q-btn-dropdown` 或行内 `...` `q-menu`。
- 操作列宽度从 200px 缩到 ~80px。
- 删除项加二次确认(现状 `onRemoveInstance` 已有 `$q.dialog`,保留)。

### 3.6 整页视觉层次

- 背景纵深:`surface-app`(页面,最浅)> `surface-base`(卡片,白)> `surface-elevated`(hex 块,深)。
- 左栏悬停/选中:`surface-selected` token + 左侧 primary 色条。
- 字号层级:卡片标题 `text-caption` + `text-weight-medium`;字段值 `font-mono`(数值/hex 增强可读性)。

## 4. 涉及文件

| 文件 | 改动 |
|------|------|
| `rewrite/src/pages/SendPage.vue` | 高度链、左栏列表、右栏卡片化、编辑弹窗结构调整、表格操作列收纳 |
| `rewrite/src/widgets/FieldEditWidget.vue` | badge→卡片、hex 双显、输入解析重写、grid 对齐 |
| `rewrite/src/features/send/components/instance-columns.ts` | 操作列宽度调整 |
| `rewrite/src/features/send/composables/`(新增)| 数值/hex 解析换算 util(供弹窗与右栏共用) |
| 可能:`rewrite/src/widgets/DataTable.vue` | 验证不传 container-height 的自适应(只读确认) |

## 5. 不做(YAGNI)

- 不引入拖拽排序(用收纳菜单替代,避免与 moveInstanceUp/Down 冲突)。
- 不改 `FrameFieldEditorDialog.vue`(帧模板字段定义编辑器,不在本次范围)。
- 不改发送管线/表达式/可变参数等业务逻辑。
- 不新增 token 文件(复用现有 surface/divider/spacing/radius token);若实施中发现缺 token,按基线先补 token 再消费。
- 不做 dark mode 切换(沿用现有单一主题)。

## 6. 验证标准

- 高度链:任意帧数量下,页面整体不滚动,三栏各自独立滚动;发送按钮始终可见。
- 左栏:所有帧项高度一致,长名 ellipsis + tooltip,无"N 个字段"行。
- 编辑弹窗:数值字段可 Dec/Hex 切换;输入 `1acffc1d`(hex 模式)正确存为数值(64 位内为 number,超安全范围按现状 uint64 处理)且右栏显示一致;三段卡片化呈现;字段多时弹窗内独立滚动。
- 右栏:四卡片布局,发送区钉底,构建问题并入参数卡片。
- 表格:操作列收纳后 ≤80px,功能不减(编辑/复制/删除/上下移可达)。
- 样式基线:无新增硬编码视觉值(实施后扫描 hex/rgb/裸 px)。
- 现有测试:task+command-ingress+send 测试套不回归。

## 7. 风险

| 风险 | 缓解 |
|------|------|
| `DataTable.vue` 不支持无 container-height 自适应 | 实施首步验证;不支持则传 `100%` 或包 flex 容器 |
| 64 位数值 hex 解析超 Number 安全范围 | 复用现有 uint64 BigInt 处理;存值类型与现状一致 |
| hex 切换影响已有实例数据(存的都是 number) | 存值统一 number,hexMode 只影响显示/输入层,不碰存储格式 |
