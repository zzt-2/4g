import { ref, computed, shallowRef } from 'vue';
import type { TaskService } from '../services';
import type {
  TaskDefinition,
  TaskStepDefinition,
  ScheduleDriver,
  TaskErrorPolicy,
  TaskStopCondition,
  SendStepConfig,
  ConditionTerm,
  StepRepeat,
} from '../core';
import { validateTaskDefinition, createTaskDefinition, cloneStepDefinition, applyDefaultTargetOverride } from '../core';
import type { TaskValidationIssue } from '../core/task-validation';
import { deepToRaw } from './deep-raw';

export function useTaskEditor(taskService: TaskService) {
  const isEditing = ref(false);
  const editingInstanceId = ref<string | null>(null);
  const isSaving = ref(false);

  // Form state
  const taskName = ref('');
  const scheduleKind = ref<ScheduleDriver['kind']>('immediate');
  const timerIntervalMs = ref(1000);
  const timerInfinite = ref(false);
  const timerIterations = ref(1);
  const eventConditions = ref<ConditionTerm[]>([]);
  const eventCooldownMs = ref(0);
  const steps = ref<TaskStepDefinition[]>([]);
  const stopCondition = ref<TaskStopCondition>({});
  const errorPolicy = ref<TaskErrorPolicy>({
    onFailure: 'stop',
  });
  const defaultTargetId = ref<string | null>(null);

  const validationIssues = shallowRef<TaskValidationIssue[]>([]);

  const hasErrors = computed(() =>
    validationIssues.value.some((i) => i.severity === 'error'),
  );

  function buildScheduleDriver(): ScheduleDriver {
    switch (scheduleKind.value) {
      case 'immediate':
        return { kind: 'immediate' };
      case 'timer':
        return { kind: 'timer', intervalMs: timerIntervalMs.value };
      case 'event':
        return {
          kind: 'event',
          conditions: eventConditions.value,
          cooldownMs: eventCooldownMs.value || undefined,
        };
    }
  }

  function buildStopCondition(): TaskStopCondition | undefined {
    const sc: TaskStopCondition = { ...stopCondition.value };
    if (scheduleKind.value === 'timer' && !timerInfinite.value) {
      sc.maxIterations = timerIterations.value;
    }
    return Object.keys(sc).length > 0 ? sc : undefined;
  }

  function buildDefinition(): TaskDefinition {
    const def = createTaskDefinition({
      id: editingInstanceId.value ?? `task-${Date.now()}`,
      name: taskName.value,
      schedule: buildScheduleDriver(),
      steps: steps.value,
      errorPolicy: errorPolicy.value,
      stopCondition: buildStopCondition(),
      ...(defaultTargetId.value ? { defaultTargetId: defaultTargetId.value } : {}),
    });
    return deepToRaw(def);
  }

  function validate(): boolean {
    const def = buildDefinition();
    const issues = validateTaskDefinition(def);
    validationIssues.value = issues;
    return !issues.some((i) => i.severity === 'error');
  }

  function openNew(): void {
    editingInstanceId.value = null;
    taskName.value = '';
    scheduleKind.value = 'immediate';
    timerIntervalMs.value = 1000;
    timerInfinite.value = false;
    timerIterations.value = 1;
    eventConditions.value = [];
    eventCooldownMs.value = 0;
    steps.value = [];
    stopCondition.value = {};
    errorPolicy.value = { onFailure: 'stop' };
    defaultTargetId.value = null;
    validationIssues.value = [];
    isEditing.value = true;
  }

  function openEdit(instanceId: string): void {
    const instance = taskService.getInstance(instanceId);
    if (!instance) return;
    if (instance.lifecycle !== 'created') return;

    editingInstanceId.value = instanceId;
    const def = instance.definitionRef;
    taskName.value = def.name;
    scheduleKind.value = def.schedule.kind;

    if (def.schedule.kind === 'timer') {
      timerIntervalMs.value = def.schedule.intervalMs;
    }
    if (def.schedule.kind === 'event') {
      eventConditions.value = def.schedule.conditions.map((c) => ({ ...c }));
      eventCooldownMs.value = def.schedule.cooldownMs ?? 0;
    }

    steps.value = def.steps.map(cloneStepDefinition);
    stopCondition.value = def.stopCondition ? { ...def.stopCondition } : {};
    errorPolicy.value = { ...def.errorPolicy };

    defaultTargetId.value = def.defaultTargetId ?? null;

    if (stopCondition.value.maxIterations !== undefined) {
      timerIterations.value = stopCondition.value.maxIterations;
      timerInfinite.value = false;
    } else if (def.schedule.kind === 'timer') {
      timerInfinite.value = true;
    }

    validationIssues.value = [];
    isEditing.value = true;
  }

  function save(): string | null {
    if (!validate()) return null;
    isSaving.value = true;
    try {
      const def = buildDefinition();
      if (editingInstanceId.value) {
        taskService.updateTask(editingInstanceId.value, def);
      } else {
        const inst = taskService.createTask(def);
        editingInstanceId.value = inst.instanceId;
      }
      isEditing.value = false;
      return editingInstanceId.value;
    } finally {
      isSaving.value = false;
    }
  }

  function saveAndStart(): string | null {
    const id = save();
    if (id) {
      taskService.startTask(id);
    }
    return id;
  }

  function close(): void {
    isEditing.value = false;
    editingInstanceId.value = null;
  }

  function addStep(step: TaskStepDefinition): void {
    steps.value = [...steps.value, step];
  }

  function removeStep(index: number): void {
    steps.value = steps.value.filter((_, i) => i !== index);
  }

  function updateStep(index: number, step: TaskStepDefinition): void {
    steps.value = steps.value.map((s, i) => (i === index ? step : s));
  }

  function addEventCondition(): void {
    eventConditions.value = [
      ...eventConditions.value,
      { frameId: '', fieldId: '', operator: 'eq', threshold: '' },
    ];
  }

  function removeEventCondition(index: number): void {
    eventConditions.value = eventConditions.value.filter((_, i) => i !== index);
  }

  function updateEventCondition(index: number, cond: ConditionTerm): void {
    eventConditions.value = eventConditions.value.map((c, i) =>
      i === index ? cond : c,
    );
  }

  function duplicateStepValuesFromPrevious(stepIndex: number): void {
    if (stepIndex <= 0) return;
    const prev = steps.value[stepIndex - 1];
    const curr = steps.value[stepIndex];
    if (prev.kind === 'send' && curr.kind === 'send') {
      const prevConfig = prev.config as SendStepConfig;
      const currConfig = { ...curr.config } as SendStepConfig;
      if (prevConfig.userFieldValues) {
        currConfig.userFieldValues = { ...prevConfig.userFieldValues };
      }
      updateStep(stepIndex, { ...curr, config: currConfig });
    }
  }

  function clearAllStepTargetOverrides(): void {
    steps.value = steps.value.map((step) => {
      if (step.kind !== 'send') return step;
      const { targetId: _omit, ...rest } = step.config as SendStepConfig;
      void _omit;
      return { ...step, config: { ...rest } } as TaskStepDefinition;
    });
  }

  // 批量设置发送目标（任务级）：写 defaultTargetId + 清空所有 send step 的 step 级 targetId 覆盖。
  function setAllStepTargetOverrides(targetId: string | null): void {
    const draft = {
      id: 'draft',
      name: 'draft',
      steps: steps.value,
      schedule: { kind: 'immediate' },
      errorPolicy: errorPolicy.value,
      ...(defaultTargetId.value ? { defaultTargetId: defaultTargetId.value } : {}),
    } as TaskDefinition;
    const next = applyDefaultTargetOverride(draft, targetId);
    steps.value = [...next.steps];
    defaultTargetId.value = next.defaultTargetId ?? null;
  }

  function updateStepRepeat(index: number, repeat: StepRepeat | undefined): void {
    const step = steps.value[index];
    if (step.kind !== 'send') return;
    const config = { ...(step.config as SendStepConfig), repeat };
    updateStep(index, { ...step, config });
  }

  function addExitCondition(): void {
    const sc = { ...stopCondition.value };
    const conds = [...(sc.exitCondition ?? []), { frameId: '', fieldId: '', operator: 'eq' as const, threshold: '' }];
    stopCondition.value = { ...sc, exitCondition: conds };
  }

  function removeExitCondition(index: number): void {
    const sc = { ...stopCondition.value };
    const conds = (sc.exitCondition ?? []).filter((_, i) => i !== index);
    stopCondition.value = { ...sc, exitCondition: conds };
  }

  return {
    isEditing,
    editingInstanceId,
    isSaving,
    taskName,
    scheduleKind,
    timerIntervalMs,
    timerInfinite,
    timerIterations,
    eventConditions,
    eventCooldownMs,
    steps,
    stopCondition,
    errorPolicy,
    defaultTargetId,
    validationIssues,
    hasErrors,
    openNew,
    openEdit,
    save,
    saveAndStart,
    close,
    addStep,
    removeStep,
    updateStep,
    addEventCondition,
    removeEventCondition,
    updateEventCondition,
    duplicateStepValuesFromPrevious,
    clearAllStepTargetOverrides,
    setAllStepTargetOverrides,
    updateStepRepeat,
    addExitCondition,
    removeExitCondition,
  };
}
