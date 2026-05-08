import { sortStorageLocalRecords } from './history';
import {
  createStorageIssue,
  createStorageValidationResult,
} from './validation';
import type {
  StorageCsvColumn,
  StorageCsvMaterial,
  StorageLocalRecord,
  StorageRecordFieldValue,
  StorageValidationIssue,
  StorageValidationResult,
} from './types';

export interface CreateStorageCsvMaterialInput {
  readonly id: string;
  readonly name: string;
  readonly generatedAt: string;
  readonly records: readonly StorageLocalRecord[];
  readonly columns: readonly StorageCsvColumn[];
  readonly includeHeader?: boolean;
}

export interface CreateStorageCsvMaterialResult {
  readonly ok: boolean;
  readonly validation: StorageValidationResult;
  readonly material?: StorageCsvMaterial;
}

function cellToText(value: StorageRecordFieldValue | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function getRecordValue(record: StorageLocalRecord, key: string): StorageRecordFieldValue | undefined {
  return record.fields.find((field) => field.key === key)?.value;
}

function renderCsvRows(
  records: readonly StorageLocalRecord[],
  columns: readonly StorageCsvColumn[],
  includeHeader: boolean,
): string {
  const rows: string[] = [];
  if (includeHeader) {
    rows.push(['capturedAt', 'channel', ...columns.map((column) => column.label)].map(escapeCsvCell).join(','));
  }

  for (const record of sortStorageLocalRecords(records)) {
    rows.push(
      [
        record.capturedAt,
        record.channel,
        ...columns.map((column) => cellToText(getRecordValue(record, column.key))),
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }

  return `${rows.join('\n')}\n`;
}

export function createStorageCsvMaterial(
  input: CreateStorageCsvMaterialInput,
): CreateStorageCsvMaterialResult {
  const issues: StorageValidationIssue[] = [];
  const id = input.id.trim();
  const name = input.name.trim();

  if (!id) {
    issues.push(createStorageIssue('csv.idMissing', 'csv.id', 'CSV 材料 ID 不能为空'));
  }

  if (!name) {
    issues.push(createStorageIssue('csv.nameMissing', 'csv.name', 'CSV 材料名称不能为空'));
  }

  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    issues.push(createStorageIssue('csv.generatedAtInvalid', 'csv.generatedAt', '生成时间必须可解析'));
  }

  if (input.records.length === 0) {
    issues.push(createStorageIssue('csv.recordsEmpty', 'csv.records', '没有可写入 CSV 的本地记录'));
  }

  if (input.columns.length === 0) {
    issues.push(createStorageIssue('csv.columnsEmpty', 'csv.columns', 'CSV 至少需要一个数据列'));
  }

  const seenColumnKeys = new Set<string>();
  for (const [index, column] of input.columns.entries()) {
    const key = column.key.trim();
    const label = column.label.trim();

    if (!key) {
      issues.push(createStorageIssue('csv.columnKeyMissing', `csv.columns.${index}.key`, 'CSV 列 key 不能为空'));
    }
    if (!label) {
      issues.push(
        createStorageIssue('csv.columnLabelMissing', `csv.columns.${index}.label`, 'CSV 列标题不能为空'),
      );
    }
    if (seenColumnKeys.has(key)) {
      issues.push(
        createStorageIssue('csv.columnKeyDuplicate', `csv.columns.${index}.key`, `CSV 列 key 不能重复: ${key}`),
      );
    }
    seenColumnKeys.add(key);
  }

  const validation = createStorageValidationResult(issues);
  if (!validation.valid) {
    return {
      ok: false,
      validation,
    };
  }

  const columns = input.columns.map((column) => ({
    key: column.key.trim(),
    label: column.label.trim(),
  }));

  return {
    ok: true,
    validation,
    material: {
      id,
      name,
      generatedAt: input.generatedAt,
      columns,
      recordCount: input.records.length,
      content: renderCsvRows(input.records, columns, input.includeHeader !== false),
    },
  };
}
