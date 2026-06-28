import {
  DISPLAY_SCHEMA_VERSION,
  type ChartInstancePatch,
  type DisplayFieldMaterial,
  type DisplayPreferencesPatch,
  type DisplaySnapshot,
} from '../core';

// --- Default fixture ---

export const defaultDisplayFixture: DisplaySnapshot = {
  schemaVersion: DISPLAY_SCHEMA_VERSION,
  preferences: {
    table1: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
    table2: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
    charts: [
      { id: 'chart-1', title: '图表1', selectedItems: [], yAxis: { autoScale: true }, performance: { maxPoints: 500, refreshIntervalMs: 2000 } },
    ],
    scatter: {
      iSource: { groupId: '', dataItemId: '' },
      qSource: { groupId: '', dataItemId: '' },
      sampleCount: 256,
      bitWidth: 8,
      refreshIntervalMs: 2000,
      pointSize: 4,
    },
    refreshCadenceMs: 500,
    groups: [],
    // H014/S012:录制配置(默认不选帧,100MB 滚动留 5 个,与 DEFAULT_RECORDING_CONFIG 一致)。
    recording: { selectedFrameIds: [], maxFileSizeMb: 100, enableRotation: true, rotationCount: 5 },
  },
  projection: {
    table1Rows: [],
    table2Rows: [],
    scatter: { points: [], sampleCount: 0 },
  },
  availability: { available: false, reason: 'no-source' },
};

// --- Source material fixtures ---

export const sampleFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'g1', dataItemId: 'frame1:voltage', fieldName: 'Voltage', value: 3.3, displayValue: '3.3 V', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'g1', dataItemId: 'frame1:current', fieldName: 'Current', value: 1.5, displayValue: '1.5 A', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'g2', dataItemId: 'frame2:temperature', fieldName: 'Temperature', value: 25, displayValue: '25 °C', updatedAt: '2026-05-06T10:00:01Z' },
  { groupId: 'g2', dataItemId: 'frame2:pressure', fieldName: 'Pressure', value: 101.3, displayValue: '101.3 kPa', updatedAt: '2026-05-06T10:00:01Z' },
];

export const sampleIqFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'iq', dataItemId: 'iqFrame:iData', fieldName: 'I', value: 0.707, displayValue: '0.707', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'iq', dataItemId: 'iqFrame:qData', fieldName: 'Q', value: -0.707, displayValue: '-0.707', updatedAt: '2026-05-06T10:00:00Z' },
];

export const emptyFieldMaterial: DisplayFieldMaterial[] = [];

export const nonNumericFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'iq', dataItemId: 'iqFrame:iData', fieldName: 'I', value: 'not-a-number', displayValue: 'N/A', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'iq', dataItemId: 'iqFrame:qData', fieldName: 'Q', value: null, displayValue: 'N/A', updatedAt: '2026-05-06T10:00:00Z' },
];

// bytes 类型 I/Q 字段（value 是 hex 字符串，对接 receive field-parser 对 bytes 字段的输出）。
// "0102 0304" bitWidth=8 → [1,2,3,4]；用于测 projectScatter 按 bitWidth 切多点。
export const bytesIqFieldMaterial: DisplayFieldMaterial[] = [
  { groupId: 'iq', dataItemId: 'iqFrame:iData', fieldName: 'I', value: '01020304', displayValue: '01020304', updatedAt: '2026-05-06T10:00:00Z' },
  { groupId: 'iq', dataItemId: 'iqFrame:qData', fieldName: 'Q', value: '05060708', displayValue: '05060708', updatedAt: '2026-05-06T10:00:00Z' },
];

// --- Preference patches ---

export const updateTable1Patch: DisplayPreferencesPatch = {
  table1: { displayMode: 'chart', selectedGroupId: 'g1', selectedItems: ['frame1:voltage', 'frame1:current'] },
};

/** Patches chart-0's selectedItems via positional patch array. */
export const updateChart0Patch: DisplayPreferencesPatch = {
  charts: [{
    selectedItems: [
      { groupId: 'g1', frameId: 'frame1', fieldId: 'voltage' },
      { groupId: 'g1', frameId: 'frame1', fieldId: 'current' },
    ],
  }],
};

export const updateChart1Patch: ChartInstancePatch = {
  selectedItems: [
    { groupId: 'g1', frameId: 'frame1', fieldId: 'voltage' },
    { groupId: 'g1', frameId: 'frame1', fieldId: 'current' },
  ],
};

export const updateScatterPatch: DisplayPreferencesPatch = {
  scatter: { iSource: { groupId: 'iq', dataItemId: 'iqFrame:iData' }, qSource: { groupId: 'iq', dataItemId: 'iqFrame:qData' } },
};

// --- Invalid inputs ---

export const invalidPreferenceInput = {
  table1: { displayMode: 'invalid-mode', selectedItems: 42 },
  charts: [{ performance: { maxPoints: -1, refreshIntervalMs: 0 } }],
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
