import type {
  ConnectionStatusMaterial,
  HealthLevel,
  HealthSummary,
  ReceiveStatsMaterial,
  SourceHealthSummary,
} from './types';

export function deriveConnectionHealth(
  connections: readonly ConnectionStatusMaterial[],
): SourceHealthSummary {
  if (connections.length === 0) {
    return { source: 'connection', level: 'unknown', detail: 'no connection material' };
  }

  const hasError = connections.some(
    (c) => c.lifecycle === 'error' || c.errorCount > 0,
  );
  if (hasError) {
    const errorConn = connections.find(
      (c) => c.lifecycle === 'error' || c.errorCount > 0,
    );
    return {
      source: 'connection',
      level: 'error',
      detail: errorConn?.lastError ?? `error count: ${errorConn?.errorCount}`,
    };
  }

  const hasUnavailable = connections.some((c) => !c.available);
  const hasConnecting = connections.some(
    (c) => c.lifecycle === 'connecting' || c.lifecycle === 'disconnecting',
  );
  if (hasUnavailable || hasConnecting) {
    return { source: 'connection', level: 'degraded', detail: 'not all connections available' };
  }

  return { source: 'connection', level: 'healthy' };
}

export function deriveReceiveHealth(
  stats: ReceiveStatsMaterial | undefined,
): SourceHealthSummary {
  if (!stats) {
    return { source: 'receive', level: 'unknown', detail: 'no receive material' };
  }

  if (stats.errorCount > 0) {
    return { source: 'receive', level: 'error', detail: `error count: ${stats.errorCount}` };
  }

  if (stats.unmatchedCount > 0 && stats.matchedCount === 0) {
    return { source: 'receive', level: 'degraded', detail: 'unmatched frames, no matches' };
  }

  if (stats.matchedCount > 0) {
    return { source: 'receive', level: 'healthy' };
  }

  return { source: 'receive', level: 'unknown', detail: 'no data' };
}

export function deriveOverallHealthLevel(sources: readonly SourceHealthSummary[]): HealthLevel {
  if (sources.length === 0) {
    return 'unknown';
  }

  if (sources.some((s) => s.level === 'error')) {
    return 'error';
  }

  if (sources.some((s) => s.level === 'degraded')) {
    return 'degraded';
  }

  if (sources.every((s) => s.level === 'healthy')) {
    return 'healthy';
  }

  return 'unknown';
}

export function deriveHealthSummary(
  connections: readonly ConnectionStatusMaterial[],
  receiveStats: ReceiveStatsMaterial | undefined,
  now: string = new Date().toISOString(),
): HealthSummary {
  const sources: SourceHealthSummary[] = [];

  if (connections.length > 0) {
    sources.push(deriveConnectionHealth(connections));
  }

  if (receiveStats) {
    sources.push(deriveReceiveHealth(receiveStats));
  }

  return {
    overallLevel: deriveOverallHealthLevel(sources),
    sources,
    lastChangedAt: now,
  };
}
