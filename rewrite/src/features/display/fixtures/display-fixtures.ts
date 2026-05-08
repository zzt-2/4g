import type {
  DisplayFieldMaterial,
  DisplayPreferencesPatch,
  DisplaySnapshot,
} from '../core';

// --- Default fixture ---

export const defaultDisplayFixture: DisplaySnapshot = {
  schemaVersion: 1,
  preferences: {
    table1: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
    table2: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
    chart: { selectedItems: [], performance: { maxPoints: 500, refreshIntervalMs: 200 } },
    scatter: {
      iSource: { groupId: '', dataItemId: '' },
      qSource: { groupId: '', dataItemId: '' },
      sampleCount: 256,
      bitWidth: 8,
      refreshIntervalMs: 100,
    },
    refreshCadenceMs: 500,
  },
  projection: {
    table1Rows: [],
    table2Rows: [],
    chartSeries: [],
    scatter: { points: [], sampleCount: 0 },
  },
  availability: { available: false, reason: 'no-source' },
};

// --- Source material fixtures ---

export const sampleFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'g1', dataItemId: 'f1', fieldName: 'Voltage', value: 3.3, displayValue: '3.3 V', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'g1', dataItemId: 'f2', fieldName: 'Current', value: 1.5, displayValue: '1.5 A', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'g2', dataItemId: 'f1', fieldName: 'Temperature', value: 25, displayValue: '25 °C', updatedAt: '2026-05-06T10:00:01Z' },
  { groupId: 'g2', dataItemId: 'f2', fieldName: 'Pressure', value: 101.3, displayValue: '101.3 kPa', updatedAt: '2026-05-06T10:00:01Z' },
];

export const sampleIqFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'iq', dataItemId: 'iData', fieldName: 'I', value: 0.707, displayValue: '0.707', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'iq', dataItemId: 'qData', fieldName: 'Q', value: -0.707, displayValue: '-0.707', updatedAt: '2026-05-06T10:00:00Z' },
];

export const emptyFieldMaterial: DisplayFieldMaterial[] = [];

export const nonNumericFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'iq', dataItemId: 'iData', fieldName: 'I', value: 'not-a-number', displayValue: 'N/A', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'iq', dataItemId: 'qData', fieldName: 'Q', value: null, displayValue: 'N/A', updatedAt: '2026-05-06T10:00:00Z' },
];

// --- Preference patches ---

export const updateTable1Patch: DisplayPreferencesPatch = {
  table1: { displayMode: 'chart', selectedGroupId: 'g1', selectedItems: ['f1', 'f2'] },
};

export const updateChartPatch: DisplayPreferencesPatch = {
  chart: { selectedItems: ['g1:f1', 'g1:f2'] },
};

export const updateScatterPatch: DisplayPreferencesPatch = {
  scatter: { iSource: { groupId: 'iq', dataItemId: 'iData' }, qSource: { groupId: 'iq', dataItemId: 'qData' } },
};

// --- Invalid inputs ---

export const invalidPreferenceInput = {
  table1: { displayMode: 'invalid-mode', selectedItems: 42 },
  chart: { performance: { maxPoints: -1, refreshIntervalMs: 0 } },
  scatter: { sampleCount: -10, bitWidth: 0 },
  refreshCadenceMs: -100,
} as const;

// --- Legacy-like input ---

export const legacyLikeDisplayInput = {
  table1: { displayMode: 'table', selectedGroupId: 'group-a', selectedItems: ['item1', 'item2'] },
  table2: { displayMode: 'special', selectedGroupId: 'group-b', selectedItems: ['item3'] },
  'chart-performance-config': { maxPoints: 1000, refreshInterval: 100 },
  historyAnalysis_chartSettings: { charts: [] },
  refreshCadenceMs: 300,
} as const;
