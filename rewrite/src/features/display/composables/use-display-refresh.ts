import { onUnmounted, readonly, shallowRef, type Ref } from 'vue';
import type {
  ChartSeriesProjection,
  DisplayService,
  ScatterProjection,
  TableRowProjection,
  DisplaySourceAvailability,
  DisplayPreferences,
} from '../core';

export interface DisplayRefreshState {
  readonly table1Rows: Readonly<Ref<TableRowProjection[]>>;
  readonly table2Rows: Readonly<Ref<TableRowProjection[]>>;
  readonly chartSeries: Readonly<Ref<ChartSeriesProjection[]>>;
  readonly scatter: Readonly<Ref<ScatterProjection>>;
  readonly availability: Readonly<Ref<DisplaySourceAvailability>>;
  readonly preferences: Readonly<Ref<DisplayPreferences>>;
}

export function useDisplayRefresh(
  service: DisplayService,
  cadenceMs = 200,
): DisplayRefreshState & { start: () => void; stop: () => void } {
  const table1Rows = shallowRef<TableRowProjection[]>([]);
  const table2Rows = shallowRef<TableRowProjection[]>([]);
  const chartSeries = shallowRef<ChartSeriesProjection[]>([]);
  const scatter = shallowRef<ScatterProjection>({ points: [], sampleCount: 0 });
  const availability = shallowRef<DisplaySourceAvailability>({ available: false });
  const preferences = shallowRef<DisplayPreferences>(service.getPreferences());

  let rafId = 0;
  let lastTime = 0;
  let disposed = false;

  function refresh(): void {
    table1Rows.value = service.getTable1Rows();
    table2Rows.value = service.getTable2Rows();
    chartSeries.value = service.getChartSeries();
    scatter.value = service.getScatterProjection();
    availability.value = service.getAvailability();
    preferences.value = service.getPreferences();
  }

  function tick(now: number): void {
    if (disposed) return;
    if (now - lastTime >= cadenceMs) {
      refresh();
      lastTime = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  function start(): void {
    if (disposed) return;
    stop();
    lastTime = performance.now();
    refresh();
    rafId = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  onUnmounted(() => {
    disposed = true;
    stop();
  });

  return {
    table1Rows: readonly(table1Rows),
    table2Rows: readonly(table2Rows),
    chartSeries: readonly(chartSeries),
    scatter: readonly(scatter),
    availability: readonly(availability),
    preferences: readonly(preferences),
    start,
    stop,
  };
}
