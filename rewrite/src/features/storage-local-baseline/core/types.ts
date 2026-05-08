export const STORAGE_MATERIAL_BUCKETS = ['records', 'history', 'csv', 'legacy', 'snapshot'] as const;
export const STORAGE_LOCAL_RECORD_SOURCES = ['local', 'legacy', 'manual'] as const;

export type StorageMaterialBucket = (typeof STORAGE_MATERIAL_BUCKETS)[number];
export type StorageLocalRecordSource = (typeof STORAGE_LOCAL_RECORD_SOURCES)[number];

export type StorageRecordFieldValue = string | number | boolean | null;

export interface StorageRecordField {
  readonly key: string;
  readonly value: StorageRecordFieldValue;
  readonly unit?: string;
}

export interface StorageLocalRecord {
  readonly id: string;
  readonly capturedAt: string;
  readonly source: StorageLocalRecordSource;
  readonly channel: string;
  readonly fields: readonly StorageRecordField[];
  readonly note?: string;
}

export interface StorageHistoryMaterial {
  readonly hourKey: string;
  readonly source: StorageLocalRecordSource;
  readonly records: readonly StorageLocalRecord[];
}

export interface StorageCsvColumn {
  readonly key: string;
  readonly label: string;
}

export interface StorageCsvMaterial {
  readonly id: string;
  readonly name: string;
  readonly generatedAt: string;
  readonly columns: readonly StorageCsvColumn[];
  readonly recordCount: number;
  readonly content: string;
}

export interface StorageLegacyJsonMaterial {
  readonly key: string;
  readonly itemCount: number;
  readonly acceptedAt: string;
}

export type StorageValidationSeverity = 'error' | 'warning';

export interface StorageValidationIssue {
  readonly severity: StorageValidationSeverity;
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

export interface StorageValidationResult {
  readonly valid: boolean;
  readonly issues: readonly StorageValidationIssue[];
}

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlyStorageLocalRecord = ReadonlyDeep<StorageLocalRecord>;
export type ReadonlyStorageHistoryMaterial = ReadonlyDeep<StorageHistoryMaterial>;
export type ReadonlyStorageCsvMaterial = ReadonlyDeep<StorageCsvMaterial>;
export type ReadonlyStorageLegacyJsonMaterial = ReadonlyDeep<StorageLegacyJsonMaterial>;
