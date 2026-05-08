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
