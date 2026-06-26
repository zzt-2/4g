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
   *  返回 merged:追加后的完整数组(canonical 引用,调用方只读不写)。
   *  注:不再返回 snapshot —— 路由层(fanOutToStorage)不需要 snapshot,返回它会触发一次
   *  全量深拷贝,正是 O(N) 退化的根源。需要快照的调用方显式调 getSnapshot()(按需付深拷贝)。
   *  保留可选 quickSnapshot 参数兼容旧调用:传 true 才返回 snapshot(仍深拷贝,仅供需要方)。 */
  appendRecords(
    newRecords: readonly StorageLocalRecord[],
    quickSnapshot?: boolean,
  ): { merged: readonly StorageLocalRecord[]; snapshot?: StorageStateSnapshot };
  /** 截断 records 到指定长度(治本"开久了卡"):用于 append 后写盘失败的回滚。
   *  取代旧的"写盘前 getSnapshot().records 全量深拷贝做备份"——截断是 O(1) slice,不深拷贝。
   *  count >= 当前长度时不操作。返回轻量计数快照(不深拷贝 records,只给 length 供校验)。 */
  truncateRecords(count: number): { recordCount: number };
  /** 当前 records 长度(O(1),不触发深拷贝)。用于路由层 append 前记录 prevLength 供回滚。 */
  getRecordCount(): number;
  /** 清空 lastIssue(O(1),不返回 snapshot)。治本"开久了卡"(S012 续):路由层 append 成功后
   *  需清错误标记,但 setLastIssue 返回 snapshot(全量深拷贝)= O(N) 退化。本方法只清标记。 */
  clearLastIssue(): void;
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
  // 治本"开久了卡"(S012 续):id 集合索引,把 hasRecordId 从 O(N) 遍历降到 O(1)。
  // 与 records 同步维护:append 加、replace/truncate/history-load 重建。fast-path 的 id 冲突
  // 兜底检查(canAppendInOrderFast)每帧调 hasRecordId,旧实现遍历全量 records,O(N) 退化。
  let recordIds = new Set<string>(records.map((r) => r.id));

  const snapshot = () =>
    createSnapshot(records, historyMaterials, csvMaterials, legacyMaterials, lastIssue);

  return {
    getSnapshot() {
      return snapshot();
    },

    replaceRecords(nextRecords) {
      records = cloneStorageLocalRecords(nextRecords);
      recordIds = new Set(records.map((r) => r.id));
      return snapshot();
    },

    appendRecords(newRecords, quickSnapshot = false) {
      // 治本"开久了卡"(S012 续):旧实现 records = [...records, ...newRecords] 每次重建
      // 整个数组(O(N) 复制),append 1 条也要复制全量 N 条 → O(N) 退化。
      // 改 mutable push:records 是本闭包私有的数组(闭包外只拿到 snapshot 深拷贝隔离,
      // 拿不到 canonical 引用),原地 push 安全。O(新增条数),不随全量 N 增长。
      const clonedNew = cloneStorageLocalRecords(newRecords);
      for (const r of clonedNew) {
        records.push(r);
        recordIds.add(r.id);
      }
      // 默认不返回 snapshot(路由层不需要,返回它 = 白付一次全量深拷贝 = O(N) 退化根源)。
      // 仅当调用方显式 quickSnapshot=true 才返回(需要方按需付代价)。
      return { merged: records, ...(quickSnapshot ? { snapshot: snapshot() } : {}) };
    },

    truncateRecords(count) {
      if (count >= records.length) return { recordCount: records.length };
      // 治本"开久了卡":mutable 截断(O(被删条数)),不重建整个数组。
      records.length = count;
      // 同步 id 索引:截断后重建(低频路径,仅写盘失败回滚用,可接受 O(剩余) 重建)。
      recordIds = new Set(records.map((r) => r.id));
      return { recordCount: records.length };
    },

    getRecordCount() {
      return records.length;
    },

    getLastRecordCapturedAtMs() {
      if (records.length === 0) return null;
      const last = records[records.length - 1]!;
      const ms = Date.parse(last.capturedAt);
      return Number.isNaN(ms) ? null : ms;
    },

    hasRecordId(id) {
      // 治本"开久了卡"(S012 续):O(1) Set 查找,取代旧 O(N) 全量遍历。
      return recordIds.has(id);
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

    clearLastIssue() {
      // 治本"开久了卡"(S012 续):O(1) 清标记,不返回 snapshot(避免全量深拷贝)。
      lastIssue = undefined;
    },
  };
}
