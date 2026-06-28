import { computed, ref, shallowRef, type Ref } from 'vue';
import type {
  ChartInstanceProjection,
  ChartSeriesProjection,
  ChartPoint,
  DisplayService,
} from '@/features/display';
import type { RecordingService } from '@/features/recording';
import {
  parseRecordingFileBytes,
  parseRecordingToFieldSeries,
  type FrameFieldSeries,
  type FieldTimePoint,
} from '@/features/recording';

// History 数据 composable。数据源是录制 .bin(原始帧字节),不再读旧 StorageLocalRecord。
// 内部模型换新:帧×字段×时间点(spec §5.2)。旧 StorageLocalRecord 格式废弃,不向后兼容。

// --- Hierarchy types ---

export interface DataItemInfo {
  readonly fieldId: string;
  readonly key: string;
  readonly dataType: 'numeric' | 'other';
}

export interface DataItemGroup {
  readonly groupId: string;
  readonly label: string;
  readonly items: readonly DataItemInfo[];
}

// --- Statistics types ---

export interface SeriesStatistics {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly mean: number;
  readonly rmse: number;
  readonly count: number;
}

export interface ChartStatistics {
  readonly chartId: string;
  readonly series: readonly SeriesStatistics[];
}

// --- Time range ---

export interface TimeRange {
  readonly start: Date;
  readonly end: Date;
}

export function getDefaultTimeRange(): TimeRange {
  const end = new Date();
  const start = new Date(end.getTime() - 3600_000);
  return { start, end };
}

// --- Internal model (帧×字段×时间点,spec §5.2) ---
// 加载后所有文件的字段时间序列,按 frameId 聚合。frameName/fieldName 从录制时内嵌的
// 帧定义拿(R19:静态元数据不从运行时数据流解析,不泄漏 raw frameId/UUID)。

interface LoadedFrameSeries {
  readonly frameId: string;
  readonly frameName: string;
  readonly fields: ReadonlyMap<string, { readonly fieldName: string; readonly points: readonly FieldTimePoint[] }>;
}

/** 复合 fieldId:History 页 hierarchy/charts 用 `${frameId}:${fieldId}` 作为选择 key
 *  (内部计算用;ChartSelectedItem 结构化对象经 compositeFieldId 反查)。 */
function compositeFieldId(frameId: string, fieldId: string): string {
  return `${frameId}:${fieldId}`;
}

// 合并多个文件的 FrameFieldSeries → LoadedFrameSeries[]。
// 同一 frameId+fieldId 的时间点合并(跨文件)。
function mergeSeries(all: readonly FrameFieldSeries[]): LoadedFrameSeries[] {
  const byFrame = new Map<string, LoadedFrameSeries>();
  for (const s of all) {
    const existing = byFrame.get(s.frameId);
    if (!existing) {
      const fieldMap = new Map<string, { fieldName: string; points: FieldTimePoint[] }>();
      for (const f of s.fields) {
        fieldMap.set(f.fieldId, { fieldName: f.fieldName, points: [...f.points] });
      }
      byFrame.set(s.frameId, { frameId: s.frameId, frameName: s.frameName, fields: fieldMap });
      continue;
    }
    // 合并字段时间点
    for (const f of s.fields) {
      const ef = existing.fields.get(f.fieldId);
      if (!ef) {
        (existing.fields as Map<string, { fieldName: string; points: FieldTimePoint[] }>).set(f.fieldId, {
          fieldName: f.fieldName,
          points: [...f.points],
        });
      } else {
        (ef.points as FieldTimePoint[]).push(...f.points);
      }
    }
  }
  return Array.from(byFrame.values());
}

// 从 loadedSeries 构建 hierarchy:按帧分组 → 每帧下是字段。
// label 用 frameName(R19:不泄漏 raw frameId/UUID)。
function buildHierarchyFromSeries(series: readonly LoadedFrameSeries[]): DataItemGroup[] {
  return series
    .map((s) => ({
      groupId: s.frameId,
      label: s.frameName || s.frameId, // R19:优先用帧名,无则降级(测试数据场景)
      items: Array.from(s.fields.entries()).map(([fieldId, v]) => ({
        fieldId: compositeFieldId(s.frameId, fieldId),
        key: v.fieldName || fieldId, // R19:用字段名做显示 key
        dataType: 'numeric' as const,
      })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// --- Statistics computation ---

export function computeSeriesStats(points: readonly ChartPoint[]): { mean: number; rmse: number } {
  if (points.length === 0) return { mean: 0, rmse: 0 };

  const values = points.map((p) => p.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const mse = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, rmse: Math.sqrt(mse) };
}

// --- Composable ---

export interface HistoryDataState {
  readonly itemHierarchy: Readonly<Ref<readonly DataItemGroup[]>>;
  readonly enrichedCharts: Readonly<Ref<readonly ChartInstanceProjection[]>>;
  readonly chartStats: Readonly<Ref<readonly ChartStatistics[]>>;
  readonly recordCount: Readonly<Ref<number>>;
  readonly timeRange: Ref<TimeRange>;
  readonly selectedGlobalItems: Ref<Set<string>>;
  readonly loading: Readonly<Ref<boolean>>;
}

export function useHistoryData(
  recordingService: RecordingService,
  displayService: DisplayService,
): HistoryDataState & {
  loadData(): Promise<void>;
  refreshCharts(): void;
} {
  // ===== Business data =====
  const loadedSeries = shallowRef<LoadedFrameSeries[]>([]);
  const itemHierarchy = shallowRef<DataItemGroup[]>([]);
  const enrichedCharts = shallowRef<ChartInstanceProjection[]>([]);
  const chartStats = shallowRef<ChartStatistics[]>([]);

  // ===== Query/Filter =====
  const timeRange = ref<TimeRange>(getDefaultTimeRange());
  const selectedGlobalItems = ref<Set<string>>(new Set());

  // ===== UI state =====
  const loading = ref(false);

  // ===== Derived =====
  const recordCount = computed(() =>
    loadedSeries.value.reduce(
      (sum, s) => sum + Array.from(s.fields.values()).reduce((n, f) => n + f.points.length, 0),
      0,
    ),
  );

  function refreshCharts(): void {
    const prefs = displayService.getPreferences();
    const series = loadedSeries.value;

    // 构建快速查找:`frameId:fieldId` → 时间点(只保留 number 值,图表只画数字)。
    // ChartSelectedItem 是结构化 {frameId, fieldId},经 compositeFieldId 反查。
    const lookup = new Map<string, { fieldName: string; points: ChartPoint[] }>();
    for (const frame of series) {
      for (const [fieldId, f] of frame.fields) {
        const numericPoints: ChartPoint[] = [];
        for (const p of f.points) {
          if (typeof p.value === 'number') {
            // capturedAt 是 epoch 秒,转 ISO 字符串(ChartPoint.timestamp 是 string)
            numericPoints.push({ timestamp: new Date(p.capturedAt * 1000).toISOString(), value: p.value });
          }
        }
        if (numericPoints.length > 0) {
          lookup.set(compositeFieldId(frame.frameId, fieldId), { fieldName: f.fieldName, points: numericPoints });
        }
      }
    }

    const charts: ChartInstanceProjection[] = prefs.charts.map((chart) => ({
      id: chart.id,
      series: chart.selectedItems
        .map((item) => {
          const key = compositeFieldId(item.frameId, item.fieldId);
          const found = lookup.get(key);
          if (!found) return null;
          return { fieldId: key, fieldName: found.fieldName, points: found.points };
        })
        .filter((s): s is ChartSeriesProjection => s !== null),
    }));
    enrichedCharts.value = charts;

    chartStats.value = charts.map((chart) => ({
      chartId: chart.id,
      series: chart.series.map((s) => {
        const { mean, rmse } = computeSeriesStats(s.points);
        return { fieldId: s.fieldId, fieldName: s.fieldName, mean, rmse, count: s.points.length };
      }),
    }));
  }

  async function loadData(): Promise<void> {
    loading.value = true;
    try {
      // 列 recordings/ 目录下所有 .bin,按时间范围筛选(用 mtimeMs 近似;
      // 单 session 文件 mtime 接近录制时间,够用)。
      const fileList = await recordingService.listRecordingFiles();
      const fromMs = timeRange.value.start.getTime();
      const toMs = timeRange.value.end.getTime();
      const inRange = fileList.filter((f) => f.mtimeMs >= fromMs && f.mtimeMs <= toMs);

      if (inRange.length === 0) {
        loadedSeries.value = [];
        itemHierarchy.value = [];
        refreshCharts();
        return;
      }

      // 逐文件读 + 解析。老格式/坏文件 catch 跳过(spec §3.4,不崩)。
      const allSeries: FrameFieldSeries[] = [];
      for (const f of inRange) {
        const result = await recordingService.readRecordingFile(f.filePath);
        if (!result.ok || result.bytes.length === 0) continue;
        try {
          const content = parseRecordingFileBytes(new Uint8Array(result.bytes));
          // 默认加载所有帧(用户在 hierarchy 里再选具体字段;charts 按 prefs.selectedItems 过滤)
          const frameIds = [...content.frameDefs.keys()];
          const series = parseRecordingToFieldSeries(content, frameIds);
          allSeries.push(...series);
        } catch (err) {
          // 老格式(无帧定义块)或解析失败 → 跳过该文件,继续处理其余
          console.warn('[useHistoryData] skipping recording file (old format or parse error):', f.fileName, err);
        }
      }

      loadedSeries.value = mergeSeries(allSeries);
      itemHierarchy.value = buildHierarchyFromSeries(loadedSeries.value);
      refreshCharts();
    } catch (err) {
      console.error('[useHistoryData] loadData error:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    itemHierarchy,
    enrichedCharts,
    chartStats,
    recordCount,
    timeRange,
    selectedGlobalItems,
    loading,
    loadData,
    refreshCharts,
  };
}
