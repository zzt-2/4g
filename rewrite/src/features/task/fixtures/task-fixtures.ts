import type {
  TaskDefinition,
  TaskStepDefinition,
  WaitCondition,
  TaskErrorPolicy,
  ConditionMatchInput,
  TaskInstanceState,
  TaskStepResult,
} from '../core';

// --- Helper factories ---

function sendStep(overrides: { id: string; frameId?: string; targetId?: string }): TaskStepDefinition {
  return {
    id: overrides.id,
    kind: 'send',
    sendConfig: {
      frameId: overrides.frameId ?? 'frame-1',
      fieldValues: { field1: 100 },
      ...(overrides.targetId ? { targetId: overrides.targetId } : {}),
    },
  };
}

function waitConditionStep(id: string, condition: WaitCondition, timeoutMs = 5000): TaskStepDefinition {
  return {
    id,
    kind: 'wait-condition',
    waitConfig: { condition, timeoutMs, onTimeout: 'fail' },
  };
}

function delayStep(id: string, durationMs = 1000): TaskStepDefinition {
  return {
    id,
    kind: 'delay',
    delayConfig: { durationMs },
  };
}

function defaultErrorPolicy(): TaskErrorPolicy {
  return { onFailure: 'stop' };
}

// --- WaitCondition fixtures ---

export const waitConditions = {
  eqNumeric: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 100,
  }),
  eqString: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 'OK',
  }),
  neq: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'neq',
    threshold: 50,
  }),
  gt: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'gt',
    threshold: 50,
  }),
  lt: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'lt',
    threshold: 50,
  }),
  gte: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'gte',
    threshold: 100,
  }),
  lte: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'lte',
    threshold: 100,
  }),
  change: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'change',
    threshold: 0,
  }),
  any: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'any',
    threshold: 0,
  }),
  withSourceFilter: (): WaitCondition => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 100,
    sourceId: 'source-A',
  }),
  differentFrame: (): WaitCondition => ({
    frameId: 'frame-2',
    fieldId: 'field-2',
    operator: 'eq',
    threshold: 100,
  }),
};

// --- TaskDefinition fixtures ---

export const timedTaskDef = (): TaskDefinition => ({
  id: 'timed-task-1',
  name: 'Timed Send Task',
  schedulingMode: 'timed',
  triggerSource: 'user-ui',
  steps: [
    sendStep({ id: 'step-1', frameId: 'frame-1' }),
    sendStep({ id: 'step-2', frameId: 'frame-2' }),
  ],
  targetId: 'target-1',
  errorPolicy: defaultErrorPolicy(),
  intervalMs: 1000,
  stopCondition: { maxIterations: 5 },
});

export const triggerTaskDef = (): TaskDefinition => ({
  id: 'trigger-task-1',
  name: 'Trigger Send Task',
  schedulingMode: 'trigger',
  triggerSource: 'receive-trigger',
  steps: [sendStep({ id: 'step-1', frameId: 'frame-1' })],
  targetId: 'target-1',
  errorPolicy: defaultErrorPolicy(),
  triggerCondition: waitConditions.eqNumeric(),
  cooldownMs: 500,
  stopCondition: { maxIterations: 10 },
});

export const sequenceTaskDef = (): TaskDefinition => ({
  id: 'sequence-task-1',
  name: 'Sequence Send Task',
  schedulingMode: 'sequence',
  triggerSource: 'user-ui',
  steps: [
    sendStep({ id: 'step-1', frameId: 'frame-1' }),
    delayStep('step-2', 500),
    sendStep({ id: 'step-3', frameId: 'frame-2' }),
  ],
  targetId: 'target-1',
  errorPolicy: defaultErrorPolicy(),
});

export const scoeModeTaskDef = (): TaskDefinition => ({
  id: 'scoe-task-1',
  name: 'SCOE Command Execution',
  schedulingMode: 'sequence',
  triggerSource: 'scoe-command',
  steps: [
    sendStep({ id: 'send-cmd', frameId: 'scoe-cmd-frame' }),
    waitConditionStep('wait-completion', {
      frameId: 'scoe-response-frame',
      fieldId: 'status-field',
      operator: 'eq',
      threshold: 1,
    }, 10000),
    sendStep({ id: 'send-ack', frameId: 'scoe-ack-frame' }),
  ],
  errorPolicy: { onFailure: 'stop' },
});

// --- ErrorPolicy fixtures ---

export const errorPolicies = {
  stopOnFailure: (): TaskErrorPolicy => ({ onFailure: 'stop' }),
  retryTwice: (): TaskErrorPolicy => ({ onFailure: 'retry', retryCount: 2, retryDelayMs: 100 }),
  skipStep: (): TaskErrorPolicy => ({ onFailure: 'skip-step' }),
  pauseOnFailure: (): TaskErrorPolicy => ({ onFailure: 'pause' }),
};

// --- ConditionMatchInput fixtures ---

export const matchInputs = {
  matchingNumeric: (): ConditionMatchInput => ({
    frameId: 'frame-1',
    fieldValues: { 'field-1': 100 },
  }),
  matchingString: (): ConditionMatchInput => ({
    frameId: 'frame-1',
    fieldValues: { 'field-1': 'OK' },
  }),
  nonMatchingNumeric: (): ConditionMatchInput => ({
    frameId: 'frame-1',
    fieldValues: { 'field-1': 50 },
  }),
  nullValue: (): ConditionMatchInput => ({
    frameId: 'frame-1',
    fieldValues: { 'field-1': null },
  }),
  differentFrame: (): ConditionMatchInput => ({
    frameId: 'frame-2',
    fieldValues: { 'field-2': 100 },
  }),
  withSourceA: (): ConditionMatchInput => ({
    frameId: 'frame-1',
    fieldValues: { 'field-1': 100 },
    sourceId: 'source-A',
  }),
  withSourceB: (): ConditionMatchInput => ({
    frameId: 'frame-1',
    fieldValues: { 'field-1': 100 },
    sourceId: 'source-B',
  }),
};

// --- TaskInstanceState fixture helpers ---

export function makeSendResult(overrides: Partial<{ kind: string; bytesBuilt: number; bytesSent: number }> = {}) {
  return {
    kind: (overrides.kind ?? 'sent') as 'sent',
    requestRef: { frameId: 'frame-1', targetId: 'target-1', context: { source: 'task' as const } },
    bytesBuilt: overrides.bytesBuilt ?? 10,
    bytesSent: overrides.bytesSent ?? 10,
    timestamp: '2026-05-06T12:00:00.000Z',
    buildIssues: [],
  };
}

export function makeInstance(
  overrides: Partial<TaskInstanceState> = {},
): TaskInstanceState {
  return {
    instanceId: 'inst-1',
    definitionRef: timedTaskDef(),
    lifecycle: 'created',
    currentStepIndex: 0,
    currentIteration: 0,
    stepResults: [],
    ...overrides,
  };
}

export function makeSendStepResult(
  overrides: Partial<TaskStepResult> & { kind?: 'send' } = {},
): TaskStepResult {
  return {
    kind: 'send',
    stepIndex: 0,
    iteration: 0,
    sendResult: makeSendResult(),
    ...overrides,
  } as TaskStepResult;
}

export function makeWaitStepResult(
  overrides: Partial<TaskStepResult> & { kind?: 'wait-condition' } = {},
): TaskStepResult {
  return {
    kind: 'wait-condition',
    stepIndex: 0,
    iteration: 0,
    matched: true,
    timedOut: false,
    ...overrides,
  } as TaskStepResult;
}

export function makeDelayStepResult(
  overrides: Partial<TaskStepResult> & { kind?: 'delay' } = {},
): TaskStepResult {
  return {
    kind: 'delay',
    stepIndex: 0,
    iteration: 0,
    completed: true,
    ...overrides,
  } as TaskStepResult;
}
