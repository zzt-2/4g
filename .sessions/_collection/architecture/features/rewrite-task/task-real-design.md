# task-real design

> 日期：2026-05-09
> 状态：draft
> Lane：Lane B（单 feature design）
> 直接合同：`codestable/features/rewrite-task/task-real-brainstorm.md`
> Checklist：`codestable/features/rewrite-task/rewrite-task-checklist.yaml`
> 边界护栏：CLAUDE.md、`codestable/architecture/rewrite-target-structure.md`、`codestable/quality/rewrite-quality-rules.md`

## 设计摘要

task-real 将现有三种独立调度循环（timed/trigger/sequence）统一为 `ScheduleDriver` discriminated union + `stopCondition` + `step.repeat` 三层控制。主要变更：类型重组、ConditionRegistry 升级为 AND/OR 组合匹配、send step 增加 repeat 能力、`buildSendRequest` 对齐实际 `SendRequest` API。

---

## 1. 类型系统

### 1.1 新增类型

#### ScheduleDriver

替代 `TaskSchedulingMode` + `TaskDefinition` 上的平铺调度字段（`intervalMs`、`triggerCondition`、`delayBeforeStartMs`、`cooldownMs`）。

```typescript
type ScheduleDriver =
  | { readonly kind: 'immediate' }
  | { readonly kind: 'timer'; readonly intervalMs: number }
  | { readonly kind: 'event'; readonly conditions: readonly ConditionTerm[]; readonly cooldownMs?: number };
```

旧→新映射：

| 旧模式 | 新表达 |
|--------|--------|
| `'sequence'` + 无额外字段 | `{ kind: 'immediate' }` |
| `'timed'` + `intervalMs` | `{ kind: 'timer', intervalMs }` |
| `'trigger'` + `triggerCondition` + `cooldownMs` | `{ kind: 'event', conditions: [...], cooldownMs }` |

来源：brainstorm 决策 1

#### ConditionTerm

扩展 `WaitCondition`，新增 `logicOperator`。

```typescript
interface ConditionTerm {
  readonly frameId: string;
  readonly fieldId: string;
  readonly operator: ComparisonOperator;
  readonly threshold: string | number;
  readonly sourceId?: string;
  readonly logicOperator?: 'and' | 'or';  // 新增，默认 'and'
}
```

字段一一对应 `WaitCondition`（core/types.ts:26-32），新增 `logicOperator`。

`logicOperator` 语义：`conditions[i].logicOperator` 决定当前条件如何与 `conditions[0..i-1]` 的累积结果组合。`conditions[0].logicOperator` 无意义（被忽略）。默认 `'and'`。

来源：brainstorm 决策 3，旧系统 `TriggerCondition.logicOperator` 证据（`sendInstances.ts:123`、`useSendTaskTriggerListener.ts:115-155`）

#### FieldVariation

```typescript
interface FieldVariation {
  readonly fieldId: string;
  readonly values: readonly (string | number)[];
}
```

按迭代轮次覆盖 `SendStepConfig.userFieldValues` 中对应字段。`stopCondition.maxIterations` 自动设为 `max(fieldVariations[].values.length)`。

来源：brainstorm 决策 6，旧系统 `readFileAndSend.ts` FieldVariation 翻译

#### StepRepeat

```typescript
interface StepRepeat {
  readonly intervalMs: number;
  readonly until?: readonly ConditionTerm[];
  readonly maxCount?: number;
}
```

只用于 send step。来源：brainstorm 决策 2。

### 1.2 变更类型

#### TaskDefinition — major

```typescript
interface TaskDefinition {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly TaskStepDefinition[];
  readonly schedule: ScheduleDriver;                          // 替代 schedulingMode + 平铺字段
  readonly stopCondition?: TaskStopCondition;
  readonly fieldVariations?: readonly FieldVariation[];       // 新增
  readonly errorPolicy: TaskErrorPolicy;
}
```

移除字段（对比 core/types.ts:113-126）：

| 移除字段 | 原类型/位置 | 替代 |
|----------|------------|------|
| `schedulingMode` | `TaskSchedulingMode` | `schedule: ScheduleDriver` |
| `triggerSource` | `TaskTriggerSource` | 移除（信息性标识） |
| `targetId?` | `string` | 移到 `SendStepConfig.targetId` |
| `intervalMs?` | `number` | `ScheduleDriver.timer.intervalMs` |
| `delayBeforeStartMs?` | `number` | 首个 delay step |
| `triggerCondition?` | `WaitCondition` | `ScheduleDriver.event.conditions` |
| `cooldownMs?` | `number` | `ScheduleDriver.event.cooldownMs` |

新增字段：`schedule`、`fieldVariations`。

#### SendStepConfig — major

```typescript
interface SendStepConfig {
  readonly frameId: string;
  readonly targetId: string;                                                    // 必需（原可选 + fallback definition.targetId）
  readonly userFieldValues?: Readonly<Record<string, string | number | boolean>>;  // 重命名 fieldValues → userFieldValues
  readonly variables?: VariableMap;                                             // 新增
  readonly intervalAfterMs?: number;                                            // 新增
  readonly repeat?: StepRepeat;                                                 // 新增
}
```

对齐 `SendRequest`（send/core/types.ts:SendRequest）：

| SendStepConfig 字段 | SendRequest 字段 | 说明 |
|--------------------|-----------------|------|
| `frameId` | `frameId: string` | 直接映射 |
| `targetId` | `targetId: string` | 直接映射（现必需） |
| `userFieldValues` | `userFieldValues?: Readonly<Record<string, SendFieldValue>>` | 对齐命名，`SendFieldValue = string \| number \| boolean` |
| `variables` | `variables?: VariableMap` | 直接映射，`VariableMap = ReadonlyMap<string, VariableValue>`（shared/expression/types.ts） |
| （构造） | `context?: SendContext` | 由 `buildSendRequest` 构造，不暴露给配置 |
| 移除 `options` | — | `SendRequest` 无此字段 |
| `intervalAfterMs` | — | task 内部消费 |
| `repeat` | — | task 内部消费 |

#### WaitConditionStepConfig → WaitConditionConfig — major

```typescript
interface WaitConditionConfig {
  readonly conditions: readonly ConditionTerm[];   // 单条件 → 条件数组
  readonly timeoutMs?: number;                     // 可选（undefined = 无限等待直到信号中断）
  readonly onTimeout: 'continue' | 'skip' | 'fail';
}
```

变更（对比 core/types.ts:43-47）：
- `condition: WaitCondition` → `conditions: readonly ConditionTerm[]`
- `timeoutMs: number` → `timeoutMs?: number`

#### TaskStepDefinition — minor

```typescript
type TaskStepDefinition =
  | { readonly kind: 'send';    readonly id: string; readonly name?: string; readonly config: SendStepConfig }
  | { readonly kind: 'wait-condition'; readonly id: string; readonly name?: string; readonly config: WaitConditionConfig }
  | { readonly kind: 'delay';   readonly id: string; readonly name?: string; readonly config: DelayStepConfig };
```

变更（对比 core/types.ts:53-77）：
- `sendConfig` → `config`，`waitConfig` → `config`，`delayConfig` → `config`
- `name?` 保留（display concern）

#### TaskStopCondition — minor

```typescript
interface TaskStopCondition {
  readonly maxIterations?: number;
  readonly maxDurationMs?: number;
  readonly exitCondition?: readonly ConditionTerm[];  // 新增
}
```

对比 core/types.ts:106-109：新增 `exitCondition`。

#### ConditionMatchInput — breaking

```typescript
interface ConditionMatchInput {
  readonly frameId: string;
  readonly sourceId?: string;
  readonly fieldValues: Readonly<Record<string, number | string | null>>;  // 替代 fieldId + value
}
```

对比 core/types.ts:223-228：移除 `fieldId`、`value`，新增 `fieldValues`。

理由：AND/OR 组合条件需要一次评估多个字段。单字段 input 不满足需求。与旧系统行为一致（旧系统在每帧事件中评估所有条件，`useSendTaskTriggerListener.ts:115-155`）。

### 1.3 移除类型

| 移除项 | 原位置（core/types.ts） | 替代 |
|--------|----------------------|------|
| `TaskSchedulingMode` | :91 | `ScheduleDriver` |
| `TASK_SCHEDULING_MODES` | :90 | 无需常量 |
| `TaskTriggerSource` | :88 | 无替代 |
| `TASK_TRIGGER_SOURCES` | :81-87 | 无需常量 |
| `WaitCondition` | :26-32 | `ConditionTerm` |
| `WaitConditionStepConfig` | :43-47 | `WaitConditionConfig` |
| `SendStepConfig.options` | :40 | 移除 |

### 1.4 不变类型

| 类型 | 说明 |
|------|------|
| `TaskStepKind` | `'send' \| 'wait-condition' \| 'delay'` |
| `ComparisonOperator` | 完全不变，与 shared/condition-operators/types.ts 一致 |
| `TaskErrorPolicy` / `TaskErrorAction` | 完全不变 |
| `TaskLifecycleStatus` / `LifecycleAction` | 完全不变 |
| `SendStepResult` | 不变 |
| `WaitConditionStepResult` | 不变 |
| `DelayStepResult` | 不变 |
| `DelayStepConfig` | 不变 |
| `TaskStepResult` | 不变 |

### 1.5 辅助函数

```typescript
type ResolvedStopCondition = TaskStopCondition;

function resolveStopCondition(def: TaskDefinition): ResolvedStopCondition {
  if (def.fieldVariations && def.fieldVariations.length > 0) {
    const maxLen = Math.max(...def.fieldVariations.map(v => v.values.length));
    return { ...def.stopCondition, maxIterations: maxLen };
  }
  return def.stopCondition ?? {};
}
```

`resolveStopCondition` 放在 `core/types.ts` 中（与 TaskDefinition/TaskStopCondition 同文件），通过 `core/index.ts` 导出。

---

## 2. 循环引擎

### 2.1 统一 runTask

替代 `runTimedLoop`、`runTriggerLoop`、`runSequenceLoop`（task-iteration-loops.ts:106-233）。

```typescript
interface TaskExecutionContext {
  readonly definition: TaskDefinition;
  readonly resolvedStop: ResolvedStopCondition;
  state: TaskStateContainer;
  stepExecutors: StepExecutors;
  conditionRegistry: ConditionRegistry;
  updateLifecycle: UpdateLifecycleFn;
  errorPolicy: ErrorPolicyHandler;
  fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;
  timerService?: TimerService;
  now: () => string;
}

async function runTask(
  instanceId: string,
  ctx: TaskExecutionContext,
  signal: Promise<void>,
): Promise<void> {
  const driver = createDriver(ctx.definition.schedule, ctx, instanceId, signal);
  const stopGuard = createStopGuard(ctx.resolvedStop, ctx);

  let iteration = ctx.state.getInstance(instanceId)?.currentIteration ?? 0;

  while (!stopGuard.shouldStop(instanceId, iteration)) {
    const triggered = await driver.waitForNext(instanceId, iteration, signal);
    if (!triggered) break;

    const completed = await executeSteps(instanceId, iteration, ctx, signal);
    if (!completed) break;

    if (stopGuard.checkExitCondition()) break;

    iteration++;
    ctx.state.updateInstance(instanceId, { currentIteration: iteration });
  }

  driver.dispose();
}
```

### 2.2 ScheduleDriver 实现

```typescript
interface ScheduleDriverAdapter {
  waitForNext(instanceId: string, iteration: number, signal: Promise<void>): Promise<boolean>;
  dispose(): void;
}
```

#### immediate

```typescript
{ waitForNext: async () => true, dispose: () => {} }
```

#### timer

```typescript
function createTimerDriver(intervalMs: number): ScheduleDriverAdapter {
  let firstCall = true;

  return {
    async waitForNext(_id, _iter, signal) {
      if (firstCall) { firstCall = false; return true; }

      const delay = sleep(intervalMs);
      const race = await Promise.race([
        delay.promise.then(() => true),
        signal.then(() => false),
      ]);
      if (!race) delay.cancel();
      return race;
    },
    dispose() {},
  };
}
```

对比现有 `runTimedLoop`（task-iteration-loops.ts:106-158）：
- 首次调用无延迟（替代原 `delayBeforeStartMs`，现由 delay step 表达）
- 后续调用等待 intervalMs
- 通过 signal 支持中断

#### event

```typescript
function createEventDriver(
  schedule: Extract<ScheduleDriver, { kind: 'event' }>,
  ctx: TaskExecutionContext,
  instanceId: string,
  signal: Promise<void>,
): ScheduleDriverAdapter {
  const { conditions, cooldownMs = 0 } = schedule;
  let lastTriggerTime = 0;
  let notifyResolve: ((value: boolean) => void) | null = null;
  let disposed = false;

  const group = ctx.conditionRegistry.registerGroup(conditions, () => {
    if (disposed) return;
    const now = Date.now();
    if (cooldownMs > 0 && lastTriggerTime > 0 && now - lastTriggerTime < cooldownMs) return;
    lastTriggerTime = now;
    if (notifyResolve) { notifyResolve(true); notifyResolve = null; }
  });

  return {
    async waitForNext() {
      if (disposed) return false;
      return Promise.race([
        new Promise<boolean>((resolve) => { notifyResolve = resolve; }),
        signal.then(() => false),
      ]);
    },
    dispose() {
      disposed = true;
      ctx.conditionRegistry.unregisterGroup(group);
      if (notifyResolve) { notifyResolve(false); notifyResolve = null; }
    },
  };
}
```

对比现有 `runTriggerLoop`（task-iteration-loops.ts:160-223）：
- 从 `register(condition, handler)` → `registerGroup(conditions, handler)`
- cooldownMs 逻辑从循环体内移到 driver 内部
- triggerQueue 机制简化为 Promise resolve

### 2.3 StopGuard

```typescript
interface StopGuard {
  shouldStop(instanceId: string, iteration: number): boolean;
  checkExitCondition(): boolean;
}

function createStopGuard(stop: ResolvedStopCondition, ctx: TaskExecutionContext): StopGuard {
  const startTime = Date.now();

  return {
    shouldStop(instanceId, iteration) {
      const inst = ctx.state.getInstance(instanceId);
      if (!inst || inst.lifecycle !== 'running') return true;
      if (stop.maxIterations !== undefined && iteration >= stop.maxIterations) return true;
      if (stop.maxDurationMs !== undefined && Date.now() - startTime >= stop.maxDurationMs) return true;
      return false;
    },

    checkExitCondition() {
      if (!stop.exitCondition) return false;
      if (!ctx.fieldValueProvider) return false;
      return evaluateConditionGroup(stop.exitCondition, ctx.fieldValueProvider());
    },
  };
}
```

`checkExitCondition` 需要 `fieldValueProvider`（由 runtime 层从 `ReceiveReader.listFieldValues()` 提供，测试用 fake）。

### 2.4 step repeat

```typescript
async function executeRepeatableSend(
  ctx: TaskExecutionContext,
  instanceId: string,
  step: SendStepDefinition,
  iteration: number,
  stepIndex: number,
  signal: Promise<void>,
): Promise<boolean> {
  const { repeat } = step.config;
  if (!repeat) {
    const result = await ctx.stepExecutors.executeSendStep(instanceId, step, iteration, stepIndex);
    ctx.state.addStepResult(instanceId, result);
    return result.sendResult.kind === 'sent';
  }

  let count = 0;
  const maxCount = repeat.maxCount ?? Infinity;

  while (count < maxCount) {
    const result = await ctx.stepExecutors.executeSendStep(instanceId, step, iteration, stepIndex);
    ctx.state.addStepResult(instanceId, result);

    if (result.sendResult.kind !== 'sent') return false;

    count++;

    if (repeat.until && ctx.fieldValueProvider) {
      if (evaluateConditionGroup(repeat.until, ctx.fieldValueProvider())) break;
    }

    if (count < maxCount) {
      const delay = sleep(repeat.intervalMs);
      const race = await Promise.race([delay.promise.then(() => true), signal.then(() => false)]);
      if (!race) { delay.cancel(); return false; }
    }
  }

  return true;
}
```

### 2.5 fieldVariations 注入

在 `buildSendRequest` 时合并，不是单独的注入步骤。

```typescript
function resolveFieldValues(
  baseValues: Readonly<Record<string, string | number | boolean>> | undefined,
  fieldVariations: readonly FieldVariation[] | undefined,
  iteration: number,
): Readonly<Record<string, string | number | boolean>> {
  if (!fieldVariations || fieldVariations.length === 0) return baseValues ?? {};

  const result: Record<string, string | number | boolean> = { ...(baseValues ?? {}) };
  for (const variation of fieldVariations) {
    if (iteration < variation.values.length) {
      result[variation.fieldId] = variation.values[iteration];
    }
  }
  return result;
}
```

---

## 3. ConditionRegistry 升级

### 3.1 evaluateConditionGroup

替代现有 `evaluateCondition`（core/condition-matcher.ts），支持 AND/OR 组合。

```typescript
function evaluateConditionGroup(
  conditions: readonly ConditionTerm[],
  fieldValues: Readonly<Record<string, number | string | null>>,
): boolean {
  if (conditions.length === 0) return true;

  let result = evaluateSingleCondition(conditions[0], fieldValues);

  for (let i = 1; i < conditions.length; i++) {
    const op = conditions[i].logicOperator ?? 'and';
    const current = evaluateSingleCondition(conditions[i], fieldValues);

    if (op === 'or') {
      result = result || current;
      if (result) break;   // OR 短路
    } else {
      result = result && current;
      if (!result) break;  // AND 短路
    }
  }

  return result;
}

function evaluateSingleCondition(
  condition: ConditionTerm,
  fieldValues: Readonly<Record<string, number | string | null>>,
): boolean {
  const value = fieldValues[condition.fieldId];
  if (value === undefined || value === null) return false;
  return compareValues(value, condition.threshold, condition.operator);
}
```

来源：旧系统 `useSendTaskTriggerListener.ts:115-154` AND/OR 短路逻辑
依赖：`compareValues`（shared/condition-operators/index.ts:3）

### 3.2 ConditionRegistry 改造

从单条件注册（condition-registry.ts:11-56）改为条件组注册。

```typescript
interface ConditionGroup {
  readonly id: string;
  readonly conditions: readonly ConditionTerm[];
  readonly onSatisfied: () => void;
}

class ConditionRegistry {
  private groups = new Map<string, ConditionGroup>();
  private frameIndex = new Map<string, Set<string>>();
  private nextGroupId = 1;

  registerGroup(conditions: readonly ConditionTerm[], onSatisfied: () => void): ConditionGroup {
    const id = `cg-${this.nextGroupId++}`;
    const group: ConditionGroup = { id, conditions, onSatisfied };
    this.groups.set(id, group);

    const frameIds = new Set(conditions.map(c => c.frameId));
    for (const frameId of frameIds) {
      if (!this.frameIndex.has(frameId)) this.frameIndex.set(frameId, new Set());
      this.frameIndex.get(frameId)!.add(id);
    }

    return group;
  }

  unregisterGroup(group: ConditionGroup): void {
    this.groups.delete(group.id);
    for (const set of this.frameIndex.values()) set.delete(group.id);
  }

  processInput(input: ConditionMatchInput): void {
    const groupIds = this.frameIndex.get(input.frameId);
    if (!groupIds) return;

    for (const groupId of groupIds) {
      const group = this.groups.get(groupId);
      if (!group) continue;

      // sourceId 过滤
      if (input.sourceId !== undefined) {
        const hasSourceMatch = group.conditions.some(
          c => c.sourceId === undefined || c.sourceId === input.sourceId
        );
        if (!hasSourceMatch) continue;
      }

      if (evaluateConditionGroup(group.conditions, input.fieldValues)) {
        group.onSatisfied();
      }
    }
  }

  clear(): void {
    this.groups.clear();
    this.frameIndex.clear();
  }

  get size(): number {
    return this.groups.size;
  }
}
```

### 3.3 ConditionMatchInput 变更影响

| 消费方 | 文件 | 影响 |
|--------|------|------|
| `ConditionRegistry.processInput` | services/condition-registry.ts | 签名不变，内部改为 group 评估 |
| `evaluateCondition` | core/condition-matcher.ts | 签名变更 |
| `fake-receive-event-source.ts` | adapters/ | 适配新 `ConditionMatchInput` |
| 测试 fixtures | fixtures/ | 适配新结构 |

### 3.4 跨 feature 协调说明

`ConditionMatchInput` 变更是 **task 内部变更**，不影响其他 feature 的公开 API。

**数据流**：
```
receive-real (公开 API 不变)
  → runtime 层 ReceiveEventSource 适配器 (需更新)
    → task ConditionRegistry.processInput (内部变更)
```

- `ConditionMatchInput` 定义在 `task/core/types.ts`，是 task feature 的内部类型
- `ReceiveEventSource` 接口定义在 `task/adapters/ports.ts`，也是 task 内部
- **receive-real 不需要任何变更**。receive 的 `ReceiveReader.listFieldValues()` / `ReceiveService.listEvents()` 公开 API 完全不变
- 需要变更的是 **runtime 层**的 `ReceiveEventSource` 适配器实现：从逐字段 emit 改为逐帧 emit（将 `ReceiveFieldValueSnapshot[]` 按 frameId 聚合为 `ConditionMatchInput.fieldValues`）
- **send-real 不需要任何变更**。`SendRequest` / `SendService.execute()` 公开 API 不变，是 task 的 `buildSendRequest` 对齐到已有的 `SendRequest` 签名

**实施节奏**：task-real 可以独立完成所有变更（类型、引擎、测试），runtime 适配器在 runtime 装配阶段更新。不阻塞 task-real 实施。

---

## 4. Step 执行器

### 4.1 buildSendRequest 对齐

当前代码（task-step-executors.ts:17-29）与 `SendRequest`（send/core/types.ts）不对齐：

| 当前代码 | SendRequest 实际字段 | 修正 |
|----------|---------------------|------|
| `stepConfig.sendConfig.fieldValues` | `userFieldValues?: Readonly<Record<string, SendFieldValue>>` | 重命名 |
| `stepConfig.sendConfig.targetId ?? definition.targetId ?? ''` | `targetId: string`（必需） | 移除 fallback |
| `stepConfig.sendConfig.options ?? {}` | 不存在 | 移除 |
| 缺失 | `variables?: VariableMap` | 新增 |

修正后：

```typescript
function buildSendRequest(
  stepConfig: SendStepConfig,
  definition: TaskDefinition,
  stepIndex: number,
  iteration: number,
): SendRequest {
  return {
    frameId: stepConfig.frameId,
    targetId: stepConfig.targetId,
    userFieldValues: resolveFieldValues(
      stepConfig.userFieldValues,
      definition.fieldVariations,
      iteration,
    ),
    variables: stepConfig.variables,
    context: { source: 'task', taskId: definition.id, stepIndex },
  };
}
```

### 4.2 wait-condition step 执行器

从注册单个 `WaitCondition` 改为注册条件组。

```typescript
async function executeWaitConditionStep(
  instanceId: string,
  step: WaitConditionStepDefinition,
  iteration: number,
  stepIndex: number,
  signal: Promise<void>,
): Promise<{ result: TaskStepResult; interrupted: boolean }> {
  const { conditions, timeoutMs, onTimeout } = step.config;

  return new Promise((resolve) => {
    let settled = false;

    const group = ctx.conditionRegistry.registerGroup(conditions, () => {
      if (settled) return;
      settled = true;
      ctx.conditionRegistry.unregisterGroup(group);
      if (timer !== undefined) clearTimeout(timer);
      resolve({
        result: { kind: 'wait-condition', stepIndex, iteration, matched: true, timedOut: false },
        interrupted: false,
      });
    });

    const timer = timeoutMs !== undefined
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          ctx.conditionRegistry.unregisterGroup(group);
          resolve({
            result: { kind: 'wait-condition', stepIndex, iteration, matched: false, timedOut: true },
            interrupted: false,
          });
        }, timeoutMs)
      : undefined;

    signal.then(() => {
      if (settled) return;
      settled = true;
      ctx.conditionRegistry.unregisterGroup(group);
      if (timer !== undefined) clearTimeout(timer);
      resolve({
        result: { kind: 'wait-condition', stepIndex, iteration, matched: false, timedOut: false },
        interrupted: true,
      });
    });
  });
}
```

### 4.3 delay step 执行器

无变更。现有 `executeDelayStep`（task-step-executors.ts:117-135）已满足需求。

### 4.4 intervalAfterMs 处理

在 `executeSteps` 循环中，send step 执行后检查 `intervalAfterMs`：

```typescript
// 在 executeSteps 的 step 循环内：
if (step.kind === 'send' && step.config.intervalAfterMs) {
  const delay = sleep(step.config.intervalAfterMs);
  const race = await Promise.race([delay.promise.then(() => 'done'), signal.then(() => 'intr')]);
  if (race === 'intr') { delay.cancel(); return false; }
}
```

---

## 5. TimerService adapter

### 5.1 接口定义

在 `adapters/ports.ts` 中新增：

```typescript
export interface TimerService {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, intervalMs: number): number;
  clearInterval(id: number): void;
}
```

### 5.2 注入方式

```typescript
export interface CreateTaskServiceOptions {
  readonly sendService: SendServiceProvider;
  readonly receiveEventSource: ReceiveEventSource;
  readonly timerService?: TimerService;       // 可选
  readonly fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;  // 新增
  readonly state?: TaskStateContainer;
  readonly now?: () => string;
}
```

### 5.3 实现位置

| 组件 | 位置 |
|------|------|
| 接口定义 | `task/adapters/ports.ts` |
| platform 实现 | `rewrite/src/platform/` 下（Web Worker，不阻塞 task-real） |
| fake 实现 | `task/adapters/fake-timer-service.ts` |

### 5.4 当前策略

`sleep()` 继续使用标准 `setTimeout`。TimerService 作为可选注入，后续替换。不阻塞 task-real 实施。

---

## 6. 状态管理

### 6.1 TaskInstanceState

无结构性变更。`definitionRef` 类型从旧 `TaskDefinition` 更新为新 `TaskDefinition`。

### 6.2 stepResults 上限

长期运行任务可能产生大量 stepResults。

策略：保留最近 N 条（默认 100，可通过 `CreateTaskServiceOptions` 配置）。超出时丢弃最旧的结果。不影响进度计算（进度基于计数器而非 stepResults 数组长度）。

### 6.3 进度计算

`calculateProgress`（core/progress.ts）逻辑不变，适配新类型即可。`iterationsTotal` 从 `resolvedStop.maxIterations` 计算。

---

## 7. 迁移计划

### 7.1 逐文件变更

#### core/types.ts — MAJOR

- 新增：`ScheduleDriver`、`ConditionTerm`、`FieldVariation`、`StepRepeat`、`WaitConditionConfig`
- 修改：`TaskDefinition`（字段重组）、`SendStepConfig`（字段变更）、`TaskStopCondition`（新增 exitCondition）、`ConditionMatchInput`（结构变更）、`TaskStepDefinition`（config 统一）
- 移除：`TaskSchedulingMode`、`TASK_SCHEDULING_MODES`、`TaskTriggerSource`、`TASK_TRIGGER_SOURCES`、`WaitCondition`、`WaitConditionStepConfig`

#### core/condition-matcher.ts — MAJOR

- 修改：`evaluateCondition` 签名从 `(WaitCondition, ConditionMatchInput)` → `(ConditionTerm, fieldValues Record)`
- 新增：`evaluateConditionGroup`、`evaluateSingleCondition`

#### core/progress.ts — MINOR

- 类型跟随（`iterationsTotal` 计算适配 `resolvedStop`）

#### core/clone.ts — MINOR（类型跟随）

#### core/lifecycle.ts — NO CHANGE

#### core/index.ts — FOLLOW（导出更新）

#### services/task-iteration-loops.ts — MAJOR

- 移除：`runTimedLoop`、`runTriggerLoop`、`runSequenceLoop`
- 新增：`runTask`、`createDriver`（immediate/timer/event 三种）、`createStopGuard`、`executeRepeatableSend`、`resolveFieldValues`

#### services/condition-registry.ts — MAJOR

- `register` → `registerGroup`，`unregister` → `unregisterGroup`
- `processInput` 改为 group 评估
- `ConditionEntry` → `ConditionGroup`
- 移除单条件注册接口

#### services/task-step-executors.ts — MAJOR

- `buildSendRequest`：fieldValues→userFieldValues，移除 options，新增 variables，新增 iteration+fieldVariations 参数
- `executeWaitConditionStep`：单条件注册→条件组注册
- `StepExecutorContext`：新增 fieldValueProvider

#### services/task-service.ts — MINOR

- `runExecutionLoop`：从 `switch(schedulingMode)` 改为调用 `runTask`
- `CreateTaskServiceOptions`：新增 `timerService?`、`fieldValueProvider?`

#### services/task-error-policy.ts — MINOR

- `step.delayConfig.durationMs` → `step.config.durationMs`（config 字段统一改名）
- `step.waitConfig` → `step.config`（如有引用）
- 类型跟随

#### services/task-lifecycle-manager.ts — MINOR（类型跟随）

#### services/index.ts — FOLLOW

#### adapters/ports.ts — MINOR

- 新增 `TimerService` 接口

#### adapters/fake-send-service.ts — MINOR

- 适配 `SendRequest` 新字段名

#### adapters/fake-receive-event-source.ts — MINOR

- 适配新 `ConditionMatchInput` 结构

#### adapters/test-exports.ts — FOLLOW

#### adapters/index.ts — FOLLOW

#### state/task-state.ts — MINOR（类型跟随）

#### state/index.ts — FOLLOW

#### selectors/task-selectors.ts — MINOR（类型跟随）

#### selectors/index.ts — FOLLOW

#### fixtures/task-fixtures.ts — MINOR

- `timedTaskDef`、`triggerTaskDef`、`sequenceTaskDef`、`scoeModeTaskDef`、`waitConditions` 等适配新类型

#### \_\_tests\_\_/task-core.spec.ts — MINOR

- `ConditionTerm` 替代 `WaitCondition`，`ScheduleDriver` 替代 `schedulingMode`
- 新增 `evaluateConditionGroup` 测试

#### \_\_tests\_\_/task-service-state-selector.spec.ts — MINOR

- 适配新 `TaskDefinition` 结构，更新 timed/trigger/sequence 测试用例

#### index.ts — FOLLOW

### 7.2 变更级别汇总

| 级别 | 文件数 | 文件 |
|------|--------|------|
| MAJOR | 5 | types.ts, condition-matcher.ts, task-iteration-loops.ts, condition-registry.ts, task-step-executors.ts |
| MINOR | 13 | progress.ts, clone.ts, task-service.ts, task-lifecycle-manager.ts, task-error-policy.ts, ports.ts, fake-send-service.ts, fake-receive-event-source.ts, task-fixtures.ts, task-state.ts, task-selectors.ts, \_\_tests\_\_/task-core.spec.ts, \_\_tests\_\_/task-service-state-selector.spec.ts |
| FOLLOW | 7 | core/index.ts, services/index.ts, adapters/test-exports.ts, adapters/index.ts, state/index.ts, selectors/index.ts, index.ts |
| NO CHANGE | 1 | lifecycle.ts（注：`DelayStepConfig` 类型不变，但非文件） |

### 7.3 测试策略

| 变更类别 | 测试策略 | 目标测试文件 |
|----------|---------|------------|
| 新增类型 | 编译时类型检查 + fixture 适配 | fixtures/task-fixtures.ts |
| `evaluateConditionGroup` | 新增单元测试：AND 组合、OR 组合、混合、短路、空条件、单条件 | `__tests__/task-core.spec.ts` |
| ConditionRegistry 组注册 | 新增单元测试：组注册/注销、AND/OR 触发、frameId 索引 | `__tests__/task-core.spec.ts` |
| 统一 `runTask` | 修改现有 timed/trigger/sequence 测试 + 新增 repeat、fieldVariations、exitCondition 测试 | `__tests__/task-service-state-selector.spec.ts` |
| `buildSendRequest` 对齐 | 修改现有测试：验证 userFieldValues、variables、无 options | `__tests__/task-core.spec.ts` |
| stepResults 上限 | 新增单元测试：超出上限时丢弃最旧 | `__tests__/task-service-state-selector.spec.ts` |

---

## 8. 翻译约定

### 8.1 startDelay → delay step

旧 `delayBeforeStartMs` → steps 首位插入 delay step。由 UI 或 SCOE adapter 在构造 TaskDefinition 时处理。

### 8.2 responseDelay → delay step

旧触发后 `responseDelay` → event schedule 的 steps 首位插入 delay step。

### 8.3 SCOE 参数 resolve

SCOE adapter 翻译时将参数值 resolve 为 literal：
- 参数值 → `SendStepConfig.userFieldValues`
- 完成条件阈值 → `ConditionTerm.threshold`
- task 引擎不理解参数关联

### 8.4 文件发送

SCOE adapter 读取文件 → `FieldVariation[]`：
- `.txt`：按行分割，过滤空行
- 非 `.txt`：逗号分隔
- `maxLength = max(values.length)` → 自动 `stopCondition.maxIterations`

### 8.5 单帧发送

```typescript
{
  id: generateId(),
  name: 'single-send',
  steps: [{ kind: 'send', id: 'step-0', config: { frameId, targetId, userFieldValues } }],
  schedule: { kind: 'immediate' },
  errorPolicy: { onFailure: 'stop' },
}
```

---

## 9. Checklist

### 类型系统

- [ ] `ScheduleDriver` discriminated union 定义
- [ ] `ConditionTerm`（含 `logicOperator`）定义
- [ ] `FieldVariation` 定义
- [ ] `StepRepeat` 定义
- [ ] `TaskDefinition` 重组
- [ ] `SendStepConfig` 对齐（userFieldValues, variables, repeat, targetId 必需）
- [ ] `WaitConditionConfig`（conditions 数组，timeoutMs 可选）
- [ ] `TaskStepDefinition` 统一 config 字段名
- [ ] `TaskStopCondition` 新增 exitCondition
- [ ] `ConditionMatchInput` 改为多字段
- [ ] 移除 `TaskSchedulingMode`、`TaskTriggerSource` 及常量

### 循环引擎

- [ ] 统一 `runTask` 实现
- [ ] immediate / timer / event 三种 driver
- [ ] StopGuard（maxIterations + maxDurationMs + exitCondition）
- [ ] step repeat（until + maxCount）
- [ ] fieldVariations 按轮次注入（在 buildSendRequest 中合并）
- [ ] `resolveStopCondition` 辅助函数
- [ ] intervalAfterMs 在 executeSteps 中处理

### ConditionRegistry

- [ ] 条件组注册/注销（`registerGroup` / `unregisterGroup`）
- [ ] AND/OR 组合评估（含短路）
- [ ] frameId 索引
- [ ] sourceId 过滤

### Step 执行器

- [ ] `buildSendRequest` 对齐 `SendRequest`（userFieldValues, variables, 无 options, 无 fallback targetId）
- [ ] wait-condition 条件组注册
- [ ] delay 无变更

### Adapter

- [ ] `TimerService` 接口定义
- [ ] `fieldValueProvider` 注入
- [ ] fake-send-service 适配
- [ ] fake-receive-event-source 适配新 ConditionMatchInput

### 测试

- [ ] `evaluateConditionGroup` 单元测试（AND、OR、混合、短路、空条件）
- [ ] ConditionRegistry 组注册测试
- [ ] 统一 runTask 的 timer / event / immediate 测试
- [ ] repeat 发送测试
- [ ] fieldVariations 注入测试
- [ ] exitCondition 测试
- [ ] stepResults 上限测试
- [ ] 现有 70+ 测试全部适配通过

### 构建

- [ ] 零 TS 编译错误
- [ ] 零 lint 错误
- [ ] 所有 26 个文件按迁移计划更新

---

## 10. 不确定事项

| # | 事项 | 影响 | 建议 |
|---|------|------|------|
| 1 | `cooldownMs` 是否加入 `ScheduleDriver.event` | event driver 触发频率控制 | 已加入为可选字段，旧系统有完整证据 |
| 2 | `exitCondition` / `repeat.until` 的同步评估需要当前 receive field values | StopGuard 和 repeat.until 需要 | 通过 `fieldValueProvider` 注入，runtime 连接 ReceiveReader |
| 3 | TimerService platform 实现位置 | 不阻塞设计 | 只定义接口，实现由 platform 承接 |
| 4 | 不同 frameId 的条件在同组中如何处理 | 边界情况 | 当前实际场景中同组条件引用同一 frameId；跨 frame 场景留后续处理 |
| 5 | `fieldVariations.fieldId` 是否需要 stepId 或 frameId 区分同字段不同 step | 可能歧义 | 当前 fieldVariations 按 fieldId 覆盖所有 send step 的 userFieldValues；per-step 粒度后续可扩展 |

---

## 11. brainstorm 输入清单覆盖

| # | 输入项 | 覆盖位置 |
|---|--------|---------|
| 1 | 最终类型模型 | 第 1 节 |
| 2 | 循环引擎统一实现方案 | 第 2 节 |
| 3 | ConditionRegistry 升级 | 第 3 节 |
| 4 | fieldVariations 注入时机 | 第 2.5 节 + 第 4.1 节 |
| 5 | TimerService adapter 接口设计 | 第 5 节 |
| 6 | 已有代码迁移映射表 | 第 7 节 |
| 7 | 与 send/receive/frame/result 的 public API 对接确认 | 第 4.1 节（buildSendRequest 对齐表） |
| 8 | 翻译约定：startDelay / responseDelay | 第 8.1、8.2 节 |
| 9 | SCOE adapter 翻译规则 | 第 8.3、8.4 节 |
| 10 | 单帧发送的 TaskDefinition 构造约定 | 第 8.5 节 |
