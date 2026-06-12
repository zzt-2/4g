# [S007] display-group-management v2 二次审查修复（5 项必改）

> 2026-06-12 | 实施 (3xx) | active
> 来源: S006 v2 实施后用户二次审查 | 直接合同: 设计文档 5.5（修订）+ 5.7（修订）

## 目标

修复二次审查发现的 5 项问题，特别落实 design 5.5 新增的"禁止 page 层 enrich"条款：fieldName enrichment 从 DisplayPage 迁入 composable，page 层不再持有 fieldNameLookup / enrichRows。

## 直接合同

`codestable/features/2026-06-11-display-group-management/display-group-management-design.md` 5.5 编排层变更（修订）+ 5.7 影响范围（修订）。

5.5 修订核心条款：
- chart 走 composable refreshCharts（S006 已完成）
- **table 走 composable 新增 getTable1Rows()/getTable2Rows()**（S007 实施）
- **禁止 page 层 fieldNameLookup computed / enrichRows 函数**（S007 删除）

## 边界护栏

- `codestable/quality/rewrite-quality-rules.md` R19（静态元数据从配置层）
- `codestable/quality/rewrite-frontend-conventions.md` V5（UI 占位符不显示随机 ID）
- `CLAUDE.md` Selector 不可变约束、shared 提取规则
- 设计 5.8 明确不做清单（不改 DisplayFieldMaterial shape / 不提取 shared/utils/field-key.ts / 不改 receive outcome）

## 已修复

### 必改 1：enrichRows 移到 composable（blocker，核心）

**问题**：S006 在 DisplayPage.vue 实施了 page 层 fieldNameLookup computed + enrichRows 函数，违反 design 5.5 修订后"禁止 page 层 enrich"条款。

**修复**：
- `use-display-refresh.ts` 重写：
  - DisplayRefreshState 接口移除 `table1Rows` / `table2Rows` ref，新增 `getTable1Rows()` / `getTable2Rows()` 方法
  - 新增 `resolveFieldName()` / `enrichTableRows()` / `splitDataItemId()` 内部 helper
  - refresh() 在写 ref 前调用 enrichTableRows（fieldName 静态 lookup from frameReader）
  - 内部 ref 已 enriched，getTable*Rows() 出口再做一次深拷贝（Selector 不可变）
  - frameReader 查空返回 `'[Unknown Field]'` + `console.warn`（与 chart 路径一致）
- `DisplayPage.vue` 清理：
  - 删除 fieldNameLookup computed（原 line 96-105）
  - 删除 enrichRows 函数（原 line 107-113）
  - 删除 panel1Rows/panel2Rows 中的 enrichRows 调用
  - 改 `displayRefresh.table1Rows.value` → `displayRefresh.getTable1Rows()`（共 5 处：groups computed、panel1Rows、panel2Rows、startRecording）

**验证**：新增 `composables/__tests__/use-display-refresh.spec.ts` 4 个场景：
1. frameReader 已知字段返回正确 fieldName（不信任 material.fieldName）
2. frameReader 查空返回 `'[Unknown Field]'`（不泄漏 fieldId/UUID）
3. 返回值是深拷贝（修改不影响下次读）
4. service 无 rows 时返回空数组（仍 fresh copy）

### 必改 3：DisplayPanel fieldName optional（major）

**问题**：S006 让 TableRowProjection.fieldName 改 optional 后，DisplayPanel.vue:226-228 空状态 slot 可能访问 undefined。

**修复**：
- 核查 DisplayPanel.vue 所有 slot 与 template，**未发现直接访问 `row.fieldName`**（slot 只消费 displayValue/dataItemId/rawHex）
- buildPlaceholderRows 已显式填 `fieldName: f.fieldName`（来自 frameReader）
- composable enrichTableRows 保证 live rows 一定有 fieldName
- 加防御网：`display-columns.ts` panelTableColumns 的 fieldName 列新增 `format: (val) => typeof val === 'string' && val.length > 0 ? val : '[Unknown Field]'`，避免未来某条路径漏填时 UI 显示空白

**验证**：tsc 业务代码零 error（含 DisplayPanel.vue）。

### 必改 5：HistoryPage emptyVariant 评估（minor）

**问题**：WaveformChart 新增 emptyVariant prop（S006），HistoryPage.vue:145 消费未传该 prop，使用默认 'no-data'，语义不准确。

**修复**：
- 读 HistoryPage.vue + useHistoryData.ts，确认 HistoryPage 消费 WaveformChart
- 修复：HistoryPage.vue:145 添加 `:empty-variant="chart.series.length > 0 ? 'no-data' : 'no-selection'"`，与 DisplayPanel 推断逻辑对齐
- 语义：selectedItems 为空 → 'no-selection'（用户应去选字段）；selectedItems 非空但时间范围内无数据 → 'no-data'

### 必改 2：补 history 同步测试 + 修 history 降级值（major）

**问题**：5.6 验收契约要求 8 场景，实测只覆盖 7 个（缺 history 同步修复测试）。同时发现 useHistoryData.ts getFieldName 在 frameReader 查空时降级到原始 fieldId（与 display 不一致）。

**修复**：
- `pages/history/useHistoryData.ts` getFieldName：`let resolved = fieldId` → `const resolved = match ? match.fieldName : '[Unknown Field]'`，加 `console.warn`，与 display composable 对齐（R19/V5）
- 新增 `__tests__/integration/history-fieldname-resolution.spec.ts` 2 个场景：
  1. useHistoryData 注入 frameReader 后正确解析 fieldName（不字符串分割）
  2. frameReader 查空返回 `'[Unknown Field]'`（与 display 一致）

**验证**：测试运行通过。

### 必改 4：S006 tsc 归因修订（minor）

**问题**：S006 自报"残留 tsc error 是 exactOptionalPropertyTypes + readonly Ref 推断冲突"，实际跑 tsc 验证发现归因错误。

**修复**：实际运行 `pnpm -C rewrite exec tsc --noEmit -p tsconfig.json`：
- **业务代码（src/）零 tsc error**
- 残留全部 3 个 tsc error 都在 `node_modules/.pnpm/@vitejs+plugin-vue@6.0.6_*/node_modules/@vitejs/plugin-vue/dist/index.d.mts:120`
- 真实原因：该行使用 `vuePluginCjs as "module.exports"` 字符串 export 别名，TS 5.5.4 不支持该语法
- 已更新 S006 文档 "TypeScript" 段落，标注 [S007 修订]

## Step 验证状态（真实跑过的证据）

- **Lint**：display / history / composables 零 error。残留 2 个 `no-undef` error 在 `src/features/storage-highspeed/__tests__/selectors.spec.ts`（unused beforeEach/afterEach import，S006 边界决策 #10 回退后留下，与本轮无关）。
- **TypeScript（`pnpm -C rewrite exec tsc --noEmit -p tsconfig.json`）**：业务代码零 error。残留 3 个 error 全部在 `@vitejs/plugin-vue@6.0.6/dist/index.d.mts:120`（字符串 export 别名，TS 5.5.4 不支持），与 display v2 无关。
- **Test（display 范围）**：65/0 全过（display feature 47 + composable spec 4 + history-fieldname spec 2 + display-projection v2 8 + projection core 4）。
- **Test 全量**：1217 passed / 1 failed（connection-core 预存）；某些 spec 因 vite/vue plugin `.vue` import 解析失败 cascade（预存）。
- **Build**：跳过（预存 quasar/rollup "Source phase import" 配置问题，与本任务无关）。

## 边界决策记录

1. **page 层不 enrich（design 5.5 修订核心）**：fieldNameLookup computed 和 enrichRows 函数从 DisplayPage 删除，迁入 composable。理由：lookup 位置归 composable，page 只消费；数据流单向（bridge → service buffer → projection 不含 fieldName → composable enrich → UI）；chart/table 同通道避免两套 enrich 逻辑；响应式依赖问题（fieldNameLookup 依赖 receiveFrames，frameReader 刷新时不重建）消除。
2. **getTable*Rows() 返回深拷贝**：内部 ref 已 enriched，方法出口再做 `rows.map((r) => ({ ...r }))` 深拷贝，确保外部修改不影响内部（Selector 不可变约束）。
3. **display-columns 加 format fallback**：DisplayPanel 自身不消费 row.fieldName，但 QTable 通过 column.field 字符串 key 间接访问。format 是 widget 层防御网，未来路径漏填时仍显示 `'[Unknown Field]'` 而非空白。
4. **history 降级值对齐 display**：useHistoryData.ts getFieldName 改为 `'[Unknown Field]'` + warn，与 display composable 一致；不提取 shared/utils/field-key.ts（design 5.4 已明确不满足 2+ feature 提取条件）。
5. **HistoryPage emptyVariant 推断逻辑**：与 DisplayPanel 对齐（`series.length > 0 ? 'no-data' : 'no-selection'`）。语义：没选字段 → 'no-selection'；选了字段但时间范围内无数据 → 'no-data'。
6. **S006 enrichRows 决策被修订**：S006 边界决策 #2 "projection toRow 删 fieldName; DisplayPage enrich" 被 S007 修订为"composable enrich"。S006 文档保留不删（历史脉络），仅标注修订点。

## 后续

### 等待用户三次审查

S006 二次审查发现 5 项问题本轮全部修复。等用户三次审查确认。

审查维度（用户在任务中明确）：
- 5 项必改是否真到位（特别必改 1：enrichRows 真删了，composable getTable*Rows() 真实现了）
- design doc 5.5 修订是否被忠实执行
- 新引入的反模式（enrichRows 是否偷偷换个名字回来）
- 验证证据真实性（lint/tsc/test 真跑）
- 数据流清晰度（bridge → projection → composable → UI 单向不覆盖）

### 已知 gap（与本轮无关）

- 预存 lint error：`storage-highspeed/selectors.spec.ts` unused import（S006 边界决策 #10 副作用）
- 预存 tsc error：`@vitejs/plugin-vue@6.0.6` d.mts 字符串 export 别名
- 预存 test fail：`connection-core.spec.ts` 1 个，vite `.vue` import cascade 多个
- 预存 build：quasar/rollup "Source phase import" 配置问题

### 未决项

- 运行时手工验证未做：表格实际渲染 fieldName、图表 emptyVariant 在 HistoryPage 真实切换、frameReader 查空时 warn 是否符合预期频次
- 不提交，等用户审查反馈
