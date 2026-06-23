import {
  classifyStorageLegacyJsonMaterial,
  createStorageCsvMaterial,
  createStorageIssue,
  createStorageValidationResult,
  createValidStorageResult,
  mergeStorageHistoryMaterials,
  mergeStorageLocalRecords,
  normalizeStorageHistoryMaterial,
  normalizeStorageLocalRecords,
  queryStorageLocalRecords,
  type CreateStorageCsvMaterialInput,
  type StorageCsvMaterial,
  type StorageHistoryMaterial,
  type StorageHourSummary,
  type StorageLegacyJsonMaterial,
  type StorageLocalRecord,
  type StorageRecordQuery,
  type StorageValidationIssue,
  type StorageValidationResult,
} from '../core';
import type { LocalMaterialAdapter, LocalMaterialAdapterError } from '../adapters';
import {
  selectStorageCsvMaterial,
  selectStorageCsvMaterialSummaries,
  selectStorageHourSummaries,
  selectStorageLastIssue,
  selectStorageLegacyMaterial,
  selectStorageLegacyMaterialSummaries,
  selectStorageLocalRecords,
  type StorageCsvMaterialSummary,
  type StorageLegacyMaterialSummary,
} from '../selectors';
import { createStorageState, type StorageStateContainer, type StorageStateSnapshot } from '../state';

export interface StorageLocalReader {
  getSnapshot(): StorageStateSnapshot;
  listLocalRecords(query?: StorageRecordQuery): readonly StorageLocalRecord[];
  listHistoryHours(): readonly StorageHourSummary[];
  listCsvMaterials(): readonly StorageCsvMaterialSummary[];
  getCsvMaterial(id: string): StorageCsvMaterial | undefined;
  listLegacyMaterials(): readonly StorageLegacyMaterialSummary[];
  getLegacyMaterial(key: string): StorageLegacyJsonMaterial | undefined;
  getLastIssue(): ReturnType<typeof selectStorageLastIssue>;
}

export interface StorageLocalOperationResult {
  readonly ok: boolean;
  readonly validation: StorageValidationResult;
  readonly snapshot: StorageStateSnapshot;
  readonly error?: LocalMaterialAdapterError;
}

export interface StorageLocalCsvOperationResult extends StorageLocalOperationResult {
  readonly material?: StorageCsvMaterial;
}

export interface StorageLocalService extends StorageLocalReader {
  loadLocalRecords(materialId: string): Promise<StorageLocalOperationResult>;
  appendLocalRecords(records: readonly StorageLocalRecord[]): Promise<StorageLocalOperationResult>;
  loadHistoryMaterials(materialIds: readonly string[]): Promise<StorageLocalOperationResult>;
  createCsvFromLocalRecords(input: Omit<CreateStorageCsvMaterialInput, 'records'> & {
    readonly query?: StorageRecordQuery;
  }): Promise<StorageLocalCsvOperationResult>;
  saveLegacyJsonMaterial(key: string, value: unknown, acceptedAt: string): Promise<StorageLocalOperationResult>;
  copySnapshot(snapshotId: string): Promise<StorageLocalOperationResult>;
}

export interface CreateStorageLocalServiceOptions {
  readonly adapter: LocalMaterialAdapter;
  readonly state?: StorageStateContainer;
  readonly recordsMaterialId?: string;
}

function hasError(issues: readonly StorageValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/**
 * 判断能否走 append 快速路径(治本"开久了卡",见 appendLocalRecords 注释)。
 * 用 state 的轻量 accessor(末条 capturedAt / id 存在性)而非 getSnapshot(),避免为边界
 * 检查触发全量深拷贝。条件全部满足时,[...existing, ...newRecords] 与 mergeStorageLocalRecords
 * 结果等价(整体按 capturedAt 升序、id 唯一):
 * 1. newRecords 非空时,首条 capturedAt ≥ existing 末条(整体单调);
 * 2. newRecords 自身按 capturedAt 升序(允许相等);
 * 3. newRecords 自身 id 互不冲突;
 * 4. newRecords 的 id 不与 existing 任一条冲突。
 * 任一不满足返回 false,调用方回退全量 merge(保留乱序/去重语义)。
 */
function canAppendInOrderFast(
  state: StorageStateContainer,
  newRecords: readonly StorageLocalRecord[],
): boolean {
  if (newRecords.length === 0) return true;

  // 条件 1:整体单调。getLastRecordCapturedAtMs 不触发全量拷贝。
  const lastExistingMs = state.getLastRecordCapturedAtMs();
  if (lastExistingMs !== null) {
    const firstNewMs = Date.parse(newRecords[0]!.capturedAt);
    if (Number.isNaN(firstNewMs) || firstNewMs < lastExistingMs) {
      return false;
    }
  }

  // 条件 2 + 3:newRecords 自身升序 + id 唯一。
  const seenIds = new Set<string>();
  let prevMs = -Infinity;
  for (const record of newRecords) {
    if (seenIds.has(record.id)) return false;
    seenIds.add(record.id);
    const ms = Date.parse(record.capturedAt);
    if (Number.isNaN(ms) || ms < prevMs) return false;
    prevMs = ms;
  }

  // 条件 4:不与 existing id 冲突。routingTick 真实负载 id 全新,首条就 miss 提前返回。
  for (const id of seenIds) {
    if (state.hasRecordId(id)) return false;
  }

  return true;
}

function adapterIssue(error: LocalMaterialAdapterError): StorageValidationResult {
  return createStorageValidationResult([
    createStorageIssue(`adapter.${error.kind}`, 'adapter', error.message),
  ]);
}

function failedWithValidation(
  state: StorageStateContainer,
  validation: StorageValidationResult,
): StorageLocalOperationResult {
  const firstError = validation.issues.find((issue) => issue.severity === 'error');
  if (firstError) {
    return {
      ok: false,
      validation,
      snapshot: state.setLastIssue({ code: firstError.code, message: firstError.message }),
    };
  }

  return {
    ok: false,
    validation,
    snapshot: state.getSnapshot(),
  };
}

function failedWithAdapter(
  state: StorageStateContainer,
  error: LocalMaterialAdapterError,
): StorageLocalOperationResult {
  return {
    ok: false,
    validation: adapterIssue(error),
    snapshot: state.setLastIssue({ code: `adapter.${error.kind}`, message: error.message }),
    error,
  };
}

function okResult(
  state: StorageStateContainer,
  validation: StorageValidationResult = createValidStorageResult(),
): StorageLocalOperationResult {
  state.setLastIssue(undefined);
  return {
    ok: true,
    validation,
    snapshot: state.getSnapshot(),
  };
}

export function createStorageLocalReader(
  snapshotProvider: () => StorageStateSnapshot,
): StorageLocalReader {
  return {
    getSnapshot() {
      return snapshotProvider();
    },

    listLocalRecords(query) {
      return selectStorageLocalRecords(snapshotProvider(), query);
    },

    listHistoryHours() {
      return selectStorageHourSummaries(snapshotProvider());
    },

    listCsvMaterials() {
      return selectStorageCsvMaterialSummaries(snapshotProvider());
    },

    getCsvMaterial(id) {
      return selectStorageCsvMaterial(snapshotProvider(), id);
    },

    listLegacyMaterials() {
      return selectStorageLegacyMaterialSummaries(snapshotProvider());
    },

    getLegacyMaterial(key) {
      return selectStorageLegacyMaterial(snapshotProvider(), key);
    },

    getLastIssue() {
      return selectStorageLastIssue(snapshotProvider());
    },
  };
}

export function createStorageLocalService(
  options: CreateStorageLocalServiceOptions,
): StorageLocalService {
  const state = options.state ?? createStorageState();
  const recordsMaterialId = options.recordsMaterialId ?? 'local-records';
  const reader = createStorageLocalReader(() => state.getSnapshot());

  return {
    ...reader,

    async loadLocalRecords(materialId) {
      const readResult = await options.adapter.readMaterial('records', materialId);
      if (!readResult.ok) {
        return failedWithAdapter(state, readResult.error);
      }

      const normalized = normalizeStorageLocalRecords(readResult.value, 'records');
      if (!normalized.ok) {
        return failedWithValidation(state, normalized.validation);
      }

      state.replaceRecords(normalized.records);
      return okResult(state, normalized.validation);
    },

    async appendLocalRecords(records) {
      const normalized = normalizeStorageLocalRecords(records, 'records');
      if (!normalized.ok) {
        return failedWithValidation(state, normalized.validation);
      }

      // 治本"开久了卡"(S012 续 性能任务):旧实现每帧 `[...全量N, ...1] + mergeStorageLocalRecords
      // (深拷贝全部 + 全量排序) + writeMaterial(再深拷贝) + replaceRecords(再深拷贝) = O(N·M),
      // 单 tick 耗时随累积记录数线性增长(2000 records 实测 ~62ms,trace 300-430ms 正是累积到万条)。
      // routingTick 的真实负载是:每帧 1 条新 record,id 全新、capturedAt 单调递增(比现有末条新)。
      // 这种情况下整体仍有序,无需重排/去重/全量深拷贝 → 走 appendRecords 快速路径。
      // 乱序或 id 冲突(如 loadHistory 显式去重场景)回退全量 merge,语义不变。
      if (canAppendInOrderFast(state, normalized.records)) {
        // 快速路径:appendRecords 一次调用拿到追加后的完整数组(merged) + 隔离快照(snapshot)。
        // 用 merged 给 adapter 持久化(adapter 自管深拷贝隔离),snapshot 给结果返回。
        // 整个 fast path 对现有 records 只深拷贝一次(snapshot),不再每帧 O(N) merge/重排/多次拷贝。
        // 注意:若 writeMaterial 失败须回滚已 append 的状态,保持"写盘失败不改 state"语义。
        const before = state.getSnapshot().records;
        const { merged, snapshot } = state.appendRecords(normalized.records);
        const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, merged);
        if (!writeResult.ok) {
          // 回滚:写盘失败,恢复 append 前的 records。
          state.replaceRecords(before);
          return failedWithAdapter(state, writeResult.error);
        }
        state.setLastIssue(undefined);
        return {
          ok: true,
          validation: normalized.validation,
          snapshot,
        };
      }

      // 回退:全量 merge(保留乱序插入正确位置 + id 去重语义)。
      const merged = mergeStorageLocalRecords([...state.getSnapshot().records, ...normalized.records]);
      const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, merged);
      if (!writeResult.ok) {
        return failedWithAdapter(state, writeResult.error);
      }

      state.replaceRecords(merged);
      return okResult(state, normalized.validation);
    },

    async loadHistoryMaterials(materialIds) {
      const materials: StorageHistoryMaterial[] = [];
      const issues: StorageValidationIssue[] = [];

      for (const materialId of materialIds) {
        const readResult = await options.adapter.readMaterial('history', materialId);
        if (!readResult.ok) {
          return failedWithAdapter(state, readResult.error);
        }

        const normalized = normalizeStorageHistoryMaterial(readResult.value, `history.${materialId}`);
        issues.push(...normalized.validation.issues);
        if (normalized.material) {
          materials.push(normalized.material);
        }
      }

      const validation = createStorageValidationResult(issues);
      if (hasError(validation.issues)) {
        return failedWithValidation(state, validation);
      }

      const mergedRecords = mergeStorageHistoryMaterials(materials);
      state.replaceHistoryMaterials(materials);
      state.replaceRecords(mergedRecords);
      return okResult(state, validation);
    },

    async createCsvFromLocalRecords(input) {
      const records = queryStorageLocalRecords(state.getSnapshot().records, input.query);
      const csvResult = createStorageCsvMaterial({
        ...input,
        records,
      });

      if (!csvResult.ok || !csvResult.material) {
        return failedWithValidation(state, csvResult.validation);
      }

      const writeResult = await options.adapter.writeMaterial('csv', csvResult.material.id, csvResult.material);
      if (!writeResult.ok) {
        return failedWithAdapter(state, writeResult.error);
      }

      state.upsertCsvMaterial(csvResult.material);
      return {
        ...okResult(state, csvResult.validation),
        material: csvResult.material,
      };
    },

    async saveLegacyJsonMaterial(key, value, acceptedAt) {
      const classified = classifyStorageLegacyJsonMaterial(key, value, acceptedAt);
      if (!classified.ok || !classified.material) {
        return failedWithValidation(state, classified.validation);
      }

      const writeResult = await options.adapter.writeMaterial('legacy', classified.material.key, value);
      if (!writeResult.ok) {
        return failedWithAdapter(state, writeResult.error);
      }

      state.upsertLegacyMaterial(classified.material);
      return okResult(state, classified.validation);
    },

    async copySnapshot(snapshotId) {
      const snapshot = state.getSnapshot();
      const writeResult = await options.adapter.writeMaterial('snapshot', snapshotId, snapshot);
      if (!writeResult.ok) {
        return failedWithAdapter(state, writeResult.error);
      }

      return okResult(state);
    },
  };
}
