import type { ConditionMatchInput } from '@/features/task';
import { ConnectionToReceiveInputSource } from './bridges/connection-to-receive';
import { fanOutToDisplay } from './bridges/receive-display-bridge';
import type { RewriteWiredFeatures } from './feature-wiring';

export interface RoutingTickTimings {
  /** drainAdapterEvents 耗时(连接事件拉取 + apply)。 */
  readonly drainMs: number;
  /** drainInputSource 耗时(帧解析 + 字段匹配 + 状态重建)。 */
  readonly parseMs: number;
  /** fanOutToDisplay 耗时(字段 upsert + 重投影)。 */
  readonly displayMs: number;
  /** 本轮拉到的事件总数(诊断事件积压用)。 */
  readonly eventCount: number;
}

export interface RoutingTickResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly eventsRouted: number;
  readonly matchesEmitted: number;
  readonly timings: RoutingTickTimings;
}

// 性能埋点开关(S###):routingTick 四段计时,单段或总计超阈值才 warn。
// 设 8ms 是单帧预算(~16ms)的警戒线,超了说明该段在抢主线程。确认优化生效后可调高或关闭。
const ROUTING_PERF_THRESHOLD_MS = 8;
const ROUTING_PERF_ENABLED = true;
// 节流:同一类慢段在窗口内只 warn 一次,避免 100ms tick 连续卡时 console 被刷屏。
// 窗口内累加触发次数,一起报。窗口结束下次再慢才再 warn。
const ROUTING_PERF_THROTTLE_MS = 5000;

interface PerfAccumulator {
  ts: number;
  counts: Record<string, number>;
  maxMs: Record<string, number>;
  maxEvents: number;
  maxRouted: number;
}
let perfAcc: PerfAccumulator | null = null;

function fmtMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
}

function maybeWarnPerf(
  timings: RoutingTickTimings,
  totalMs: number,
  routed: number,
): void {
  if (!ROUTING_PERF_ENABLED) return;
  const slow = [
    ['drain', timings.drainMs],
    ['parse', timings.parseMs],
    ['display', timings.displayMs],
  ].filter(([, ms]) => ms >= ROUTING_PERF_THRESHOLD_MS);
  if (slow.length === 0 && totalMs < ROUTING_PERF_THRESHOLD_MS) return;

  // 节流累积:窗口未开则开,窗口内累加各类慢段次数与峰值。
  const now = performance.now();
  if (perfAcc === null || now - perfAcc.ts >= ROUTING_PERF_THROTTLE_MS) {
    flushPerfAcc();
    perfAcc = { ts: now, counts: {}, maxMs: {}, maxEvents: 0, maxRouted: 0 };
  }
  perfAcc.maxEvents = Math.max(perfAcc.maxEvents, timings.eventCount);
  perfAcc.maxRouted = Math.max(perfAcc.maxRouted, routed);
  for (const [name, ms] of slow) {
    const key = name as string;
    perfAcc.counts[key] = (perfAcc.counts[key] ?? 0) + 1;
    perfAcc.maxMs[key] = Math.max(perfAcc.maxMs[key] ?? 0, ms as number);
  }
}

// 退出/窗口切换时把累积的慢段报出来。节流窗口到期靠下次 tick 隐式 flush,
// 但若卡顿恰好停在最后一次(后续 tick 都快了不再触发),累积就丢了。这里用
// process/browser 退出钩子兜底不现实,改为:每次 maybeWarnPerf 先 flush 上一个窗口。
function flushPerfAcc(): void {
  if (perfAcc === null) return;
  const acc = perfAcc;
  perfAcc = null;
  const segments = Object.entries(acc.counts)
    .map(([name, count]) => `${name}×${count}(peak ${fmtMs(acc.maxMs[name])})`)
    .join(' ');
  if (!segments) return;
  console.warn(
    `[routingTick] slow over ${ROUTING_PERF_THROTTLE_MS / 1000}s: ${segments} | peakEvents=${acc.maxEvents} peakRouted=${acc.maxRouted}`,
  );
}

export async function routingTick(
  features: RewriteWiredFeatures,
): Promise<RoutingTickResult> {
  const tickStart = performance.now();

  const t0 = performance.now();
  const drainOutcome =
    await features.connectionService.drainAdapterEvents();
  const drainMs = performance.now() - t0;

  if (!drainOutcome.ok) {
    return {
      ok: false,
      error: drainOutcome.error?.message ?? 'Connection drain failed',
      eventsRouted: 0,
      matchesEmitted: 0,
      timings: { drainMs, parseMs: 0, displayMs: 0, eventCount: drainOutcome.events.length },
    };
  }

  const dataEvents = drainOutcome.events.filter(
    (event) => event.kind === 'data' && event.bytes !== undefined,
  );
  const eventCount = drainOutcome.events.length;

  // 非 data 事件(disconnect/error/cleanup)是低频但需可见的状态变化,保留 warn
  // 但去掉每次的 .map 格式化(高频 tick 下即便不触发也按需构造)。
  if (dataEvents.length === 0) {
    const nonDataCount = eventCount;
    if (nonDataCount > 0) {
      console.warn('[routing] non-data events in tick:', nonDataCount);
    }
    const totalMs = performance.now() - tickStart;
    const timings: RoutingTickTimings = { drainMs, parseMs: 0, displayMs: 0, eventCount };
    maybeWarnPerf(timings, totalMs, 0);
    return { ok: true, eventsRouted: 0, matchesEmitted: 0, timings };
  }

  const source = new ConnectionToReceiveInputSource(dataEvents);
  const t1 = performance.now();
  const receiveOutcome =
    await features.receiveService.drainInputSource(source);
  const parseMs = performance.now() - t1;

  const t2 = performance.now();
  fanOutToDisplay(features.displayService, receiveOutcome.outcomes);
  const displayMs = performance.now() - t2;

  // routingTick 不再把接收帧写进 storage-local records（D013）。
  // 历史上这里调 fanOutToStorage → appendRoutedRecords 每帧无条件落盘，是"开久了卡"的元凶：
  // ① records 数组无上限，N 只增不减；② 攒批到 50 触发 writeMaterial 全量深拷贝 = O(N)；
  // ③ 写出的 record.fields.key 是裸 fieldName，与 History 页期望的 groupId:frameId:fieldId:fieldName
  //    格式不匹配，History 永远画不出这些点——是僵尸写入（无开关/格式错/无人正确消费）。
  // records 的唯一合法写入入口是 DisplayPage 的"记录"按钮（appendLocalRecords，路径A）。

  const matchInputs: ConditionMatchInput[] = [];
  for (const outcome of receiveOutcome.outcomes) {
    if (outcome.kind !== 'matched') continue;
    if (!outcome.matchedFrame) continue;

    const sourceId = outcome.input?.source.sourceId;
    const fieldValues: Record<string, number | string | null> = {};
    for (const field of outcome.fields) {
      fieldValues[field.fieldId] = field.value as number | string | null;
    }
    matchInputs.push({
      frameId: outcome.matchedFrame.frameId,
      fieldValues,
      ...(sourceId ? { sourceId } : {}),
    });
  }

  if (matchInputs.length > 0) {
    features.receiveEventSourceBridge.emit(matchInputs);
  }

  const totalMs = performance.now() - tickStart;
  const timings: RoutingTickTimings = { drainMs, parseMs, displayMs, eventCount };
  maybeWarnPerf(timings, totalMs, dataEvents.length);

  return {
    ok: true,
    eventsRouted: dataEvents.length,
    matchesEmitted: matchInputs.length,
    timings,
  };
}
