/**
 * useDisplayRefresh composable — getTable{1,2}Rows enrichment (design 5.5).
 *
 * Validates that:
 * - fieldName is resolved via frameReader even when service sourceFields are present
 *   (i.e. table rows do NOT trust material.fieldName).
 * - frameReader miss degrades to '[Unknown Field]' (V5: never leak fieldId/UUID).
 * - getTable1Rows() returns a deep copy; mutating it does not affect subsequent reads.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effectScope } from 'vue';

// useDisplayRefresh calls onUnmounted internally; we are not inside a component setup,
// so stub the lifecycle hook to a no-op (other Vue APIs pass through unchanged).
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return { ...actual, onUnmounted: () => {} };
});

import { useDisplayRefresh, clampCadence, computeChartCadence } from '../use-display-refresh';
import type {
  ChartSelectionFrameLookup,
  DisplayService,
  TableRowProjection,
} from '../../core';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function createFakeDisplay(table1: readonly TableRowProjection[], table2: readonly TableRowProjection[] = []): DisplayService {
  return {
    getPreferences: () => ({
      schemaVersion: 2 as const,
      table1: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
      table2: { displayMode: 'table', selectedGroupId: '', selectedItems: [] },
      charts: [{ id: 'chart-1', title: 'Chart 1', selectedItems: [], yAxis: { autoScale: true }, performance: { maxPoints: 100, refreshIntervalMs: 200 } }],
      scatter: {
        iSource: { groupId: '', dataItemId: '' },
        qSource: { groupId: '', dataItemId: '' },
        sampleCount: 0,
        bitWidth: 0,
        refreshIntervalMs: 0,
        pointSize: 4,
      },
      refreshCadenceMs: 200,
      groups: [],
    }),
    getTable1Rows: () => table1.map((r) => ({ ...r })),
    getTable2Rows: () => table2.map((r) => ({ ...r })),
    getScatterProjection: () => ({ points: [], sampleCount: 0 }),
    getAvailability: () => ({ available: false }),
    getSourceFields: () => [],
    getSnapshot: () => ({} as never),
    updatePreferences: () => ({} as never),
    updateChartConfig: () => ({} as never),
    updateChartCount: () => ({} as never),
    ingestSourceMaterial: () => ({} as never),
    clearProjection: () => ({} as never),
    reset: () => ({} as never),
  } as unknown as DisplayService;
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

describe('useDisplayRefresh.getTable1Rows — fieldName enrichment (design 5.5)', () => {
  beforeEach(() => {
    // Composable uses rAF internally; stub to a no-op so start() does not loop.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  it('resolves fieldName via frameReader regardless of material.fieldName', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const service = createFakeDisplay([
        // material.fieldName is intentionally stale/wrong; UI MUST NOT trust it (R19)
        { groupId: 'f1', dataItemId: 'f1:voltage', fieldName: 'STALE', value: 42, displayValue: '42' },
      ]);
      const frameReader = createFieldLookup(
        new Map([['f1', [{ fieldId: 'voltage', fieldName: 'Voltage' }]]]),
      );

      const scope = effectScope();
      const state = scope.run(() => useDisplayRefresh(service, frameReader));
      if (!state) throw new Error('effectScope returned no state');
      state.start();

      const rows = state.getTable1Rows();
      expect(rows).toHaveLength(1);
      expect(rows[0].fieldName).toBe('Voltage'); // from frameReader, not material
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("degrades to '[Unknown Field]' when frameReader has no match (V5: never leak fieldId)", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const service = createFakeDisplay([
        { groupId: 'f1', dataItemId: 'f1:ghost', fieldName: 'Ghost', value: 1, displayValue: '1' },
      ]);
      const frameReader = createFieldLookup(new Map()); // empty

      const scope = effectScope();
      const state = scope.run(() => useDisplayRefresh(service, frameReader));
      if (!state) throw new Error('effectScope returned no state');
      state.start();

      const rows = state.getTable1Rows();
      expect(rows[0].fieldName).toBe('[Unknown Field]');
      expect(rows[0].fieldName).not.toBe('ghost'); // never leak raw fieldId
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns a deep copy: mutating the returned row does not affect the next read', () => {
    const service = createFakeDisplay([
      { groupId: 'f1', dataItemId: 'f1:voltage', fieldName: 'ignored', value: 42, displayValue: '42' },
    ]);
    const frameReader = createFieldLookup(
      new Map([['f1', [{ fieldId: 'voltage', fieldName: 'Voltage' }]]]),
    );

    const scope = effectScope();
    const state = scope.run(() => useDisplayRefresh(service, frameReader));
    if (!state) throw new Error('effectScope returned no state');
    state.start();

    const first = state.getTable1Rows();
    expect(first[0].fieldName).toBe('Voltage');
    // Mutate the returned object
    (first[0] as Record<string, unknown>).fieldName = 'TAMPERED';

    // Next read must be unaffected (internal ref stores enriched data, deep-copied on read)
    const second = state.getTable1Rows();
    expect(second[0].fieldName).toBe('Voltage');
  });

  it('returns empty array (still a fresh copy) when service has no rows', () => {
    const service = createFakeDisplay([]);
    const frameReader = createFieldLookup(new Map());

    const scope = effectScope();
    const state = scope.run(() => useDisplayRefresh(service, frameReader));
    if (!state) throw new Error('effectScope returned no state');
    state.start();

    const rows = state.getTable1Rows();
    expect(rows).toEqual([]);
    // Mutating the empty array must not throw or affect subsequent reads
    (rows as TableRowProjection[]).push({ groupId: 'x', dataItemId: 'x', fieldName: 'x', value: 0, displayValue: 'x' });
    expect(state.getTable1Rows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// S010: 三视图独立刷新节奏的 cadence 计算（散点 / 图表 / 表格）
// cadence 决策逻辑是纯函数，独立单测比驱动整个 rAF 时间模拟更可靠、更不脆弱。
// rAF 循环按这三组 cadence 分别判断到点（见 use-display-refresh.ts tick），独立性由此保证。
// ---------------------------------------------------------------------------

describe('useDisplayRefresh — S010 cadence 计算（散点/图表/表格独立节奏）', () => {
  it('clampCadence：正数保留（不低于 16ms 下限），0/负数/NaN 回退表格节奏 500ms', () => {
    expect(clampCadence(2000)).toBe(2000);
    expect(clampCadence(100)).toBe(100);
    // 低于一帧（16ms）的会被抬到下限，避免死循环。
    expect(clampCadence(1)).toBe(16);
    // 无效值回退表格节奏。
    expect(clampCadence(0)).toBe(500);
    expect(clampCadence(-100)).toBe(500);
    expect(clampCadence(Number.NaN)).toBe(500);
  });

  it('computeChartCadence：取所有 chart refreshIntervalMs 的最小值', () => {
    const charts = [
      { performance: { refreshIntervalMs: 2000 } },
      { performance: { refreshIntervalMs: 1500 } },
      { performance: { refreshIntervalMs: 3000 } },
    ];
    // 最小值 1500 → 图表整体按最快那张图的节奏刷新（chartBuffer 共享，必须统一）。
    expect(computeChartCadence(charts)).toBe(1500);
  });

  it('computeChartCadence：空图表回退表格节奏 500ms', () => {
    expect(computeChartCadence([])).toBe(500);
  });

  it('computeChartCadence：全部无效值回退表格节奏', () => {
    expect(computeChartCadence([
      { performance: { refreshIntervalMs: 0 } },
      { performance: { refreshIntervalMs: -1 } },
    ])).toBe(500);
  });

  it('computeChartCadence：有效最小值不低于 16ms 下限', () => {
    expect(computeChartCadence([
      { performance: { refreshIntervalMs: 5 } },
    ])).toBe(16);
  });

  // 业务不变量：散点节奏与图表节奏来源不同、互不影响。
  // 散点 ← scatter.refreshIntervalMs；图表 ← charts min。两者各自独立。
  it('散点 cadence 与图表 cadence 来源独立（不同字段，互不影响）', () => {
    // 即便散点设得很慢，图表仍按自己的值；反之亦然。
    const scatterMs = clampCadence(5000);
    const chartMs = computeChartCadence([{ performance: { refreshIntervalMs: 200 } }]);
    expect(scatterMs).toBe(5000);
    expect(chartMs).toBe(200);
    expect(scatterMs).not.toBe(chartMs);
  });
});
