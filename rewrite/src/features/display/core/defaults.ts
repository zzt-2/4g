import { DISPLAY_SCHEMA_VERSION, type ChartInstancePreference, type DisplaySnapshot } from './types';
import { cloneDisplaySnapshot } from './clone';
import { DEFAULT_RECORDING_CONFIG } from '@/features/recording/core/defaults';

const EMPTY_SCATTER_PROJECTION = { points: [], sampleCount: 0 } as const;

export const DEFAULT_CHART_INSTANCE: Readonly<ChartInstancePreference> = {
  id: '',
  title: '',
  selectedItems: [],
  yAxis: { autoScale: true, min: undefined, max: undefined },
  // S010: refreshIntervalMs 默认 ≥2000ms（用户要求默认间隔至少 2 秒）。
  performance: { maxPoints: 500, refreshIntervalMs: 2000 },
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
      // S010: 星座图独立刷新节奏，默认 ≥2000ms；pointSize 散点直径默认 4（原写死 6 偏大）。
      refreshIntervalMs: 2000,
      pointSize: 4,
    },
    refreshCadenceMs: 500,
    groups: [],
    // H014/S012:录制配置扩展进 DisplayPreferences,默认不选帧(用户必须选才录)。
    recording: { ...DEFAULT_RECORDING_CONFIG, selectedFrameIds: [] },
  },
  projection: {
    table1Rows: [],
    table2Rows: [],
    scatter: { ...EMPTY_SCATTER_PROJECTION },
  },
  availability: { available: false, reason: 'no-source' },
};

export function createDefaultDisplaySnapshot(): DisplaySnapshot {
  return cloneDisplaySnapshot(DEFAULT_DISPLAY);
}
