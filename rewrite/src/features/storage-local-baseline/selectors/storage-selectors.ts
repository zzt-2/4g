import {
  cloneStorageCsvMaterial,
  cloneStorageLegacyJsonMaterial,
  queryStorageLocalRecords,
  summarizeStorageHours,
  type ReadonlyStorageCsvMaterial,
  type ReadonlyStorageLegacyJsonMaterial,
  type ReadonlyStorageLocalRecord,
  type StorageHourSummary,
  type StorageRecordQuery,
} from '../core';
import type { StorageStateIssue, StorageStateSnapshot } from '../state';

export interface StorageCsvMaterialSummary {
  readonly id: string;
  readonly name: string;
  readonly generatedAt: string;
  readonly recordCount: number;
  readonly columnCount: number;
}

export interface StorageLegacyMaterialSummary {
  readonly key: string;
  readonly itemCount: number;
  readonly acceptedAt: string;
}

export function selectStorageLocalRecords(
  snapshot: StorageStateSnapshot,
  query?: StorageRecordQuery,
): ReadonlyStorageLocalRecord[] {
  return queryStorageLocalRecords(snapshot.records, query);
}

export function selectStorageHourSummaries(snapshot: StorageStateSnapshot): StorageHourSummary[] {
  return summarizeStorageHours(snapshot.records);
}

export function selectStorageCsvMaterialSummaries(
  snapshot: StorageStateSnapshot,
): StorageCsvMaterialSummary[] {
  return snapshot.csvMaterials.map((material) => ({
    id: material.id,
    name: material.name,
    generatedAt: material.generatedAt,
    recordCount: material.recordCount,
    columnCount: material.columns.length,
  }));
}

export function selectStorageCsvMaterial(
  snapshot: StorageStateSnapshot,
  id: string,
): ReadonlyStorageCsvMaterial | undefined {
  const material = snapshot.csvMaterials.find((item) => item.id === id);
  return material ? cloneStorageCsvMaterial(material) : undefined;
}

export function selectStorageLegacyMaterialSummaries(
  snapshot: StorageStateSnapshot,
): StorageLegacyMaterialSummary[] {
  return snapshot.legacyMaterials.map((material) => ({
    key: material.key,
    itemCount: material.itemCount,
    acceptedAt: material.acceptedAt,
  }));
}

export function selectStorageLegacyMaterial(
  snapshot: StorageStateSnapshot,
  key: string,
): ReadonlyStorageLegacyJsonMaterial | undefined {
  const material = snapshot.legacyMaterials.find((item) => item.key === key);
  return material ? cloneStorageLegacyJsonMaterial(material) : undefined;
}

export function selectStorageLastIssue(snapshot: StorageStateSnapshot): StorageStateIssue | undefined {
  return snapshot.lastIssue ? { ...snapshot.lastIssue } : undefined;
}
