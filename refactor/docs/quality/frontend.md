# 前端代码质量规则

> 实施阶段（3xx）代码质量标准。每条规则附示例，agent 和开发者对照执行。
>
> **硬规则** — 违反即为缺陷，必须修复。
> **经验规则** — 应当遵守；如有例外，需在代码中注释说明理由。
>
> 与 [前端开发指南](../conventions/frontend.md) 的分工：convention 讲"怎么写"（完整模式与教程），本文档讲"写到什么程度才算合格"（检查标准）。

---

## 硬规则

### 类型安全

#### H1. 禁止 `any` 类型

所有变量、参数、props 必须有明确类型。`any` 让 TypeScript 保护完全失效。

```typescript
// ❌
const rawData: any = await fetchData();
function handleSelect(row: any) { ... }
defineProps<{ data: any }>();
const normalizeSteps = (steps: any[]): any[] => ...;

// ✅
const rawData: TemplateListResponse = await fetchData();
function handleSelect(row: TemplateItem) { ... }
defineProps<{ data: TemplateItem }>();
const normalizeSteps = (steps: StepRaw[]): StepNormalized[] => ...;
```

**例外**：`@/api/` 自动生成的类型如果因 OpenAPI spec 不完整而包含 `any`，在调用处用类型断言修复，但不修改生成文件。

### 代码结构

#### H2. 组件 SFC 不超过 300 行

| 阈值 | 状态 | 行动 |
|------|------|------|
| < 250 行 | 理想 | — |
| 250–300 行 | 注意 | 评估是否可拆 |
| 300–400 行 | 必须拆分 | 拆出子组件或 composable |
| > 400 行 | 架构问题 | 停下来重新设计 |

拆分优先级：
1. 提取子组件到 `components/business/<模块>/`
2. 提取逻辑到 `composables/useXxx.ts`
3. 提取列定义到 `columns.ts`

#### H3. props / emits 必须有完整 TypeScript 类型

```typescript
// ❌
defineProps(['data', 'onChange']);
emit('update');

// ✅
interface Props {
  data: TemplateItem;
  disabled?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update', id: string): void;
  (e: 'success'): void;
}>();
```

### 目录职责

#### H4. `pages/` 目录只放路由文件

`unplugin-vue-router` 会把 `pages/` 下**所有** `.vue` 文件注册为路由。子组件被误注册会导致导航崩溃。`pages/` 下只放 `index.vue` + `columns.ts` 等纯数据文件，子组件（FormDialog、Panel 等）放 `components/business/<模块>/`。

```
pages/
  admin/
    domain/
      index.vue          ✅ 路由页面
      columns.ts         ✅ 列定义
      DomainFormDialog.vue  ❌ 会被注册为路由！

components/
  business/
    domain/
      DomainFormDialog.vue  ✅ 正确位置
```

### 常量与硬编码

#### H5. 禁止前端硬编码枚举选项

所有系统枚举（状态、分类、优先级等）统一用 `@thesis/shared` 的 `DictKey`，搭配 `DictSelect` / `DictMultiSelect` / `StatusBadge` 组件。

```typescript
// ❌
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];

// ✅
import { DictKey } from '@thesis/shared';
```
```vue
<DictSelect :type="DictKey.DOCUMENT_STATUS" />
<StatusBadge :type="DictKey.DOCUMENT_STATUS" :value="row.status" />
```

#### H6. 禁止硬编码魔法数字和字符串

```typescript
// ❌ — 裸数字，看不出含义
const Y_GAP = 130;
const X_CENTER = 400;
if (res.status === 200) { ... }

// ✅ — 语义化命名
const CANVAS_LAYOUT = {
  /** 节点垂直间距 */
  Y_GAP: 130,
  /** 画布水平中心点 */
  X_CENTER: 400,
  /** 并行节点水平间距 */
  PARALLEL_X_GAP: 300,
} as const;
```

### 重复与复用

#### H7. DRY 三次法则

同一逻辑在第三处出现时必须提取到 `components/common/` 或 `composables/`。

```vue
<!-- ❌ — 多个弹窗重复相同的打开/关闭/重置逻辑 -->
```
```typescript
// ✅ — 提取为 composable
const { isOpen, open, close } = useFormDialog();
```

#### H8. 新建组件前先检查 `components/common/` 是否已有

| 需求 | 已有组件 |
|------|---------|
| 删除确认 | `ConfirmDialog` / `TwoStepConfirmDialog` |
| 字典下拉 | `DictSelect` / `DictMultiSelect` |
| 状态标签 | `StatusBadge` |
| 详情页布局 | `DetailPageShell` |
| 空状态展示 | `EmptyState` |
| Markdown 渲染 | `MarkdownViewer` |

新建通用组件前，先确认 `common/` 目录下确实没有可复用的。如果是业务专属组件，放 `components/business/<模块>/`。

### 导入规范

#### H9. 禁止手动 import 自动导入项

Vue API、VueUse、composables、utils、stores、所有组件均由 `unplugin-auto-import` 和 `unplugin-vue-components` 自动注册。

```typescript
// ❌
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDark } from '@vueuse/core';
import StatusBadge from '@/components/common/dict/StatusBadge.vue';
import { useFilters } from '@/composables/useFilters';
import { formatDate } from '@/utils/formatDate';

// ✅ — 直接使用，无需 import
const count = ref(0);
const router = useRouter();
const isDark = useDark();
```

**唯一例外**：`.ts` 文件（如 `columns.ts`）中需要手动 import UI 组件，因为 auto-import 只在 SFC 中生效。

### 表单与弹窗

#### H10. 禁止表单双轨制

所有待提交数据必须收敛进 Zod Schema + `useForm`。不允许一半字段用 `useForm`、另一半用 `reactive` / `ref`，提交时手动拼装。

```typescript
// ❌ — 一半用表单，一半用 ref
const { handleSubmit } = useForm({ validationSchema: schema });
const extraField = ref('');
// 提交: { ...formValues, extra: extraField.value }

// ✅ — 全部收敛进 schema
const formSchema = toTypedSchema(z.object({
  name: z.string().min(1),
  extraField: z.string(),
}));
const { handleSubmit } = useForm({ validationSchema: formSchema });
```

自定义 UI 控件用 `<FormField v-slot="{ componentField }">` + `v-bind="componentField"` 接入，不用 `@update:model-value` 手工代理。

#### H11. 弹窗状态重置必须在 `if (open)` 分支内

`watch(open)` 中 `!open`（关闭动画期间）重置数据会导致视觉闪烁（Flicker Bug）。

```typescript
// ❌ — 关闭时重置，动画期间闪空
watch(open, (v) => {
  if (!v) {
    resetForm();
    formData.value = {};
  }
});

// ✅ — 打开时重置
watch(open, (v) => {
  if (v) {
    resetForm();
  }
});
```

#### H12. Dialog 必须使用 `v-model:open` 或补上 `@update:open`

只写 `:open` 不写关闭回调，弹窗无法通过内部交互（点遮罩、点 ×、ESC）关闭。

```vue
<!-- ❌ — 只绑了 open，无法关闭 -->
<Dialog :open="dialogOpen">
  <DialogContent>...</DialogContent>
</Dialog>

<!-- ✅ — v-model 双向绑定 -->
<Dialog v-model:open="dialogOpen">
  <DialogContent>...</DialogContent>
</Dialog>

<!-- ✅ — 或补上 handler -->
<Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
  <DialogContent>...</DialogContent>
</Dialog>
```

### 删除确认

#### H13. 禁止裸写 AlertDialog 做删除确认

必须使用封装组件，根据场景选择：

| 场景 | 组件 |
|------|------|
| 级联删除 / 不可恢复且影响大 | `TwoStepConfirmDialog`（需输入关键词二次确认） |
| 普通单条删除 | `ConfirmDialog`（Trigger 模式）或受控 `TwoStepConfirmDialog` |

```vue
<!-- ❌ — 裸写 AlertDialog -->
<AlertDialog>
  <AlertDialogTrigger>删除</AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogAction @click="handleDelete">确认</AlertDialogAction>
  </AlertDialogContent>
</AlertDialog>

<!-- ✅ — 普通删除 -->
<ConfirmDialog
  title="确认删除"
  description="删除后不可恢复"
  @confirm="handleDelete"
>
  <template #trigger>
    <Button variant="ghost" size="sm">删除</Button>
  </template>
</ConfirmDialog>

<!-- ✅ — 级联删除 -->
<TwoStepConfirmDialog
  v-model:open="showDeleteConfirm"
  :keyword="domainName"
  @confirm="handleCascadeDelete"
/>
```

> 注意：`ConfirmDialog` 使用 slot 触发器模式。如果删除按钮在 `columns.ts` 的 `h()` 渲染函数中，无法使用 slot，改用受控模式的 `TwoStepConfirmDialog`。

### API 调用

#### H14. API 调用统一通过 useQuery / useMutation

不使用原始 `fetch` 或直接调用 SDK 函数做数据查询。下拉选项等场景也必须用 `useQuery`，TanStack Query 会自动缓存去重。

```typescript
// ❌
const options = await adminDomainFindAll();

// ✅
const { data } = useQuery(adminDomainFindAllOptions());
```

#### H15. 不使用 `onError` 处理 API 错误

全局 HTTP 拦截器已统一处理错误提示。在 `useQuery` / `useMutation` 中写 `onError` 会导致双重处理（用户看到两次 toast）。

```typescript
// ❌ — 双重错误提示
const { mutate } = useMutation({
  ...adminTemplateUpdateMutation(),
  onSuccess: () => { toast.success('修改成功'); },
  onError: (err) => { toast.error(err.message); }, // 全局拦截器已经 toast 了
});

// ✅ — 只处理成功，错误交给全局拦截器
const { mutate } = useMutation({
  ...adminTemplateUpdateMutation(),
  onSuccess: () => { toast.success('修改成功'); },
});
```

#### H16. FormDialog 的 `onSuccess` 只做三件事

toast 提示、关闭弹窗、emit success。**列表刷新由父组件通过 `@success` 处理**。`invalidateQueries` 用 `queryKey: [{ _id }]` 部分匹配，不用 `predicate`。

```typescript
// ❌ — FormDialog 内部 invalidateQueries
onSuccess: () => {
  toast.success('创建成功');
  queryClient.invalidateQueries({ queryKey: [...] });
  emit('update:open', false);
};

// ✅ — FormDialog 只负责自己
onSuccess: () => {
  toast.success('创建成功');
  emit('update:open', false);
  emit('success');
};

// 父组件处理刷新
function handleDialogSuccess() {
  queryClient.invalidateQueries({ queryKey: [{ _id: 'adminXxxFindAll' }] });
}
```

---

## 经验规则

### 组件拆分时机

#### E1. 超过 250 行时主动评估拆分

不要等到 300 行红线。拆分信号：

- 模板中有 3 个以上逻辑独立的区域
- 有重复的 DOM 结构出现两次以上
- 有独立的加载 / 错误 / 空状态处理
- `script setup` 中有超过 3 段不相关的逻辑

### 页面组件职责

#### E2. 页面文件只做数据获取 + 布局编排

`pages/` 下的文件不应包含复杂业务逻辑。业务逻辑提取到 composable 或 business 组件。

```vue
<!-- ❌ — 页面文件 200 行数据处理逻辑 -->
<script setup lang="ts">
// 各种 filter、transform、业务判断...
</script>

<!-- ✅ — 页面只做编排 -->
<script setup lang="ts">
const { data, isLoading } = useQuery(...);
const { mutate } = useMutation(...);
const columns = createColumns({ onEdit, onDelete });
</script>
```

### 条件查询

#### E3. 弹窗/条件面板内的查询使用 `enabled` 控制

避免组件挂载时就发无用请求。

```typescript
// ❌ — 弹窗未打开就发请求
const { data } = useQuery(adminXxxListAllOptions());

// ✅ — 弹窗打开时才查询
const { data } = useQuery(
  computed(() => ({
    ...adminXxxListAllOptions(),
    enabled: dialogOpen.value,
  })),
);
```

### 抽取时机

#### E4. 不要过早提取

不是所有重复都需要立刻消除：

- 只出现两次，且变化节奏不同
- 提取后需要传大量 props / emit（组件接口反而更复杂）
- "相似"但语义不同（只是恰好长得像）

遵循三次法则：等第三次出现再提取。提取前先检查 `components/common/` 是否已有可复用组件。

### 样式规范

#### E5. 使用语义化颜色 + CSS 禁令

使用 shadcn 语义化 CSS 变量（`text-destructive`、`text-muted-foreground` 等），不直接写色值。

```vue
<!-- ❌ -->
<span class="text-red-500">错误</span>
<span class="text-gray-500">次要信息</span>

<!-- ✅ -->
<span class="text-destructive">错误</span>
<span class="text-muted-foreground">次要信息</span>
```

CSS 额外禁令：

| 禁止 | 原因 |
|------|------|
| 引入第二个 CSS 引擎（UnoCSS / WindiCSS） | 项目只用 TailwindCSS |
| 创建第二套 CSS 变量 | 所有变量在 `:root` 和 `.dark` 中统一定义 |
| 使用 SCSS | 不需要嵌套语法时不引入额外编译器 |
| 硬编码 z-index | 如需多层级管理，定义 CSS 变量 |

### 数据不可变性

#### E6. 修改 props 传入的对象前必须深拷贝

直接修改 props 对象违反单向数据流，会导致难以追踪的 bug。

```typescript
// ❌ — 直接修改 props 对象
function handleUpdate(row: Item) {
  row.status = 'active';
}

// ✅ — 深拷贝后修改
function handleUpdate(row: Item) {
  const updated = structuredClone(row);
  updated.status = 'active';
  mutate(updated);
}
```

### 注释边界

#### E7. 注释解释 why 不解释 what

```vue
<!-- ❌ -->
<!-- 表格列定义 -->
const columns = [...]

<!-- ✅ -->
<!-- force-mount 防止切换 Tab 时表单草稿丢失 -->
<TabsContent force-mount v-show="activeTab === 'basic'">
```

### 全局状态

#### E8. 全局 composable 有清晰的 scope / owner 管理

使用 Pinia store 或带 owner 标识的 composable，确保页面切换时不会互相干扰。服务端数据一律走 TanStack Query，不在 Pinia 中缓存。

```typescript
// ❌ — 全局 composable 没有隔离
const { data } = useGlobalState(); // 多个页面实例会互相覆盖

// ✅ — 带 scope 或用 TanStack Query 自动管理
const { data } = useQuery(
  computed(() => adminXxxFindOneOptions({ path: { id: route.params.id } }))
);
```

---

## 已知陷阱

> 这些是项目中踩过的具体坑，按"触发条件 → 后果 → 修复"格式记录。实施时注意回避。

#### T1. `<Teleport>` 必须加 `defer` 属性

初始页面加载时挂载点可能还没渲染，不加 `defer` 会崩溃。

```vue
<!-- ❌ — 挂载点不存在时报错 -->
<Teleport to="#header-actions">

<!-- ✅ -->
<Teleport defer to="#header-actions">
```

#### T2. `SelectItem` 的 value 必须是非空 string

传数字或空字符串会导致组件行为异常（选中不回显、清不掉等）。

```vue
<!-- ❌ -->
<SelectItem :value="0">禁用</SelectItem>
<SelectItem :value="">请选择</SelectItem>

<!-- ✅ -->
<SelectItem value="0">禁用</SelectItem>
<SelectItem value="_none_">请选择</SelectItem>
```

#### T3. `setTabs` 的 `tabOwner` 不能用 `computed`

`onUnmounted` 执行时路由参数已变，computed 会算出错误的 owner，导致 `clearTabs` 匹配失败、tabs 残留。必须在 setup 时用固定字符串赋值。

```typescript
// ❌
const tabOwner = computed(() => `/admin/domain/${id.value}`);

// ✅
const tabOwner = `/admin/domain/${id.value}`;
```

#### T4. `watch` 外部数据源（useQuery 结果）无条件覆盖表单

服务端数据刷新后覆盖用户正在编辑的内容。

```typescript
// ❌ — 每次服务端数据变化都覆盖表单
watch(data, (newData) => {
  if (newData) setValues(newData);
});

// ✅ — 加防护，只在首次加载时填充
const hasLoaded = ref(false);
watch(data, (newData) => {
  if (newData && !hasLoaded.value) {
    setValues(newData);
    hasLoaded.value = true;
  }
});
```

#### T5. Vite HMR 对递归组件有 bug

修改递归组件（如树）后 HMR 表现诡异，子层级卡旧缓存。修改后必须 `F5` 硬刷新页面。

#### T6. 列表行内放交互式 Checkbox 导致事件冒泡死锁

行点击和 Checkbox 点击互相触发。改用纯 CSS + SVG（如 `<Check>` 图标）渲染视觉假 Checkbox，由整行统管点击事件。

#### T7. `@vueuse/useSortable` 在弹窗内拖拽无反应

弃用 `@vueuse` 改用 `<VueDraggable>`；给子项文字加 `select-none` 防原生选中吞噬事件；组件传 `:forceFallback="true"` 绕过 Radix 焦点锁。
