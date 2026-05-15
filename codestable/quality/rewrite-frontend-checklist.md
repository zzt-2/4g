---
doc_type: quality
type: rewrite-frontend-checklist
status: draft
date: 2026-05-11
summary: 前端 UI 自检 checklist，review/验收时逐项勾选。与 rewrite-frontend-conventions.md 对应。
tags:
  - rewrite
  - frontend
  - checklist
  - review
---

# Rewrite 前端 UI 自检 Checklist

对应规范：`codestable/quality/rewrite-frontend-conventions.md`。

review 或自检时按分组逐项检查。勾选 `- [x]` 表示通过。

---

## A. 样式检查

- [ ] 无硬编码 hex/rgb/hsl 色值（style、class、SCSS 中搜索 `#`、`rgb(`、`hsl(`）
- [ ] 无硬编码 px/rem/em 间距（padding、margin、gap 应走 token 或 Quasar class）
- [ ] 无硬编码 z-index（走 `rw-z-*` token）
- [ ] transition 无 `all`，只列具体属性
- [ ] CSS 动画只用 `transform` / `opacity`，无 layout 属性动画
- [ ] `will-change` 只用于 `transform` / `opacity`，无 `will-change: width/height`
- [ ] 弹窗宽度用语义 class（`rw-dialog-*`），无硬编码 `width: Npx`
- [ ] 无 inline style 直接消费 token（文本色、边框、背景 → 语义 class `rw-text-*`/`rw-divider-*`/`rw-panel-*`）

## B. Quasar 组件检查

- [ ] 无第三方 UI 组件库引入（ag-Grid、Lucide、vue-sonner 等）
- [ ] 颜色用 Quasar brand prop（`color="primary"`），无 CSS 覆盖组件视觉
- [ ] 禁用/dense/flat 等通过 prop 设置，无 CSS 模拟
- [ ] 删除操作有二次确认（`$q.dialog()` 或项目封装组件）
- [ ] 操作反馈用 `$q.notify()`，不用第三方 toast
- [ ] 图标用 Material Icons（`o_` 前缀），无第三方图标库

## C. 表格检查

- [ ] 数据表格用 QTable
- [ ] 行数可能 > 100 时启用了 `virtual-scroll` + `virtual-scroll-item-size` + 容器高度
- [ ] `row-key` 使用稳定唯一标识符（非 index）
- [ ] 列数 ≥ 3 时列定义抽到 `columns.ts`
- [ ] 空状态有 `#no-data` slot
- [ ] loading 用 QTable `:loading` prop
- [ ] 大数据集排序/分页走 service 层，非纯前端

## D. 表单检查

- [ ] 表单用 QForm + Quasar 表单组件，无原生 HTML 表单元素混用
- [ ] 校验用 QInput `:rules`（简单）或 feature service（复杂），无第三方校验库
- [ ] 校验错误走 `:error` + `:error-message`，不用 toast/q-tooltip 显示校验错误
- [ ] 禁用态用 `disable` / `readonly` prop，不用 CSS opacity/pointer-events
- [ ] 提交按钮有 `:loading` 或 `:disable` 防重复
- [ ] 超过 20 字段的表单已拆分为子组件

## E. 弹窗检查

- [ ] QDialog 使用 `v-model` 双向绑定（非单向 `:model-value`）
- [ ] 弹窗内有 `@hide` 清理定时器/订阅/表单
- [ ] 不需保持状态的弹窗用 `v-if`（非 `v-show`）

## F. 性能检查

- [ ] 高频数据路径（串口/网络/SCOE）有缓冲层，非逐条触发 Vue 响应式
- [ ] 大数组（>50元素）用 `shallowRef`，更新走整组替换
- [ ] 无 `watch(x, fn, { deep: true })` 监听大对象
- [ ] computed 返回对象/数组时引用稳定（无每次返回新引用的 .filter/.map）
- [ ] UI 定时器用 `requestAnimationFrame`（非 `setInterval`），且 onUnmounted 清理
- [ ] v-for 的 `:key` 是稳定唯一 ID（非 index）
- [ ] 模板中无内联 `.filter()` / `.map()` / `.reduce()`
- [ ] 仪表盘/总览页多区域布局用了 `v-memo` 限制重渲染

## G. 数据展示检查

- [ ] 数字有格式化（千分位、有效精度），非原始值直出
- [ ] 时间格式统一（`YYYY-MM-DD HH:mm:ss`），非 ISO 字符串或时间戳
- [ ] 状态用 QBadge + 状态色映射（positive/warning/negative/info），非裸文字+颜色
- [ ] 空值显示 `--`，非 `null` / `undefined` / `NaN`
- [ ] 物理量有单位标注（`12.5 V`、`25.3 ℃`）
- [ ] 长文本有截断 + QTooltip

## H. Electron 检查

- [ ] 高频 IPC 已批量化（main 端缓冲，16ms 批量发送）
- [ ] 单窗口 DOM 节点数 ≤ 3000
- [ ] 折叠面板/隐藏区域用 `v-if`（非 `v-show`）

## I. Composable 检查

- [ ] 异步操作用 `useAsyncAction()`，无手写 `operatingIds` Set + try-finally 清理
- [ ] 页面轮询用 `usePolling()`，无手写 rAF + disposed + 节流逻辑
- [ ] 通知用 `useNotify()`，无直接 `$q.notify({ type: 'positive/negative', ... })` 散落
- [ ] StatusBadge 使用泛型 `statusMap` 配置，无硬编码业务状态枚举
- [ ] 页面状态按 O1 分组声明（Service → 业务数据 → 查询/筛选 → UI → 派生 → 操作）
- [ ] 所有 `.catch()` / `catch {}` 非空，至少 `console.error`/`console.warn`（O2）
- [ ] 2+ 文件中的同一代码模式（标签映射、stable key、操作样板、默认值工厂）已提取（O3）
- [ ] 选项数组和标签映射在模块级定义，非 setup 内（O4）
