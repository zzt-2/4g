import {
  cloneHealthSummary,
  cloneIndicatorConfig,
  cloneIndicatorProjection,
  cloneStatusSnapshot,
  type HealthSummary,
  type IndicatorConfig,
  type IndicatorProjection,
  type ReadonlyStatusSnapshot,
  type StatusSnapshot,
} from '../core';

export function selectStatusSnapshot(
  source: ReadonlyStatusSnapshot,
): StatusSnapshot {
  return cloneStatusSnapshot(source);
}

export function selectHealthSummary(source: ReadonlyStatusSnapshot): HealthSummary {
  return cloneHealthSummary(source.health);
}

export function selectHealthLevel(
  source: ReadonlyStatusSnapshot,
): HealthSummary['overallLevel'] {
  return source.health.overallLevel;
}

export function selectIndicatorProjections(
  source: ReadonlyStatusSnapshot,
): IndicatorProjection[] {
  return source.indicators.map(cloneIndicatorProjection);
}

export function selectIndicatorConfigs(
  source: ReadonlyStatusSnapshot,
): IndicatorConfig[] {
  return source.indicatorConfigs.map(cloneIndicatorConfig);
}

export function selectIndicatorProjectionById(
  source: ReadonlyStatusSnapshot,
  id: string,
): IndicatorProjection | undefined {
  const projection = source.indicators.find((i) => i.id === id);
  return projection ? cloneIndicatorProjection(projection) : undefined;
}
