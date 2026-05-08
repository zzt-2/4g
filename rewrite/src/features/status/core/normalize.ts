import type {
  IndicatorConfig,
  IndicatorConfigNormalization,
  StatusValidationIssue,
} from './types';

export function normalizeIndicatorConfigs(
  raw: readonly unknown[],
): IndicatorConfigNormalization {
  const configs: IndicatorConfig[] = [];
  const issues: StatusValidationIssue[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | null | undefined;

    if (!item || typeof item !== 'object') {
      issues.push({
        severity: 'warning',
        code: 'status.indicatorConfig.invalidEntry',
        path: `indicatorConfigs[${i}]`,
        message: `Entry at index ${i} is not a valid object, skipped.`,
      });
      continue;
    }

    const id = typeof item.id === 'string' ? item.id : '';
    const label = typeof item.label === 'string' ? item.label : '';
    const groupId = typeof item.groupId === 'string' ? item.groupId : '';
    const dataItemId = typeof item.dataItemId === 'string' ? item.dataItemId : '';
    const enabled = typeof item.enabled === 'boolean' ? item.enabled : true;

    if (!id) {
      issues.push({
        severity: 'error',
        code: 'status.indicatorConfig.missingId',
        path: `indicatorConfigs[${i}].id`,
        message: `Indicator at index ${i} is missing a valid id, skipped.`,
      });
      continue;
    }

    if (!groupId || !dataItemId) {
      issues.push({
        severity: 'warning',
        code: 'status.indicatorConfig.missingBinding',
        path: `indicatorConfigs[${i}]`,
        message: `Indicator "${id}" is missing groupId or dataItemId; will show no-data.`,
      });
    }

    configs.push({
      id,
      label,
      groupId,
      dataItemId,
      enabled,
      ...(typeof item.warningThreshold === 'number' ? { warningThreshold: item.warningThreshold } : {}),
      ...(typeof item.errorThreshold === 'number' ? { errorThreshold: item.errorThreshold } : {}),
      ...(typeof item.rangeMin === 'number' ? { rangeMin: item.rangeMin } : {}),
      ...(typeof item.rangeMax === 'number' ? { rangeMax: item.rangeMax } : {}),
    });
  }

  return { configs, issues };
}
