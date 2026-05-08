import { describe, expect, it } from 'vitest';
import {
  createFrameAssetReader,
  type FrameAssetSnapshot,
} from '@/features/frame';
import { createFakeReceiveInputSource } from '../adapters/test-exports';
import { createReceiveService } from '../services';
import type {
  ReceiveInputBatch,
  ReceiveInputEvent,
  ReceiveSourceSnapshot,
} from '../core';
import {
  matchedReceiveBytesFixture,
  receiveInputErrorFixture,
  receiveSourceFixture,
  receiveTelemetryFrameFixture,
  unmatchedReceiveBytesFixture,
} from '../fixtures/receive-fixtures';

type MutableBatchForTest = {
  bytes: number[];
  source: ReceiveSourceSnapshot;
};

type MutableSourceForTest = {
  label: string;
};

function createTestClock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-05-04T00:02:${String(tick).padStart(2, '0')}.000Z`;
  };
}

function createFrameReader() {
  const snapshot: FrameAssetSnapshot = {
    frames: [receiveTelemetryFrameFixture],
  };
  return createFrameAssetReader(() => snapshot);
}

describe('receive fake input source', () => {
  it('drives matched, unmatched, stale, and input-error lifecycle through service events', async () => {
    const clock = createTestClock();
    const service = createReceiveService({
      frameReader: createFrameReader(),
      now: clock,
    });
    const refreshOutcome = service.refreshFrameReferences();
    const referenceVersion = refreshOutcome.reference!.referenceVersion;
    const inputSource = createFakeReceiveInputSource({ now: clock });

    inputSource.pushBytes({
      source: receiveSourceFixture,
      bytes: matchedReceiveBytesFixture,
      referenceVersion,
    });
    inputSource.pushBytes({
      source: receiveSourceFixture,
      bytes: unmatchedReceiveBytesFixture,
      referenceVersion,
    });
    inputSource.pushBytes({
      source: receiveSourceFixture,
      bytes: matchedReceiveBytesFixture,
      referenceVersion: referenceVersion - 1,
    });
    inputSource.pushError(receiveInputErrorFixture);

    const drainOutcome = await service.drainInputSource(inputSource);

    expect(drainOutcome.outcomes.map((item) => item.kind)).toEqual([
      'matched',
      'unmatched',
      'stale-input',
      'input-error',
    ]);
    expect(service.getCounters()).toMatchObject({
      batchCount: 3,
      byteCount: 10,
      matchedCount: 1,
      unmatchedCount: 1,
      inputErrorCount: 1,
      staleInputCount: 1,
    });
    expect(service.listEvents().map((event) => event.kind)).toEqual([
      'input-error',
      'stale-input',
      'unmatched',
      'matched',
    ]);
    expect(inputSource.readQueuedEvents()).toEqual([]);
  });

  it('copies queued fake input so caller mutations cannot alter drained events', async () => {
    const inputSource = createFakeReceiveInputSource({ now: createTestClock() });
    const pushedBatch = inputSource.pushBytes({
      source: receiveSourceFixture,
      bytes: matchedReceiveBytesFixture,
      referenceVersion: 1,
    }) as ReceiveInputBatch as MutableBatchForTest;

    pushedBatch.bytes[0] = 0;
    (pushedBatch.source as ReceiveSourceSnapshot as MutableSourceForTest).label = 'mutated';

    const queued = inputSource.readQueuedEvents() as ReceiveInputEvent[];
    const queuedBatch = queued[0]?.kind === 'batch' ? queued[0].batch : undefined;
    expect(queuedBatch?.bytes[0]).toBe(0xaa);
    expect(queuedBatch?.source.label).toBe(receiveSourceFixture.label);

    const drained = await inputSource.drainEvents();
    const drainedBatch = drained[0]?.kind === 'batch' ? drained[0].batch : undefined;
    expect(drainedBatch?.bytes[0]).toBe(0xaa);
    expect(drainedBatch?.source.label).toBe(receiveSourceFixture.label);
    expect(inputSource.readQueuedEvents()).toEqual([]);
  });
});
