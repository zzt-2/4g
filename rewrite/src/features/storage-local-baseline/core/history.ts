import { cloneStorageLocalRecords } from './clone';
import {
  createStorageIssue,
  createStorageValidationResult,
  normalizeStorageLocalRecords,
} from './validation';
import type {
  StorageHistoryMaterial,
  StorageLocalRecord,
  StorageLocalRecordSource,
  StorageValidationIssue,
  StorageValidationResult,
} from './types';

export interface StorageHistoryMaterialNormalizeResult {
  readonly ok: boolean;
  readonly validation: StorageValidationResult;
  readonly material?: StorageHistoryMaterial;
}

export interface StorageRecordQuery {
  readonly from?: string;
  readonly to?: string;
  readonly channel?: string;
  readonly fieldKeys?: readonly string[];
}

export interface StorageHourSummary {
  readonly hourKey: string;
  readonly recordCount: number;
  readonly firstCapturedAt: string;
  readonly lastCapturedAt: string;
}

export function getStorageHourKey(capturedAt: string): string {
  return new Date(capturedAt).toISOString().slice(0, 13);
}

export function sortStorageLocalRecords(
  records: readonly StorageLocalRecord[],
): StorageLocalRecord[] {
  return cloneStorageLocalRecords(records).sort((left, right) => {
    const timeDifference = Date.parse(left.capturedAt) - Date.parse(right.capturedAt);
    return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
  });
}

export function mergeStorageLocalRecords(
  records: readonly StorageLocalRecord[],
): StorageLocalRecord[] {
  const byId = new Map<string, StorageLocalRecord>();
  for (const record of records) {
    byId.set(record.id, record);
  }
  return sortStorageLocalRecords(Array.from(byId.values()));
}

export function createStorageHistoryMaterial(
  hourKey: string,
  records: readonly StorageLocalRecord[],
  source: StorageLocalRecordSource = 'local',
): StorageHistoryMaterial {
  return {
    hourKey,
    source,
    records: sortStorageLocalRecords(records),
  };
}

export function normalizeStorageHistoryMaterial(
  value: unknown,
  location = 'history',
): StorageHistoryMaterialNormalizeResult {
  const issues: StorageValidationIssue[] = [];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      validation: createStorageValidationResult([
        createStorageIssue('history.invalid', location, '历史材料必须是对象'),
      ]),
    };
  }

  const candidate = value as Record<string, unknown>;
  const hourKey = typeof candidate.hourKey === 'string' ? candidate.hourKey.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourKey)) {
    issues.push(createStorageIssue('history.hourKeyInvalid', `${location}.hourKey`, '小时键格式不正确'));
  }

  const normalizedRecords = normalizeStorageLocalRecords(candidate.records, `${location}.records`);
  issues.push(...normalizedRecords.validation.issues);

  for (const [index, record] of normalizedRecords.records.entries()) {
    if (hourKey && getStorageHourKey(record.capturedAt) !== hourKey) {
      issues.push(
        createStorageIssue(
          'history.recordHourMismatch',
          `${location}.records.${index}.capturedAt`,
          '记录时间不属于声明的小时键',
          'warning',
        ),
      );
    }
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
    material: createStorageHistoryMaterial(hourKey, normalizedRecords.records),
  };
}

export function mergeStorageHistoryMaterials(
  materials: readonly StorageHistoryMaterial[],
): StorageLocalRecord[] {
  return mergeStorageLocalRecords(materials.flatMap((material) => material.records));
}

export function queryStorageLocalRecords(
  records: readonly StorageLocalRecord[],
  query: StorageRecordQuery = {},
): StorageLocalRecord[] {
  const fromTime = query.from ? Date.parse(query.from) : undefined;
  const toTime = query.to ? Date.parse(query.to) : undefined;
  const fieldKeySet = query.fieldKeys ? new Set(query.fieldKeys) : undefined;

  return sortStorageLocalRecords(records).filter((record) => {
    const capturedTime = Date.parse(record.capturedAt);
    if (fromTime !== undefined && capturedTime < fromTime) {
      return false;
    }
    if (toTime !== undefined && capturedTime > toTime) {
      return false;
    }
    if (query.channel && record.channel !== query.channel) {
      return false;
    }
    if (fieldKeySet && !record.fields.some((field) => fieldKeySet.has(field.key))) {
      return false;
    }
    return true;
  });
}

export function cleanupStorageLocalRecords(
  records: readonly StorageLocalRecord[],
  keepFrom: string,
): StorageLocalRecord[] {
  const keepFromTime = Date.parse(keepFrom);
  return sortStorageLocalRecords(records).filter(
    (record) => Date.parse(record.capturedAt) >= keepFromTime,
  );
}

export function summarizeStorageHours(records: readonly StorageLocalRecord[]): StorageHourSummary[] {
  const grouped = new Map<string, StorageLocalRecord[]>();
  for (const record of sortStorageLocalRecords(records)) {
    const hourKey = getStorageHourKey(record.capturedAt);
    grouped.set(hourKey, [...(grouped.get(hourKey) ?? []), record]);
  }

  return Array.from(grouped.entries()).map(([hourKey, hourRecords]) => {
    const firstRecord = hourRecords[0]!;
    const lastRecord = hourRecords[hourRecords.length - 1]!;
    return {
      hourKey,
      recordCount: hourRecords.length,
      firstCapturedAt: firstRecord.capturedAt,
      lastCapturedAt: lastRecord.capturedAt,
    };
  });
}
