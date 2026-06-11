---
doc_type: architecture
type: rewrite-ui-style-baseline
status: draft
date: 2026-05-04
summary: Quasar and SCSS token baseline for rewrite UI styling, including UnoCSS and component class boundaries.
tags:
  - rewrite
  - ui
  - style
  - quasar
  - scss
  - unocss
  - token
---

# Rewrite UI style baseline

## 1. Direct contract

本轮依据以下正式工件和实现入口判断范围：

1. `AGENTS.md`
2. `codestable/architecture/rewrite-target-structure.md`
3. `codestable/architecture/rewrite-thin-ui-runtime-wiring.md`
4. `codestable/quality/rewrite-quality-rules.md`
5. `rewrite/quasar.config.ts`
6. `rewrite/uno.config.ts`
7. `rewrite/src/css` 或现有样式入口
8. `rewrite/src/app`
9. `rewrite/src/pages`
10. `rewrite/src/widgets`

本文只定义 Quasar / SCSS / UnoCSS / class 的样式基线和后续实现 checklist，不替代业务 feature design，不写业务 UI，不定义视觉稿。

## 2. Boundary guards

- 本基线只覆盖样式入口、token 归口和现有 app/page/widget 的样式迁移。
- 不写业务页面。
- 不改 feature 逻辑。
- 不重做视觉设计稿。
- 不引入新 UI 框架。
- 不允许组件内硬编码颜色、阴影、边框、间距、字体层级、z-index 等视觉 token。
- 不允许把 UnoCSS 当成业务样式主系统。
- 优先使用 Quasar + SCSS token。
- 本文不定义业务页面视觉稿；实现轮只迁移样式入口和现有 app/page/widget 的 token 使用。

## 3. Current style entry facts

| Area | Current fact | Baseline implication |
| --- | --- | --- |
| Quasar config | `rewrite/quasar.config.ts` 当前通过 `css: ['app.scss']` 挂载 `rewrite/src/css/app.scss`，Vite 里仍挂载 UnoCSS plugin。 | 全局样式入口已经归口到 Quasar config；后续全局样式不得绕过 `rewrite/src/css`。 |
| Quasar variables | `rewrite/src/css/quasar.variables.scss` 已存在，并从 `rewrite/src/css/tokens` 派生 Quasar brand variables。 | Quasar brand / component 变量以 `quasar.variables.scss` 为入口，不再散落在组件或 UnoCSS theme。 |
| SCSS token entry | `rewrite/src/css/app.scss` 已声明 `--rw-*` CSS custom properties，并导入 `tokens/` 和 `layers/`。 | app-specific 颜色、背景、边框、间距、圆角、尺寸、字体层级等视觉值通过 token 暴露给组件。 |
| UnoCSS entry | `rewrite/src/App.vue` 保留单一 `uno.css` 导入；`rewrite/uno.config.ts` 只保留 `presetUno()`。 | UnoCSS 已收缩为最小结构 utility 能力，不再定义颜色 theme 或页面 shortcut。 |
| App/page/widget styles | `rewrite/src/app/AppShell.vue`、`rewrite/src/pages/HomePage.vue`、`rewrite/src/widgets/AppNavigation.vue`、`rewrite/src/widgets/SummaryMetricGrid.vue` 已迁移为 token-backed scoped style。 | 当前 app/page/widget 基线样式不再写十六进制颜色、裸 px/rem/em 视觉值或 Uno 视觉 utility；后续新增 UI 必须延续该边界。 |

当前允许硬编码的 primitive 视觉值只位于 `rewrite/src/css/tokens/*`。组件、页面、widget、UnoCSS config 和 inline style 不得新增视觉 token 裸值。

## 4. Official docs alignment

本节依据 2026-05-04 查阅的官方文档校准样式边界：

- Quasar CLI Vite 的 `quasar.config.ts > css` 用于挂载 `/src/css/` 下的全局 CSS / Sass / SCSS 文件；示例中 `css: ['app.sass']` 指向 `/src/css/app.sass`。
- Quasar CLI 会识别 `src/css/quasar.variables.scss` 或 `.sass`；存在时会用它编译 Quasar 自身 CSS，并把其中变量提供给项目内 `.sass/.scss/.vue` 样式使用。
- Quasar 官方把 brand colors 收敛为 `primary / secondary / accent / dark / positive / negative / info / warning` 八类；这些颜色也会暴露为 `--q-*` CSS custom properties，并可通过 `setCssVar` 动态调整。
- Quasar 官方提供颜色 class、spacing class、flex/grid class、typography helper、visibility helper、shadow/elevation class。这些不是“随手写死”，而是 Quasar 自带样式系统的一部分。
- UnoCSS 官方定位是按需 utility engine；shortcuts 会把多个 utility 合成一个 class，theme 可以定义颜色等 token。对本项目而言，这些能力容易与 Quasar helper 和 SCSS token 形成第二套视觉系统，必须主动收窄。

## 5. Baseline decision

rewrite UI 的主样式系统是 Quasar + SCSS token；UnoCSS 是最小补充，不与 Quasar helper 竞争。

Rules:

- Quasar 负责基础组件、组件状态、主题变量和交互一致性。
- Quasar 官方 helper class 可以用于通用 layout、spacing、typography、visibility、color 和 elevation，但不得把复杂页面样式拆成一串不可审查的 utility。
- SCSS token 负责 app-specific 视觉事实源，包括颜色、语义色、背景、边框、阴影、间距、圆角、z-index、字体层级和少量全局 utilities。
- UnoCSS 只作为 Quasar / SCSS 缺口的最小结构性补充，不承载业务视觉系统。
- 页面、widget、feature component 可以写语义 class，但 class 内只能消费 SCSS token 或 Quasar 语义变量。
- 组件 template、`<style scoped>`、UnoCSS class、inline style 都不得直接出现硬编码视觉值；Quasar helper class 不视为硬编码，但只能按本文边界使用。
- Quasar 组件的 `color="primary"`、`flat`、`bordered`、`dense`、`q-pa-md`、`row`、`items-center`、`shadow-1` 等语义化 prop / helper 可以使用；自定义颜色、背景、阴影、尺寸必须经 token。
- 对业务状态的判断仍归各 feature 或 `status` feature；样式基线只提供 visual role，例如 success、warning、danger、info、selected、disabled，不决定业务语义。

## 6. Proposed SCSS token structure

后续实现建议建立以下最小结构：

```text
rewrite/src/css/
  quasar.variables.scss
  app.scss

  tokens/
    _index.scss
    _palette.scss
    _semantic-colors.scss
    _spacing.scss
    _border.scss
    _radius.scss
    _shadow.scss
    _z-index.scss
    _typography.scss

  layers/
    _base.scss
    _quasar.scss
    _utilities.scss
```

Placement rules:

- `quasar.variables.scss`：只放 Quasar Sass variables 和从 token 派生的 Quasar brand variables，例如 `$primary`、`$secondary`、`$accent`、`$positive`、`$negative`、`$warning`、`$info`。不得放页面或业务组件样式。
- `app.scss`：全局样式入口；只负责 `@use` tokens、声明 `:root` CSS custom properties、导入 base / Quasar override / utilities。通过 `rewrite/quasar.config.ts` 的 `css` 入口挂载。
- `tokens/_palette.scss`：只放 primitive palette。组件不得直接消费 palette primitive。
- `tokens/_semantic-colors.scss`：放可被组件消费的语义颜色，并同步映射到必要的 `--rw-*` 与 Quasar `--q-*` role，例如 app/page/surface/text/border/action/status/focus。
- `tokens/_spacing.scss`：放 app-specific spacing scale 和 layout density token；Quasar 自带 `q-p*` / `q-m*` helper 可用于通用间距，组件不得写 `padding: 24px`、`gap: 12px` 等裸值。
- `tokens/_border.scss`：放 border width scale。组件不得写 `border: 1px solid ...` 等裸值。
- `tokens/_radius.scss`：放 radius scale。组件不得写 `border-radius: 8px` 等裸值。
- `tokens/_shadow.scss`：放 app-specific elevation / focus ring / overlay shadow token；Quasar 自带 `shadow-*` / `no-shadow` 可用于通用 elevation，组件不得写 `box-shadow` 裸值。
- `tokens/_z-index.scss`：放 app shell、drawer、sticky toolbar、popover、modal overlay 等 z-index token；Quasar 自带 overlay 优先沿用 Quasar。
- `tokens/_typography.scss`：放字体族、字号、行高、字重和标题/正文/辅助文字层级。组件不得用 Uno `text-*` 或裸 `font-size` 决定业务 UI 层级。
- `layers/_base.scss`：放 `html/body/#q-app`、默认字体、全局背景、文本抗锯齿等应用基线。
- `layers/_quasar.scss`：只放对 Quasar 组件的全局 theme override，并且必须通过 app-owned wrapper 或 Quasar 稳定 class 控制，不写页面业务样式。
- `layers/_utilities.scss`：只放少量跨页面、token-backed、无业务语义的 `.rw-*` utilities，例如 page surface、section spacing、visually hidden。

## 7. Token category principles

### Color and status color

- Primitive colors 只能放在 `tokens/_palette.scss`，作为 semantic token 的输入。
- 组件只能消费 semantic token，例如 `--rw-color-text-primary`、`--rw-color-surface-page`、`--rw-color-border-subtle`、`--rw-color-action-primary`。
- 状态色只表达视觉角色，例如 success、warning、danger、info、neutral、selected、disabled、focus。业务上何时使用某个状态色由 feature 或 `status` feature 决定。
- Quasar brand role 使用 `primary / secondary / accent / dark / positive / negative / info / warning`，并与 `--q-*` CSS custom properties 保持一致。
- 简单 Quasar 组件可以使用 `color="primary"`、`text-primary`、`bg-positive` 等官方语义；app-specific surface、selected、highlight、chart、device status 等必须走 `--rw-*` semantic token 或明确 feature 状态投影。
- 禁止在组件、UnoCSS theme、inline style 中新增 `#...`、`rgb()`、`hsl()` 等硬编码颜色。

### Background and surface

- 背景 token 按层级命名：app、page、surface、surface-raised、surface-inset、header、drawer、overlay。
- 页面根、App shell、card、banner、nav active 等只能使用 surface/action/status token。
- 不为单个页面新增临时背景色；需要新层级时先补 token 并说明使用范围。

### Border, radius, and shadow

- border color、width、radius、shadow 必须分别来自 token。
- 允许使用 Quasar `bordered`、`flat`、`elevated`、`shadow-*`、`no-shadow` 等语义 prop / helper；自定义边框和阴影只能通过 token。
- 组件局部不能写裸 `border: 1px solid #...`、`border-radius: 8px`、`box-shadow: ...`。

### Spacing and layout density

- 通用间距优先用 Quasar 官方 `q-pa-*`、`q-ma-*`、`q-gutter-*` scale；app-specific 间距由 SCSS token 定义。
- 组件样式只能通过 Quasar spacing helper 或 token 设置 `padding`、`margin`、`gap`、固定高度或 grid 间距。
- 页面级布局可以定义语义 class，例如 `.overview-page__content`，但其中的间距必须来自 token。
- 禁止在业务 template 中用 Uno `p-*`、`m-*`、`gap-*`、`space-*` 直接决定视觉间距；需要 utility 时使用 Quasar `q-*` scale。

### Z-index

- z-index token 只服务跨层叠上下文，例如 app header、drawer、sticky action bar、popover、modal overlay、toast。
- 普通组件不得随意写 z-index。确需新增层级时，先在 `tokens/_z-index.scss` 定义语义名并说明覆盖对象。

### Typography

- 字体层级按 role 命名，例如 display/title/section/body/label/caption/mono。
- Quasar 组件默认 typography 和官方 `text-h*`、`text-subtitle*`、`text-body*`、`text-caption`、`text-weight-*`、`text-center` 等 helper 可沿用。
- 组件不得用 Uno `text-*` 或裸 `font-size` 作为业务 UI 字体层级；需要 app-specific 层级时使用 token-backed class 或 mixin。

## 8. Quasar helper boundary

Allowed:

- Quasar component props：`color`、`dense`、`flat`、`outline`、`bordered`、`square`、`unelevated`、`elevated` 等表达组件语义的 prop。
- Layout helpers：`row`、`column`、`col-*`、`items-*`、`justify-*`、`content-*`、`self-*`、`wrap`、`no-wrap`、`flex-center`。
- Spacing helpers：`q-pa-*`、`q-ma-*`、`q-px-*`、`q-mt-*`、`q-gutter-*` 等 Quasar scale class；复杂页面密度仍应沉淀为语义 class。
- Typography / visibility helpers：`text-h*`、`text-body*`、`text-caption`、`text-weight-*`、`text-center`、`ellipsis`、`hidden`、`invisible`。
- Color / elevation helpers：`text-primary`、`bg-primary`、`text-positive`、`bg-warning`、`shadow-*` 等官方 role class；只用于通用 Quasar 语义，不用于 app-specific surface。

Forbidden:

- 为了少写 class，把页面或 widget 的主要视觉设计堆成大量 Quasar helper，导致 owner 和 token 意图不可读。
- 使用 Quasar palette primitive 直接表达业务状态，例如在组件里写 `text-blue-7`、`bg-grey-2` 决定设备/任务状态。
- 绕过 token 新增自定义 `.text-brand` / `.bg-brand`；如确需新增 Quasar color role，先进入 SCSS token 和 `layers/_quasar.scss`。
- 开启 `framework.cssAddon` 只为方便响应式 spacing；Quasar 文档提示它会增加 CSS 体积，只有明确需要时才启用。

## 9. UnoCSS boundary

UnoCSS 允许范围：

- 单一入口导入 `uno.css`，不在组件里重复导入。
- 仅当 Quasar helper 或组件语义 class 不合适时，使用不携带视觉 token 的结构 utility，例如 `min-w-0`、`min-h-0`、`overflow-*`、`relative`、`absolute`。
- 响应式前缀可用于结构布局，但不得携带颜色、间距、字体、阴影等视觉值。
- 少量全局 shortcut 可以保留，但必须是 token-backed、无业务语义、可审查的 `.rw-*` 或 `rw-*` 类；不得把颜色、间距和业务页面语义藏进 shortcut。

UnoCSS 禁止范围：

- 禁止 Uno 语法下的 `bg-*`、`text-*`、`border-*` 等颜色 utility 作为业务样式；Quasar `text-primary` / `bg-primary` 按上一节处理。
- 禁止 Uno 语法下的 `p-*`、`m-*`、`gap-*`、`space-*` 等 spacing utility 作为业务样式；需要间距 utility 时用 Quasar `q-*` scale。
- 禁止 Uno 语法下的 `shadow-*`、`rounded-*`、`text-[...]`、`bg-[...]`、任意 `[...]` arbitrary value。
- 禁止在 `uno.config.ts` 里写十六进制颜色、阴影、间距、字体尺寸等业务视觉 token。
- 禁止使用 UnoCSS shortcut 替代组件语义 class，例如把 `.overview-page` 的背景、文字色、间距藏成 `overview-page` shortcut。

`rewrite/uno.config.ts` 后续应收缩为结构性 preset + token-backed safelist / shortcut。当前 `primary/accent/surface/ink` 直接颜色和 `app-page` shortcut 应迁移或删除。

## 10. Component class rules

Naming:

- app/page/widget/feature component 的私有 class 使用 kebab-case root + BEM-like element / modifier。
- root 示例：`.app-shell`、`.overview-page`、`.summary-card`。
- element 示例：`.overview-page__header`、`.summary-card__caption`。
- modifier 示例：`.summary-card--warning`、`.app-navigation__item--active`。
- UI state class 使用 `is-active`、`is-disabled`、`is-loading`；业务状态不要直接写进 class 名，先由 feature 输出 UI snapshot。

Ownership:

- `pages/` class 只服务页面布局和页面 UI snapshot，不表达业务规则。
- `widgets/` class 只服务跨页面展示组件，不直接订阅 feature internal state。
- `features/<feature>/components` class 只服务本 feature 的 UI，不跨 feature 拼业务流程。
- 跨页面通用但无业务 owner 的 visual utility 使用 `.rw-*`，只能放在 `rewrite/src/css/layers/_utilities.scss`。

Usage:

- 组件 class 名应表达结构或语义，不表达颜色、间距或具体视觉值；禁止 `.blue-card`、`.mt-16-panel`、`.shadow-box`。
- scoped style 可以保留，但只能引用 `var(--rw-...)`、Quasar CSS variable、或从 SCSS token 暴露的 mixin/function。
- 不直接覆写 Quasar 深层内部 class；需要全局 override 时放在 `layers/_quasar.scss`，并说明影响范围。
- inline style 只允许动态几何值或 CSS custom property 注入，例如虚拟滚动尺寸；不得写颜色、阴影、字体、边框等视觉 token。

## 11. AGENTS.md hard rule addition

本轮已把以下硬规则最小补充到 `AGENTS.md` 的基础设施基线段落：

- rewrite UI 的颜色、背景、状态色、边框、阴影、间距、圆角、z-index 和字体层级必须先归口到 `rewrite/src/css` 下的 Quasar / SCSS token；业务组件、页面、widget、UnoCSS class 和 inline style 不得硬编码这些视觉 token。
- Quasar 官方组件 prop 和 helper class 可作为 Quasar token scale 使用，例如 `color="primary"`、`q-pa-*`、`row/col`、`text-h*`、`shadow-*`；app-specific surface、selected、device/status 等视觉语义仍必须写语义 class 并消费 token。
- UnoCSS 只允许承担结构性布局 utility 和 token-backed shortcut，不作为业务样式主系统；Quasar 组件和 SCSS token 是默认样式入口。
- 组件 class 必须按 app/page/widget/feature ownership 使用语义化命名，跨页面通用 visual utility 只能进入 token-backed `.rw-*` 基线类。

## 12. Implementation status and checklist

Current status:

1. Done: 创建 `rewrite/src/css` 最小文件结构：`quasar.variables.scss`、`app.scss`、`tokens/*`、`layers/*`。
2. Done: 在 `rewrite/quasar.config.ts` 中挂载 `css: ['app.scss']`。
3. Done: 将 Quasar brand variables 和 semantic colors 迁入 `quasar.variables.scss` 与 token 文件。
4. Done: 收缩 `rewrite/uno.config.ts`，删除十六进制颜色 theme 和 `app-page` shortcut。
5. Done: `rewrite/src/App.vue` 保留单一 UnoCSS import 入口。
6. Done: `AppShell.vue`、`HomePage.vue`、`AppNavigation.vue`、`SummaryMetricGrid.vue` 已迁移为 token-backed style。
7. Done: 静态扫描 `rewrite/src/app`、`rewrite/src/pages`、`rewrite/src/widgets`、`rewrite/uno.config.ts`，未发现 hex/rgb/hsl、裸 px/rem/em 视觉值或 Uno 视觉 utility。
8. Done: `pnpm -C rewrite lint` 通过。
9. Done: `pnpm -C rewrite build` 通过，Quasar UI、Electron main/preload 和 electron-builder 打包链路完成。

Remaining checklist:

- 后续 feature component 新增 UI 时，必须把本文列为 direct contract 或 boundary guard。
- 后续可在 `codestable/quality/rewrite-review-checklist.md` 或对应 feature checklist 中加入 UI style token gate。
- 若新增 app-specific visual role，先扩展 `rewrite/src/css/tokens`，再在组件中消费 `--rw-*` token。

## 13. Deferred

- 不决定最终视觉稿、品牌色细节或页面密度。
- 不设计 receive/send/task/SCOE/result/report/northbound 的业务 UI。
- 不建立 stylelint / ESLint 自定义规则；本轮只给出静态扫描和 review gate。
- 不声明后续新增 feature component 自动合规；新增 UI 仍需按本文规则单独扫描和验证。
