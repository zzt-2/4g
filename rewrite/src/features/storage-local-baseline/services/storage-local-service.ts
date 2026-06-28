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

  /** append + 立即写盘核心(snapshot-free)。被 appendLocalRecords(路径A,DisplayPage 录制按钮)调用。
   *  历史上 D010 续接二轮曾为 routingTick 路径(B)提供 appendRoutedRecords + 攒批写盘,但 B 路径已
   *  在 D013 被判定为僵尸写入并根除(routingTick 不再写 records)。攒批逻辑随之移除,本函数回到
   *  "每次 append 立即写盘"的单一语义(路径A 低频——用户点"记录"才每秒一条——立即写盘可接受)。
   *  保留 D010 的 O(新增) 优化:① prevCount + truncate 回滚(不全量深拷贝备份);
   *  ② appendRecords quickSnapshot=false(不生成被丢弃的全量快照);
   *  失败时 setLastIssue + 返回 failedWithAdapter(含 snapshot,因失败是低频路径)。 */
  async function appendAndPersist(
    records: readonly StorageLocalRecord[],
  ): Promise<StorageLocalOperationResult | { ok: true }> {
    if (canAppendInOrderFast(state, records)) {
      // ① 记录追加前长度(truncate 回滚,不再全量深拷贝备份)。
      const prevCount = state.getRecordCount();
      // ② 增量 append(quickSnapshot=false → 不生成被丢弃的全量快照)。
      const { merged } = state.appendRecords(records);
      // ③ 立即写盘(保"立即感知写盘失败 + 回滚"公开契约)。
      const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, merged);
      if (!writeResult.ok) {
        state.truncateRecords(prevCount);
        return failedWithAdapter(state, writeResult.error);
      }
      return { ok: true };
    }

    // 回退:全量 merge(保留乱序插入正确位置 + id 去重语义)。低频路径(id 冲突/乱序),
    // 走完整 getSnapshot() 深拷贝无妨。
    const merged = mergeStorageLocalRecords([...state.getSnapshot().records, ...records]);
    const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, merged);
    if (!writeResult.ok) {
      return failedWithAdapter(state, writeResult.error);
    }
    state.replaceRecords(merged);
    return okResult(state, createValidStorageResult());
  }

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

      // 路径A(路径B 已根除,见 D013):共享 appendAndPersist(snapshot-free + 立即写盘)。
      // appendLocalRecords 仅在外包一层"返回 snapshot"给需要完整操作结果的调用方。
      const routed = await appendAndPersist(normalized.records);
      if (!routed.ok) {
        // 失败:routed 已是 failedWithAdapter/Validation(含 snapshot + setLastIssue)。
        return routed as StorageLocalOperationResult;
      }
      state.clearLastIssue();  // O(1) 清标记(setLastIssue 会多一次全量深拷贝)
      return {
        ok: true,
        validation: normalized.validation,
        snapshot: state.getSnapshot(),
      };
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
