import type { TaskDefinition } from '@/features/task/core';
import { createTaskDefinition, createDelayStep } from '@/features/task/core';
import type { TestCaseInfo } from './types';

/**
 * Mock: creates a task that auto-completes after a delay.
 * Replace with translateTestCaseToTaskDefinition when hardware is connected.
 *
 * MVP strategy (S008 round 3): always emit a single 1.5s delay step regardless of
 * inputPars content. Real translation depends on frame feature (frameId resolution
 * for each parId) and condition feature, which is out of scope for this round.
 */
export function translateTestCaseToMockTaskDefinition(tc: TestCaseInfo): TaskDefinition {
  return createTaskDefinition({
    id: `nb-${tc.testCaseId}-${Date.now()}`,
    name: tc.testCaseId,
    steps: [
      createDelayStep(1500, { id: 'step-mock', name: 'Mock execution' }),
    ],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
}

/**
 * TODO: real translation. Until frame feature (parId → frameId/fieldId mapping)
 * and condition feature are wired up, fall back to the same mock delay step.
 * Real translation will turn each InputPar into send/wait steps based on a
 * frame registry lookup; that mapping table does not exist yet.
 */
export function translateTestCaseToTaskDefinition(tc: TestCaseInfo): TaskDefinition {
  return translateTestCaseToMockTaskDefinition(tc);
}
