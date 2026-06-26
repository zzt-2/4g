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
  /** 路由层批量摄入(治本"开久了卡",S012 续):routingTick 每帧经 fanOutToStorage 调用。
   *  与 appendLocalRecords 的区别:**不返回 snapshot**。routingTick 路径丢弃 snapshot,
   *  返回它会触发一次全量深拷贝(O(N) 退化根源)。本方法只增量 append + 攒批写盘,
   *  返回 { ok }。语义与 appendLocalRecords 的 fast-path 一致(有序增量 + truncate 回滚 +
   *  攒批写盘),但彻底跳过 snapshot 生成。乱序/id 冲突回退全量 merge(也走 snapshot-free 返回)。 */
  appendRoutedRecords(records: readonly StorageLocalRecord[]): Promise<{ ok: boolean }>;
  /** 刷盘:把攒批中未写的 records 立即全量写盘一次。优雅退出/手动 checkpoint 用。
   *  治本"开久了卡"(S012 续):appendLocalRecords/appendRoutedRecords 不再每帧写盘,
   *  攒到阈值或调本方法才写,避免每帧全量序列化。routingTick 退出/runtime.destroy 时应调一次防丢数据。 */
  flushPendingWrites(): Promise<void>;
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
  // 治本"开久了卡"(S012 续):appendLocalRecords 不每帧写盘,攒到 WRITE_BATCH_THRESHOLD 才写。
  // 这样每帧只深拷贝新增 1 条(O(1)),写盘全量序列化摊销到每 50 帧。
  let pendingWriteCount = 0;
  const WRITE_BATCH_THRESHOLD = 50;

  /** 路由层 append 共享核心(snapshot-free)。被 appendLocalRecords 和 appendRoutedRecords 复用。
   *  治本"开久了卡":① 不全量深拷贝备份(用 prevCount + truncate 回滚,O(1));
   *  ② appendRecords quickSnapshot=false(不生成被丢弃的全量快照);
   *  ③ batchWrites=true 时攒批写盘(路由路径,routingTick 每帧调,阈值 50 摊销);
   *    batchWrites=false 时立即写盘(appendLocalRecords,保留"立即感知写盘失败+回滚"契约)。
   *  失败时 setLastIssue + 返回 failedWithAdapter(含 snapshot,因失败是低频路径)。 */
  async function applyRoutedAppend(
    records: readonly StorageLocalRecord[],
    batchWrites: boolean,
  ): Promise<StorageLocalOperationResult | { ok: true }> {
    if (canAppendInOrderFast(state, records)) {
      // ① 记录追加前长度(truncate 回滚,不再全量深拷贝备份)。
      const prevCount = state.getRecordCount();
      // ② 增量 append(quickSnapshot=false → 不生成被丢弃的全量快照)。
      const { merged } = state.appendRecords(records);
      // ③ 写盘策略:路由路径攒批(摊销 O(1)/帧),appendLocalRecords 立即写(保失败感知契约)。
      const shouldWriteNow = batchWrites
        ? (pendingWriteCount + records.length >= WRITE_BATCH_THRESHOLD)
        : true;
      pendingWriteCount += records.length;
      if (shouldWriteNow) {
        const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, merged);
        if (!writeResult.ok) {
          state.truncateRecords(prevCount);
          pendingWriteCount = 0;
          return failedWithAdapter(state, writeResult.error);
        }
        pendingWriteCount = 0;
      }
      return { ok: true };
    }

    // 回退:全量 merge(保留乱序插入正确位置 + id 去重语义)。低频路径(id 冲突/乱序),
    // 走完整 getSnapshot() 深拷贝无妨。立即写盘(攒批语义不适用于乱序修正)。
    const merged = mergeStorageLocalRecords([...state.getSnapshot().records, ...records]);
    const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, merged);
    if (!writeResult.ok) {
      return failedWithAdapter(state, writeResult.error);
    }
    state.replaceRecords(merged);
    pendingWriteCount = 0;
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

      // 治本"开久了卡"(S012 续):路由核心逻辑共享 applyRoutedAppend(snapshot-free)。
      // appendLocalRecords 仅在外包一层"返回 snapshot"给需要完整操作结果的调用方。
      // batchWrites=false:立即写盘,保留"立即感知写盘失败+回滚"公开契约。
      const routed = await applyRoutedAppend(normalized.records, false);
      if (!routed.ok) {
        // 失败:routed 已是 failedWithAdapter/Validation(含 snapshot + setLastIssue)。
        return routed as StorageLocalOperationResult;
      }
      state.clearLastIssue();  // O(1) 清标记(治本"开久了卡",setLastIssue 会多一次全量深拷贝)
      return {
        ok: true,
        validation: normalized.validation,
        snapshot: state.getSnapshot(),
      };
    },

    async appendRoutedRecords(records) {
      // 路由层批量摄入:snapshot-free,只增量 append + 攒批写盘。
      // 详见接口注释。routingTick 每帧调,经 fanOutToStorage,返回值只取 ok。
      const normalized = normalizeStorageLocalRecords(records, 'records');
      if (!normalized.ok) {
        state.setLastIssue(normalized.validation.issues.find((i) => i.severity === 'error')
          ? { code: normalized.validation.issues.find((i) => i.severity === 'error')!.code,
              message: normalized.validation.issues.find((i) => i.severity === 'error')!.message }
          : { code: 'record.invalid', message: 'Invalid record' });
        return { ok: false };
      }
      const routed = await applyRoutedAppend(normalized.records, true);  // batchWrites:路由路径攒批
      if (routed.ok) state.clearLastIssue();  // O(1),不返回 snapshot(治本"开久了卡")
      return { ok: routed.ok };
    },

    async flushPendingWrites() {
      // 攒批写盘的强制刷盘入口。无 pending 直接返回;有则全量写一次。
      // 写盘失败只 setLastIssue(routing 层软失败语义),不回滚 —— 数据已在 state 里,
      // 下次 flush 或阈值触发会再写。进程崩溃丢失的只是"上次成功写盘后新追加的攒批部分"。
      if (pendingWriteCount === 0) return;
      const records = state.getSnapshot().records;
      const writeResult = await options.adapter.writeMaterial('records', recordsMaterialId, records);
      if (writeResult.ok) {
        pendingWriteCount = 0;
      } else {
        state.setLastIssue({ code: `adapter.${writeResult.error.kind}`, message: writeResult.error.message });
      }
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
