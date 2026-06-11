/**
 * T024f: Display projection correctness.
 *
 * Verifies that the display service correctly projects ingested source
 * material into table rows, chart series, and scatter plots based on
 * preferences, and that projection selectors return independent copies.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createDisplayService,
  migrateDisplayPreferencesFromV1,
  validateChartSelectedItems,
  type ChartSelectionFrameLookup,
  type DisplayService,
} from '@/features/display';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a single DisplayFieldMaterial. */
function field(
  groupId: string,
  dataItemId: string,
  fieldName: string,
  value: unknown,
  displayValue: string,
) {
  return { groupId, dataItemId, fieldName, value, displayValue };
}

// ---------------------------------------------------------------------------
// T024f tests
// ---------------------------------------------------------------------------

describe('T024f: Display projection correctness', () => {
  let service: DisplayService;

  // Fresh service per test
  beforeEach(() => {
    service = createDisplayService();
  });

  it('table projection filters by selectedGroupId', () => {
    // Ingest fields from two groups
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
        field('frame-1', 'field-b', 'Field B', 100, '100'),
        field('frame-2', 'field-c', 'Field C', 7, '7'),
      ],
    });

    // Select frame-1 for table1
    service.updatePreferences({
      table1: { selectedGroupId: 'frame-1' },
    });

    const rows = service.getTable1Rows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.dataItemId).sort()).toEqual(['field-a', 'field-b']);
    expect(rows.every((r) => r.groupId === 'frame-1')).toBe(true);
  });

  it('table projection further filters by selectedItems', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
        field('frame-1', 'field-b', 'Field B', 100, '100'),
        field('frame-1', 'field-c', 'Field C', 7, '7'),
      ],
    });

    // Select frame-1 AND only field-a
    service.updatePreferences({
      table1: {
        selectedGroupId: 'frame-1',
        selectedItems: ['field-a'],
      },
    });

    const rows = service.getTable1Rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].dataItemId).toBe('field-a');
    expect(rows[0].value).toBe(42);
    expect(rows[0].displayValue).toBe('42');
  });

  it('chart projection returns series for selected items', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
        field('frame-1', 'field-b', 'Field B', 100, '100'),
      ],
    });

    // Select field-a for chart using structured ChartSelectedItem (groupId=frameId when ungrouped)
    service.updatePreferences({
      charts: [{ selectedItems: [{ groupId: 'frame-1', frameId: 'frame-1', fieldId: 'field-a' }] }],
    });

    // Chart series accumulation lives in useDisplayRefresh composable;
    // service stores preferences and provides source fields for the composable to consume.
    const chart = service.getPreferences().charts[0];
    expect(chart.selectedItems).toEqual([{ groupId: 'frame-1', frameId: 'frame-1', fieldId: 'field-a' }]);
    expect(service.getSourceFields()).toHaveLength(2);
  });

  it('scatter projection from I/Q sources', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'i-val', 'I Value', 10, '10'),
        field('frame-1', 'q-val', 'Q Value', 20, '20'),
      ],
    });

    // Configure scatter bindings
    service.updatePreferences({
      scatter: {
        iSource: { groupId: 'frame-1', dataItemId: 'i-val' },
        qSource: { groupId: 'frame-1', dataItemId: 'q-val' },
      },
    });

    const scatter = service.getScatterProjection();
    expect(scatter.sampleCount).toBe(1);
    expect(scatter.points).toHaveLength(1);
    expect(scatter.points[0].i).toBe(10);
    expect(scatter.points[0].q).toBe(20);
  });

  it('scatter projection returns empty when I/Q sources are missing', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
      ],
    });

    // Scatter bindings point to non-existent fields
    service.updatePreferences({
      scatter: {
        iSource: { groupId: 'frame-1', dataItemId: 'missing-i' },
        qSource: { groupId: 'frame-1', dataItemId: 'missing-q' },
      },
    });

    const scatter = service.getScatterProjection();
    expect(scatter.sampleCount).toBe(0);
    expect(scatter.points).toEqual([]);
  });

  it('projection selectors return independent copies', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
        field('frame-1', 'field-b', 'Field B', 100, '100'),
      ],
    });
    service.updatePreferences({
      table1: { selectedGroupId: 'frame-1' },
    });

    const first = service.getTable1Rows();
    expect(first).toHaveLength(2);

    // Mutate the returned array
    (first as Record<string, unknown>[]).push({
      groupId: 'MUTATED',
      dataItemId: 'MUTATED',
      fieldName: 'MUTATED',
      value: 'MUTATED',
      displayValue: 'MUTATED',
    });

    // Mutate a returned object
    (first[0] as Record<string, unknown>).__mutated__ = 'SENTINEL';

    // Get a fresh copy
    const second = service.getTable1Rows();
    expect(second).toHaveLength(2); // not 3
    expect((second[0] as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('clearProjection resets all projections but keeps preferences', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
      ],
    });
    service.updatePreferences({
      table1: { selectedGroupId: 'frame-1' },
    });

    // Verify projection is populated
    expect(service.getTable1Rows()).toHaveLength(1);

    // Clear projection
    const result = service.clearProjection();
    expect(result.ok).toBe(true);

    // Projections are empty
    expect(service.getTable1Rows()).toHaveLength(0);
    expect(service.getTable2Rows()).toHaveLength(0);
    expect(service.getSourceFields()).toHaveLength(0);
    expect(service.getScatterProjection().points).toHaveLength(0);

    // Preferences survived
    const prefs = service.getPreferences();
    expect(prefs.table1.selectedGroupId).toBe('frame-1');
  });

  it('multi-chart instances project independently', () => {
    service.ingestSourceMaterial({
      fields: [
        field('frame-1', 'field-a', 'Field A', 42, '42'),
        field('frame-1', 'field-b', 'Field B', 100, '100'),
        field('frame-2', 'field-c', 'Field C', 7, '7'),
      ],
    });

    service.updateChartCount(2);
    service.updateChartConfig('chart-1', { selectedItems: [{ groupId: 'frame-1', frameId: 'frame-1', fieldId: 'field-a' }] });
    service.updateChartConfig('chart-2', { selectedItems: [
      { groupId: 'frame-1', frameId: 'frame-1', fieldId: 'field-b' },
      { groupId: 'frame-2', frameId: 'frame-2', fieldId: 'field-c' },
    ] });

    const charts = service.getPreferences().charts;
    expect(charts).toHaveLength(2);
    expect(charts[0].id).toBe('chart-1');
    expect(charts[0].selectedItems).toEqual([{ groupId: 'frame-1', frameId: 'frame-1', fieldId: 'field-a' }]);
    expect(charts[1].id).toBe('chart-2');
    expect(charts[1].selectedItems).toEqual([
      { groupId: 'frame-1', frameId: 'frame-1', fieldId: 'field-b' },
      { groupId: 'frame-2', frameId: 'frame-2', fieldId: 'field-c' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// v2 acceptance scenarios (design 5.6 + 5.10)
// ---------------------------------------------------------------------------

describe('v2 acceptance scenarios', () => {
  function createFieldLookup(known: ReadonlyMap<string, ReadonlyArray<string>>): ChartSelectionFrameLookup {
    return {
      listFieldReferences(query: { readonly frameId: string }): ReadonlyArray<{ readonly fieldId: string }> {
        const fields = known.get(query.frameId) ?? [];
        return fields.map((fieldId) => ({ fieldId }));
      },
    };
  }

  it('scenario 1: chart empty state on cold start (selectedItems empty)', () => {
    const service = createDisplayService();
    const prefs = service.getPreferences();
    expect(prefs.charts[0].selectedItems).toEqual([]);
  });

  it('scenario 2: no data flow keeps chart selection intact after validate', () => {
    const service = createDisplayService();
    service.updateChartConfig('chart-1', {
      selectedItems: [{ groupId: 'f1', frameId: 'f1', fieldId: 'voltage' }],
    });
    // lookup reports the field exists in frame definition; selection must be retained
    const lookup = createFieldLookup(new Map([['f1', ['voltage']]]));
    const validated = validateChartSelectedItems(service.getPreferences(), lookup);
    expect(validated.charts[0].selectedItems).toEqual([
      { groupId: 'f1', frameId: 'f1', fieldId: 'voltage' },
    ]);
  });

  it('scenario 3: v1 persistence migration (3-segment string)', () => {
    const patch = migrateDisplayPreferencesFromV1({
      schemaVersion: 1,
      charts: [{ selectedItems: ['g1:f1:voltage', 'g1:f1:current'] }],
    });
    expect(patch.charts).toBeDefined();
    expect(patch.charts![0].selectedItems).toEqual([
      { groupId: 'g1', frameId: 'f1', fieldId: 'voltage' },
      { groupId: 'g1', frameId: 'f1', fieldId: 'current' },
    ]);
  });

  it('scenario 4: v1 persistence migration (2-segment string falls back groupId=frameId)', () => {
    const patch = migrateDisplayPreferencesFromV1({
      schemaVersion: 1,
      charts: [{ selectedItems: ['f1:voltage', 'f1:current'] }],
    });
    expect(patch.charts).toBeDefined();
    expect(patch.charts![0].selectedItems).toEqual([
      { groupId: 'f1', frameId: 'f1', fieldId: 'voltage' },
      { groupId: 'f1', frameId: 'f1', fieldId: 'current' },
    ]);
  });

  it('scenario 5: migration drops malformed entries and preserves valid ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const patch = migrateDisplayPreferencesFromV1({
        schemaVersion: 1,
        charts: [{
          selectedItems: ['g1:f1:voltage', 'foo', 'a:b:c:d', 'g1:f1:current'],
        }],
      });
      expect(patch.charts).toBeDefined();
      expect(patch.charts![0].selectedItems).toEqual([
        { groupId: 'g1', frameId: 'f1', fieldId: 'voltage' },
        { groupId: 'g1', frameId: 'f1', fieldId: 'current' },
      ]);
      // Malformed entries warned twice (single-segment 'foo' and 4-segment 'a:b:c:d')
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('scenario 6: fieldName resolution no longer drops fieldId (validate keeps known fieldId)', () => {
    const service = createDisplayService();
    service.updateChartConfig('chart-1', {
      selectedItems: [{ groupId: 'f1', frameId: 'f1', fieldId: 'voltage' }],
    });
    const lookup = createFieldLookup(new Map([['f1', ['voltage', 'current']]]));
    const validated = validateChartSelectedItems(service.getPreferences(), lookup);
    expect(validated.charts[0].selectedItems).toEqual([
      { groupId: 'f1', frameId: 'f1', fieldId: 'voltage' },
    ]);
  });

  it('scenario 7: frame definition hot-reload invalidates selectedItems', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const service = createDisplayService();
      service.updateChartConfig('chart-1', {
        selectedItems: [
          { groupId: 'f1', frameId: 'f1', fieldId: 'voltage' },
          { groupId: 'f1', frameId: 'f1', fieldId: 'deleted-field' },
        ],
      });
      // lookup only knows 'voltage', 'deleted-field' should be dropped
      const lookup = createFieldLookup(new Map([['f1', ['voltage']]]));
      const validated = validateChartSelectedItems(service.getPreferences(), lookup);
      expect(validated.charts[0].selectedItems).toEqual([
        { groupId: 'f1', frameId: 'f1', fieldId: 'voltage' },
      ]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('scenario 8: deleted group falls back groupId=frameId', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const service = createDisplayService();
      // prefs.groups is empty (no group 'g1'); selectedItems references stale groupId='g1'
      service.updateChartConfig('chart-1', {
        selectedItems: [{ groupId: 'g1', frameId: 'f1', fieldId: 'voltage' }],
      });
      const lookup = createFieldLookup(new Map([['f1', ['voltage']]]));
      const validated = validateChartSelectedItems(service.getPreferences(), lookup);
      // groupId fell back to frameId='f1'
      expect(validated.charts[0].selectedItems).toEqual([
        { groupId: 'f1', frameId: 'f1', fieldId: 'voltage' },
      ]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
