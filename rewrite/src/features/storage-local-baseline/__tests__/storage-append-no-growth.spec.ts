/**
 * appendLocalRecords 治本回归 —— 钉死"单次 append 耗时不随累积 N 线性增长"。
 *
 * 上一轮(D010-B)的 fix 只省了 merge+sort,漏了 3 次全量深拷贝(before/snapshot/adapter),
 * 导致 prod 10k records 单次 ~99ms、20k ~203ms、trace 实测 600ms(对应 ~60k)。
 * 本测试用"N 翻倍耗时不应近线性翻倍"作为判据,直接钉住 O(N) 退化,不再依赖固定阈值
 * (固定阈值在快机器上过、慢机器上 fail,不稳)。
 *
 * 修复目标:appendLocalRecords 的路由路径(routingTick 每帧调,经 fanOutToStorage)
 * 不再生成被丢弃的全量快照深拷贝。getSnapshot()(reader/History 用)深拷贝隔离不变。
 *
 * 判据:N2/N1 耗时比 < 1.6(线性增长应为 2.0;O(1) 为 1.0;留 1.6 容 CI 抖动)。
 *      旧实现(3 次全量深拷贝)N2/N1 ≈ 2.0,此断言会 FAIL → RED。
 */
import { describe, expect, it } from 'vitest';
import { createStorageLocalService } from '../services';
import { createFakeLocalMaterialAdapter } from '../adapters/test-exports';
import type { StorageLocalRecord } from '../core';

function makeRecord(seq: number): StorageLocalRecord {
  const t = new Date(Date.UTC(2026, 0, 1) + seq * 1000).toISOString();
  return {
    id: `rec-${seq}`,
    capturedAt: t,
    source: 'local',
    channel: 'conn-1',
    fields: [
      { key: 'status', value: seq % 256 },
      { key: 'value', value: seq },
    ],
  };
}

/** 累积到 totalRecords 后,测"追加 1 条"的中位耗时。
 *  useRouted=true 测 appendRoutedRecords(routingTick 路由路径,治本目标);
 *  useRouted=false 测 appendLocalRecords(公开 API,返回 snapshot,非高频路径)。 */
async function medianAppendMs(totalRecords: number, useRouted: boolean): Promise<number> {
  const service = createStorageLocalService({ adapter: createFakeLocalMaterialAdapter() });
  const BATCH = 500;
  for (let i = 0; i < totalRecords; i += BATCH) {
    const slice: StorageLocalRecord[] = [];
    for (let j = 0; j < BATCH && i + j < totalRecords; j++) slice.push(makeRecord(i + j));
    await service.appendRoutedRecords(slice);
  }

  const ROUNDS = 12;
  const times: number[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    if (useRouted) {
      await service.appendRoutedRecords([makeRecord(totalRecords + i)]);
    } else {
      await service.appendLocalRecords([makeRecord(totalRecords + i)]);
    }
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('appendLocalRecords 治本: 单次耗时增长率', () => {
  it('路由路径(appendRoutedRecords)N 翻倍(5k→20k),耗时不应近线性翻倍(ratio < 1.6)', async () => {
    const t5k = await medianAppendMs(5000, true);
    const t20k = await medianAppendMs(20000, true);
    const ratio = t20k / t5k;
    console.log(`[NO-GROWTH-ROUTED] 5k=${t5k.toFixed(2)}ms  20k=${t20k.toFixed(2)}ms  ratio=${ratio.toFixed(2)}`);
    // O(N) 退化时 ratio≈4.0(N 翻两番),O(1) 时 ratio≈1.0。1.6 容 CI 抖动。
    expect(ratio).toBeLessThan(1.6);
  }, 120000);

  it('路由路径绝对值: 20k records 单次 appendRoutedRecords < 30ms(防极端退化)', async () => {
    const t = await medianAppendMs(20000, true);
    console.log(`[NO-GROWTH-ROUTED-ABS] 20k routed append=${t.toFixed(2)}ms`);
    // 旧实现(每帧 3 次全量深拷贝)~200ms,治本后应回到个位数 ms。30ms 留余量。
    expect(t).toBeLessThan(30);
  }, 120000);
});
