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
  type ChartPoint,
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
    const rows = projectTableRows(sampleFieldMaterial, 'g1', ['f1']);
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
    const history = new Map<string, ChartPoint[]>();
    const series = projectChartSeries(sampleFieldMaterial, { selectedItems: [], performance: { maxPoints: 500, refreshIntervalMs: 200 } }, history);
    expect(series).toHaveLength(0);
  });

  it('projects chart series with field name from matching fields', () => {
    const history = new Map<string, ChartPoint[]>([
      ['g1:f1', [{ timestamp: '2026-05-06T10:00:00Z', value: 3.3 }]],
    ]);
    const series = projectChartSeries(
      sampleFieldMaterial,
      { selectedItems: ['g1:f1'], performance: { maxPoints: 500, refreshIntervalMs: 200 } },
      history,
    );
    expect(series).toHaveLength(1);
    expect(series[0].fieldName).toBe('Voltage');
    expect(series[0].points).toHaveLength(1);
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
      iSource: { groupId: 'iq', dataItemId: 'iData' },
      qSource: { groupId: 'iq', dataItemId: 'qData' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(1);
    expect(result.points[0].i).toBeCloseTo(0.707);
    expect(result.points[0].q).toBeCloseTo(-0.707);
    expect(result.sampleCount).toBe(1);
  });

  it('returns empty scatter for non-numeric I/Q values', () => {
    const result = projectScatter(nonNumericFieldMaterial, {
      iSource: { groupId: 'iq', dataItemId: 'iData' },
      qSource: { groupId: 'iq', dataItemId: 'qData' },
      sampleCount: 256, bitWidth: 8, refreshIntervalMs: 100,
    });
    expect(result.points).toHaveLength(0);
  });

  it('computeDisplayProjection combines all projections', () => {
    const prefs = defaultDisplayFixture.preferences;
    const history = new Map<string, ChartPoint[]>();
    const projection = computeDisplayProjection(sampleFieldMaterial, prefs, history);
    expect(projection.table1Rows).toHaveLength(4);
    expect(projection.table2Rows).toHaveLength(4);
    expect(projection.chartSeries).toHaveLength(0);
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
    expect(result.snapshot.preferences.chart.performance.maxPoints).toBe(500);
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
    expect(result.snapshot.preferences.table1.selectedItems).toEqual(['f1', 'f2']);
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
    service.updatePreferences({ chart: { selectedItems: ['g1:f1'] } });
    const result = service.ingestSourceMaterial({ fields: sampleFieldMaterial });

    expect(result.ok).toBe(true);
    const series = service.getChartSeries();
    expect(series).toHaveLength(1);
    expect(series[0].fieldName).toBe('Voltage');
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
    expect(displayPublicApi).toHaveProperty('selectChartSeries');
    expect(displayPublicApi).toHaveProperty('selectScatterProjection');
    expect(displayPublicApi).not.toHaveProperty('createDisplayState');
    expect(displayPublicApi).not.toHaveProperty('normalizeDisplayPreferencesInput');
  });
});
