# [S006] display-group-management v2 审查反馈修复

> 2026-06-12 | 实施 (3xx) | active
> 来源: S003 v2 实施 + 用户审查反馈 | 直接合同: 设计文档 5 节 (5.1-5.10)

## 目标

修复用户审查发现的 4 blocker + 4 major + 2 minor。审查结论是 A1 直接合同 revise-required、A3 验证+边界 revise-required。

## 直接合同

`codestable/features/2026-06-11-display-group-management/display-group-management-design.md` 第 5 节（5.1-5.10）。

## 边界护栏

- `codestable/quality/rewrite-quality-rules.md` R19（静态元数据从配置层）
- `codestable/quality/rewrite-frontend-conventions.md` V5（UI 占位符不显示随机 ID）
- `rewrite-frontend-quickref.md` 绝对禁止清单
- `CLAUDE.md` Selector 不可变、shared 提取规则

## 已修复（按子 agent 调度策略）

### Blocker（4 项全部修复）

1. **Test 运行**：`pnpm test -- --run display` 跑通，66/0 pass。子 agent 修了 4 测试文件 + 新增 8 个验收场景。
2. **测试 type error**：display-projection.spec.ts (line 96/219/220)、display-fixtures.ts、display-core-service-state-selector.spec.ts、display-projection.spec.ts (167) mutation test 已对齐新 shape（ChartSelectedItem 结构化对象 + TableRowProjection.fieldName optional）。
3. **ScatterConfigDialog.vue:54 反模式**：FieldOption 加 `binding: ScatterSourceBinding` 字段，toBinding 改为 `props.availableFields.find(...).binding` lookup（无字符串分割）。DisplayPage availableFields 同步加 binding。
4. **WaveformChart 空状态文案**：加 `emptyVariant: 'no-selection' | 'no-data'` prop。no-selection 显示"未选择字段 / 点击右上角设置按钮选择字段"；no-data 显示"暂无数据 / 请等待数据流入"。DisplayPanel 在 chart 模式下根据 `chartInstance?.series.length` 传 variant。

### Major（4 项全部修复）

5. **use-display-refresh.ts getFieldName 硬失败**：原 `let resolved = fieldId` 改为 `const match = refs.find(...); const resolved = match ? match.fieldName : '[Unknown Field]'`，查不到时 `console.warn`。fieldId 永不显示（避免 UUID 泄漏）。
6. **bridge.ts fieldName 透传**：审查指出"注释加了但代码未改"。经核对设计 5.8"不改 DisplayFieldMaterial shape"决策，bridge push 字段保留作 shape 冗余，但修复 `rawHex` exactOptionalPropertyTypes 问题（conditional spread）。同时改 projection.ts toRow **不**再返回 `fieldName` 字段（TableRowProjection.fieldName 改 optional）。
7. **projection.ts toRow fieldName**：删除 `fieldName: f.fieldName`，TableRowProjection.fieldName 改 optional。DisplayPage 新增 `fieldNameLookup` computed + `enrichRows` 函数，panel1Rows/panel2Rows 通过 enrich 从 frameReader 查 fieldName 覆盖。这样 UI 表格列 fieldName 永远来自 frameReader 静态 lookup，符合 R19。
8. **5.6 八个验收场景测试**：新增 `describe('v2 acceptance scenarios', ...)` 块，覆盖：图表空状态、无数据流时图例、migration 3 段、migration 2 段、migration 畸形条目、字段名解析、帧热更新 selectedItems 失效、分组删除后 groupId 失效。子 agent 报告 8 场景全过。

### Minor（2 项全部修复）

9. **命名 S003 → S006**：删除 S003，新建 S006（本文件）。topic-index 提到 S005 是最大编号，按规则下一个是 S006。
10. **回退 storage-highspeed 越界**：恢复 `import { ..., beforeEach, afterEach } from 'vitest'`（v2 任务范围外修改回退）。

## Step 8 验证状态

- **Lint**：display 相关 0 error。2 个 `no-undef` 错误在 `verify-serialport.mjs`（项目根，预存，与本任务无关）。
- **TypeScript（`pnpm exec tsc --noEmit`）**：本轮引入的 type error 全部修完（DisplayService import 路径、ChartSelectionFrameLookup 加 fieldName、migrate.ts mutable 中间对象 + cast、normalize.ts fallback 字段显式构造 + base 非空断言、bridge.ts rawHex conditional spread）。残留 display/history 文件 tsc error 全部是预存问题（exactOptionalPropertyTypes + noUncheckedIndexedAccess strict 模式与 readonly Ref 推断冲突），与本轮无关。
- **Test（`pnpm test -- --run display`）**：66 个测试通过，0 失败（含 8 个新增验收场景）。
- **Test 全量**：1211 passed / 1 failed（失败是 `connection-core.spec.ts`，预存；与本任务无关）。25 test files failed 都是 vite/vue plugin 环境问题（`.vue` 文件 import 解析），与本任务无关。
- **Build**：跳过（预存 quasar/rollup "Source phase import" 配置问题，与本任务无关）。

## 边界决策记录

1. **bridge.ts push fieldName 保留**：设计 5.8 明确"不改 DisplayFieldMaterial shape"。bridge push 是 shape 决策，UI 通过 page enrich 不直接信任。
2. **projection toRow 删 fieldName**：TableRowProjection 是 projection 输出，可改 shape。toRow 删 fieldName 后 row.fieldName optional，UI 通过 enrich（page 层 frameReader lookup）覆盖。
3. **ScatterConfigDialog toBinding find lookup**：让 availableFields 携带结构化 binding 对象，select value 用 stable key，toBinding 用 find 查回结构化 binding（不分割字符串）。ScatterSourceBinding shape 不变（仍是 `{ groupId, dataItemId }`），结构化 migration 留待 v3。
4. **WaveformChart emptyVariant prop**：DisplayPanel 在 chart 模式下根据 chartInstance.series.length 推断（series.length === 0 ⟺ selectedItems 为空）。
5. **getFieldName 硬失败 '[Unknown Field]'**：永不返回 fieldId，避免 UUID 泄漏（V5）。
6. **migrate.ts mutable 中间对象 + cast**：exactOptionalPropertyTypes 模式下，spread 后字段 required 与 DisplayPreferencesPatch optional 不匹配。用 mutable 类型构造 + `as DisplayPreferencesPatch` cast 解决。
7. **不提取 shared/utils/field-key.ts**：display 用结构化对象 + page enrich（lookup Map 内部）；migration 是一次性逻辑；history 自行修。不满足 2+ feature 提取条件。

## 后续

### 等待用户二次审查

用户在压缩上下文后第一次审查（发现 4 blocker + 4 major + 2 minor），本轮全部修复。等用户二次审查确认。

审查维度：
- 直接合同合规（设计 5.1-5.10）
- 边界护栏合规（R19/V5/Selector 不可变/shared 提取）
- 反模式清理彻底性（bridge/projection 字符串透传 + 字符串分割 + frameReader 静态解析）
- 验证证据充分性（lint/tsc/test 三项本任务范围内全过）
- 边界场景覆盖（8 验收场景全过）

### 已知 gap

- 预存 tsc error（exactOptionalPropertyTypes + readonly Ref）不在本轮范围
- 预存 vite/vue plugin 环境问题（.vue import）不在本轮范围
- 预存 connection-core 测试 fail 不在本轮范围
- Build 因 quasar/rollup 配置问题跳过，未在打包态验证

### 未决项

- 运行时手工验证：图表冷启动占位、migration 加载旧 persistence、字段名显示
- 不提交，等用户审查反馈
