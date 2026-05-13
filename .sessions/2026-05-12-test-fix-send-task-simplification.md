# Session Handoff: 测试修复 + Send/Task 简化 (未完成)

**日期**: 2026-05-12
**状态**: 中断，未完成。存在潜在屎山风险。

## 任务来源

Lane B: 修复 66 个测试失败 + Send/Task 简化收尾。
直接合同: `codestable/quality/code-simplification-audit.md` §6.3(Send) 和 §6.4(Task)

## 改动总表

### 1. Send 模块 — 大面积改动

#### `rewrite/src/features/send/core/checksum.ts` — 重写
- 新增 `checksumCrc32()` — CRC32 查表实现
- 新增 `applyBuildPostPatch()` — 构建后补丁（checksum backfill + length field）
- `calculateChecksum()` 增加 `crc16` 别名、`crc32` 支持、可选 `options.startIdx/endIdx` 切片
- 新增 `ChecksumOptions`、`BuildPatchResult` 类型

#### `rewrite/src/features/send/core/types.ts` — 多处破坏性变更
- `CHECKSUM_KINDS` 新增 `'crc16'`、`'crc32'`
- `SendFieldEncodingDef` 新增: `factor?`, `defaultValue?`, `configurable?`, `expressionConfig?`, `validOption?`
  - 新增 `FrameChecksumOption`、`ExpressionBranch`、`ExpressionConfig` 接口
- `SendRequest.fieldValues` 改为可选，新增 `userFieldValues?`
- `SendRequest.options` 改为可选
- `SendOptions` 新增 `includeLengthField?`, `lengthFieldId?`, `bigEndian?`
- **风险**: `SendFieldEncodingDef` 之前只有 6 个必填字段，现在多了 5 个可选字段。消费方是否都兼容？

#### `rewrite/src/features/send/core/index.ts` — 新增导出
- `checksumCrc32`, `applyBuildPostPatch`, `BuildPatchResult`, `ChecksumOptions`
- `ExpressionBranch`, `ExpressionConfig`, `FrameChecksumOption`

#### `rewrite/src/features/send/services/send-service.ts` — 重写
- 删掉了服务内部的 `frameToBuildInput`（裸版），改用 `core/frame-resolver.ts` 的完整版
- 新增 import: `resolveFieldValues`, `applyFactor`, `applyBuildPostPatch`
- 新增 `SendVariableProvider` 依赖（可选，有 noOp fallback）
- `execute()` 流程完全重写: resolve fields → apply factor → build → post-patch → send
- 新增方向检查：`frame.direction === 'receive'` → build-error
- **风险**: 旧 `send-service` 的 `frameToBuildInput` 只映射 6 个字段，新版本映射了 11 个字段。所有消费方是否都正确？

#### `rewrite/src/features/send/adapters/ports.ts` — 新增接口
- 新增 `SendVariableProvider` 接口

#### `rewrite/src/features/send/adapters/index.ts` — 新增导出
- `SendVariableProvider`

#### `rewrite/src/features/send/index.ts` — 新增导出
- 所有新 checksum 函数、`applyBuildPostPatch`、`SendVariableProvider`

### 2. Task 模块 — 破坏性 API 变更

#### `rewrite/src/features/task/core/types.ts` — 破坏性变更 ⚠️
- `ConditionMatchInput` 从 `{ frameId, fieldId, value, sourceId? }` 改为 `{ frameId, fieldValues, sourceId? }`
  - **影响面**: 所有使用 `ConditionMatchInput` 的地方都要改
- 新增 `ConditionTerm` 接口（extends WaitCondition + `logicOperator?`）

#### `rewrite/src/features/task/core/condition-matcher.ts` — 重写
- `evaluateCondition()` 改为从 `input.fieldValues[condition.fieldId]` 取值（之前是 `input.value`）
- 新增 `evaluateSingleCondition()` — 单条件评估
- 新增 `evaluateConditionGroup()` — 条件组评估（AND/OR 短路逻辑）

#### `rewrite/src/features/task/core/index.ts` — 新增导出
- `ConditionTerm`, `evaluateSingleCondition`, `evaluateConditionGroup`

#### `rewrite/src/features/task/services/condition-registry.ts` — 重写
- 内部数据结构从 `Map<string, Set<ConditionEntry>>` 改为 `RegistryGroup[]` + `frameIndex`
- 保留 `register()`/`unregister()` API（legacy 兼容）
- 新增 `registerGroup()`/`unregisterGroup()` API
- `processInput()` 分两种模式：`singleMode`（旧 API 路径）和 group 模式
- **风险**: 旧 `register`/`unregister` 用 `ConditionEntry`（ opaque 对象），新实现用 `{ _group }`。如果消费方依赖 entry 的内部结构会炸。

#### `rewrite/src/features/task/fixtures/task-fixtures.ts` — 格式更新
- 7 个 `matchInputs` fixture 从 `{ frameId, fieldId, value }` 改为 `{ frameId, fieldValues: { [fieldId]: value } }`

#### `rewrite/src/features/task/__tests__/task-core.spec.ts` — 格式更新
- 3 处内联 input 从旧格式改为新格式

#### `rewrite/src/features/task/__tests__/task-service-state-selector.spec.ts` — 多处更新
- 6 处 `fakeReceive.emit(...)` 从旧格式改为 `fieldValues` 格式
- 1 处 settle timeout 从 500ms 改为 2000ms

### 3. Shared 模块

#### `rewrite/src/shared/condition-operators/compare.ts` — 语义变更 ⚠️
- `any` 操作符：从 `actual != null` 改为永远 `true`
- **风险**: `any` 的语义从"任何非 null 值"变成"任何值包括 null"。这是否符合设计意图？如果其他地方依赖 `any` 不匹配 null 的行为，会出问题。

### 4. Platform Bridge

#### `rewrite/src/shared/platform-bridge.ts` — 默认值变更
- `createRewriteBridgeInfo` 默认 capabilities 从 `['transport', 'file']` 改为 `['transport']`
- **风险**: 如果有其他地方依赖 `file` capability 的存在，会炸。

### 5. Receive 模块 — 中间状态 ⚠️ 未完成

#### `rewrite/src/features/receive/core/types.ts` — 新增类型（已完成）
- `ReceiveParsedFieldValue` 新增 `expressionApplied?`, `expressionError?`
- `ReceiveProcessInput` 新增 `expressionCache?`
- 新增 `FrameExpressionCompiled`, `FrameExpressionCompileResult`, `ExpressionCompileCache`, `ExpressionEvalInput`

#### `rewrite/src/features/receive/core/processor.ts` — 中间状态 ⚠️
- 已添加 `import { evaluateFrameExpressions }` 但未使用
- **未完成**: 需要在 `matched` 路径中集成表达式评估逻辑
- 当前大概率编译不过或 lint 报 unused import

#### `rewrite/src/features/receive/core/index.ts` — 新增导出
- `ExpressionCompileCache`, `ExpressionEvalInput`, `FrameExpressionCompileResult`, `FrameExpressionCompiled`
- `compileFrameExpressions`, `evaluateFrameExpressions`

## 测试验证状态

### 通过的
- send-checksum-patch: 20/20 ✅
- send-integration: 10/10 ✅
- task-condition-system: 24/24 ✅
- task-service-state-selector: 38/38 ✅
- task-core: 73/73 ✅

### 未验证（需要全量跑）
- expression-pass: 4 个失败（processor 集成未完成）
- smoke: 未单独验证
- 全量测试未跑

### Known gaps（不在本轮修）
- connection-reconnect: 7 个失败
- bootstrap: 1 个失败

## 未执行的步骤
- Send 简化 S-S1（删 clone.ts）、S-S2（删 validation.ts）、S-S3（删 selectors/）
- Task 简化 T-S1（删 clone.ts）、T-S2（合并 selectors 到 state）

## 审查清单 — 需要子 agent 验证的点

1. **`ConditionMatchInput` 破坏性变更是否合理？**
   - 对比 `codestable/features/task/` 下的 design doc，确认 `ConditionMatchInput` 的设计意图
   - 是否应该保持向后兼容而不是改接口形状？

2. **`SendFieldEncodingDef` 扩展是否与 frame feature 的 `FrameFieldDefinition` 对齐？**
   - `core/frame-resolver.ts` 里的 `frameToBuildInput` 之前已经映射了这些字段吗？
   - 还是说这是新增映射？

3. **`send-service.ts` 重写后的流程是否完整正确？**
   - 检查 `CreateSendServiceOptions` 新增的 `variableProvider` 是否破坏现有消费方

4. **`any` 操作符语义变更是否符合设计？**
   - 查 task design doc 中 `any` 的定义

5. **`processor.ts` 的中间状态需要清理**

6. **`applyBuildPostPatch` 的实现是否覆盖了所有 checksum 场景？**
   - 特别是 `endFieldIndex` 的 inclusive 边界

7. **`createRewriteBridgeInfo` 默认 capabilities 变更是否影响其他模块？**
