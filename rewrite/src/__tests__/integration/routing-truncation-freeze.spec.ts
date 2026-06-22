/**
 * Bug repro: "接收帧匹配计数到 48 就卡死不再增长"
 *
 * 根因: connection state 的 events 是 EVENT_LIMIT=50 的滚动窗口,
 * 而 ConnectionService.collectEventsAfter 用「数组下标 beforeLength」
 * 取本轮新增事件。当 events 累计到 50 后, beforeLength 恒为 50,
 * 长度恒为 50 的滚动数组 slice(50) 永远返回 [] —— routingTick 拿不到
 * 任何新 data 事件, 匹配计数从此冻结。
 *
 * 本测试模拟生产路径: connect 后 tick driver 多次分批 drain
 * (而非一次性 push 100 再 drain), 累计跨过 EVENT_LIMIT,
 * 验证「卡死点之后新到达的 data 事件仍能被路由出去」。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createFakeConnectionTransportAdapter,
  type FakeConnectionTransportAdapter,
} from '@/features/connection';
import {
  createConnectionService,
  type ConnectionService,
} from '@/features/connection';
import type { TransportConfig } from '@/features/connection';

function makeSerialConfig(id: string): TransportConfig {
  return {
    id,
    kind: 'serial',
    portPath: `/dev/tty${id}`,
    baudRate: 9600,
  };
}

describe('routing freeze after EVENT_LIMIT (bug: 卡在 48)', () => {
  let fakeAdapter: FakeConnectionTransportAdapter;
  let connectionService: ConnectionService;

  beforeEach(() => {
    fakeAdapter = createFakeConnectionTransportAdapter();
    connectionService = createConnectionService({ adapter: fakeAdapter });
  });

  it('分批多次 drain: 跨过 EVENT_LIMIT 后新 data 事件仍应被路由出去', async () => {
    const config = makeSerialConfig('freeze-conn');
    await connectionService.connect(config);

    // 第一阶段: 先把 events buffer 推到接近/超过 EVENT_LIMIT(50)。
    // connect 占 2 槽(connect-requested + connected), 再推 60 个 data。
    const fillCount = 60;
    for (let i = 0; i < fillCount; i++) {
      fakeAdapter.pushData('freeze-conn', [0x01, 0x02]);
    }
    const firstDrain = await connectionService.drainAdapterEvents();

    // 此时 buffer 已满(滚动到 50), 之前的实现在这里还能工作:
    // 第一次 drain 时 beforeLength=2, slice(2) 取到这批新事件。
    const firstDataEvents = firstDrain.events.filter((e) => e.kind === 'data');
    expect(firstDataEvents.length).toBe(fillCount);

    // 第二阶段: 模拟之后又来一批 data(生产中 tick 每 100ms 一次)。
    // buffer 已卡在 50 满滚动窗口, beforeLength 将恒为 50。
    const nextBatch = 5;
    for (let i = 0; i < nextBatch; i++) {
      fakeAdapter.pushData('freeze-conn', [0x03, 0x04]);
    }
    const secondDrain = await connectionService.drainAdapterEvents();
    const secondDataEvents = secondDrain.events.filter((e) => e.kind === 'data');

    // === 本 bug 的断言点 ===
    // 修复前: secondDataEvents.length === 0 (路由冻结, 匹配计数不再涨)
    // 修复后: secondDataEvents.length === nextBatch (新事件正常路由)
    expect(secondDataEvents.length).toBe(nextBatch);
  });

  it('连续三轮 drain 都应正确返回每轮的新增 data 事件', async () => {
    const config = makeSerialConfig('multi-conn');
    await connectionService.connect(config);

    const perRound = 30; // 每轮都 < EVENT_LIMIT, 但累计会越过 50
    const rounds = 3;
    const seenPerRound: number[] = [];

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < perRound; i++) {
        fakeAdapter.pushData('multi-conn', [0xaa]);
      }
      const outcome = await connectionService.drainAdapterEvents();
      seenPerRound.push(
        outcome.events.filter((e) => e.kind === 'data').length,
      );
    }

    // 每轮推了多少就该路由出多少, 与是否越过 EVENT_LIMIT 无关。
    // 修复前: 第 1 轮 30, 第 2 轮 0(buffer 已满), 第 3 轮 0 —— 冻结。
    // 修复后: 30 / 30 / 30。
    expect(seenPerRound).toEqual([perRound, perRound, perRound]);
  });
});
