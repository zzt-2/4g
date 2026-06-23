import {
  cloneStorageCsvMaterials,
  cloneStorageHistoryMaterials,
  cloneStorageLegacyJsonMaterials,
  cloneStorageLocalRecords,
  type ReadonlyStorageCsvMaterial,
  type ReadonlyStorageHistoryMaterial,
  type ReadonlyStorageLegacyJsonMaterial,
  type ReadonlyStorageLocalRecord,
  type StorageCsvMaterial,
  type StorageHistoryMaterial,
  type StorageLegacyJsonMaterial,
  type StorageLocalRecord,
} from '../core';

export interface StorageStateIssue {
  readonly code: string;
  readonly message: string;
}

export interface StorageStateSnapshot {
  readonly records: readonly ReadonlyStorageLocalRecord[];
  readonly historyMaterials: readonly ReadonlyStorageHistoryMaterial[];
  readonly csvMaterials: readonly ReadonlyStorageCsvMaterial[];
  readonly legacyMaterials: readonly ReadonlyStorageLegacyJsonMaterial[];
  readonly lastIssue?: StorageStateIssue;
}

export interface StorageStateInitialValue {
  readonly records?: readonly StorageLocalRecord[];
  readonly historyMaterials?: readonly StorageHistoryMaterial[];
  readonly csvMaterials?: readonly StorageCsvMaterial[];
  readonly legacyMaterials?: readonly StorageLegacyJsonMaterial[];
  readonly lastIssue?: StorageStateIssue;
}

export interface StorageStateContainer {
  getSnapshot(): StorageStateSnapshot;
  replaceRecords(records: readonly StorageLocalRecord[]): StorageStateSnapshot;
  /** 增量追加(治本"开久了卡",S012 续 性能任务):调用方须保证 newRecords 已按 capturedAt
   *  升序、且 id 不与现有冲突、且首条 capturedAt ≥ 现有末条(即整体仍有序)。满足时直接
   *  concat 到 canonical 数组,跳过全量 merge/排序/深拷贝。语义等价于 replaceRecords([...old, ...new])
   *  但避免每帧 O(N) 的 mergeStorageLocalRecords。不满足时调用方应回退 replaceRecords。
   *  返回 { merged, snapshot }:merged 是追加后的完整数组(canonical 引用,调用方只读不写),
   *  snapshot 是供结果返回的隔离快照。一次调用同时拿到两者,避免调用方再触发一次 getSnapshot 全量拷贝。 */
  appendRecords(newRecords: readonly StorageLocalRecord[]): { merged: readonly StorageLocalRecord[]; snapshot: StorageStateSnapshot };
  /** 末条 record 的 capturedAt 毫秒数(无 record 返回 null)。用于 append 快速路径的边界检查,
   *  避免为读末条而触发 getSnapshot 的全量深拷贝。 */
  getLastRecordCapturedAtMs(): number | null;
  /** 是否已存在该 id 的 record(O(N) 但只在快速路径 id 冲突兜底用,routingTick 真实负载
   *  id 全新,几乎总返回 false 提前结束)。 */
  hasRecordId(id: string): boolean;
  replaceHistoryMaterials(materials: readonly StorageHistoryMaterial[]): StorageStateSnapshot;
  upsertCsvMaterial(material: StorageCsvMaterial): StorageStateSnapshot;
  upsertLegacyMaterial(material: StorageLegacyJsonMaterial): StorageStateSnapshot;
  setLastIssue(issue: StorageStateIssue | undefined): StorageStateSnapshot;
}

function cloneIssue(issue: StorageStateIssue | undefined): StorageStateIssue | undefined {
  return issue ? { ...issue } : undefined;
}

function createSnapshot(
  records: readonly StorageLocalRecord[],
  historyMaterials: readonly StorageHistoryMaterial[],
  csvMaterials: readonly StorageCsvMaterial[],
  legacyMaterials: readonly StorageLegacyJsonMaterial[],
  lastIssue: StorageStateIssue | undefined,
): StorageStateSnapshot {
  return {
    records: cloneStorageLocalRecords(records),
    historyMaterials: cloneStorageHistoryMaterials(historyMaterials),
    csvMaterials: cloneStorageCsvMaterials(csvMaterials),
    legacyMaterials: cloneStorageLegacyJsonMaterials(legacyMaterials),
    ...(lastIssue ? { lastIssue: cloneIssue(lastIssue) } : {}),
  };
}

function upsertById<T extends { readonly id: string }>(items: readonly T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

function upsertLegacyByKey(
  items: readonly StorageLegacyJsonMaterial[],
  nextItem: StorageLegacyJsonMaterial,
): StorageLegacyJsonMaterial[] {
  const index = items.findIndex((item) => item.key === nextItem.key);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

export function createStorageState(
  initialValue: StorageStateInitialValue = {},
): StorageStateContainer {
  let records = cloneStorageLocalRecords(initialValue.records ?? []);
  let historyMaterials = cloneStorageHistoryMaterials(initialValue.historyMaterials ?? []);
  let csvMaterials = cloneStorageCsvMaterials(initialValue.csvMaterials ?? []);
  let legacyMaterials = cloneStorageLegacyJsonMaterials(initialValue.legacyMaterials ?? []);
  let lastIssue = cloneIssue(initialValue.lastIssue);

  const snapshot = () =>
    createSnapshot(records, historyMaterials, csvMaterials, legacyMaterials, lastIssue);

  return {
    getSnapshot() {
      return snapshot();
    },

    replaceRecords(nextRecords) {
      records = cloneStorageLocalRecords(nextRecords);
      return snapshot();
    },

    appendRecords(newRecords) {
      // 仅深拷贝新增部分,concat 到 canonical。整体有序性由调用方保证(见接口注释)。
      // records 是本闭包私有的 canonical 数组,这里原地重建(append)安全,无人共享引用。
      records = [...records, ...cloneStorageLocalRecords(newRecords)];
      return { merged: records, snapshot: snapshot() };
    },

    getLastRecordCapturedAtMs() {
      if (records.length === 0) return null;
      const last = records[records.length - 1]!;
      const ms = Date.parse(last.capturedAt);
      return Number.isNaN(ms) ? null : ms;
    },

    hasRecordId(id) {
      for (const record of records) {
        if (record.id === id) return true;
      }
      return false;
    },

    replaceHistoryMaterials(nextMaterials) {
      historyMaterials = cloneStorageHistoryMaterials(nextMaterials);
      return snapshot();
    },

    upsertCsvMaterial(material) {
      csvMaterials = upsertById(csvMaterials, cloneStorageCsvMaterials([material])[0]!);
      return snapshot();
    },

    upsertLegacyMaterial(material) {
      legacyMaterials = upsertLegacyByKey(
        legacyMaterials,
        cloneStorageLegacyJsonMaterials([material])[0]!,
      );
      return snapshot();
    },

    setLastIssue(issue) {
      lastIssue = cloneIssue(issue);
      return snapshot();
    },
  };
}
