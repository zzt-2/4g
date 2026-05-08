import {
  cloneStatusSnapshot,
  createDefaultStatusSnapshot,
  deriveAllIndicatorProjections,
  deriveHealthSummary,
  normalizeIndicatorConfigs,
  type ConnectionStatusMaterial,
  type HealthSummary,
  type IndicatorConfig,
  type ReadonlyStatusSnapshot,
  type ReceiveFieldMaterial,
  type ReceiveStatsMaterial,
  type StatusInputMaterial,
  type StatusValidationIssue,
  type StatusSnapshot,
} from '../core';
import {
  selectHealthLevel,
  selectHealthSummary,
  selectIndicatorConfigs,
  selectIndicatorProjectionById,
  selectIndicatorProjections,
  selectStatusSnapshot,
} from '../selectors';
import { createStatusState, type StatusStateContainer } from '../state';

export interface StatusReader {
  getSnapshot(): ReadonlyStatusSnapshot;
  getHealthSummary(): HealthSummary;
  getHealthLevel(): HealthSummary['overallLevel'];
  getIndicatorProjections(): readonly IndicatorProjection[];
  getIndicatorProjectionById(id: string): IndicatorProjection | undefined;
  getIndicatorConfigs(): readonly IndicatorConfig[];
}

export interface StatusUpdateResult {
  readonly snapshot: ReadonlyStatusSnapshot;
  readonly issues: readonly StatusValidationIssue[];
}

export interface StatusService extends StatusReader {
  ingest(material: StatusInputMaterial): StatusUpdateResult;
  updateIndicatorConfigs(rawConfigs: readonly unknown[]): StatusUpdateResult;
  recompute(): StatusUpdateResult;
  clear(): StatusUpdateResult;
  reset(): StatusUpdateResult;
}

interface BufferedMaterial {
  connections: ConnectionStatusMaterial[];
  receiveFields: ReceiveFieldMaterial[];
  receiveStats?: ReceiveStatsMaterial;
  indicatorConfigs: IndicatorConfig[];
  configIssues: StatusValidationIssue[];
}

function recomputeSnapshot(
  material: BufferedMaterial,
  state: StatusStateContainer,
): StatusSnapshot {
  const now = new Date().toISOString();
  const health = deriveHealthSummary(material.connections, material.receiveStats, now);
  const indicators = deriveAllIndicatorProjections(
    material.indicatorConfigs,
    material.receiveFields,
    now,
  );

  return state.replaceSnapshot({
    schemaVersion: state.getSnapshot().schemaVersion,
    health,
    indicators,
    indicatorConfigs: material.indicatorConfigs,
    lastUpdatedAt: now,
  });
}

function toUpdateResult(
  snapshot: StatusSnapshot,
  issues: readonly StatusValidationIssue[],
): StatusUpdateResult {
  return {
    snapshot: cloneStatusSnapshot(snapshot),
    issues,
  };
}

export function createStatusReader(
  snapshotProvider: () => ReadonlyStatusSnapshot,
): StatusReader {
  return {
    getSnapshot() {
      return selectStatusSnapshot(snapshotProvider());
    },

    getHealthSummary() {
      return selectHealthSummary(snapshotProvider());
    },

    getHealthLevel() {
      return selectHealthLevel(snapshotProvider());
    },

    getIndicatorProjections() {
      return selectIndicatorProjections(snapshotProvider());
    },

    getIndicatorProjectionById(id: string) {
      return selectIndicatorProjectionById(snapshotProvider(), id);
    },

    getIndicatorConfigs() {
      return selectIndicatorConfigs(snapshotProvider());
    },
  };
}

export function createStatusService(
  state: StatusStateContainer = createStatusState(),
): StatusService {
  const reader = createStatusReader(() => state.getSnapshot());

  const material: BufferedMaterial = {
    connections: [],
    receiveFields: [],
    indicatorConfigs: [],
    configIssues: [],
  };

  return {
    ...reader,

    ingest(input: StatusInputMaterial) {
      if (input.connections) {
        material.connections = input.connections.map((c) => ({ ...c }));
      }
      if (input.receiveFields) {
        material.receiveFields = input.receiveFields.map((f) => ({ ...f }));
      }
      if (input.receiveStats) {
        material.receiveStats = { ...input.receiveStats };
      }

      const snapshot = recomputeSnapshot(material, state);
      return toUpdateResult(snapshot, material.configIssues);
    },

    updateIndicatorConfigs(rawConfigs: readonly unknown[]) {
      const result = normalizeIndicatorConfigs(rawConfigs);
      material.indicatorConfigs = result.configs;
      material.configIssues = result.issues;

      const snapshot = recomputeSnapshot(material, state);
      return toUpdateResult(snapshot, result.issues);
    },

    recompute() {
      const snapshot = recomputeSnapshot(material, state);
      return toUpdateResult(snapshot, material.configIssues);
    },

    clear() {
      material.connections = [];
      material.receiveFields = [];
      material.receiveStats = undefined;
      material.configIssues = [];

      const snapshot = state.replaceSnapshot(createDefaultStatusSnapshot());
      return toUpdateResult(snapshot, []);
    },

    reset() {
      return this.clear();
    },
  };
}
