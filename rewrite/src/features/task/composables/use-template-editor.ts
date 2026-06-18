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
  CustomerSyncMeta,
} from '../core';
import { validateTaskDefinition, createTaskDefinition, cloneStepDefinition } from '../core';
import type { TaskValidationIssue } from '../core/task-validation';
import { deepToRaw } from './deep-raw';

export function useTemplateEditor(taskService: TaskService) {
  const isEditing = ref(false);
  const editingTemplateId = ref<string | null>(null);
  const isSaving = ref(false);

  // Form state
  const templateName = ref('');
  const templateTags = ref<string[]>([]);
  const tagInput = ref('');
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

  // customerSync 状态(上报给甲方)
  const syncEnabled = ref(false);
  const overridablePathsText = ref(''); // 每行一个路径

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
      id: editingTemplateId.value ?? `tpl-def-${Date.now()}`,
      name: templateName.value,
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

  function resetForm(): void {
    templateName.value = '';
    templateTags.value = [];
    tagInput.value = '';
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
    syncEnabled.value = false;
    overridablePathsText.value = '';
    validationIssues.value = [];
  }

  function openNew(): void {
    editingTemplateId.value = null;
    resetForm();
    isEditing.value = true;
  }

  function openEdit(templateId: string): void {
    const tpl = taskService.getTemplate(templateId);
    if (!tpl) return;

    editingTemplateId.value = templateId;
    templateName.value = tpl.name;
    templateTags.value = [...tpl.tags];
    tagInput.value = '';

    // 加载 customerSync 状态
    syncEnabled.value = tpl.customerSync?.enabled ?? false;
    overridablePathsText.value = (tpl.customerSync?.overridablePaths ?? []).join('\n');

    const def = tpl.definition;
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
      // 构建 customerSync(仅当启用时)
      const overridablePaths = overridablePathsText.value
        .split('\n').map(s => s.trim()).filter(s => s.length > 0);
      const customerSync: CustomerSyncMeta | undefined = syncEnabled.value
        ? { enabled: true, overridablePaths }
        : undefined;

      if (editingTemplateId.value) {
        taskService.updateTemplate(editingTemplateId.value, {
          name: templateName.value,
          tags: [...templateTags.value],
          definition: def,
          customerSync,
        });
        isEditing.value = false;
        return editingTemplateId.value;
      }
      const tpl = taskService.createTemplate(templateName.value, def, templateTags.value);
      // 新建模板若启用上报,立即 update 写入 customerSync
      if (customerSync) {
        taskService.updateTemplate(tpl.templateId, { customerSync });
      }
      isEditing.value = false;
      return tpl.templateId;
    } finally {
      isSaving.value = false;
    }
  }

  function close(): void {
    isEditing.value = false;
    editingTemplateId.value = null;
  }

  function addTag(): void {
    const v = tagInput.value.trim();
    if (!v) return;
    if (!templateTags.value.includes(v)) {
      templateTags.value = [...templateTags.value, v];
    }
    tagInput.value = '';
  }

  function removeTag(tag: string): void {
    templateTags.value = templateTags.value.filter((t) => t !== tag);
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
    editingTemplateId,
    isSaving,
    templateName,
    templateTags,
    tagInput,
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
    syncEnabled,
    overridablePathsText,
    validationIssues,
    hasErrors,
    openNew,
    openEdit,
    save,
    close,
    addTag,
    removeTag,
    addStep,
    removeStep,
    updateStep,
    addEventCondition,
    removeEventCondition,
    updateEventCondition,
    duplicateStepValuesFromPrevious,
    clearAllStepTargetOverrides,
    updateStepRepeat,
    addExitCondition,
    removeExitCondition,
  };
}
