import type { StorageMaterialBucket } from '../core';

export const LOCAL_MATERIAL_ADAPTER_ERROR_KINDS = [
  'cancelled',
  'permission-denied',
  'unavailable',
  'corrupted',
  'write-failed',
  'missing',
] as const;

export type LocalMaterialAdapterErrorKind = (typeof LOCAL_MATERIAL_ADAPTER_ERROR_KINDS)[number];
export type LocalMaterialAdapterOperation = 'read' | 'write' | 'delete' | 'list';

export interface LocalMaterialAdapterError {
  readonly kind: LocalMaterialAdapterErrorKind;
  readonly message: string;
}

export interface LocalMaterialReadSuccess {
  readonly ok: true;
  readonly value: unknown;
}

export interface LocalMaterialWriteSuccess {
  readonly ok: true;
}

export interface LocalMaterialDeleteSuccess {
  readonly ok: true;
}

export interface LocalMaterialListSuccess {
  readonly ok: true;
  readonly ids: readonly string[];
}

export interface LocalMaterialFailure {
  readonly ok: false;
  readonly error: LocalMaterialAdapterError;
}

export type LocalMaterialReadResult = LocalMaterialReadSuccess | LocalMaterialFailure;
export type LocalMaterialWriteResult = LocalMaterialWriteSuccess | LocalMaterialFailure;
export type LocalMaterialDeleteResult = LocalMaterialDeleteSuccess | LocalMaterialFailure;
export type LocalMaterialListResult = LocalMaterialListSuccess | LocalMaterialFailure;

export interface LocalMaterialAdapter {
  readMaterial(bucket: StorageMaterialBucket, id: string): Promise<LocalMaterialReadResult>;
  writeMaterial(bucket: StorageMaterialBucket, id: string, value: unknown): Promise<LocalMaterialWriteResult>;
  deleteMaterial(bucket: StorageMaterialBucket, id: string): Promise<LocalMaterialDeleteResult>;
  listMaterials(bucket: StorageMaterialBucket): Promise<LocalMaterialListResult>;
}
