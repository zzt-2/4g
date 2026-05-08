import { describe, expect, it } from 'vitest';
import * as statusPublicApi from '../index';
import {
  cloneHealthSummary,
  cloneStatusSnapshot,
  createDefaultStatusSnapshot,
  deriveConnectionHealth,
  deriveHealthSummary,
  deriveOverallHealthLevel,
  deriveReceiveHealth,
  evaluateIndicatorRole,
  deriveIndicatorProjection,
  deriveAllIndicatorProjections,
  normalizeIndicatorConfigs,
  type IndicatorProjection,
  type StatusSnapshot,
} from '../core';
import { createStatusReader, createStatusService } from '../services';
import { createStatusState } from '../state';
import {
  connectedConnectionMaterial,
  connectingConnectionMaterial,
  defaultStatusFixture,
  errorConnectionMaterial,
  errorReceiveStats,
  healthyReceiveStats,
  invalidIndicatorConfigs,
  noDataReceiveFields,
  noMatchReceiveStats,
  partialIndicatorConfigs,
  sampleReceiveFields,
  validIndicatorConfigs,
} from '../fixtures/status-fixtures';

// --- Core: health derivation ---

describe('status core health derivation', () => {
  it('derives healthy from connected connections with no errors', () => {
    const result = deriveConnectionHealth([connectedConnectionMaterial]);
    expect(result.level).toBe('healthy');
    expect(result.source).toBe('connection');
  });

  it('derives error from connections with error lifecycle or error count', () => {
    const result = deriveConnectionHealth([errorConnectionMaterial]);
    expect(result.level).toBe('error');
    expect(result.detail).toBeTruthy();
  });

  it('derives degraded from connecting or unavailable connections', () => {
    const result = deriveConnectionHealth([connectingConnectionMaterial]);
    expect(result.level).toBe('degraded');
  });

  it('derives unknown when no connection material provided', () => {
    const result = deriveConnectionHealth([]);
    expect(result.level).toBe('unknown');
  });

  it('derives healthy receive from good stats', () => {
    const result = deriveReceiveHealth(healthyReceiveStats);
    expect(result.level).toBe('healthy');
    expect(result.source).toBe('receive');
  });

  it('derives error receive from error stats', () => {
    const result = deriveReceiveHealth(errorReceiveStats);
    expect(result.level).toBe('error');
  });

  it('derives degraded receive from unmatched-only stats', () => {
    const result = deriveReceiveHealth(noMatchReceiveStats);
    expect(result.level).toBe('degraded');
  });

  it('derives unknown receive when no stats provided', () => {
    const result = deriveReceiveHealth(undefined);
    expect(result.level).toBe('unknown');
  });

  it('derives overall health as worst case across sources', () => {
    expect(deriveOverallHealthLevel([
      { source: 'connection', level: 'healthy' },
      { source: 'receive', level: 'error' },
    ])).toBe('error');

    expect(deriveOverallHealthLevel([
      { source: 'connection', level: 'healthy' },
      { source: 'receive', level: 'degraded' },
    ])).toBe('degraded');

    expect(deriveOverallHealthLevel([
      { source: 'connection', level: 'healthy' },
      { source: 'receive', level: 'healthy' },
    ])).toBe('healthy');

    expect(deriveOverallHealthLevel([])).toBe('unknown');
  });

  it('derives full health summary combining connection and receive', () => {
    const summary = deriveHealthSummary(
      [connectedConnectionMaterial],
      healthyReceiveStats,
    );
    expect(summary.overallLevel).toBe('healthy');
    expect(summary.sources).toHaveLength(2);
    expect(summary.lastChangedAt).toBeTruthy();
  });

  it('derives error-level summary when connection has errors', () => {
    const summary = deriveHealthSummary(
      [errorConnectionMaterial],
      healthyReceiveStats,
    );
    expect(summary.overallLevel).toBe('error');
  });

  it('derives unknown summary when no material provided', () => {
    const summary = deriveHealthSummary([], undefined);
    expect(summary.overallLevel).toBe('unknown');
    expect(summary.sources).toHaveLength(0);
  });
});

// --- Core: indicator evaluation ---

describe('status core indicator evaluation', () => {
  it('evaluates disabled config as disabled', () => {
    const config = { ...validIndicatorConfigs[0], enabled: false };
    expect(evaluateIndicatorRole(config, 12.5)).toBe('disabled');
  });

  it('evaluates no data as no-data', () => {
    const config = validIndicatorConfigs[0];
    expect(evaluateIndicatorRole(config, undefined)).toBe('no-data');
    expect(evaluateIndicatorRole(config, null)).toBe('no-data');
  });

  it('evaluates normal for values below thresholds', () => {
    const config = validIndicatorConfigs[0]; // warningThreshold: 15, errorThreshold: 20
    expect(evaluateIndicatorRole(config, 12.5)).toBe('normal');
  });

  it('evaluates warning for values at or above warning threshold', () => {
    const config = validIndicatorConfigs[0];
    expect(evaluateIndicatorRole(config, 15)).toBe('warning');
    expect(evaluateIndicatorRole(config, 17)).toBe('warning');
  });

  it('evaluates error for values at or above error threshold', () => {
    const config = validIndicatorConfigs[0];
    expect(evaluateIndicatorRole(config, 20)).toBe('error');
    expect(evaluateIndicatorRole(config, 25)).toBe('error');
  });

  it('evaluates error for values outside range bounds', () => {
    const config = validIndicatorConfigs[1]; // rangeMin: -10, rangeMax: 60
    expect(evaluateIndicatorRole(config, -20)).toBe('error');
    expect(evaluateIndicatorRole(config, 70)).toBe('error');
  });

  it('evaluates normal for values within range', () => {
    const config = validIndicatorConfigs[1]; // rangeMin: -10, rangeMax: 60
    expect(evaluateIndicatorRole(config, 25)).toBe('normal');
  });

  it('evaluates normal for non-numeric values when no thresholds', () => {
    const config = { ...validIndicatorConfigs[0], warningThreshold: undefined, errorThreshold: undefined };
    expect(evaluateIndicatorRole(config, 'hello')).toBe('normal');
  });

  it('derives indicator projection from config and fields', () => {
    const config = validIndicatorConfigs[0];
    const projection = deriveIndicatorProjection(config, sampleReceiveFields);

    expect(projection.id).toBe('indicator-voltage');
    expect(projection.role).toBe('normal');
    expect(projection.currentValue).toBe(12.5);
    expect(projection.groupId).toBe('group-1');
  });

  it('derives no-data projection when field not found', () => {
    const config = validIndicatorConfigs[0];
    const projection = deriveIndicatorProjection(config, noDataReceiveFields);

    expect(projection.role).toBe('no-data');
    expect(projection.currentValue).toBeUndefined();
  });

  it('derives all indicator projections', () => {
    const projections = deriveAllIndicatorProjections(validIndicatorConfigs, sampleReceiveFields);

    expect(projections).toHaveLength(3);
    expect(projections[0].role).toBe('normal'); // voltage 12.5 < 15
    expect(projections[1].role).toBe('normal'); // temperature 25.3 in range
    expect(projections[2].role).toBe('disabled'); // pressure disabled
  });
});

// --- Core: normalization ---

describe('status core normalization', () => {
  it('normalizes valid indicator configs', () => {
    const result = normalizeIndicatorConfigs(validIndicatorConfigs);
    expect(result.configs).toHaveLength(3);
    expect(result.issues).toHaveLength(0);

    expect(result.configs[0].id).toBe('indicator-voltage');
    expect(result.configs[0].warningThreshold).toBe(15);
    expect(result.configs[0].errorThreshold).toBe(20);
  });

  it('reports warnings for missing groupId or dataItemId', () => {
    const result = normalizeIndicatorConfigs(partialIndicatorConfigs);
    expect(result.configs).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('status.indicatorConfig.missingBinding');
  });

  it('skips entries without valid id and reports errors', () => {
    const result = normalizeIndicatorConfigs(invalidIndicatorConfigs);
    expect(result.configs).toHaveLength(0);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.issues.map((i) => i.code)).toContain('status.indicatorConfig.missingId');
    expect(result.issues.map((i) => i.code)).toContain('status.indicatorConfig.invalidEntry');
  });
});

// --- Core: defaults and clone ---

describe('status core defaults and clone', () => {
  it('creates default snapshot as independent copy', () => {
    const a = createDefaultStatusSnapshot();
    const b = createDefaultStatusSnapshot();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a).toEqual(defaultStatusFixture);
  });

  it('clones health summary without sharing references', () => {
    const summary = deriveHealthSummary([connectedConnectionMaterial], healthyReceiveStats);
    const cloned = cloneHealthSummary(summary);

    expect(cloned).toEqual(summary);
    expect(cloned.sources).not.toBe(summary.sources);
  });

  it('clones status snapshot without sharing references', () => {
    const snapshot = createDefaultStatusSnapshot();
    const cloned = cloneStatusSnapshot(snapshot);

    expect(cloned).toEqual(snapshot);
    expect(cloned).not.toBe(snapshot);
    expect(cloned.indicators).not.toBe(snapshot.indicators);
    expect(cloned.health.sources).not.toBe(snapshot.health.sources);
  });
});

// --- State: isolation ---

describe('status state isolation', () => {
  it('returns snapshot copies instead of internal references', () => {
    const state = createStatusState();
    const snap = state.getSnapshot() as StatusSnapshot;

    // mutate the returned snapshot
    const health = snap.health as { overallLevel: string };
    health.overallLevel = 'mutated';

    expect(state.getSnapshot().health.overallLevel).toBe('unknown');
  });

  it('stores replaced copies instead of caller references', () => {
    const state = createStatusState();
    const snapshot = createDefaultStatusSnapshot();
    const health = snapshot.health as { overallLevel: string };
    health.overallLevel = 'healthy';

    state.replaceSnapshot(snapshot);

    // mutate caller reference after replace
    health.overallLevel = 'mutated-again';

    expect(state.getSnapshot().health.overallLevel).toBe('healthy');
  });
});

// --- Service ---

describe('status service', () => {
  it('ingests connection and receive material, deriving health', () => {
    const service = createStatusService();

    const result = service.ingest({
      connections: [connectedConnectionMaterial],
      receiveStats: healthyReceiveStats,
    });

    expect(result.snapshot.health.overallLevel).toBe('healthy');
    expect(service.getHealthLevel()).toBe('healthy');
    expect(result.issues).toHaveLength(0);
  });

  it('ingests error material and reflects error health', () => {
    const service = createStatusService();

    service.ingest({
      connections: [errorConnectionMaterial],
      receiveStats: errorReceiveStats,
    });

    expect(service.getHealthLevel()).toBe('error');
  });

  it('updates indicator configs and derives projections', () => {
    const service = createStatusService();

    service.updateIndicatorConfigs(validIndicatorConfigs);
    service.ingest({
      receiveFields: sampleReceiveFields,
    });

    const projections = service.getIndicatorProjections();
    expect(projections).toHaveLength(3);
    expect(projections[0].role).toBe('normal');
    expect(projections[2].role).toBe('disabled');
  });

  it('reports config issues for invalid configs', () => {
    const service = createStatusService();

    const result = service.updateIndicatorConfigs(invalidIndicatorConfigs);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('recomputes snapshot from buffered material', () => {
    const service = createStatusService();

    service.ingest({ connections: [connectedConnectionMaterial] });
    service.ingest({ receiveStats: healthyReceiveStats });

    const result = service.recompute();
    expect(result.snapshot.health.overallLevel).toBe('healthy');
  });

  it('clears all material and resets to default', () => {
    const service = createStatusService();

    service.ingest({
      connections: [errorConnectionMaterial],
      receiveStats: errorReceiveStats,
    });
    service.updateIndicatorConfigs(validIndicatorConfigs);

    expect(service.getHealthLevel()).toBe('error');

    const result = service.clear();
    expect(result.snapshot.health.overallLevel).toBe('unknown');
    expect(service.getIndicatorProjections()).toHaveLength(0);
    expect(service.getHealthSummary().sources).toHaveLength(0);
  });

  it('reset is equivalent to clear', () => {
    const service = createStatusService();

    service.ingest({ connections: [errorConnectionMaterial] });
    const result = service.reset();

    expect(result.snapshot).toEqual(defaultStatusFixture);
  });

  it('finds indicator projection by id', () => {
    const service = createStatusService();

    service.updateIndicatorConfigs(validIndicatorConfigs);
    service.ingest({ receiveFields: sampleReceiveFields });

    const projection = service.getIndicatorProjectionById('indicator-voltage');
    expect(projection).toBeDefined();
    expect(projection!.currentValue).toBe(12.5);

    expect(service.getIndicatorProjectionById('nonexistent')).toBeUndefined();
  });

  it('returns independent snapshot copies from reader', () => {
    const service = createStatusService();
    service.ingest({ connections: [connectedConnectionMaterial] });

    const snap1 = service.getSnapshot() as StatusSnapshot;
    const snap2 = service.getSnapshot() as StatusSnapshot;

    expect(snap1).toEqual(snap2);
    expect(snap1).not.toBe(snap2);
  });
});

// --- Selector isolation ---

describe('status selector and public api isolation', () => {
  it('returns health summary copies that cannot mutate backing state', () => {
    const service = createStatusService();
    service.ingest({ connections: [connectedConnectionMaterial] });

    const health = service.getHealthSummary() as { overallLevel: string; sources: unknown[] };
    health.overallLevel = 'mutated';
    health.sources.push({ source: 'fake', level: 'error' } as never);

    expect(service.getHealthSummary().overallLevel).toBe('healthy');
    expect(service.getHealthSummary().sources).toHaveLength(1);
  });

  it('returns indicator projection copies that cannot mutate backing state', () => {
    const service = createStatusService();
    service.updateIndicatorConfigs(validIndicatorConfigs);
    service.ingest({ receiveFields: sampleReceiveFields });

    const projections = service.getIndicatorProjections() as IndicatorProjection[];
    projections[0] = { ...projections[0], role: 'error' };

    expect(service.getIndicatorProjections()[0].role).toBe('normal');
  });

  it('returns indicator config copies that cannot mutate backing state', () => {
    const service = createStatusService();
    service.updateIndicatorConfigs(validIndicatorConfigs);

    const configs = service.getIndicatorConfigs() as { id: string }[];
    configs[0] = { ...configs[0], id: 'mutated' };

    expect(service.getIndicatorConfigs()[0].id).toBe('indicator-voltage');
  });

  it('reader exposes only read operations', () => {
    const reader = createStatusReader(() => defaultStatusFixture);

    expect(reader.getSnapshot()).toEqual(defaultStatusFixture);
    expect(reader.getHealthLevel()).toBe('unknown');

    expect(typeof reader.getSnapshot).toBe('function');
    expect(typeof reader.getHealthSummary).toBe('function');
    expect(typeof reader.getHealthLevel).toBe('function');
    expect(typeof reader.getIndicatorProjections).toBe('function');
    expect(typeof reader.getIndicatorConfigs).toBe('function');
  });

  it('public api does not expose internal mutable state', () => {
    expect(statusPublicApi).toHaveProperty('createStatusReader');
    expect(statusPublicApi).toHaveProperty('createStatusService');
    expect(statusPublicApi).toHaveProperty('selectHealthSummary');
    expect(statusPublicApi).toHaveProperty('selectIndicatorProjections');
    expect(statusPublicApi).not.toHaveProperty('createStatusState');
    expect(statusPublicApi).not.toHaveProperty('normalizeIndicatorConfigs');
    expect(statusPublicApi).not.toHaveProperty('deriveHealthSummary');
  });
});

// --- Edge cases ---

describe('status edge cases', () => {
  it('handles empty ingest without changing existing material', () => {
    const service = createStatusService();

    service.ingest({ connections: [connectedConnectionMaterial] });
    const beforeLevel = service.getHealthLevel();

    service.ingest({});
    expect(service.getHealthLevel()).toBe(beforeLevel);
  });

  it('handles indicator with no matching field data', () => {
    const service = createStatusService();

    service.updateIndicatorConfigs(validIndicatorConfigs);
    service.ingest({ receiveFields: [] });

    const projections = service.getIndicatorProjections();
    expect(projections[0].role).toBe('no-data');
    expect(projections[0].currentValue).toBeUndefined();
  });

  it('handles unknown lifecycle gracefully', () => {
    const result = deriveConnectionHealth([{
      connectionId: 'conn-unknown',
      lifecycle: 'custom-state',
      errorCount: 0,
      available: true,
    }]);
    expect(result.level).toBe('healthy');
  });

  it('handles mixed healthy and error connections', () => {
    const result = deriveConnectionHealth([
      connectedConnectionMaterial,
      errorConnectionMaterial,
    ]);
    expect(result.level).toBe('error');
  });
});
