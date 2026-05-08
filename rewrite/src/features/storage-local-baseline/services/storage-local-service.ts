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
