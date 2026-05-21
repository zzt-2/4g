/**
 * T024f: Display projection correctness.
 *
 * Verifies that the display service correctly projects ingested source
 * material into table rows, chart series, and scatter plots based on
 * preferences, and that projection selectors return independent copies.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDisplayService,
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

    // Select field-a for chart (fieldId format is groupId:dataItemId)
    service.updatePreferences({
      chart: { selectedItems: ['frame-1:field-a'] },
    });

    const series = service.getChartSeries();
    expect(series).toHaveLength(1);
    expect(series[0].fieldId).toBe('frame-1:field-a');
    expect(series[0].fieldName).toBe('Field A');
    // Chart history buffer is never written to by ingestSourceMaterial,
    // so points will be empty. This verifies the series still appears.
    expect(series[0].points).toEqual([]);
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
    expect(service.getChartSeries()).toHaveLength(0);
    expect(service.getScatterProjection().points).toHaveLength(0);

    // Preferences survived
    const prefs = service.getPreferences();
    expect(prefs.table1.selectedGroupId).toBe('frame-1');
  });
});
