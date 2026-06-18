import type {
  TaskDefinition,
  TaskStepDefinition,
  ConditionTerm,
  FieldValueResolver,
} from '@/features/task';
import type { ParsedCommand } from './protocol-adapter';
import type {
  CompletionConditionConfig,
} from './types';

/**
 * Build ConditionTerm[] from CompletionConditionConfig[].
 * Supports both fixed-value and parameterized modes (findIndex alignment).
 */
export function buildWaitConditions(
  command: ParsedCommand,
  condConfigs?: readonly CompletionConditionConfig[],
): ConditionTerm[] {
  if (!condConfigs || condConfigs.length === 0) return [];

  return condConfigs.map((condConfig) => {
    if (condConfig.useParam && condConfig.targetParamId) {
      const paramValue = command.resolvedParams[condConfig.targetParamId];
      const param = command.commandConfig.params?.find(
        (p) => p.id === condConfig.targetParamId,
      );
      const optionIndex =
        param?.options.findIndex((o) => o.value === paramValue) ?? -1;
      const condOption = condConfig.options?.[optionIndex];

      return {
        frameId: condConfig.sourceFrameId,
        fieldId: condConfig.sourceFieldId,
        operator: condOption?.operator ?? ('eq' as const),
        threshold: condOption?.matchValue ?? '',
      };
    }

    return {
      frameId: condConfig.sourceFrameId,
      fieldId: condConfig.sourceFieldId,
      operator: condConfig.operator ?? ('eq' as const),
      threshold: condConfig.targetFixedValue ?? '',
    };
  });
}

/**
 * SEND_FRAME → TaskDefinition.
 * Uses schedule: { kind: 'immediate' }, one send step per frame mapping,
 * optional delay steps for sendInterval, and a wait-condition step for completion.
 */
export function buildSendFrameTask(
  command: ParsedCommand,
): TaskDefinition {
  const config = command.commandConfig;
  const steps: TaskStepDefinition[] = [];

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

    if (config.sendInterval && config.sendInterval > 0) {
      steps.push({
        id: `delay-after-${mapping.instanceId}`,
        kind: 'delay',
        config: { durationMs: config.sendInterval },
      });
    }
  }

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

/**
 * READ_FILE_AND_SEND → TaskDefinition.
 * Uses schedule: { kind: 'timer' } + fieldVariations + stopCondition.maxIterations.
 */
export function buildReadFileAndSendTask(
  command: ParsedCommand,
  fileLines: readonly string[],
): TaskDefinition {
  const config = command.commandConfig;
  const mapping = config.frameMappings?.[0];
  if (!mapping) throw new Error('No frame mapping for READ_FILE_AND_SEND');

  const fileParam = config.params?.find((p) => p.value?.includes('.txt'));
  const fileFieldMapping = mapping.fieldMappings.find(
    (fm) => fm.source === 'param' && fm.paramId === fileParam?.id,
  );

  const waitConditions = buildWaitConditions(command, config.completionConditions);
  const steps: TaskStepDefinition[] = [];

  // 文件行作为字段级 variation resolver 挂到 send step(取代任务级 fieldVariations)
  const fieldResolvers: FieldValueResolver[] = fileFieldMapping
    ? [{ kind: 'variation', fieldId: fileFieldMapping.fieldId, values: [...fileLines] }]
    : [];

  steps.push({
    id: 'send-rfs',
    kind: 'send',
    config: {
      frameId: mapping.frameId,
      targetId: mapping.targetId,
      userFieldValues: {},
      // 文件行作为离散值列表,按 step 内 counter 取值,clamp 到最后一个
      ...(fieldResolvers.length > 0 ? { fieldResolvers } : {}),
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
    stopCondition: { maxIterations: fileLines.length },
    errorPolicy: { onFailure: 'stop' },
  };
}
