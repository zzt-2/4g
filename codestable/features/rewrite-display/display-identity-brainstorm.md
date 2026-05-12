# 数据身份标识统一 Brainstorm

**日期**: 2026-05-11
**状态**: 结论锁定
**范围**: frame / receive / display / status / storage 五个 feature 的数据身份标识

---

## 1. 事实层：当前标识模型全景

### 1.1 各 Feature 标识字段

| Feature | 组标识 | 项标识 | 复合键格式 | 来源 |
|---------|--------|--------|-----------|------|
| **Frame** | `FrameAsset.id` (frameId) | `FrameFieldDefinition.id` (fieldId) | `frameId:fieldId` | 事实源头 |
| **Receive** | `frameId` | `fieldId` | `frameId:fieldId` (fieldKey 函数) | 直接透传 frame |
| **Display** | `groupId` | `dataItemId` | `groupId:dataItemId` | bridge 重命名 |
| **Status** | `groupId` | `dataItemId` | — | 同 display 模式，未接入 runtime |
| **Storage** | `channel` | `StorageRecordField.key` | — | 独立模型（按连接源分组） |

### 1.2 映射转换点

共 5 个实际映射点：

| # | 位置 | 输入→输出 | 复杂度 | 信息损失 | 语义理由 |
|---|------|----------|--------|---------|---------|
| 1 | `connection-to-receive.ts` | `connectionId → sourceId` | 1/5 | 无 | **有理由**：源抽象层，分离传输层与解析层 |
| 2 | `receive-display-bridge.ts:16` | `frameId → groupId` | 1/5 | 无 | **无理由**：纯重命名，无语义变化 |
| 3 | `receive-display-bridge.ts:17` | `fieldId → dataItemId` | 1/5 | 无 | **无理由**：纯重命名，无语义变化 |
| 4 | `receive-storage-bridge.ts:13` | `sourceId → channel` | 1/5 | 无 | **有理由**：按连接源分组，storage 语义 |
| 5 | `receive-storage-bridge.ts:15` | `fieldName → key` | 1/5 | 无 | **有理由**：key-value 存储语义，人可读 |

### 1.3 代码证据

**无理由的 display 重命名** (`receive-display-bridge.ts:15-22`):
```typescript
fields.push({
  groupId: f.frameId,        // frameId 原样赋值给 groupId
  dataItemId: f.fieldId,     // fieldId 原样赋值给 dataItemId
  fieldName: f.fieldName,
  value: f.value,
  displayValue: f.displayValue,
  updatedAt: outcome.processedAt,
});
```

**有理由的 storage 映射** (`receive-storage-bridge.ts:9-18`):
```typescript
return {
  // channel = 连接源标识，不是帧标识
  channel: outcome.input.source.sourceId,
  fields: outcome.fields.map((f) => ({
    key: f.fieldName,        // 用人可读名称做 key-value 存储
    value: f.value ?? null,
  })),
};
```

**Status 同样的重命名模式** (`status/core/types.ts:25-27`):
```typescript
export interface ReceiveFieldMaterial {
  readonly groupId: string;    // = frameId
  readonly dataItemId: string; // = fieldId
  readonly value: unknown;
  readonly receivedAt?: string;
}
```

**已有 fieldKey 工具** (`receive/state/receive-state.ts:120-122`):
```typescript
function fieldKey(field: Pick<ReceiveFieldValueSnapshot, 'frameId' | 'fieldId'>): string {
  return `${field.frameId}:${field.fieldId}`;
}
```

### 1.4 Storage 独立模型的合理性

Storage 的 `channel` 按连接源分组（不是按帧），`key` 用人可读名称（不是 fieldId）。
这是有意为之的设计选择：
- `channel` 回答"数据从哪个连接来"
- `key` 回答"这个字段的显示名是什么"
- Storage 不知道帧定义，不依赖 frame feature

这与 frame/receive/display 的标识模型是**正交**的——不同的抽象维度。

---

## 2. 决策层：推荐方案

### 2.1 结论

**保留两种标识模型，统一命名**：

1. **定义标识**：`frameId` + `fieldId`，frame/receive/display/status 统一使用
2. **存储标识**：`channel` + `key`，storage 独立使用，映射在 bridge 中显式完成

具体改动：
- Display: `groupId` → `frameId`，`dataItemId` → `fieldId`
- Status: `groupId` → `frameId`，`dataItemId` → `fieldId`
- Storage: **不动**
- Receive/Frame: **不动**

### 2.2 为什么不是全统一（方案 A）

方案 A 把 storage 的 `channel` 也改成 `frameId`，`key` 改成 `fieldId`。

代价：
- Storage 丢失"按连接源分组"能力（多连接收同一帧时无法区分来源）
- Storage field key 需要复合键（不同帧的 `fieldId` 可能相同）
- 破坏 storage 设计的核心抽象（storage 不依赖 frame）

判断：storage 的独立标识是有意的设计，不是设计债务。统一它的代价大于收益。

### 2.3 为什么不是双标识（方案 B）

方案 B 给 storage record 加 `frameId`/`fieldId` 作为可选引用。

代价：
- 引入"什么时候可选、什么时候必选"的复杂规则
- 对当前 MVP 来说是过早优化——目前没有 feature 需要从 storage record 反查帧定义
- Storage 设计文档明确说"storage 不定义帧语义"

判断：可以作为**未来扩展**（report/history feature 需要时再加），不是当前决策。

### 2.4 为什么包含 Status

Status 使用与 display 完全相同的 `groupId`/`dataItemId` 模式，语义相同（接收帧绑定）。
Status 还没有接入 runtime（无 bridge），改零成本。如果不改，会形成 display 用 `frameId`/`fieldId`、
status 用 `groupId`/`dataItemId` 的不一致，后续需要第二次改名。

---

## 3. 自检层

### 3.1 R1：假设验证

| 假设 | 验证方式 | 结论 |
|------|---------|------|
| Display 的 groupId 就是 frameId | 读 `receive-display-bridge.ts:16` | **确认**：`groupId: f.frameId`，1:1 赋值 |
| Display 的 dataItemId 就是 fieldId | 读 `receive-display-bridge.ts:17` | **确认**：`dataItemId: f.fieldId`，1:1 赋值 |
| Status 用相同模式 | 读 `status/core/types.ts:26-27` | **确认**：`ReceiveFieldMaterial { groupId, dataItemId }` |
| Storage channel 不是 frameId | 读 `receive-storage-bridge.ts:13` | **确认**：`channel: outcome.input.source.sourceId`（连接源，非帧） |
| 无持久化偏好数据 | 读 display 服务和 checklist | **确认**：settings 集成未实现，零用户数据 |
| Status 未接入 runtime | 搜索 runtime/ 目录 | **确认**：无 status 相关 bridge 或 wiring |

### 3.2 R2：覆盖度检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| frame → receive 标识透传 | ✅ 不变 | receive 已使用 frameId/fieldId |
| receive → display 映射 | ✅ 简化 | bridge 变为透明透传 |
| receive → storage 映射 | ✅ 不变 | 语义映射保持 |
| receive → task 映射 | ✅ 不变 | 直接透传 frameId/fieldId |
| receive → status 映射（未来） | ✅ 预对齐 | status 已用 frameId/fieldId 命名 |
| 同一参数跨表格/图表/存储关联 | ✅ 可行 | frameId:fieldId 复合键在 display 内一致 |
| 多连接场景 | ⚠️ 预存问题 | display buffer 覆写是既有问题，与改名无关 |
| 删帧后存储数据追溯 | ✅ 不变 | storage 独立于帧定义 |

### 3.3 R3：反向挑刺

| 挑刺场景 | 风险 | 缓解 |
|----------|------|------|
| 改名后 display 和 status 术语不一致 | 无风险 | **协调改名，两者同步** |
| 持久化偏好格式不兼容 | 无风险 | 零现有用户数据，schema 未冻结 |
| compound key 格式从 `g1:f1` 变成 `frameId:fieldId` | 低风险 | 仅影响 fixture 和测试数据 |
| display projection 的 `find()` 逻辑 | 无风险 | 字段名变、逻辑不变 |
| Status design doc 需要更新 | 低风险 | status design 尚未最终锁定 |

---

## 4. 实施时机与影响面

### 4.1 时机：现在

- Display：core 完成、UI 未开始、settings schema 未冻结
- Status：core types 完成、未接入 runtime
- 零用户数据、零持久化、零迁移成本

### 4.2 改动范围

**必须改（Display + Status 代码）— 15 个文件**：

Display (10):
1. `display/core/types.ts` (10 处)
2. `display/core/projection.ts` (13 处)
3. `display/core/normalize.ts` (8 处)
4. `display/core/defaults.ts` (4 处)
5. `display/core/clone.ts` (3 处)
6. `display/services/display-service.ts`
7. `display/selectors/display-selectors.ts`
8. `display/fixtures/display-fixtures.ts` (20+ 处)
9. `display/__tests__/display-core-service-state-selector.spec.ts` (19 处)
10. `runtime/__tests__/routing-tick.spec.ts` (2 处)

Status (5):
11. `status/core/types.ts` (6 处)
12. `status/core/indicator.ts` (5 处)
13. `status/core/normalize.ts` (5 处)
14. `status/fixtures/status-fixtures.ts`
15. `status/__tests__/status-core-service-state-selector.spec.ts`

**应更新（设计文档）— 3 个文件**：
1. `rewrite-display-checklist.yaml`
2. `rewrite-display-ui-design.md`
3. `rewrite-display-ui-brainstorm.md`

**不改**：
- Storage：保持 `channel` + `key` 不变
- Frame/Receive/Task/Send/CommandIngress：不涉及
- `receive-storage-bridge.ts`：语义映射保持

### 4.3 已锁定设计影响

| 文档 | 影响 | 处理 |
|------|------|------|
| display design | 类型定义中 groupId/dataItemId → frameId/fieldId | 勘误更新 |
| display checklist | 引用 groupId:dataItemId 处 | 勘误更新 |
| display brainstorm | 标记为"需新对话讨论"的身份问题 | 结案，结论写入本文档 |
| storage design | 无影响 | 不改 |
| status design | groupId/dataItemId 引用 | 同步更新 |

### 4.4 预计工作量

- 代码改动：2-3 小时（机械重命名 + 语义审查）
- 设计文档更新：30 分钟
- 验证：`pnpm -C rewrite test --run` + `pnpm -C rewrite build`

---

## 5. 回答四个核心问题

### Q1：当前有多少个映射转换点？

5 个，其中 2 个无语义理由（display 的纯重命名），3 个有语义理由（connection→receive 源抽象、receive→storage 按源分组和人可读键、receive→task 直接透传）。

### Q2：推荐统一还是维持现状？

**部分统一**：Display 和 Status 的 `groupId`/`dataItemId` 统一为 `frameId`/`fieldId`。
Storage 的 `channel`/`key` 保持不变（不同的抽象维度，有语义理由）。

### Q3：统一后用什么标识模型？

两种并存：
- **定义标识**（frame/receive/display/status）：`frameId` + `fieldId`
- **存储标识**（storage）：`channel` + `key`，在 bridge 中从定义标识显式映射

### Q4：实施时机？

**现在**。Display UI 未实现、Settings schema 未冻结、Status 未接入 runtime。零迁移成本。
