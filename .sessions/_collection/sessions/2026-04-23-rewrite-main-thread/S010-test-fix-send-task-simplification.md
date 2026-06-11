# [S010] 测试修复与 Send/Task 简化

> 2026-05-12 | 技术债清理阶段 | 未完成

## 目标

修复 66 个测试失败，完成 Send/Task 模块的代码简化收尾。直接合同为 `codestable/quality/code-simplification-audit.md` 6.3(Send) 和 6.4(Task)。

## 记录

### 背景

S006 完成全局规划后，代码精简审计识别出 Send 和 Task 模块存在冗余层和过时 API。与此同时，全量测试暴露 66 个失败用例，主要集中在 checksum 扩展、条件匹配接口变更和表达式集成尚未完成的三条线。

本日在修复测试的过程中，对 Send 和 Task 做了较大面积的重写和 API 变更。因改动量过大（235 files, +22346/-546），傍晚用 `git stash` 暂存保护后中断。commit 4528e67。

### Send 模块改动

**checksum.ts 重写**：新增 `checksumCrc32()` CRC32 查表实现、`applyBuildPostPatch()` 构建后补丁（checksum backfill + length field）。`calculateChecksum()` 增加 `crc16` 别名和 `crc32` 支持，新增 `startIdx/endIdx` 切片参数。

**types.ts 破坏性扩展**：`CHECKSUM_KINDS` 新增 `crc16`、`crc32`。`SendFieldEncodingDef` 新增 5 个可选字段（`factor`、`defaultValue`、`configurable`、`expressionConfig`、`validOption`）。`SendRequest.fieldValues` 和 `options` 均改为可选，新增 `userFieldValues`。`SendOptions` 新增 `includeLengthField`、`lengthFieldId`、`bigEndian`。

**send-service.ts 重写**：删掉内部 `frameToBuildInput` 裸版，改用 `core/frame-resolver.ts` 完整版。`execute()` 流程重写为 resolve fields -> apply factor -> build -> post-patch -> send。新增 `SendVariableProvider` 依赖（可选，有 noOp fallback）。新增方向检查：receive 方向帧直接 build-error。

**新增文件**：`core/frame-resolver.ts`（帧到构建输入的完整映射，11 个字段）、`adapters/fake-variable-provider.ts`（测试用）、`__tests__/send-checksum-patch.spec.ts`（20 tests）、`__tests__/send-frame-resolver.spec.ts`、`__tests__/send-integration.spec.ts`（10 tests）。

### Task 模块改动

**types.ts 破坏性变更**：`ConditionMatchInput` 从 `{ frameId, fieldId, value, sourceId? }` 改为 `{ frameId, fieldValues, sourceId? }`。消费方需统一从 `fieldValues[condition.fieldId]` 取值。新增 `ConditionTerm` 接口（extends WaitCondition + `logicOperator?`）。

**condition-matcher.ts 重写**：`evaluateCondition()` 改为从 `input.fieldValues` 取值。新增 `evaluateSingleCondition()` 和 `evaluateConditionGroup()`（AND/OR 短路逻辑）。

**condition-registry.ts 重写**：内部数据结构从 `Map<string, Set<ConditionEntry>>` 改为 `RegistryGroup[]` + `frameIndex`。保留旧 `register()`/`unregister()` API 兼容，新增 `registerGroup()`/`unregisterGroup()` API。`processInput()` 分 singleMode（旧路径）和 group 模式。

**fixture 和测试更新**：7 个 `matchInputs` fixture 和 3 处内联 input 从旧格式改为 `fieldValues` 格式。6 处 `fakeReceive.emit(...)` 同步更新。

### Shared / Platform 改动

- `condition-operators/compare.ts`：`any` 操作符从 `actual != null` 改为永远 `true`（语义从"非 null 值"变为"任何值包括 null"）。
- `platform-bridge.ts`：`createRewriteBridgeInfo` 默认 capabilities 从 `['transport', 'file']` 改为 `['transport']`。

### Receive 模块中间状态

`receive/core/types.ts` 已新增表达式相关类型（`ReceiveParsedFieldValue.expressionApplied`、`ExpressionCompileCache` 等），但 `processor.ts` 中 `evaluateFrameExpressions` 的 import 已添加却未集成到 `matched` 路径。该模块处于中间状态，大概率 lint 报 unused import。

### 测试验证结果

已通过：
- send-checksum-patch: 20/20
- send-integration: 10/10
- task-condition-system: 24/24
- task-service-state-selector: 38/38
- task-core: 73/73

未通过 / 未验证：
- expression-pass: 4 个失败（processor 集成未完成导致）
- smoke、全量测试未单独验证

Known gaps（不在本轮修）：connection-reconnect 7 个失败、bootstrap 1 个失败。

### 未执行的简化步骤

审计报告中的以下简化步骤均未执行：
- Send：S-S1 删 clone.ts、S-S2 删 validation.ts、S-S3 删 selectors/
- Task：T-S1 删 clone.ts、T-S2 合并 selectors 到 state

### 待验证风险

1. `ConditionMatchInput` 破坏性变更是否与 task design doc 设计意图一致。
2. `SendFieldEncodingDef` 扩展后 11 个字段映射是否与 frame feature 的 `FrameFieldDefinition` 对齐。
3. `send-service.ts` 重写后 `variableProvider` 依赖是否破坏现有消费方。
4. `any` 操作符语义变更是否符合设计。
5. `processor.ts` 中间状态的 unused import 需清理。
6. `applyBuildPostPatch` 的 `endFieldIndex` inclusive 边界覆盖是否完整。
7. `createRewriteBridgeInfo` 去掉 `file` capability 后是否影响其他模块。

## 后续

1. **清理 Receive processor 中间状态**：完成 `evaluateFrameExpressions` 集成或回退 unused import，确保 lint 通过。
2. **继续执行 Send/Task 简化步骤**：S-S1~S-S3、T-S1~T-S2，逐项删除冗余层。
3. **全量测试跑通**：修复 expression-pass 4 个失败、connection-reconnect 7 个失败、bootstrap 1 个失败。
4. **验证 7 项风险**：对每项做代码事实确认，确定是否需要回退或补充。
5. 05-13 续接后已完成 Wave 0~4 推进（见 S011）。
