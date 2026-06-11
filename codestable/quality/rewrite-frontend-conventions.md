---
doc_type: quality
type: rewrite-frontend-conventions
status: draft
date: 2026-05-11
summary: 前端 UI 规范，讨论/设计/实施时参照。每条规则一句话 + 简短原因 + 一个示例。
tags:
  - rewrite
  - frontend
  - conventions
  - quasar
  - performance
---

# Rewrite 前端 UI 规范

样式 token 规则和 UnoCSS 结构性布局职责划分见 CLAUDE.md "目录与职责"，token 定义见 `rewrite/src/css/tokens/`，本文不重复。代码质量规则见 `rewrite-quality-rules.md`。自检 checklist 见 `rewrite-frontend-checklist.md`。

---

## 1. Quasar 组件使用

### Q1. UI 需求优先从 Quasar 内建方案解决

不引入第三方 UI 库（ag-Grid、Lucide、vue-sonner 等）。

```typescript
// ❌ 第三方 toast
import { toast } from 'vue-sonner'; toast.success('ok');
// ❌ 第三方图标
import { Trash2 } from 'lucide-vue-next';

// ✅ Quasar 内建
$q.notify({ type: 'positive', message: 'ok' });
<q-icon name="o_delete" />
```

### Q2. Quasar prop 控制视觉行为，不用 CSS 覆盖

```vue
<!-- ❌ -->
<q-input style="padding: 4px; height: 32px;" />
<q-btn style="box-shadow: none; background: transparent;" />

<!-- ✅ -->
<q-input dense />
<q-btn flat color="primary" />
```

### Q3. 颜色使用 Quasar brand prop，不硬编码

```vue
<!-- ❌ -->
<q-btn style="background: #1f6feb; color: white;" />
<q-badge style="color: green;">已连接</q-badge>

<!-- ✅ -->
<q-btn color="primary" />
<q-badge color="positive">已连接</q-badge>
```

### Q4. 确认和反馈走 Quasar plugin

删除确认用 `$q.dialog()`，操作反馈用 `$q.notify()`。不用 `window.confirm/alert`。

```typescript
// ❌
if (window.confirm('确定删除？')) doDelete();

// ✅
$q.dialog({ title: '确认删除', message: '不可恢复', cancel: true }).onOk(doDelete);
```

### Q5. 删除操作必须二次确认

级联删除用项目封装的二次确认组件（需输入关键词）。批量操作必须显示进度。

---

## 2. 表格

### T1. 表格用 QTable，大列表开虚拟滚动

行数可能超 100 必须开 `virtual-scroll` + 设 `virtual-scroll-item-size` + 设容器高度。

```vue
<!-- ❌ 10000 行全渲染 -->
<q-table :rows="allData" />

<!-- ✅ -->
<q-table
  :rows="data" virtual-scroll
  :virtual-scroll-item-size="48"
  :table-style="{ maxHeight: 'calc(100vh - 200px)' }"
  :rows-per-page-options="[0]"
  row-key="id"
/>
```

### T2. 列数 ≥ 3 或有自定义渲染时，列定义抽到 `columns.ts`

列宽策略：文本列自适应、状态列设 min-width、操作列固定宽度。不用百分比宽度。QTable `headerStyle` / `style` 中使用 px 值是 API 要求，不视为硬编码违规。

### T3. 大数据集排序和分页走 service 层

数据量 > 100 行时排序由 feature service 处理，分页用 QTable server-side 模式 + `@request`。不前端排序分页混合。

### T4. 空状态和 loading 必须显式处理

```vue
<q-table :loading="isLoading">
  <template #no-data>
    <div class="text-center q-pa-lg text-muted">暂无数据</div>
  </template>
</q-table>
```

### T5. 行选中用 QTable selection，选中色走 token

```vue
<!-- ❌ 在数据对象上加 _selected 字段，硬编码背景色 -->
:style="{ background: selectedRows.includes(row) ? '#e8f1ff' : '' }"

<!-- ✅ -->
<q-table selection="multiple" v-model:selected="selected" />
```

---

## 3. 表单

### F1. 表单用 QForm + Quasar 表单组件

不混用 HTML 原生表单元素。校验用 QInput `:rules` prop（简单）或 feature service（复杂）。不用第三方校验库。

```typescript
// ✅ 简单校验
<q-input v-model="name" :rules="[val => !!val || '请输入名称']" />

// ✅ 复杂校验在 service 层
const result = await taskService.validateConfig(config);
```

### F2. 校验错误用组件 error slot，不用 toast

错误信息走 `:error` + `:error-message`，颜色走 `status-danger` token。

### F3. 超过 20 个字段必须拆分子组件

每个子组件管理自己的响应式数据，隔离 Vue 依赖追踪范围。动态字段超 50 用 QVirtualScroll 承载。QInput 校验用 `lazy-rules="ondemand"`。

### F4. 提交按钮必须 disable/loading 防重复

```vue
<q-btn label="提交" :loading="isSubmitting" @click="submit" />
```

---

## 4. 弹窗

### D1. 弹窗用 QDialog，双向绑定 + @hide 清理

```vue
<!-- ❌ 单向绑定，无法关闭 -->
<q-dialog :model-value="show">

<!-- ✅ -->
<q-dialog v-model="show" @hide="resetForm">
  <q-card>...</q-card>
</q-dialog>
```

### D2. 弹窗宽度用语义 class，不硬编码

定义在 `css/tokens/_size.scss` + `css/layers/_utilities.scss`：

| class | min-width | 用途 |
|-------|-----------|------|
| `rw-dialog-sm` | 400px | 单字段确认、简单选择 |
| `rw-dialog-md` | 560px | 表单、配置编辑 |
| `rw-dialog-lg` | 720px | 多字段编辑、预览 |
| `rw-dialog-xl` | 960px | 复合编辑器（任务编辑器、帧编辑器） |

所有 class 带 `max-width: 80vw` 响应式下限。禁止在 `<q-card>` 或 scoped SCSS 中硬编码 `min-width`/`max-width` px 值。

```vue
<!-- ❌ -->
<q-card style="width: 600px; max-width: 80vw;">

<!-- ✅ -->
<q-card class="rw-dialog-md">
```

---

## 5. 页面布局

### L1. 页面内边距用 `p-page` / `p-page-compact` UnoCSS class

工具栏与内容区间距用 `gap-4`。结构性布局（间距、flex、grid、display、position、sizing）全部走 UnoCSS utility class，不在 `<style>` 中声明。

### L2. 侧边栏用 QDrawer，宽度走 `app-drawer` token（232px）

### L3. 桌面不做移动端适配

不用 xs/sm 断点、不引入 touch 手势库。响应式仅处理窗口缩小，下限 `breakpoint.page-compact`（720px）。

---

## 6. 颜色与状态色

### C1. 颜色只用 semantic-colors token 或 Quasar brand 色

禁止在 style/class/SCSS 中硬编码 hex/rgb/hsl。

```scss
// ✅ SCSS
.error-text { color: rw-color('status-danger'); }
// ✅ CSS 变量
background: var(--rw-color-surface-selected);
// ✅ Quasar
<q-badge color="negative">
```

### C2. 状态色固定映射

| 语义 | Token | Quasar color |
|------|-------|-------------|
| 成功/正常/在线 | `status-success` | `positive` |
| 警告/注意 | `status-warning` | `warning` |
| 错误/失败/离线 | `status-danger` | `negative` |
| 信息/提示 | `status-info` | `info` |
| 选中/激活 | `surface-selected` | — |
| 禁用/静默 | `text-muted` | — |

### C3. 文字颜色分级

| 层级 | Token | 用途 |
|------|-------|------|
| 主要 | `text-primary` | 标题、重要数据 |
| 默认 | `text-default` | 正文、表格内容 |
| 次要 | `text-secondary` | 描述、辅助信息 |
| 弱化 | `text-muted` | 时间戳、placeholder |
| 最弱 | `text-subtle` | 禁用态、hint |

### C4. Token 消费必须走语义 class，禁止 inline style 消费 token

禁止在模板 inline style 中直接使用 color/border/background token。已有语义 class 的 token 必须用 class；同一 token 消费模式出现 2+ 次但尚无 class 时，先提取语义 class 再使用。

```vue
<!-- ❌ -->
<span style="color: var(--rw-color-text-muted)">ID</span>
<span style="color: var(--rw-color-text-primary)">{{ value }}</span>
<div style="border-bottom: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle)">

<!-- ✅ -->
<span class="rw-text-label">ID</span>
<span class="rw-text-value">{{ value }}</span>
<div class="rw-divider-b">
```

以下语义 class 在 `css/layers/_utilities.scss` 中统一定义：

**文本色**

| class | 效果 | 用途 |
|-------|------|------|
| `rw-text-label` | `color: var(--rw-color-text-muted)` | 字段标签、小标题 |
| `rw-text-value` | `color: var(--rw-color-text-primary)` | 字段值、重要数据 |
| `rw-text-desc` | `color: var(--rw-color-text-secondary)` | 描述、辅助文字 |
| `rw-text-error` | `color: var(--rw-color-status-danger)` | 错误提示 |
| `rw-text-warn` | `color: var(--rw-color-status-warning)` | 警告提示 |

**边框**

| class | 效果 | 用途 |
|-------|------|------|
| `rw-divider-b` | `border-bottom: ... solid var(--rw-color-border-subtle)` | 区域分隔 |
| `rw-divider-t` | `border-top: ... solid var(--rw-color-border-subtle)` | 区域分隔 |
| `rw-divider-l` | `border-left: ... solid var(--rw-color-border-subtle)` | 侧边面板分隔 |

**面板 / 弹窗**

| class | 效果 | 用途 |
|-------|------|------|
| `rw-panel-base` | `background: var(--rw-color-surface-base)` | 基础面板背景 |
| `rw-dialog-sm/md/lg/xl` | 弹窗宽度 | 见 §4 D2 |

不在上表中的 token 消费模式出现 2+ 次时，按同一规则提取并补充。

---

## 7. 数据展示

### V1. 数字格式化

整数不带小数，大数加千分位，百分比带 `%`，浮点保留有效精度。格式化函数放 `shared/`。

```vue
<!-- ❌ --> <span>{{ rawValue }}</span>  <!-- 1234567.890000001 -->
<!-- ✅ --> <span>{{ formatNumber(rawValue) }}</span>  <!-- 1,234,567.89 -->
```

### V2. 时间格式化

日期时间 `YYYY-MM-DD HH:mm:ss`，仅日期 `YYYY-MM-DD`。相对时间只用于实时日志，不用于历史记录。不直接展示 ISO 字符串或时间戳。

### V3. 状态用 QBadge + 状态色，空值显示 `--`

不显示 `null` / `undefined` / `NaN`。不裸用文字+颜色替代 badge。

状态 badge 组件必须泛型化，不硬编码特定业务状态枚举。通过 `statusMap` 配置映射：

```vue
<!-- ❌ 硬编码 ConnectionLifecycleStatus -->
<StatusBadge :status="conn.lifecycle" />

<!-- ✅ 泛型 + 外部映射 -->
<StatusBadge :status="conn.lifecycle" :status-map="connectionStatusMap" />
<StatusBadge :status="task.state" :status-map="taskStatusMap" />
```

`statusMap` 类型：`Record<string, { label: string; color: string }>`。各 feature 在自己的 `components/` 或 `types` 中定义对应的映射常量。

### V4. 物理量必须标注单位，长文本截断 + QTooltip

电压 `12.5 V`，温度 `25.3 ℃`，百分比 `85.3%`（无空格）。超长文本用 CSS 截断，QTooltip 展示全文。

### V5. 无数据流时 UI 必须降级占位，不报错不显示随机 ID

receive 管线未跑、帧未匹配、用户未配置字段选择时，图表/表格/散点数据为空是**正常状态**，UI 必须：

- 显示占位提示（如"点击设置选择字段"、"暂无数据"、"等待数据流入"），引导用户下一步操作。
- 不崩溃、不抛错、不显示原始 fieldId/UUID/随机字符串作为图例或表头。
- 不为空状态加默认值或自动选字段（避免选错业务意图）。

实现位置：

- 表格空状态：QTable `no-data` slot 或 `loading/noDataLabel`。
- 图表空状态：WaveformChart/DisplayPanel 在 `series.length === 0` 或 `points.length === 0` 时 `v-if` 渲染占位 `<div>`。
- 散点空状态：同理。

fieldName/frameName 等静态信息在无数据流时也必须能从帧定义（frameReader）解析显示，不能依赖运行时 sourceFields（见 quality-rules R19）。

---

## 8. 性能

> 本章规则全部来源于旧系统实际踩坑，是 rewrite 性能底线。

### P1. 高频数据必须缓冲后批量刷新

串口/网络/SCOE 数据不得逐条触发 Vue 响应式。用 rAF（16ms）或定时器缓冲，每帧批量刷一次。UI 刷新频率与数据源频率解耦。

```typescript
// ❌ 旧系统：每包数据直接穿透到 store
serialPort.on('data', data => store.handleReceivedData(data));

// ✅ 缓冲层
let pending: Frame[] = [];
let rafId: number | null = null;
function pushFrame(frame: Frame) {
  pending.push(frame);
  if (!rafId) rafId = requestAnimationFrame(flush);
}
function flush() {
  displayData.value = [...pending]; pending = [];
  rafId = null;
}
```

### P2. 大数组/大对象用 shallowRef，整组替换

超 50 元素的数组、嵌套超 2 层的对象用 `shallowRef`。更新时 `arr.value = newArr`，不用 `.push()` / `.splice()`。第三方实例和历史数据用 `markRaw()`。

```typescript
// ❌
const list = reactive<Frame[]>([]); list.push(newFrame);
// ✅
const list = shallowRef<Frame[]>([]); list.value = [...list.value, newFrame];
```

### P3. 禁止 deep watch 大对象

超 20 属性的对象或超 10 元素的数组禁止 `watch(x, fn, { deep: true })`。改为监听具体 computed、在变更点主动调用。

```typescript
// ❌
watch(() => config, handler, { deep: true });
// ✅
watch(() => config.groups.length, () => rebuild());
// 或在变更点显式调用 rebuild()
```

### P4. computed 返回对象/数组必须保持引用稳定

避免 `.filter()` / `.map()` 直接返回（每次新引用）。Vue 3.4+ 用 computed 的 oldValue 参数比较。

推荐模式：表格行数据、筛选结果等派生数组用 `shallowRef` + `watch` 手动更新，不用 `computed` + `.map()`/`.filter()`。

```typescript
// ❌ 每次 frameList 变化都创建全新数组，触发下游全量 diff
const tableRows = computed(() =>
  frameList.value.map((f, i) => ({ ...f, _index: i + 1 })),
);

// ✅ shallowRef + watch，整组替换（与 P2 一致）
const tableRows = shallowRef<TableRow[]>([]);
watch(frameList, (list) => {
  tableRows.value = list.map((f, i) => ({ ...f, _index: i + 1 }));
}, { immediate: true });
```

少量数据（< 50 条）时 computed 也勉强可用，但后续页面数据量可能增大，统一使用 shallowRef 模式减少认知负担。

### P5. 定时器用 requestAnimationFrame，不用 setInterval

UI 更新和动画驱动用 rAF。长周期轮询（≥1s）可用 setInterval，但必须 onUnmounted 清理。

```typescript
// ❌ 旧系统：setInterval(fn, 500) 更新表格
// ✅ rAF + 节流
let last = 0;
function loop(now: number) {
  if (now - last >= 500) { updateTable(); last = now; }
  rafId = requestAnimationFrame(loop);
}
```

### P6. v-for 必须用稳定唯一 key，不用 index

```vue
<!-- ❌ --> <div v-for="(item, i) in list" :key="i">
<!-- ✅ --> <div v-for="item in list" :key="item.id">
```

### P7. 仪表盘用 v-memo 限制重渲染范围

```vue
<ConnectionPanel v-memo="[connectionState]" :state="connectionState" />
<FrameMetrics v-memo="[frameSnapshot]" :data="frameSnapshot" />
```

### P8. 模板中禁止内联 .filter() / .map() / .reduce()

提取到 computed。

---

## 9. CSS 动画

### A1. transition 禁用 `all`，只列具体属性

```css
/* ❌ */ transition: all 0.3s;
/* ✅ */ transition: transform 0.3s ease, opacity 0.3s ease;
```

### A2. 动画只用 transform 和 opacity（composite 属性）

禁止动画 width/height/top/left/margin 等 layout 属性。状态指示器动画用 CSS @keyframes，不用 JS setInterval 驱动。will-change 只用于 transform/opacity，优先用 `transform: translateZ(0)` 替代。

---

## 10. Electron UI

### E1. IPC 高频数据必须批量化

main 进程缓冲串口/网络数据，16ms 批量发送一次。renderer 侧走 P1 缓冲模式。低频操作可直接 IPC。

### E2. 提供硬件加速开关

应用设置中提供开关，启动时处理 `gpu-process-crashed` 事件。支持 `--disable-gpu` 参数。

### E3. 控制单窗口 DOM 节点 ≤ 3000

虚拟滚动、懒渲染、v-if（非 v-show）是主要手段。折叠面板折叠时不渲染内容。

---

## 11. 页面 Composable 模式

页面中以下三种模式不得手写，必须使用对应 composable。

### CM1. 异步操作用 `useAsyncAction()`

操作锁（operatingIds）、try-finally 清理、错误通知统一由 composable 管理。

```typescript
// ❌ 手写 operatingIds Set + try-finally
const operatingIds = ref<Set<string>>(new Set());
async function handleConnect(s: ConnectionSummary) {
  operatingIds.value = new Set(operatingIds.value).add(s.connectionId);
  try { /* ... */ }
  finally { const next = new Set(operatingIds.value); next.delete(s.connectionId); operatingIds.value = next; }
}

// ✅ composable
const { execute, isOperating } = useAsyncAction();
async function handleConnect(s: ConnectionSummary) {
  await execute(s.connectionId, async () => {
    const result = await service.connect(config);
    // composable 负责 finally 清理 + 错误时 $q.notify
  });
}
```

composable 返回：
- `isOperating(id: string): boolean` — 查询操作锁
- `execute<T>(id: string, fn: () => Promise<T>): Promise<T | undefined>` — 带锁执行，自动清理，失败时 `$q.notify({ type: 'negative' })`

### CM2. 页面轮询用 `usePolling()`

rAF + 节流 + disposed 检查 + onUnmounted 清理统一由 composable 管理。

```typescript
// ❌ 手写 rAF + disposed + 节流
let rafId = 0; let lastPollTime = 0; const disposed = ref(false);
function tick(now: number) { /* ... */ rafId = requestAnimationFrame(tick); }
onMounted(() => { rafId = requestAnimationFrame(tick); });
onBeforeUnmount(() => { disposed.value = true; if (rafId) cancelAnimationFrame(rafId); });

// ✅ composable
const { start } = usePolling(() => refreshSummaries(), 500);
onMounted(start);
```

composable 返回：
- `start(): void` — 启动轮询
- `stop(): void` — 停止轮询
- `restart(): void` — 重启轮询
- 内部自动 onUnmounted 清理

### CM3. 通知用 `useNotify()`

封装 `$q.notify` 的成功/失败/警告模式，统一消息格式。

```typescript
const notify = useNotify();
notify.success('连接已创建');
notify.error('连接失败', result.error?.message);
notify.info('操作已取消');
```

---

## 12. 页面代码组织

### O1. 状态声明按用途分组

页面 `<script setup>` 中的 ref/computed/shallowRef 按以下顺序声明，组间空一行：

```typescript
// ===== Service 引用 =====
const service = runtime.features.xxxService;

// ===== 业务数据 =====
const items = ref<readonly Xxx[]>([]);

// ===== 查询/筛选 =====
const searchText = ref('');
const statusFilter = ref<Status | ''>('');

// ===== UI 状态 =====
const showDialog = ref(false);
const selectedIds = ref<string[]>([]);

// ===== 派生数据 =====
const tableRows = shallowRef<TableRow[]>([]);

// ===== 操作 =====
const { execute, isOperating } = useAsyncAction();
const notify = useNotify();
```

### O2. 禁止静默吞错误

所有 catch 块必须至少 log（`console.error`/`console.warn`）或 notify。空 catch 体（`catch {}` / `catch () {}`）禁止出现。runtime tick、service 调用、文件 I/O、computed 内部、异步操作一律适用。

```typescript
// ❌ 空 catch 静默吞错误
routingTick(wiredFeatures).catch(() => {});
try { buildPreview(); } catch { /* nothing */ }

// ✅ 至少记录错误
routingTick(wiredFeatures).catch((err) => console.error('[routingTick]', err));
try { buildPreview(); } catch (err) { console.error('preview failed', err); }
```

### O3. 2+ 处出现的同一代码模式必须提取

标签映射、选项数组、stable key 管理、数组操作样板、默认值工厂等，出现在 2+ 文件/函数中时，提取到 composable、shared 常量或辅助函数。不允许复制粘贴后微调。

### O4. 不变数据定义在模块级

选项数组、标签映射、枚举→标签 Record 等不随组件实例变化的数据，定义在 `<script setup>` 外（模块级常量）。setup 每次挂载都会执行，不应在其中重建不变数据。
