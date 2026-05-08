import type {
  HealthSummary,
  IndicatorConfig,
  IndicatorProjection,
  SourceHealthSummary,
  StatusSnapshot,
} from './types';

export function cloneSourceHealthSummary(source: SourceHealthSummary): SourceHealthSummary {
  return { ...source };
}

export function cloneHealthSummary(health: HealthSummary): HealthSummary {
  return {
    overallLevel: health.overallLevel,
    sources: health.sources.map(cloneSourceHealthSummary),
    ...(health.lastChangedAt ? { lastChangedAt: health.lastChangedAt } : {}),
  };
}

export function cloneIndicatorConfig(config: IndicatorConfig): IndicatorConfig {
  return { ...config };
}

export function cloneIndicatorProjection(projection: IndicatorProjection): IndicatorProjection {
  return { ...projection };
}

export function cloneStatusSnapshot(snapshot: StatusSnapshot): StatusSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    health: cloneHealthSummary(snapshot.health),
    indicators: snapshot.indicators.map(cloneIndicatorProjection),
    indicatorConfigs: snapshot.indicatorConfigs.map(cloneIndicatorConfig),
    ...(snapshot.lastUpdatedAt ? { lastUpdatedAt: snapshot.lastUpdatedAt } : {}),
  };
}
