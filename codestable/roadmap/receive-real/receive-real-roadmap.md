---
doc_type: roadmap
slug: receive-real
status: active
created: 2026-05-08
last_reviewed: 2026-05-08
tags: [receive, telemetry, expression, fan-out, pipeline]
related_requirements: []
related_architecture: [rewrite-target-structure, rewrite-feature-boundaries, rewrite-feature-interaction-matrix]
---

# 遥测接收完整管线 (receive-real)

## 1. 背景

遥测接收是东方红上位机的核心能力：从已建立的串口/网络连接接收设备上报的字节流，识别帧结构、解析字段值、执行表达式换算，最终将参数值分发到可视化、存储、条件匹配等多个下游。

旧系统（`receiveFramesStore` 1387 行 + `dataDisplayStore` 1074 行）存在跨 store 耦合、SCOE 硬编码在通用接收流程、表达式同步阻塞主线程、无背压控制等问题。rewrite 已完成基础骨架（帧匹配 + 字段 raw 解析 + factor 换算 + task bridge），但表达式集成、read model、display/storage 扇出、背压预算均未实现。

本 roadmap 覆盖从当前骨架到完整接收管线的所有工作。这是 rewrite 最复杂的 feature，位于关键路径中间位置，任何延误会推迟 task-real / result-report / northbound 等后续工作。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- 表达式引擎集成（预编译 + 运行时求值 + 依赖排序）
- 参数当前值 read model（receive 持有，只读 selector 暴露）
- 扇出分发（routingTick 扩展，bridge 接线到 display / storage / task / unmatched）
- 全局参数变量收集（从各来源收集 VariableMap，供表达式求值消费）
- 背压基础机制（routingTick 预算截断，初始 N=50）

### 明确不做

- 星座图 I/Q 提取和可视化（归 display feature，receive 只按 `bytes` 类型解析）
- 高速存储短路（main 侧帧头匹配跳过 renderer，需 runtime 边界例外登记，列为未来工作）
- 全局参数 schema 定义（归 settings/runtime feature，receive 只消费 `VariableMap`）
- 未匹配帧完整记录（统计计数足够，完整记录是未来增强）
- SCOE 入站处理（已决策 SCOE bypass receive，走独立 adapter）
- display / storage 各自的节流策略实现（归各自 feature，本 roadmap 只定义扇出接口）

## 3. 模块拆分（概设）

```
receive-real
├── 解析管线 (parse-pipeline)：字节流 → 帧匹配 → 字段解析 → 表达式求值 → 产出 ReceiveBatchOutcome
├── 参数当前值 (read-model)：跨帧参数值维护，只读 selector 暴露，表达式闭环消费
└── 扇出分发 (fan-out)：routingTick 预算截断 + bridge 接线到 4 个下游目的地
```

### 模块 A · 解析管线 (parse-pipeline)

- **职责**：接收 `ReceiveInputBatch`，通过帧匹配识别帧结构，解析原始字段值，执行表达式求值（含依赖排序），产出扩展后的 `ReceiveBatchOutcome`。不感知下游消费者。
- **承载的子 feature**：receive-real-pipeline
- **触碰的现有代码**：`receive/core/field-parser.ts`（增加表达式分支）、`receive/core/processor.ts`（增加表达式 pass）、`receive/core/types.ts`（扩展类型）

### 模块 B · 参数当前值 (read-model)

- **职责**：维护参数当前值快照（基于现有 `receive-state.ts` 的 `fieldValues` 扩展），每次 ingestBatch 后更新。通过只读 selector 暴露给外部消费。为表达式求值提供跨帧参数（FRAME_FIELD 变量源）。
- **承载的子 feature**：receive-real-pipeline
- **触碰的现有代码**：`receive/state/receive-state.ts`（扩展状态结构）、`receive/selectors/receive-selectors.ts`（增加 read model selector）
- **与现有代码关系**：当前 `receive-state.ts` 已有 `fieldValues: ReceiveFieldValueSnapshot[]` 和 `mergeFieldValues` 函数维护最新值。read model 扩展此机制，增加按 `frameId/fieldId` 的快速查找索引，用于表达式跨帧变量解析。

### 模块 C · 扇出分发 (fan-out)

- **职责**：在 routingTick 内将 `ReceiveBatchOutcome` 转换并分发到 display / storage / task / unmatched 四个目的地。实现预算截断防止单次 tick 阻塞过久。不承载任何下游 feature 的领域逻辑。
- **承载的子 feature**：receive-real-pipeline
- **触碰的现有代码**：`runtime/routing-tick.ts`（扩展扇出逻辑）、新增 display bridge 和 storage bridge 文件

## 4. 模块间接口契约 / 共享协议（架构层详设）

> **类型引用约定**：本节不重定义已有类型。已有类型标注来源文件，只列出 receive 侧新增或变化的类型。

### 4.1 帧定义 → 解析管线

**方向**：frame feature → receive parse-pipeline
**形式**：selector 读取 + refreshFrameReferences 预编译

**已有类型引用**：
- `ReadonlyFrameAsset`：`frame/core/types.ts`（帧定义只读快照，含 `fields`、`identifierRules`）
- `FrameFieldDefinition`：`frame/core/types.ts`（字段定义，含 `expressionConfig?`、`factor?`、`dataType`、`dataParticipationType` 等）
- `ExpressionDefinition`：`frame/core/types.ts`（表达式配置，**注意实际结构是条件分支数组**）

**ExpressionDefinition 实际结构**（receive 消费方必须理解）：

```typescript
// frame/core/types.ts 实际定义
interface ExpressionDefinition {
  expressions: ConditionalExpressionDefinition[];  // 条件分支数组，不是 Map
  variables: ExpressionVariableDefinition[];        // 必填，不是 optional
}

interface ConditionalExpressionDefinition {
  condition: string;    // 条件表达式
  expression: string;  // 满足条件时的值表达式
}

interface ExpressionVariableDefinition {
  identifier: string;   // 变量标识（非 name）
  sourceType: string;   // 变量来源类型
  sourceId?: string;    // 来源 ID
  frameId?: string;     // 来源帧 ID
  fieldId?: string;     // 来源字段 ID
}
```

**receive 侧新增约束**：
- `refreshFrameReferences(frames)` 时预编译各帧的表达式
- `identifierRules` 由 frame feature 定义，receive 只消费不修改
- `indirect` 类型字段不参与帧匹配，但参与表达式求值
- `expressionConfig` 缺失时，字段值 = raw 解析值 × factor
- 预编译时需将 `ConditionalExpressionDefinition[]` 转换为 `shared/expression` 的 `compileConditional` 输入格式：`{ condition, expression }[]`

### 4.2 表达式预编译

**方向**：parse-pipeline 内部
**形式**：函数调用

**已有类型引用**：
- `CompiledGroup`、`CompileResult`、`GroupCompileResult`：`shared/expression/types.ts`
- `compileConditional`、`ConditionalCompileResult`：`shared/expression/index.ts`
- `defaultMathFunctions`：`shared/expression/index.ts`
- `ExpressionDefinition`、`ConditionalExpressionDefinition`：`frame/core/types.ts`

**receive 侧新增**：

```typescript
// 预编译缓存：frameId → 编译结果
// 简化为直接 Map，不引入额外包装类型
type ExpressionCompileCache = ReadonlyMap<string, CompiledGroup | CompiledConditional>;
// key = frameId，value = 该帧所有表达式编译后的结果

// 预编译函数：refreshFrameReferences 时调用
function compileFrameExpressions(
  frames: readonly ReadonlyFrameAsset[],
  mathFunctions: FunctionTable = defaultMathFunctions,
): ExpressionCompileCache;
```

**约束**：
- 每帧表达式使用 `compileGroup()` 或 `compileConditional()` 编译（取决于帧内表达式结构）
- 编译阶段完成依赖排序（Kahn 算法），运行时无需重新排序
- 编译失败时整个帧标记为 config-error，不阻断其他帧
- 缓存生命周期与 frameReference 一致，refresh 时重建
- 变量来源映射（`ExpressionVariableDefinition` → 运行时查找路径）在编译阶段提取，存为辅助数据

### 4.3 表达式运行时求值

**方向**：parse-pipeline 内部，field-parser 之后
**形式**：纯函数调用

**已有类型引用**：
- `evaluateGroup`：`shared/expression/index.ts`（返回 `GroupEvalResult`）
- `VariableMap`、`VariableValue`：`shared/expression/types.ts`

**receive 侧新增**：

```typescript
// 表达式求值 pass 的输入
interface ExpressionEvalInput {
  readonly compiled: CompiledGroup | CompiledConditional;
  readonly currentFrameRawValues: ReadonlyMap<string, VariableValue>;  // fieldId → raw parsed value
  readonly readModel: ReadonlyMap<string, ReadonlyMap<string, VariableValue>>;  // frameId → (fieldId → value)
  readonly globalParams: ReadonlyMap<string, VariableValue>;  // globalKey → value
}

// 求值函数：返回值复用 shared/expression 的 GroupEvalResult
// { values: ReadonlyMap<string, VariableValue>, errors: ReadonlyMap<string, string> }
function evaluateFrameExpressions(input: ExpressionEvalInput): GroupEvalResult;
```

**约束**：
- 变量收集顺序：current_frame raw values → read model cross-frame values → global params
- 同名变量后者覆盖前者（global params 优先级最低，current frame 最高）
- 求值失败的字段保留 raw value（factor 换算结果），错误记入 `ReceiveIssue`
- 纯函数，零副作用，可单测

### 4.4 解析管线 → Read Model

**方向**：parse-pipeline → read-model
**形式**：内部状态更新

**与现有代码关系**：

当前 `receive-state.ts` 已有 `fieldValues: ReceiveFieldValueSnapshot[]` 和 `mergeFieldValues` 函数。read model 不引入新的 `ParameterReadModel` 类型，而是：

1. 扩展现有 `fieldValues` 使其包含表达式求值后的值（而非仅 raw 值）
2. 增加按 `frameId → fieldId → value` 的 `Map` 索引，用于表达式跨帧变量解析的快速查找
3. 索引在 `mergeFieldValues` 后同步更新

**约束**：
- 只保留最新值，不保留历史
- 更新是覆盖语义（新值替换旧值）
- selector 返回深拷贝或冻结对象（selector 不可变约束）
- receive 内部可直接访问索引（表达式求值需要），外部通过 selector 只读

### 4.5 Read Model → 外部消费

**方向**：receive read-model → display / storage / task（通过 runtime bridge）
**形式**：selector 读取

**已有类型引用**：
- `ReceiveParsedFieldValue`：`receive/core/types.ts`

**receive 侧变化**（在已有 `ReceiveParsedFieldValue` 上新增 2 个字段）：

```typescript
// receive/core/types.ts 中 ReceiveParsedFieldValue 新增：
interface ReceiveParsedFieldValue {
  // ... 已有字段（frameId, frameName, fieldId, fieldName, dataType, offset, length, rawHex, value, displayValue, label?）不变 ...
  readonly expressionApplied: boolean;   // 是否执行了表达式求值（含"无表达式"场景：false）
  readonly expressionError?: string;     // 表达式求值失败原因（仅失败时存在）
}
```

**迁移策略**：
- `field-parser.ts` 产出时：`expressionApplied: false, expressionError: undefined`
- 表达式 pass 成功后：`expressionApplied: true`（覆盖 value 和 displayValue）
- 表达式 pass 失败时：`expressionApplied: true, expressionError: errorMsg`（保留 raw value）
- `routing-tick.ts` 中遍历 `outcome.fields` 的代码无需改动（只是多读两个字段）

**约束**：
- selector 返回值必须为只读快照
- 消费方不得通过返回值反向修改 receive 内部状态

### 4.6 扇出 → Display

**方向**：fan-out (routing-tick) → display service
**形式**：函数调用

**已有类型引用**：
- `DisplaySourceMaterial`、`DisplayFieldMaterial`：`display/core/types.ts`
- `DisplayService.ingestSourceMaterial(material)`：`display/services/display-service.ts`

**receive 侧职责**：
- routingTick 将 `ReceiveBatchOutcome`（kind=matched）传递给 display bridge
- display bridge 负责 `ReceiveParsedFieldValue` → `DisplayFieldMaterial` 的映射
- 映射中 `groupId` / `dataItemId` 的来源由 display bridge 实现时确定（display feature 负责定义）

**约束**：
- 只有 `kind: 'matched'` 且 `fields.length > 0` 的 outcome 才传递
- display 的节流策略由 display feature 自己管理
- receive 不定义 `FieldGroupMapping`——映射是 display 侧的职责

### 4.7 扇出 → Storage

**方向**：fan-out (routing-tick) → storage service
**形式**：函数调用

**已有类型引用**：
- `StorageLocalRecord`、`StorageRecordField`：`storage-local-baseline/core/types.ts`
- `StorageLocalService.appendLocalRecords(records)`：`storage-local-baseline/services/storage-local-service.ts`

**receive 侧映射规则**：
- `id` = `outcome.id`
- `capturedAt` = `outcome.processedAt`
- `source` = `'local'`
- `channel` = `outcome.input.source.sourceId`
- `fields` = `outcome.fields` 映射为 `{ key: fieldName, value }`

**约束**：
- 存储是否开启由 settings 配置控制，fan-out 检查开关后决定是否调用
- storage 的批量聚合写入策略由 storage feature 自己管理

### 4.8 扇出 → Task（条件匹配）

**方向**：fan-out (routing-tick) → task event source
**形式**：事件 bridge（已有接线）

**已有类型引用**：
- `ConditionMatchInput`：`task/core/types.ts`
- `ReceiveEventSourceBridge.emit(inputs)`：`runtime/bridges/receive-event-source-bridge.ts`

**约束**：
- 已通过 `ReceiveEventSourceBridge` 接线，无需新建 bridge
- 表达式求值后的 resolvedValue 作为 `value` 传入（而非 raw value）
- 映射逻辑已在 `routing-tick.ts` 中实现，需更新为使用表达式求值后的值

### 4.9 扇出 → 未匹配统计

**方向**：fan-out (routing-tick) → receive stats
**形式**：内部计数器更新

**已有类型引用**：
- `ReceiveStatsDelta`：`receive/core/types.ts`（**已包含 `unmatchedCount` 字段**）

**约束**：
- `unmatchedCount` 已存在于 `ReceiveStatsDelta`，无需新增字段
- 只需确保 routingTick 扇出中 unmatched outcome 的统计正确累加
- 统计值通过 receive selector 暴露

### 4.10 routingTick 预算截断

**方向**：runtime 层
**形式**：routingTick 参数扩展

**已有类型引用**：
- `routingTick(features)`：`runtime/routing-tick.ts`（当前签名无 options 参数）

**receive 侧变化**：

```typescript
// routingTick 新增可选 options 参数（向后兼容）
interface RoutingTickOptions {
  readonly maxEventsPerTick?: number;  // 默认 50，初始硬编码
}

async function routingTick(
  features: RewriteWiredFeatures,
  options?: RoutingTickOptions,
): Promise<RoutingTickResult>;
```

**影响面**：
- 调用点：`runtime/index.ts` 中的 tick 循环
- 迁移：调用点传入 `undefined` 即可（使用默认值），无需改动其他逻辑

**约束**：
- 单次 tick 最多处理 `maxEventsPerTick` 个事件，剩余留给下个 tick
- 被截断的事件保留在 connection 的 drain 队列中，下次 tick 继续
- N 值初始 50，后续压测后可配置化

### 4.11 全局参数收集

**方向**：receive 内部
**形式**：表达式求值前收集

**已有类型引用**：
- `VariableMap`、`VariableValue`：`shared/expression/types.ts`

**receive 侧新增**：

```typescript
// 全局参数收集（提取为独立函数仅为可测试性——时间 mock）
function collectGlobalParams(
  receiveStats: ReceiveStatsSnapshot,
  appStartTime: number,
): ReadonlyMap<string, VariableValue>;
```

**返回 key 约定**：
- 时间：`global.year` / `global.month` / `global.day` / `global.hour` / `global.minute` / `global.second` / `global.allSeconds` / `global.uptime`
- 通信统计：`global.sentPackets` / `global.receivedPackets` / `global.sentBytes` / `global.receivedBytes`
- 帧统计：`global.matchedFrames` / `global.unmatchedFrames`

**约束**：
- 时间类参数从 `Date.now()` 计算，不依赖外部 store
- 通信统计和帧统计从 receive stats 读取
- 初始版本不含位置参数（latitude/longitude），待 settings feature 提供后再加

## 5. 子 feature 清单

1. **receive-real-pipeline** — 完整接收管线：表达式集成 + read model + 扇出分发 + 背压基础
   - 所属模块：parse-pipeline + read-model + fan-out（跨全部三个模块）
   - 依赖：无（expression-engine、frame-real、connection-complete 均已完成）
   - 状态：done（表达式集成 ✅ read model ✅ 扇出接线 ✅ 背压 ✅ globalParams ⏸️ 推迟）
   - 对应 feature：未启动独立 feature
	   - 验收报告：codestable/roadmap/receive-real/receive-real-pipeline-acceptance.md
   - 备注：checklist 分阶段实施（表达式集成 → read model → 扇出接线 → 背压），但作为单个 feature 管理

**最小闭环**：`receive-real-pipeline` 做完后，可实现完整的"字节流 → 帧匹配 → 字段解析 → 表达式换算 → 参数值更新 → 条件匹配触发 → display 展示 → storage 记录"端到端链路。

## 6. 排期思路

**为什么 pipeline 是唯一子 feature**：pipeline 覆盖核心数据通路的完整实现。高速优化（背压压测、星座图吞吐、高速存储短路）依赖 runtime/hardware 验证环境，且不影响核心逻辑正确性，等 pipeline 完成且有性能数据后再决定是否需要。

**最小闭环**：做完后能端到端演示遥测接收全链路（输入 → 解析 → 表达式 → 展示 → 存储 → 触发），可以交付给用户做基础功能验证。

**卡点**：
- display bridge 中 `ReceiveParsedFieldValue` → `DisplayFieldMaterial` 的映射（`groupId`/`dataItemId` 来源）需要与 display feature design 对齐
- display/storage 各自的节流策略需要在扇出接线时协调

## 7. 观察项

- `architecture/rewrite-feature-interaction-matrix.md` 中 receive → display 的交互候选包含 `selector`、`explicit event`、`runtime orchestration`，本 roadmap 选择 `runtime orchestration`（bridge 接线），后续如有需要可补充 selector 直接读取
- display bridge 映射中 `groupId`/`dataItemId` 的来源需要与 display feature design 对齐——当前 display 的 `DisplayFieldMaterial` 要求这两个字段，receive 的 `ReceiveParsedFieldValue` 只有 `frameId` 和 `fieldId`，中间的映射关系待确认
- 高速存储短路是已知边界例外候选，本 roadmap 不处理。未来如需实现，需按 CLAUDE.md 要求显式登记边界例外（说明为什么 renderer 无法合理承载、main 中只保留什么、业务语义归口在哪里）
- expression-engine-brainstorm.md 记录了真实表达式样本（条件多分支、中文变量名），pipeline 实现时应使用这些样本作为 fixture
- **验收场景清单**（design/checklist 阶段需覆盖）：表达式编译失败帧的 behavior、表达式求值失败字段的降级（保留 raw value）、无表达式字段（只有 factor）的 `expressionApplied=false`、冷启动时 read model 无目标帧数据的跨帧引用、unmatched outcome 的完整扇出路径、高频数据 drain 队列截断行为

## 8. 变更日志

- 2026-05-08：初始起草
- 2026-05-08：正确性审查 + 过度设计审查后修订。主要变化：(1) §4 全部改为引用已有类型而非内联重定义；(2) 修正 ExpressionDefinition 结构为 ConditionalExpressionDefinition[]；(3) 移除 FieldGroupMapping 过早抽象；(4) 简化 FrameExpressionCache 为直接 Map；(5) 修正 unmatchedCount 已存在无需新增；(6) 移除 receive-real-highspeed 子 feature（改为观察项中的未来工作）；(7) 补充 breaking change 迁移策略和调用点影响面
