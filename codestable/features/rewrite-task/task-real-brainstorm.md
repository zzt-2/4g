# task-real brainstorm

> 日期：2026-05-09
> 状态：结论已锁定，ready for cs-feat-design
> Lane：Lane B（单 feature design，不拆 roadmap）

## 结论

task-real 是一个**统一执行引擎**，接收 TaskDefinition（step 序列 + 调度配置），按策略执行，产出 TaskInstanceCompletion 事件。

核心设计选择：

1. **ScheduleDriver × stopCondition × step.repeat 三层控制**，替代旧三种模式枚举
2. **send/wait-condition/delay 三种 step**，SCOE 指令用 step 序列组合，无专属 step type
3. **ConditionTerm + logicOperator** 支持单层 AND/OR，复用 shared/condition-operators
4. **fieldVariations 自动决定迭代次数**
5. **单帧发送走同引擎**，仅 UI 层简化

## 事实与证据

### 旧系统三种模式

来源：`src/stores/frames/sendTasksStore.ts`、`useSendTaskExecutor.ts`、`useSendTaskTriggerListener.ts`

| 模式 | 旧配置 | 旧行为 |
|------|--------|--------|
| 顺序发送 | `FrameInstanceInTask[]` | 单次，按序发完 |
| 定时循环 | `sendInterval + repeatCount + isInfinite` | 固定次数或无限 |
| 条件触发 | `triggerFrameId + conditions[] + responseDelay` | 监听接收帧，条件满足后发送 |

旧系统条件组合：`TriggerCondition.logicOperator: 'and' | 'or'`（`sendInstances.ts:123`、`useSendTaskTriggerListener.ts:115-155`）。所有 SCOE 完成条件检查为 AND 遍历。

### 旧 SCOE 参数关联机制

来源：`scoeFrame.ts:366-491`、`sendFrame.ts:36-46`、`receiveCommand.ts:70-80`

流程：接收指令帧 → `extractAndResolveParams()` 解析参数 → 参数值通过 `targetFieldId` 赋给发送帧字段 → 完成条件通过 `targetParamId` + 索引匹配关联参数选项。

**关键结论**：参数值在 SCOE adapter 翻译时已知，可直接 resolve 为 literal 值填入 TaskDefinition。task 引擎不需要理解参数关联。

### 旧文件发送模式

来源：`readFileAndSend.ts:45-135`

流程：参数值含 `.txt` → 读文件按行分割 → 逗号分隔值 split → 构造 `FieldVariation[]` → 创建定时任务 `repeatCount = values.length`。

### 已有 task 骨架状态

`rewrite/src/features/task/` 下已有完整实现骨架：类型系统、服务合约（7 方法）、三层调度循环、多态 step 执行、错误策略引擎、条件匹配 + O(1) 索引、adapter ports、state + 6 个 selector。

**主要变更**：类型重组（TaskSchedulingMode → ScheduleDriver + stopCondition），ConditionRegistry 升级（单条件 → AND/OR），新增 step.repeat 能力。估计涉及 6-8 个文件、300+ 行已有代码。

## 设计决策

### 决策 1：去掉 IterationControl，用 stopCondition + step.repeat 替代

**理由**：IterationControl.fixed(N) 与 stopCondition.maxIterations 语义完全重复。去掉 IterationControl，迭代行为由三个正交机制表达：

- ScheduleDriver：每轮 step 序列如何触发（immediate / timer / event）
- stopCondition：整个任务何时停止（maxIterations / maxDurationMs / exitCondition）
- step.repeat：单个 send step 的重复发送（until / maxCount）

**旧模式映射**：

| 旧模式 | 新表达 |
|--------|--------|
| 顺序发送 | `schedule: immediate`，无 stopCondition，无 repeat |
| 定时固定 N 次 | `schedule: timer(intervalMs)` + `stopCondition: { maxIterations: N }` |
| 定时无限 | `schedule: timer(intervalMs)`，无 stopCondition |
| 条件触发 | `schedule: event(conditions)` |
| 一直发 A 直到 X，再发 B | `schedule: immediate`，step A `repeat.until: X`，step B 无 repeat |
| 定时发送整个序列直到 Y | `schedule: timer` + `stopCondition: { exitCondition: Y }` |
| 文件逐行发送 | `fieldVariations` 自动 maxIterations + `schedule: timer` |
| 单帧发送 | `schedule: immediate`，一个 send step，无 repeat |

### 决策 2：step.repeat 只加在 send step 上

**理由**：wait-condition 本身就是"重复检查直到条件满足"的语义，delay 重复无意义。repeat 只加在 send step 上，不引入独立的 repeat wrapper type。

### 决策 3：OR 组合保留

**理由**：旧系统 OR 组合有完整的类型定义、运行时逻辑和 UI 入口：
- 类型：`TriggerCondition.logicOperator?: 'and' | 'or'`（`sendInstances.ts:123`）
- 运行时：`useSendTaskTriggerListener.ts:149` 使用 `condition.logicOperator` 做短路 AND/OR 评估
- UI：`TriggerConditionList.vue:36` 有 AND/OR 下拉选项；`TriggerSendDialog.vue:503` 显示逻辑操作符
- 默认值始终为 `'and'`

通过 ConditionTerm.logicOperator 可选字段表达，默认 AND。

### 决策 4：correlate 不做

**理由**：旧 SCOE 参数关联是 SCOE adapter 内部逻辑。adapter 在翻译时 resolve 参数值为 literal，构造 TaskDefinition 时所有阈值已知。task 引擎不需要 step 间值传递。

### 决策 5：FieldValueSpec.expression 不做

**理由**：表达式求值归 send feature（SendRequest.variables）。task 的 fieldVariations 是静态值数组，按 roundIndex 取值。动态计算用表达式时由 send 侧处理。

### 决策 6：fieldVariations 自动决定迭代

**理由**：fieldVariations 存在时，stopCondition.maxIterations 自动设为 `max(values.length)`。消费方不需要手动对齐。

### 决策 7：单帧发送走同引擎

**理由**：单帧发送 = `schedule: immediate` + 一个 send step + 无 stopCondition。UI 给简化表单，背后构造最简 TaskDefinition。好处：验证、错误处理、SendResult 全走同一路径，不维护两套发送逻辑。

### 决策 8：SCOE 保持"翻译成 TaskDefinition"单一职责

**理由**：SCOE feature 唯一职责是把外部指令翻译成 TaskDefinition。参数解析、文件读取、命令映射全部在 SCOE 内部完成。翻译后的 TaskDefinition 与 UI 创建的无区别。可复用 ConditionTerm 等类型，但模块边界不交叉。

**非 task 场景说明**：部分 SCOE 命令（health_check、link_check 等）不需要创建 task，指令接入 feature 自行处理这些轻量查询/状态类命令。task-real 只负责"需要执行 step 序列"的命令，指令接入 feature 决定哪些命令走 task 路径、哪些自行处理。这不在 task-real 范围内。

### 决策 9：TimerService 放 platform facade

**理由**：renderer 进程 setInterval 受主线程阻塞和后台节流影响。Web Worker 实现精度 ~1ms，不跨 IPC 边界，不违反"main process 不承载领域规则"。task core 通过接口依赖，单元测试用 fake。具体位置待确认（platform/ 下独立模块或挂已有子目录）。

## 最终类型模型

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
  userFieldValues?: Readonly<Record<string, string | number | boolean>>;  // 对应 SendRequest.userFieldValues
  variables?: VariableMap;  // 对应 SendRequest.variables，传给 send 表达式引擎
  context?: SendContext;    // 对应 SendRequest.context，传递 taskId/stepIndex 上下文
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
  // 现有 WaitCondition 重命名 + 扩展 logicOperator
  // 旧→新映射：WaitCondition → ConditionTerm（字段一一对应）
  frameId: string;
  fieldId: string;
  operator: ComparisonOperator;
  threshold: string | number;
  sourceId?: string;
  logicOperator?: 'and' | 'or';  // 新增，旧系统有 AND/OR 证据
}

interface FieldVariation {
  fieldId: string;
  values: readonly (string | number)[];
}

interface TaskErrorPolicy {
  onFailure: 'retry' | 'skip-step' | 'stop' | 'pause';
  retryCount?: number;
  retryDelayMs?: number;
}
```

辅助函数：

```typescript
function resolveStopCondition(def: TaskDefinition): TaskStopCondition {
  if (def.fieldVariations?.length) {
    const maxLen = Math.max(...def.fieldVariations.map(v => v.values.length));
    return { ...def.stopCondition, maxIterations: maxLen };
  }
  return def.stopCondition ?? {};
}
```

循环引擎核心逻辑：

```typescript
async function runTask(ctx: TaskContext) {
  const driver = createDriver(ctx.definition.schedule);
  const stop = createStopGuard(resolveStopCondition(ctx.definition));

  while (!stop.shouldStop(ctx.state)) {
    await driver.waitForNext(ctx);

    for (const step of ctx.definition.steps) {
      if (stop.shouldStop(ctx.state)) break;

      if (step.kind === 'send' && step.config.repeat) {
        await executeRepeatableSend(ctx, step, stop);
      } else {
        await executeStep(ctx, step);
      }
    }
    ctx.state = advanceIteration(ctx.state);
    injectFieldVariations(ctx);
  }
}
```

## 边界

### task 拥有

- 通用执行引擎：step 序列执行、错误处理、进度追踪
- ScheduleDriver + stopCondition + step.repeat 控制
- 条件匹配逻辑（复用 shared/condition-operators）
- task/case/step lifecycle 和执行进度
- fieldVariations 按轮次注入

### task 不拥有

- 页面工作台状态（UI 归 pages）
- 发送链局部细节（send owns）
- receive 解析（receive owns）
- 对外回执协议（northbound owns）
- SCOE 领域规则和参数解析（SCOE owns）
- 报告生成（report owns）
- 帧定义管理（frame owns，task 只引用 frameId）
- TimerService 实现（platform owns）

### Feature 间交互

| 方向 | 交互方式 | 说明 |
|------|---------|------|
| task → send | `SendServiceProvider.execute(req): Promise<SendResult>` | task 构造 SendRequest（含 `context: { source: 'task', taskId, stepIndex }`），await 结果 |
| task → receive | `ReceiveEventSource` adapter port | event driver 和 wait-condition 订阅接收事件 |
| task → frame | `FrameAssetReader` 引用 | 构造 TaskDefinition 时查询帧列表和字段 |
| task → result | emit `TaskInstanceCompletion` | result 只消费此事件，不直接消费 raw events |
| send → task | 无反向依赖 | — |
| receive → task | 无反向依赖 | — |
| result → task | 无反向依赖，只读 selector | — |

## 不做什么

- 不做 correlate / step 间值传递
- 不做表达式动态字段值（fieldVariations 够用）
- 不做嵌套任务 / 动态步骤
- 不做 SCOE 专属 step type 或专属逻辑
- 不做 UI / runtime 装配 / storage
- 不做任务模板 / 执行历史持久化
- 不做多任务并发协调（依赖 send queue）

## 已有类型迁移映射

来源：`rewrite/src/features/task/core/types.ts`

| 旧类型/字段 | 新类型/字段 | 说明 |
|-------------|------------|------|
| `TaskSchedulingMode: 'timed' \| 'trigger' \| 'sequence'` | `ScheduleDriver` discriminated union | 旧 `'sequence'` → `{ kind: 'immediate' }`；旧 `'timed'` → `{ kind: 'timer', intervalMs }`；旧 `'trigger'` → `{ kind: 'event', conditions }` |
| `TaskDefinition.schedulingMode` | `TaskDefinition.schedule` | 字段重命名 |
| `TaskDefinition.intervalMs` | `ScheduleDriver.timer.intervalMs` | 从平铺字段移入 timer 变体 |
| `TaskDefinition.triggerCondition?: WaitCondition` | `ScheduleDriver.event.conditions: ConditionTerm[]` | 单条件 → 条件数组 |
| `TaskDefinition.triggerSource: TaskTriggerSource` | 移除 | 信息性标识，不影响执行逻辑 |
| `WaitCondition` | `ConditionTerm` | 重命名 + 新增 `logicOperator` |
| `WaitConditionStepConfig.condition: WaitCondition` | `WaitConditionConfig.conditions: ConditionTerm[]` | 单条件 → 条件数组 |
| `SendStepConfig.fieldValues` | `SendStepConfig.userFieldValues` | 对齐 send-real 的 `SendRequest.userFieldValues` 命名 |
| （无） | `SendStepConfig.variables?: VariableMap` | 新增，传给 send 表达式引擎 |
| `TaskStopCondition.maxIterations` | 保留，同时替代旧的 IterationControl.fixed | |
| （无） | `TaskStopCondition.exitCondition` | 新增条件退出 |
| （无） | `SendStepConfig.repeat` | 新增单步重复 |
| （无） | `SendStepConfig.intervalAfterMs` | 新增步骤间间隔 |
| `TaskDefinition` 平铺调度字段 | `FieldVariation[]` | 新增 fieldVariations |

涉及文件（task feature 下共 26 个文件）：

- **core/** `types.ts`（major，类型重组）、`condition-matcher.ts`（major，AND/OR）、`progress.ts`（minor）、`lifecycle.ts`（minor）、`clone.ts`（minor）、`index.ts`（跟随导出）
- **services/** `task-iteration-loops.ts`（major，三种循环→统一循环）、`condition-registry.ts`（major，AND/OR 组合）、`task-step-executors.ts`（major，repeat + context + userFieldValues）、`task-service.ts`（minor，内部适配）、`task-error-policy.ts`（no-change）、`task-lifecycle-manager.ts`（minor）、`index.ts`（跟随导出）
- **adapters/** `ports.ts`（minor，新增 TimerService）、`fake-send-service.ts`（minor，适配 context）、`fake-receive-event-source.ts`（no-change）、`test-exports.ts`（跟随）、`index.ts`（跟随）
- **state/** `task-state.ts`（minor，类型跟随）、`index.ts`（跟随）
- **selectors/** `task-selectors.ts`（minor，类型跟随）、`index.ts`（跟随）
- **fixtures/** `task-fixtures.ts`（minor，适配新类型）
- **__tests__/** `task-core.spec.ts`（minor，类型跟随）、`task-service-state-selector.spec.ts`（minor，类型跟随）
- **index.ts**（跟随导出）

## 给 design 的输入清单

1. 最终类型模型（上文已列出）
2. 循环引擎统一实现方案（driver 策略 + stopGuard + step repeat）
3. ConditionRegistry 升级（单条件 → AND/OR 组合匹配）
4. fieldVariations 注入时机（每轮迭代开始前）
5. TimerService adapter 接口设计（platform facade，Web Worker 实现）
6. 已有代码迁移映射表（旧类型 → 新类型）
7. 与 send-real / receive-real / frame-real / result 的 public API 对接确认
8. 翻译约定：startDelay / responseDelay → delay step 或 intervalAfterMs
9. SCOE adapter 翻译规则（参数 resolve + 文件读取 → FieldVariation + 命令映射）
10. 单帧发送的 TaskDefinition 构造约定

## 需求覆盖度

### 旧系统可观测行为（20 项）

17 项完全满足，3 项通过翻译约定满足：

| # | 需求 | 满足方式 |
|---|------|---------|
| A6 | 启动延时 | 首个 delay step 或 intervalAfterMs |
| A11 | 触发后响应延时 | steps 首个 delay step |
| A19 | SCOE 参数化完成条件 | SCOE adapter 翻译时 resolve 为 literal |

### 架构约束（12 项）

全部满足。core 层零 Vue/Pinia/Electron 依赖，selector 不可变，stop → stopped。

### 待外部确认

- TimerService 在 platform/ 下的具体位置
