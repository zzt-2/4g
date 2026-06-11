# command-ingress brainstorm

> 日期：2026-05-09
> 状态：结论已锁定，ready for cs-feat-design
> Lane：Lane B（单 feature，不拆 roadmap）
> 依赖：task-real（brainstorm 已锁定）、connection-complete（TCP/UDP adapter）

## 结论

command-ingress 是统一的**外部系统命令入站 feature**，接收 SCOE TCP 协议和新甲方 HTTPS 接口的指令，解析协议后分发执行并回传结果。

核心设计选择：

1. **消费者链入站分发**：routingTick 定义 `TransportEventConsumer` 接口，依次调用消费者（command-ingress 先于 receive），每个消费者返回 `{consumed, remaining}`。routingTick 不知道也不评估任何领域条件
2. **两种命令路由**：发帧+等条件类走 task 执行引擎（构造 TaskDefinition），查询/状态类走 handler 直接处理
3. **SCOE 6 种命令全部可映射**：4 种直接 handler，2 种翻译为 TaskDefinition
4. **不自建帧列表、不自建条件系统、不建执行器框架**
5. **多客户端保留但不加并发控制**（复刻旧系统行为）
6. **回应机制极简**：只有 UDP 成功帧，无失败帧，无重试

## 事实与证据

### 旧 SCOE 系统（22 文件）

来源：`src/composables/scoe/`、`src/stores/scoeStore.ts`、`src/utils/receive/scoeFrame.ts`、`src/types/scoe/`

#### 命令生命周期（6 阶段）

```
TCP Server 接收指令帧
  → 功能码验证（SCOE 标识 + 指令码，4 字节）
  → 校验和验证（sum % 256）
  → 参数提取（按 offset/length 从字节流提取 → receiveCode 选项匹配）
  → 命令分发（6 种执行器策略映射）
  → 执行（发帧/状态操作/查询 + 异步轮询条件等待）
  → 回应（UDP 发 successFrameId 帧 或 只记录错误状态）
```

#### 6 种命令分类

| 命令 | 分类 | 旧行为 | 新系统映射 |
|------|------|--------|-----------|
| LOAD_SATELLITE_ID | 状态操作 | 查卫星配置→验证→加载帧配置→更新状态 | handler 直接操作 |
| UNLOAD_SATELLITE_ID | 状态操作 | 清除状态→重置统计 | handler 直接操作 |
| HEALTH_CHECK | 查询 | 返回连接状态+健康状态快照 | handler 返回 snapshot |
| LINK_CHECK | 查询 | 检查接收帧同步锁定字段 | handler 返回 snapshot |
| SEND_FRAME | 发帧+等条件 | 遍历帧实例→应用参数→间隔发送→等完成条件 | TaskDefinition（多个 send step + wait-condition），adapter 在 onSettled 后发确认帧 |
| READ_FILE_AND_SEND | 读文件+定时发+等条件 | 读文件→fieldVariation→定时任务→多轮发送 | TaskDefinition（fieldVariations + timer schedule + send + wait），adapter 在 onSettled 后发确认帧 |

#### 协议解析细节

来源：`src/utils/receive/scoeFrame.ts`

- **功能码**：第 1 字节 SCOE 标识（`ScoeGlobalConfig.scoeIdentifier`）+ 第 2 字节指令码（`ScoeReceiveCommand.code`）+ 第 3-4 字节固定 0xAA
- **信源/信宿/卫星 ID 偏移量**：由 `ScoeGlobalConfig` 配置（`sourceIdentifierOffset`、`destinationIdentifierOffset`、`satelliteIdOffset`、`modelIdOffset`），不在命令级别定义
- **校验和**：`ScoeReceiveCommand.checksums`（`ChecksumConfig[]`）配置每条命令的 offset/length/checksumOffset，算法为累加取模 256
- **参数提取**：按 `ScoeCommandParams` 的 offset/length 从字节流提取 → 转 hex → 匹配 `options[].receiveCode` → 取 `option.value`
- **完成条件**：`ScoeReceiveCommand.completionConditions`（`CompletionCondition`）支持两种模式——固定值（`targetFixedValue`）和参数化（通过参数选项索引匹配）

来源：`src/types/scoe/receiveCommand.ts`（命令级配置）、`src/types/scoe/index.ts`（全局配置）

#### 配置两层分离

旧 SCOE 配置分两个独立类型，新系统必须保留这个分离：

**ScoeGlobalConfig**（全局配置，14 字段）：`scoeIdentifier`、`tcpServerIp/Port`、`udpIp/Port`、`messageIdentifierOffset`、`sourceIdentifierOffset`、`destinationIdentifierOffset`、`modelIdOffset`、`satelliteIdOffset`、`functionCodeOffset`、`successFrameId?`、`highlightConfigs?`

**ScoeReceiveCommand**（单条命令配置，11 字段）：

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | string | 唯一标识 |
| `label` | string | 显示名称 |
| `code` | string | 功能码（hex） |
| `function` | ScoeCommandFunction | 执行功能枚举（6 种） |
| `checksums` | ChecksumConfig[] | 校验和配置 |
| `params` | ScoeCommandParams[]? | 参数定义（offset/length/options） |
| `frameInstances` | SendFrameInstance[]? | 帧实例（SEND/READ 用） |
| `completionConditions` | CompletionCondition[]? | 完成条件 |
| `completionTimeout` | number? | 条件超时 ms（默认 5000） |
| `successFrameId` | string? | 成功帧 ID（命令级覆盖，全局级也有） |
| `sendInterval` | number? | 发送间隔 ms |

#### 统计与状态（ScoeStatus 12 字段）

来源：`src/types/scoe/index.ts:57-82`

**统计计数**（3 个，运行时内存，不持久化）：
- `commandReceiveCount` / `commandSuccessCount` / `commandErrorCount`

**运行时状态**（6 个）：
- `loadedSatelliteId`：已加载的卫星 ID（LOAD 的前置条件门控）
- `scoeFramesLoaded`：帧配置是否已加载
- `healthStatus`：健康状态（unknown/healthy/error）
- `linkTestResult`：链路自检结果（unknown/pass/fail）
- `lastCommandCode` / `receiveCommandSuccess`

**计时器**（3 个）：
- `runtimeSeconds` / `satelliteIdRuntimeSeconds`：每秒递增
- `lastErrorReason`

#### TCP 连接管理

来源：`src-electron/main/ipc/networkHandlers.ts:146-224`

- 支持**多客户端并发连接**（tcpServerClients Map）
- 每个客户端独立触发命令执行，**无排队、无重入保护**
- 回应通过 UDP（`network:scoe-udp:scoe-udp-remote`），TCP server 只接收不发

#### 遗漏的特殊行为（CRITICAL-3 修正）

**LOAD 门控**（`scoeFrame.ts:191-213`）：当 `scoeFramesLoaded` 为 false 时，**只识别指令码 01（LOAD_SATELLITE_ID）**，其他指令码直接返回 `{ isScoe: false }`。这意味着 SCOE 有一个两阶段状态机：先 LOAD 加载卫星配置，然后才能处理其他命令。

**statusUpdate 定时器**（`scoeStore.ts:293-311`）：不只是更新 runtimeSeconds，是一个每秒执行的运行时状态机：
1. `runtimeSeconds++`
2. 重置 `receiveCommandSuccess = false`
3. 如果未加载卫星：清空所有运行时统计（接收计数、成功计数、错误计数、健康状态等）
4. 如果已加载：`satelliteIdRuntimeSeconds++`，否则归零
5. 调用 `checkSatelliteLoad()` 和 `sendScoeFrames()`

**完成条件参数化模式**（`scoeFrame.ts:442-475`）：`useParam=true` 的条件通过**索引对齐**工作——参数的 `options[]` 和条件的 `options[]` 按数组索引一一对应。提取参数值 → `findIndex(opt => opt.value === paramValue)` → 用相同索引从条件 options 取 `matchValue` 和 `operator` → `compareValues(sourceValue, matchValue, operator)`。配置时必须保证两个 options 数组索引对齐。

### 新系统已有能力

#### SCOE 帧实例迁移分析（CRITICAL-5 修正）

旧系统帧相关概念分三层：

| 概念 | 旧位置 | 性质 |
|------|--------|------|
| **帧定义**（Frame） | `framesStore` + `framesConfig.json` | 结构模板，全局唯一，定义字段列表、数据类型、校验规则 |
| **帧实例**（SendFrameInstance） | `scoeFrameInstancesStore` + `scoeSendInstances.json` | 从帧定义拷贝的运行时对象，包含完整字段值、targetId、strategyConfig |
| **命令帧引用** | `ScoeReceiveCommand.frameInstances` | 每条命令内嵌一组帧实例，定义"执行这条命令时发哪些帧" |

旧 SCOE 的 `scoeSendInstances.json` 有 1083 行配置，每条命令通过 `frameInstances` 引用需要发送的帧实例。

**"不自建帧列表"的含义**：不维护独立的帧定义管理（不复制 frame feature 的帧结构），但命令需要知道"发哪些帧、字段怎么映射"——这是命令配置层的信息，不是帧定义的重复。

**选定方案**：命令配置映射。每条 SCOE 命令配置存储 `frameId + 字段映射规则`，运行时从 frame feature 获取帧定义、应用参数映射、构造 send-step。

```typescript
// 新系统 SCOE 命令配置中的帧映射
interface ScoeCommandFrameMapping {
  readonly frameId: string;           // 引用 frame feature 的帧定义
  readonly targetId: string;          // 发送目标
  readonly fieldMappings: ReadonlyArray<{
    readonly fieldId: string;          // 帧字段 ID
    readonly source: 'fixed' | 'param'; // 值来源
    readonly fixedValue?: string | number;
    readonly paramId?: string;         // 从命令参数取值
  }>;
}
```

**不违反"不自建帧列表"**：SCOE 只存储引用关系（frameId + fieldMappings），不复制帧结构。帧定义 truth 始终在 frame feature。

**待验证**：frame feature 是否提供 `getFrameById(frameId)` 公共 API。

#### Task 执行引擎（引用 task-real brainstorm 提案类型，最终以 task-real design 为准）

```typescript
interface TaskDefinition {
  id: string;
  name: string;
  steps: readonly TaskStepDefinition[];
  schedule: ScheduleDriver;
  stopCondition?: TaskStopCondition;
  fieldVariations?: readonly FieldVariation[];
  errorPolicy: TaskErrorPolicy;
}

type ScheduleDriver =
  | { kind: 'immediate' }
  | { kind: 'timer'; intervalMs: number }
  | { kind: 'event'; conditions: readonly ConditionTerm[] };

interface TaskStopCondition {
  maxIterations?: number;
  maxDurationMs?: number;
  exitCondition?: readonly ConditionTerm[];
}

type TaskStepDefinition =
  | { kind: 'send'; id: string; config: SendStepConfig }
  | { kind: 'wait-condition'; id: string; config: WaitConditionConfig }
  | { kind: 'delay'; id: string; config: { durationMs: number } };

interface SendStepConfig {
  frameId: string;
  targetId: string;
  fieldValues: Readonly<Record<string, string | number | boolean>>;
  intervalAfterMs?: number;
  repeat?: {
    intervalMs: number;
    until?: readonly ConditionTerm[];
    maxCount?: number;
  };
}

interface WaitConditionConfig {
  conditions: readonly ConditionTerm[];
  timeoutMs?: number;
  onTimeout: 'continue' | 'skip' | 'fail';
}

interface ConditionTerm {
  frameId: string;
  fieldId: string;
  operator: ComparisonOperator;
  threshold: string | number;
  sourceId?: string;
  logicOperator?: 'and' | 'or';
}

interface FieldVariation {
  fieldId: string;
  values: readonly (string | number)[];
}
```

TaskService API：`createTask(def) → instanceId`、`startTask(id)`、`onSettled(id) → Promise`

#### Connection

- 入站：`TransportEventSnapshot`（bytes, connectionId, target, kind, occurredAt）
- 出站：`write(TransportWriteRequest { connectionId, bytes, targetId? })`
- 只有拉取 API（从 adapter 抽取 events 的 drain 方法 + 读取已缓冲 events 的 list 方法），无订阅机制
- **TCP server 公共 API 已确认**：`TcpServerTransportConfig` 已在 connection 公共 API 中导出（`index.ts:11`），包含 `id`、`kind: 'tcp-server'`、`host`、`port`、可选 `label`。TCP server 接收的数据通过 `TransportEventSnapshot` 正常传播。command-ingress 可直接使用，无 gap。

#### Runtime routingTick

来源：`rewrite/src/runtime/routing-tick.ts`

- 以 100ms 间隔 tick 驱动
- 流程：`drainAdapterEvents()` → 过滤 data events（结构性判断，非领域判断）→ 包装为 `ConnectionToReceiveInputSource` → `receiveService.drainInputSource()` → 提取匹配结果 → 分发到 task/display/storage
- **当前硬编码 connection → receive**，无扩展点
- 架构约束：`CLAUDE.md:152` 和 `rewrite-target-structure.md:418` 明确 runtime 只负责装配、调用顺序、事件路由和生命周期，不承载领域规则
- 扩展方案：消费者链模式（见决策 1），routingTick 不知道 command-ingress 的存在，只管理有序的消费者列表

#### Shared

- `condition-operators/`：`ComparisonOperator`（eq/neq/gt/lt/gte/lte/contains/change/any）+ `compareValues`
- `expression/`：`compileExpression` / `compileConditional` / `evaluate`（纯 TS，零依赖）

### 三轮自检结果

#### R1：验证关键假设（3 个 agent）

| 假设 | 验证结果 | 修正 |
|------|---------|------|
| command-ingress 可订阅 transport events | ❌ ConnectionService 只有拉取 API | 改为扩展 routingTick |
| runtime 有路由机制可注册 | ⚠️ 有 routingTick 但硬编码 | 在 routingTick 中增加分支 |
| handler map 覆盖所有 6 种命令 | ✅ READ_FILE_AND_SEND 可映射为 fieldVariations + timer TaskDefinition | 确认 |
| 回应需要协议适配器动态构造 | ❌ 只有 UDP 成功帧，用预配置帧模板 | 简化 |
| 参数可能需要表达式引擎 resolve | ❌ 预配置选项匹配，翻译时全部可 resolve 为 literal | 简化 |
| checksum 值得提取到 shared/ | ❌ 只有 sum%256 一种算法，领域特定 | 不提取 |

#### R2：覆盖度扫描 + 边界审查（2 个 agent）

旧 SCOE 20 项可观测行为覆盖度：

- ✅ 完全覆盖 17 项（A1 接收、A3 信源标识、A4 卫星 ID、A5 校验和、A6 参数提取、A7 选项匹配、A9 LOAD、A10 UNLOAD、A11 HEALTH_CHECK、A12 LINK_CHECK、A13 SEND_FRAME、A14 READ_FILE_AND_SEND、A15 条件轮询、A16 超时处理、A17 成功帧、A18 统计、A19 运行计时器）
- 有意移除 1 项：A8 命令分发到 6 种执行器（设计意图就是消灭执行器中间层）
- 边界决策 1 项：A20 多客户端 TCP（connection 保证独立 event，command-ingress 不需要知道多客户端）
- 无 CLAUDE.md 违反，无 feature 归属错误

#### R3：反向验证——遗漏检测（1 个 agent）

| 遗漏 | 严重性 | 补救方案 |
|------|--------|---------|
| 命令并发控制 | 已决策：允许并发，不加锁不排队（复刻旧系统） | handler 加前置条件检查 |
| 连接断开清理 | 中 | 监听 TCP disconnect event，取消执行中的 task |
| handler 前置条件门控 | 中 | LOAD 前不能 SEND、已加载不能再 LOAD，handler 检查领域状态 |

确认不是遗漏的：回应帧校验和（send service 自动计算）、UNLOAD 副作用（只清状态不断 UDP）、HEALTH_CHECK 数据来源（通过 ctx 读 selector）。

## 设计决策

### 决策 1：消费者链入站分发

**架构约束**：`CLAUDE.md` 和 `rewrite-target-structure.md` 明确规定 runtime 只负责装配、调用顺序、事件路由和生命周期，不承载领域规则。routingTick 不能评估任何领域条件（如"这个字节是不是 SCOE 协议"）。

**方案**：routingTick 定义通用的 `TransportEventConsumer` 接口，消费者链依次处理：

```typescript
// runtime 层——纯接线，不评估领域条件
interface TransportEventConsumer {
  consume(events: readonly TransportEventSnapshot[]):
    Promise<ConsumerResult>;
}

interface ConsumerResult {
  readonly consumed: readonly TransportEventSnapshot[];
  readonly remaining: readonly TransportEventSnapshot[];
}
```

**数据流**：

```
routingTick drainAdapterEvents()
  ↓ 过滤 data events（结构性判断，非领域判断）
  ↓ data events: [...]
  ↓
① command-ingress.consume(data events)
   adapter 检查协议头/连接类型 → 消耗 SCOE events → 返回 remaining
  ↓ remaining: [非 SCOE events]
  ↓
② receive.drainInputSource(remaining)
   正常 receive 处理流程，完全不知道 command-ingress 存在
```

**关键设计**：
- routingTick 不知道"SCOE"或"command-ingress"，只知道一个有序的消费者列表
- 消费者顺序是装配时决策（feature-wiring 中确定 command-ingress 先于 receive），属于接线
- command-ingress 的 `consume()` 内部做所有领域判断（协议头检查、功能码匹配）
- receive 不需要添加"跳过 SCOE"的逻辑，天然隔离
- 互斥通过 `remaining` 链传递实现，不需要 routingTick 做过滤

**routingTick 改动**：增加消费者注册 + 链式调用逻辑。`RewriteWiredFeatures` 增加 commandIngressConsumer。约 20-30 行改动。

### 决策 2：handler map 函数签名，不建 executor 框架

```typescript
type CommandHandler = (
  command: ParsedCommand,
  ctx: CommandContext
) => Promise<CommandResult>;
```

**理由**：6 种命令中 4 种是简单操作（状态/查询），2 种翻译为 TaskDefinition。不需要 CommandExecutor 抽象类或执行器框架。一个 Map 搞定。

**CommandContext 提供**：
- `taskService`：创建和启动 task
- `stateReader`：读领域状态（loadedSatelliteId、统计等）
- `frameAssetReader`：查帧定义
- `connectionSnapshot`：读连接状态（HEALTH_CHECK 用）
- `receiveSnapshot`：读接收状态（LINK_CHECK 用）
- `fileReader`：读文件（READ_FILE_AND_SEND 用，通过 platform facade）

### 决策 3：SCOE 命令翻译为 TaskDefinition

**SEND_FRAME**：
```typescript
TaskDefinition {
  schedule: { kind: 'immediate' },
  steps: [
    { kind: 'send', config: { frameId: instance1.frameId, fieldValues: resolvedParams, targetId: 'udp-target' } },
    { kind: 'delay', config: { durationMs: command.sendInterval } },
    { kind: 'send', config: { frameId: instance2.frameId, ... } },
    // ... 每个帧实例一个 send step
    { kind: 'wait-condition', config: { conditions: completionConditions, timeoutMs: command.completionTimeout, onTimeout: 'fail' } }
  ]
}
// 确认帧：adapter 在 taskService.onSettled() 成功后，通过 connection.write() 发送 successFrameId 帧
```

**READ_FILE_AND_SEND**：
```typescript
TaskDefinition {
  schedule: { kind: 'timer', intervalMs: command.sendInterval },
  steps: [
    { kind: 'send', config: { frameId, fieldValues, targetId } },
    { kind: 'wait-condition', config: { conditions, timeoutMs, onTimeout: 'fail' } }
  ],
  fieldVariations: [{ fieldId, values: fileLines }],  // adapter 通过 platform facade 读文件
  stopCondition: { maxIterations: maxLineCount }
}
// 确认帧：adapter 在 taskService.onSettled() 成功后，通过 connection.write() 发送 successFrameId 帧
```

**参数 resolve**：adapter 在翻译阶段从指令帧字节提取参数 → 匹配 options → resolve 为 literal 值，直接填入 TaskDefinition。task 引擎不需要理解参数关联。

### 决策 4：并发策略——允许并发，不加锁不排队

**理由**：实际只有一个 SCOE 客户端连接，并发是理论风险。旧系统就是这么干的。多客户端保留在 connection 层，command-ingress 不额外管理。

**防护措施**：handler 内加领域状态前置条件检查（LOAD 门控、卫星 ID 状态）。

### 决策 5：回应机制——adapter 在 task 完成后独立发送

- 成功：adapter 订阅 `taskService.onSettled()`，task 成功完成后通过 `connection.write()` 发送 `successFrameId` 帧（UDP），不作为 task step
- 失败/超时：只更新领域状态（errorCount++、lastErrorReason），不发任何回应帧
- 校验和：由 send service 的 frameToBuffer 自动计算，command-ingress 不关心
- 确认帧不走 task step 的理由：READ_FILE_AND_SEND 是多轮迭代任务，确认帧只应发一次；统一策略让所有命令类型行为一致，且 task 不需要知道回应协议

### 决策 6：连接断开清理

监听 connection disconnect event，取消与该连接关联的正在执行的 task。旧系统没有这个机制，新系统补上。

### 决策 7：校验和不提取 shared/

校验和算法只有 `sum % 256` 一种，SCOE 领域特定。留在 ProtocolAdapter 内部。如果未来 send/receive 也有类似校验和需求，届时再提取。

### 决策 8：Feature 命名与目录

目录：`rewrite/src/features/command-ingress/`，中文仍叫"指令接入"。

### 决策 9：新甲方 HTTPS 先做 stub

`canHandle()` 返回 false，接口占位，不实现任何协议细节。schema 未确认前不冻结契约。

### 决策 10：不拆 roadmap，走 Lane B 单 feature

工作量估算 ~1200 行（含测试），checklist 分阶段推进：core 接口 → SCOE adapter → northbound stub。

## 边界

### command-ingress 拥有

- ProtocolAdapter 接口定义和注册
- SCOE 协议解析（功能码/校验和/参数提取）
- 命令分发（handler map）
- 领域状态（统计、卫星 ID、健康/链路状态）
- 命令→TaskDefinition 的翻译逻辑
- routingTick 集成点（bridge + 分流逻辑）
- 成功帧配置（successFrameId 选择）

### command-ingress 不拥有

- TCP/UDP 连接管理（connection owns）
- Task 执行引擎（task owns）
- 帧发送（task send-step → send service → connection）
- 条件匹配执行（task wait-condition-step + shared/condition-operators）
- 帧定义 truth（frame owns，command-ingress 只读）
- Transport event 获取（runtime routingTick owns 分发，command-ingress 是消费方）
- 回应帧校验和计算（send service owns）

### Feature 间交互

| 方向 | 交互方式 | 说明 |
|------|---------|------|
| runtime → command-ingress | routingTick 分流 transport events | 互斥过滤，command-ingress 先消费 |
| command-ingress → task | `taskService.createTask(def)` + `startTask(id)` + `onSettled(id)` | 翻译后的 TaskDefinition 与 UI 创建的无区别 |
| task → command-ingress | task lifecycle event | command-ingress 订阅，更新领域统计 |
| command-ingress → frame | `FrameAssetReader` 只读查询 | 查帧定义和字段 |
| command-ingress → connection | `write(request)` 发送确认帧 | adapter 在 onSettled 后直接调用，不经过 task |
| command-ingress → platform | `fileReader` 读文件 | READ_FILE_AND_SEND handler 通过 ctx |
| command-ingress → receive | 无直接依赖 | LINK_CHECK 通过 ctx 读 selector |
| command-ingress → connection state | 无直接依赖 | HEALTH_CHECK 通过 ctx 读 selector |

## 不做什么

- 不建独立帧列表（帧定义全局唯一，通过 frame feature 查询）
- 不建独立条件系统（条件匹配归 shared/，task wait-condition 执行）
- 不建执行器框架（handler map 函数签名够了）
- 不在通用 receive 流程里硬编码 SCOE 识别（入站走独立路由）
- 不把业务逻辑塞进 main process（协议解析、命令翻译全在 renderer TypeScript 层）
- 不提前冻结新甲方 HTTPS 契约（只做 stub）
- 不加命令并发控制（允许并发，复刻旧系统行为）
- 不提取校验和到 shared/（只有 sum%256，领域特定）
- 不建 CommandExecutor 抽象类或接口层次

## 给 design 的输入清单

1. `TransportEventConsumer` 接口定义（consume + ConsumerResult）+ routingTick 消费者链改造
2. ProtocolAdapter 接口定义（canHandle + parse 返回类型，实现 TransportEventConsumer）
3. CommandHandler 签名 + CommandContext 依赖注入字段
4. CommandIngressState（领域状态）+ selector（含两阶段状态机：scoeFramesLoaded 门控）
5. SCOE ProtocolAdapter 实现方案（功能码/校验和/参数提取的字节级逻辑，含 ScoeGlobalConfig + ScoeReceiveCommand 两层配置）
6. 6 种 SCOE 命令的 handler 实现（含前置条件检查：LOAD 门控、卫星 ID 状态）
7. SEND_FRAME 和 READ_FILE_AND_SEND 的 TaskDefinition 翻译规则
8. 参数 resolve 流程（offset/length → hex → receiveCode 匹配 → option.value）
9. 完成条件参数化索引对齐：adapter 从 `params.options[i]` 取值构造 WaitCondition threshold
10. 确认帧发送策略：adapter 在 `taskService.onSettled()` 成功后通过 `connection.write()` 独立发送
11. 帧实例迁移方案：`ScoeCommandFrameMapping`（frameId + fieldMappings），运行时从 frame feature 获取帧定义构造 send-step
12. 领域状态更新时机（订阅 task lifecycle event 的具体 event 类型）
13. 连接断开清理（监听 disconnect event + 取消关联 task）
14. 卫星配置数据模型（ScoeGlobalConfig + ScoeReceiveCommand 分离）和存储方式
15. 运行计时器实现（每秒状态机：runtimeSeconds、统计重置、checkSatelliteLoad）
16. RewriteWiredFeatures 扩展 + wireFeatures 初始化（消费者注册顺序）
17. 配置文件 schema（从旧 ScoeReceiveCommand + ScoeGlobalConfig + scoeSendInstances.json 迁移到新配置模型）
18. 与 task-real design 的类型引用约定（ConditionTerm、SendStepConfig 等复用方式，最终以 task-real design 为准）
19. frame feature 公共 API 确认（getFrameById 等只读查询能力）

## 需求覆盖度

### 旧系统可观测行为（23 项）

20 项完全覆盖，1 项有意移除，1 项边界决策，1 项部分覆盖：

| # | 需求 | 覆盖方式 |
|---|------|---------|
| A1 | TCP server 接收指令 | connection RealNetworkAdapter（`TcpServerTransportConfig` 已确认可用） |
| A2 | 功能码验证 | SCOE ProtocolAdapter |
| A3 | 信源/信宿标识验证 | SCOE ProtocolAdapter（使用 `ScoeGlobalConfig` 中的偏移量配置） |
| A4 | 卫星 ID 验证 | SCOE ProtocolAdapter |
| A5 | 校验和验证 | SCOE ProtocolAdapter |
| A6 | 参数提取 | SCOE ProtocolAdapter |
| A7 | 参数选项匹配 | SCOE ProtocolAdapter（翻译时 resolve，索引对齐模式） |
| A8 | 命令分发到 6 种执行器 | **有意移除**：改为 handler map |
| A9 | LOAD_SATELLITE_ID | handler 直接操作 |
| A10 | UNLOAD_SATELLITE_ID | handler 直接操作 |
| A11 | HEALTH_CHECK | handler 返回 snapshot |
| A12 | LINK_CHECK | handler 返回 snapshot |
| A13 | SEND_FRAME | TaskDefinition（多 send + wait），adapter 在 onSettled 后发确认帧 |
| A14 | READ_FILE_AND_SEND | TaskDefinition（fieldVariations + timer + wait），adapter 在 onSettled 后发确认帧 |
| A15 | 完成条件异步轮询 | task wait-condition-step |
| A16 | 条件超时记录错误 | task onTimeout: 'fail' + 领域状态更新 |
| A17 | 成功后 UDP 发帧 | adapter 在 onSettled 成功后通过 connection.write 发送 |
| A18 | 统计维护 | 订阅 task lifecycle event |
| A19 | 运行计时器 | 领域行为（TimerRegistry 或 setInterval） |
| A20 | 多客户端 TCP 并发 | **边界决策**：connection 保证独立 event，command-ingress 不区分客户端 |
| A21 | 未加载卫星时只识别 LOAD 指令 | ProtocolAdapter 两阶段状态机：scoeFramesLoaded=false 时只匹配指令码 01（`scoeFrame.ts:191-213`） |
| A22 | 每秒状态机轮询 | 领域定时行为：runtimeSeconds++、重置 receiveCommandSuccess、未加载时清空统计、checkSatelliteLoad（`scoeStore.ts:293-311`） |
| A23 | 完成条件参数化索引对齐 | adapter 翻译时从 `params.options[i]` 取值，构造 WaitCondition 的 threshold，索引对齐由配置保证（`scoeFrame.ts:442-475`） |

### 架构约束（10 项 CLAUDE.md 硬规则）

全部满足。core 层零 Vue/Pinia/Electron 依赖，selector 不可变，renderer 不直接访问 Node。

### 待外部确认

- TimerService 在 platform/ 下的具体位置（与 task-real 共用）
- runtimeSeconds 的更新方式（定时回调 vs task event 驱动）
- 卫星配置的持久化方式（storage feature 接入时机）

## 架构文档同步清单

以下文档需要更新以反映 command-ingress 替代旧 scoe/ + 部分 northbound/ 的分区：

- `codestable/architecture/rewrite-target-structure.md`：feature 列表增加 `command-ingress/`，更新 scoe/ 和 northbound/ 的职责描述
- `codestable/architecture/rewrite-feature-boundaries.md`：增加 command-ingress owner 职责
- `codestable/architecture/rewrite-feature-interaction-matrix.md`：增加 command-ingress 行和列
- `codestable/quality/rewrite-quality-rules.md`：R9 SCOE 例外处理规则更新为 command-ingress 入口
