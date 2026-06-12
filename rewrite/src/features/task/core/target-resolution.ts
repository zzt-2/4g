import type { SendStepConfig, TaskDefinition } from './types';

/**
 * Resolve the effective send target for a step.
 *
 * Chain: step.config.targetId → definition.defaultTargetId.
 * Returns undefined when neither is set; callers (validation / runtime)
 * decide how to react.
 */
export function resolveSendTargetId(
  stepConfig: SendStepConfig,
  definition: TaskDefinition,
): string | undefined {
  return stepConfig.targetId ?? definition.defaultTargetId;
}
