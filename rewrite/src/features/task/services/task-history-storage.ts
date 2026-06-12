import type { TaskInstanceState } from '../core';

const STORAGE_KEY = 'rw-task-history';
const SCHEMA_VERSION = 1;

interface PersistedHistoryPayload {
  readonly version: number;
  readonly history: readonly TaskInstanceState[];
}

export interface TaskHistoryStorage {
  loadAll(): readonly TaskInstanceState[];
  saveAll(history: readonly TaskInstanceState[]): void;
  clear(): void;
}

export function createTaskHistoryStorage(
  kv: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage),
): TaskHistoryStorage {
  return {
    loadAll() {
      try {
        const raw = kv.getItem(STORAGE_KEY);
        if (!raw) return [];
        const payload = JSON.parse(raw) as PersistedHistoryPayload;
        if (payload.version !== SCHEMA_VERSION) {
          console.error(
            `[task] history storage schema version mismatch: expected ${SCHEMA_VERSION}, got ${payload.version}`,
          );
          return [];
        }
        if (!Array.isArray(payload.history)) return [];
        return payload.history;
      } catch (err) {
        console.error('[task] failed to load history from storage', err);
        return [];
      }
    },

    saveAll(history) {
      try {
        const payload: PersistedHistoryPayload = { version: SCHEMA_VERSION, history };
        kv.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.error('[task] failed to persist history to storage', err);
      }
    },

    clear() {
      try {
        kv.removeItem(STORAGE_KEY);
      } catch (err) {
        console.error('[task] failed to clear history storage', err);
      }
    },
  };
}
