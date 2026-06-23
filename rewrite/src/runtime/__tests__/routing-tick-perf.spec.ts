/**
 * routingTick 性能基准 — Phase 1 证据收集(不猜)。
 *
 * 目的:用真实 wiring + fake 连接适配器,推 N 帧过完整 routingTick 链,
 *      分段计时 drain / receive / display / storage,锁定 300-430ms 花在哪一步。
 *
 * 本文件是 bench(非断言单测),跑法:`npx vitest run --testNamePattern=perf src/runtime/__tests__/routing-tick-perf.bench.ts`
 * 默认不被 CI 强制(文件名 .bench.ts,看 vitest.config 是否纳入)。
 *
 * 红线:trace 显示 timer#4 耗时平稳(前1/3 327ms / 后1/3 330ms)→ 排除 O(n²) 累积;
 *      drain 空时 0.3ms → 瓶颈 100% 由"处理数据帧"触发。本基准验证这个判断。
 */
import { describe, it } from 'vitest';
import { createRewriteRuntime } from '../index';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { FrameAsset } from '@/features/frame';

// 一个有 identifierRules 的 receive 帧(能被 matchReceiveFrame 命中)。
// 字段尽量接近真实遥测帧:若干 uint 字段 + 一个浮点。
const receiveFrame: FrameAsset = {
  id: 'bench-frame',
  name: 'Bench Receive Frame',
  direction: 'receive',
  fields: [
    { id: 'sync', name: 'Sync', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0xAA' },
    { id: 'cmd', name: 'Cmd', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0x01' },
    { id: 'value', name: 'Value', dataType: 'uint16', length: 2, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0' },
    { id: 'status', name: 'Status', dataType: 'uint8', length: 1, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0' },
    { id: 'sensor', name: 'Sensor', dataType: 'float', length: 4, inputType: 'input', configurable: false, options: [], dataParticipationType: 'direct', defaultValue: '0' },
  ],
  // 命中条件:第 0 字节=0xAA。让 bytes 构造与之对齐。
  identifierRules: [{ startIndex: 0, endIndex: 0, operator: 'eq', value: '0xAA' }],
  options: { autoChecksum: false, bigEndian: true, includeLengthField: false },
};

// 构造一帧合法字节数组(sync=0xAA 触发命中)。长度与字段和 length 对齐。
function buildFrameBytes(): number[] {
  // sync(1) + cmd(1) + value(2) + status(1) + sensor(4 float) = 9 bytes
  return [0xAA, 0x01, 0x00, 0x10, 0x00, 0x00, 0x00, 0x80, 0x3F];
}

async function timeMs(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe('routingTick perf — Phase 1 evidence', () => {
  it('perf: 分段计时 routingTick 各子步(N 帧单 tick)', async () => {
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });

    await runtime.features.connectionService.connect({
      kind: 'serial', id: 'serial-1', portPath: '/dev/ttyUSB0', baudRate: 115200,
    });
    // 注入帧引用,让 receive 能匹配(否则 config-error,不走匹配路径)。
    runtime.features.receiveService.refreshFrameReferences([receiveFrame]);

    const bytes = buildFrameBytes();

    // warmup: 推 1 帧跑一次(JIT 预热)
    fake.pushData('serial-1', bytes);
    await runtime.routingTick();

    // 基准:每轮推 K 帧到一个 tick 里(模拟一秒十几帧积压),跑多轮取均值。
    const FRAMES_PER_TICK = 12; // "一秒十几帧"
    const ROUNDS = 20;
    const perTick: number[] = [];

    for (let r = 0; r < ROUNDS; r++) {
      for (let i = 0; i < FRAMES_PER_TICK; i++) {
        fake.pushData('serial-1', bytes);
      }
      perTick.push(await timeMs(() => runtime.routingTick()));
    }

    perTick.sort((a, b) => a - b);
    const med = perTick[Math.floor(perTick.length / 2)];
    const max = perTick[perTick.length - 1];
    const avg = perTick.reduce((s, v) => s + v, 0) / perTick.length;
    console.log(`[PERF] ${FRAMES_PER_TICK}帧/tick × ${ROUNDS}轮: avg=${avg.toFixed(1)}ms med=${med.toFixed(1)}ms max=${max.toFixed(1)}ms`);
    console.log(`[PERF] 全部轮次: ${perTick.map((v) => v.toFixed(0)).join(', ')}`);

    runtime.destroy();
  });

  it('perf: 子步分段计时 — drain vs receive vs display vs storage', async () => {
    // 直接调各 service,分段定位 300ms 花在哪。
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });
    const f = runtime.features;

    await f.connectionService.connect({ kind: 'serial', id: 'serial-1', portPath: '/dev/ttyUSB0', baudRate: 115200 });
    f.receiveService.refreshFrameReferences([receiveFrame]);

    const bytes = buildFrameBytes();
    const FRAMES = 12;
    const ROUNDS = 20;

    const drainT: number[] = [];
    const receiveT: number[] = [];
    const displayT: number[] = [];
    const storageT: number[] = [];
    // 复刻 routing-tick.ts 的调用顺序但分段计时
    const { ConnectionToReceiveInputSource } = await import('../bridges/connection-to-receive');
    const { fanOutToDisplay } = await import('../bridges/receive-display-bridge');
    const { fanOutToStorage } = await import('../bridges/receive-storage-bridge');

    // warmup
    for (let i = 0; i < FRAMES; i++) fake.pushData('serial-1', bytes);
    {
      const d = await f.connectionService.drainAdapterEvents();
      const dataEvents = d.events.filter((e) => e.kind === 'data' && e.bytes !== undefined);
      if (dataEvents.length) {
        const src = new ConnectionToReceiveInputSource(dataEvents);
        const out = await f.receiveService.drainInputSource(src);
        fanOutToDisplay(f.displayService, out.outcomes);
        await fanOutToStorage(f.storageService, out.outcomes);
      }
    }

    for (let r = 0; r < ROUNDS; r++) {
      for (let i = 0; i < FRAMES; i++) fake.pushData('serial-1', bytes);

      drainT.push(await timeMs(() => f.connectionService.drainAdapterEvents().then((d) => {
        // 复刻 routing-tick 的 filter(只计时 drain+filter,不消费结果)
        void d.events.filter((e) => e.kind === 'data' && e.bytes !== undefined);
      })));
      // drain 已消费,重新推一轮给后续步骤
      for (let i = 0; i < FRAMES; i++) fake.pushData('serial-1', bytes);
      const drained = await f.connectionService.drainAdapterEvents();
      const dataEvents = drained.events.filter((e) => e.kind === 'data' && e.bytes !== undefined);

      receiveT.push(await timeMs(async () => {
        const src = new ConnectionToReceiveInputSource(dataEvents);
        await f.receiveService.drainInputSource(src);
      }));
      // receive 再跑一次拿 outcomes 给 display/storage 分段
      for (let i = 0; i < FRAMES; i++) fake.pushData('serial-1', bytes);
      const d2 = await f.connectionService.drainAdapterEvents();
      const de2 = d2.events.filter((e) => e.kind === 'data' && e.bytes !== undefined);
      const src2 = new ConnectionToReceiveInputSource(de2);
      const outcomes = (await f.receiveService.drainInputSource(src2)).outcomes;

      displayT.push(await timeMs(() => fanOutToDisplay(f.displayService, outcomes)));
      storageT.push(await timeMs(() => fanOutToStorage(f.storageService, outcomes)));
    }

    const stat = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return `avg=${(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2)}ms med=${s[Math.floor(s.length / 2)].toFixed(2)}ms max=${s[s.length - 1].toFixed(2)}ms`;
    };
    console.log(`[PERF-STEP] drain (${FRAMES}帧):    ${stat(drainT)}`);
    console.log(`[PERF-STEP] receive (${FRAMES}帧):  ${stat(receiveT)}`);
    console.log(`[PERF-STEP] display (${FRAMES}帧):  ${stat(displayT)}`);
    console.log(`[PERF-STEP] storage (${FRAMES}帧):  ${stat(storageT)}`);

    runtime.destroy();
  });

  it('perf: 单帧耗时(1 帧/tick) — 区分"帧少固定开销"vs"帧多累积"', async () => {
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });
    const f = runtime.features;

    await f.connectionService.connect({ kind: 'serial', id: 'serial-1', portPath: '/dev/ttyUSB0', baudRate: 115200 });
    f.receiveService.refreshFrameReferences([receiveFrame]);
    const bytes = buildFrameBytes();

    // warmup
    fake.pushData('serial-1', bytes);
    await runtime.routingTick();

    const ROUNDS = 30;
    const t1: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      fake.pushData('serial-1', bytes);
      t1.push(await timeMs(() => runtime.routingTick()));
    }
    t1.sort((a, b) => a - b);
    const avg = t1.reduce((s, v) => s + v, 0) / t1.length;
    console.log(`[PERF-1] 1帧/tick × ${ROUNDS}轮: avg=${avg.toFixed(2)}ms med=${t1[Math.floor(t1.length / 2)].toFixed(2)}ms max=${t1[t1.length - 1].toFixed(2)}ms`);
    runtime.destroy();
  });

  it('perf: 开久了卡? — 持续推帧,看单 tick 是否随 storage 记录累积变慢(O(N·M) 验证)', async () => {
    // 注:本测试推 2000 帧采样趋势,实测 O(N·M) 下约 60s,需放宽 testTimeout(默认 10s)。
    // 这个 testTimeout 只对本用例生效,不影响其他测试。
    // 假设:appendLocalRecords 每帧 [...existing, ...new] + mergeStorageLocalRecords(深拷贝全部+排序) +
    //      writeMaterial(再深拷贝) + state.replaceRecords(再深拷贝) → 单 tick 耗时随总记录数 N 线性增长。
    //      这是"开久了卡"的候选机制。推 2000 帧采样单 tick 耗时趋势验证。
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });
    const f = runtime.features;

    await f.connectionService.connect({ kind: 'serial', id: 'serial-1', portPath: '/dev/ttyUSB0', baudRate: 115200 });
    f.receiveService.refreshFrameReferences([receiveFrame]);
    const bytes = buildFrameBytes();

    // warmup
    fake.pushData('serial-1', bytes);
    await runtime.routingTick();

    const TOTAL = 2000;
    const sampleAt = new Set([0, 500, 1000, 1500, TOTAL - 1]);
    const samples: { records: number; tickMs: number }[] = [];

    for (let i = 0; i < TOTAL; i++) {
      fake.pushData('serial-1', bytes);
      if (sampleAt.has(i)) {
        const t = await timeMs(() => runtime.routingTick());
        const records = f.storageService.getSnapshot().records.length;
        samples.push({ records, tickMs: t });
      } else {
        await runtime.routingTick();
      }
    }

    console.log('[PERF-GROWTH] 单 tick 耗时随 storage 记录数增长:');
    for (const s of samples) {
      const bars = 'X'.repeat(Math.min(50, Math.round(s.tickMs)));
      console.log(`  records=${String(s.records).padStart(5)} → ${s.tickMs.toFixed(2)}ms ${bars}`);
    }
    const first = samples[0].tickMs;
    const last = samples[samples.length - 1].tickMs;
    console.log(`[PERF-GROWTH] 首个=${first.toFixed(2)}ms → 末个=${last.toFixed(2)}ms,倍数=${(last / first).toFixed(1)}x`);
    runtime.destroy();
  }, 120000);
});
