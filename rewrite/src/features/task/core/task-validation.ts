import type { TaskDefinition, SendStepConfig, WaitConditionConfig, TaskStopCondition } from './types';

export interface TaskValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly stepId?: string;
}

export function validateTaskDefinition(def: TaskDefinition): TaskValidationIssue[] {
  const issues: TaskValidationIssue[] = [];

  if (!def.id) {
    issues.push({ severity: 'error', code: 'task.definition.missingId', message: 'Task definition id is required.' });
  }

  if (!def.name) {
    issues.push({ severity: 'error', code: 'task.definition.missingName', message: 'Task definition name is required.' });
  }

  if (!def.steps || def.steps.length === 0) {
    issues.push({ severity: 'error', code: 'task.definition.emptySteps', message: 'Task must have at least one step.' });
    return issues;
  }

  const stepIds = new Set<string>();
  for (const step of def.steps) {
    if (!step.id) {
      issues.push({ severity: 'error', code: 'task.step.missingId', message: `Step at index ${def.steps.indexOf(step)} is missing an id.` });
    } else if (stepIds.has(step.id)) {
      issues.push({ severity: 'error', code: 'task.step.duplicateId', message: `Duplicate step id: "${step.id}".`, stepId: step.id });
    } else {
      stepIds.add(step.id);
    }

    switch (step.kind) {
      case 'send':
        issues.push(...validateSendStepConfig(step.id, step.config));
        break;
      case 'wait-condition':
        issues.push(...validateWaitConditionConfig(step.id, step.config));
        break;
      case 'delay':
        if (!step.config.durationMs || step.config.durationMs <= 0) {
          issues.push({ severity: 'error', code: 'task.step.invalidDelay', message: `Delay step "${step.id}" must have durationMs > 0.`, stepId: step.id });
        }
        break;
    }
  }

  if (def.stopCondition) {
    issues.push(...validateStopCondition(def.stopCondition));
  }

  return issues;
}

function validateSendStepConfig(stepId: string, config: SendStepConfig): TaskValidationIssue[] {
  const issues: TaskValidationIssue[] = [];
  if (!config.frameId) {
    issues.push({ severity: 'error', code: 'task.step.send.missingFrameId', message: `Send step "${stepId}" must have a frameId.`, stepId });
  }
  if (!config.targetId) {
    issues.push({ severity: 'error', code: 'task.step.send.missingTargetId', message: `Send step "${stepId}" must have a targetId.`, stepId });
  }
  return issues;
}

function validateWaitConditionConfig(stepId: string, config: WaitConditionConfig): TaskValidationIssue[] {
  const issues: TaskValidationIssue[] = [];
  if (!config.conditions || config.conditions.length === 0) {
    issues.push({ severity: 'error', code: 'task.step.wait.emptyConditions', message: `Wait-condition step "${stepId}" must have at least one condition.`, stepId });
  }
  if (config.timeoutMs !== undefined && config.timeoutMs <= 0) {
    issues.push({ severity: 'warning', code: 'task.step.wait.invalidTimeout', message: `Wait-condition step "${stepId}" has timeoutMs <= 0.`, stepId });
  }
  return issues;
}

function validateStopCondition(cond: TaskStopCondition): TaskValidationIssue[] {
  const issues: TaskValidationIssue[] = [];
  if (cond.maxIterations !== undefined && cond.maxIterations <= 0) {
    issues.push({ severity: 'warning', code: 'task.stop.invalidMaxIterations', message: 'maxIterations should be > 0.' });
  }
  if (cond.maxDurationMs !== undefined && cond.maxDurationMs <= 0) {
    issues.push({ severity: 'warning', code: 'task.stop.invalidMaxDuration', message: 'maxDurationMs should be > 0.' });
  }
  return issues;
}
