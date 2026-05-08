import {
  STORAGE_LOCAL_RECORD_SOURCES,
  type StorageLocalRecord,
  type StorageLocalRecordSource,
  type StorageRecordField,
  type StorageRecordFieldValue,
  type StorageValidationIssue,
  type StorageValidationResult,
} from './types';

export interface StorageLocalRecordNormalizeResult {
  readonly ok: boolean;
  readonly validation: StorageValidationResult;
  readonly record?: StorageLocalRecord;
}

export interface StorageLocalRecordsNormalizeResult {
  readonly ok: boolean;
  readonly validation: StorageValidationResult;
  readonly records: readonly StorageLocalRecord[];
}

export function createStorageIssue(
  code: string,
  location: string,
  message: string,
  severity: StorageValidationIssue['severity'] = 'error',
): StorageValidationIssue {
  return { code, location, message, severity };
}

export function createStorageValidationResult(
  issues: readonly StorageValidationIssue[],
): StorageValidationResult {
  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

export function createValidStorageResult(): StorageValidationResult {
  return {
    valid: true,
    issues: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSource(value: unknown): value is StorageLocalRecordSource {
  return (
    typeof value === 'string' &&
    (STORAGE_LOCAL_RECORD_SOURCES as readonly string[]).includes(value)
  );
}

function isFieldValue(value: unknown): value is StorageRecordFieldValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

export function isValidStorageInstant(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function normalizeField(value: unknown, location: string): {
  readonly field?: StorageRecordField;
  readonly issues: readonly StorageValidationIssue[];
} {
  const issues: StorageValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return {
      issues: [createStorageIssue('record.fieldInvalid', location, '字段必须是对象')],
    };
  }

  const key = isText(value.key) ? value.key.trim() : '';
  if (!key) {
    issues.push(createStorageIssue('record.fieldKeyMissing', `${location}.key`, '字段 key 不能为空'));
  }

  if (!('value' in value) || !isFieldValue(value.value)) {
    issues.push(createStorageIssue('record.fieldValueInvalid', `${location}.value`, '字段值类型不受支持'));
  }

  const unit = typeof value.unit === 'string' ? value.unit.trim() : undefined;

  if (issues.some((issue) => issue.severity === 'error')) {
    return { issues };
  }

  return {
    field: {
      key,
      value: value.value as StorageRecordFieldValue,
      ...(unit ? { unit } : {}),
    },
    issues,
  };
}

export function normalizeStorageLocalRecord(
  value: unknown,
  location = 'record',
): StorageLocalRecordNormalizeResult {
  const issues: StorageValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      validation: createStorageValidationResult([
        createStorageIssue('record.invalid', location, '本地记录必须是对象'),
      ]),
    };
  }

  const id = isText(value.id) ? value.id.trim() : '';
  if (!id) {
    issues.push(createStorageIssue('record.idMissing', `${location}.id`, '本地记录 ID 不能为空'));
  }

  const capturedAt = isText(value.capturedAt) ? value.capturedAt.trim() : '';
  if (!capturedAt || !isValidStorageInstant(capturedAt)) {
    issues.push(
      createStorageIssue('record.capturedAtInvalid', `${location}.capturedAt`, '记录时间必须是可解析时间'),
    );
  }

  const source: StorageLocalRecordSource = isSource(value.source) ? value.source : 'local';
  if (value.source !== undefined && !isSource(value.source)) {
    issues.push(
      createStorageIssue('record.sourceUnsupported', `${location}.source`, '记录来源不在本轮本地候选范围内'),
    );
  }

  const channel = isText(value.channel) ? value.channel.trim() : '';
  if (!channel) {
    issues.push(createStorageIssue('record.channelMissing', `${location}.channel`, '记录通道不能为空'));
  }

  if (!Array.isArray(value.fields) || value.fields.length === 0) {
    issues.push(createStorageIssue('record.fieldsMissing', `${location}.fields`, '记录字段不能为空'));
  }

  const fields: StorageRecordField[] = [];
  if (Array.isArray(value.fields)) {
    const seenKeys = new Set<string>();
    for (const [index, item] of value.fields.entries()) {
      const normalized = normalizeField(item, `${location}.fields.${index}`);
      issues.push(...normalized.issues);

      if (normalized.field) {
        if (seenKeys.has(normalized.field.key)) {
          issues.push(
            createStorageIssue(
              'record.fieldKeyDuplicate',
              `${location}.fields.${index}.key`,
              `字段 key 不能重复: ${normalized.field.key}`,
            ),
          );
        }
        seenKeys.add(normalized.field.key);
        fields.push(normalized.field);
      }
    }
  }

  const note = typeof value.note === 'string' ? value.note.trim() : undefined;
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
    record: {
      id,
      capturedAt,
      source,
      channel,
      fields,
      ...(note ? { note } : {}),
    },
  };
}

export function normalizeStorageLocalRecords(
  value: unknown,
  location = 'records',
): StorageLocalRecordsNormalizeResult {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      validation: createStorageValidationResult([
        createStorageIssue('records.invalid', location, '本地记录集合必须是数组'),
      ]),
      records: [],
    };
  }

  const records: StorageLocalRecord[] = [];
  const issues: StorageValidationIssue[] = [];

  for (const [index, item] of value.entries()) {
    const normalized = normalizeStorageLocalRecord(item, `${location}.${index}`);
    issues.push(...normalized.validation.issues);
    if (normalized.record) {
      records.push(normalized.record);
    }
  }

  const validation = createStorageValidationResult(issues);
  return {
    ok: validation.valid,
    validation,
    records: validation.valid ? records : [],
  };
}
