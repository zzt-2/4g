import type { TaskTemplate } from '../core';
import type { TaskTemplateStorage } from './task-template-storage';
import { readJsonWithBackup, writeJsonWithBackup, type JsonReadResult } from '@/shared/utils/json-storage';

/**
 * 任务模板文件持久化(S012 根因 D)。
 *
 * 替代旧 localStorage 后端(task-template-storage.ts):
 * - 存 state/task-templates.json,走原子写(A1)+ .bak 损坏恢复(A2)
 * - 保持 TaskTemplateStorage 同步接口(loadAll/saveAll):createTaskService 同步初始化
 *   时 loadAll 返回空缓存,bootstrap 异步 hydrate 后灌入
 * - saveAll fire-and-forget 异步写文件(不阻塞 task-service 的同步调用)
 * - 首次启动文件不存在时,从 localStorage 一次性迁移旧数据,迁完清 localStorage
 * - schema version 高于预期(未来版本回退)→ 不强行加载错格式,清空 + onDataLoss
 * - 损坏(主+备)→ onDataLoss 让用户感知(Quasar Notify)
 *
 * 不 seed 默认模板(任务模板无默认数据,和帧不同)。
 */

const SCHEMA_VERSION = 1;

interface PersistedPayload {
  readonly version: number;
  readonly templates: readonly TaskTemplate[];
}

export interface TaskTemplateFileStorageOptions {
  /** 损坏/schema 不匹配时回调,bootstrap 接到 Quasar Notify 让用户感知。 */
  readonly onDataLoss?: (message: string) => void;
  /** 旧 localStorage 后端(用于一次性迁移)。默认用 createTaskTemplateStorage。 */
  readonly legacyStorage?: { loadAll(): readonly TaskTemplate[]; clear(): void };
}

export interface FileAccess {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

export interface TaskTemplateFileStorage extends TaskTemplateStorage {
  /**
   * 异步加载文件灌入内存缓存。bootstrap 在 createTaskService 之后调。
   * 不传 seed 时从文件读;文件不存在尝试 localStorage 迁移。
   */
  hydrate(seed?: readonly TaskTemplate[]): Promise<void>;
}

export function createTaskTemplateFileStorage(
  files: FileAccess,
  dataDir: string,
  options: TaskTemplateFileStorageOptions = {},
): TaskTemplateFileStorage {
  const filePath = `${dataDir}/state/task-templates.json`;
  const onDataLoss = options.onDataLoss;
  let cache: readonly TaskTemplate[] = [];

  /** 解析 payload,严格校验 version + templates 形状。version 高于预期视为不可恢复。 */
  function parsePayload(value: unknown): { ok: true; templates: readonly TaskTemplate[] } | { ok: false; reason: 'version-high' | 'malformed' } {
    if (value === null || typeof value !== 'object') return { ok: false, reason: 'malformed' };
    const payload = value as Partial<PersistedPayload>;
    if (payload.version === undefined || payload.templates === undefined) return { ok: false, reason: 'malformed' };
    if (typeof payload.version !== 'number') return { ok: false, reason: 'malformed' };
    if (!Array.isArray(payload.templates)) return { ok: false, reason: 'malformed' };
    if (payload.version > SCHEMA_VERSION) return { ok: false, reason: 'version-high' };
    // version === 1 或(理论上的)低于预期:当前都按 v1 加载。低于预期暂无迁移需求。
    return { ok: true, templates: payload.templates as readonly TaskTemplate[] };
  }

  function reportDataLoss(message: string): void {
    console.error(`[task] template data loss: ${message}`);
    onDataLoss?.(message);
  }

  async function writeToFile(templates: readonly TaskTemplate[]): Promise<void> {
    try {
      await writeJsonWithBackup(files, filePath, { version: SCHEMA_VERSION, templates });
    } catch (err) {
      console.error('[task] template file write failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    loadAll() {
      return [...cache];
    },

    saveAll(templates) {
      // 同步更新缓存(task-service 立即 loadAll 能看到最新),异步写文件。
      cache = [...templates];
      void writeToFile(templates);
    },

    async hydrate(seed) {
      if (seed !== undefined) {
        cache = [...seed];
        return;
      }

      const result: JsonReadResult = await readJsonWithBackup(files, filePath);

      if (result.status === 'ok' || result.status === 'recovered') {
        // recovered = 主文件损坏但 bak 救回。数据虽没丢,但发生了损坏事件,
        // 仍通知用户(让用户知道主文件坏过,可考虑检查磁盘)。
        if (result.status === 'recovered') {
          onDataLoss?.('task-templates.json 主文件损坏,已从备份恢复');
        }
        const parsed = parsePayload(result.value);
        if (parsed.ok) {
          cache = parsed.templates;
          return;
        }
        if (parsed.reason === 'version-high') {
          reportDataLoss(`task-templates.json schema version 高于预期(${SCHEMA_VERSION}),已重置为空`);
        } else {
          reportDataLoss('task-templates.json 数据格式异常,已重置为空');
        }
        cache = [];
        return;
      }

      // missing / corrupted(主+备都坏):corrupted 已在 readJsonWithBackup 内 console.error。
      // corrupted 时 reportDataLoss 让用户感知(主+备都丢才是真丢失)。
      if (result.status === 'corrupted') {
        reportDataLoss('task-templates.json 主+备均损坏,模板数据丢失');
      }

      // 文件不存在(或损坏后无数据):尝试从 localStorage 迁移旧数据(一次性)。
      const legacy = options.legacyStorage;
      if (legacy) {
        const legacyTemplates = legacy.loadAll();
        if (legacyTemplates.length > 0) {
          cache = [...legacyTemplates];
          await writeToFile(legacyTemplates);
          legacy.clear();
          console.info(`[task] migrated ${legacyTemplates.length} templates from localStorage to file`);
          return;
        }
      }

      cache = [];
    },
  };
}
