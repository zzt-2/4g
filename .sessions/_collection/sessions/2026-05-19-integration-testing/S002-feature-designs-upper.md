# [S002] Feature 设计文档提取（上）

> 2026-05-19 | 调研 | 完成
> 9 个子 agent，3 批 × 3，覆盖 9 个 feature 的设计文档

## 目标

从 codestable/features/ 下 9 个核心 feature 的 design.md + checklist.yaml 提取验收标准、跨 feature 交互契约和测试期望，作为集成测试范围判定的输入。

## 记录

### 1. Frame Feature

#### 验收标准

**rewrite-frame-checklist.yaml（12 项，1 completed + 11 pending）：**
- FR-TEST-BASELINE-001（completed）：Vitest 测试基线建立
- FR-IMPL-001~011（pending）：core 纯 TS 规则、service 用例层、state 边界、只读 selector、expression 定义边界、import/export adapter、legacy fixtures、页面迁移、runtime 装配、自动测试
- FR-DEFER-001：阻塞和延期项（新 schema、旧 JSON 兼容、expression 安全模型、platform API 等）

**frame-real-checklist.yaml（6 项，全部 done）：**
- FR-REAL-001：Noun layer 修正（identifierRules 类型化、factor 字段、checksum 枚举、selector 深拷贝）
- FR-REAL-002：ExpressionDefinition 与 shared/expression 对齐 + 编译级语法检查
- FR-REAL-003：Legacy migration 完善（所有特征字段处理、4+ 迁移 fixture、round-trip 验证）
- FR-REAL-004：JSON schema + 序列化（FrameAssetFile 格式、round-trip 深度相等）
- FR-REAL-005：FrameReader 生产路径验证（深拷贝、ReadonlyDeep、L2 消费者测试通过）
- FR-REAL-006：集成验证（build/lint/vitest 全绿、无跨 feature 内部 import）

#### 跨 Feature 消费关系

| 消费方 | 消费方式 | 消费内容 |
|--------|---------|---------|
| receive | 构造函数注入 FrameAssetReader | identifierRules、fields 解析定义、direction 过滤 |
| send | 构造函数注入 FrameAssetReader | fields 编码定义、options（autoChecksum 等）、direction 过滤 |
| task | 构造函数注入 FrameAssetReader | listFrameReferences、listFieldReferences |
| command-ingress | 构造函数注入 FrameAssetReader | getFrame(id) 映射外部帧标识 |
| SCOE | 只读 frame asset snapshot | 通用帧定义读取 |
| report（未来） | 只读 selector/service | frame metadata |
| frame 页面 | service + selector | 完整 CRUD |

#### 帧定义全局唯一约束

- 架构声明 + 类型系统 + 实现验证三重保障
- 反向 grep 确认：17 处外部引用全部通过 index.ts public API
- 验收报告拔除推演：删除 frame 目录后其他 feature import 断裂但无残留逻辑
- 集成测试可验证：类型层面、访问路径、行为层面（selector 深拷贝不可变）

#### Public API Surface

- 常量 7 个：CHECKSUM_METHODS、DATA_PARTICIPATION_TYPES 等
- 类型 27 个：FrameAsset、ReadonlyFrameAsset、FrameAssetReader 等
- 函数：clone 系列 5 个、selector 6 个、service 4 个

---

### 2. Connection Feature

#### 验收标准

**rewrite-connection-design.md（§4.12 Validation plan）：**
- Static scan：renderer 无 Node/Electron/raw IPC import
- Vitest unit：core lifecycle reducer、config validation、target availability、error/event normalization、selector projection
- Fixture test：serial/TCP/TCP server/UDP config 样本、duplicate connect/disconnect/stale event
- Fake adapter test：fake serial/TCP/TCP server/UDP 完整生命周期
- Manual checklist：页面入口、配置 CRUD、connect/disconnect 按钮
- Runtime validation：startup/shutdown wiring、高频 byte batches、throttled UI
- Hardware validation：real serial/TCP/TCP server/UDP 完整硬件链路
- Package validation：native module loading、asarUnpack

**rewrite-connection-bridge-implementation-design.md 增量标准：**
- Port compatibility：real adapter 遵守 ConnectionTransportAdapter port
- Event ordering：同 connectionId 保序、connected before data、no data after disconnected
- Queue/backpressure：bounded batch buffer、time-window flush、bounded event queue、overflow 可观察
- Error boundary：transport error 只作为 connection fact
- Forbidden surfaces：main/preload/platform/adapter/service 各层禁止项

#### 跨 Feature 交互契约

| Consumer | May consume | Must not do |
|----------|------------|-------------|
| receive | incoming byte batches、source snapshot、lifecycle/error material | import connection internal state、parse in connection |
| send | target availability、transport write capability、write failure material | own connection lifecycle、hardcode targets |
| task | target availability snapshot、transport failure material | query raw transport internals |
| SCOE | declared fixed source/target、write capability | make connection own SCOE command semantics |
| pages | config snapshot、lifecycle commands、status/error summary | access platform primitive directly |

#### TCP/UDP Lifecycle 需要集成测试的状态转换

- duplicate connect
- disconnect already closed
- stale platform events
- app shutdown cleanup
- close/reopen
- disconnect during high-frequency data
- disconnect during write
- TCP server client accept/disconnect
- UDP remote route

#### 设计文档更新状态

- composite adapter 已实现，设计文档**不需要更新**（未改变 feature 间交互方向和 owner/not owner 边界）

#### Public API Surface

- 类型 23 个（TransportConfig 族、Connection 运行时类型）
- 服务工厂 2 个（createConnectionReader、createConnectionService）
- Adapter 工厂 3 个（createRealSerialAdapter、createRealNetworkAdapter、createCompositeAdapter）
- 测试工具 1 个（createFakeConnectionTransportAdapter）

---

### 3. Receive Feature

#### 验收标准

**rewrite-receive-checklist.yaml（16 项，全部 pending）：**

- RECV-IMPL-001~010：owner/not owner、core 纯 TS、frame reference 消费边界、service 用例层、state/read model、public boundary、runtime 装配、高频数据原则、消费者边界、页面 UI 边界
- RECV-TEST-001~002：fixtures/oracle + fake input/fake frame/fake event sink 测试边界
- RECV-RUNTIME-001：runtime validation 计划
- RECV-HW-001：真实 serial/TCP/TCP server/UDP 硬件验证
- RECV-PACKAGE-001：package validation guard
- RECV-CUSTOMER-001：report/northbound/customer 边界
- RECV-DEFER-001：阻塞和延期项

#### 跨 Feature 交互

| Consumer | 提供内容 | 验收条件 |
|----------|---------|---------|
| task | trigger candidate / receive result material | task owns trigger strategy，receive 不直接写 task state |
| status | receive health/material | status owns health summary |
| result | source facts | result owns result truth and attribution |
| storage | local material | storage owns persistence |
| SCOE | explicit SCOE candidate input（如 SCOE design 接受） | SCOE owns command semantics |
| pages | UI-safe snapshots、stats、projections | pages 只读不写 |

#### Receive Pipeline 完整处理链

1. 输入层（ReceiveInputBatch）→ 2. 字节规范化 → 3. 帧匹配（matchReceiveFrame）→ 4. 字段解析（parseReceiveFrameFields）→ 5. 表达式计算（evaluateFrameExpressions，条件执行）→ 6. 产出构建（ReceiveBatchOutcome，6 种 kind）

#### globalParams 收集推迟

- expression 中的 global_stat 变量来源暂时传空 Map
- 影响：依赖全局统计的表达式字段无法解析
- status/global stats owner split 推迟到后续设计
- 待确认：globalStats 的 owner 是 status 还是 receive

#### Public API Surface

- 类型 27 个（Outcome、Snapshot、Input、Lifecycle、Stats、Identifier 等）
- 服务工厂 2 个（createReceiveReader、createReceiveService）
- Selector 7 个（counters、events、fieldValues、frameStats、recentInputs、snapshot、sourceStats）

---

### 4. Send Feature

#### 验收标准

**rewrite-send-design.md（§4.12 Validation plan）：**
- Static scan：core 无 Vue/Pinia/Electron 依赖
- Vitest unit：构帧 core 各 data type、checksum、service、selector/state
- Fixture test：最小合法构帧正例、多字段混合、checksum 覆盖
- Runtime validation：send service 装配、SendResult event 路由、快速连发 write queue

**send-real-design.md（17 条场景验收 SC1-SC17）：**
- SC1：基本构帧发送
- SC2~4：表达式字段求值（正常/条件分支/失败）
- SC5~6：Factor 逆换算（非1/等于1）
- SC7~8：defaultValue fallback / zero fill warning
- SC9~10：Auto checksum / auto length
- SC11：Direction 过滤（receive 方向帧 → build-error）
- SC12~13：Target 不可用 / transport 写入失败
- SC14：Configurable 优先级
- SC15~17：CRC32 checksum / checksum 溢出 / length field 缺失

**9 步 Pipeline：**
validate → resolve frame → resolve field values → apply factor → build byte buffer → post-build patch（checksum+length 回填）→ resolve target → transport write → emit result + update stats

#### 跨 Feature 交互

| 交互 | Adapter Port | 调用点 |
|------|-------------|--------|
| send → connection | SendTargetResolver + SendTransportWriter | Pipeline 步骤 7（resolve target）、步骤 8（transport write） |
| send → frame | SendFrameReader | Pipeline 步骤 2（resolve frame） |
| task → send | SendService.execute() | task send-step |

#### Checksum/patch 边界情况

- 4 种算法：sum8、xor8、crc16-modbus、crc32
- Checksum 溢出 → build-error 不截断
- Length field 缺失 → 跳过回填 + warning，发送正常执行
- 需要**集成测试级别**验证：real checksum 计算 + buffer 回填正确性

#### Public API Surface

- 常量 3 个、类型 29 个、纯函数 11 个、服务工厂 2 个、Adapter Port 类型 5 个

---

### 5. Expression Engine

#### 验收标准

**expression-engine-design.md（29 条）：**
- 编译（C1-C15）：正常路径 C1-C9、条件表达式 C10-C12、错误路径 C13-C15
- 求值（E1-E13）：正常路径 E1-E5、条件表达式 E6-E8、批量 E9-E10、错误路径 E11-E13
- 类型语义（T1-T5）：严格语义、字符串比较、函数/变量消歧
- 集成场景（I1-I3）：receive 替代 applyFactor、task 条件匹配、send 批量表达式
- 性能（P1-P2）：单表达式 < 1μs ✅ 已验证、50 表达式批量 < 20μs ✅ 已验证

#### 测试覆盖（8 个 spec 文件，~1149 行）

| 文件 | 覆盖 |
|------|------|
| tokenizer.spec.ts | 词法分析：数字、标识符（含中文）、运算符、位置 |
| parser.spec.ts | 语法分析：AST、优先级、错误恢复 |
| compile.spec.ts | 编译：单表达式、条件、批量、错误 |
| evaluate.spec.ts | 求值：四则运算、比较、逻辑、函数、错误 |
| conditional.spec.ts | 条件表达式：多分支、fallback、matchedIndex |
| group.spec.ts | 批量求值：Kahn 拓扑排序、循环检测、部分失败 |
| integration.spec.ts | 18 个真实配置文件表达式样本端到端验证 |
| performance.spec.ts | P1/P2 性能指标验证 |

#### 集成契约

| 消费方 | 集成点 | 契约 |
|--------|-------|------|
| receive | field-parser applyFactor 替代 | 编译一次 + 每帧 evaluate，3-5 行代码 |
| task | condition-matcher WaitCondition 替代 | compileConditional + evaluateConditional |
| send | buildFrame 前批量解析 | compileGroup + evaluateGroup |

**关键规则：** 编译与求值严格分离；变量收集归调用方；纯函数约束；编译结果由调用方缓存。

#### Public API Surface

- 类型 14 个（VariableMap、CompileResult、CompiledExpr 等）
- 函数 7 个（compileExpression、compileConditional、compileGroup、evaluate、evaluateConditional、evaluateGroup）
- 常量 1 个（defaultMathFunctions）

---

### 6. Runtime Wiring

#### 验收标准

**runtime-wiring-design.md（5 条核心标准）：**
1. createRewriteRuntime() 返回包含所有 feature service 引用的 runtime
2. routingTick() 能将 connection data 事件经 receive 解析后触发 task 条件匹配
3. task 的 send-step 能通过 send service + connection 写出
4. 现有 overview snapshot 和 resetSettings 向后兼容
5. build + lint 通过

**routingTick 验收条件（S2-S3）：**
- S2：connection data → receive 解析 → bridge emit，错误路径返回 error
- S3：receive matched outcome → ConditionMatchInput → bridge 通知 handler

#### 装配契约（wireFeatures 分层创建）

| 层级 | Feature | 依赖 |
|------|---------|------|
| L0 | frameService、settingsService、storageService | 无互依赖 |
| L1 | connectionService | adapter |
| L2 | receiveService、displayService、sendService | L0+L1 |
| L3 | receiveEventSourceBridge、taskService | L2 |
| L4 | commandIngressService | L3+config |

**桥接模式：**
- ConnectionBackedTargetResolver：send → connection target 解析
- ConnectionBackedSendWriter：send → connection 字节写入
- ReceiveEventSourceBridge：receive → task 事件源桥接

#### routingTick 预算截断

- **未发现 maxEventsPerTick 预算截断机制**。当前实现处理所有可用事件
- RoutingTickResult：{ ok, error?, eventsRouted, matchesEmitted }
- 默认间隔 100ms（ROUTING_TICK_DEFAULT_INTERVAL_MS）

#### 5 条缺失数据通路

- design.md 中**未明确提到"5 条缺失数据通路"**的具体描述
- 设计主要关注 connection→receive→task→send 完整链路
- 待确认：可能需要从其他架构文档或历史 session note 中追溯

#### Public API Surface

- 类型 3 个（RoutingTickResult、RewriteWiredFeatures、FeaturePersistence）
- 接口 5 个（RewriteRuntimeOverviewSnapshot、RewriteRuntimeCommandResult 等）
- 工厂函数 1 个（createRewriteRuntime）
- 常量 1 个（ROUTING_TICK_DEFAULT_INTERVAL_MS = 100）

---

### 7. Settings Feature

#### 验收标准

**rewrite-settings-design.md（§3 三组配置）：**
- Recording 配置：5 个场景（默认值、旧 key 兼容、非法值降级、隔离性、局部 reset）
- Storage 配置：10 个场景（默认值、normalize 系列、validate 系列、selector 隔离、service 操作）
- General 配置：7 个场景（默认值、normalize、validate 系列、service 操作）
- Public API 清洁性：2 个场景（StateContainer 不泄露、Consumer 只能通过 selector 读取）

**测试覆盖：** 20 个测试用例（core 5 + state 2 + service 5 + selector 2 + 边缘 6）

#### 下游 Feature 契约

| 下游 Feature | 消费方式 | 消费内容 |
|-------------|---------|---------|
| connection | 只读 defaults snapshot | 低频默认参数 |
| receive | 显式输入传入 | 低频显示/解析配置 |
| send | 只读 snapshot | 默认发送偏好 |
| storage | selector 投影 | CSV 路径、保存间隔、自动记录、历史时长 |
| status | 只读 snapshot | indicator config |
| display/chart | selector 投影 | chart/display 偏好 |

**关键原则：** settings 不知道消费 feature 存在；consumer 只读不写；selector 返回克隆副本。

#### 持久化状态

- 已实现：core/service/state/selector/normalize/validation
- 未实现：adapter/platform/file system/Electron IPC/导入导出
- 待定：持久化文件格式和 key 命名未冻结

#### Public API Surface

- 类型 14 个（SettingsSnapshot 族、SettingsPatch、SettingsResetScope、ValidationIssue/Result）
- Selector 8 个
- Service 工厂 2 个
- 工具函数 1 个（isAutoSaveEnabled）

---

### 8. Storage-Local-Baseline Feature

#### 验收标准

**rewrite-storage-local-baseline-design.md（Boundary Guards）：**
- 只覆盖本地持久化、legacy JSON migration material、history/local records、CSV/local export
- 不设计高速存储最终模型、report delivery、northbound file delivery
- 不直接访问 Node/Electron/fs/path

**Owner/Not Owner：**
- Owner：本地持久化策略、本地记录写入事实、history 文件生命周期、CSV/local export 语义
- Not Owner：其他所有 feature 的领域模型和运行 truth

#### Adapter Port 模式

```typescript
interface LocalMaterialAdapter {
  readMaterial(bucket, id): Promise<ReadResult>;
  writeMaterial(bucket, id, value): Promise<WriteResult>;
  deleteMaterial(bucket, id): Promise<DeleteResult>;
  listMaterials(bucket): Promise<ListResult>;
}
```

- 6 种错误类型：cancelled、permission-denied、unavailable、corrupted、write-failed、missing
- 所有操作返回 { ok: true } 或 { ok: false, error }

#### RealLocalMaterialAdapter 验证状态

- 已实现：基础 CRUD、FileFacade 集成、错误分类、路径安全、软删除（.deleted 文件）
- **全部验证状态 pending**：fixture、vitest、fake adapter、manual、runtime、package validation

#### 与 Platform File Facade 集成

- 通过 FileFacade 接口（readTextFile、writeTextFile、getUserDataPath）
- 构造函数注入，不直接 import platform

#### 6 个外部依赖 Gap

1. 打包态 data path（runtime blocker）
2. 高速存储最终模型（deferred）
3. 最终 file/path/dialog platform API schema（未定义）
4. report object 或 TestReport schema（not touched）
5. northbound HTTP/FTP delivery（not touched）
6. 其他 feature 内部语义（不在范围内）

#### Public API Surface

- 常量 2 个 + 纯函数 5 个
- 类型 21 个（Storage 族、Record 族、Validation 族）
- Adapter 3 个（LocalMaterialAdapter 类型 + createRealLocalMaterialAdapter 工厂）
- Service 2 个（createStorageLocalReader、createStorageLocalService）

---

### 9. Display + Status Features

#### Display Design 验收标准

**三种 Projection 验收：**
- Table projection：基于 receive/storage/status/connection public material 生成表格行
- Chart projection：chart series projection，支持 selected items、chart config、performance config
- Scatter (Constellation) projection：scatter source projection，支持 I/Q 数据源、位宽、点数

**Display-UI Design 增量标准：**
- 页面布局：面板间距用 var(--rw-space-panel-gap)，内容区高度 calc
- ChartWidget：纯展示、animation: false、固定 6 色
- ScatterWidget：环形缓冲 maxPoints=4096
- HistoryPage：不做星座图、不做实时刷新

**高频刷新策略：** batch/throttle/coalescing/overflow/defer 策略列为 deferred，需要 runtime validation

#### Status Design 验收标准

- STAT-IMPL-001~006：core 纯 TS、service/state/selector、settings→status 边界、connection→status 输入、其他 feature 输入、runtime 装配
- STAT-TEST-001：fixtures 覆盖 connection lifecycle/error/counter、receive field value/range/unmatched/error
- STAT-UI-001：HeaderBar 或等价 status widget 状态指示可见

#### 身份标识统一实施状态

**决策：** frameId + fieldId 统一用于 frame/receive/display/status；channel + key 用于 storage，映射在 bridge 中显式完成

**实施状态：待确认未完成。** 需改动 15 个文件（display 10 + status 5）+ 3 个设计文档更新。当前为零用户数据、零持久化、零迁移成本的最佳时机。

#### Display 与 Receive 扇出 Bridge

```
receive → routingTick → fanOutToDisplay → display.ingestSourceMaterial()
  ├→ sourceFields[]
  ├→ chartHistory (累积)
  └→ scatterPoints (累积)
↓
useDisplayRefresh (rAF + cadenceMs)
  ├→ shallowRef<TableRowProjection[]>     → DataTable
  ├→ shallowRef<ChartSeriesProjection[]>  → ChartWidget
  └→ shallowRef<ScatterProjection>        → ScatterWidget
```

#### Display Public API Surface

- 类型 23 个（Preference 族、Projection 族、Material 族、Validation 族、Snapshot 族）
- Selector 7 个
- Service 工厂 2 个

#### Status Public API Surface

- 类型 19 个（Config 族、Projection 族、Summary 族、Material 族、Snapshot 族）
- Selector 6 个
- Service 工厂 2 个

---

### 跨 Feature 交互矩阵汇总

| 源 → 目标 | 交互方式 | 已有单测覆盖 | 集成测试需求 |
|-----------|---------|-------------|-------------|
| frame → receive | FrameAssetReader 注入 | ✅ L2 消费者测试（9 pass） | selector 不可变 + direction 过滤 |
| frame → send | FrameAssetReader 注入 | ✅ L2 消费者测试 | selector 不可变 + direction 过滤 |
| frame → task | FrameAssetReader 注入 | ✅ listFrameReferences | reference projection 正确性 |
| connection → receive | byte batches + lifecycle events | ❌ fake adapter only | 真 TCP 数据通路 |
| connection → send | targetResolver + transportWriter | ❌ fake adapter only | 真 TCP 写入通路 |
| receive → task | trigger candidate / event bridge | ❌ 无 | routingTick 端到端 |
| receive → display | fanOutToDisplay bridge | ❌ 无 | routingTick 端到端 |
| receive → storage | fanOutToStorage bridge | ❌ 无 | routingTick 端到端 |
| receive → status | material consumption | ❌ 无 | 状态聚合正确性 |
| send → connection | writeBytes via bridge | ❌ fake only | 真实 transport 写入 |
| task → send | sendService.execute() | ❌ 无 | send-step 完整链路 |
| command-ingress → task | taskService | ❌ 无 | SCOE 命令翻译 → task 执行 |
| settings → 各 feature | selector 投影 | ✅ 20 tests | settings 变更后各 feature 刷新 |
| storage → display | StorageConvertContext | ❌ 无 | 身份标识映射正确性 |

### 关键发现总结

1. **54 个 spec 文件全部是单元级 + fake adapter 测试，feature 间接缝零覆盖**（topic-index 已确认）
2. **expression engine 是最完整的 feature**：29 条验收标准全部有测试、P1/P2 性能已验证
3. **frame-real 是已完成度最高的 feature**：6/6 checklist done
4. **storage-local-baseline 验证最薄弱**：全部验证状态 pending
5. **routingTick 是核心集成接缝**：connection→receive→task→send 链路的唯一编排点
6. **globalParams 推迟影响**：expression 的 global_stat 变量、task trigger 的全局统计依赖
7. **身份标识统一未完成**：display/status 仍在用 groupId/dataItemId，需改为 frameId/fieldId
8. **5 条缺失数据通路来源不明**：design.md 未提及，需从其他文档追溯

## 后续

- 本产出将作为对话 6（综合排除）的输入之一
- 待确认：身份标识统一实施状态、5 条缺失数据通路来源、storage 全部验证的优先级判定
