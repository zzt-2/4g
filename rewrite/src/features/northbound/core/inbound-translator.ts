import type { TaskDefinition, TaskStepDefinition, ConditionTerm } from '@/features/task/core';
import { createTaskDefinition, createSendStep, createWaitConditionStep, createDelayStep } from '@/features/task/core';
import type { TestCaseInfo, TestCaseStep } from './types';

/**
 * Mock: creates a task that auto-completes after a delay.
 * Replace with translateTestCaseToTaskDefinition when hardware is connected.
 */
export function translateTestCaseToMockTaskDefinition(
  testCase: TestCaseInfo,
): TaskDefinition {
  return createTaskDefinition({
    id: `nb-${testCase.testCaseId}-${Date.now()}`,
    name: testCase.testCaseName,
    steps: [createDelayStep(1500, { id: 'step-mock', name: 'Mock execution' })],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
}

export function translateTestCaseToTaskDefinition(
  testCase: TestCaseInfo,
): TaskDefinition {
  const steps: TaskStepDefinition[] = [];

  for (let i = 0; i < testCase.steps.length; i++) {
    const step = testCase.steps[i]!;
    steps.push(translateStep(step, i));
  }

  return createTaskDefinition({
    id: `nb-${testCase.testCaseId}-${Date.now()}`,
    name: testCase.testCaseName,
    steps,
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
}

function translateStep(step: TestCaseStep, index: number): TaskStepDefinition {
  switch (step.kind) {
    case 'send':
      return createSendStep(
        {
          frameId: step.frameId,
          targetId: step.targetId,
          userFieldValues: step.fieldValues as Record<string, string | number | boolean> | undefined,
        },
        { id: `step-${index}`, name: `Send ${step.frameId}` },
      );

    case 'wait-condition': {
      const conditions: ConditionTerm[] = step.conditions.map((c, ci) => ({
        frameId: '',
        fieldId: c.fieldId,
        operator: c.operator as ConditionTerm['operator'],
        threshold: c.value as string | number,
      }));
      return createWaitConditionStep(
        {
          conditions,
          timeoutMs: step.timeoutMs ?? 5000,
          onTimeout: 'fail',
        },
        { id: `step-${index}`, name: `Wait condition ${index}` },
      );
    }
  }
}
