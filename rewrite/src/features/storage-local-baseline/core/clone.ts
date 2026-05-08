import type {
  StorageCsvMaterial,
  StorageHistoryMaterial,
  StorageLegacyJsonMaterial,
  StorageLocalRecord,
} from './types';

export function cloneStorageValue<T>(value: T): T {
  return globalThis.structuredClone(value);
}

export function cloneStorageLocalRecord(record: StorageLocalRecord): StorageLocalRecord {
  return cloneStorageValue(record);
}

export function cloneStorageLocalRecords(records: readonly StorageLocalRecord[]): StorageLocalRecord[] {
  return records.map(cloneStorageLocalRecord);
}

export function cloneStorageHistoryMaterial(material: StorageHistoryMaterial): StorageHistoryMaterial {
  return cloneStorageValue(material);
}

export function cloneStorageHistoryMaterials(
  materials: readonly StorageHistoryMaterial[],
): StorageHistoryMaterial[] {
  return materials.map(cloneStorageHistoryMaterial);
}

export function cloneStorageCsvMaterial(material: StorageCsvMaterial): StorageCsvMaterial {
  return cloneStorageValue(material);
}

export function cloneStorageCsvMaterials(materials: readonly StorageCsvMaterial[]): StorageCsvMaterial[] {
  return materials.map(cloneStorageCsvMaterial);
}

export function cloneStorageLegacyJsonMaterial(
  material: StorageLegacyJsonMaterial,
): StorageLegacyJsonMaterial {
  return cloneStorageValue(material);
}

export function cloneStorageLegacyJsonMaterials(
  materials: readonly StorageLegacyJsonMaterial[],
): StorageLegacyJsonMaterial[] {
  return materials.map(cloneStorageLegacyJsonMaterial);
}
