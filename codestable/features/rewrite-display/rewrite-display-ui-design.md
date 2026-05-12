---
doc_type: feature-design
feature: rewrite-display
scope: ui-page-layer
status: draft
date: "2026-05-11"
summary: display + history 分析 UI 页面层设计。覆盖页面结构、组件选型、数据流、复用模型、交互。与 rewrite-display-design.md（feature core）互补。
---

# Display + History UI 页面层 design

## Direct contract

1. `codestable/quality/rewrite-frontend-conventions.md`
2. `codestable/quality/rewrite-frontend-checklist.md`
3. `codestable/features/rewrite-display/rewrite-display-ui-brainstorm.md`

## Boundary guards

- `codestable/features/rewrite-display/rewrite-display-design.md`（feature core）
- `codestable/architecture/rewrite-target-structure.md`
- `CLAUDE.md`

---

## 0. 编码约定（来自 rewrite 已有代码）

新页面和组件必须遵守的模式（9 个 agent 验证提取）：

| 维度 | 约定 | 来源 |
|------|------|------|
| 路由 | `routes.ts` 集中定义，`() => import()` lazy loading，嵌套 AppShell | `rewrite/src/router/routes.ts` |
| 数据获取 | `useRewriteRuntime()` 访问 `runtime.features.xxxService` | `rewrite/src/pages/HomePage.vue` |
| Widget | 纯 props + events，无 runtime/store 依赖，`readonly` interface | `rewrite/src/widgets/SummaryMetricGrid.vue` |
| 样式 | `<style scoped lang="scss">` + `var(--rw-*)` CSS 变量，BEM 命名 | 所有已有组件 |
| Feature 访问 | Display is L3，`runtime.features.displayService` 可达读写全量 | `feature-wiring.ts:107-113` |

---

## 1. 实施阶段

### 阶段 0：前置修复（display service + settings）

| 修复项 | 位置 | 内容 |
|--------|------|------|
| chartHistory 累积 | `display-service.ts` ingestSourceMaterial | 每次 ingest 追加 ChartPoint，按 maxPoints 裁剪 |
| scatter 多点采样 | `display-service.ts` + `projection.ts` | scatterPoints 环形缓冲（maxPoints=4096） |
| TableRowProjection hexValue | `types.ts` + `projection.ts` | 新增 hexValue 字段，projection 层计算 |
| Settings display 偏好 | `settings/core/types.ts` + `defaults.ts` | SettingsSnapshot 新增 `display` 子结构 |
| ECharts 依赖 | `package.json` | `pnpm add echarts`，tree-shakeable import |
| Display CSS token | `css/tokens/_display.scss` | 图表色板 + 表格行高 + 面板间距 |

### 阶段 1：通用 composables + 可复用 widgets

useECharts、useDisplayRefresh、ChartWidget、DataTable、columns.ts 等。

### 阶段 2：DisplayPage + 专属 widgets

DisplayPanel、DisplayModeToggle、GroupSelector、RecordingControls、配置弹窗。

### 阶段 3：HistoryPage + 专属 widgets

HistoryTimeSelector、HistoryDataSelector、多图布局。

---

## 2. 目录结构

```
rewrite/src/
  pages/
    DisplayPage.vue                 # 实时数据展示（阶段 2）
    HistoryPage.vue                 # 历史分析（阶段 3）

  widgets/
    display/                        # display 专属 widget
      DisplayPanel.vue              # 面板容器（mode toggle + group selector + 内容区）
      DisplayModeToggle.vue         # 模式切换 QBtnToggle
      GroupSelector.vue             # 分组下拉 QSelect
      RecordingControls.vue         # 录制控制（按分组选择录制）
      ChartSettingsDialog.vue       # 图表配置弹窗（QDialog + QTabPanels）
      ScatterSettingsDialog.vue     # 星座图配置弹窗
      columns.ts                    # 表格列定义（6 列）

    history/                        # history 专属 widget
      HistoryTimeSelector.vue       # 时间范围选择
      HistoryDataSelector.vue       # 数据项选择（分组折叠 + 搜索 + 全选）
      HistoryChartConfigDialog.vue  # 单图表配置弹窗

    # 以下为可复用 widget，display 和 history 共用
    DataTable.vue                   # 参数表格（props 驱动）
    ChartWidget.vue                 # 折线图（props 驱动）
    ScatterWidget.vue               # 星座图（props 驱动，display 独用）

  composables/
    useDisplayRefresh.ts            # 实时 rAF 刷新（display 页用）
    useHistoryQuery.ts              # 历史查询 + 转换（history 页用）
    useECharts.ts                   # ECharts 生命周期（通用）

  features/
    display/
      core/
        ... (已有)
        storage-convert.ts          # storage records → DisplayFieldMaterial 转换
    storage-local-baseline/
      ... (已有，不需改目录)
    settings/
      ... (已有，需扩展 display 偏好字段)
```

### 复用关系

```
                    ┌─────────────────────────────────────┐
                    │ 可复用 widget（props 驱动，零 feature 依赖）│
                    │                                     │
                    │  ChartWidget.vue                    │
                    │  DataTable.vue                      │
                    │  ScatterWidget.vue                  │
                    │  columns.ts                         │
                    │  useECharts.ts                      │
                    └──────┬──────────────────┬───────────┘
                           │                  │
              ┌────────────▼──────┐  ┌────────▼────────────┐
              │ DisplayPage       │  │ HistoryPage          │
              │                   │  │                      │
              │ useDisplayRefresh │  │ useHistoryQuery      │
              │ (rAF + selector)  │  │ (storage query)      │
              │                   │  │                      │
              │ DisplayPanel      │  │ 多图布局 (1-4)       │
              │ ModeToggle        │  │ HistoryTimeSelector  │
              │ GroupSelector     │  │ HistoryDataSelector  │
              │ RecordingControls │  │ HistoryChartConfig   │
              │ ChartSettingsDlg  │  │                      │
              │ ScatterSettingsDlg│  │                      │
              └───────────────────┘  └──────────────────────┘
```

**核心复用原则**：
- ChartWidget / DataTable / ScatterWidget 接收 props 渲染，不知道数据来自 display selector 还是 storage query
- 数据获取策略（rAF 持续刷新 vs 一次性查询）由页面 composable 决定
- 配置弹窗由各自页面提供，因为配置项不同（实时有性能配置，历史有时间窗口）

---

## 3. 页面设计

### 3.1 DisplayPage（实时展示）

```
┌─────────────────────────────────────────────────────────┐
│ DisplayPage  (q-page)                                    │
│ ┌─ toolbar ───────────────────────────────────────────┐ │
│ │ 数据展示              [录制▼] [清空]                │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─ panel-container ──────────────────────────────────┐  │
│ │ ┌── Panel 1 ──────────┐ ┌── Panel 2 ──────────┐   │  │
│ │ │ [表格][图表][星座] ⚙│ │ [表格][图表][星座] ⚙│   │  │
│ │ │ [分组: xxx ▾]       │ │ [分组: xxx ▾]       │   │  │
│ │ │ ┌─────────────────┐ │ │ ┌─────────────────┐ │   │  │
│ │ │ │ DataTable /     │ │ │ │ DataTable /     │ │   │  │
│ │ │ │ ChartWidget /   │ │ │ │ ChartWidget /   │ │   │  │
│ │ │ │ ScatterWidget   │ │ │ │ ScatterWidget   │ │   │  │
│ │ │ └─────────────────┘ │ │ └─────────────────┘ │   │  │
│ │ └─────────────────────┘ └─────────────────────┘   │  │
│ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- 面板间距：`var(--rw-space-panel-gap)`
- 内容区高度：`calc(100vh - header - toolbar - panel-header)`
- 面板用 `v-if` 切换内容（互斥渲染，减 DOM 节点 ≤3000 预算）

### 3.2 HistoryPage（历史分析）

```
┌─────────────────────────────────────────────────────────┐
│ HistoryPage (q-page)                                     │
│ ┌─ toolbar ───────────────────────────────────────────┐ │
│ │ 历史分析           [图表数: 1|2|3|4]                │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌── 左侧控制面板 ──┐ ┌── 右侧图表区 ─────────────────┐ │
│ │ HistoryTimeSelector│ │ ChartWidget 1               │ │
│ │ ├ 日期选择         │ │ ┌─────────────────────────┐ │ │
│ │ ├ 预设按钮         │ │ │                         │ │ │
│ │ └ 时间范围显示     │ │ │  折线图                  │ │ │
│ │                   │ │ │                         │ │ │
│ │ HistoryDataSelector│ │ └─────────────────────────┘ │ │
│ │ ├ 分组折叠列表     │ │ ChartWidget 2 (可选)        │ │
│ │ ├ 搜索             │ │ ChartWidget 3 (可选)        │ │
│ │ └ 全选/清空        │ │ ChartWidget 4 (可选)        │ │
│ └───────────────────┘ └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- 左侧面板固定宽度 `var(--rw-size-content-wide)` / 280px
- 右侧图表区：1-4 个 ChartWidget 垂直堆叠，动态计算高度
- 每个图表独立配置按钮 → HistoryChartConfigDialog
- **不做星座图、不做实时刷新**

---

## 4. 可复用 Widget 接口

### 4.1 ChartWidget（核心复用组件）

```typescript
interface ChartWidgetProps {
  readonly series: readonly ChartSeriesProjection[];
  readonly title?: string;
  readonly height?: string | number;
  readonly loading?: boolean;
  readonly disabled?: boolean;
}
```

- 纯展示组件，零 feature 依赖
- 内部用 useECharts 管理实例
- 颜色从 CSS 变量读取（固定 6 色）
- `animation: false`（实时和大量历史数据都不需要 ECharts 动画）
- 父组件控制数据更新频率（rAF 或一次性加载）

### 4.2 DataTable

```typescript
interface DataTableProps {
  readonly rows: readonly TableRowProjection[];
  readonly columns: readonly QTableColumn[];
  readonly loading?: boolean;
  readonly rowKey?: string;
}
```

- QTable + virtual-scroll + item-size=40
- 列定义从 columns.ts 传入
- rowKey 默认 'fieldId'

### 4.3 ScatterWidget（display 独用）

```typescript
interface ScatterWidgetProps {
  readonly points: readonly ScatterPoint[];
  readonly bitWidth: number;
  readonly pointSize?: number;
  readonly loading?: boolean;
}
```

### 4.4 useECharts（通用 composable）

```typescript
export function useECharts(container: Ref<HTMLElement | undefined>) {
  // onMounted: init
  // onUnmounted: dispose
  // setOption(option, { notMerge: false, silent: true })
  // resize() (window resize 时)
}
```

---

## 5. 数据流

### 5.1 DisplayPage 数据流

```
receive → routingTick → fanOutToDisplay → display.ingestSourceMaterial()
  ├→ sourceFields[]
  ├→ chartHistory (累积)
  └→ scatterPoints (累积)
  ↓
useDisplayRefresh (rAF + cadenceMs)
  ├→ shallowRef<TableRowProjection[]>     → DataTable (props)
  ├→ shallowRef<ChartSeriesProjection[]>  → ChartWidget (props)
  └→ shallowRef<ScatterProjection>        → ScatterWidget (props)
```

### 5.2 HistoryPage 数据流

```
storage.listLocalRecords({ from, to })
  ↓ StorageLocalRecord[]
display/core/storage-convert.ts
  ↓ DisplayFieldMaterial[]
display.ingestSourceMaterial()
  ↓
一次性读取 display selectors
  ├→ shallowRef<ChartSeriesProjection[]>  → ChartWidget (props) ×1-4
  └→ shallowRef<TableRowProjection[]>     → DataTable (props, 可选)

ChartWidget 内部 computed:
  ├→ mean = points.reduce(sum) / points.length
  └→ RMSE = sqrt(points.reduce((p - mean)^2) / points.length)
```

History 页面的关键转换函数（放在 `display/core/storage-convert.ts`）：

```typescript
interface StorageConvertContext {
  resolveFrameIdentity(channel: string, fieldKey: string): { frameId: string; fieldId: string } | undefined;
}

function storageRecordsToDisplayMaterials(
  records: readonly StorageLocalRecord[],
  context: StorageConvertContext
): DisplayFieldMaterial[]
```

转换函数归 display core，因为输出类型是 DisplayFieldMaterial。storage 不需要知道 display 的存在。

### 5.3 录制数据流

```
用户在帧配置中选择"录制"开关 + 选择录制的字段
  ↓
settings 持久化录制配置 (per frame + field 粒度)
  ↓ (routingTick 中)
fanOutToDisplay → 只将标记为录制的字段数据 routing 给 storage
  ↓
storage 持久化（按小时分片）
```

录制范围：按字段级别，per 接收帧控制。默认不录制。

---

## 6. 组件选型

| 组件 | 选型 | 原因 |
|------|------|------|
| 参数表格 | QTable + virtual-scroll | 规范 T1 |
| 折线图 | ECharts（tree-shakeable） | 沿用旧库 |
| 星座图 | ECharts scatter | 同上 |
| 模式切换 | QBtnToggle | Quasar 原生 |
| 分组选择 | QSelect | Quasar 原生 |
| 配置弹窗 | QDialog + QTabPanels | 规范 D1 |
| 录制控制 | QBtn + QSelect (multiple) | 选择录制分组 |
| 时间选择 | QDate + QInput (time) | 旧系统用日历+输入框 |
| 数据项选择 | QCheckbox + QExpansionItem | 分组折叠 + 多选 |
| 图表数量 | QBtnToggle (1/2/3/4) | 旧系统同 |
| 空状态 | QTable #no-data / QBanner | 规范 T4 |

---

## 7. 关键交互

### 7.1 显示模式切换（DisplayPage）

```
点击 [表格]/[图表]/[星座] → display.updatePreferences({ table1: { displayMode } })
  → selector 更新 → DisplayPanel v-if 切换组件
```

### 7.2 录制控制（DisplayPage）

```
点击 [录制▼] → QSelect multiple 选帧 → 确认
  → storage.startRecording({ frameIds })
  → routingTick 只 route 选中帧的字段给 storage
  → RecordingControls 显示录制状态 + 统计
```

**与旧系统差异**：旧系统全量记录，新系统按分组选择。默认不录制。

### 7.3 图表配置（DisplayPage）

```
点击 ⚙ → ChartSettingsDialog (QDialog + 3 QTabPanels)
  - 数据选择 tab：QCheckbox 列表
  - 图表配置 tab：Y 轴 auto/manual
  - 性能配置 tab：maxPoints
  → 保存 → display.updatePreferences(patch)
```

### 7.4 历史数据加载（HistoryPage）

```
选择时间范围 → HistoryTimeSelector (QDate + QInput)
  → storage.listLocalRecords({ from, to })
  → storageRecordsToDisplayMaterials()
  → display.ingestSourceMaterial()
  → 一次性读 selectors → ChartWidget props
```

### 7.5 历史多图配置（HistoryPage）

```
点击 [1|2|3|4] → 调整图表数量
  → 页面状态管理 multiChartConfigs[]
  → 每个图表有独立配置按钮
  → HistoryChartConfigDialog（选数据项 + Y轴）
```

---

## 8. Settings 扩展

Settings 需新增 `display` 子结构（前置依赖）：

```typescript
interface SettingsDisplayConfig {
  table1: {
    displayMode: 'table' | 'chart' | 'special';
    selectedFrameId: string;
    selectedItems: string[];    // 格式: "frameId:fieldId"
  };
  table2: { /* 同 table1 */ };
  chart: {
    maxPoints: number;         // 默认 500
    samplingEnabled: boolean;
  };
  scatter: {
    iSource: { frameId: string; fieldId: string };
    qSource: { frameId: string; fieldId: string };
    bitWidth: number;          // 默认 8
    sampleCount: number;       // 默认 256
    pointSize: number;         // 默认 3
  };
  recording: {
    selectedFrameIds: string[]; // 选择录制的帧
  };
}
```

Settings 只持久化事实（存什么值），display 解释语义（这些值意味着什么）。

---

## 9. CSS token 新增

```scss
// rewrite/src/css/tokens/_display.scss

// 图表系列色板（固定 6 色，不可配置）
:root {
  --rw-color-chart-series-1: #60A5FA;
  --rw-color-chart-series-2: #34D399;
  --rw-color-chart-series-3: #FBBF24;
  --rw-color-chart-series-4: #F87171;
  --rw-color-chart-series-5: #A78BFA;
  --rw-color-chart-series-6: #FB923C;

  --rw-size-table-row: 40px;
  --rw-space-panel-gap: 4px;
  --rw-size-history-sidebar: 280px;
}
```

---

## 10. Storage → Display 转换

**身份标识已统一**（见 `display-identity-brainstorm.md` 结论）：

- Display/Status 统一使用 `frameId` + `fieldId`（与 frame/receive 一致）。
- Storage 使用独立的 `channel`（连接源）+ `key`（人可读字段名），映射在 bridge 中显式完成。
- 两种标识模型并存：定义标识（`frameId+fieldId`）和存储标识（`channel+key`）。

Storage → Display 转换需要 resolve 两种标识之间的映射：

```typescript
// display/core/storage-convert.ts
export interface StorageConvertContext {
  resolveFrameIdentity(channel: string, fieldKey: string): { frameId: string; fieldId: string } | undefined;
}

export function storageRecordsToDisplayMaterials(
  records: readonly StorageLocalRecord[],
  context: StorageConvertContext
): DisplayFieldMaterial[]
```

`resolveFrameIdentity` 职责：根据 storage 的 `channel` + `fieldKey` 反查对应的帧定义标识。如果无法解析（旧数据、手动记录、帧已删除），返回 undefined，该字段在展示中被跳过或标记为 unknown。

---

## 11. 验证分层

| 验证项 | 方式 | 阶段 |
|--------|------|------|
| chartHistory 累积 + 裁剪 | Vitest | 0 |
| scatter 多点 + 环形缓冲 | Vitest | 0 |
| TableRowProjection hexValue | Vitest | 0 |
| storageRecordsToDisplayMaterials | Vitest | 0 |
| useECharts composable | Vitest | 1 |
| useDisplayRefresh composable | Vitest | 1 |
| columns.ts 完整性 | Vitest | 1 |
| settings display 扩展 | Vitest | 0 |
| 表格虚拟滚动 100+ 行 | Manual | 2 |
| 图表实时刷新无闪烁 | Manual | 2 |
| 星座图长时间内存稳定 | Manual | 2 |
| 配置弹窗交互 | Manual | 2 |
| 录制选择性（按分组） | Manual | 2 |
| 历史多图配置 | Manual | 3 |
| 历史时间范围选择 + 数据加载 | Manual | 3 |
| 前端规范合规（全项） | Static scan + manual | 2+3 |
| 高频串口数据 UI 响应 | Runtime | 2 |
| 长时间历史数据加载性能 | Runtime | 3 |
