import type { TaskTemplate } from '../core';

const STORAGE_KEY = 'rw-task-templates';
const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly templates: readonly TaskTemplate[];
}

export interface TaskTemplateStorage {
  loadAll(): readonly TaskTemplate[];
  saveAll(templates: readonly TaskTemplate[]): void;
}

/**
 * localStorage-backed template storage.
 *
 * Schema version mismatch -> return empty (后续支持 migration)。
 * JSON parse 错误 -> log + return empty（避免阻塞启动）。
 */
export function createTaskTemplateStorage(
  kv: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage),
): TaskTemplateStorage {
  return {
    loadAll() {
      try {
        const raw = kv.getItem(STORAGE_KEY);
        if (!raw) return [];
        const payload = JSON.parse(raw) as PersistedPayload;
        if (payload.version !== SCHEMA_VERSION) {
          // 静默清空会导致老用户刷新后模板直接消失且无提示，这里至少要给一个明显的错误日志
          console.error(
            `[task] template storage schema version mismatch: expected ${SCHEMA_VERSION}, got ${payload.version}; existing templates ignored (treat as data loss until migration is added)`,
          );
          return [];
        }
        if (!Array.isArray(payload.templates)) return [];
        return payload.templates;
      } catch (err) {
        console.error('[task] failed to load templates from storage', err);
        return [];
      }
    },

    saveAll(templates) {
      try {
        const payload: PersistedPayload = { version: SCHEMA_VERSION, templates };
        kv.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.error('[task] failed to persist templates to storage', err);
      }
    },
  };
}
