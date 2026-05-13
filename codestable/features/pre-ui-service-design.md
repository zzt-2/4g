---
doc_type: feature
type: design
status: locked
date: 2026-05-13
summary: UI 实施前所有 service 侧代码改动的实施设计，作为 UI 前最后一个代码改动对话的直接合同。
direct_contract: 本文档 + pre-ui-implementation-checklist.md
boundary_guards:
  - CLAUDE.md
  - rewrite-frontend-conventions.md
  - rewrite-quality-rules.md
  - pages-frame-connection-design.md
  - pages-task-send-command-design.md
  - rewrite-connection-design.md
  - rewrite-send-design.md
  - rewrite-task-design.md
  - command-ingress-design.md
  - rewrite-frame-design.md
---

# Pre-UI Service Implementation Design

## 元数据

- **类型**: design（实施设计）
- **直接合同**: 本文档 + `codestable/quality/pre-ui-implementation-checklist.md`
- **边界护栏**: CLAUDE.md, rewrite-frontend-conventions.md, 各 feature design doc, UI 页面 design doc
- **日期**: 2026-05-13
- **状态**: locked

## 目标

UI 实施前最后一个代码改动对话的直接合同。覆盖：

1. **Task-real 类型重组**（30 项，26 文件）— ScheduleDriver + 统一循环 + step repeat + fieldVariations
2. 修复所有测试失败（5 FAIL → 0 FAIL）
3. 清理所有文件残留和代码重复
4. 补齐 UI 页面 Service Readiness Audit 标注的全部 gap（含 task G1-G3 合并进 task-real）
5. 清理死 surface、类型重复、不可序列化类型
6. 基础设施到位（UnoCSS spacing、文档更新）

实施完成后，0 FAIL，UI 对话可以直接开始。

---

## Wave 0: Task-real 类型重组（30 项）

**直接合同**: `codestable/features/rewrite-task/task-real-design.md`（checklist 全文）+ `task-real-brainstorm.md`
**涉及**: task feature 下 26 个文件
**预估**: 大（5-8h）

本 wave 按 task-real-design.md checklist 逐项实施。以下只列执行策略和与本 design 其他 wave 的交叉点。完整类型定义、循环引擎设计、迁移映射见 task-real-design.md。

### W0-1. 类型系统重组

```
文件: task/core/types.ts (MAJOR)
```

按 task-real-design §1 实施：

1. 新增 `ScheduleDriver` discriminated union（immediate/timer/event）
2. 新增 `FieldVariation` 类型
3. 新增 `StepRepeat` 类型
4. 重组 `TaskDefinition`：`schedule: ScheduleDriver` 替代 `schedulingMode` + 平铺调度字段
5. 重组 `SendStepConfig`：`fieldValues→userFieldValues`、`targetId` 必选、移除 `options`、新增 `variables`/`intervalAfterMs`/`repeat`
6. 新增 `WaitConditionConfig`（替代 `WaitConditionStepConfig`，`conditions` 数组 + `timeoutMs` 可选）
7. 统一 `TaskStepDefinition`：`sendConfig/waitConfig/delayConfig→config`
8. `TaskStopCondition` 新增 `exitCondition`
9. `ConditionMatchInput` 改为多字段 `fieldValues: Record`
10. 移除 `TaskSchedulingMode`/`TASK_SCHEDULING_MODES`/`TaskTriggerSource`/`TASK_TRIGGER_SOURCES`/`WaitCondition`/`WaitConditionStepConfig`
11. 新增 `resolveStopCondition` 辅助函数

**已有代码部分实现**：`ConditionTerm`+`logicOperator`（types.ts:222-224）、`evaluateConditionGroup`（condition-matcher.ts）、`ConditionRegistry.registerGroup`（condition-registry.ts）已存在，移除旧 `register`/`unregister` 和旧 `WaitCondition` 引用。

### W0-2. 循环引擎统一

```
文件: task/services/task-iteration-loops.ts (MAJOR)
```

按 task-real-design §2 实施：

1. 移除 `runTimedLoop`/`runTriggerLoop`/`runSequenceLoop`
2. 新增 `runTask` 统一循环
3. 新增 `createDriver`（immediate/timer/event 三种 `ScheduleDriverAdapter`）
4. 新增 `createStopGuard`（maxIterations + maxDurationMs + exitCondition）
5. 新增 `executeRepeatableSend`（until + maxCount）
6. 新增 `resolveFieldValues`（fieldVariations 按轮次注入）
7. `intervalAfterMs` 在 executeSteps 中处理

### W0-3. ConditionRegistry 清理

```
文件: task/services/condition-registry.ts (MAJOR)
```

1. 移除旧 `register(condition, handler)`/`unregister(entry)` 单条件接口
2. `processInput` 移除 `singleMode` 双路径，统一走 `evaluateConditionGroup`
3. 仅保留 `registerGroup`/`unregisterGroup`

### W0-4. Step 执行器对齐

```
文件: task/services/task-step-executors.ts (MAJOR)
```

1. `buildSendRequest` 对齐 `SendRequest`：`fieldValues→userFieldValues`、移除 `options`/fallback `targetId`、新增 `variables`/`iteration`/`fieldVariations` 参数
2. `executeWaitConditionStep`：单条件注册→`registerGroup(conditions, handler)`
3. `StepExecutorContext` 新增 `fieldValueProvider`

### W0-5. Service 层适配

```
文件: task/services/task-service.ts (MINOR)
```

1. `runExecutionLoop`：从 `switch(schedulingMode)` 改为调用 `runTask`
2. `CreateTaskServiceOptions` 新增 `timerService?`/`fieldValueProvider?`

### W0-6. Task G1-G3 合并（Service Gaps）

此三项修改 task service，与 task-real 合并执行避免二次改同一文件：

**G1: updateTask**（同 design §C1）
```typescript
updateTask(instanceId: string, definition: TaskDefinition): TaskInstanceState | undefined {
  const inst = state.getInstance(instanceId);
  if (!inst || inst.lifecycle !== 'created') return undefined;
  return state.updateInstance(instanceId, { definitionRef: definition });
}
```

**G2: elapsedMs 派生**（同 design §C2）— 在 selector 层新增 `TaskHistoryEntry` 和 `selectTaskHistory`

**G3: stopAll 返回 stoppedCount**（同 design §C3）— `void→number`

### W0-7. Adapter + State + Selector 跟随

按 task-real-design §7.1 中 MINOR/FOLLOW 标注的文件逐个更新：

- `adapters/ports.ts`：新增 `TimerService` 接口
- `adapters/fake-send-service.ts`：适配新 `SendRequest` 字段
- `adapters/fake-receive-event-source.ts`：适配新 `ConditionMatchInput`
- `state/task-state.ts`：类型跟随
- `selectors/task-selectors.ts`：类型跟随 + 新增 `selectTaskHistory` 返回 `TaskHistoryEntry[]`
- `fixtures/task-fixtures.ts`：适配新类型
- 所有 `index.ts`：导出更新

### W0-8. 测试适配

1. 现有 70+ 测试全部适配新类型（`ScheduleDriver`/`ConditionTerm`/`WaitConditionConfig` 等）
2. 新增测试：`evaluateConditionGroup` AND/OR、`registerGroup`/`unregisterGroup`、统一 `runTask` timer/event/immediate、repeat 发送、fieldVariations 注入、exitCondition、stepResults 上限
3. G1-G3 新增测试：`updateTask` 成功/拒绝、`selectTaskHistory` elapsedMs 派生、`stopAll` 返回值

### W0-9. 代码精简（合并执行）

按 task-real-brainstorm §G 过度设计审查：

1. 删除 `FrameReader` 接口（`adapters/ports.ts`，无消费方）
2. 内联 `task-lifecycle-manager` 到 `task-service`（减少间接层）— 可选，看实施时复杂度

### W0 执行策略

task-real 是独立的 feature 重构，不依赖 Wave 1-4 中任何其他 feature 的改动。可以与 Wave 1（receive expression、connection cleanup）并行启动。

**并行方案**：
- Agent A: Wave 0（task-real 30 项）— 5-8h
- Agent B: Wave 1（receive + connection + command-ingress 修复）— 4h
- Agent C: Wave 1 其余 + Wave 3 cleanup — 2h

task-real 完成后，Wave 2 的 C1-C3 已包含在 W0-6 中，只需做 C4-C6（command-ingress gaps）。

---

## Wave 1: 代码修复（Phase A）

### A1. Receive 表达式集成 pass

**问题**: `processReceiveBatch` 未接受 `expressionCache` 参数，未对字段执行表达式后处理。4 个测试失败。

**修改**:

```
文件: receive/core/processor.ts（或 receive/services/ 中 processor 所在位置）
```

1. `ProcessReceiveBatchOptions` 新增可选字段 `expressionCache?: ExpressionCache`
2. `processReceiveBatch` 内部，帧匹配成功后、返回 `ReceiveFieldResult` 前，新增 expression pass:
   - 遍历 `outcome.fields`
   - 如果 field 无 `expressionConfig`：标记 `expressionApplied: false`
   - 如果 field 有 `expressionConfig`：从 cache 取编译结果 → evaluate → 用计算值替换 raw value → 标记 `expressionApplied: true`
   - 如果 evaluate 失败：保留 raw value + 标记 `expressionApplied: true` + `expressionError: message` + 追加 issue `receive.expression.evalFailed`
3. 如果 `expressionCache` 中有 compile 失败的帧：匹配后 `kind: 'config-error'` + issue `receive.expression.compileFailed`

**`ReceiveFieldResult` 扩展**:
```typescript
interface ReceiveFieldResult {
  // ...existing fields
  expressionApplied: boolean;
  expressionError?: string;
}
```

**依赖**: 无。Expression engine 已验收（112 测试全绿），`compileFrameExpressions` 已存在于测试文件中，需提升到 receive core 层。

**测试**: 现有 4 个 expression-pass.spec.ts 测试会通过。

### A2. Task skip-step 全局运行时测试隔离

**问题**: `task-service-state-selector.spec.ts` L379 单独通过但全局失败。疑似测试间共享 state。

**修改**:

```
文件: task/__tests__/task-service-state-selector.spec.ts
```

检查每个 `describe` 块是否正确创建独立的 `TaskStateContainer`（而非共享模块级变量）。如果 `createTaskService` 接受 `state` 参数，确保每个测试用例传入新建的 state。

**验证**: `pnpm vitest run` 全量通过（而非仅单文件）。

### A3. Connection selectors/ 目录物理删除

**问题**: selectors/ 目录声称已删除但物理文件仍在。含与 service 重复的业务逻辑。

**修改**:

```
删除: connection/selectors/connection-selectors.ts
删除: connection/selectors/index.ts
删除: connection/selectors/ 目录
```

**前提验证**: 确认 `connection/index.ts` 不从 selectors/ 导入任何内容。确认无外部文件 import `connection/selectors`。

**风险**: 如果有测试从 selectors/ 导入，需要把 import 改为从 service 或 core 获取等价 API。

### A4. Connection mapBridgeEvent 代码重复

**问题**: `real-serial-adapter.ts` 有 `mapBridgeEvent`+`toAdapterErrorKind` 的独立副本。

**修改**:

```
文件: connection/adapters/real-serial-adapter.ts
```

1. 删除 L19-78 的本地 `mapBridgeEvent` 和 `toAdapterErrorKind` 函数定义
2. 顶部 import 从 `../internal/map-bridge-event` 导入这两个函数
3. 运行 `pnpm vitest run src/features/connection/` 确认 65 测试全绿

### A5. Connection clone.ts 文件残留

**问题**: 逻辑已简化但文件仍存在。

**修改**:

```
删除: connection/core/clone.ts
```

**前提验证**: 搜索所有 `import.*from.*['\"].*clone['\"]` 或 `import.*from.*['\"].*core/clone['\"]`。确认无消费方后删除。如果有消费方，将消费方改为直接使用 `JSON.parse(JSON.stringify(x))` 或 `structuredClone(x)`。

### A6. Command-Ingress status-timer.ts 文件残留

**问题**: 逻辑已内联到 service L109，文件多余。

**修改**:

```
删除: command-ingress/services/status-timer.ts
```

**前提验证**: 确认无 import 此文件。运行 `pnpm vitest run src/features/command-ingress/` 确认 114 测试全绿。

### A7. Task selector 返回值 readonly 执行强化

**问题**: `{ ...instance } as ReadonlyTaskInstanceState` 浅拷贝不保护嵌套对象。

**修改**:

```
文件: task/selectors/task-selectors.ts
```

将每个 selector 返回的 spread clone 改为 deep clone：

```typescript
// Before
return { ...instance } as ReadonlyTaskInstanceState;

// After
return structuredClone(instance) as ReadonlyTaskInstanceState;
```

如果运行时不支持 `structuredClone`（非浏览器环境），使用 `JSON.parse(JSON.stringify(instance)) as ReadonlyTaskInstanceState`。

**验证**: 运行 task 测试确认 162 测试全绿。

---

## Wave 2: Command-Ingress Service Gaps（Phase C）

> Task G1-G3 已合并到 Wave 0 (W0-6)。本 wave 只做 command-ingress 的 3 个 gap。

### C1. Command-Ingress — 命令执行日志（CI-G1，原 C4）

**问题**: UI 命令执行日志 DataTable 无数据源。

**修改**:

```
新建: command-ingress/core/command-log.ts
修改: command-ingress/services/command-ingress-service.ts
修改: command-ingress/core/types.ts（如需）
```

1. 新增类型:
```typescript
export interface CommandLogEntry {
  readonly id: string;           // nanoid 或自增
  readonly timestamp: string;   // ISO
  readonly commandCode: number;
  readonly result: 'success' | 'error' | 'pending';
  readonly durationMs?: number;
  readonly error?: string;
}
```

2. 新增 recorder:
```typescript
export interface CommandLogRecorder {
  record(entry: Omit<CommandLogEntry, 'id'>): CommandLogEntry;
  complete(id: string, patch: Partial<Pick<CommandLogEntry, 'result' | 'durationMs' | 'error'>>): void;
  getAll(): readonly CommandLogEntry[];
  clear(): void;
}

export function createCommandLogRecorder(maxEntries?: number): CommandLogRecorder;
```

- `maxEntries` 默认 1000，超出丢弃最旧条目
- 内部维护 `CommandLogEntry[]`，`getAll()` 返回 readonly 快照

3. Service 接口新增:
```typescript
getCommandLog(): readonly CommandLogEntry[];
clearCommandLog(): void;
```

4. Service 内部在 `onCommand` 回调中集成:
```typescript
// onCommand 开始时
const logEntry = logRecorder.record({
  timestamp: now(),
  commandCode: parsed.commandCode,
  result: 'pending',
});

// settlement 回调中
logRecorder.complete(logEntry.id, {
  result: inst.lifecycle === 'completed' ? 'success' : 'error',
  durationMs: Date.parse(inst.completedAt ?? inst.failedAt ?? '') - Date.parse(logEntry.timestamp),
  error: inst.error,
});
```

**测试**: 新增 `command-log.spec.ts` 测试 recorder 的 record/complete/getAll/clear/maxEntries 行为。

### C2. Command-Ingress — 测试工具原始接收数据（CI-G2，原 C5）

**问题**: 测试工具接收区无数据源。

**修改**:

```
文件: command-ingress/services/command-ingress-service.ts
文件: command-ingress/services/data-recorder.ts（已存在）
```

1. Service 创建时新建一个 `DataRecorder` 实例作为 testDataRecorder
2. 在 adapter 的 consume 路径中（或 `onCommand` 之前），同步将 consumed raw bytes 录入 testDataRecorder
3. Service 接口新增:
```typescript
getTestDataRecorder(): DataRecorder;
```

4. 实现简单:
```typescript
const testDataRecorder = createDataRecorder();

// 在 adapter.consume 调用链中或 onCommand 入口
function recordTestData(rawBytes: Uint8Array): void {
  testDataRecorder.record({
    id: nanoid(),
    timestamp: now(),
    rawBytes,
    direction: 'inbound',
  });
}
```

**验证**: 现有 114 测试不受影响。

### C3. Command-Ingress — sendTestData 方法（CI-G3，原 C6）

**问题**: 测试工具发送区无法发送 HEX 数据。

**修改**:

```
文件: command-ingress/services/command-ingress-service.ts
```

1. Service 接口新增:
```typescript
sendTestData(hex: string, targetId: string): Promise<void>;
```

2. 实现:
```typescript
async sendTestData(hex: string, targetId: string): Promise<void> {
  const bytes = hexToBytes(hex);  // hex string → Uint8Array
  await connectionService.writeTo(targetId, bytes);
}
```

3. `hexToBytes` 放在 `command-ingress/core/` 或 `shared/`（如果其他 feature 也需要）。

4. 依赖: `connectionService.writeTo` 是否已暴露？需确认 ConnectionService 接口。如果未暴露，需要在 connection service 新增 `writeTo(targetId: string, data: Uint8Array): Promise<void>`。

**测试**: 新增测试验证 hex 解析和 writeTo 调用。

---

## Wave 3: 代码清理（Phase B）

### B1. Frame dead surface

**决策**:
- `FRAME_INPUT_TYPES` / `FrameInputType` → 从 `core/types.ts` 删除类型定义。已从 index.ts 移除，无外部消费方。
- `deserializeFrames` → 保留在 index.ts 导出。虽然当前零消费方，但导入功能（`ImportFrameDialog`）会使用。

**修改**:
```
文件: frame/core/types.ts
删除: FRAME_INPUT_TYPES 常量和 FrameInputType 类型
```

### B2. Connection dead surface + 类型重复

**前提**: A3 已删除 selectors/ 目录。

**修改**:

1. `ConnectionSummary` / `ConnectionTargetQuery` 统一到 `core/types.ts`，删除 `services/connection-service.ts` 中的重复定义
2. `createRealNetworkAdapter` / `getReconnectPolicy` / `nextReconnectDelay` / `createFakeConnectionTransportAdapter` → 从 `index.ts` 移除公开导出，降为内部使用。测试文件可直接从模块路径导入。

```
文件: connection/core/types.ts（保留 ConnectionSummary, ConnectionTargetQuery）
文件: connection/services/connection-service.ts（删除重复的 interface 定义，改为 import from core/types）
文件: connection/index.ts（移除 4 个无外部消费方的导出）
```

### B3. Command-Ingress HighlightRule 可序列化（CI-G4）

**问题**: `HighlightRule.match` 是 function，不可 JSON 序列化。

**修改**:

```
文件: command-ingress/core/types.ts
文件: command-ingress/core/highlight.ts
```

1. 新增数据驱动类型:
```typescript
export interface HighlightRuleConfig {
  readonly offset: number;
  readonly length: number;
  readonly pattern?: string;   // hex string，匹配特定字节
  readonly severity: 'info' | 'warning' | 'negative' | 'positive';
  readonly label?: string;
}
```

2. `calculateHighlights` 签名改为:
```typescript
export function calculateHighlights(
  data: Uint8Array,
  rules: readonly HighlightRuleConfig[],
): Highlight[];
```

3. 内部匹配逻辑: 遍历 rules → 在 data 的 offset 位置比较 length 字节（如果有 pattern 则比较，否则只标记范围）→ 返回 Highlight 数组。

4. 旧 `HighlightRule` interface（含 `match: function`）→ 删除或标记 `@deprecated`。

**测试**: 修改现有 highlight 测试使用 `HighlightRuleConfig`。

### B4. Command-Ingress dead surface

**前提**: A6 已删除 status-timer.ts。

**决策**:
- `createNorthboundProtocolAdapter` → 已删除 stub，不重建。甲方 Tab 全部 stub，等 schema 确认后再实现。
- `buildReadFileAndSendTask` / `buildWaitConditions` → 保留为内部 helper（有 task-builder 内部消费），从 index.ts 移除公开导出。
- `startStatusTimer` → 文件已删（A6），无需处理。

```
文件: command-ingress/index.ts（移除 3 个无外部消费方的导出）
```

### B5. Send doc audit 修正

**修改**:
```
文件: codestable/features/rewrite-send/send-real-brainstorm.md
```

将 §2.5 的 `compileGroup` / `evaluateGroup` 改为 `compileConditional` / `evaluateConditional`。

---

## Wave 4: 基础设施（Phase D）

### D1. UnoCSS spacing scale 映射

**修改**:
```
文件: rewrite/uno.config.ts
```

```typescript
import { defineConfig, presetUno } from 'unocss';

const spacingScale = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
  36: '144px',
  40: '160px',
  44: '176px',
  48: '192px',
  52: '208px',
  56: '224px',
  60: '240px',
  64: '256px',
  72: '288px',
  80: '320px',
  96: '384px',
};

export default defineConfig({
  presets: [presetUno()],
  theme: {
    spacing: spacingScale,
  },
});
```

**验证**: 确保 `gap-3` 产出 `gap: 12px`，与 `var(--rw-space-3)` 一致。检查 `rewrite/src/css/tokens/spacing.css` 确认 token 值对齐。

### D2-D3. Checklist 状态回写

```
文件: codestable/features/rewrite-connection/rewrite-connection-checklist.yaml
文件: codestable/features/bootstrap/bootstrap-checklist.yaml
```

将已完成的 item 状态从 `pending` 改为 `done`。

### D4. Frame 验收文档路径更新

```
文件: codestable/features/rewrite-frame/frame-real-acceptance.md
```

全局替换 `core/legacy.ts` → `core/legacy-normalizers.ts`。

### D5. 设计文档更新

根据 design-code-alignment-audit M1-M8 逐项修正。主要:

1. M1: Connection UI design 中 `selectConnectionSummaries(snapshot)` → `service.listConnectionSummaries()`
2. M4: Send brainstorm 中 `compileGroup`/`evaluateGroup` → `compileConditional`/`evaluateConditional`
3. M6: Frame acceptance 中 `core/legacy.ts` → `core/legacy-normalizers.ts`（与 D4 合并）

### D6. Report feature 补测试

```
新建: rewrite/src/features/report/__tests__/report-core.spec.ts（或类似）
```

基于 report feature 的 core 纯函数写测试。需先读 `rewrite/src/features/report/` 下所有文件确认 testable surface。

### D7. Receive-display bridge 类型对齐

```
文件: rewrite/src/runtime/bridges/receive-display-bridge.ts
```

将 `frameId`/`fieldId` 改为 `groupId`/`dataItemId`，与 `DisplayFieldMaterial` 类型对齐。

---

## 执行策略

### Wave 依赖图

```
Wave 0 (task-real 30 项) ─── 独立于其他 feature，可并行
Wave 1 (A1-A7)            ─── 无外部依赖，全部可并行
    │
    ▼
Wave 2 (C1-C3)            ─── 无依赖（task G1-G3 已在 W0-6）
    │
    ▼
Wave 3 (B1-B5)            ─── B2 依赖 A3，B4 依赖 A6
    │
    ▼
Wave 4 (D1-D7)            ─── 无依赖
```

### 并行策略

Wave 0 和 Wave 1-4 完全独立（不同 feature），可以同时启动。

**推荐执行顺序**:

| 批次 | Agent | 任务 | 预估 |
|------|-------|------|------|
| 1 | executor-1 | **Wave 0**: task-real 类型重组（W0-1~W0-9） | 5-8h |
| 1 | executor-2 | **Wave 1**: A1 receive expression integration | 2-3h |
| 1 | executor-3 | **Wave 1**: A3+A4+A5 connection cleanup | 1h |
| 1 | executor-4 | **Wave 1**: A6+A7 command-ingress cleanup + A2 task test fix | 1h |
| 2 | executor-2 | **Wave 2**: C1+C2+C3 command-ingress gaps | 2-3h |
| 2 | executor-3 | **Wave 3**: B1+B2+B5 cleanup | 30min |
| 2 | executor-4 | **Wave 3**: B3+B4 command-ingress cleanup | 30min |
| 3 | executor-2 | **Wave 4**: D1 UnoCSS + D7 bridge fix | 1h |
| 3 | executor-3 | **Wave 4**: D2-D5 doc updates | 30min |
| 3 | executor-4 | **Wave 4**: D6 report tests | 1-2h |

### 验证

每个 wave 完成后：
```bash
pnpm -C rewrite vitest run
pnpm -C rewrite lint
pnpm -C rewrite build
```

全部 wave 完成后：
- 0 FAIL
- 0 lint error
- build 通过

---

## 不做什么

- 不做 UI 组件或页面
- 不做 connection real bridge（Post-UI）
- 不做 routingTick 消费者链集成（Post-UI）
- 不做甲方 HTTPS 接口实现（stub）
- 不做 connection 配置持久化（Phase 2）
- 不建新 composable（composable 随 UI 页面一起建）
- 不修改 runtime wiring（routingTick 逻辑不变）
- 不建 TimerService platform 实现（只定义接口，测试用 fake）
