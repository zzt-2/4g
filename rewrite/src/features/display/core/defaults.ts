import { DISPLAY_SCHEMA_VERSION, type ChartInstancePreference, type DisplaySnapshot } from './types';
import { cloneDisplaySnapshot } from './clone';

const EMPTY_SCATTER_PROJECTION = { points: [], sampleCount: 0 } as const;

export const DEFAULT_CHART_INSTANCE: Readonly<ChartInstancePreference> = {
  id: '',
  title: '',
  selectedItems: [],
  yAxis: { autoScale: true, min: undefined, max: undefined },
  performance: { maxPoints: 500, refreshIntervalMs: 200 },
} as const;

const DEFAULT_DISPLAY: DisplaySnapshot = {
  schemaVersion: DISPLAY_SCHEMA_VERSION,
  preferences: {
    table1: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
    table2: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
    charts: [
      { ...DEFAULT_CHART_INSTANCE, id: 'chart-1', title: '图表1' },
    ],
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
    charts: [{ id: 'chart-1', series: [] }],
    scatter: { ...EMPTY_SCATTER_PROJECTION },
  },
  availability: { available: false, reason: 'no-source' },
};

export function createDefaultDisplaySnapshot(): DisplaySnapshot {
  return cloneDisplaySnapshot(DEFAULT_DISPLAY);
}
