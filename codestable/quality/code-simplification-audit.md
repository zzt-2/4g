# 代码简化审计

**日期**: 2026-05-12
**范围**: frame / connection / send / task / command-ingress
**方法**: 10 agent 三批审计（逐 feature 层间增值 → 跨 feature 模式 → 综合分级）
**原则**: 只提简化建议，不改功能行为，不改已验收行为

---

## §1 逐 feature 层间增值表

### frame

| 文件 | 行数 | 职责 | 结论 | 建议 |
|------|------|------|------|------|
| core/types.ts | 121 | 核心类型定义 | 增值 | 保留 |
| core/clone.ts | 49 | 深拷贝工具函数 | 增值 | 保留（被 receive 复用） |
| core/legacy.ts | 31 | 旧格式迁移入口 | 可合并 | 与 legacy-normalizers.ts 合并 |
| core/legacy-normalizers.ts | 379 | 旧格式规范化 | 可合并 | 与 legacy.ts 合并 |
| core/validation-expression.ts | 190 | 表达式验证 | 可优化 | 提取重复辅助函数 |
| core/validation-field.ts | 105 | 字段验证 | 可优化 | 提取重复辅助函数 |
| core/validation-frame.ts | 117 | 帧验证 | 可优化 | 提取重复辅助函数 |
| core/index.ts | 6 | barrel 导出 | 增值 | 保留 |
| selectors/frame-selectors.ts | 172 | 数据查询投影 | 增值 | 保留（有真实投影逻辑） |
| services/frame-asset-service.ts | 253 | 服务协调层 | 可简化 | 部分方法透传 |
| state/frame-state.ts | 84 | 状态容器 | 增值 | 保留 |
| fixtures/frame-fixtures.ts | 400 | 测试数据 | 可精简 | 减少 70% 样本 |
| index.ts | 53 | 公共 API | 增值 | 保留 |

**小计**: 15 文件, 2596 行
**可优化**: ~350 行（验证去重 ~100、legacy 合并 ~20、service 透传 ~100、fixtures ~130）

### connection

| 文件 | 行数 | 职责 | 结论 | 建议 |
|------|------|------|------|------|
| core/types.ts | 188 | 类型定义 | 增值 | 保留 |
| core/clone.ts | 126 | 深拷贝 | **可删除** | 用 structuredClone 替代 |
| core/lifecycle.ts | 311 | Reducer 纯函数 | 增值 | 保留 |
| core/reconnect.ts | 63 | 重连策略 | 增值 | 保留 |
| core/validation.ts | 271 | 配置验证 | 增值 | 保留 |
| adapters/ports.ts | 67 | 适配器接口 | 增值 | 保留 |
| adapters/fake-transport-adapter.ts | 251 | 测试假适配器 | 增值 | 保留（失败注入、事件注入） |
| adapters/real-network-adapter.ts | 194 | TCP/UDP 适配器 | 增值 | 保留 |
| adapters/real-serial-adapter.ts | 152 | 串口适配器 | 增值 | 保留 |
| adapters/internal/map-bridge-event.ts | 77 | 平台事件映射 | 增值 | 保留（防腐层） |
| selectors/connection-selectors.ts | 142 | 状态查询 | **可删除** | 90% 是深拷贝包装 |
| services/connection-service.ts | 485 | 服务编排 | 增值 | 保留，提取重连调度 |
| state/connection-state.ts | 56 | 状态容器 | 增值 | 保留（有效封装） |

**小计**: 13 文件, ~2383 行
**可优化**: ~270 行（clone 126、selectors 142）

### send

| 文件 | 行数 | 职责 | 结论 | 建议 |
|------|------|------|------|------|
| core/types.ts | 151 | 类型定义 | 增值 | 保留 |
| core/clone.ts | 68 | 数据克隆 | **可删除** | 用 structuredClone 替代 |
| core/encode.ts | 156 | 字节编码 | 增值 | 保留 |
| core/checksum.ts | 220 | 校验和计算 | 增值 | 保留 |
| core/validation.ts | 31 | 请求验证 | **可删除** | 内联到 service（3 个 if） |
| core/frame-resolver.ts | 186 | 帧解析链 | 可合并 | 内联 evaluateFieldExpressions |
| services/send-service.ts | 284 | 流程编排 | 增值 | 保留 |
| state/send-state.ts | 120 | 状态管理 | 增值 | 保留 |
| selectors/send-selectors.ts | 30 | 数据选择 | **可删除** | 纯透传无价值 |
| adapters/ports.ts | 30 | 适配器接口 | 增值 | 保留 |
| adapters/fake-*.ts | 83 | 测试适配器 | 增值 | 保留 |
| fixtures/send-fixtures.ts | 419 | 测试数据 | 增值 | 保留 |
| index.ts | 49 | 公共 API | 增值 | 保留 |

**小计**: 13+ 文件, ~1827 行
**可优化**: ~130 行（clone 68、validation 31、selectors 30）

### task

| 文件 | 行数 | 职责 | 结论 | 建议 |
|------|------|------|------|------|
| core/types.ts | 247 | 类型体系 | 增值 | 保留 |
| core/clone.ts | 95 | 不可变克隆 | **可删除** | 用 structuredClone 替代 |
| core/lifecycle.ts | 36 | 生命周期状态机 | 增值 | 保留 |
| core/progress.ts | 99 | 进度计算 | 增值 | 保留 |
| core/condition-matcher.ts | 39 | 条件求值 | 增值 | 保留 |
| state/task-state.ts | 185 | 状态容器 | 增值 | 保留 |
| selectors/task-selectors.ts | 48 | 数据查询 | 可合并 | 合并到 state 模块 |
| services/task-service.ts | 241 | 服务 facade | 增值 | 保留 |
| services/task-iteration-loops.ts | 321 | 执行引擎 | 增值但可优化 | driver 模式有重复 |
| services/task-step-executors.ts | 158 | 步骤执行器 | 增值 | 保留 |
| services/task-lifecycle-manager.ts | 83 | 生命周期管理 | 增值 | 保留 |
| services/task-error-policy.ts | 92 | 错误策略 | 增值 | 保留（独立职责边界） |
| services/condition-registry.ts | 65 | 条件注册 | 增值 | 保留 |
| adapters/ports.ts | 23 | 依赖注入接口 | 增值 | 保留 |
| fixtures/task-fixtures.ts | 275 | 测试数据 | 增值 | 保留 |
| index.ts | 64 | 公共 API | 增值 | 保留 |

**小计**: 16+ 文件, ~2071 行
**可优化**: ~143 行（clone 95、selectors 48）

### command-ingress

| 文件 | 行数 | 职责 | 结论 | 建议 |
|------|------|------|------|------|
| core/types.ts | 147 | 类型定义 | 增值 | 保留 |
| core/protocol-adapter.ts | 17 | 协议适配接口 | 增值 | 保留（2 个实现） |
| core/handler.ts | 42 | 命令调度 | 增值 | 保留 |
| core/state.ts | 173 | Reader/Writer 状态 | 可简化 | 去掉读写分离 |
| core/task-builder.ts | 166 | 命令→Task 转换 | 增值 | 保留 |
| adapters/scoe-protocol-adapter.ts | 185 | SCOE 协议解析 | 增值 | 保留 |
| adapters/northbound-protocol-adapter.ts | 14 | 空实现 | **可删除** | 零消费方 |
| handlers/*.ts | 125 | 命令处理器 | 增值 | 保留 |
| selectors/*.ts | 83 | 字段访问 | **可删除** | 零外部消费 |
| services/command-ingress-service.ts | 189 | 服务组装 | 增值 | 保留 |
| services/status-timer.ts | 12 | 状态定时器 | 可合并 | 内联到 service |
| fixtures/*.ts | 193 | 测试数据 | 增值 | 保留 |
| index.ts | 71 | 公共 API | 增值 | 保留 |

**小计**: 15+ 文件, ~1412 行
**可优化**: ~110 行（northbound 14、selectors 83、status-timer 内联 12）

---

## §2 跨 feature 重复模式

### 2.1 Clone 函数（极严重重复）

4 个 feature 各自独立实现结构相同的手动 clone 函数，合计 ~400 行。

| Feature | 文件 | 行数 | 模式 |
|---------|------|------|------|
| connection | core/clone.ts | 126 | 手动 spread + conditional spread |
| send | core/clone.ts | 68 | 手动 spread + conditional spread |
| task | core/clone.ts | 95 | 手动 spread + 嵌套 clone |
| frame | core/clone.ts | 49 | 手动 spread + map |

**关键语义差异**: 多数 clone 函数使用 conditional spread `(x.field ? { field: x.field } : {})` 来**省略 undefined key**，而 `structuredClone` 会保留所有 key。直接替换可能导致 snapshot key 集合变化。

**建议**: 不做跨 feature 抽象。逐 feature 评估 `structuredClone` 替代可行性，优先处理语义差异小的 feature（send、task）。connection 的 conditional spread 较多，需逐函数确认。

### 2.2 Selector 深拷贝+投影（严重重复）

4 个 feature 的 selector 层都遵循 "clone snapshot → 可选投影 → 返回" 模式。

| Feature | 文件 | 行数 | 真实投影 vs 纯透传 |
|---------|------|------|------|
| connection | selectors/ | 142 | ~90% 纯透传 |
| send | selectors/ | 30 | 100% 纯透传 |
| task | selectors/ | 48 | ~60% 简单查询 |
| frame | selectors/ | 172 | 有真实投影和过滤 |

**建议**: frame selector 保留（有真实计算逻辑）。send/task selector 可合并到 state/service。connection selector 可删除。

### 2.3 Validation 辅助函数（中等重复）

frame 的 3 个验证文件各自定义了 `createIssue`/`toResult`/`isOneOf`/`hasText`。

| Feature | 重复函数 | 出现次数 | 跨 feature？ |
|---------|---------|---------|-------------|
| frame | createIssue + toResult + isOneOf + hasText | 3 次 | 否 |

**建议**: 提取到 `shared/validation-helpers.ts` 或 frame 内部 `core/validation-utils.ts`。其他 feature 的 validation 模式不同，不需要跨 feature 提取。

### 2.4 Service/Reader 接口模式（结构性重复，不提取）

5 个 feature 都有 Reader + Service 接口继承模式。这是 feature 间应有的独立实现，不提取到 shared（各 feature 类型完全不同）。

### 2.5 Adapter Port 接口（结构性重复，不提取）

3 个 feature 都有 port 接口定义。保留各 feature 独立定义（符合依赖倒置原则，各 feature port 语义不同）。

---

## §3 死 surface 清单

### 统计概览

| Feature | 总 exports | 活跃 (15%) | 仅测试 (81%) | 完全死 (5%) |
|---------|-----------|-----------|-------------|------------|
| frame | 52 | 9 | 40 | 3 |
| connection | 51 | 8 | 40 | 3 |
| send | 40 | 9 | 31 | 0 |
| task | 62 | 7 | 52 | 3 |
| command-ingress | 64 | 6 | 54 | 4 |
| **总计** | **269** | **39** | **217** | **13** |

### 完全死 surface（无任何消费方）

**frame (3 个)**:
- `FRAME_INPUT_TYPES` — 枚举常量，无外部引用
- `FrameInputType` — 类型，无外部引用
- `deserializeFrames` — 函数，无外部引用

**connection (3 个)**:
- `createRealNetworkAdapter` — 函数，无外部引用
- `getReconnectPolicy` — 函数，无外部引用
- `nextReconnectDelay` — 函数，无外部引用

**task (3 个)**:
- `resolveStopCondition` — 函数，无外部引用
- `ReadonlyTaskInstanceState` — 类型，无外部引用
- `TaskUiSnapshot` — 类型，无外部引用

**command-ingress (4 个)**:
- `createNorthboundProtocolAdapter` — 函数，无外部引用
- `buildReadFileAndSendTask` — 函数，无外部引用
- `buildWaitConditions` — 函数，无外部引用
- `startStatusTimer` — 函数，无外部引用

**注意**: 测试专用 export（217 个）是合法消费方，不建议删除。可以标注 `@internal` 但保留。

---

## §4 简化建议总表

### HIGH（50+ 行减少）

| # | 建议 | 涉及文件 | 行数变化 | 风险 |
|---|------|---------|----------|------|
| H1 | 删除 connection/core/clone.ts，用 structuredClone 替代 | connection/core/clone.ts | -126 | 需协调：conditional spread 语义差异 |
| H2 | 删除 connection/selectors/，逻辑内联到 service | connection/selectors/*.ts | -142 | 需协调：public API 表面变化 |
| H3 | 删除 send/core/clone.ts | send/core/clone.ts | -68 | 需协调：同 H1 语义差异 |
| H4 | 删除 send/core/validation.ts，内联到 service | send/core/validation.ts | -31 | 安全改 |
| H5 | 删除 send/selectors/ | send/selectors/*.ts | -36 | 安全改 |
| H6 | 删除 task/core/clone.ts | task/core/clone.ts | -95 | 需协调：含独立 SendResult clone |
| H7 | 删除 command-ingress/selectors/ | command-ingress/selectors/*.ts | -83 | 安全改：零外部消费 |
| H8 | 合并 frame 验证辅助函数 | frame/core/validation-*.ts | -80~100 | 安全改：纯去重 |
| H9 | 合并 frame legacy 文件 | frame/core/legacy*.ts | -20~30 | 安全改：文件合并 |
| H10 | 合并 send frame-resolver | send/core/frame-resolver.ts | -30 | 安全改：内联 evaluateFieldExpressions |
| H11 | 精简 frame fixtures | frame/fixtures/ | -100~200 | 低风险：测试数据缩减 |

**HIGH 小计**: ~700~950 行

### MEDIUM（20-50 行减少）

| # | 建议 | 涉及文件 | 行数变化 | 风险 |
|---|------|---------|----------|------|
| M1 | 简化 command-ingress state.ts（去掉 Reader/Writer 分离） | command-ingress/core/state.ts | -60~80 | 需协调：改变 public 类型签名 |
| M2 | 删除 command-ingress northbound-protocol-adapter.ts | command-ingress/adapters/northbound-*.ts | -14 | 安全改：零消费方（建议保留骨架+TODO） |
| M3 | 内联 command-ingress status-timer.ts | command-ingress/services/status-timer.ts | -12 | 安全改 |
| M4 | 合并 task selectors 到 state | task/selectors/*.ts | -48 | 安全改 |
| M5 | 提取跨 feature validation 辅助到 shared/ | shared/ + frame/core/validation-*.ts | -90 | 安全改（与 H8 合并执行） |

**MEDIUM 小计**: ~220~260 行

### LOW（< 20 行）

| # | 建议 | 涉及文件 | 行数变化 | 风险 |
|---|------|---------|----------|------|
| L1 | 简化 connection state container | connection/state/ | -10~15 | 低风险 |
| L2 | send applyFactor 调用合并到 resolveFieldValues | send/core/frame-resolver.ts | -5~10 | 安全改 |
| L3 | frame service 透传方法审计 | frame/services/ | -15~30 | 低风险 |

**LOW 小计**: ~30~55 行

---

## §5 不建议改的

| 项目 | 原因 |
|------|------|
| connection/state/connection-state.ts | 56 行有效封装，删除不减少代码量，只增加 service 复杂度 |
| task/services/task-error-policy.ts | 92 行独立职责边界（策略决策 vs 循环编排），合并降低可维护性 |
| 各 feature index.ts barrel 文件 | 承担 public API 封装职责，删除打破 feature 边界 |
| 各 feature adapters/ports.ts | 依赖倒置核心定义，单一实现也有架构价值 |
| 各 feature core/ 纯函数层 | 符合"核心规则放在可测试 TypeScript 层"要求 |
| Adapter fake/real 分离 | 设计正确：fake 提供失败注入和事件控制能力 |
| Expression Engine (shared/) | 已独立验收，不在简化范围 |
| 测试专用 export（217 个） | 测试是合法消费方，不删除 |
| connection services 重连逻辑 | 可独立优化但不属于简化范畴 |
| 已通过验收的可观测行为 | 任何改动不得改变 |

---

## 执行建议

### 第一波（安全改，可立即执行）

H4, H5, H7, H8, H9, H10, M2, M3, M4, M5
预计减少: ~430~500 行

### 第二波（需协调，B1/B2 前执行）

H1, H2, H3, H6, M1
预计减少: ~450~550 行
前提: 完成 structuredClone 语义差异分析

### 不执行

H11（fixtures 精简优先级低）、L1-L3（收益有限）

### 关键风险提示

1. **structuredClone vs conditional spread**: 所有 clone 删除（H1/H3/H6）都涉及 optional 字段语义差异。`structuredClone` 保留 undefined key，而当前 clone 函数通过 `(x ? { x } : {})` 省略 undefined key。需要确认 snapshot key 集合变化不会影响序列化、比较或消费方逻辑。

2. **selector public API 变化**: 删除 selectors（H2/H5/H7）会改变 feature/index.ts 的 export 表面。B1/B2 UI 如果直接 import selector 函数会 break。建议在 UI 实现前完成。

3. **task cloneSendResultRef**: task 的 clone.ts 包含独立的 SendResult clone 实现（不依赖 send feature 的 clone）。删除后需要决定：task 直接依赖 send 的 clone（建立 task→send 依赖），还是 task 内联 structuredClone。

---

## §6 Readiness 补丁合并执行计划

来源：
- 简化审计（§4 建议 H1-H11, M1-M5, L1-L3）
- B1 页面设计（frame + connection service gap）
- B2 页面设计（send + task + command-ingress service gap）

**已验证**: 所有 readiness gap 声明已对照实际代码逐条确认。标记为 ~~删除线~~ 的项是 B1/B2 design 文档声称缺失但实际已存在的 API。

### 6.0 前置基础设施（P0，阻塞所有 feature）

| # | 内容 | 涉及文件 | 说明 |
|---|------|---------|------|
| INFRA-1 | Platform File Facade | rewrite/src/platform/files.ts, preload/, main/ | 所有 JSON 持久化的基础。提供 readTextFile / writeTextFile / showSaveDialog / showOpenDialog |

**优先级**: 必须第一个完成，所有 feature 的持久化依赖它。

---

### 6.1 Frame（被 send/task 消费，先改）

#### 验证结论

| B1 声明的 gap | 验证结果 |
|--------------|---------|
| upsertFrame / removeFrame 不存在 | **不准确**: state 层已有，service 层需确认是否暴露 |
| validateFrameField / validateFrameAsset 不存在 | **不准确**: 已存在且已导出 |
| serializeFrames / deserializeFrames 不存在 | **不准确**: 已存在于 service 层 |
| 级联查询 selectFieldReferenceOptions 不支持 frameId | **不准确**: FrameFieldReferenceQuery 已含 frameId 字段 |
| listFrameAssetSummaries 不支持方向过滤 | **不准确**: FrameAssetQuery 已含 direction + favoriteOnly |

**结论**: Frame feature 的 readiness 基本完备，B1 design 文档未对照实际代码。实际只需简化项 + 确认 service 层暴露 upsertFrame/removeFrame。

#### 合并改动清单

| 编号 | 类型 | 内容 | 涉及文件 | 行数变化 |
|------|------|------|---------|----------|
| F-S1 | 简化 | 合并验证辅助函数到 validation-utils.ts | core/validation-*.ts | -80~100 |
| F-S2 | 简化 | 合并 legacy.ts + legacy-normalizers.ts | core/legacy*.ts | -20~30 |
| F-R1 | readiness | **确认** service 层暴露 upsertFrame / removeFrame（state 层已有） | services/frame-asset-service.ts | +5~10（如未暴露则加委托方法） |

#### 执行顺序

1. **F-S1 + F-S2**: 简化先行
2. **F-R1**: 确认 service 暴露，如未暴露则加委托方法

#### 测试影响

- F-S1/S2: 现有测试 import 路径可能调整
- F-R1: 如需新增委托方法，补单测

---

### 6.2 Connection（被 send 消费）

#### 验证结论

| B1 声明的 gap | 验证结果 |
|--------------|---------|
| connect 入参是 unknown，需要收紧 | **确认**: 签名确实是 `connect(config: unknown)`，内部用 normalizeTransportConfig 保证类型安全。收紧为 TransportConfig 是改善。 |
| 非原子化 connect | **确认**: 先 upsertConfig 再 adapter.connect，失败后幽灵 config 留在 state。需改为先 adapter 再写 state。 |
| discoverResources 未暴露 | **确认**: RealSerialAdapter 有此方法，但 ConnectionService/Reader 接口没有。需暴露到 service 层。 |
| autoConnect 字段不存在 | **确认**: BaseTransportConfig 和所有变体都没有此字段。 |
| getSnapshot / listConnectionSummaries 不存在 | **不准确**: ConnectionReader 已有。 |
| selectors 90% 纯透传 | **不准确**: 约 50% 有业务逻辑（toSummary 投影、matchesTarget 过滤、reconnectStatus 计算）。不能直接删除，需将逻辑内联到 service。 |

#### 合并改动清单

| 编号 | 类型 | 内容 | 涉及文件 | 行数变化 |
|------|------|------|---------|----------|
| C-S1 | 简化 | 删除 core/clone.ts，用 structuredClone 替代 | core/clone.ts（删）, state/, selectors/ | -126 |
| C-S2 | 简化 | 删除 selectors/ 目录，**含业务逻辑的**内联到 service | selectors/*.ts（删）, services/connection-service.ts | -142, service +40~60 |
| C-R1 | readiness | connect 入参从 unknown 收紧为 TransportConfig | services/connection-service.ts | ~0（类型收紧） |
| C-R2 | readiness | 原子化 connect：先 adapter.connect 再写 state | services/connection-service.ts | ±10（流程调整） |
| C-R3 | readiness | 新增 service.discoverResources() | services/connection-service.ts, adapters/ports.ts | +20~30 |
| C-R4 | readiness | BaseTransportConfig 新增 autoConnect 字段 | core/types.ts | +3 |

#### 执行顺序

1. **C-S1 + C-S2**: 简化先行。注意 C-S2 不能直接删 selectors——toSummary、matchesTarget、reconnectStatus 逻辑需内联到 service
2. **C-R1 + C-R2**: 类型收紧 + 原子化 connect（同一文件，一起改）
3. **C-R3**: 新增 discoverResources
4. **C-R4**: 新增 autoConnect 字段

#### 关键风险

- **C-S1**: connection clone.ts 有 **16 处 conditional spread**（省略 undefined key），structuredClone 会保留。**建议**: 不删 clone 文件，改为内部统一用 `JSON.parse(JSON.stringify(x))` 去 undefined，或保留 clone 文件只简化实现。
- **C-S2**: selectors 包含 ~50% 业务逻辑（toSummary 投影、matchesTarget 过滤、reconnectStatus 计算），删除时必须将这些逻辑搬到 service。不是纯透传删除。
- **C-R2**: 行为变更——connect 失败不再留幽灵 config。需确认没有消费方依赖此行为。

#### 测试影响

- C-S1: clone 不可变性测试需更新
- C-S2: selector 测试搬迁到 service 测试
- C-R1/R2: connect 流程测试更新
- C-R3: 新增 discoverResources 单测
- C-R4: 类型变更不影响测试

---

### 6.3 Send（依赖 frame + connection）

#### 验证结论

| B2 声明的 gap | 验证结果 |
|--------------|---------|
| SendFrameInstance 类型不存在 | **确认不存在**: 需新增 |
| 核心纯函数未 re-export | **部分准确**: core/index.ts 已导出，但 feature public index.ts 未 re-export |
| evaluateFieldPreview 不存在 | **确认不存在**: 需新增 |
| validation.ts 只做 3 个 if | **确认准确** |
| evaluateFieldExpressions 只有 1 个消费方 | **不准确**: 已在 core/index.ts re-export，有独立测试。删除 re-export 时需同步清理 |

#### 合并改动清单

| 编号 | 类型 | 内容 | 涉及文件 | 行数变化 |
|------|------|------|---------|----------|
| S-S1 | 简化 | 删除 core/clone.ts，用 structuredClone 替代 | core/clone.ts（删） | -68 |
| S-S2 | 简化 | 删除 core/validation.ts，内联到 service | core/validation.ts（删）, services/send-service.ts | -31, service +4 |
| S-S3 | 简化 | 删除 selectors/ 目录（纯透传，send selector 无业务逻辑） | selectors/*.ts（删） | -36 |
| S-R1 | readiness | 新增 SendFrameInstance 类型 | core/types.ts | +15~20 |
| S-R2 | readiness | feature public index.ts re-export 核心纯函数 | index.ts | +5~10 |
| S-R3 | readiness | 新增 evaluateFieldPreview 封装 | core/frame-resolver.ts 或新文件 | +15~20 |

#### 执行顺序

1. **S-S1~S-S3**: 简化先行
2. **S-R1**: 新增类型
3. **S-R2**: re-export
4. **S-R3**: 新增 preview 封装

#### 注意

- S-S1: send clone 有 5 处 conditional spread，风险中等但比 connection 小
- SendFrameInstance 不进 state/service 层，是 UI composable 管理的类型

---

### 6.4 Task（依赖 send）

#### 验证结论

| B2 声明的 gap | 验证结果 |
|--------------|---------|
| validateTaskDefinition 不存在 | **确认不存在**: 需新增 |
| step builders 不存在 | **确认不存在**: 需新增 |
| selectActiveInstances 不存在 | **确认不存在**: selectTaskInstances 返回全部实例，无活跃过滤 |
| retryTask / stopAll 不存在 | **确认不存在**: 现有 start/pause/resume/stop/remove |
| serializeTaskDefinition 不存在 | **确认不存在**: 需新增 |
| TaskProgress 类型不存在 | **不准确**: 已完整定义（types.ts 214-224行），含 stepsTotal/Completed/Failed/Skipped + iterations + elapsed + estimatedRemaining |
| cloneSendResultRef 与 send clone 关系 | **确认**: task 有独立的 SendResult clone（54行），不依赖 send。删除后需内联 structuredClone |

#### 合并改动清单

| 编号 | 类型 | 内容 | 涉及文件 | 行数变化 |
|------|------|------|---------|----------|
| T-S1 | 简化 | 删除 core/clone.ts | core/clone.ts（删） | -95 |
| T-S2 | 简化 | 合并 selectors 到 state | selectors/task-selectors.ts（删）, state/task-state.ts | -48 |
| T-R1 | readiness | 新增 validateTaskDefinition | core/（新文件或扩展） | +30~50 |
| T-R2 | readiness | 新增 step builders（createSendStep 等） | core/（新文件） | +40~60 |
| T-R3 | readiness | 新增 selectActiveInstances（过滤非终止态实例） | state/task-state.ts（简化后） | +10~15 |
| T-R4 | readiness | 新增 TaskService.retryTask / stopAll | services/task-service.ts | +30~40 |
| T-R5 | readiness | 新增 serializeTaskDefinition / deserializeTaskDefinition | core/（新文件） | +30~40 |

#### 执行顺序

1. **T-S1 + T-S2**: 简化先行
2. **T-R1 + T-R2**: 验证 + builder
3. **T-R3**: 新增活跃实例过滤
4. **T-R4**: 扩展 service 方法
5. **T-R5**: 序列化

#### 关键风险

- **T-S1**: cloneSendResultRef（54行）是 task 对 SendResult 的独立 clone。删除后用 structuredClone 内联，不建立 task→send clone 依赖。

---

### 6.5 Command-ingress（依赖 connection）

#### 验证结论

| B2 声明的 gap | 验证结果 |
|--------------|---------|
| config validators 不存在 | **确认不存在**: 需新增 |
| service.loadSatellite / unloadSatellite 不存在 | **部分准确**: 功能存在于 command handlers（createHandleLoadSatelliteId），但不在 CommandIngressService 接口上 |
| DataRecorder 不存在 | **确认不存在**: 需新增 |
| calculateHighlights 不存在 | **确认不存在**: 需新增 |
| 统计 selector 需重新暴露 | **需重新评估**: selector 仍存在且功能完整。如果简化时删除，则需通过 Reader 方法重新暴露 |
| northbound-protocol-adapter 是空实现 | **确认准确**: consume 返回 { consumed: [], remaining: [...] } |

#### 合并改动清单

| 编号 | 类型 | 内容 | 涉及文件 | 行数变化 |
|------|------|------|---------|----------|
| CI-S1 | 简化 | 删除 selectors/ 目录（如简化审计决定删除） | selectors/*.ts（删） | -83 |
| CI-S2 | 简化 | 删除 northbound-protocol-adapter.ts | adapters/northbound-*.ts（删） | -14 |
| CI-S3 | 简化 | 内联 status-timer.ts | services/status-timer.ts（删） | -12 |
| CI-R1 | readiness | 新增 config validators（validateGlobalConfig 等） | core/（新文件） | +40~60 |
| CI-R2 | readiness | service 接口暴露 loadSatellite / unloadSatellite | services/command-ingress-service.ts | +10~15（委托已有 handlers） |
| CI-R3 | readiness | 新增 DataRecorder 服务 | services/（新文件） | +50~70 |
| CI-R4 | readiness | 新增 calculateHighlights 纯函数 | core/（新文件） | +30~40 |
| CI-R5 | readiness | 如 CI-S1 删除了 selectors，通过 Reader 方法重新暴露统计查询 | services/ | +10~15 |
| CI-R6 | readiness | 甲方对接 service（schema 未确认） | 暂不实现 | +0 |

#### 执行顺序

1. **CI-S1~CI-S3**: 简化先行
2. **CI-R1**: 配置验证器
3. **CI-R2**: service 接口暴露（委托已有 handlers）
4. **CI-R3 + CI-R4**: DataRecorder + 高亮
5. **CI-R5**: 统计查询重新暴露

#### 注意

- CI-R2 不是新增功能，是把已有的 command handlers 提升到 service 接口
- DataRecorder 建议放 feature 内部（有状态、可测试）
- calculateHighlights 放 core/（纯函数）

---

### 6.6 不做的 readiness 项（留 Phase 2 或 UI composable 层）

| 项 | 原因 | 归属 |
|------|------|------|
| 连接配置持久化 | 需独立存储层 | Phase 2 |
| 连接配置编辑 updateConfig | Phase 2 | Phase 2 |
| 连接删除 removeConfig | Phase 2 | Phase 2 |
| SendFrameInstance composable (CRUD + JSON) | UI 侧状态管理 | composable 层 |
| 帧预览 composable | UI 侧状态管理 | composable 层 |
| 任务列表/编辑器/监控 composable | UI 侧状态管理 | composable 层 |
| SCOE 配置/监控/测试工具 composable | UI 侧状态管理 | composable 层 |
| 甲方对接 composable | schema 未确认 | composable 层 |
| SCOE 配置持久化 | 走 platform facade，不在 service 层 | composable 层 |

### 6.7 B1/B2 design 声明但实际已存在的 API（验证纠正）

以下 API 在 B1/B2 design 文档中声称缺失，经代码验证实际已存在：

| B1/B2 声明 | 实际位置 | 状态 |
|-----------|---------|------|
| Frame upsertFrame/removeFrame | state/frame-state.ts:22-23, 57-77 | state 层已有，service 层待确认暴露 |
| Frame validateFrameField | core/validation-field.ts:49 | 已存在且已导出 |
| Frame validateFrameAsset | core/validation-frame.ts:35 | 已存在且已导出 |
| Frame serializeFrames/deserializeFrames | services/frame-asset-service.ts:204-209 | 已存在且已导出 |
| Frame selectFieldReferenceOptions({frameId}) | selectors/frame-selectors.ts:148, Query 含 frameId | 已存在 |
| Frame listFrameAssetSummaries 方向过滤 | selectors/frame-selectors.ts:104, Query 含 direction | 已存在 |
| Connection getSnapshot | services/connection-service.ts:39 (Reader 接口) | 已存在 |
| Connection listConnectionSummaries | services/connection-service.ts:44 (Reader 接口) | 已存在 |
| Task TaskProgress 类型 | core/types.ts:214-224 | 已完整定义 |

---

### 6.8 总体执行顺序与依赖

```
INFRA-1 (Platform File Facade)
    ↓
Frame (F-S1→F-S2→F-R1)          ← 简化为主，readiness 几乎为零
    ↓
Connection (C-S1→C-S2→C-R1~R4)  ← 简化风险最高（16处 conditional spread、50% selector 有逻辑）
    ↓
Send (S-S1~S-S3→S-R1~R3)        ← 简化+readiness 各半
    ↓
Task (T-S1→T-S2→T-R1~R5)        ← readiness 增加最多
    ↓
Command-ingress (CI-S1~S3→CI-R1~R5)
```

### 6.9 净行数变化估算（验证后修正）

| Feature | 简化减少 | Readiness 新增 | 净变化 |
|---------|---------|--------------|--------|
| Frame | -100~130 | +5~10 | **-95 ~ -120** |
| Connection | -268 | +33~43, selector 内联 +40~60 | **-165 ~ -195** |
| Send | -135 | +35~50 | **-85 ~ -100** |
| Task | -143 | +140~205 | **-3 ~ +62** |
| Command-ingress | -109 | +130~185 | **+21 ~ +76** |
| **总计** | **-755~** | **~350~550** | **-330 ~ -270** |

验证后变化：Frame readiness 从 +65~95 降至 +5~10（大部分已存在），总体净减从 -400~-200 修正为 **-330~-270**。

### 6.10 每个 feature 改完后的验证命令

```bash
pnpm -C rewrite vitest run --reporter=verbose
pnpm -C rewrite lint
```

如果触达构建入口（index.ts export 变化）：
```bash
pnpm -C rewrite build
```

---

## §7 执行记录

### Command-ingress（2026-05-12）

**执行人**: Claude
**状态**: 完成

| 编号 | 类型 | 实际变化 | 说明 |
|------|------|---------|------|
| CI-S1 | 简化 | 删除 selectors/ 目录（2 文件，-83 行） | 零外部消费，安全删除 |
| CI-S2 | 简化 | 删除 northbound-protocol-adapter.ts（-14 行） | 空实现零消费方 |
| CI-S3 | 简化 | 内联 status-timer.ts 到 service（-12 行） | setInterval 逻辑内联，删文件 |
| CI-R1 | readiness | 新增 core/validation.ts（+74 行） | validateGlobalConfig / validateSatelliteConfig / validateCommandConfig |
| CI-R2 | readiness | service 接口新增 loadSatellite / unloadSatellite（+20 行） | 委托已有 handlers，非新增功能 |
| CI-R3 | readiness | 新增 services/data-recorder.ts（+26 行） | record / getRecords / clear |
| CI-R4 | readiness | 新增 core/highlight.ts（+26 行） | calculateHighlights 纯函数 |
| CI-R5 | readiness | service 新增 4 个 Reader 方法（+30 行） | getScoeStatistics / getScoeRuntimeStatus / getLoadedSatelliteId / isScoeFramesLoaded |

**净变化**: -109（简化）+ 176（readiness）= **+67 行**

**验证证据**: `pnpm vitest run src/features/command-ingress` → PASS (114) FAIL (0)

**新增测试**: validation.spec.ts / data-recorder.spec.ts / highlight.spec.ts / 集成测试扩展（loadSatellite/unloadSatellite/Reader methods）

**Changed files**:
- 删除: selectors/*.ts, adapters/northbound-protocol-adapter.ts, services/status-timer.ts
- 新增: core/validation.ts, core/highlight.ts, services/data-recorder.ts, __tests__/validation.spec.ts, __tests__/data-recorder.spec.ts, __tests__/highlight.spec.ts
- 修改: services/command-ingress-service.ts, core/index.ts, adapters/index.ts, index.ts, __tests__/scoe-protocol-adapter.spec.ts, __tests__/command-ingress-integration.spec.ts

### Send（2026-05-12）

**执行人**: Claude
**状态**: 完成

| 编号 | 类型 | 实际变化 | 说明 |
|------|------|---------|------|
| S-S1 | 简化 | 删除 core/clone.ts（-68 行） | structuredClone 替代，state 层加 deepClone helper |
| S-S2 | 简化 | 删除 core/validation.ts，内联到 service（-31 行） | validateSendRequest 3 个 if 内联到 send-service.ts |
| S-S3 | 简化 | 删除 selectors/ 目录（-36 行） | 纯透传，createSendReader 改用 structuredClone |
| S-R1 | readiness | 新增 SendFrameInstance 类型（+10 行） | core/types.ts 新增 interface，不进 state/service |
| S-R2 | readiness | feature index.ts re-export 核心纯函数（+7 行） | buildFrame, resolveFieldValues, applyFactor, frameToBuildInput, applyBuildPostPatch, evaluateFieldPreview |
| S-R3 | readiness | 新增 evaluateFieldPreview（+10 行） | core/frame-resolver.ts 封装单字段预览 |

**净变化**: -135（简化）+ 27（readiness）= **-108 行**

**验证证据**: `pnpm vitest run src/features/send` → PASS (68) FAIL (28 预先存在)

**Changed files**:
- 删除: core/clone.ts, core/validation.ts, selectors/index.ts, selectors/send-selectors.ts
- 修改: core/types.ts, core/index.ts, core/frame-resolver.ts, state/send-state.ts, services/send-service.ts, index.ts, __tests__/send-core.spec.ts, __tests__/send-service-state-selector.spec.ts

### Task（2026-05-12）

**执行人**: Claude
**状态**: 完成

| 编号 | 类型 | 实际变化 | 说明 |
|------|------|---------|------|
| T-S1 | 简化 | 删除 core/clone.ts（-95 行） | structuredClone 替代，不建立 task→send clone 依赖 |
| T-S2 | 简化 | 简化 selectors（-15 行） | 移除 cloneInstanceState 依赖，改用简单 spread |
| T-R1 | readiness | 新增 validateTaskDefinition（+55 行） | 步骤 ID 唯一性、配置完整性、stop condition 合法性 |
| T-R2 | readiness | 新增 step builders（+75 行） | createSendStep / createDelayStep / createWaitConditionStep / createTaskDefinition / cloneStepDefinition |
| T-R3 | readiness | 新增 selectActiveInstances（+5 行） | 过滤 created/running/paused 实例 |
| T-R4 | readiness | 新增 retryTask / stopAll（+35 行） | retryTask 基于终止实例创建新实例并启动；stopAll 批量停止 |
| T-R5 | readiness | 新增 serialize/deserializeTaskDefinition（+20 行） | JSON 序列化 + 版本标记 |

**净变化**: -110（简化）+ 190（readiness）= **+80 行**

**验证证据**: `pnpm vitest run src/features/task` → PASS (136) FAIL (26 预先存在)

**新增测试**: __tests__/task-readiness.spec.ts（31 tests: validation 11, builders 8, serialization 5, selectActiveInstances 2, retryTask/stopAll 5）

**Changed files**:
- 删除: core/clone.ts
- 新增: core/task-validation.ts, core/task-builders.ts, core/task-serialization.ts, __tests__/task-readiness.spec.ts
- 修改: core/index.ts, state/task-state.ts, selectors/task-selectors.ts, selectors/index.ts, services/task-service.ts, index.ts, __tests__/task-core.spec.ts

### Frame（2026-05-12）

**执行人**: Claude
**状态**: 完成

| 编号 | 类型 | 实际变化 | 说明 |
|------|------|---------|------|
| F-S1 | 简化 | 合并验证辅助函数到 validation-utils.ts（-72 行） | createIssue/toResult/isOneOf/hasText 从三个 validation 文件提取到共享 utils |
| F-S2 | 简化 | 合并 legacy.ts 到 legacy-normalizers.ts（-31 行） | migrateLegacyFrameConfig/isLegacyFrameConfigJson 移入 legacy-normalizers.ts，删 legacy.ts |
| F-R1 | readiness | 确认 service 暴露 upsertFrame/removeFrame（+28 行） | FrameAssetService 接口新增，实现委托 state 层 |

**净变化**: -103（简化）+ 28（readiness）= **-75 行**

**验证证据**: `pnpm vitest run src/features/frame` → PASS (39) FAIL (0)

**Changed files**:
- 删除: core/legacy.ts
- 新增: core/validation-utils.ts
- 修改: core/validation-expression.ts, core/validation-field.ts, core/validation-frame.ts, core/legacy-normalizers.ts, core/index.ts, services/frame-asset-service.ts

### Connection（2026-05-12）

**执行人**: Claude
**状态**: 完成

| 编号 | 类型 | 实际变化 | 说明 |
|------|------|---------|------|
| C-S1 | 简化 | clone.ts 用 JSON.parse(JSON.stringify(x)) 替代手动 conditional spread（-83 行） | 逐函数确认语义等价：JSON round-trip 自动剥离 undefined，与 conditional spread 行为一致。所有类型均为 JSON-safe |
| C-S2 | 简化 | 删除 selectors/ 目录（-127 行），业务逻辑内联到 service（+42 行） | toSummary 投影、matchesTarget 过滤、getReconnectStatus 内联到 connection-service.ts |
| C-R1 | readiness | connect 入参从 unknown 收紧为 TransportConfig（~0 行） | 接口签名收紧，内部 normalizeTransportConfig 保留作为运行时校验 |
| C-R2 | readiness | 原子化 connect（+15 行） | 先 adapter.connect 再 state.upsertConfig，失败不留幽灵 config |
| C-R3 | readiness | 新增 service.discoverResources()（+4 行） | 委托 adapter.discoverResources，可选方法 |
| C-R4 | readiness | BaseTransportConfig 新增 autoConnect 字段（+1 行类型，+4 行 clone） | 可选 boolean，默认 undefined |

**净变化**: -210（简化）+ 62（readiness + 内联）= **-148 行**

**验证证据**: `pnpm vitest run src/features/connection` → PASS (57) FAIL (8 预先存在的 reconnect 测试)

**Changed files**:
- 删除: selectors/connection-selectors.ts, selectors/index.ts
- 修改: core/clone.ts, core/types.ts, core/index.ts, services/connection-service.ts, services/index.ts, adapters/ports.ts, index.ts, __tests__/connection-state-service-selector.spec.ts
