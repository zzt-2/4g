import { describe, expect, it } from 'vitest';
import * as displayPublicApi from '../index';
import {
  applyDisplayPreferencesPatch,
  cloneDisplaySnapshot,
  computeDisplayProjection,
  normalizeDisplayPreferencesInput,
  projectScatter,
  projectTableRows,
} from '../core';
import { createDisplayReader, createDisplayService } from '../services';
import { createDisplayState } from '../state';
import {
  defaultDisplayFixture,
  emptyFieldMaterial,
  invalidPreferenceInput,
  legacyLikeDisplayInput,
  nonNumericFieldMaterial,
  bytesIqFieldMaterial,
  sampleFieldMaterial,
  sampleIqFieldMaterial,
  updateChart1Patch,
  updateChart0Patch,
  updateScatterPatch,
  updateTable1Patch,
} from '../fixtures/display-fixtures';

type MutableRowForTest = { displayValue: string };

function mutableRowForTest(value: unknown): MutableRowForTest {
  return value as MutableRowForTest;
}

// --- Core projection tests ---

describe('display core projection', () => {
  it('projects table rows filtered by groupId and selectedItems', () => {
    const rows = projectTableRows(sampleFieldMaterial, 'g1', ['frame1:voltage']);
    expect(rows).toHaveLength(1);
    // R19 (v2): toRow no longer projects fieldName; UI resolves it via frameReader lookup.
    expect(rows[0].fieldName).toBeUndefined();
    expect(rows[0].value).toBe(3.3);
  });

  it('projects all fields for a group when selectedItems is empty', () => {
    const rows = projectTableRows(sampleFieldMaterial, 'g1', []);
    expect(rows).toHaveLength(2);
    // R19 (v2): fieldName not projected; assert dataItemId ordering instead.
    expect(rows.map((r) => r.dataItemId)).toEqual(['frame1:voltage', 'frame1:current']);
  });

  it('projects all fields when groupId is empty', () => {
    const rows = projectTableRows(sampleFieldMaterial, '', []);
    expect(rows).toHaveLength(4);
  });

  it('returns empty rows for empty fields', () => {
    const rows = projectTableRows(emptyFieldMaterial, 'g1', ['f1']);
    expect(rows).toHaveLength(0);
  });

  it('returns empty scatter when I/Q sources not matched', () => {
    const result = projectScatter(sampleFieldMaterial, {
      iSource: { groupId: 'missing', dataItemId: 'i' },
      qSource: { groupId: 'missing', dataItemId: 'q' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(0);
    expect(result.sampleCount).toBe(0);
  });

  it('projects scatter from matching I/Q numeric fields', () => {
    const result = projectScatter(sampleIqFieldMaterial, {
      iSource: { groupId: 'iq', dataItemId: 'iqFrame:iData' },
      qSource: { groupId: 'iq', dataItemId: 'iqFrame:qData' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(1);
    expect(result.points[0].i).toBeCloseTo(0.707);
    expect(result.points[0].q).toBeCloseTo(-0.707);
    expect(result.sampleCount).toBe(1);
  });

  it('returns empty scatter for non-numeric I/Q values', () => {
    const result = projectScatter(nonNumericFieldMaterial, {
      iSource: { groupId: 'iq', dataItemId: 'iqFrame:iData' },
      qSource: { groupId: 'iq', dataItemId: 'iqFrame:qData' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(0);
  });

  it('projects scatter multi-points from bytes hex fields by bitWidth', () => {
    // bytes I="01020304" / Q="05060708"，bitWidth=8 → 各切 4 个值，配对成 4 个点
    const result = projectScatter(bytesIqFieldMaterial, {
      iSource: { groupId: 'iq', dataItemId: 'iqFrame:iData' },
      qSource: { groupId: 'iq', dataItemId: 'iqFrame:qData' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(4);
    expect(result.sampleCount).toBe(4);
    expect(result.points[0]).toEqual({ i: 1, q: 5 });
    expect(result.points[3]).toEqual({ i: 4, q: 8 });
  });

  it('limits scatter points by sampleCount preference', () => {
    // 同样 4 个值，但 sampleCount=2 → 只画 2 个点
    const result = projectScatter(bytesIqFieldMaterial, {
      iSource: { groupId: 'iq', dataItemId: 'iqFrame:iData' },
      qSource: { groupId: 'iq', dataItemId: 'iqFrame:qData' },
      sampleCount: 2, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(2);
    expect(result.sampleCount).toBe(2);
  });

  it('returns empty scatter when bytes I/Q length mismatch produces no pairs', () => {
    // I 字段切出 4 值，Q 字段空 hex → 0 配对
    const mismatched: typeof bytesIqFieldMaterial = [
      { groupId: 'iq', dataItemId: 'iqFrame:iData', fieldName: 'I', value: '01020304', displayValue: '01020304' },
      { groupId: 'iq', dataItemId: 'iqFrame:qData', fieldName: 'Q', value: '', displayValue: '' },
    ];
    const result = projectScatter(mismatched, {
      iSource: { groupId: 'iq', dataItemId: 'iqFrame:iData' },
      qSource: { groupId: 'iq', dataItemId: 'iqFrame:qData' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(0);
  });

  it('computeDisplayProjection combines all projections', () => {
    const prefs = defaultDisplayFixture.preferences;
    const projection = computeDisplayProjection(sampleFieldMaterial, prefs);
    expect(projection.table1Rows).toHaveLength(4);
    expect(projection.table2Rows).toHaveLength(4);
    expect(projection.scatter.points).toHaveLength(0);
  });
});

// --- Core normalize tests ---

describe('display core normalize', () => {
  it('creates default snapshot when input is undefined', () => {
    const result = normalizeDisplayPreferencesInput(undefined);
    expect(result.valid).toBe(true);
    expect(result.snapshot).toEqual(defaultDisplayFixture);
  });

  it('normalizes partial preference input with defaults', () => {
    const result = normalizeDisplayPreferencesInput({
      table1: { displayMode: 'chart', selectedGroupId: 'g1' },
    });
    expect(result.valid).toBe(true);
    expect(result.snapshot.preferences.table1.displayMode).toBe('chart');
    expect(result.snapshot.preferences.table1.selectedGroupId).toBe('g1');
    expect(result.snapshot.preferences.table2).toEqual(defaultDisplayFixture.preferences.table2);
  });

  it('downgrades invalid values to defaults', () => {
    const result = normalizeDisplayPreferencesInput(invalidPreferenceInput);
    expect(result.snapshot.preferences.table1.displayMode).toBe('table');
    expect(result.snapshot.preferences.charts[0].performance.maxPoints).toBe(500);
    expect(result.snapshot.preferences.scatter.sampleCount).toBe(256);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'display.preference.displayModeInvalid',
        'display.preference.selectedItemsInvalid',
        'display.chart.maxPointsInvalid',
        'display.scatter.sampleCountInvalid',
        'display.refreshCadenceInvalid',
      ]),
    );
  });

  it('preserves valid legacy-like input and ignores unknown fields', () => {
    const result = normalizeDisplayPreferencesInput(legacyLikeDisplayInput);
    expect(result.valid).toBe(true);
    expect(result.snapshot.preferences.table1.selectedGroupId).toBe('group-a');
    expect(result.snapshot.preferences.table1.selectedItems).toEqual(['item1', 'item2']);
    expect(result.snapshot.preferences.table2.displayMode).toBe('special');
    expect(result.snapshot.preferences.refreshCadenceMs).toBe(300);
    expect(result.snapshot).not.toHaveProperty('chart-performance-config');
    expect(result.snapshot).not.toHaveProperty('historyAnalysis_chartSettings');
  });

  it('applies preference patches through normalize', () => {
    const result = applyDisplayPreferencesPatch(defaultDisplayFixture, updateTable1Patch);
    expect(result.snapshot.preferences.table1.displayMode).toBe('chart');
    expect(result.snapshot.preferences.table1.selectedGroupId).toBe('g1');
    expect(result.snapshot.preferences.table1.selectedItems).toEqual(['frame1:voltage', 'frame1:current']);
    expect(result.snapshot.preferences.table2).toEqual(defaultDisplayFixture.preferences.table2);
  });
});

// --- State isolation tests ---

describe('display state isolation', () => {
  it('returns snapshot copies instead of internal reference', () => {
    const state = createDisplayState();
    const snap1 = state.getSnapshot();
    mutableRowForTest(snap1.projection.table1Rows as unknown[]).displayValue = 'mutated';
    expect(state.getSnapshot().projection.table1Rows).toHaveLength(0);
  });

  it('stores replaced snapshot as independent copy', () => {
    const state = createDisplayState();
    const next = cloneDisplaySnapshot(defaultDisplayFixture);
    state.replaceSnapshot(next);
    (next as Record<string, unknown>).schemaVersion = 999 as never;
    expect(state.getSnapshot().schemaVersion).toBe(2);
  });
});

// --- Service tests ---

describe('display service', () => {
  it('updates preferences and recomputes projection', () => {
    const service = createDisplayService();
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });
    service.updatePreferences(updateTable1Patch);

    const rows = service.getTable1Rows();
    expect(rows).toHaveLength(2);
    // R19 (v2): service projection no longer carries fieldName; UI enriches via frameReader.
    expect(rows.map((r) => r.dataItemId)).toEqual(['frame1:voltage', 'frame1:current']);
  });

  it('ingests source material and produces projections', () => {
    const service = createDisplayService();
    service.updatePreferences(updateChart0Patch);
    const result = service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    expect(result.ok).toBe(true);
    expect(service.getSourceFields()).toHaveLength(4);
  });

  it('ingests scatter source material and projects I/Q', () => {
    const service = createDisplayService();
    service.updatePreferences(updateScatterPatch);
    service.ingestSourceMaterial({ fields: sampleIqFieldMaterial });

    const scatter = service.getScatterProjection();
    expect(scatter.points).toHaveLength(1);
    expect(scatter.points[0].i).toBeCloseTo(0.707);
  });

  it('clears projection without losing preferences', () => {
    const service = createDisplayService();
    service.updatePreferences(updateTable1Patch);
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    const result = service.clearProjection();
    expect(result.ok).toBe(true);
    expect(service.getTable1Rows()).toHaveLength(0);
    expect(service.getPreferences().table1.displayMode).toBe('chart');
  });

  it('resets to default state', () => {
    const service = createDisplayService();
    service.updatePreferences(updateTable1Patch);
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    const result = service.reset();
    expect(result.ok).toBe(true);
    expect(service.getSnapshot()).toEqual(defaultDisplayFixture);
  });

  it('accumulates source material across batches (upsert by dataItemId), not whole-buffer replace', () => {
    // 真实场景：一秒十几帧，每个 routing tick 只匹配一个帧（processReceiveBatch 一批一帧）。
    // buffer 必须按 dataItemId 累积，否则不同帧交替到达时表格内容会反复闪空（内容鬼畜）。
    const service = createDisplayService();
    // 第一批：只有 frame1 的字段
    service.ingestSourceMaterial({
      fields: [
        { groupId: 'g1', dataItemId: 'frame1:voltage', value: 3.3, displayValue: '3.3 V', updatedAt: 't1' },
        { groupId: 'g1', dataItemId: 'frame1:current', value: 1.5, displayValue: '1.5 A', updatedAt: 't1' },
      ],
    });
    // 第二批：只有 frame2 的字段（不含 frame1）
    service.ingestSourceMaterial({
      fields: [
        { groupId: 'g2', dataItemId: 'frame2:temperature', value: 25, displayValue: '25 C', updatedAt: 't2' },
      ],
    });
    // 累积语义：frame1 的字段应保留，frame2 的字段并入。覆盖语义下 frame1 会丢失。
    const sourceFields = service.getSourceFields();
    expect(sourceFields.map((f) => f.dataItemId).sort()).toEqual([
      'frame1:current',
      'frame1:voltage',
      'frame2:temperature',
    ]);
  });

  it('upsert updates existing field value in place (same dataItemId)', () => {
    const service = createDisplayService();
    service.ingestSourceMaterial({
      fields: [{ groupId: 'g1', dataItemId: 'frame1:voltage', value: 3.3, displayValue: '3.3 V', updatedAt: 't1' }],
    });
    service.ingestSourceMaterial({
      fields: [{ groupId: 'g1', dataItemId: 'frame1:voltage', value: 3.5, displayValue: '3.5 V', updatedAt: 't2' }],
    });
    const field = service.getSourceFields().find((f) => f.dataItemId === 'frame1:voltage');
    expect(field?.value).toBe(3.5);
    expect(service.getSourceFields()).toHaveLength(1);
  });

  it('handles empty source material gracefully', () => {
    const service = createDisplayService();
    const result = service.ingestSourceMaterial({ fields: emptyFieldMaterial });
    expect(result.ok).toBe(true);
    expect(service.getTable1Rows()).toHaveLength(0);
  });

  it('handles missing fields in material gracefully', () => {
    const service = createDisplayService();
    const result = service.ingestSourceMaterial({ availability: { available: true } });
    expect(result.ok).toBe(true);
    expect(service.getAvailability().available).toBe(true);
  });
});

// --- Multi-chart service tests ---

describe('display service multi-chart', () => {
  it('updateChartConfig updates a single chart', () => {
    const service = createDisplayService();
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    service.updateChartConfig('chart-1', updateChart1Patch);
    const chart = service.getPreferences().charts[0];
    expect(chart.selectedItems).toHaveLength(2);
  });

  it('updateChartConfig returns error for unknown chart', () => {
    const service = createDisplayService();
    const result = service.updateChartConfig('nonexistent', { selectedItems: [{ groupId: 'g1', frameId: 'f1', fieldId: 'a' }] });
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe('display.chart.notFound');
  });

  it('updateChartCount adds charts up to 4', () => {
    const service = createDisplayService();
    service.updateChartCount(3);
    const prefs = service.getPreferences();
    expect(prefs.charts).toHaveLength(3);
    expect(prefs.charts[1].id).toBe('chart-2');
    expect(prefs.charts[2].id).toBe('chart-3');
  });

  it('updateChartCount removes charts from the end', () => {
    const service = createDisplayService();
    service.updateChartCount(3);
    service.updateChartConfig('chart-1', updateChart1Patch);
    service.updateChartCount(1);
    const prefs = service.getPreferences();
    expect(prefs.charts).toHaveLength(1);
    expect(prefs.charts[0].id).toBe('chart-1');
    expect(prefs.charts[0].selectedItems).toEqual([
      { groupId: 'g1', frameId: 'frame1', fieldId: 'voltage' },
      { groupId: 'g1', frameId: 'frame1', fieldId: 'current' },
    ]);
  });

  it('updateChartCount clamps to 1-4', () => {
    const service = createDisplayService();
    service.updateChartCount(0);
    expect(service.getPreferences().charts).toHaveLength(1);
    service.updateChartCount(10);
    expect(service.getPreferences().charts).toHaveLength(4);
  });
});

// --- Selector and public API tests ---

describe('display selector and public api', () => {
  it('returns selector projections that cannot mutate backing state', () => {
    const service = createDisplayService();
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    const rows = service.getTable1Rows();
    if (rows.length > 0) {
      mutableRowForTest(rows).displayValue = 'mutated';
    }
    expect(service.getTable1Rows()[0]?.displayValue).toBe('3.3 V');
  });

  it('keeps reader read-only and root public api free of internal mutable state', () => {
    const reader = createDisplayReader(() => defaultDisplayFixture);

    expect(reader.getSnapshot()).toEqual(defaultDisplayFixture);
    expect(displayPublicApi).toHaveProperty('createDisplayReader');
    expect(displayPublicApi).toHaveProperty('createDisplayService');
    expect(displayPublicApi).toHaveProperty('selectTable1Rows');
    expect(displayPublicApi).toHaveProperty('selectScatterProjection');
    expect(displayPublicApi).not.toHaveProperty('createDisplayState');
    expect(displayPublicApi).not.toHaveProperty('normalizeDisplayPreferencesInput');
  });
});

// --- Multi-chart edge case tests ---

describe('display service multi-chart edge cases', () => {
  it('updateChartCount to 4 gives unique IDs and default settings', () => {
    const service = createDisplayService();
    service.updateChartCount(4);
    const prefs = service.getPreferences();
    expect(prefs.charts).toHaveLength(4);
    const ids = prefs.charts.map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
    prefs.charts.forEach((c, i) => {
      expect(c.id).toBe(`chart-${i + 1}`);
      expect(c.selectedItems).toEqual([]);
      expect(c.yAxis.autoScale).toBe(true);
    });
  });

  it('new charts do not inherit selectedItems from existing charts', () => {
    const service = createDisplayService();
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });
    service.updateChartConfig('chart-1', updateChart1Patch);
    service.updateChartCount(3);
    const prefs = service.getPreferences();
    // chart-1 keeps its selection
    expect(prefs.charts[0].selectedItems).toEqual([
      { groupId: 'g1', frameId: 'frame1', fieldId: 'voltage' },
      { groupId: 'g1', frameId: 'frame1', fieldId: 'current' },
    ]);
    // new charts start empty
    expect(prefs.charts[1].selectedItems).toEqual([]);
    expect(prefs.charts[2].selectedItems).toEqual([]);
  });

  it('updateChartConfig merges yAxis partially', () => {
    const service = createDisplayService();
    service.updateChartConfig('chart-1', { yAxis: { min: 0, max: 100 } });
    const chart = service.getPreferences().charts[0];
    expect(chart.yAxis.autoScale).toBe(true);
    expect(chart.yAxis.min).toBe(0);
    expect(chart.yAxis.max).toBe(100);
  });

  it('updateChartConfig updates title', () => {
    const service = createDisplayService();
    service.updateChartConfig('chart-1', { title: '自定义图表' });
    expect(service.getPreferences().charts[0].title).toBe('自定义图表');
  });

  it('updateChartCount with negative clamps to 1', () => {
    const service = createDisplayService();
    service.updateChartCount(-5);
    expect(service.getPreferences().charts).toHaveLength(1);
  });

  it('updatePreferences with empty charts normalizes to single chart', () => {
    const service = createDisplayService();
    service.updatePreferences({ charts: [] });
    expect(service.getPreferences().charts).toHaveLength(1);
    expect(service.getPreferences().charts[0].id).toBe('chart-1');
  });
});

// --- Normalize edge case tests ---

describe('display normalize edge cases', () => {
  it('normalizes >4 charts input by truncating with warning', () => {
    const fiveCharts = Array.from({ length: 5 }, (_, i) => ({
      id: `chart-${i + 1}`,
      selectedItems: [{ groupId: 'g1', frameId: `f${i + 1}`, fieldId: `field-${i + 1}` }],
    }));
    const result = normalizeDisplayPreferencesInput({
      charts: fiveCharts,
    });
    expect(result.snapshot.preferences.charts).toHaveLength(4);
    expect(result.issues.some((i) => i.code === 'display.chart.countExceeded')).toBe(true);
  });
});
