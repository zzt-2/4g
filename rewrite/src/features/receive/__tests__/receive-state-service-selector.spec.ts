import { describe, expect, it } from 'vitest';
import {
  createFrameAssetReader,
  type FrameAssetSnapshot,
} from '@/features/frame';
import * as receivePublicApi from '../index';
import {
  createReceiveReader,
  createReceiveService,
} from '../services';
import { createReceiveState } from '../state';
import {
  selectReceiveFieldValues,
  selectReceiveRecentInputs,
  selectReceiveUiSnapshot,
} from '../selectors';
import type {
  ReceiveFieldValueSnapshot,
  ReceiveRecentInputSnapshot,
  ReceiveStateSnapshot,
} from '../core';
import {
  matchedReceiveBatchFixture,
  receiveTelemetryFrameFixture,
  unmatchedReceiveBatchFixture,
} from '../fixtures/receive-fixtures';

type MutableFieldValueForTest = {
  displayValue: string;
};

type MutableRecentInputForTest = {
  hex: string;
};

function createTestClock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-05-04T00:01:${String(tick).padStart(2, '0')}.000Z`;
  };
}

function createFrameReader() {
  const snapshot: FrameAssetSnapshot = {
    frames: [receiveTelemetryFrameFixture],
  };
  return createFrameAssetReader(() => snapshot);
}

describe('receive state and service', () => {
  it('drives reference refresh, matched input, unmatched input, and read model stats', () => {
    const service = createReceiveService({
      frameReader: createFrameReader(),
      now: createTestClock(),
    });

    const refreshOutcome = service.refreshFrameReferences();
    const matchedOutcome = service.ingestBatch({
      ...matchedReceiveBatchFixture,
      referenceVersion: refreshOutcome.reference?.referenceVersion,
    });
    const unmatchedOutcome = service.ingestBatch({
      ...unmatchedReceiveBatchFixture,
      referenceVersion: refreshOutcome.reference?.referenceVersion,
    });

    expect(refreshOutcome.ok).toBe(true);
    expect(matchedOutcome.ok).toBe(true);
    expect(unmatchedOutcome.ok).toBe(true);
    expect(service.getCounters()).toMatchObject({
      batchCount: 2,
      byteCount: 10,
      matchedCount: 1,
      unmatchedCount: 1,
    });
    expect(service.listFrameStats()).toEqual([
      {
        frameId: receiveTelemetryFrameFixture.id,
        frameName: receiveTelemetryFrameFixture.name,
        hitCount: 1,
        byteCount: 5,
        lastMatchedAt: '2026-05-04T00:01:02.000Z',
        lastSourceId: matchedReceiveBatchFixture.source.sourceId,
      },
    ]);
    expect(service.listSourceStats()[0]).toMatchObject({
      sourceId: matchedReceiveBatchFixture.source.sourceId,
      batchCount: 2,
      byteCount: 10,
      matchedCount: 1,
      unmatchedCount: 1,
    });
    expect(service.getUiSnapshot()).toMatchObject({
      lifecycle: 'receiving',
      currentFrame: {
        frameId: receiveTelemetryFrameFixture.id,
      },
    });
  });

  it('returns copied snapshots from state, reader, and selectors', () => {
    const state = createReceiveState();
    state.setReferenceVersion(1);
    const service = createReceiveService({
      frameReader: createFrameReader(),
      now: createTestClock(),
    });
    const refreshOutcome = service.refreshFrameReferences();
    const matchedOutcome = service.ingestBatch({
      ...matchedReceiveBatchFixture,
      referenceVersion: refreshOutcome.reference?.referenceVersion,
    });
    state.applyOutcome(matchedOutcome.outcomes[0]!);

    const snapshot = state.getSnapshot() as ReceiveStateSnapshot;
    (snapshot.fieldValues[0] as ReceiveFieldValueSnapshot as MutableFieldValueForTest).displayValue =
      'mutated';
    (snapshot.recentInputs[0] as ReceiveRecentInputSnapshot as MutableRecentInputForTest).hex =
      'mutated';

    expect(state.getSnapshot().fieldValues[0]?.displayValue).toBe('起始');
    expect(state.getSnapshot().recentInputs[0]?.hex).toBe('AA 01 00 64 FF');

    const reader = createReceiveReader(() => state.getSnapshot());
    const readerSnapshot = reader.getSnapshot();
    (readerSnapshot.fieldValues[0] as ReceiveFieldValueSnapshot as MutableFieldValueForTest).displayValue =
      'reader mutation';
    expect(reader.getSnapshot().fieldValues[0]?.displayValue).toBe('起始');

    const fields = selectReceiveFieldValues(state.getSnapshot());
    const recent = selectReceiveRecentInputs(state.getSnapshot());
    const uiSnapshot = selectReceiveUiSnapshot(state.getSnapshot());
    (fields[0] as ReceiveFieldValueSnapshot as MutableFieldValueForTest).displayValue =
      'selector mutation';
    (recent[0] as ReceiveRecentInputSnapshot as MutableRecentInputForTest).hex =
      'selector mutation';
    (uiSnapshot.fieldValues[0] as ReceiveFieldValueSnapshot as MutableFieldValueForTest).displayValue =
      'ui mutation';

    expect(selectReceiveFieldValues(state.getSnapshot())[0]?.displayValue).toBe('起始');
    expect(selectReceiveRecentInputs(state.getSnapshot())[0]?.hex).toBe('AA 01 00 64 FF');
  });

  it('keeps the feature root public api limited to reader, service, selectors, and types', () => {
    expect(receivePublicApi).toHaveProperty('createReceiveReader');
    expect(receivePublicApi).toHaveProperty('createReceiveService');
    expect(receivePublicApi).toHaveProperty('selectReceiveUiSnapshot');
    expect(receivePublicApi).not.toHaveProperty('createReceiveState');
    expect(receivePublicApi).not.toHaveProperty('createFakeReceiveInputSource');
    expect(receivePublicApi).not.toHaveProperty('processReceiveBatch');
  });
});
