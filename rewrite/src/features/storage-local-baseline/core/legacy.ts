import {
  createStorageIssue,
  createStorageValidationResult,
} from './validation';
import type {
  StorageLegacyJsonMaterial,
  StorageValidationIssue,
  StorageValidationResult,
} from './types';

export interface StorageLegacyJsonMaterialResult {
  readonly ok: boolean;
  readonly validation: StorageValidationResult;
  readonly material?: StorageLegacyJsonMaterial;
}

export function classifyStorageLegacyJsonMaterial(
  key: string,
  value: unknown,
  acceptedAt: string,
): StorageLegacyJsonMaterialResult {
  const issues: StorageValidationIssue[] = [];
  const normalizedKey = key.trim();

  if (!normalizedKey) {
    issues.push(createStorageIssue('legacy.keyMissing', 'legacy.key', '旧材料 key 不能为空'));
  }

  if (!Number.isFinite(Date.parse(acceptedAt))) {
    issues.push(createStorageIssue('legacy.acceptedAtInvalid', 'legacy.acceptedAt', '接收时间必须可解析'));
  }

  if (!Array.isArray(value)) {
    issues.push(createStorageIssue('legacy.arrayExpected', 'legacy.value', '本轮只接收数组形态的旧材料候选'));
  }

  const validation = createStorageValidationResult(issues);
  if (!validation.valid) {
    return {
      ok: false,
      validation,
    };
  }

  return {
    ok: true,
    validation,
    material: {
      key: normalizedKey,
      itemCount: Array.isArray(value) ? value.length : 0,
      acceptedAt,
    },
  };
}
