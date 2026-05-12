# command-ingress design

> 日期：2026-05-09
> 状态：draft
> 直接合同：command-ingress-brainstorm.md
> 依赖：task（types 已确认）、connection（API 已确认）、frame（API 已确认）

## 类型引用约定

本 design 引用的 task 类型以 **task-real design**（`codestable/features/rewrite-task/task-real-design.md`）为最终真相源。task-real 尚未实施，以下映射标注了当前代码 vs task-real design 的差异。command-ingress 实施必须等 task-real 实施完成后才能开始。

| 当前代码名 | task-real design 名 | 变更性质 | 来源 |
|---|---|---|---|
| `TaskSchedulingMode` | `ScheduleDriver` discriminated union | 替代 | task-real design §1.1 |
| `WaitCondition` | `ConditionTerm`（新增 `logicOperator`） | 扩展 | task-real design §1.1 |
| `WaitConditionStepConfig.condition` | `WaitConditionConfig.conditions` 数组 | 单→数组 | task-real design §1.2 |
| `WaitConditionStepConfig.timeoutMs: number` | `WaitConditionConfig.timeoutMs?: number` | 必选→可选 | task-real design §1.2 |
| `SendStepDefinition.sendConfig` | `TaskStepDefinition.config` | 统一字段名 | task-real design §1.2 |
| `WaitConditionStepDefinition.waitConfig` | `TaskStepDefinition.config` | 统一字段名 | task-real design §1.2 |
| `DelayStepDefinition.delayConfig` | `TaskStepDefinition.config` | 统一字段名 | task-real design §1.2 |
| `TaskDefinition.schedulingMode` | `TaskDefinition.schedule: ScheduleDriver` | 替代 | task-real design §1.2 |
| `TaskDefinition.triggerSource` | 移除 | 删除 | task-real design §1.2 |
| `TaskDefinition.targetId?` | 移到 `SendStepConfig.targetId` | 下沉 | task-real design §1.2 |
| **不存在** | `TaskDefinition.fieldVariations` | **新增** | task-real design §1.2 |
| **不存在** | `TaskStopCondition.exitCondition` | **新增** | task-real design §1.2 |
| `SendStepConfig.fieldValues` | `SendStepConfig.userFieldValues` | 重命名 | task-real design §1.2 |
| `SendStepConfig.targetId?` | `SendStepConfig.targetId: string` | 可选→必需 | task-real design §1.2 |

## 1. 消费者链集成

### 1.1 TransportEventConsumer 接口

```typescript
// rewrite/src/runtime/consumer-chain.ts（新文件）

export interface TransportEventConsumer {
  readonly id: string;
  consume(events: readonly TransportEventSnapshot[]): Promise<ConsumerResult>;
}

export interface ConsumerResult {
  readonly consumed: readonly TransportEventSnapshot[];
  readonly remaining: readonly TransportEventSnapshot[];
}
```

### 1.2 routingTick 改造方案

**现状**（routing-tick.ts:41-54）：硬编码 `dataEvents → receiveService.drainInputSource()`。

**改动**：在 `RewriteWiredFeatures` 中新增有序消费者列表，routingTick 链式调用。

```typescript
// feature-wiring.ts 改动

export interface RewriteWiredFeatures {
  // ... 现有字段不变
  readonly eventConsumers: readonly TransportEventConsumer[];
}
```

```typescript
// routing-tick.ts 改动——替换 dataEvents → receive 的硬编码

// 改前（line 52-54）:
const source = new ConnectionToReceiveInputSource(dataEvents);
const receiveOutcome = await features.receiveService.drainInputSource(source);

// 改后:
let remaining = [...dataEvents];
for (const consumer of features.eventConsumers) {
  const result = await consumer.consume(remaining);
  remaining = [...result.remaining];
}
// remaining 交给 receive 处理
if (remaining.length > 0) {
  const source = new ConnectionToReceiveInputSource(remaining);
  const receiveOutcome = await features.receiveService.drainInputSource(source);
  // ... 后续 matchInputs/fanOut 逻辑不变
}
```

**改动量**：约 15 行替换 + 2 行接口新增。routingTick 不做任何领域判断。

### 1.3 消费者注册顺序

在 `wireFeatures` 中装配（feature-wiring.ts）：

```typescript
// wireFeatures 末尾新增
const commandIngressConsumer = createCommandIngressConsumer(/* options */);

return {
  // ... 现有字段
  eventConsumers: [commandIngressConsumer],  // command-ingress 先于 receive
};
```

command-ingress 先消费（SCOE 协议事件），remaining 交给 receive。command-ingress 未安装时 `eventConsumers` 为空数组，行为不变。

### 1.4 RoutingTickResult 扩展

```typescript
export interface RoutingTickResult {
  // ... 现有字段不变
  readonly consumerConsumed: number;  // 新增：被 command-ingress 消费的事件数
}
```

## 2. ProtocolAdapter 接口

### 2.1 接口定义

```typescript
// rewrite/src/features/command-ingress/core/protocol-adapter.ts

export interface ProtocolAdapter extends TransportEventConsumer {
  readonly protocolId: string;
}

export interface ParsedCommand {
  readonly commandId: string;
  readonly commandCode: string;
  readonly commandFunction: ScoeCommandFunction;
  readonly rawBytes: readonly number[];
  readonly resolvedParams: Readonly<Record<string, string>>;
  readonly commandConfig: ScoeCommandConfig;
  readonly connectionId: string;
  readonly occurredAt: string;
}
```

### 2.2 ScoeProtocolAdapter

ScoeProtocolAdapter 实现 `ProtocolAdapter` 接口，内部封装 SCOE 协议解析。

```typescript
// rewrite/src/features/command-ingress/adapters/scoe-protocol-adapter.ts

export interface ScoeProtocolAdapterOptions {
  readonly globalConfig: ScoeGlobalConfig;
  readonly commandConfigs: readonly ScoeCommandConfig[];
  readonly stateReader: CommandIngressStateReader;
}

export function createScoeProtocolAdapter(
  options: ScoeProtocolAdapterOptions
): ProtocolAdapter
```

#### 2.2.1 consume 实现流程

```
consume(events):
  consumed = []
  remaining = []
  for each event in events:
    if canHandle(event):
      parsed = parse(event)
      consumed.push(event)
      await dispatch(parsed)  // → handler
    else:
      remaining.push(event)
  return { consumed, remaining }
```

#### 2.2.2 canHandle 逻辑（字节级）

```
canHandle(event):
  1. event.kind === 'data' && event.bytes !== undefined
  2. bytes 长度 >= functionCodeOffset + 4
  3. bytes[functionCodeOffset] === hex(scoeIdentifier)
  4. bytes[functionCodeOffset + 2] === 0xAA && bytes[functionCodeOffset + 3] === 0xAA
  5. 如果 scoeFramesLoaded === false:
     只匹配指令码 01（LOAD_SATELLITE_ID），其他返回 false
```

来源：`scoeFrame.ts:37-99` validateFunctionCode 逻辑。

#### 2.2.3 parse 逻辑（字节级）

```
parse(event):
  1. validateFunctionCode:
     - 提取 scoeIdentifier（第 1 字节）和 commandCode（第 2 字节）
     - 在 commandConfigs 中查找 code 匹配的命令

  2. validateChecksums:
     - 遍历 command.checksums
     - 对每个 enabled 的 checksum:
       sum = 0; for i in offset..offset+length: sum += bytes[i]
       expected = sum % 256
       actual = bytes[checksumOffset]
       验证 expected === actual

  3. extractAndResolveParams:
     - 遍历 command.params
     - hex = bytesToHex(bytes.slice(param.offset, param.offset + param.length))
     - 在 param.options 中找 receiveCode === hex 的选项
     - resolvedParams[param.id] = option.value

  4. return ParsedCommand
```

来源：`scoeFrame.ts:310-407`。

## 3. 命令配置数据模型

### 3.1 ScoeGlobalConfig（协议层）

保留旧配置分离。字段映射自 `src/types/scoe/index.ts:97-130`。

```typescript
// rewrite/src/features/command-ingress/core/types.ts

export interface ScoeGlobalConfig {
  readonly scoeIdentifier: string;
  readonly tcpServerIp: string;
  readonly tcpServerPort: number;
  readonly tcpServerAutoConnect: boolean;
  readonly udpIpAddress: string;
  readonly udpPort: number;
  readonly udpTargetId: string;                    // 确认帧发送目标（connection UDP targetId）
  readonly messageIdentifierOffset: number;
  readonly sourceIdentifierOffset: number;
  readonly destinationIdentifierOffset: number;
  readonly modelIdOffset: number;
  readonly satelliteIdOffset: number;
  readonly functionCodeOffset: number;
  readonly successFrameId?: string;
}
```

**不迁移** `highlightConfigs`（UI 展示配置，不在 core 层）。

### 3.2 ScoeCommandConfig（命令层）

```typescript
export interface ScoeCommandConfig {
  readonly id: string;
  readonly label: string;
  readonly code: string;                           // 指令码 hex
  readonly function: ScoeCommandFunction;
  readonly checksums: readonly ChecksumConfig[];
  readonly params?: readonly ScoeCommandParam[];
  readonly frameMappings?: readonly ScoeCommandFrameMapping[];
  readonly completionConditions?: readonly CompletionConditionConfig[];
  readonly completionTimeout?: number;
  readonly successFrameId?: string;                // 命令级覆盖
  readonly sendInterval?: number;
}

export enum ScoeCommandFunction {
  LOAD_SATELLITE_ID = 'load_satellite_id',
  UNLOAD_SATELLITE_ID = 'unload_satellite_id',
  HEALTH_CHECK = 'health_check',
  LINK_CHECK = 'link_check',
  SEND_FRAME = 'send_frame',
  READ_FILE_AND_SEND = 'read_file_and_send',
}
```

### 3.3 ChecksumConfig

```typescript
export interface ChecksumConfig {
  readonly enabled: boolean;
  readonly offset: number;
  readonly length: number;
  readonly checksumOffset: number;
}
```

### 3.4 ScoeCommandParam（参数定义）

```typescript
export interface ScoeCommandParam {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly offset: number;
  readonly length: number;
  readonly targetInstanceId?: string;
  readonly targetFieldId?: string;
  readonly options: readonly ScoeParamOption[];
}

export interface ScoeParamOption {
  readonly label: string;
  readonly value: string;
  readonly receiveCode: string;
}
```

### 3.5 ScoeCommandFrameMapping（帧映射层）

替代旧系统完整内嵌的 `SendFrameInstance`，改为引用。

```typescript
export interface ScoeCommandFrameMapping {
  readonly frameId: string;                        // 引用 frame feature 的帧定义
  readonly instanceId: string;                     // 用于 param.targetInstanceId 关联
  readonly label?: string;                         // 帧映射可读名称（迁移自旧 SendFrameInstance.label）
  readonly description?: string;                   // 备注说明（迁移自旧 SendFrameInstance.description）
  readonly targetId: string;                       // 发送目标（UDP targetId）
  readonly fieldMappings: readonly FieldMapping[];
}

export interface FieldMapping {
  readonly fieldId: string;
  readonly source: 'fixed' | 'param';
  readonly fixedValue?: string | number;
  readonly paramId?: string;                       // 从 resolvedParams 取值
}
```

**不自建帧列表**：只存引用关系（frameId + fieldMappings），帧定义 truth 在 frame feature。

### 3.6 CompletionConditionConfig（完成条件）

```typescript
export interface CompletionConditionConfig {
  readonly id: string;
  readonly label: string;
  readonly sourceFrameId: string;
  readonly sourceFieldId: string;
  readonly useParam: boolean;
  readonly targetParamId?: string;
  readonly targetFixedValue?: string;
  readonly operator?: ComparisonOperator;           // 从 shared 引用
  readonly options?: readonly CompletionConditionOption[];
}

export interface CompletionConditionOption {
  readonly operator: ComparisonOperator;
  readonly matchValue: string;
}
```

### 3.7 卫星配置

LOAD 命令加载的卫星配置，运行时持有。

```typescript
export interface SatelliteConfig {
  readonly satelliteId: string;
  readonly messageIdentifier: string;
  readonly sourceIdentifier: string;
  readonly destinationIdentifier: string;
  readonly modelId: string;
  readonly commandConfigs: readonly ScoeCommandConfig[];
}
```

旧系统中卫星配置通过 `scoeStore.satelliteConfigs` 持有（`loadSatelliteId.ts:35` 查找）。新系统中作为 command-ingress 领域数据持有，不通过 store 暴露。

## 4. Handler 分发

### 4.1 签名

```typescript
// rewrite/src/features/command-ingress/core/handler.ts

export interface CommandContext {
  readonly taskService: TaskService;
  readonly sendService: SendService;               // 确认帧发送（§7.2）
  readonly frameReader: FrameAssetReader;
  readonly connectionService: ConnectionService;
  readonly connectionSnapshot: () => ConnectionStateSnapshot;
  readonly receiveSnapshot: () => unknown;         // LINK_CHECK 读 receive selector
  readonly platformFileReader: (path: string) => Promise<string[]>;
  readonly stateReader: CommandIngressStateReader;
  readonly stateWriter: CommandIngressStateWriter;
}

export type CommandHandler = (
  command: ParsedCommand,
  ctx: CommandContext
) => Promise<CommandResult>;

export interface CommandResult {
  readonly success: boolean;
  readonly error?: string;
  readonly taskId?: string;
}
```

### 4.2 Handler 注册

```typescript
const handlerMap = new Map<ScoeCommandFunction, CommandHandler>([
  [ScoeCommandFunction.LOAD_SATELLITE_ID, handleLoadSatelliteId],
  [ScoeCommandFunction.UNLOAD_SATELLITE_ID, handleUnloadSatelliteId],
  [ScoeCommandFunction.HEALTH_CHECK, handleHealthCheck],
  [ScoeCommandFunction.LINK_CHECK, handleLinkCheck],
  [ScoeCommandFunction.SEND_FRAME, handleSendFrame],
  [ScoeCommandFunction.READ_FILE_AND_SEND, handleReadFileAndSend],
]);
```

### 4.3 6 种 Handler 实现

#### 4.3.1 handleLoadSatelliteId

前置条件：`stateReader.loadedSatelliteId === ''`（未加载才能 LOAD）。

```
handleLoadSatelliteId(command, ctx):
  1. 卫星 ID 从 command.rawBytes[satelliteIdOffset..] 提取
  2. 在 satelliteConfigs 中查找匹配配置
  3. 验证配置完整性（messageIdentifier/sourceIdentifier/destinationIdentifier/modelId/satelliteId）
  4. ctx.stateWriter.setLoaded(satelliteId, commandConfigs)
  5. ctx.stateWriter.updateStatus({ scoeFramesLoaded: true, loadedSatelliteId, satelliteIdRuntimeSeconds: 0 })
  6. return { success: true }
```

来源：`loadSatelliteId.ts:14-95`。

#### 4.3.2 handleUnloadSatelliteId

前置条件：`stateReader.scoeFramesLoaded === true`。

```
handleUnloadSatelliteId(command, ctx):
  1. ctx.stateWriter.resetRuntimeState()
     - scoeFramesLoaded = false
     - loadedSatelliteId = ''
     - satelliteIdRuntimeSeconds = 0
     - commandReceiveCount = 0
     - commandSuccessCount = 0
     - commandErrorCount = 0
     - healthStatus = 'unknown'
     - linkTestResult = 'unknown'
     - receiveCommandSuccess = false
  2. return { success: true }
```

来源：旧系统 UNLOAD 清除全部运行时状态。

#### 4.3.3 handleHealthCheck

```
handleHealthCheck(command, ctx):
  1. snapshot = ctx.connectionSnapshot()
  2. return { success: true }
  // HEALTH_CHECK 只读连接状态，旧系统返回健康状态快照
  // 实际响应通过 UDP 成功帧发送，不在 handler 返回值里
```

#### 4.3.4 handleLinkCheck

```
handleLinkCheck(command, ctx):
  1. snapshot = ctx.receiveSnapshot()
  2. return { success: true }
  // LINK_CHECK 只读接收同步状态，实际响应通过 UDP 成功帧
```

#### 4.3.5 handleSendFrame

前置条件：`stateReader.scoeFramesLoaded === true`。

```
handleSendFrame(command, ctx):
  1. commandConfig = command.commandConfig
  2. frameMappings = commandConfig.frameMappings
  3. taskDef = buildSendFrameTask(command, ctx)
  4. instance = ctx.taskService.createTask(taskDef)
  5. ctx.taskService.startTask(instance.instanceId)
  6. 注册 onSettled 回调：成功 → sendAckFrame(command, ctx)
  7. ctx.stateWriter.incrementReceiveCount()
  8. return { success: true, taskId: instance.instanceId }
```

详细 TaskDefinition 构造见 §5。

#### 4.3.6 handleReadFileAndSend

前置条件：`stateReader.scoeFramesLoaded === true`。

```
handleReadFileAndSend(command, ctx):
  1. 读取文件内容（通过 ctx.platformFileReader）
  2. taskDef = buildReadFileAndSendTask(command, ctx, fileLines)
  3. instance = ctx.taskService.createTask(taskDef)
  4. ctx.taskService.startTask(instance.instanceId)
  5. 注册 onSettled 回调：成功 → sendAckFrame(command, ctx)
  6. ctx.stateWriter.incrementReceiveCount()
  7. return { success: true, taskId: instance.instanceId }
```

## 5. TaskDefinition 翻译规则

### 5.1 SEND_FRAME → TaskDefinition

使用 `schedule: { kind: 'immediate' }`（顺序执行所有步骤）。

```typescript
function buildSendFrameTask(
  command: ParsedCommand,
  ctx: CommandContext,
): TaskDefinition {
  const config = command.commandConfig;
  const steps: TaskStepDefinition[] = [];

  // 每个帧映射 → 一个 send step
  for (const mapping of config.frameMappings ?? []) {
    const userFieldValues: Record<string, string | number | boolean> = {};
    for (const fm of mapping.fieldMappings) {
      if (fm.source === 'param' && fm.paramId) {
        userFieldValues[fm.fieldId] = command.resolvedParams[fm.paramId] ?? '';
      } else if (fm.fixedValue !== undefined) {
        userFieldValues[fm.fieldId] = fm.fixedValue;
      }
    }

    steps.push({
      id: `send-${mapping.instanceId}`,
      kind: 'send',
      config: {
        frameId: mapping.frameId,
        targetId: mapping.targetId,
        userFieldValues,
      },
    });

    // 发送间隔（帧间）→ intervalAfterMs
    if (config.sendInterval && config.sendInterval > 0) {
      steps.push({
        id: `delay-after-${mapping.instanceId}`,
        kind: 'delay',
        config: { durationMs: config.sendInterval },
      });
    }
  }

  // 完成条件 → wait-condition step（支持多条件数组）
  const waitConditions = buildWaitConditions(command, config.completionConditions);
  if (waitConditions.length > 0) {
    steps.push({
      id: 'wait-completion',
      kind: 'wait-condition',
      config: {
        conditions: waitConditions,
        timeoutMs: config.completionTimeout ?? 5000,
        onTimeout: 'fail',
      },
    });
  }

  return {
    id: `scoe-send-${command.commandId}`,
    name: `SCOE SEND_FRAME: ${config.label}`,
    schedule: { kind: 'immediate' },
    steps,
    errorPolicy: { onFailure: 'stop' },
  };
}
```

### 5.2 READ_FILE_AND_SEND → TaskDefinition

task-real design 已确认引入 `FieldVariation`（task-real design §1.1），方案 A 可行。

```typescript
function buildReadFileAndSendTask(
  command: ParsedCommand,
  ctx: CommandContext,
  fileLines: readonly string[],
): TaskDefinition {
  const config = command.commandConfig;
  const mapping = config.frameMappings?.[0];  // READ_FILE_AND_SEND 通常只有一个帧映射
  if (!mapping) throw new Error('No frame mapping for READ_FILE_AND_SEND');

  // 找到文件参数对应的 fieldId
  const fileParam = config.params?.find(p => p.value?.includes('.txt'));
  const fileFieldMapping = mapping.fieldMappings.find(
    fm => fm.source === 'param' && fm.paramId === fileParam?.id
  );

  const waitConditions = buildWaitConditions(command, config.completionConditions);
  const steps: TaskStepDefinition[] = [];

  steps.push({
    id: 'send-rfs',
    kind: 'send',
    config: {
      frameId: mapping.frameId,
      targetId: mapping.targetId,
      userFieldValues: {},  // 由 fieldVariations 按轮次覆盖
    },
  });

  if (waitConditions.length > 0) {
    steps.push({
      id: 'wait-rfs',
      kind: 'wait-condition',
      config: {
        conditions: waitConditions,
        timeoutMs: config.completionTimeout ?? 5000,
        onTimeout: 'fail',
      },
    });
  }

  return {
    id: `scoe-rfs-${command.commandId}`,
    name: `SCOE READ_FILE_AND_SEND: ${config.label}`,
    schedule: { kind: 'timer', intervalMs: config.sendInterval ?? 1000 },
    steps,
    fieldVariations: fileFieldMapping
      ? [{ fieldId: fileFieldMapping.fieldId, values: fileLines }]
      : [],
    stopCondition: { maxIterations: fileLines.length },
    errorPolicy: { onFailure: 'stop' },
  };
}
```

来源：task-real design §1.1 FieldVariation + §1.2 TaskDefinition.fieldVariations。旧系统 `readFileAndSend.ts` 的 FieldVariation 机制被 task-real 原生支持。

### 5.3 完成条件 → ConditionTerm[]

task-real design 将 `WaitConditionStepConfig.condition` 改为 `WaitConditionConfig.conditions` 数组，支持多条件 AND/OR 组合。所有完成条件可合并为单个 `conditions` 数组。

```typescript
function buildWaitConditions(
  command: ParsedCommand,
  condConfigs?: readonly CompletionConditionConfig[],
): ConditionTerm[] {
  if (!condConfigs || condConfigs.length === 0) return [];

  return condConfigs.map((condConfig) => {
    if (condConfig.useParam && condConfig.targetParamId) {
      // 参数化模式：从 resolvedParams 取值 → 查 param.options 索引 → 同索引取 condition.options
      const paramValue = command.resolvedParams[condConfig.targetParamId];
      const param = command.commandConfig.params?.find(p => p.id === condConfig.targetParamId);
      const optionIndex = param?.options.findIndex(o => o.value === paramValue) ?? -1;
      const condOption = condConfig.options?.[optionIndex];

      return {
        frameId: condConfig.sourceFrameId,
        fieldId: condConfig.sourceFieldId,
        operator: condOption?.operator ?? 'eq' as ComparisonOperator,
        threshold: condOption?.matchValue ?? '',
      };
    } else {
      // 固定值模式
      return {
        frameId: condConfig.sourceFrameId,
        fieldId: condConfig.sourceFieldId,
        operator: condConfig.operator ?? 'eq' as ComparisonOperator,
        threshold: condConfig.targetFixedValue ?? '',
      };
    }
  });
}
```

来源：`scoeFrame.ts:416-491` checkCompletionConditions 逻辑。task-real design §1.1 ConditionTerm 支持 `logicOperator`（默认 `'and'`），与旧系统"所有条件都满足"语义一致，无需显式设置。

## 6. 参数 resolve 流程

在 `ScoeProtocolAdapter.parse()` 内完成，resolve 为 literal 值后传入 handler。

```
extractAndResolveParams(data, params):
  result = {}
  for param in params:
    bytes = data[param.offset ... param.offset + param.length]
    hex = bytesToUpperCaseHex(bytes)

    matched = param.options.find(opt =>
      normalize(opt.receiveCode) === normalize(hex)
    )
    // normalize: 移除 0x 前缀、大写、左补零到 param.length*2 位

    result[param.id] = matched?.value ?? hex  // 无匹配时保留原始 hex
  return result
```

来源：`scoeFrame.ts:366-407`。

**参数到帧字段的映射**：通过 `ScoeCommandFrameMapping.fieldMappings` 中的 `source: 'param'` + `paramId` 关联。handler 构造 TaskDefinition 时将 `resolvedParams[paramId]` 填入 `fieldValues[fieldId]`。

旧系统通过 `param.targetInstanceId + param.targetFieldId` 指向帧实例字段。新系统中 `targetInstanceId` 对应 `ScoeCommandFrameMapping.instanceId`，`targetFieldId` 对应 `FieldMapping.fieldId`。迁移时直接映射。

## 7. 确认帧发送

### 7.1 策略

- 成功：adapter 在 `taskService.onSettled(instanceId)` resolve 后，通过 `connectionService.write()` 发送 `successFrameId` 帧（UDP）
- 失败/超时：只更新领域状态（errorCount++、lastErrorReason），不发任何回应帧

### 7.2 发送流程

**选定路径**：通过 `sendService.execute()` 发送确认帧。sendService 已有 frame→bytes 序列化 + connection write 能力，command-ingress 不需要自行序列化帧。

```typescript
async function sendAckFrame(
  command: ParsedCommand,
  ctx: CommandContext,
): Promise<void> {
  const successFrameId = command.commandConfig.successFrameId
    ?? ctx.stateReader.globalConfig().successFrameId;
  if (!successFrameId) return;

  const frame = ctx.frameReader.getFrame(successFrameId);
  if (!frame) return;

  // 通过 sendService 发送：序列化帧 + 写入 connection（复用 send service 的 frameToBuffer）
  await ctx.sendService.execute({
    frameId: successFrameId,
    targetId: command.commandConfig.frameMappings?.[0]?.targetId  // UDP targetId
              ?? ctx.stateReader.globalConfig().udpTargetId,
    userFieldValues: {},
  });
}
```

**前提**：CommandContext 需新增 `sendService: SendService` 字段。sendService.execute() 的 `SendRequest` 接口已在 send feature 中定义，接受 `{ frameId, targetId, fieldValues }`。

**GAP 关闭**：G3 已解决，确认帧发送路径锁定为 sendService。

### 7.3 onSettled 注册方式

```typescript
// 在 handler 中
ctx.taskService.startTask(instance.instanceId);

// fire-and-forget：监听 settled 后发确认帧
ctx.taskService.onSettled(instance.instanceId).then(() => {
  const inst = ctx.taskService.getInstance(instance.instanceId);
  if (inst?.lifecycle === 'completed') {
    sendAckFrame(command, ctx);
    ctx.stateWriter.incrementSuccessCount();
  } else {
    ctx.stateWriter.incrementErrorCount(
      inst?.error ?? 'task failed'
    );
  }
});
```

**注意**：`TaskService.onSettled()` 返回 `Promise<void>`，resolve 时 task 已进入 terminal 状态。通过 `getInstance()` 检查 `lifecycle` 判断成功/失败。来源：task-service.ts:235-242。

## 8. 领域状态

### 8.1 CommandIngressState

```typescript
// rewrite/src/features/command-ingress/core/state.ts

export interface CommandIngressState {
  // 统计计数（运行时内存，不持久化）
  readonly commandReceiveCount: number;
  readonly commandSuccessCount: number;
  readonly commandErrorCount: number;

  // 运行时状态
  readonly loadedSatelliteId: string;
  readonly scoeFramesLoaded: boolean;
  readonly healthStatus: 'unknown' | 'healthy' | 'error';
  readonly linkTestResult: 'unknown' | 'pass' | 'fail';
  readonly lastCommandCode: string;
  readonly receiveCommandSuccess: boolean;

  // 计时器
  readonly runtimeSeconds: number;
  readonly satelliteIdRuntimeSeconds: number;
  readonly lastErrorReason: string;

  // 配置
  readonly globalConfig: ScoeGlobalConfig;
  readonly activeCommandConfigs: readonly ScoeCommandConfig[];
}
```

来源：`src/types/scoe/index.ts:57-82` ScoeStatus 的 12 个字段。

### 8.2 两阶段状态机

**阶段 1：scoeFramesLoaded = false**

- ScoeProtocolAdapter.canHandle() 只匹配指令码 01（LOAD_SATELLITE_ID）
- 其他所有 SCOE 事件返回 `canHandle: false`，流入 receive

**阶段 2：scoeFramesLoaded = true**

- LOAD 成功后切换到阶段 2
- 所有 6 种命令可识别和处理
- handler 加前置条件检查（UNLOAD 将状态切回阶段 1）

来源：`scoeFrame.ts:191-213`。

### 8.3 每秒状态机轮询

```typescript
// rewrite/src/features/command-ingress/services/status-timer.ts

function startStatusTimer(
  stateWriter: CommandIngressStateWriter,
  intervalMs: number = 1000,
): () => void {
  return setInterval(() => {
    stateWriter.tickSecond();
  }, intervalMs);
}

// CommandIngressStateWriter.tickSecond():
//   runtimeSeconds++
//   receiveCommandSuccess = false
//   if (!scoeFramesLoaded):
//     清空所有运行时统计（receiveCount/successCount/errorCount/healthStatus/linkTestResult）
//   else:
//     satelliteIdRuntimeSeconds++
```

**有意不迁移旧行为**：旧 `scoeStore.ts:293-311` statusUpdate 还包含 `checkSatelliteLoad()` 和 `sendScoeFrames()` 两步。分析：
- `checkSatelliteLoad()`：旧系统在 store 层做卫星配置完整性检查，新系统中 LOAD handler 已内含验证逻辑（§4.3.1 步骤 3），无需在定时器重复检查。
- `sendScoeFrames()`：旧系统在定时器中触发帧发送，新系统中帧发送由 handler 通过 TaskDefinition 驱动，不依赖定时器触发。

来源：`scoeStore.ts:293-311` statusUpdate 定时器。

### 8.4 Selector 清单

```typescript
// rewrite/src/features/command-ingress/selectors/

export function selectCommandIngressSnapshot(state: CommandIngressState): CommandIngressSnapshot;
export function selectScoeStatistics(state: CommandIngressState): ScoeStatisticsSnapshot;
export function selectScoeRuntimeStatus(state: CommandIngressState): ScoeRuntimeStatus;
export function selectScoeFramesLoaded(state: CommandIngressState): boolean;
export function selectLoadedSatelliteId(state: CommandIngressState): string;
```

所有 selector 返回 `readonly` 深拷贝快照，满足 Selector 不可变约束（CLAUDE.md）。

### 8.5 State Reader/Writer 分离

```typescript
export interface CommandIngressStateReader {
  getSnapshot(): CommandIngressState;
  globalConfig(): ScoeGlobalConfig;
  readonly loadedSatelliteId: string;
  readonly scoeFramesLoaded: boolean;
}

export interface CommandIngressStateWriter {
  setLoaded(satelliteId: string, configs: readonly ScoeCommandConfig[]): void;
  resetRuntimeState(): void;
  updateStatus(patch: Partial<CommandIngressState>): void;
  incrementReceiveCount(): void;
  incrementSuccessCount(): void;
  incrementErrorCount(reason: string): void;
  tickSecond(): void;
}
```

## 9. 迁移计划

### 9.1 字段映射表：ScoeGlobalConfig（14 字段）

| 旧字段 | 旧类型 | 新字段 | 新类型 | 备注 |
|---|---|---|---|---|
| scoeIdentifier | string | scoeIdentifier | string | 直迁 |
| tcpServerIp | string | tcpServerIp | string | 直迁 |
| tcpServerPort | number | tcpServerPort | number | 直迁 |
| tcpServerAutoConnect | boolean | tcpServerAutoConnect | boolean | 直迁 |
| udpIpAddress | string | udpIpAddress | string | 直迁 |
| udpPort | number | udpPort | number | 直迁 |
| — | — | udpTargetId | string | **新增**：旧系统硬编码 `'network:scoe-udp:scoe-udp-remote'`，新系统改为配置 |
| messageIdentifierOffset | number | messageIdentifierOffset | number | 直迁 |
| sourceIdentifierOffset | number | sourceIdentifierOffset | number | 直迁 |
| destinationIdentifierOffset | number | destinationIdentifierOffset | number | 直迁 |
| modelIdOffset | number | modelIdOffset | number | 直迁 |
| satelliteIdOffset | number | satelliteIdOffset | number | 直迁 |
| functionCodeOffset | number | functionCodeOffset | number | 直迁 |
| successFrameId? | string | successFrameId? | string | 直迁 |
| highlightConfigs? | HighlightConfigs | — | — | 不迁移，UI 层 |

### 9.2 字段映射表：ScoeReceiveCommand（11 字段）

| 旧字段 | 旧类型 | 新字段 | 新类型 | 备注 |
|---|---|---|---|---|
| id | string | id | string | 直迁 |
| label | string | label | string | 直迁 |
| code | string | code | string | 直迁 |
| sendInterval? | number | sendInterval? | number | 直迁 |
| params? | ScoeCommandParams[] | params? | ScoeCommandParam[] | 字段微调（见 9.3） |
| function | ScoeCommandFunction | function | ScoeCommandFunction | 枚举值不变 |
| checksums | ChecksumConfig[] | checksums | ChecksumConfig[] | 直迁 |
| frameInstances? | SendFrameInstance[] | frameMappings? | ScoeCommandFrameMapping[] | **结构性变化**（见 9.4） |
| completionConditions? | CompletionCondition[] | completionConditions? | CompletionConditionConfig[] | operator 类型变化（见 9.5） |
| completionTimeout? | number | completionTimeout? | number | 直迁 |
| successFrameId? | string | successFrameId? | string | 直迁 |

### 9.3 ScoeCommandParams → ScoeCommandParam

| 旧字段 | 新字段 | 备注 |
|---|---|---|
| id | id | 直迁 |
| label | label | 直迁 |
| value | value | 直迁 |
| type | type | 直迁 |
| offset | offset | 直迁 |
| length | length | 直迁 |
| targetInstanceId | targetInstanceId | 语义变化：从帧实例 ID 变为 ScoeCommandFrameMapping.instanceId |
| targetFieldId | targetFieldId | 语义变化：从帧字段 ID 变为 FieldMapping.fieldId |
| options | options | 内部结构不变（label/value/receiveCode） |

### 9.4 SendFrameInstance → ScoeCommandFrameMapping

旧系统完整内嵌 SendFrameInstance（含完整字段数组、expressionConfig、strategyConfig）。新系统改为轻量引用。

迁移步骤：
1. 从旧 `frameInstances[].frameId` 提取 `frameId`
2. 从旧 `frameInstances[].id` 生成 `instanceId`（用于 param.targetInstanceId 关联）
3. 从旧 `frameInstances[].targetId` 或默认 `'network:scoe-udp:scoe-udp-remote'` 生成 `targetId`
4. 从旧 `frameInstances[].fields[]` 中提取有 `targetInstanceId` 匹配的字段 → 生成 `fieldMappings`
5. 从旧 `frameInstances[].fields[].value` 提取固定值 → `source: 'fixed', fixedValue`
6. 从旧 `frameInstances[].fields[]` 中被 param 引用的字段 → `source: 'param', paramId`

**不迁移**：
- `label`：迁移到 `ScoeCommandFrameMapping.label?`
- `description`：迁移到 `ScoeCommandFrameMapping.description?`
- `expressionConfig`：旧表达式引擎 store 依赖，新系统用 shared/ 表达式引擎替代，但 SCOE 发帧场景不需要表达式
- `strategyConfig`：发送策略由 TaskDefinition.schedulingMode 和 step 定义替代
- `sendCount / lastSentAt`：运行时统计，不持久化
- `isFavorite / isSCOEFrame / paramCount`：UI 辅助字段
- `createdAt / updatedAt`：运行时元数据，不持久化

**SendInstanceField 大部分字段不需要迁移到 ScoeCommandFrameMapping**：`label`、`dataType`、`inputType`、`factor`、`length`、`bigEndian`、`isASCII`、`validOption`、`options`、`description`、`configurable`、`dataParticipationType` 属于帧定义元数据，在新系统中由 frame feature 持有。command-ingress 只存 `fieldId` + 映射关系（fixedValue 或 paramId），帧元数据通过 `frameId` 引用从 frame feature 获取。迁移时 `fields[].id` → `FieldMapping.fieldId`。

### 9.5 CompletionCondition → CompletionConditionConfig

| 旧字段 | 新字段 | 备注 |
|---|---|---|
| id | id | 直迁 |
| label | label | 直迁 |
| sourceFrameId | sourceFrameId | 直迁 |
| sourceFieldId | sourceFieldId | 直迁 |
| useParam | useParam | 直迁 |
| targetParamId? | targetParamId? | 直迁 |
| targetFixedValue? | targetFixedValue? | 直迁 |
| operator? | operator? | 类型从旧 `MatchOperator`（string 枚举如 `'equal'`）映射到 `ComparisonOperator`（`'eq'`） |
| options? | options? | 内部 operator 同理映射 |

**operator 映射**：

| 旧 MatchOperator | 新 ComparisonOperator |
|---|---|
| `'equal'` | `'eq'` |
| `'not_equal'` | `'neq'` |
| `'greater_than'` | `'gt'` |
| `'less_than'` | `'lt'` |
| `'greater_equal'` | `'gte'` |
| `'less_equal'` | `'lte'` |
| `'contains'` | `'contains'` |

### 9.6 迁移脚本

编写一次性 TypeScript 脚本，输入：
- `scoeReceiveCommands.json` → 输出 `scoe-command-configs.json`（ScoeCommandConfig[]）
- `scoeGlobalConfig` 来源（旧 scoeStore 或独立 JSON）→ 输出 `scoe-global-config.json`

脚本放在 `rewrite/scripts/migrate-scoe-config.ts`，不在 feature 目录内。

## 10. 目录结构

```
rewrite/src/features/command-ingress/
  index.ts                          // public API 导出
  core/
    types.ts                        // 所有领域类型定义
    state.ts                        // CommandIngressState + state container
    handler.ts                      // CommandHandler 类型 + handlerMap
    protocol-adapter.ts             // ProtocolAdapter 接口
  adapters/
    scoe-protocol-adapter.ts        // SCOE 协议解析实现
  services/
    command-ingress-service.ts      // 顶层服务：assemble adapter + handlers + timer
    status-timer.ts                 // 每秒状态机轮询
  selectors/
    index.ts                        // 所有 selector
    command-ingress-selectors.ts
  __tests__/
    scoe-protocol-adapter.spec.ts   // 协议解析测试（fixture 驱动）
    handler.spec.ts                 // 6 种 handler 测试
    command-ingress-service.spec.ts // 集成测试
```

core/ 零 Vue/Pinia/Electron 依赖。adapters/ 和 services/ 依赖 task/connection/frame 的接口。

## 11. RewriteWiredFeatures 扩展

```typescript
// feature-wiring.ts 新增

import { createCommandIngressConsumer } from '@/features/command-ingress';

// wireFeatures 内新增（L4 层，依赖 L0-L3）
const commandIngressConsumer = createCommandIngressConsumer({
  taskService,
  sendService,
  frameReader,
  connectionService,
  connectionSnapshot: () => connectionService.getSnapshot(),
  // receiveSnapshot 通过 selector 传入
  // platformFileReader 通过 platform facade 传入
});

return {
  // ... 现有字段
  eventConsumers: [commandIngressConsumer],
};
```

## 12. 连接断开清理

brainstorm 决策 6：监听 connection disconnect event，取消与该连接关联的正在执行的 task。

### 12.1 监听方式

在 `command-ingress-service` 初始化时，通过 connection event 轮询机制检测断开。由于 connection 只有拉取 API（无订阅），在 routingTick 的消费者链流程中检测：

```typescript
// command-ingress consumer.consume() 内部
// 每次被调用时检查 connection 状态变化
// 记录已知的 activeConnectionIds
// 如果某个 connectionId 不再出现在 events 中且不在 connectionFacts 中，视为断开
```

或者通过 `connectionService.listConnectionFacts()` 在每次 tick 时检查已连接的 target 列表变化。

### 12.2 取消关联 task

```typescript
// 当检测到 TCP server 客户端断开时
// 查找该 connectionId 关联的正在运行的 task instances
// 调用 taskService.stopTask(instanceId) 取消
// 清理内部 tracking map（connectionId → taskInstanceIds）
```

### 12.3 Tracking Map

command-ingress 维护 `Map<connectionId, Set<taskInstanceId>>` 记录哪些 task 是由哪个连接的命令创建的。handler 创建 task 时记录关联，onSettled resolve 后清理。

来源：brainstorm 决策 6 + R3 反向验证（连接断开清理，中等严重性）。

## 13. checklist

基于 brainstorm 19 项输入清单，逐项覆盖。

**前置条件**：C13-C18 依赖 task-real 实施完成（ScheduleDriver、FieldVariation、ConditionTerm、统一 config 字段名）。P1-P2 中不依赖 task 类型的项可并行推进。

### P1：core 接口

- [ ] C1: `TransportEventConsumer` 接口定义 + routingTick 链式调用改造
- [ ] C2: `ProtocolAdapter` 接口定义（`canHandle` + `parse` + `consume`）
- [ ] C3: `CommandHandler` 签名 + `CommandContext` 依赖注入字段
- [ ] C4: `CommandIngressState` 类型定义 + state container
- [ ] C5: `CommandIngressStateReader` / `CommandIngressStateWriter` 接口
- [ ] C6: 4 个 selector 实现

### P2：SCOE adapter

- [ ] C7: `ScoeProtocolAdapter` 实现（`canHandle` + `parse` 完整字节级逻辑）
- [ ] C8: 功能码验证（scoeIdentifier + commandCode + 0xAA0xAA）
- [ ] C9: 校验和验证（sum % 256）
- [ ] C10: 参数提取和 resolve（offset/length → hex → receiveCode 匹配）
- [ ] C11: 两阶段状态机（scoeFramesLoaded 门控）
- [ ] C12: 6 种 handler 实现
- [ ] C13: SEND_FRAME → TaskDefinition 翻译（sequence 模式 + send steps + wait steps）
- [ ] C14: READ_FILE_AND_SEND → TaskDefinition 翻译（取决于 task-real fieldVariations 决策，见 §5.2）
- [ ] C15: 完成条件参数化索引对齐（params.options[i] ↔ conditions.options[i]）
- [ ] C16: 确认帧发送（onSettled 后通过 sendService.execute 发 UDP 帧）
- [ ] C17: 每秒状态机轮询（runtimeSeconds、统计重置、receiveCommandSuccess 重置）
- [ ] C18: 连接断开清理（tracking map + stopTask 关联 task）

### P3：集成

- [ ] C19: `RewriteWiredFeatures` 扩展 + `wireFeatures` 装配
- [ ] C20: command-ingress public API（index.ts 导出清单）
- [ ] C21: FrameAssetReader.getFrame() 调用验证
- [ ] C22: sendService.execute() 确认帧发送验证

### P4：迁移

- [ ] C23: 迁移脚本（scoeReceiveCommands.json → scoe-command-configs.json）
- [ ] C24: operator 枚举映射（旧 MatchOperator → ComparisonOperator）
- [ ] C25: frameInstances → ScoeCommandFrameMapping 字段映射（含 label/description 迁移）

### P5：northbound stub

- [ ] C26: NorthboundProtocolAdapter stub（canHandle 返回 false，接口占位）

## GAP 和待确认项

| # | 项目 | 状态 | 影响 |
|---|---|---|---|
| G1 | TaskDefinition 无 fieldVariations | **已解决**：task-real design §1.2 已确认引入 FieldVariation（§5.2 方案 A 锁定） | READ_FILE_AND_SEND 可用 fieldVariations |
| G2 | WaitConditionStepConfig 单条件（非数组） | **已解决**：task-real design §1.2 改为 `conditions: ConditionTerm[]`（§5.3 已适配） | 多条件合并为单个 wait step |
| G3 | sendService UDP 发送方式 | **已解决**：通过 sendService.execute() 发送确认帧（§7.2） | 确认帧发送路径已锁定 |
| G4 | TimerService 位置 | 与 task-real 共用，待确认 | 每秒状态机轮询实现方式 |
| G5 | 卫星配置持久化 | 待 storage feature 确定接入时机 | 当前先内存持有 |
| G6 | satelliteConfigs 来源 | 旧系统从 store 查找，新系统需确定数据源 | LOAD handler 实现 |
