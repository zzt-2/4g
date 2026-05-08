import type { IndicatorConfig, IndicatorProjection, IndicatorStatusRole, ReceiveFieldMaterial } from './types';

export function evaluateIndicatorRole(
  config: IndicatorConfig,
  value: unknown,
): IndicatorStatusRole {
  if (!config.enabled) {
    return 'disabled';
  }

  if (value === undefined || value === null) {
    return 'no-data';
  }

  if (typeof value !== 'number') {
    return 'normal';
  }

  if (config.errorThreshold !== undefined && value >= config.errorThreshold) {
    return 'error';
  }

  if (
    config.rangeMax !== undefined &&
    config.rangeMin !== undefined &&
    (value < config.rangeMin || value > config.rangeMax)
  ) {
    return 'error';
  }

  if (config.warningThreshold !== undefined && value >= config.warningThreshold) {
    return 'warning';
  }

  return 'normal';
}

function findFieldValue(
  fields: readonly ReceiveFieldMaterial[],
  groupId: string,
  dataItemId: string,
): { value: unknown; receivedAt?: string } {
  const field = fields.find(
    (f) => f.groupId === groupId && f.dataItemId === dataItemId,
  );
  return field
    ? { value: field.value, receivedAt: field.receivedAt }
    : { value: undefined };
}

export function deriveIndicatorProjection(
  config: IndicatorConfig,
  fields: readonly ReceiveFieldMaterial[],
  now: string = new Date().toISOString(),
): IndicatorProjection {
  const { value, receivedAt } = findFieldValue(fields, config.groupId, config.dataItemId);

  return {
    id: config.id,
    label: config.label,
    groupId: config.groupId,
    dataItemId: config.dataItemId,
    role: evaluateIndicatorRole(config, value),
    currentValue: value,
    lastUpdatedAt: receivedAt ?? now,
  };
}

export function deriveAllIndicatorProjections(
  configs: readonly IndicatorConfig[],
  fields: readonly ReceiveFieldMaterial[],
  now: string = new Date().toISOString(),
): IndicatorProjection[] {
  return configs.map((config) => deriveIndicatorProjection(config, fields, now));
}
