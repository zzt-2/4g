# Send-Real Brainstorm

- **日期**: 2026-05-08
- **状态**: 已完成，可直接喂给 cs-feat-design
- **Direct contract**: 本文档 + `rewrite-send-design.md` + `rewrite-send-checklist.yaml`
- **Boundary guards**: `codestable/compound/2026-05-07-runtime-next-phase-global-planning.md` §14、`rewrite-feature-boundaries.md`、`rewrite-feature-interaction-matrix.md`

## 1. 目标

为 send-real 的 cs-feat-design 阶段提供输入，锁定构帧管线流程、表达式集成方式、target 解析策略和边界。

## 2. 事实清单

### 2.1 已有骨架

`rewrite/src/features/send/` 已有可运行骨架：

| 层 | 文件 | 行数 | 状态 |
|---|---|---|---|
| core/types | `core/types.ts` | 145 | SendRequest/SendResult/SendFieldEncodingDef/FrameBuildOutput 已定义 |
| core/encode | `core/encode.ts` | 157 | buildFrame() 已实现字段编码（uint/int/float/double/bytes/ASCII + 大小端） |
| core/checksum | `core/checksum.ts` | — | 已实现 sum8/xor8/crc16-modbus 纯函数 |
| core/validation | `core/validation.ts` | — | validateSendRequest 已实现 |
| service | `services/send-service.ts` | 252 | 完整生命周期 pipeline |
| state | `state/send-state.ts` | 121 | 不可变快照 + 增量统计 |
| selectors | `selectors/send-selectors.ts` | 31 | 深拷贝只读 selector |
| adapters | `adapters/ports.ts` | — | 4 个 adapter port（frameReader/targetResolver/transportWriter/resultEmitter） |
| adapters | `adapters/fake-*.ts` | — | FakeFrameSnapshotProvider + FakeConnectionWriter |
| tests | `__tests__/` | — | send-core.spec + send-service-state-selector.spec |

### 2.2 frame-real 消费关系

FrameAssetReader 是唯一帧数据入口。send 通过 selector 获取 `ReadonlyFrameAsset`，不修改帧定义。

**已消费的 frame-real 字段**：

| 字段 | 用途 |
|---|---|
| `fields[].dataType` | 确定编码方式 |
| `fields[].length` | 确定字节数 |
| `fields[].bigEndian` / `options.bigEndian` | 字节序 |
| `fields[].isASCII` | ASCII 编码 |
| `fields[].offset` | 计算得出 |

**未消费的 frame-real 字段（本次需补充）**：

| 字段 | 用途 | 优先级 |
|---|---|---|
| `fields[].factor` | 逆换算 `value / factor` | 必须 |
| `fields[].expressionConfig` | 表达式驱动字段值 | 必须 |
| `fields[].defaultValue` | 用户未填值时的 fallback | 必须 |
| `fields[].configurable` | 检查用户值合法性 | 必须 |
| `fields[].validOption` | checksum 计算范围（startFieldIndex/endFieldIndex） | 必须 |
| `fields[].inputType` | 输入类型（input/select/radio/expression） | 应有 |
| `fields[].options[]` | select/radio 可选项验证 | 应有 |
| `options.autoChecksum` | 是否自动计算 checksum | 必须 |
| `options.includeLengthField` | 是否包含长度字段 | 必须 |
| `options.checksumMethod` | checksum 算法选择 | 必须 |
| `direction` | 只构造 send 方向帧 | 必须 |

### 2.3 Factor 事实（已用代码验证）

**结论：发送帧 factor 全部为 1，新系统用 `/`（物理值 / factor）保证正向兼容。**

证据来源：`public/data/frames/configs/3.json`

| 方向 | 字段名 | factor 值 |
|---|---|---|
| receive | 粗测距 | 100 |
| receive | 细测距 | 0.390625 |
| receive | 频偏估计值 | 0.000001 |
| **send** | 粗测距 | **1** |
| **send** | 细测距 | **1** |
| **send** | 频偏估计值 | **1** |

旧系统双向都用 `value * factor`，实际对发送帧是 no-op（`* 1`）。

frame-real design 的约定：
- 接收：`物理值 = 原始值 * factor`
- 发送：`原始值 = 物理值 / factor`

factor=1 时 `/ 1 = 原值`，完全兼容。Legacy migration 原样保留 factor 是正确的。

### 2.4 Checksum 缺口

| 维度 | 已有 | 缺失 |
|---|---|---|
| 算法 | sum8, xor8, crc16-modbus | crc32 |
| 范围指定 | 无 | validOption.startFieldIndex/endFieldIndex |
| 回填 | 无 | build buffer → 计算 → 回填到 checksum 字段位置 |

旧系统流程（`frameInstancesUtils.ts`）：先按字段范围计算 checksum，再在 frameToBuffer 中回填。

### 2.5 表达式引擎 API

```typescript
// shared/expression/index.ts
compileConditional(expressions: ReadonlyMap<string, string>, functions?: FunctionTable)
  → GroupCompileResult
  // success 时包含 CompiledGroup { _order: topo排序后的key[], _compiled: Map<string, CompiledExpr> }
  // 失败时返回 errors Map

evaluateConditional(group: CompiledGroup, variables: VariableMap)
  → GroupEvalResult
  // { values: Map<string, VariableValue>, errors: Map<string, string> }
  // 按 topo order 逐个求值，成功的值立即加入 vars 供后续表达式使用
  // 部分失败不影响其他变量

VariableValue = number | string | boolean
VariableMap = ReadonlyMap<string, VariableValue>
```

关键特性：
- 自动依赖排序（Kahn 拓扑排序）
- 循环依赖编译时报错
- 部分求值失败不阻断其他变量
- 成功值立即传递给后续表达式（支持同帧字段引用）

### 2.6 Connection feature 骨架

`rewrite/src/features/connection/` 已有完整骨架：
- `TransportTargetSnapshot`：targetId、connectionId、kind、available 等
- 支持 serial、tcp-client、tcp-server、udp
- `ConnectionTransportAdapter` port：write 方法接收 `connectionId + bytes`
- Fake adapter 已实现
- 缺失：RealNetworkAdapter（TCP/UDP）

Send adapter port 映射：
```
targetId → SendTargetResolver.resolveTarget(targetId) → TransportTargetSnapshot { connectionId, available }
         → SendTransportWriter.writeBytes(connectionId, bytes)
```

### 2.7 已锁定的跨 feature 决策

| 关系 | 决策 | 来源 |
|---|---|---|
| frame → send | selector + public service，frame owns definitions | interaction-matrix |
| task → send | Promise\<SendResult\>，task send-step await | interaction-matrix |
| SCOE → send | SCOE → task → send，不直连 | interaction-matrix |
| send → result | send result 流经 task StepResult → TaskInstanceCompletion → result | interaction-matrix |
| send → connection | send 通过 adapter 访问传输能力，不管理连接生命周期 | boundaries |
| targetId ≠ deviceId | 已锁，charter 固定分离 | outbound-routing decisions |
| send 不得 | 硬编码 SCOE target / northbound 语义 / 统计写回 frame 定义 | quality-rules |

## 3. 构帧管线（完整 10 步）

```
SendRequest { frameId, userFieldValues?, variables?, targetId }
  │
  ├─ 1. validate（frameId 存在、targetId 非空）
  │     当前：validateSendRequest()
  │     新增：检查 direction='send'
  │
  ├─ 2. resolve frame
  │     frameReader.getFrame(frameId) → ReadonlyFrameAsset
  │     确认 direction === 'send'，否则返回 error
  │
  ├─ 3. resolve field values（新增步骤）
  │     对每个字段按优先级：
  │       3a. userFieldValues[field.id] 存在 → 使用用户值
  │       3b. field.expressionConfig 存在 → evaluateExpressions()（compileConditional + evaluateConditional）
  │       3c. field.defaultValue 存在 → 使用默认值
  │       3d. 以上都没有 → zero fill + warning（已有实现）
  │
  ├─ 4. apply factor（新增步骤）
  │     对非 bytes 类型字段：rawValue = value / factor
  │     当前数据 factor 全为 1，实际无转换
  │
  ├─ 5. build byte buffer
  │     buildFrame({ fields, totalByteLength, fieldValues })
  │     已有实现，按 dataType + length + endianness 编码
  │
  ├─ 6. auto checksum（新增步骤）
  │     如果 options.autoChecksum：
  │       找到 isChecksum 字段（validOption 标记）
  │       按 startFieldIndex..endFieldIndex 范围计算
  │       按 checksumMethod 选择算法
  │       回填到 checksum 字段在 buffer 中的位置
  │
  ├─ 7. auto length field（新增步骤）
  │     如果 options.includeLengthField：
  │       找到 length 字段
  │       回填帧总长度值
  │
  ├─ 8. resolve target
  │     targetResolver.resolveTarget(targetId) → TransportTargetSnapshot
  │     不可用 → 返回 target-unavailable
  │
  ├─ 9. enqueue / transport write（新增 queue）
  │     轻 FIFO：按 targetId 分组，保证单 target 顺序
  │     transportWriter.writeBytes(connectionId, bytes)
  │     失败 → 返回 transport-error
  │
  └─ 10. emit SendResult + update stats
        已有实现
```

## 4. 关键设计决策

| # | 决策 | 结论 | 证据 |
|---|---|---|---|
| D1 | 字段值优先级 | 用户输入 > 表达式求值 > defaultValue > zero fill | encode.ts 已有 zero fill |
| D2 | Factor 方向 | 发送用 `/`（`raw = physical / factor`）；当前发送帧 factor 全为 1 | 3.json 实际数据 |
| D3 | Checksum 回填 | build buffer → 按范围计算 → 回填到 checksum 字段位置 | 旧 frameInstancesUtils.ts 模式 |
| D4 | 表达式集成 | send 内部执行 compileConditional + evaluateConditional，VariableProvider adapter 注入变量 | shared/expression API 确认 |
| D5 | 变量来源 | VariableProvider adapter 每次 execute 调用获取最新值；同帧字段由 evaluateConditional 自动传递 | evaluateConditional topo order + 值传递 |
| D6 | Target 解析 | targetId → SendTargetResolver → connectionId → SendTransportWriter | connection feature 骨架已确认 |
| D7 | Queue | 本期实现轻 FIFO，按 targetId 分组，保证单 target 顺序；深度和策略等 runtime 证据 | send design §4.3 |
| D8 | Direction 过滤 | resolveFrame 时检查 direction='send'，不匹配则 error | FrameAssetQuery.direction 已支持 |
| D9 | Checksum 算法 | 新增 crc32；支持 sum8/xor8/crc16/crc32；custom 延后 | checksum.ts 已有 3 种 |

### D4 表达式集成详细方案

```
调用方提供                          Send 内部处理
─────────                          ────────────
userFieldValues ──┐
                   ├─→ resolveFieldValues() ──→ applyFactor() ──→ buildFrame()
variables ────────┘        │
                           └─→ evaluateExpressions()
                                  │
                                  ├─ 从 frame.fields 收集 expressionConfig
                                  ├─ compileConditional({fieldId: expression})
                                  ├─ evaluateConditional(compiled, variables)
                                  └─ 返回 { values, errors }
```

VariableProvider adapter port：
```typescript
interface SendVariableProvider {
  getVariables(): VariableMap;
}
```

变量来源映射：

| 变量类型 | 实际来源 | 谁提供 |
|---|---|---|
| 遥测当前值 | receive feature selector | VariableProvider adapter 实现 |
| 全局参数 | 参数 store | VariableProvider adapter 实现 |
| 同帧其他字段 | 已求值的前序字段 | evaluateConditional 自动处理 |
| 任务上下文 | task runtime | 调用方通过 SendRequest.variables 注入 |

### D7 Queue 详细方案

```
sendService.execute(request)
  └─→ enqueue(request)  // 按 targetId 分组
       └─→ processQueue(targetId)  // 串行消费同一 target 的请求
            └─→ transportWriter.writeBytes(connectionId, bytes)
```

- 内部 Map\<targetId, SendRequest[]\>
- 同一 target 串行，不同 target 可并行
- 深度和溢出策略等 runtime 证据（对应 checklist c16 deferred）

## 5. 要做什么

### core 层（纯函数，可测试）

| 编号 | 内容 | 类型 |
|---|---|---|
| C1 | 扩展 SendFieldEncodingDef：新增 factor、expressionConfig、defaultValue、configurable、validOption、isChecksum | 扩展类型 |
| C2 | 新增 resolveFieldValues()：按优先级解析每个字段值 | 新增纯函数 |
| C3 | 新增 evaluateExpressions()：收集 expressionConfig → compileConditional → evaluateConditional | 新增纯函数 |
| C4 | 新增 applyFactor()：对非 bytes 类型字段做 `value / factor` | 新增纯函数 |
| C5 | 扩展 buildFrame()：build 后回填 checksum（按 validOption 范围） | 扩展现有 |
| C6 | 新增 buildLengthField()：build 后回填帧总长度 | 新增纯函数 |
| C7 | 新增 checksumCrc32() | 新增纯函数 |
| C8 | 扩展 calculateChecksum()：支持范围参数（startIdx, endIdx） | 扩展现有 |

### service 层

| 编号 | 内容 | 类型 |
|---|---|---|
| S1 | 重写 frameToBuildInput()：消费 frame-real 全部字段 | 重写 |
| S2 | 新增 VariableProvider adapter port | 新增 port |
| S3 | Pipeline 重排：insert resolveFieldValues → evaluateExpressions → applyFactor → buildFrame → checksum → length | 重排 |
| S4 | 轻量 FIFO queue：Map\<targetId, Queue\> | 新增 |
| S5 | validate 扩展：direction 检查 | 扩展 |

### adapters/fixtures

| 编号 | 内容 | 类型 |
|---|---|---|
| A1 | FakeVariableProvider | 新增 |
| A2 | 更新 fixtures：覆盖表达式、factor、checksum、length 场景 | 扩展 |

## 6. 不做什么

| 排除项 | 理由 |
|---|---|
| SCOE 成功条件 | 归 task→SCOE，send 只返回 SendResult |
| northbound 回执 | 归 northbound feature，targetId ≠ deviceId 已锁 |
| 报告交付 | 归 report feature，send result 流经 task → result |
| 定时/触发/序列调度 | 归 task runtime |
| UI 页面/表单 | 归 pages/widgets，send 只提供 service + selector |
| 真实连接管理 | 归 connection feature + platform facade |
| custom checksum | 无实际帧数据需要，frame-real 类型已预留 |
| 表达式编译缓存 | 每次 execute 求值即可，可后续优化 |
| 重试/超时策略 | transport write 失败返回错误，重试由 task 层决定 |

## 7. 依赖后续 feature 的项目

| 项目 | 依赖谁 | send 侧准备 | 阻塞什么 |
|---|---|---|---|
| TCP/UDP 真实发送 | connection-complete（RealNetworkAdapter） | adapter port 已定义，fake adapter 已有 | 真实网络发送 |
| Task send-step 集成 | task feature | Promise\<SendResult\> 已决策 | 任务编排中的发送步骤 |
| SCOE 命令发送 | task + SCOE | SCOE → task → send 路径已决策 | SCOE 协议帧发送 |
| VariableProvider 真实实现 | receive selector + 全局参数 | adapter port 将定义 | 表达式中引用遥测值 |

**这些不阻塞 send-real 的 design 和 impl**——用 fake adapter 可完成全部静态验证。只有 runtime/hardware validation 需要真实 adapter。

## 8. 给 design 阶段的输入清单

Design 阶段需要做的具体工作项：

1. **重写 `frameToBuildInput()`**（`send-service.ts:85-105`）：从 5 字段版本扩展为消费 frame-real 全部字段
2. **新增 `resolveFieldValues()` 纯函数**：输入 frame.fields + userFieldValues + evaluatedValues，输出完整 fieldValues，含优先级逻辑
3. **新增 `evaluateExpressions()` 纯函数**：从 frame.fields 收集 expressionConfig，调用 compileConditional + evaluateConditional
4. **新增 `applyFactor()` 纯函数**：对非 bytes 类型字段做 `value / factor`
5. **扩展 `buildFrame()`**：build 后增加 checksum 回填和 length field 回填
6. **新增 `checksumCrc32()`**：在 `core/checksum.ts`
7. **扩展 `calculateChecksum()`**：新增 range 参数
8. **重排 send-service pipeline**：step 2-3 之间插入值解析、表达式求值、factor 步骤
9. **新增 `VariableProvider` adapter port**：在 `adapters/ports.ts`
10. **新增轻量 FIFO queue**：send-service 内部
11. **更新 fixtures**：覆盖 C2-C7 所有新场景
12. **更新 `core/types.ts`**：扩展 SendFieldEncodingDef、SendRequest、SendBuildInput
