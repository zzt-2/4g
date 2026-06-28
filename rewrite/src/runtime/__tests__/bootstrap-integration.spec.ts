import { describe, it, expect, vi } from 'vitest';
import { createRewriteRuntime } from '../index';
import { createFakeConnectionTransportAdapter } from '@/features/connection';

describe('bootstrap end-to-end integration', () => {
  it('creates runtime with fake adapter and runs pipeline without error', async () => {
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });

    // Verify wiring
    expect(runtime.features.connectionService).toBeDefined();
    expect(runtime.features.receiveService).toBeDefined();
    expect(runtime.features.taskService).toBeDefined();

    // Connect
    const connectResult = await runtime.features.connectionService.connect({
      kind: 'serial' as const,
      id: 'serial-1',
      portPath: '/dev/ttyUSB0',
      baudRate: 115200,
    });
    expect(connectResult.ok).toBe(true);

    // Push data and tick — verifies drain→receive pipeline runs without crashing
    fake.pushData('serial-1', [0x01, 0x02, 0x03, 0x04]);
    const tickResult = await runtime.routingTick();
    expect(tickResult.ok).toBe(true);

    // Future expansion points:
    // - Add frame definitions to test receive matching and eventsRouted > 0
    // - Verify ConditionMatchInput reaches task via receiveEventSourceBridge
    // - Verify task execution triggers send
    // - Verify send result feeds into result (when result feature exists)

    runtime.destroy();
  });

  it('manages tick driver lifecycle', () => {
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });

    expect(runtime.isTickDriverRunning).toBe(false);

    runtime.startTickDriver();
    expect(runtime.isTickDriverRunning).toBe(true);

    runtime.stopTickDriver();
    expect(runtime.isTickDriverRunning).toBe(false);

    runtime.destroy();
    expect(runtime.isTickDriverRunning).toBe(false);
  });

  it('destroy stops tick driver', () => {
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });

    runtime.startTickDriver();
    expect(runtime.isTickDriverRunning).toBe(true);

    runtime.destroy();
    expect(runtime.isTickDriverRunning).toBe(false);
  });

  // D013 回归:startTickDriver 的 in-flight guard 防并发雪崩。
  // 单次 routingTick 慢于 interval 时,setInterval 不应并发起多个 tick。
  it('startTickDriver does not run ticks concurrently (in-flight guard, D013)', async () => {
    const fake = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: fake });
    await runtime.features.connectionService.connect({
      kind: 'serial', id: 'serial-1', portPath: '/dev/ttyUSB0', baudRate: 115200,
    });

    // 让 drainAdapterEvents 慢(50ms),远超 interval(5ms) → 若无 guard 会并发堆叠。
    let inFlight = 0;
    let peakInFlight = 0;
    const originalDrain = runtime.features.connectionService.drainAdapterEvents.bind(
      runtime.features.connectionService,
    );
    vi.spyOn(runtime.features.connectionService, 'drainAdapterEvents').mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight -= 1;
      return originalDrain();
    });

    runtime.startTickDriver(5); // 5ms interval,远小于 50ms 的单 tick
    // 跑足够长,让 setInterval 触发多次(若无 guard,会堆出多个并发 tick)。
    await new Promise((r) => setTimeout(r, 200));
    runtime.stopTickDriver();
    runtime.destroy();

    // in-flight guard 生效:同一时刻最多 1 个 tick 在飞。无 guard 时会 >1。
    expect(peakInFlight).toBeLessThanOrEqual(1);
  }, 10000);
});
