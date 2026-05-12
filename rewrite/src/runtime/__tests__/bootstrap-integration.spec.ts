import { describe, it, expect } from 'vitest';
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
});
