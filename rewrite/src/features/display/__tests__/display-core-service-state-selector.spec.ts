import { describe, expect, it } from 'vitest';
import * as displayPublicApi from '../index';
import {
  applyDisplayPreferencesPatch,
  cloneDisplaySnapshot,
  computeDisplayProjection,
  normalizeDisplayPreferencesInput,
  projectChartSeries,
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
    expect(rows[0].fieldName).toBe('Voltage');
    expect(rows[0].value).toBe(3.3);
  });

  it('projects all fields for a group when selectedItems is empty', () => {
    const rows = projectTableRows(sampleFieldMaterial, 'g1', []);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.fieldName)).toEqual(['Voltage', 'Current']);
  });

  it('projects all fields when groupId is empty', () => {
    const rows = projectTableRows(sampleFieldMaterial, '', []);
    expect(rows).toHaveLength(4);
  });

  it('returns empty rows for empty fields', () => {
    const rows = projectTableRows(emptyFieldMaterial, 'g1', ['f1']);
    expect(rows).toHaveLength(0);
  });

  it('returns empty chart series when no items selected', () => {
    const series = projectChartSeries(sampleFieldMaterial, []);
    expect(series).toHaveLength(0);
  });

  it('projects chart series with field name from matching fields', () => {
    const series = projectChartSeries(sampleFieldMaterial, ['g1:frame1:voltage']);
    expect(series).toHaveLength(1);
    expect(series[0].fieldName).toBe('Voltage');
    expect(series[0].points).toEqual([]);
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

  it('computeDisplayProjection combines all projections', () => {
    const prefs = defaultDisplayFixture.preferences;
    const projection = computeDisplayProjection(sampleFieldMaterial, prefs);
    expect(projection.table1Rows).toHaveLength(4);
    expect(projection.table2Rows).toHaveLength(4);
    expect(projection.charts).toHaveLength(1);
    expect(projection.charts[0].series).toHaveLength(0);
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
    expect(state.getSnapshot().schemaVersion).toBe(1);
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
    expect(rows.map((r) => r.fieldName)).toEqual(['Voltage', 'Current']);
  });

  it('ingests source material and produces projections', () => {
    const service = createDisplayService();
    service.updatePreferences(updateChart0Patch);
    const result = service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    expect(result.ok).toBe(true);
    const instances = service.getChartInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].series).toHaveLength(2);
    expect(instances[0].series[0].fieldName).toBe('Voltage');
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
    const instances = service.getChartInstances();
    expect(instances[0].series).toHaveLength(2);
    expect(instances[0].series.map((s) => s.fieldName)).toEqual(['Voltage', 'Current']);
  });

  it('updateChartConfig returns error for unknown chart', () => {
    const service = createDisplayService();
    const result = service.updateChartConfig('nonexistent', { selectedItems: ['a'] });
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
    expect(prefs.charts[0].selectedItems).toEqual(['g1:frame1:voltage', 'g1:frame1:current']);
  });

  it('updateChartCount clamps to 1-4', () => {
    const service = createDisplayService();
    service.updateChartCount(0);
    expect(service.getPreferences().charts).toHaveLength(1);
    service.updateChartCount(10);
    expect(service.getPreferences().charts).toHaveLength(4);
  });

  it('getChartSeries returns first chart series for backward compat', () => {
    const service = createDisplayService();
    service.ingestSourceMaterial({ fields: sampleFieldMaterial });
    service.updateChartConfig('chart-1', updateChart1Patch);
    const series = service.getChartSeries();
    expect(series).toHaveLength(2);
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
    expect(displayPublicApi).toHaveProperty('selectChartInstances');
    expect(displayPublicApi).toHaveProperty('selectChartSeries');
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
    expect(prefs.charts[0].selectedItems).toEqual(['g1:frame1:voltage', 'g1:frame1:current']);
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

  it('getChartInstances returns empty series when no data', () => {
    const service = createDisplayService();
    const instances = service.getChartInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].series).toEqual([]);
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
      selectedItems: [`g1:f${i + 1}`],
    }));
    const result = normalizeDisplayPreferencesInput({
      charts: fiveCharts,
    });
    expect(result.snapshot.preferences.charts).toHaveLength(4);
    expect(result.issues.some((i) => i.code === 'display.chart.countExceeded')).toBe(true);
  });
});
