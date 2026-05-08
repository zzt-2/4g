import { cloneStorageValue, type StorageMaterialBucket } from '../core';
import type {
  LocalMaterialAdapter,
  LocalMaterialAdapterError,
  LocalMaterialAdapterOperation,
  LocalMaterialDeleteResult,
  LocalMaterialListResult,
  LocalMaterialReadResult,
  LocalMaterialWriteResult,
} from './ports';

export interface FakeLocalMaterialSeed {
  readonly bucket: StorageMaterialBucket;
  readonly id: string;
  readonly value: unknown;
}

export interface FakeLocalMaterialFailure {
  readonly operation: LocalMaterialAdapterOperation;
  readonly bucket?: StorageMaterialBucket;
  readonly id?: string;
  readonly error: LocalMaterialAdapterError;
}

export interface FakeLocalMaterialAdapter extends LocalMaterialAdapter {
  setFailure(failure: FakeLocalMaterialFailure): void;
  clearFailures(): void;
  readStoredMaterial(bucket: StorageMaterialBucket, id: string): unknown;
}

export interface CreateFakeLocalMaterialAdapterOptions {
  readonly seeds?: readonly FakeLocalMaterialSeed[];
  readonly failures?: readonly FakeLocalMaterialFailure[];
}

function createStore(): Map<StorageMaterialBucket, Map<string, unknown>> {
  return new Map<StorageMaterialBucket, Map<string, unknown>>([
    ['records', new Map<string, unknown>()],
    ['history', new Map<string, unknown>()],
    ['csv', new Map<string, unknown>()],
    ['legacy', new Map<string, unknown>()],
    ['snapshot', new Map<string, unknown>()],
  ]);
}

function findFailure(
  failures: readonly FakeLocalMaterialFailure[],
  operation: LocalMaterialAdapterOperation,
  bucket: StorageMaterialBucket,
  id?: string,
): FakeLocalMaterialFailure | undefined {
  return failures.find((failure) => {
    if (failure.operation !== operation) {
      return false;
    }
    if (failure.bucket !== undefined && failure.bucket !== bucket) {
      return false;
    }
    return failure.id === undefined || failure.id === id;
  });
}

export function createFakeLocalMaterialAdapter(
  options: CreateFakeLocalMaterialAdapterOptions = {},
): FakeLocalMaterialAdapter {
  const store = createStore();
  let failures = [...(options.failures ?? [])];

  for (const seed of options.seeds ?? []) {
    store.get(seed.bucket)!.set(seed.id, cloneStorageValue(seed.value));
  }

  return {
    async readMaterial(bucket, id): Promise<LocalMaterialReadResult> {
      const failure = findFailure(failures, 'read', bucket, id);
      if (failure) {
        return { ok: false, error: failure.error };
      }

      const material = store.get(bucket)!.get(id);
      if (material === undefined) {
        return {
          ok: false,
          error: {
            kind: 'missing',
            message: `未找到本地材料: ${bucket}/${id}`,
          },
        };
      }

      return {
        ok: true,
        value: cloneStorageValue(material),
      };
    },

    async writeMaterial(bucket, id, value): Promise<LocalMaterialWriteResult> {
      const failure = findFailure(failures, 'write', bucket, id);
      if (failure) {
        return { ok: false, error: failure.error };
      }

      store.get(bucket)!.set(id, cloneStorageValue(value));
      return { ok: true };
    },

    async deleteMaterial(bucket, id): Promise<LocalMaterialDeleteResult> {
      const failure = findFailure(failures, 'delete', bucket, id);
      if (failure) {
        return { ok: false, error: failure.error };
      }

      store.get(bucket)!.delete(id);
      return { ok: true };
    },

    async listMaterials(bucket): Promise<LocalMaterialListResult> {
      const failure = findFailure(failures, 'list', bucket);
      if (failure) {
        return { ok: false, error: failure.error };
      }

      return {
        ok: true,
        ids: Array.from(store.get(bucket)!.keys()).sort(),
      };
    },

    setFailure(failure) {
      failures = [...failures, failure];
    },

    clearFailures() {
      failures = [];
    },

    readStoredMaterial(bucket, id) {
      const material = store.get(bucket)!.get(id);
      return material === undefined ? undefined : cloneStorageValue(material);
    },
  };
}
