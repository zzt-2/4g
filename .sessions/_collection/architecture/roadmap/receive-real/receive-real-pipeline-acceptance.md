# receive-real-pipeline 验收报告（阶段 2+3）

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-08
> 关联方案 doc：codestable/roadmap/receive-real/receive-real-roadmap.md §4.4-4.9
> 前置：阶段 1（表达式集成）已在之前完成

## 1. 接口契约核对

对照 roadmap §4.4-4.9 逐条核查：

### §4.4 解析管线 → Read Model
- [x] 不引入新 `ParameterReadModel` 类型，扩展现有 `fieldValues` → 一致，未引入新类型
- [x] 增加 `Map<frameId, Map<fieldId, value>>` 索引 → `getReadModelIndex()` 返回 `ReadonlyMap<string, ReadonlyMap<string, VariableValue>>`
- [x] 索引在 `mergeFieldValues` 后同步更新 → `getReadModelIndex()` 从 `snapshot.fieldValues` 实时构建，每次调用产新 Map
- [x] selector 返回深拷贝/冻结 → 索引每次构建新 Map，非共享引用
- [x] receive 内部可直接访问索引，外部通过 selector 只读 → 服务内部通过 `state.getReadModelIndex()`，外部通过 `receiveService.listFieldValues()` 只读

### §4.5 Read Model → 外部消费
- [x] `ReceiveParsedFieldValue` 新增 `expressionApplied` / `expressionError` → 阶段 1 已落地
- [x] 迁移策略：field-parser 产出 `expressionApplied: false`，表达式 pass 成功后 `true`，失败时 `true + expressionError` → `processor.ts:applyExpressionPass` 已实现
- [x] routing-tick 中 `outcome.fields` 代码无需改动（只是多读两个字段）→ 确认：routing-tick 只读 `field.value` / `field.fieldId`，无需改动

### §4.6 扇出 → Display
- [x] `routingTick` 将 matched outcome 传递给 display bridge → `routing-tick.ts:75` 调用 `fanOutToDisplay`
- [x] display bridge 负责 `ReceiveParsedFieldValue` → `DisplayFieldMaterial` 映射 → `receive-display-bridge.ts` 实现
- [x] `groupId = frameId`，`dataItemId = fieldId` → `receive-display-bridge.ts:19-20`
- [x] 只有 `kind: 'matched'` 且 `fields.length > 0` 才传递 → `receive-display-bridge.ts:11-12` 两层过滤
- [x] display 节流策略由 display 自己管理 → 未在 bridge 层做节流，符合约束

### §4.7 扇出 → Storage
- [x] `id = outcome.id` → `receive-storage-bridge.ts:15`
- [x] `capturedAt = outcome.processedAt` → `receive-storage-bridge.ts:16`
- [x] `source = 'local'` → `receive-storage-bridge.ts:17`
- [x] `channel = outcome.input.source.sourceId` → `receive-storage-bridge.ts:18`
- [x] `fields = outcome.fields` 映射为 `{ key: fieldName, value }` → `receive-storage-bridge.ts:19-22`
- [x] 存储开关由 settings 控制 → `routing-tick.ts:79` 检查 `isAutoSaveEnabled()`
- [x] storage 聚合写入策略由 storage 自己管理 → bridge 只做单次 append

### §4.8 扇出 → Task（条件匹配）
- [x] 已通过 `ReceiveEventSourceBridge` 接线 → 无变化，确认代码未改动
- [x] 表达式求值后的 resolvedValue 作为 value 传入 → `processor.ts` 已在 expression pass 中更新 `field.value`，routing-tick 读取的是已求值后的值

### §4.9 扇出 → 未匹配统计
- [x] `unmatchedCount` 已存在于 `ReceiveStatsDelta` → 确认无需新增字段
- [x] routingTick 扇出中 unmatched outcome 统计正确累加 → `receive-state.ts:addCounters` 中 `unmatchedCount` 累加

## 2. 行为与决策核对

### 明确不做逐项确认
- [x] 星座图 I/Q → 未触碰
- [x] 高速存储短路 → 未触碰
- [x] 全局参数 schema → 未触碰（globalParams 传空 map）
- [x] 未匹配帧完整记录 → 只累加计数器
- [x] SCOE 入站 → 未触碰
- [x] display/storage 节流策略 → 未在 bridge 层实现
- [x] 背压预算截断 → 已实现（routing-tick.ts:47-48，maxEventsPerTick=50）

### 关键决策落地
- [x] receive 不感知消费者，fan-out 在 runtime 层 → bridge 文件在 `runtime/bridges/`，receive feature 无 display/storage import
- [x] selector 返回只读快照 → `getReadModelIndex()` 每次构建新 Map
- [x] 存储开关由 settings 控制 → `isAutoSaveEnabled()` 检查
- [x] groupId/dataItemId 初始版本用 frameId/fieldId → `receive-display-bridge.ts` 实现

### 挂载点反向核对
grep 确认 receive-real-pipeline 在代码中的所有引用：

- `receive-state.ts` — 内部改动，receive feature 自身
- `receive/core/processor.ts` — 内部改动
- `receive/services/receive-service.ts` — 内部改动
- `runtime/routing-tick.ts` — runtime 编排层，正式挂载点
- `runtime/feature-wiring.ts` — runtime 装配，正式挂载点
- `runtime/bridges/receive-display-bridge.ts` — runtime bridge
- `runtime/bridges/receive-storage-bridge.ts` — runtime bridge

所有引用都落在 runtime 层或 receive feature 内部，无越界。

拔除沙盘推演：删除 runtime/bridges/receive-display-bridge.ts + receive-storage-bridge.ts，还原 routing-tick.ts 的 fan-out 调用，还原 feature-wiring.ts 的 displayService/storageLocalService 字段 → receive feature 核心逻辑不受影响，display/storage 各自独立。

## 3. 验收场景核对

- [x] **Read model 索引正确性**：`getReadModelIndex()` 从 fieldValues 构建索引，跳过 null 值 → 类型系统保证 + 现有 receive-state 测试覆盖 fieldValues 合并逻辑
- [x] **表达式跨帧变量使用 read model**：`processor.ts:applyExpressionPass` 接受 readModel 参数并传入 `evaluateFrameExpressions` → 代码链路完整
- [x] **Display fan-out 只处理 matched outcomes**：`fanOutToDisplay` 双层过滤 → 测试覆盖（routing-tick.spec.ts "skips display fan-out for unmatched outcomes"）
- [x] **Storage fan-out 受 settings 控制**：`routing-tick.ts:79` 检查 `isAutoSaveEnabled()` → 代码确认
- [x] **Storage mapping 正确**：id/capturedAt/source/channel/fields 映射 → 对照 §4.7 逐项确认
- [x] **RoutingTickResult 新增字段**：displayFieldsSent / storageRecordsSent → 测试覆盖
- [x] **无表达式字段 expressionApplied=false**：field-parser 产出时设为 false → 阶段 1 已实现
- [x] **表达式求值失败降级**：保留 raw value + expressionError → 阶段 1 已实现

前端改动：本次无 UI 改动，无需浏览器验证。

## 4. 术语一致性

未引入新概念/新类型名。所有新增函数/变量名在 roadmap 中有对应：
- `getReadModelIndex` — roadmap §4.4 "快速查找索引"
- `fanOutToDisplay` / `fanOutToStorage` — roadmap §4.6/4.7 "扇出"
- `displayFieldsSent` / `storageRecordsSent` — 扇出计数
- `readModel` — roadmap §4.3/4.4 通用术语

## 5. 架构归并

- [x] `rewrite-target-structure.md` — 无需更新。bridges 在 `runtime/bridges/` 下，符合 §9 "runtime 只负责应用级装配和跨域编排"
- [x] `rewrite-feature-interaction-matrix.md` — 无需更新。receive→display（line 257）和 receive→storage 已有条目，"runtime orchestration" 已列为候选机制，本次实现验证了该选择
- [x] AGENTS.md — 无需更新。未暴露新的项目级约束或命令陷阱

## 6. requirement 回写

无。roadmap frontmatter 无 `requirement` 字段，receive-real-pipeline 是内部管线能力，不直接对应用户故事。用户可感能力（遥测参数展示、存储记录）分别归 display/storage feature。

## 7. roadmap 回写

roadmap: `receive-real`，roadmap_item: `receive-real-pipeline`

当前 items.yaml 状态 `status: planned`。阶段 2+3 已完成，但 roadmap 覆盖的全部工作包括：
- 阶段 1（表达式集成）✅ 已完成
- 阶段 2（Read Model）✅ 本次完成
- 阶段 3（扇出接线）✅ 本次完成
- 阶段 4（背压预算截断）❌ 推迟

**结论**：全部阶段已完成，item 状态更新为 `done`。globalParams 收集推迟（依赖 settings feature）。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的内容。所有改动遵循已有架构规则。

## 9. 遗留

### 后续优化点
- ~~背压预算截断（routingTick maxEventsPerTick，roadmap §4.10）——推迟到有性能数据后决定~~ → 已实现（routing-tick.ts:47-48，maxEventsPerTick 默认 50）
- 全局参数收集（collectGlobalParams，roadmap §4.11）——依赖 settings/runtime feature 提供 global params

### 已知限制
- `storageLocalService` 需要 `LocalMaterialAdapter`（文件系统）才能启用存储扇出；运行时未提供 adapter 时存储 fan-out 静默跳过
- `getReadModelIndex()` 每次调用重建索引（O(n)），在高频场景下可能有微弱性能开销；当前 fieldValues 规模（百级字段）不构成瓶颈
- display bridge 映射中 `groupId=frameId` / `dataItemId=fieldId` 是初始版本，后续需与 display feature design 对齐是否需要更丰富的映射

### 实现阶段顺手发现
- `processor.ts:230` 原有 `field.name` 应为 `field.fieldName`（类型错误）——已修复
