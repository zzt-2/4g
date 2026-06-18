import type { ReportedSnapshot } from '../core/types';

const STORAGE_KEY = 'rw-task-reported-snapshots';
const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly snapshots: readonly ReportedSnapshot[];
}

export interface ReportedSnapshotStorage {
  load(outCaseId: string): ReportedSnapshot | undefined;
  loadAll(): readonly ReportedSnapshot[];
  save(snapshot: ReportedSnapshot): void;
  remove(outCaseId: string): void;
}

export function createReportedSnapshotStorage(
  kv: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage),
): ReportedSnapshotStorage {
  function readPayload(): PersistedPayload | undefined {
    try {
      const raw = kv.getItem(STORAGE_KEY);
      if (!raw) return undefined;
      const payload = JSON.parse(raw) as PersistedPayload;
      if (payload.version !== SCHEMA_VERSION) {
        console.error(
          `[northbound] reported-snapshot storage schema version mismatch: expected ${SCHEMA_VERSION}, got ${payload.version}; existing snapshots ignored`,
        );
        return undefined;
      }
      if (!Array.isArray(payload.snapshots)) return undefined;
      return payload;
    } catch (err) {
      console.error('[northbound] failed to load reported snapshots from storage', err);
      return undefined;
    }
  }

  function writePayload(snapshots: readonly ReportedSnapshot[]): void {
    try {
      const payload: PersistedPayload = { version: SCHEMA_VERSION, snapshots };
      kv.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('[northbound] failed to persist reported snapshots', err);
    }
  }

  return {
    load(outCaseId) {
      return readPayload()?.snapshots.find(s => s.outCaseId === outCaseId);
    },
    loadAll() {
      return readPayload()?.snapshots ?? [];
    },
    save(snapshot) {
      const all = readPayload()?.snapshots ?? [];
      const filtered = all.filter(s => s.outCaseId !== snapshot.outCaseId);
      writePayload([...filtered, snapshot]);
    },
    remove(outCaseId) {
      const all = readPayload()?.snapshots ?? [];
      writePayload(all.filter(s => s.outCaseId !== outCaseId));
    },
  };
}
