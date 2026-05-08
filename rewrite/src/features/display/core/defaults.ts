import { DISPLAY_SCHEMA_VERSION, type DisplaySnapshot } from './types';
import { cloneDisplaySnapshot } from './clone';

const EMPTY_SCATTER_PROJECTION = { points: [], sampleCount: 0 } as const;

const DEFAULT_DISPLAY: DisplaySnapshot = {
  schemaVersion: DISPLAY_SCHEMA_VERSION,
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
    scatter: { ...EMPTY_SCATTER_PROJECTION },
  },
  availability: { available: false, reason: 'no-source' },
};

export function createDefaultDisplaySnapshot(): DisplaySnapshot {
  return cloneDisplaySnapshot(DEFAULT_DISPLAY);
}
