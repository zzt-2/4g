# 跨 Feature 身份标识与映射冗余审计

> 审计日期：2026-05-12
> 审计范围：rewrite/src/features/ (11 features) + rewrite/src/runtime/ + rewrite/src/shared/
> 基准源头：frame feature 的 frameId + fieldId
> **状态：H1/H2/M4 已实施并通过验证（build + 816 tests passed）**

---

## §1 当前状态：各 Feature 标识模型概览

### 1.1 标识权威链

| Feature | 拥有的标识 | 引用的外部标识 | 引用方式 |
|---|---|---|---|
| **frame** | frameId, fieldId, direction, expressionId, sourceId | 无（基准源） | — |
| **receive** | sourceId, connectionId, batch.id, referenceVersion | frameId, fieldId | 直接 string 引用，无包装 |
| **send** | stepIndex | frameId, fieldId, targetId, connectionId | 直接引用，adapter 层隔离 |
| **storage** | record.id, channel, field.key, source, capturedAt | 无 | 完全独立身份系统 |
| **display** | seriesKey (composite) | frameId, fieldId | 直接引用，seriesKey = `${frameId}:${fieldId}` |
| **status** | indicator.id | frameId, fieldId, connectionId | 纯 string，无类型级耦合 |
| **task** | definition.id, instanceId, step.id, stepIndex, iteration, groupId | frameId, fieldId, targetId, sourceId | 直接 string 引用 |
| **command-ingress** | commandId, protocolId, satelliteId, commandCode | connectionId, frameId, fieldId, targetId, taskId | 直接引用 |
| **connection** | connectionId, targetId (derived), eventId | port paths (platform) | targetId = `transport:${connectionId}` |

### 1.2 依赖关系图

```
frame (frameId/fieldId)
  ├── receive ──→ storage (独立 channel 系统)
  ├── receive ──→ display (透传 frameId/fieldId)
  ├── receive ──→ task (ConditionMatchInput)
  ├── send (透传 frameId/fieldId/targetId)
  ├── task (透传 frameId/fieldId)
  ├── status (透传 frameId/fieldId)
  └── command-ingress (透传 frameId/fieldId)

connection (connectionId)
  ├── receive (sourceId = connectionId)
  ├── send (targetId → connectionId 内部解析)
  ├── status (connectionId string)
  └── command-ingress (connectionId 直接引用)
```

### 1.3 Selector 层状态

**11 个 feature 的 selector 全部零跨 feature import。** 这是最干净的架构层，无需任何修改。

---

## §2 问题清单

### HIGH（同一概念 3+ 不同名称，或映射链超过 2 层）

| # | 问题 | 证据 | 影响范围 |
|---|---|---|---|
| H1 | ValidationSeverity + ValidationIssue 在 6 个 feature 中重复定义 | frame, connection, settings, storage, display, status 各自定义 `XxxValidationSeverity = 'error' \| 'warning'` 和 `XxxValidationIssue` | 6 features, 12+ 类型 |
| H2 | platform-bridge.ts 放在 shared/ 但包含领域类型 | `shared/platform-bridge.ts` 包含 `TransportBridgeEvent`, `SerialPortCandidate` 等业务类型 | connection, platform |
| H3 | storage 的 `channel` 和 `field.key` 完全独立于 frame 的 frameId+fieldId | storage-core/types.ts 定义 channel: string, field.key: string，无 frame import | storage, runtime bridge |

### MEDIUM（同一概念 2 个不同名称，有不必要映射层）

| # | 问题 | 证据 | 影响范围 |
|---|---|---|---|
| M1 | connection→receive bridge 重命名字段 | connection-to-receive.ts: `occurredAt→receivedAt`, `connectionId→source.sourceId` | runtime bridge |
| M2 | receive→display bridge 近 1:1 复制 | receive-display-bridge.ts: 从 ReceiveParsedFieldValue 复制 5/13 字段到 DisplayFieldMaterial，仅加 updatedAt | runtime bridge |
| M3 | receive→storage bridge 重命名字段 | receive-storage-bridge.ts: `processedAt→capturedAt`, `fieldName→key` | runtime bridge |
| M4 | ComparisonOperator 在 shared 和 task 中各定义一份 | shared/condition-operators/types.ts vs task/core/types.ts 值完全相同 | task |
| M5 | SchemaVersion 模式在 5+ feature 中重复 | connection, settings, status, display, receive 各自定义 `XXX_SCHEMA_VERSION = 1 as const` | 5 features |
| M6 | command-ingress-service 直接注入 4 个其他 feature service | command-ingress-service.ts 构造函数接收 TaskService, SendService, ConnectionService, FrameAssetReader | command-ingress |

### LOW（命名风格不统一但不影响功能）

| # | 问题 | 证据 | 影响范围 |
|---|---|---|---|
| L1 | connection targetId 是 connectionId 的 1:1 派生 | lifecycle.ts: `targetId = transport:${connectionId}`，send 内部再解析回 connectionId | connection, send |
| L2 | display seriesKey 是 frameId+fieldId 的拼接 | projection.ts: `` `${frameId}:${fieldId}` `` 作为 Map key | display |
| L3 | HealthLevel 在 status 和 command-ingress 中近似重复 | status: `'healthy'\|'degraded'\|'error'\|'unknown'` vs command-ingress: `'unknown'\|'healthy'\|'error'` | status, command-ingress |
| L4 | ChecksumMethod 在 frame 和 send 中略有差异 | frame: `'sum8'\|'xor8'\|'crc16'\|'crc32'\|'custom'` vs send: `'none'\|'sum8'\|'xor8'\|'crc16-modbus'\|'crc32'` | frame, send |

---

## §3 修复建议

### H1: ValidationSeverity + ValidationIssue 提取到 shared

**统一方案**：提取到 `shared/types/validation.ts`

```typescript
export type ValidationSeverity = 'error' | 'warning';
export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}
```

**需要改的文件**：
- frame/core/types.ts, connection/core/types.ts, settings/core/types.ts, storage/core/types.ts, display/core/types.ts, status/core/types.ts
- 对应的 validation.ts 文件（引用类型改为 import from shared）
- 对应的 normalize.ts / clone.ts / fixtures.ts（引用类型改为 import from shared）

**影响测试**：已通过验收的测试中类型引用需更新 import 路径，行为不变。

**实施时机**：后续集中清理。低风险，纯类型重构。

### H2: platform-bridge.ts 移出 shared/

**统一方案**：移动到 `rewrite/src/platform/bridge-types.ts`

**理由**：shared/ 规则要求零 feature 依赖、纯工具/类型。TransportBridgeEvent、SerialPortCandidate 等是 connection 领域概念，不是跨 feature 基础能力。

**需要改的文件**：
- 移动 shared/platform-bridge.ts → platform/bridge-types.ts
- 更新 connection feature 和 platform facade 中的 import 路径
- shared/index.ts 移除相关导出

**实施时机**：后续集中清理。纯路径重构。

### H3: storage 的 channel/field.key 与 frame 标识的关系

**现状评估**：storage 是通用存储层，channel 和 field.key 是有意设计的通用抽象。

**不建议修改**。理由：
1. storage 的 channel 映射到 `receive.source.sourceId`（不是 frameId），语义不同
2. storage 的 field.key 映射到 `frame.fieldName`（不是 fieldId），因为 CSV 列名需要人类可读
3. receive-storage bridge 是合理的领域→存储层转换
4. 修改会让 storage 耦合 frame，违反"存储独立"的归口原则

**标记为不修复项**（见 §5）。

### M1: connection→receive 字段重命名

**统一方案**：目前不做修改，但记录为已知映射。

**理由**：
- `occurredAt→receivedAt`：connection 是通用事件时间戳，receive 是数据接收时间，语义确实不同
- `connectionId→source.sourceId`：receive 的 source 概念比 connection 更广（未来可能有非 connection source）
- 这些重命名反映了真实的领域差异

**标记为不修复项**（见 §5）。

### M2: receive→display 近 1:1 复制

**统一方案**：让 DisplayFieldMaterial 直接包含所需字段，但保持独立类型。

**不建议合并类型**。理由：
1. display 只需要 5/13 字段，合并会导致 display 依赖 receive 的完整类型
2. display 不应该知道 receive 的 rawHex/offset/length/expressionApplied 等实现细节
3. 这是合理的领域边界：receive 知道帧解析细节，display 只关心展示值

**可选优化**：如果未来有 3+ 消费方需要相同的字段子集，再提取到 shared。

**标记为不修复项**（见 §5）。

### M3: receive→storage 字段重命名

**统一方案**：不修改，同 H3 理由。storage 的通用 key-value 模型与 frame 的强类型模型是不同抽象层。

**标记为不修复项**（见 §5）。

### M4: ComparisonOperator 重复定义

**统一方案**：task 直接 import from `shared/condition-operators`。

**需要改的文件**：
- task/core/types.ts：删除 ComparisonOperator 定义，改为 import

**实施时机**：后续集中清理。低风险。

### M5: SchemaVersion 重复模式

**统一方案**：不提取。每个 feature 的 schema version 是独立版本号，提取为通用类型不提供实际价值——只是形式上的去重。

**标记为不修复项**（见 §5）。

### M6: command-ingress 直接注入 4 个 feature service

**统一方案**：改为 adapter 接口注入，与 send 和 task 已有的模式一致。

**需要改的文件**：
- command-ingress/core/handler.ts：定义 CommandContext 的 adapter 接口
- command-ingress/services/command-ingress-service.ts：通过 adapter 接口注入

**实施时机**：command-ingress 下一轮实现时一起做。当前 command-ingress 尚未验收，不影响已验收 feature。

### L1: targetId 是 connectionId 的派生

**统一方案**：不修改。targetId 提供了有意义的命名空间隔离（`transport:` 前缀），未来可能有非 transport 类型的 target。

### L2: display seriesKey 拼接

**统一方案**：不修改。拼接 key 是图表系统的通用模式，提取 frameId 和 fieldId 需要解析字符串，反而增加复杂度。

### L3: HealthLevel 近似重复

**统一方案**：如果 status 和 command-ingress 都需要健康检查，可以提取到 shared。但目前只有 2 个 feature 使用，值集不同（status 多了 'degraded'），不满足 "2+ feature 使用相同类型" 的提取条件。

**标记为不修复项**（见 §5）。

### L4: ChecksumMethod 差异

**统一方案**：不修改。frame 定义校验方法全集（包含 'custom'），send 使用具体实现集（包含 'none' 和具体 CRC 变体）。语义确实不同。

---

## §4 shared/ 提取建议

符合 CLAUDE.md shared/ 提取规则（2+ feature 使用 + 纯工具/类型）的明确提取项：

| 提取项 | 提取到 | 使用方数量 | 纯类型? |
|---|---|---|---|
| ValidationSeverity | shared/types/validation.ts | 6 | 是 |
| ValidationIssue | shared/types/validation.ts | 6 | 是 |
| ValidationResult | shared/types/validation.ts | 4+ | 是 |
| ComparisonOperator (去重 task) | 已在 shared/condition-operators | 2 (shared + task) | 是 |

**不提取的项目**：

| 项目 | 理由 |
|---|---|
| SchemaVersion 模式 | 各 feature 版本号独立，只是形式相似 |
| LifecycleStatus 各变体 | 值集完全不同，非同一概念 |
| Result/Outcome 类型 | 各 feature 错误类型不同，泛型化增加复杂度 |
| Entity 基类 | 形式去重无实际价值，TypeScript structural typing 已处理 |
| HealthLevel | 仅 2 feature，值集不同 |
| ChecksumMethod | frame 和 send 语义不同 |

---

## §5 不修复项

以下映射/重复经审查后认为现状合理：

1. **M1: connection→receive 字段重命名** — 反映真实领域差异（事件时间 vs 接收时间，connection vs source）
2. **M2: receive→display 近 1:1 复制** — 合理的领域边界隔离，display 不应依赖 receive 完整类型
3. **M3: receive→storage 字段重命名** — 不同抽象层的合理转换
4. **H3: storage 独立身份系统** — storage 是通用存储，不应耦合 frame
5. **M5: SchemaVersion 重复** — 独立版本号，形式去重无价值
6. **L1-L4: LOW 级问题** — 命名差异反映语义差异

---

## 附录：审计覆盖的文件清单

### Features (11)
- frame/, receive/, send/, storage-local-baseline/, display/, status/, task/, command-ingress/, connection/, settings/, result/

### Runtime
- runtime/bridges/ (6 bridge 文件)
- runtime/routing-tick.ts
- runtime/feature-wiring.ts

### Shared
- shared/types/readonly-deep.ts
- shared/expression/types.ts
- shared/condition-operators/types.ts
- shared/platform-bridge.ts

### 结论

**整体架构标识链非常干净。** frameId/fieldId 从 frame 到所有消费方都是直接 string 引用，无包装、无重命名、无中间类型。selector 层零跨 feature import 是架构亮点。

**真正需要修的只有 3 项**：H1（ValidationSeverity 去重）、H2（platform-bridge 移出 shared）、M4（ComparisonOperator 去重）。其余均为合理设计选择。
