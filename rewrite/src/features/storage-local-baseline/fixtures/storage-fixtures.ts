import type {
  StorageCsvColumn,
  StorageHistoryMaterial,
  StorageLocalRecord,
} from '../core';

export const storageRecordA: StorageLocalRecord = {
  id: 'record-a',
  capturedAt: '2026-04-30T08:10:00.000Z',
  source: 'local',
  channel: 'telemetry-a',
  fields: [
    { key: 'temperature', value: 20.5, unit: 'C' },
    { key: 'status', value: 'nominal' },
  ],
};

export const storageRecordB: StorageLocalRecord = {
  id: 'record-b',
  capturedAt: '2026-04-30T08:20:00.000Z',
  source: 'local',
  channel: 'telemetry-a',
  fields: [
    { key: 'temperature', value: 21 },
    { key: 'status', value: 'quoted, value' },
  ],
};

export const storageRecordNextHour: StorageLocalRecord = {
  id: 'record-c',
  capturedAt: '2026-04-30T09:05:00.000Z',
  source: 'manual',
  channel: 'telemetry-b',
  fields: [
    { key: 'temperature', value: 19 },
    { key: 'status', value: null },
  ],
};

export const invalidStorageRecord = {
  id: '',
  capturedAt: 'not-a-time',
  source: 'local',
  channel: 'telemetry-a',
  fields: [{ key: '', value: { nested: true } }],
};

export const historyHourMaterial: StorageHistoryMaterial = {
  hourKey: '2026-04-30T08',
  source: 'legacy',
  records: [storageRecordB, storageRecordA],
};

export const storageCsvColumns: StorageCsvColumn[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'status', label: 'Status' },
];

export const expectedStorageCsvContent =
  'capturedAt,channel,Temperature,Status\n' +
  '2026-04-30T08:10:00.000Z,telemetry-a,20.5,nominal\n' +
  '2026-04-30T08:20:00.000Z,telemetry-a,21,"quoted, value"\n';

export const legacyArrayMaterial = [
  { id: 'legacy-a', name: '旧材料 A' },
  { id: 'legacy-b', name: '旧材料 B' },
];
