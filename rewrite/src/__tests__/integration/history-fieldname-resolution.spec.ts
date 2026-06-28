/**
 * v2 acceptance scenario 10 (design 5.6): history sync fix.
 *
 * useHistoryData must resolve fieldName via frameReader (not string-split fieldId),
 * and fall back to '[Unknown Field]' when the field is missing from frameReader —
 * aligned with display composable behavior (R19 / V5: never leak raw fieldId/UUID).
 */
import { describe, it, expect, vi } from 'vitest';
import { useHistoryData } from '@/pages/history/useHistoryData';
import type {
  ChartSelectionFrameLookup,
  DisplayService,
} from '@/features/display';
import type {
  StorageLocalRecord,
  StorageLocalService,
  StorageHourSummary,
  StorageValidationResult,
} from '@/features/storage-local-baseline';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeStorageInput {
  records?: StorageLocalRecord[];
  hours?: StorageHourSummary[];
}

function createFakeStorage(input: FakeStorageInput = {}): StorageLocalService {
  const records = input.records ?? [];
  const hours = input.hours ?? [];
  return {
    listLocalRecords: () => records,
    listHistoryHours: () => hours,
    loadHistoryMaterials: async () =>
      ({ ok: true, snapshot: { materials: [] }, validation: { valid: true, issues: [] } } as unknown as StorageValidationResult),
    appendLocalRecords: () => {},
  } as unknown as StorageLocalService;
}

function createFakeDisplay(selectedItems: readonly { groupId: string; frameId: string; fieldId: string }[]): DisplayService {
  const base = {
    getPreferences: () => ({
      charts: [{ id: 'chart-1', title: 'Chart 1', selectedItems, yAxis: { autoScale: true }, performance: { maxPoints: 100, refreshIntervalMs: 200 } }],
    }),
  };
  return base as unknown as DisplayService;
}

function createFieldLookup(
  known: ReadonlyMap<string, ReadonlyArray<{ fieldId: string; fieldName: string }>>,
): ChartSelectionFrameLookup {
  return {
    listFieldReferences(query: { readonly frameId: string }) {
      const fields = known.get(query.frameId) ?? [];
      return fields.map((f) => ({ fieldId: f.fieldId, fieldName: f.fieldName }));
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('v2 acceptance scenario 10: history fieldName resolution', () => {
  it('resolves fieldName via frameReader (no string-split fallback)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Recording captured with key `${groupId}:${frameId}:${fieldId}:${fieldName}`.
      // history must look up fieldName via frameReader rather than re-deriving from fieldId.
      const records: StorageLocalRecord[] = [
        {
          id: 'rec-1',
          capturedAt: '2026-06-12T10:00:00.000Z',
          source: 'local',
          channel: 'display',
          fields: [
            // key uses fieldName='Voltage' (resolved via frameReader), not raw fieldId='voltage'
            { key: 'g1:f1:voltage:Voltage', value: 42 },
          ],
        },
      ];
      const storage = createFakeStorage({ records });
      const display = createFakeDisplay([
        { groupId: 'g1', frameId: 'f1', fieldId: 'voltage' },
      ]);
      const frameReader = createFieldLookup(
        new Map([['f1', [{ fieldId: 'voltage', fieldName: 'Voltage' }]]]),
      );

      const history = useHistoryData(storage, display, frameReader);
      history.refreshCharts();

      const series = history.enrichedCharts.value[0].series;
      expect(series).toHaveLength(1);
      expect(series[0].fieldName).toBe('Voltage');
      expect(series[0].points).toHaveLength(1);
      expect(series[0].points[0].value).toBe(42);
      // No resolution warnings when the field exists in frameReader
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('falls back to [Unknown Field] when frameReader has no matching field', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const records: StorageLocalRecord[] = [
        {
          id: 'rec-2',
          capturedAt: '2026-06-12T10:00:00.000Z',
          source: 'local',
          channel: 'display',
          fields: [],
        },
      ];
      const storage = createFakeStorage({ records });
      const display = createFakeDisplay([
        { groupId: 'g1', frameId: 'f1', fieldId: 'ghost' },
      ]);
      // frameReader has no entry for frameId='f1' → must degrade to placeholder
      const frameReader = createFieldLookup(new Map());

      const history = useHistoryData(storage, display, frameReader);
      history.refreshCharts();

      const series = history.enrichedCharts.value[0].series;
      expect(series).toHaveLength(1);
      // V5: never leak raw fieldId/UUID to the UI; align with display composable
      expect(series[0].fieldName).toBe('[Unknown Field]');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
