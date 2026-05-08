# 前端开发指南

> Vue 3 + shadcn-vue + TypeScript + TailwindCSS + TanStack Query + Vite
>
> 包管理器**必须使用 pnpm**
>
> DX 工具: unplugin-vue-router (文件约定路由) + unplugin-auto-import + unplugin-vue-components + UnoCSS (图标) + @unhead/vue (SEO) + VueDevTools

## 重要规范速查

- **图标**：使用 Lucide Icons（`lucide-vue-next`），不要使用其他图标库
- **接口返回值**: API client 的 responseTransformer 会自动解构后端 `{ data }` 包装，SDK 返回 `{ data, error, response }`，取 `data` 即为业务数据
- **类型定义**：直接去后端看 DTO 文件，可从 `@/api` 导出 VO 类型使用，不要搜索 `types.ts`
- **API 导入**：统一从 `@/api` 导入，不要写具体文件路径
- **表单校验**：使用 vee-validate + zod，不要手写校验逻辑

> 代码质量检查标准（any 禁用、行数上限、目录职责、字典枚举、样式规范等）详见 [前端代码质量规则](../quality/frontend.md)。

---

## 导入规则

项目配置了 `unplugin-auto-import` + `unplugin-vue-components`，以下内容**不需要手动 import，直接使用即可**：

| 类别        | 来源                 | 示例                                                                          |
| ----------- | -------------------- | ----------------------------------------------------------------------------- |
| Vue API     | `vue`                | `ref`, `computed`, `watch`, `nextTick`, `onMounted`                           |
| Vue Router  | `vue-router`         | `useRouter`, `useRoute`                                                       |
| VueUse      | `@vueuse/core`       | `useDark`, `useStorage`, `watchDebounced`                                     |
| Unhead      | `@unhead/vue`        | `useHead`, `useSeoMeta`                                                       |
| Pinia       | `pinia`              | `defineStore`, `storeToRefs`                                                  |
| Composables | `src/composables/**` | `useFilters`, `useFileUpload`                                                 |
| Utils       | `src/utils/**`       | `formatDate`, `formatDuration`                                                |
| Stores      | `src/stores/**`      | `useUserStore`                                                                |
| 所有组件    | `src/components/**`  | `Button`, `DictMultiSelect`, `StatusBadge`, `TwoStepConfirmDialog`, `Card` 等 |

以下内容**必须手动 import**：

| 类别               | 来源                                | 示例                                                                                   |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------------- |
| TanStack Query     | `@tanstack/vue-query`               | `useQuery`, `useMutation`, `useQueryClient`                                            |
| API SDK (Query)    | `@/api/@tanstack/vue-query.gen`     | `adminDomainFindAllOptions`, `adminDomainRemoveMutation`                               |
| API SDK (直接调用) | `@/api/sdk.gen` 或 `@/api`          | `adminDomainFindOne`                                                                   |
| 表单库             | `vee-validate`, `@vee-validate/zod` | `useForm`, `toTypedSchema`                                                             |
| Zod                | `zod`                               | `z`                                                                                    |
| Toast              | `vue-sonner`                        | `toast`                                                                                |
| 图标               | `lucide-vue-next`                   | `Plus`, `Search`, `Trash2`                                                             |
| 本地文件           | 相对路径                            | `createColumns` from `./columns`                                                       |
| 类型引用           | 需要 `typeof` 时                    | `import XxxDialog from './XxxDialog.vue'` 用于 `ref<InstanceType<typeof XxxDialog>>()` |

> `FormField` / `FormFieldArray` / `DropdownMenuPortal` 这类从第三方包通过 `index.ts` 重导出的 JS 组件，已在 `vite.config.ts` 的自定义 resolver 中配置，模板中可直接使用。在 `.ts` 渲染函数中仍需手动 import。

> [!CAUTION]
> **严禁显式 import 上表"不需要手动 import"中的任何内容。**
> 常见违规：`import { ref, computed } from 'vue'`、`import XxxComponent from './Xxx.vue'`、`import { useXxx } from '@/composables/useXxx'`、`import { formatDate } from '@/utils/xxx'`。
> 这些写了也能跑，但会制造无意义的维护负担（移动文件时要改路径、审查时分不清真假依赖）。AI 编码助手尤其容易犯此错误，审查时需重点检查。
> **唯一例外**：`<script>` 中需要 `typeof` 做类型引用时（见上表"类型引用"行）。

---

## 目录结构

```
apps/web/src/
├── main.ts                          # 应用入口
├── App.vue                          # 根组件
├── index.css                        # Tailwind 入口 + shadcn 设计令牌
│
├── router/
│   └── index.ts                     # vue-router/auto + 全局守卫
│
├── pages/                           # 文件约定路由 (unplugin-vue-router)
│   ├── index.vue                    # / → 重定向
│   ├── login.vue                    # /login (layout: blank)
│   ├── [...notFound].vue            # 404
│   └── admin/                       # /admin/*
│       ├── index.vue
│       ├── domain/index.vue, columns.ts
│       └── ...                      # 只放 index.vue + columns.ts，子组件放 components/business/
│
├── layouts/                         # 自动布局 (vite-plugin-vue-layouts)
│   ├── default.vue                  # 管理端布局 (Sidebar + Header)
│   └── blank.vue                    # 空布局 (登录/404)
│
├── api/                             # 自动生成 (@hey-api/openapi-ts)，禁止手动修改
│
├── components/
│   ├── ui/                          # shadcn-vue 基础组件 (CLI 生成，可定制)
│   ├── common/                      # 跨域通用组件（**高度强调：尽量将所有逻辑抽取为通用组件并存放于此**）
│   │   ├── dialog/                  # 各种二次封装的弹窗（FormDialog / ConfirmDialog 等）
│   │   ├── dict/                    # 字典驱动的 UI 组件（DictSelect / StatusBadge 等）
│   │   ├── display/                 # 跨业务通用展示型组件（EmptyState / MarkdownViewer 等）
│   │   ├── input/                   # 跨业务通用输入/控制组件（MultiSelect / 各种 Filter / Dropdown 等）
│   │   └── shell/                   # 跨业务通用页面布局外壳（DetailPageShell 等）
│   ├── business/                    # 业务组件 (按功能域子目录，**仅允许存放包含特定业务API数据逻辑且无法抽象为 common 层的组件**)
│   │   ├── ai-provider/
│   │   ├── dict/
│   │   ├── domain/
│   │   ├── role/
│   │   └── ...
│   └── layout/                      # 布局相关组件 (Sidebar / Header / ThemeToggle)
│
├── composables/                     # 组合式函数 (AutoImport 自动扫描)
│   ├── useFilters.ts
│   └── ...
│
├── constants/                       # 静态配置
│   ├── admin-menu.ts
│   └── badge-variants.ts
|
├── stores/                          # Pinia 状态
│   ├── user.ts                      # 用户认证状态
│   └── dict.ts                      # 字典全量缓存 (useDictStore)
|
└── lib/                             # 全局基础设施
    ├── api-client.ts
    ├── queryClient.ts
    └── utils.ts                     # cn() (clsx + tailwind-merge)
```

### 目录职责边界

| 目录                            | 放什么                                                                           | 不放什么                            |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| `pages/`                        | 文件约定路由页面                                                                 | 不被路由引用的组件                  |
| `components/ui/`                | shadcn-vue 生成的基础组件                                                        | 业务逻辑                            |
| `components/common/`            | 跨域复用的通用交互/UI组件（**高度强调：所有脱离特定 API 的逻辑都应抽象放这里**） | 耦合特定业务 API 的组件             |
| `components/business/{domain}/` | 含有强业务语义、必须绑定特定业务 API 接口的组件，否则不要放这里                  | 只在一个页面用的私有片段            |
| `components/layout/`            | Sidebar、Header 等布局零件                                                       | 页面内容                            |
| `composables/`                  | 跨组件复用的逻辑（Query/Mutation/Socket）                                        | 一次性工具函数                      |
| `lib/`                          | 全局基础设施（api-client / queryClient）                                         | 业务逻辑                            |
| `stores/`                       | 全局状态（认证 + 字典缓存）                                                      | 服务端数据缓存（用 TanStack Query） |

---

## TanStack Query 数据流

### 核心原则

1. **Query 用于查询**，Mutation 用于变更
2. **Pinia 只放全局认证状态**，服务端数据一律走 TanStack Query

> API 调用的详细规则（useQuery 统一、onError 禁用、enabled 控制等）见 [前端代码质量规则](../quality/frontend.md)。

### Query / Mutation Options (自动生成)

`@hey-api/openapi-ts` 会从 Swagger 自动生成 TanStack Vue Query 的 `queryOptions` 和 `mutationOptions`，**不需要手动维护 Query Key**:

```typescript
import {
  adminTemplateFindAllOptions,
  adminTemplateCreateMutation,
} from "@/api/@tanstack/vue-query.gen";
```

### Query 示例

```typescript
// 静态参数
const { data } = useQuery({
  ...adminTemplateFindOneOptions({ path: { id: props.id } }),
});

// 响应式参数 -- 用 computed 包裹
const { data } = useQuery(
  computed(() => adminTemplateFindOneOptions({ path: { id: id.value } })),
);

// 条件查询 -- 弹窗打开时才发请求
const { data } = useQuery(
  computed(() => ({
    ...adminXxxListAllOptions(),
    enabled: dialogOpen.value,
  })),
);
```

### Mutation 示例

```typescript
const queryClient = useQueryClient();
const { mutate } = useMutation({
  ...adminTemplateUpdateMutation(),
  onSuccess: () => {
    toast.success("修改成功");
    // 用 queryKey 部分匹配失效缓存
    queryClient.invalidateQueries({
      queryKey: [{ _id: "adminTemplateFindAll" }],
    });
  },
});
```

> **invalidateQueries**: 用 `queryKey: [{ _id }]` 部分匹配即可命中所有同接口不同参数的缓存，不要用 predicate。多处调用时提取为 `const invalidateList = () => queryClient.invalidateQueries({ queryKey: [{ _id: 'xxx' }] })` 局部函数。

### 分页数据提取

分页 API 返回 `{ records, total, page, pageSize }`，后端 Response DTO 已定义分页 Schema，SDK 会自动推导正确类型：

```typescript
const { data: rawData, isLoading } = useQuery(queryOptions);
const tableData = computed(() => rawData.value?.records ?? []);
const total = computed(() => rawData.value?.total ?? 0);
```

---

## 组件模式

### 表单 (vee-validate + zod)

```typescript
const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(1, "请输入名称").max(50, "名称不超过50字"),
    status: z.enum(["ACTIVE", "INACTIVE"], { required_error: "请选择状态" }),
    description: z.string().optional(),
  }),
);

const { handleSubmit, resetForm, setValues } = useForm({
  validationSchema: formSchema,
});
```

自定义 UI 控件接入表单：在外层包裹 `<FormField v-slot="{ componentField }">` 并使用 `<Custom v-bind="componentField" />` 即可，不用 `@update:model-value` 手工代理。表单双轨制禁令和 FormDialog 职责划分见 [前端代码质量规则](../quality/frontend.md)。

### 删除确认组件分级

**禁止裸写 AlertDialog 做删除确认**，必须使用封装组件：

| 场景                        | 组件                                                           | 说明                 |
| --------------------------- | -------------------------------------------------------------- | -------------------- |
| 级联删除 / 不可恢复且影响大 | `TwoStepConfirmDialog`                                         | 需输入关键词二次确认 |
| 普通单条删除                | `ConfirmDialog`（Trigger 模式）或受控的 `TwoStepConfirmDialog` | 简单确认即可         |

> 注意: `ConfirmDialog` 使用 slot 触发器模式。如果删除按钮在 `columns.ts` 的 `h()` 渲染函数中，无法使用 slot 触发器，应改用受控模式的 `TwoStepConfirmDialog`。

### 详情页与子页面布局 (DetailPageShell)

对于拥有面包屑导航的业务详情页或子层级页面（如 `[id].vue` 详情页，或 `[parentId]/variants.vue` 子列表），必须使用 `DetailPageShell` 组件，并结合 `usePageHeader` 隐藏顶栏原本居中的原生 `h1` 标题，使面包屑和操作按钮彻底接管系统顶栏：

```vue
<script setup lang="ts">
// 必须传第三个参数 false，代表“只更新浏览器网页 <title>，不渲染页面的居中大字标题”
// 以把系统 Header 的中心空间彻底让给 `#header-left-actions` 里的面包屑。
watchEffect(() => {
  setHeader(doc.title, "文档详情", false);
});
</script>

<template>
  <DetailPageShell
    :breadcrumbs="[
      { label: '文档管理', to: '/admin/knowledge' },
      { label: doc.title },
    ]"
  >
    <template #actions>
      <!-- 这里的按钮会被自动 Teleport 到顶部 AppHeader 的最右侧 -->
      <Button @click="save">保存</Button>
    </template>

    <!-- 页面实际的主内容区 -->
    <div class="space-y-4">...</div>
  </DetailPageShell>
</template>
```

### 表格列定义 (columns.ts)

列定义抽取到 `columns.ts`，使用 `h()` 渲染函数。注意在 `.ts` 文件中不能依赖组件自动导入，UI 组件需要手动 import：

```typescript
import type { ColumnDef } from "@tanstack/vue-table";
import { h } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/common/dict/StatusBadge.vue";

export function createColumns(handlers: {
  onEdit: (row: any) => void;
  onDelete: (row: any) => void;
}): ColumnDef<any>[] {
  return [
    { accessorKey: "name", header: "名称" },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) =>
        h(StatusBadge, { type: "domainStatus", value: row.original.status }),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) =>
        h("div", { class: "flex items-center gap-2" }, [
          h(
            Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => handlers.onEdit(row.original),
            },
            () => "编辑",
          ),
          h(
            Button,
            {
              variant: "ghost",
              size: "sm",
              class: "text-destructive",
              onClick: () => handlers.onDelete(row.original),
            },
            () => "删除",
          ),
        ]),
    },
  ];
}
```

---

## 样式规范

### 设计令牌

所有颜色通过 HSL CSS 变量定义，使用 shadcn 标准令牌体系。只维护一套变量，在 `index.css` 的 `:root` 和 `.dark` 中统一定义。

### TailwindCSS 使用规则

- 样式优先用 Tailwind 原子类写在 template 中
- 不使用 `@apply`
- shadcn 组件使用 `cn()` (clsx + tailwind-merge) 做 class 合并
- 使用语义化颜色变量，不硬编码

```tsx
// 正确
<span class="text-destructive">错误</span>
<span class="text-muted-foreground">次要信息</span>

// 错误
<span class="text-red-500">错误</span>
```

### 暗色模式

使用 class 切换方案（`<html class="dark">`），通过 `useDark()` 控制。shadcn 语义化变量已自动处理暗色适配，大部分情况不需要 `dark:` 前缀。

### CSS 禁止事项

| 规则                  | 说明                                       |
| --------------------- | ------------------------------------------ |
| 不引入第二个 CSS 引擎 | 只用 TailwindCSS，不引入 UnoCSS / WindiCSS |
| 不创建第二套 CSS 变量 | 所有变量在 `:root` 和 `.dark` 中统一定义   |
| 不使用 SCSS           | 不需要嵌套语法时不引入额外编译器           |
| 不硬编码 z-index      | 如需多层级管理，定义 CSS 变量              |

---

## 页面 SEO / Head 管理

管理后台页面至少设置 `useHead({ title })` 以在浏览器标签页显示当前页面名称：

```vue
<script setup lang="ts">
useHead({ title: "知识管理" });
</script>
```

---

## 工具函数

`src/utils/` 下的通用函数已被 AutoImport 扫描，可在任何 SFC 中直接使用：

| 函数                          | 用途                     | 示例                                            |
| ----------------------------- | ------------------------ | ----------------------------------------------- |
| `formatDate(date, relative?)` | 日期格式化，支持相对时间 | `formatDate(item.createdAt, true)` -> "3分钟前" |
| `formatFileSize(bytes)`       | 文件大小可读化           | `formatFileSize(1048576)` -> "1.00 MB"          |
| `formatDuration(ms)`          | 持续时间可读化           | `formatDuration(125000)` -> "2分钟5秒"          |

---

## 字典驱动 UI (Dict-Driven UI)

对于所有系统枚举（如状态、分类、优先级等），**完全禁止前端硬编码 options**，必须基于后端的动态字典系统开发：

1. **统一字典 Key**：从 `@thesis/shared` 导入 `DictKey` 常量（例如 `DictKey.DOCUMENT_STATUS`），避免裸写魔法字符串常量。
2. **列表展示 (StatusBadge)**：使用 `<StatusBadge :type="DictKey.XXX" :value="row.status" />`，它会自动查询字典并在配置的额外信息中提取语义化色彩。
3. **下拉筛选 (单选/多选)**：不再手动声明 Computed 包裹 `dictStore.getOptions`。使用单选 `<DictSelect :type="DictKey.XXX" />` 或多选 `<DictMultiSelect :type="DictKey.XXX" />` 直接完成数据绑定与字典映射。

### 示例

```vue
<script setup lang="ts">
import { DictKey } from "@thesis/shared"; // 标准导入字典 Key
</script>

<template>
  <!-- 单选 -->
  <DictSelect
    v-model="filters.status"
    :type="DictKey.DOCUMENT_STATUS"
    placeholder="单选状态"
  />

  <!-- 多选 -->
  <DictMultiSelect
    v-model="filters.statusArray"
    :type="DictKey.DOCUMENT_STATUS"
    placeholder="多选状态"
  />
</template>
```

---

## 实体属性多选筛选 (MultiSelect + csvArray)

对于**非字典驱动**的动态业务实体关联数据（如拉取的 `domainOptions` 等），仍使用基础的 `MultiSelect` 组件。后端使用 `csvArray()` 自动解析逗号分隔的字符串为数组。

### 筛选栏前端用法

```vue
<script setup lang="ts">
const {
  filters,
  debouncedFilters,
  reset: resetFilters,
} = useFilters({
  name: "" as string,
  domainId: [] as string[], // 多选用 string[]
  priority: [] as string[],
});

// 传参时 join 为逗号分隔字符串
const queryOptions = computed(() =>
  adminXxxFindAllOptions({
    query: {
      name: debouncedFilters.value.name,
      ...(debouncedFilters.value.status.length && {
        status: debouncedFilters.value.status.join(","),
      }),
      page: page.value,
      pageSize: pageSize.value,
    } as any,
  }),
);
</script>

<template>
  <MultiSelect
    v-model="filters.domainId"
    :options="domainOptions"
    placeholder="领域"
    class="w-36"
  />
</template>
```

`MultiSelect` 接受 `{ label: string, value: string }[]` 格式的 options，支持搜索、badge 展示已选项、一键清除。

### 后端约定

后端 DTO 中使用 `csvArray()` 自动解析逗号分隔值为 `string[]`，Service 中用 Prisma 的 `in` (单值字段) 或 `hasSome` (数组字段) 操作符:

```typescript
// DTO
import { csvArray } from "@common/utils/zod-schemas";
const QuerySchema = createQuerySchema({
  status: csvArray(), // 自动处理 "a,b,c" -> ['a','b','c']
  tag: csvArray(),
});

// Service
const where = {
  ...(status?.length && { status: { in: status as any } }), // 单值字段
  ...(tag?.length && { tags: { hasSome: tag } }), // 数组字段
};
```

