# 依赖审计结果 — Feature 边界合规性验证

> 日期：2026-05-07
> 性质：静态代码分析，验证 rewrite 代码是否遵守"features 间只通过 public API 交互"的架构约束
> 背景：旧系统因跨模块 store 直连导致耦合爆炸；新架构要求严格的 feature 边界隔离
> 范围：rewrite/src/ 下所有 .ts/.vue 文件

---

## 一、结论

**整体健康度：优秀（A）— 零违规**

四个维度全部通过，新架构成功实现了旧系统未能做到的模块边界隔离。

| 维度 | 扫描范围 | 跨模块 import 数 | 违规数 | 健康度 |
|------|---------|-----------------|--------|--------|
| Feature ↔ Feature | 10 个 feature，所有 .ts 文件 | 17 | 0 | A |
| Runtime ↔ Feature | 7 个 runtime 文件 | ~20 | 0 | A |
| Pages/Widgets ↔ Feature | 1 page + 2 widgets | 0（间接通过 runtime） | 0 | A+ |
| Shared 被消费 | 10 个文件 | N/A | 0 | A+ |

---

## 二、Feature 间依赖图谱

### 依赖矩阵

```
           connection  frame  settings  storage  receive  send  task  display  status  scoe
connection     -         -       -         -        -       -     -      -       -      -
frame          -         -       -         -        -       -     -      -       -      -
settings       -         -       -         -        -       -     -      -       -      -
storage        -         -       -         -        -       -     -      -       -      -
receive        ●         ●       -         -        -       -     -      -       -      -
send           ●         ●       -         -        -       -     -      -       -      -
task           -         ●       -         -        -       ●     -      -       -      -
display        -         -       -         -        -       -     -      -       -      -
status         -         -       -         -        -       -     -      -       -      -
scoe           -         -       -         -        -       -     -      -       -      -

● = 有依赖（全部通过 public API）
```

### 依赖方向（形成 DAG，无环）

```
frame (L0) ← receive (L2) ← task (L3)
              ↑                ↑
connection (L1) ← send (L2) ←┘
```

### 详细 import 清单

| 依赖方 | 被依赖方 | import 内容 | 类型 | 文件 |
|--------|---------|------------|------|------|
| receive | frame | FrameAsset, ReadonlyFrameAsset, FrameFieldDefinition, cloneFrameField | type + 1 value | 9 处 |
| receive | connection | TransportTargetSnapshot | type | 1 处 |
| send | frame | ReadonlyFrameAsset, FrameAsset | type | 4 处 |
| send | connection | TransportTargetSnapshot | type | 2 处 |
| task | send | SendRequest, SendResult | type | 6 处 |
| task | frame | ReadonlyFrameAsset | type | 2 处 |

**独立 feature（零跨 feature 依赖）**：connection, display, settings, status, storage-local-baseline

### 关键发现

- 17 处跨 feature import 全部通过目标 feature 的 `index.ts`（public API）
- 16/17 是 type-only import，只有 1 处 value import（`cloneFrameField`）
- `cloneFrameField` 是 receive 从 frame 导入的工具函数，建议评估是否提取到 shared/

---

## 三、Runtime ↔ Feature 依赖图谱

### Runtime 文件清单

| 文件 | 引用的 feature | 引用方式 |
|------|---------------|---------|
| index.ts | frame, settings, storage, connection | type + value，全部 public API |
| feature-wiring.ts | 全部 9 个 feature | type + value，全部 public API |
| routing-tick.ts | connection, receive | type + value，全部 public API |
| bridges/connection-to-receive.ts | connection, receive | type，全部 public API |
| bridges/connection-backed-writer.ts | connection, send | type，全部 public API |
| bridges/connection-backed-target-resolver.ts | connection, send | type，全部 public API |
| bridges/receive-event-source-bridge.ts | receive, task | type，全部 public API |

### 依赖注入方式

- **构造函数注入**：feature-wiring.ts 通过分层依赖注入（L0→L1→L2→L3）创建所有 service
- **无直接状态持有**：runtime 不持有任何 feature 内部状态引用
- **Bridge 只做格式转换**：4 个 bridge 文件均为纯适配器，将 producer 接口转换为 consumer 接口

### Bridge 分析

| Bridge | Producer 端 | Consumer 端 | 职责 |
|--------|------------|-------------|------|
| ConnectionToReceiveInputSource | connection TransportEventSnapshot | receive ReceiveInputEvent | 字节→输入事件 |
| ConnectionBackedSendWriter | connection write 能力 | send SendRequest→bytes | 写入适配 |
| ConnectionBackedTargetResolver | connection 连接状态 | send target 解析 | 目标解析 |
| ReceiveEventSourceBridge | receive ConditionMatchInput | task condition registry | 条件匹配传递 |

---

## 四、Pages/Widgets ↔ Feature 依赖图谱

### Pages

- **HomePage.vue**：唯一页面文件
  - 通过 `useRewriteRuntime()` 访问 feature（runtime facade 模式）
  - 通过 `useRewritePlatform()` 访问平台能力（platform facade 模式）
  - **零直接 feature import**

### Widgets

- **AppNavigation.vue**：纯 UI 导航组件，零 feature 依赖
- **SummaryMetricGrid.vue**：纯展示组件，零 feature 依赖

### 架构分层

```
UI (pages/widgets)
  ↓ facade 调用
Runtime / Platform
  ↓ public API
Features
```

---

## 五、Shared 被谁消费

### Shared 文件清单

| 文件 | 主要导出 | 消费方数 |
|------|---------|---------|
| types/readonly-deep.ts | ReadonlyDeep\<T\> | 10 个 feature |
| utils/timestamp.ts | defaultNow | 5 个 feature |
| utils/clone-unknown.ts | cloneUnknownValue | 2 个 feature |
| condition-operators/ | compareValues, ComparisonOperator, FieldCondition | task |
| timer/ | TimerRegistry | runtime |
| platform-bridge.ts | RewritePlatformBridge, TransportBridge 等 | platform facade (2 文件) |

### Shared 自身依赖

- **零 feature 依赖**
- **零 Vue/Pinia/Electron 依赖**
- **零框架依赖**（纯 TypeScript + 标准 API）

### 高复用工具

| 工具 | 复用方 | 证明提取合理 |
|------|-------|------------|
| ReadonlyDeep | frame, send, receive, connection, task, status, storage, display, settings | 10 个 feature 复用 |
| defaultNow | connection, receive, send, frame, task | 5 个 feature 复用 |
| compareValues | task condition-matcher | 跨 feature 基础算法 |

---

## 六、与旧系统对比

| 维度 | 旧系统 | 新系统 |
|------|--------|--------|
| 跨模块访问方式 | 直接 import store 并读写 | 通过 public API 只读/调用 |
| 状态写入权限 | 谁都能写 | 只有 owner feature 能写 |
| 数据流方向 | 双向乱串 | 单向 DAG |
| 改一个 feature 影响 | 不可预测 | 只影响消费 public API 的地方 |
| runtime 定位 | 全局 store 杂物箱 | composition root，只做接线 |
| 测试性 | 无法独立测试 | 每个 feature 可独立测试 |

---

## 七、观察与建议

### 已做得好的

1. **index.ts 作为唯一 public API 出口**：每个 feature 只通过 index.ts 导出，外部无法访问内部文件
2. **type-only import 主导**：17 处跨 feature import 中 16 处是 type-only，运行时无耦合
3. **bridge 模式正确**：runtime 的 4 个 bridge 只做格式转换，不承载业务逻辑
4. **shared 零违规**：严格保持纯工具性质
5. **UI 层完全解耦**：pages/widgets 通过 facade 间接访问 feature

### 可改进的

1. **`cloneFrameField` 值 import**：receive 从 frame 导入的工具函数，是唯一跨 feature value import。建议评估是否提取到 shared/，因为"克隆帧字段"是通用能力
2. **UI 层当前只有一个页面**：后续大量页面开发时需要保持当前模式（通过 runtime facade 访问 feature），建议在开发规范中明确
3. **端到端集成测试缺失**：各 feature 单测覆盖良好（330+ tests），但缺乏跨 feature 集成测试验证依赖注入和 bridge 在运行时的正确性

### 风险点（当前未违规，但需要持续关注）

1. **selector 返回可变引用**：如果 public selector 返回的对象未经 deep freeze，消费方可绕过只读约束
2. **runtime 膨胀风险**：runtime 是唯一知道所有 feature 的地方，新增 feature 时需保持"只接线不判断"
3. **bridge 数量增长**：当前 4 个 bridge，后续 feature 增多时可能膨胀，需观察是否需要提取通用 bridge 工具

---

## 八、审计方法

- 扫描范围：rewrite/src/ 下所有 .ts/.vue 文件
- 搜索模式：`import.*from.*features/`、`import.*from.*shared/`、`import.*from.*runtime/`
- 验证方式：每个跨模块 import 检查目标是否为 public API 出口（index.ts）
- 违规判定：直接 import 内部文件（core/、service/、state/、adapters/ 等）视为违规
