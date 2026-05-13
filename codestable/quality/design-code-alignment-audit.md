# 设计-代码对齐验证审计

**日期**: 2026-05-13
**范围**: B1（frame + connection）+ B2（send + task + command-ingress）设计文档 vs 当前代码
**基线**: `codestable/quality/code-simplification-audit.md` §6-7 执行记录 + `rewrite/src/features/` 当前代码
**方法**: 21 个子 agent 分 7 批验证，主对话仅汇总

---

## §1 B1 Feature 对齐结果

### 1.1 Frame — API 签名对齐（83 项验证）

| 状态 | 数量 |
|------|------|
| OK | 83 |
| SIGNATURE_CHANGED | 0 |
| MISSING | 0 |

**结论**: frame feature 全部 83 个引用项（覆盖 pages-frame-connection-design.md、frame-real-design.md、code-simplification-audit.md §6-7）与当前代码完全一致。简化审计 F-S1/F-S2/F-R1 已正确执行。

### 1.2 Frame — 前端规范合规（33 条规则）

| 状态 | 数量 |
|------|------|
| COMPLIANT | 26 |
| NOT_APPLICABLE | 6 |
| VIOLATION | 1 |

**唯一违规**: P5 setInterval — 连接页使用 `setInterval` 轮询。如间隔 >= 1s 则合规，否则应改用 rAF + 节流。设计文档未指定间隔。

### 1.3 Frame — 自检项（5 项）

| 检查项 | 状态 |
|--------|------|
| 跨 feature 标识对齐 | PASS |
| Service readiness | PASS |
| 代码精简 | NEEDS_REVIEW |
| Selector 不可变约束 | PASS |
| shared/ 提取规则 | PASS |

**NEEDS_REVIEW 项**:
- `frame-real-design.md` line 129、344 引用 `core/legacy.ts` 已不存在（已合并到 `legacy-normalizers.ts`），路径需更新
- `FRAME_INPUT_TYPES`/`FrameInputType` 确认零外部消费方，建议后续清理

### 1.4 Connection — API 签名对齐（30 项验证）

| 状态 | 数量 |
|------|------|
| OK | 28 |
| SIGNATURE_CHANGED | 2 |
| MISSING | 0 |

**SIGNATURE_CHANGED 项**:
1. `selectConnectionSummaries(snapshot)` → 已删除，改用 `service.listConnectionSummaries()`（C-S2 selectors 内联）
2. clone.ts 实现简化（JSON round-trip 替代 conditional spread），行为等价，签名不变

**NEEDS_UPDATE**: `pages-frame-connection-design.md` L303 需将 `selectConnectionSummaries(snapshot)` 更新为 `service.listConnectionSummaries()`

### 1.5 Connection — 前端规范合规（34 条规则）

| 状态 | 数量 |
|------|------|
| COMPLIANT | 22 |
| NOT_APPLICABLE | 11 |
| VIOLATION | 1 |

**唯一违规**: P5 setInterval — 与 frame 一致，连接页轮询机制需明确间隔

### 1.6 Connection — 自检项（5 项）

| 检查项 | 状态 |
|--------|------|
| 跨 feature 依赖 | PASS |
| Service readiness | PASS |
| 代码精简 | NEEDS_REVIEW |
| Selector 不可变约束 | PASS |
| Electron 边界 | PASS |

**NEEDS_REVIEW 项**: 审计 §3 死 surface 描述不准确（`createRealNetworkAdapter`/`getReconnectPolicy`/`nextReconnectDelay` 有 feature 内部测试消费，只是不在 public index.ts 导出）

---

## §2 B2 Feature 对齐结果

### 2.1 Send — API 签名对齐（34 项验证）

| 状态 | 数量 |
|------|------|
| OK | 25 |
| SIGNATURE_CHANGED | 5 |
| MISSING | 1 |
| NEEDS_UPDATE | 3 |

**关键发现**:

| # | 问题 | 状态 | 影响 |
|---|------|------|------|
| 1 | `evaluateFieldExpressions` 未 re-export，被 `evaluateFieldPreview` 替代 | SIGNATURE_CHANGED | UI 消费方需用 evaluateFieldPreview |
| 2 | `evaluateFieldPreview` 签名差异：设计写 `(frame, userFieldValues, fieldId)`，实际 `(field: SendFieldEncodingDef, ...)` | SIGNATURE_CHANGED | 需新增 UI 包装函数或 composable 层转换 |
| 3 | `SendRequest.variables` 字段未实现 | MISSING | variables 在 resolveFieldValues 参数级传递，功能等价 |
| 4 | expression API 名称：`compileGroup+evaluateGroup` vs `compileConditional+evaluateConditional` | SIGNATURE_CHANGED | 文档术语需更新 |
| 5 | `configurable` 可选(`boolean?`) vs 设计写必选(`boolean`) | SIGNATURE_CHANGED | 工作量小 |

### 2.2 Send — 前端规范合规（34 条规则）

| 状态 | 数量 |
|------|------|
| COMPLIANT | 31 |
| NOT_APPLICABLE | 3 |
| VIOLATION | 0 |

**结论**: 帧发送页设计完全合规，零违规

### 2.3 Send — 自检项（5 项）

| 检查项 | 状态 |
|--------|------|
| 跨 feature 依赖 | PASS |
| Service readiness | PASS |
| 代码精简 | NEEDS_REVIEW |
| Selector 不可变约束 | PASS |
| shared/ 提取规则 | PASS |

**NEEDS_REVIEW 项**: `core/clone.ts`、`core/validation.ts`、`selectors/` 三个文件审计声称已删除（S-S1/S-S2/S-S3）但实际仍存在于磁盘。send-service.ts 已内联 validation 和 structuredClone，旧文件是残留。

### 2.4 Task — API 签名对齐（重大发现）

**结论: task-real 核心类型体系重构尚未实施。readiness 补丁在旧类型体系上增量完成。**

**已实施（readiness T-R1~T-R5）**:
- `validateTaskDefinition` (55 行) ✓
- `createSendStep`/`createDelayStep`/`createWaitConditionStep`/builders (75 行) ✓
- `serializeTaskDefinition`/`deserializeTaskDefinition` (28 行) ✓
- `retryTask`/`stopAll` ✓（返回同步值，非 Promise）
- `selectActiveInstances` ✓

**未实施（task-real 核心）**:

| # | 项目 | 说明 |
|---|------|------|
| 1 | `ScheduleDriver` discriminated union | 替代 `TaskSchedulingMode`，未实现 |
| 2 | `FieldVariation` 类型 | 新增，未实现 |
| 3 | `StepRepeat` 类型 | 新增，未实现 |
| 4 | `TaskDefinition.schedule: ScheduleDriver` | 替代 `schedulingMode` + 平铺字段，未实现 |
| 5 | `TaskStepDefinition.config` 统一字段名 | 仍用 `sendConfig`/`waitConfig`/`delayConfig` |
| 6 | `SendStepConfig.userFieldValues` 替代 `fieldValues` | 仍用旧字段名 |
| 7 | `SendStepConfig.targetId` 必选 | 仍为可选 |
| 8 | `TaskStopCondition.exitCondition` | 新增，未实现 |
| 9 | `runTask` 统一循环 | 仍用 switch 分发到 runTimedLoop/runTriggerLoop/runSequenceLoop |
| 10 | `ScheduleDriverAdapter` + `createDriver` | 未实现 |
| 11 | `StopGuard` + `createStopGuard` | 未实现 |
| 12 | `executeRepeatableSend` | 未实现 |
| 13 | `evaluateCondition` 签名变更 | 仍用旧 `(WaitCondition, ConditionMatchInput)` |
| 14 | `ConditionRegistry` 移除 `register`/`unregister` | 仍保留旧单条件接口 |
| 15 | `CreateTaskServiceOptions.timerService` | 缺失 |
| 16 | `CreateTaskServiceOptions.fieldValueProvider` | 缺失 |

### 2.5 Task — 前端规范合规（34 条规则）

| 状态 | 数量 |
|------|------|
| COMPLIANT | 31 |
| NOT_APPLICABLE | 3 |
| VIOLATION | 0 |

**结论**: 任务管理页设计全面合规，零违规

### 2.6 Task — 自检项（5 项）

| 检查项 | 状态 |
|--------|------|
| 跨 feature 依赖 | NEEDS_REVIEW |
| Service readiness | PASS |
| 代码精简 | FAIL |
| Selector 不可变约束 | PASS（类型声明松散） |
| shared/ 提取规则 | PASS |

**FAIL 项**: `core/clone.ts` 审计标记为"已完成删除"但文件物理仍存在，已无消费方
**NEEDS_REVIEW 项**: send API 的 `SendRequest` 与 task 代码基本兼容，但 task-real 类型重组未实施

### 2.7 Command-Ingress — API 签名对齐（51 项验证）

| 状态 | 数量 |
|------|------|
| OK | 42 |
| SIGNATURE_CHANGED | 9 |
| MISSING | 0 |

**SIGNATURE_CHANGED 项（全部有意变更）**:
- 5 个 selector 删除 → service Reader 方法替代（CI-S1 + CI-R5）
- `ScoeProtocolAdapterOptions` 新增可选 `onCommand` 回调
- `ScoeCommandFunction` 用 const array 替代 enum
- task-builder 减少未使用参数
- service 接口比设计更丰富（正向扩展）

### 2.8 Command-Ingress — 前端规范合规（34 条规则）

| 状态 | 数量 |
|------|------|
| COMPLIANT | 26 |
| NOT_APPLICABLE | 2 |
| VIOLATION | 6 |

**必修违规**: Q5 删除二次确认缺失 — 卫星配置删除、高亮规则删除、历史记录删除均未标注 `$q.dialog()` 确认
**轻微违规** (5): T1 virtual-scroll 防御、T5 行选中机制、V3 空值约定、V4 长文本截断、P7 v-memo

### 2.9 Command-Ingress — 自检项（5 项）

| 检查项 | 状态 |
|--------|------|
| 跨 feature 依赖 | PASS |
| Service readiness | PASS |
| 代码精简 | PASS（审计删除项已物理删除） |
| Selector 不可变约束 | PASS |
| Electron 边界 | PASS |

---

## §3 已验收 Feature 回归结果

### 3.1 Receive — NOT_AFFECTED

上游变更（frame/connection/send 简化+补丁）未触及 receive 消费的任何 API 签名或导出表面。
- frame: F-S1/F-S2/F-R1 只涉及 frame 内部
- connection: C-S1/C-S2/C-R1~R4 不影响 receive 消费的类型导出
- 测试: 19 PASS, 4 FAIL（4 个预存 expression-integration 失败，非本次变更）

### 3.2 Storage — 跳过

`rewrite/src/features/storage/` 目录为空，无可回归验证内容。

### 3.3 Display — NOT_AFFECTED

display 对 frame/connection/send/receive 零 import 依赖。`groupId`/`dataItemId` 体系与 frame 的 `frameId`/`fieldId` 无关。

**预先存在问题（非本次变更引起）**: `rewrite/src/runtime/bridges/receive-display-bridge.ts` 存在 TypeScript 编译错误 — 使用 `frameId`/`fieldId` 构造 `DisplayFieldMaterial`，但该类型字段名是 `groupId`/`dataItemId`。此文件无消费方。

### 3.4 Status — NOT_AFFECTED

status feature 零跨 feature import。`ConnectionStatusMaterial`、`ReceiveFieldMaterial`、`ReceiveStatsMaterial` 全部由 status 自行定义，不依赖上游 feature 类型导出。

---

## §4 跨 Feature 一致性冲突

| # | 冲突 | 严重程度 | 处理方式 |
|---|------|---------|---------|
| C1 | `selectConnectionSummaries` 在 B1 设计中已过时，需改为 `service.listConnectionSummaries()` | HIGH | 设计文档修正 |
| C2 | `evaluateFieldPreview` 签名不一致（设计 UI 友好 vs 实际底层） | HIGH | 新增 UI 包装函数 |
| C3 | `scheduleKind` vs `schedulingMode`，枚举值 `immediate/timer/event` vs `timed/trigger/sequence` | HIGH | 设计文档修正 |
| C4 | `retryTask`/`stopAll` 签名 async vs sync | MEDIUM | 设计文档修正 |
| C5 | `selectTaskHistory` 未扩展（终止态实例不可见） | HIGH | selector 代码修改 |
| C6 | setInterval vs rAF 定时刷新机制不一致（B1 用 setInterval，B2 用 rAF） | LOW | 实施时统一 |
| C7 | StatusBadge 使用模式/映射表粒度不一致（B1 简略，B2 完整） | LOW | 实施时统一 |
| C8 | `definitionRef.schedule.kind` 路径不存在（应为 `schedulingMode`） | MEDIUM | 设计文档修正 |
| C9 | `SendRequest.variables` 不存在 | MEDIUM | composable 层解决 |
| C10 | task-real 未实施 vs 页面设计可独立实施 | HIGH | 设计文档术语修正，页面可基于现有代码实施 |

---

## §5 修复清单

### 按严重程度

#### BLOCKER（task-real 核心实施）

| # | 项目 | 涉及文件 | 工作量 | 阻断 UI |
|---|------|---------|--------|---------|
| B1 | ScheduleDriver + TaskDefinition 类型重组 | `task/core/types.ts` | 大 | 是 |
| B2 | 统一 runTask 引擎 + ScheduleDriverAdapter | `task/services/task-iteration-loops.ts` | 大 | 是 |
| B3 | evaluateCondition 签名变更 | `task/core/condition-matcher.ts` | 中 | 是 |
| B4 | ConditionRegistry 升级为条件组 | `task/services/condition-registry.ts` | 中 | 是 |
| B5 | CreateTaskServiceOptions 增加 timerService/fieldValueProvider | `task/services/task-service.ts`、`task/adapters/ports.ts` | 中 | 是 |

**注意**: B1-B5 是 task-real 的核心实施范围，需独立执行轮次。但跨 feature 一致性终检（§4 C10）确认：设计文档做术语修正后，task 页面可基于现有旧类型体系先行实施，task-real 重构可并行或后续进行。

#### HIGH（必须修复但不阻断实施开始）

| # | 项目 | 涉及文件 | 工作量 |
|---|------|---------|--------|
| H1 | clone.ts/validation.ts/selectors/ 残留文件清理（send + task） | `send/core/clone.ts`、`send/core/validation.ts`、`send/selectors/`、`task/core/clone.ts` | 小 |
| H2 | task selector 返回值强制 readonly | `task/selectors/task-selectors.ts` | 小 |
| H3 | command-ingress Q5 删除确认缺失（UI 实施时必修） | 页面组件（未实现） | 小 |

#### MEDIUM（设计文档与代码不完全一致，可实施但需记录）

| # | 项目 | 涉及文件 | 工作量 |
|---|------|---------|--------|
| M1 | B1 设计 `selectConnectionSummaries` → `service.listConnectionSummaries()` | pages-frame-connection-design.md | 小 |
| M2 | B2 设计 scheduleKind → schedulingMode 术语全量修正 | pages-task-send-command-design.md | 小 |
| M3 | evaluateFieldPreview UI 包装函数新增 | send/core/frame-resolver.ts 或新文件 | 小 |
| M4 | send-real-design `compileGroup+evaluateGroup` → `compileConditional+evaluateConditional` | send-real-design.md | 小 |
| M5 | `configurable` 标注为可选 | send-real-design.md | 小 |
| M6 | `frame-real-design.md` `core/legacy.ts` → `core/legacy-normalizers.ts` | frame-real-design.md | 小 |
| M7 | 审计 §3 死 surface 描述修正（connection + command-ingress） | code-simplification-audit.md | 小 |
| M8 | `FRAME_INPUT_TYPES`/`FrameInputType` 清理决策 | frame/index.ts | 小 |
| M9 | `selectTaskHistory` 扩展 | task/selectors/task-selectors.ts | 小 |
| M10 | command-ingress 消费方适配 selector → service Reader | 页面消费代码 | 中 |

#### LOW（建议性改进）

| # | 项目 | 工作量 |
|---|------|--------|
| L1 | B1 setInterval → rAF+节流统一 | 实施时处理 |
| L2 | StatusBadge 映射表统一 | 实施时处理 |
| L3 | command-ingress 5 处轻微规范项（virtual-scroll、行选中、空值、长文本、v-memo） | 实施时处理 |
| L4 | display 预先存在的 receive-display-bridge 类型不匹配 | 后续修复 |

### 按修复类型分组

#### A. 需要更新设计文档的（7 项，全部小工作量）

- M1: connection pages design — selector 引用更新
- M2: task pages design — scheduleKind/schedulingMode 术语修正
- M4: send-real-design — expression API 名称修正
- M5: send-real-design — configurable 可选标注
- M6: frame-real-design — legacy.ts 路径更新
- M7: code-simplification-audit — 死 surface 描述修正
- M8: frame index.ts — 死 surface 清理决策

#### B. 需要修改代码的（13 项）

- B1-B5: task-real 核心实施（大工作量，独立轮次）
- H1: 残留文件物理删除（send + task，小工作量）
- H2: task selector readonly 类型（小工作量）
- M3: evaluateFieldPreview UI 包装函数（小工作量）
- M9: selectTaskHistory 扩展（小工作量）
- M10: command-ingress 消费方适配（中工作量）

#### C. 需要补充测试的

- B1-B5 随附测试（含在大工作量内）
- H2 随附 readonly selector 测试

---

## 审计结论

1. **B1（frame + connection）对齐度高**: frame 83/83 一致，connection 仅 1 处设计文档需更新。前端规范仅 P5 轻微违规。可直接进入 UI 实施。

2. **B2 send 对齐度良好**: 5 处 SIGNATURE_CHANGED 均为有意变更，零阻断项。evaluateFieldPreview 需新增 UI 包装函数。可直接进入 UI 实施。

3. **B2 task 是唯一风险点**: task-real 核心类型体系重构全部未实施，但 readiness 补丁（validation/builders/serialization/retry/stopAll）已在旧类型体系上完成。**设计文档做术语修正后，页面可基于现有旧类型先行实施**，task-real 重构可独立排期。

4. **B2 command-ingress 干净**: selector → service Reader 迁移已完成，5 处轻微前端规范项属实施阶段。可直接进入 UI 实施。

5. **已验收 feature 不受影响**: receive/display/status 均 NOT_AFFECTED。

6. **审计执行记录与磁盘不一致**: send 和 task 的 clone.ts/validation.ts/selectors/ 审计声称已删除但实际未删，需确认意图并执行清理。
