import { readJsonWithBackup, writeJsonWithBackup, type JsonReadResult } from '@/shared/utils/json-storage';

/**
 * 中心对接「任务批次历史」文件持久化(spec: 中心对接任务批次历史面板)。
 *
 * 把中心下发的 setTestTask 批次(T_xxx)+ 每用例结果摘要持久化到文件(state/docking-tasks.json),
 * 走原子写 + .bak 损坏恢复,照 docking-file-storage 同款范式。
 *
 * 单文件方案:payload = { version, taskBatches: PersistedTaskBatch[] }。
 *
 * 同步读(内存缓存)+ 异步写(fire-and-forget):接入点(handleSetTestTask / createAndStartTask /
 * reportTaskResult)在 setTestTask 链路同步要读最近批次,bootstrap 必须先 hydrate 灌缓存。
 *
 * 这是新数据:文件不存在 = 空数组(无 localStorage 旧后端可迁,不做迁移)。
 * schema version 高于预期(未来回退)→ 清空 + onDataLoss。
 * 损坏(主+备)→ onDataLoss 让用户感知(Quasar Notify)。
 *
 * 粒度 2(见 spec「数据模型」):存批次元信息 + 每用例结果摘要,不存逐步骤明细。
 */

const SCHEMA_VERSION = 1;

/** 持久化的单个用例记录(批次下的一个用例)。 */
export interface PersistedTaskCase {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly status: 'pending' | 'running' | 'passed' | 'failed';
  readonly instanceId: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null;
}

/** 持久化的任务批次记录(一次 setTestTask 下发 = 一个 T_xxx)。 */
export interface PersistedTaskBatch {
  readonly taskId: string;
  readonly taskName: string;
  readonly receivedAt: number;
  readonly status: 'running' | 'completed' | 'partial-failed' | 'failed';
  readonly cases: readonly PersistedTaskCase[];
}

interface PersistedPayload {
  readonly version: number;
  readonly taskBatches: readonly PersistedTaskBatch[];
}

export interface DockingTaskHistoryStorageOptions {
  /** 损坏/schema 不匹配时回调,bootstrap 接 Quasar Notify 让用户感知。 */
  readonly onDataLoss?: (message: string) => void;
}

export interface FileAccess {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

export interface DockingTaskHistoryStorage {
  /** 异步加载文件灌入内存缓存。bootstrap 在使用前调。 */
  hydrate(): Promise<void>;
  loadAll(): readonly PersistedTaskBatch[];
  saveAll(batches: readonly PersistedTaskBatch[]): void;
  /** 插入新批次(按 taskId 去重,已存在则忽略,新批次插到最前)。返回是否实际插入。 */
  insertBatch(batch: PersistedTaskBatch): boolean;
  /** 局部更新某批次的某用例字段(merge patch)。批次/用例不存在 → no-op。 */
  updateCase(taskId: string, testCaseId: string, patch: Partial<PersistedTaskCase>): void;
  /** 重算某批次的 status(全部用例不再 running/pending 时)。批次不存在 → no-op。 */
  recomputeBatchStatus(taskId: string): void;
}

export function createDockingTaskHistoryStorage(
  files: FileAccess,
  dataDir: string,
  options: DockingTaskHistoryStorageOptions = {},
): DockingTaskHistoryStorage {
  const filePath = `${dataDir}/state/docking-tasks.json`;
  const onDataLoss = options.onDataLoss;

  let cache: readonly PersistedTaskBatch[] = [];

  /** 解析 payload,严格校验 version + taskBatches 形状。version 高于预期视为不可恢复。 */
  function parsePayload(value: unknown): { ok: true; payload: PersistedPayload } | { ok: false; reason: 'version-high' | 'malformed' } {
    if (value === null || typeof value !== 'object') return { ok: false, reason: 'malformed' };
    const p = value as Partial<PersistedPayload>;
    if (typeof p.version !== 'number') return { ok: false, reason: 'malformed' };
    if (p.version > SCHEMA_VERSION) return { ok: false, reason: 'version-high' };
    if (p.taskBatches !== undefined && !Array.isArray(p.taskBatches)) return { ok: false, reason: 'malformed' };
    return {
      ok: true,
      payload: {
        version: SCHEMA_VERSION,
        taskBatches: (p.taskBatches ?? []) as readonly PersistedTaskBatch[],
      },
    };
  }

  function reportDataLoss(message: string): void {
    console.error(`[docking-tasks] data loss: ${message}`);
    onDataLoss?.(message);
  }

  function snapshot(): PersistedPayload {
    return { version: SCHEMA_VERSION, taskBatches: cache };
  }

  async function writeToFile(): Promise<void> {
    try {
      await writeJsonWithBackup(files, filePath, snapshot());
    } catch (err) {
      console.error('[docking-tasks] file write failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    async hydrate(): Promise<void> {
      const result: JsonReadResult = await readJsonWithBackup(files, filePath);

      if (result.status === 'ok' || result.status === 'recovered') {
        // recovered = 主文件损坏但 bak 救回。数据虽没丢,但发生了损坏事件,仍通知用户。
        if (result.status === 'recovered') {
          onDataLoss?.('docking-tasks.json 主文件损坏,已从备份恢复');
        }
        const parsed = parsePayload(result.value);
        if (parsed.ok) {
          cache = parsed.payload.taskBatches;
          return;
        }
        if (parsed.reason === 'version-high') {
          reportDataLoss(`docking-tasks.json schema version 高于预期(${SCHEMA_VERSION}),已重置为空`);
        } else {
          reportDataLoss('docking-tasks.json 数据格式异常,已重置为空');
        }
        cache = [];
        return;
      }

      // missing / corrupted(主+备都坏):corrupted 已在 readJsonWithBackup 内 console.error。
      if (result.status === 'corrupted') {
        reportDataLoss('docking-tasks.json 主+备均损坏,批次历史丢失');
      }
      // 新数据:文件不存在(或损坏后无数据)→ 空数组(无 localStorage 迁移)。
      cache = [];
    },

    loadAll() {
      return [...cache];
    },

    saveAll(batches) {
      cache = [...batches];
      void writeToFile();
    },

    insertBatch(batch) {
      if (cache.some(b => b.taskId === batch.taskId)) return false;
      // 新批次插到最前(按 receivedAt 倒序消费时,最新在前)。
      cache = [batch, ...cache];
      void writeToFile();
      return true;
    },

    updateCase(taskId, testCaseId, patch) {
      const batchIdx = cache.findIndex(b => b.taskId === taskId);
      if (batchIdx < 0) return;
      const batch = cache[batchIdx];
      const caseIdx = batch.cases.findIndex(c => c.testCaseId === testCaseId);
      if (caseIdx < 0) return;
      const updatedCase: PersistedTaskCase = { ...batch.cases[caseIdx], ...patch };
      const updatedCases = batch.cases.map((c, i) => (i === caseIdx ? updatedCase : c));
      const updatedBatch: PersistedTaskBatch = { ...batch, cases: updatedCases };
      cache = cache.map((b, i) => (i === batchIdx ? updatedBatch : b));
      void writeToFile();
    },

    recomputeBatchStatus(taskId) {
      const batchIdx = cache.findIndex(b => b.taskId === taskId);
      if (batchIdx < 0) return;
      const batch = cache[batchIdx];
      // 还有 pending/running 用例 → 批次仍 running(不重算)。
      const hasActive = batch.cases.some(c => c.status === 'pending' || c.status === 'running');
      if (hasActive) return;
      // 全部终态:全 passed → completed;全 failed → failed;混合 → partial-failed。
      const passedCount = batch.cases.filter(c => c.status === 'passed').length;
      const failedCount = batch.cases.filter(c => c.status === 'failed').length;
      let status: PersistedTaskBatch['status'];
      if (failedCount === 0) status = 'completed';
      else if (passedCount === 0) status = 'failed';
      else status = 'partial-failed';
      cache = cache.map((b, i) => (i === batchIdx ? { ...b, status } : b));
      void writeToFile();
    },
  };
}
