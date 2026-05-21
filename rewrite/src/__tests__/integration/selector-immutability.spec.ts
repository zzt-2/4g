/**
 * T006: Selector immutability verification across all features.
 *
 * Every selector must return an independent copy so that consumer-side
 * mutations cannot leak back into internal state.
 */
import { describe, it, expect } from 'vitest';
import { createFrameAssetService } from '@/features/frame';
import { minimalFrameAsset } from '@/features/frame/fixtures/frame-fixtures';
import { createConnectionService, createFakeConnectionTransportAdapter } from '@/features/connection';
import { createReceiveService } from '@/features/receive';
import { createSendService } from '@/features/send';
import { createTaskService } from '@/features/task';
import { createFakeSendService, createFakeReceiveEventSource } from '@/features/task/adapters/test-exports';
import { createDisplayService } from '@/features/display';
import { createStorageLocalService } from '@/features/storage-local-baseline';
import { createFakeLocalMaterialAdapter } from '@/features/storage-local-baseline/adapters/fake-local-material-adapter';
import { createSettingsService } from '@/features/settings';
import { createStatusService } from '@/features/status';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mutate a plain object by adding a sentinel property. */
function mutateObject(obj: Record<string, unknown>): void {
  (obj as Record<string, unknown>).__mutated__ = 'SENTINEL';
}

/** Push a sentinel element into an array. */
function mutateArray<T>(arr: T[]): void {
  (arr as T[]).push({ __mutated__: true } as T);
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

describe('Frame selectors', () => {
  it('listFrames returns independent summaries', () => {
    const service = createFrameAssetService();
    service.replaceFrames([minimalFrameAsset]);

    const first = service.listFrames();
    expect(first).toHaveLength(1);

    // Summaries are plain objects derived from internal frames
    mutateObject(first[0] as Record<string, unknown>);
    mutateArray(first as unknown as unknown[]);

    const second = service.listFrames();
    expect(second).toHaveLength(1);
    expect((second[0] as Record<string, unknown>).__mutated__).toBeUndefined();
    expect(second).toHaveLength(1); // not lengthened by push
  });

  it('getFrame returns an independent clone', () => {
    const service = createFrameAssetService();
    service.replaceFrames([minimalFrameAsset]);

    const first = service.getFrame(minimalFrameAsset.id);
    expect(first).toBeDefined();

    // Mutate the returned frame deeply
    mutateObject(first!.fields[0] as Record<string, unknown>);
    (first!.fields[0] as Record<string, unknown>).name = 'MUTATED';

    const second = service.getFrame(minimalFrameAsset.id);
    expect(second).toBeDefined();
    expect(second!.fields[0].name).toBe('帧头');
    expect((second!.fields[0] as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getSnapshot returns independent frame data', () => {
    const service = createFrameAssetService();
    service.replaceFrames([minimalFrameAsset]);

    const first = service.getSnapshot();
    expect(first.frames.length).toBe(1);

    mutateObject(first.frames[0] as unknown as Record<string, unknown>);
    mutateArray(first.frames as unknown as unknown[]);

    const second = service.getSnapshot();
    expect(second.frames).toHaveLength(1);
    expect((second.frames[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

describe('Connection selectors', () => {
  it('getSnapshot returns an independent clone', async () => {
    const adapter = createFakeConnectionTransportAdapter();
    const service = createConnectionService({ adapter });

    await service.connect({
      id: 'conn-1',
      kind: 'tcp-client',
      label: 'Test',
      host: '127.0.0.1',
      port: 9000,
    });

    const first = service.getSnapshot();

    // Mutate returned snapshot
    mutateObject(first as unknown as Record<string, unknown>);
    mutateArray(first.runtimeFacts as unknown as unknown[]);
    if (first.runtimeFacts.length > 0) {
      mutateObject(first.runtimeFacts[0] as unknown as Record<string, unknown>);
    }

    const second = service.getSnapshot();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
    expect(second.runtimeFacts).toHaveLength(1);
    expect((second.runtimeFacts[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('listConnectionFacts returns independent clones', async () => {
    const adapter = createFakeConnectionTransportAdapter();
    const service = createConnectionService({ adapter });

    await service.connect({
      id: 'conn-1',
      kind: 'tcp-client',
      label: 'Test',
      host: '127.0.0.1',
      port: 9000,
    });

    const first = service.listConnectionFacts();
    expect(first).toHaveLength(1);
    mutateObject(first[0] as unknown as Record<string, unknown>);
    mutateArray(first as unknown as unknown[]);

    const second = service.listConnectionFacts();
    expect(second).toHaveLength(1);
    expect((second[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------

describe('Receive selectors', () => {
  it('getSnapshot returns an independent deep clone', () => {
    const service = createReceiveService();

    const first = service.getSnapshot();

    // Mutate snapshot
    mutateObject(first as unknown as Record<string, unknown>);
    mutateArray(first.frameStats as unknown as unknown[]);

    const second = service.getSnapshot();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
    expect(second.frameStats).toHaveLength(0);
  });

  it('getCounters returns an independent clone', () => {
    const service = createReceiveService();

    const first = service.getCounters();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getCounters();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('listFrameStats returns independent clones', () => {
    const service = createReceiveService();

    const first = service.listFrameStats();
    mutateArray(first as unknown as unknown[]);

    const second = service.listFrameStats();
    expect(second).toHaveLength(0); // no stats populated, but array is independent
  });
});

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

describe('Send selectors', () => {
  it('getSnapshot returns an independent clone (structuredClone)', () => {
    const frameReader = createFrameAssetService();
    const targetResolver = { resolveTarget: () => null };
    const transportWriter = { writeBytes: async () => ({ ok: true, bytesWritten: 0 }) };
    const service = createSendService({ frameReader, targetResolver, transportWriter });

    const first = service.getSnapshot();
    mutateObject(first as unknown as Record<string, unknown>);
    mutateArray(first.recentResults as unknown as unknown[]);

    const second = service.getSnapshot();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
    expect(second.recentResults).toHaveLength(0);
  });

  it('getStatistics returns an independent clone', () => {
    const frameReader = createFrameAssetService();
    const targetResolver = { resolveTarget: () => null };
    const transportWriter = { writeBytes: async () => ({ ok: true, bytesWritten: 0 }) };
    const service = createSendService({ frameReader, targetResolver, transportWriter });

    const first = service.getStatistics();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getStatistics();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

describe('Task selectors', () => {
  it('getSnapshot returns independent data', () => {
    const fakeSend = createFakeSendService();
    const fakeEventSource = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeEventSource,
    });

    const first = service.getSnapshot();
    mutateObject(first.statistics as unknown as Record<string, unknown>);
    mutateArray(first.instances as unknown as unknown[]);
    mutateArray(first.history as unknown as unknown[]);

    const second = service.getSnapshot();
    expect((second.statistics as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
    expect(second.instances).toHaveLength(0);
    expect(second.history).toHaveLength(0);
  });

  it('getStatistics returns an independent shallow spread', () => {
    const fakeSend = createFakeSendService();
    const fakeEventSource = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeEventSource,
    });

    const first = service.getStatistics();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getStatistics();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getSnapshot after createTask returns independent instances', () => {
    const fakeSend = createFakeSendService();
    const fakeEventSource = createFakeReceiveEventSource();
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: fakeEventSource,
    });

    service.createTask({
      name: 'Test task',
      steps: [
        {
          kind: 'send',
          frameId: 'frame-1',
          targetId: 'target-1',
          fieldValues: {},
          context: { source: 'manual' },
        },
      ],
      stopCondition: { kind: 'step-count', value: 1 },
      errorPolicy: { action: 'stop' },
    });

    const first = service.getSnapshot();
    expect(first.instances).toHaveLength(1);

    mutateObject(first.instances[0] as unknown as Record<string, unknown>);
    (first.instances[0] as Record<string, unknown>).instanceId = 'MUTATED';

    const second = service.getSnapshot();
    expect(second.instances[0].instanceId).not.toBe('MUTATED');
    expect((second.instances[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

describe('Display selectors', () => {
  it('getTable1Rows returns independent shallow copies', () => {
    const service = createDisplayService();

    // Populate state by ingesting material with availability so rows appear
    service.ingestSourceMaterial({
      fields: [
        {
          frameId: 'frame-1',
          fieldId: 'field-1',
          frameName: 'Test Frame',
          fieldName: 'Test Field',
          dataType: 'uint8',
          value: 42,
          sourceId: 'source-1',
          sourceLabel: 'Source 1',
          receivedAt: new Date().toISOString(),
        },
      ],
      availability: {
        sourceGroups: [],
        fieldAvailability: [],
      },
    });

    const first = service.getTable1Rows();
    mutateArray(first as unknown as unknown[]);
    if (first.length > 0) {
      mutateObject(first[0] as Record<string, unknown>);
    }

    const second = service.getTable1Rows();
    // Array length should not be affected by push
    expect(second.length).toBe(first.length - 1); // we pushed one extra
    if (second.length > 0) {
      expect((second[0] as Record<string, unknown>).__mutated__).toBeUndefined();
    }
  });

  it('getTable2Rows returns independent shallow copies', () => {
    const service = createDisplayService();

    const first = service.getTable2Rows();
    mutateArray(first as unknown as unknown[]);

    const second = service.getTable2Rows();
    expect(second).toHaveLength(0);
  });

  it('getAvailability returns independent shallow spread (top-level properties)', () => {
    const service = createDisplayService();

    service.ingestSourceMaterial({
      availability: {
        sourceGroups: [{ groupId: 'g1', label: 'Group 1', sourceIds: ['s1'] }],
        fieldAvailability: [],
      },
    });

    const first = service.getAvailability();
    // Top-level properties are independent via shallow spread
    mutateObject(first as Record<string, unknown>);

    const second = service.getAvailability();
    expect((second as Record<string, unknown>).__mutated__).toBeUndefined();
    // NOTE: sourceGroups array is shallow-copied; nested arrays share reference.
    // Top-level immutability is the contract; nested deep-copy is not guaranteed here.
  });

  it('getSnapshot returns independent deep clone', () => {
    const service = createDisplayService();

    const first = service.getSnapshot();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getSnapshot();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Storage (local baseline)
// ---------------------------------------------------------------------------

describe('Storage-local selectors', () => {
  const validRecord = {
    id: 'rec-1',
    capturedAt: '2026-05-19T12:00:00.000Z',
    channel: 'ch-1',
    source: 'local' as const,
    fields: [
      { key: 'field-1', value: 42, unit: '' },
    ],
  };

  it('listLocalRecords returns independent query results', async () => {
    const adapter = createFakeLocalMaterialAdapter();
    const service = createStorageLocalService({ adapter });

    const appendResult = await service.appendLocalRecords([validRecord]);
    expect(appendResult.ok).toBe(true);

    const first = service.listLocalRecords();
    expect(first).toHaveLength(1);

    // Mutate returned array and objects
    mutateArray(first as unknown as unknown[]);
    mutateObject(first[0] as unknown as Record<string, unknown>);

    const second = service.listLocalRecords();
    expect(second).toHaveLength(1);
    expect((second[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getSnapshot returns a snapshot whose records cannot mutate internal state', async () => {
    const adapter = createFakeLocalMaterialAdapter();
    const service = createStorageLocalService({ adapter });

    const appendResult = await service.appendLocalRecords([validRecord]);
    expect(appendResult.ok).toBe(true);

    const first = service.getSnapshot();
    expect(first.records).toHaveLength(1);

    mutateArray(first.records as unknown as unknown[]);
    mutateObject(first.records[0] as unknown as Record<string, unknown>);

    const second = service.getSnapshot();
    expect(second.records).toHaveLength(1);
    expect((second.records[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe('Settings selectors', () => {
  it('getRecordingSettings returns an independent deep clone', () => {
    const service = createSettingsService();

    const first = service.getRecordingSettings();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getRecordingSettings();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getStorageSettings returns an independent deep clone', () => {
    const service = createSettingsService();

    const first = service.getStorageSettings();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getStorageSettings();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getGeneralSettings returns an independent deep clone', () => {
    const service = createSettingsService();

    const first = service.getGeneralSettings();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getGeneralSettings();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getSnapshot returns an independent deep clone', () => {
    const service = createSettingsService();

    const first = service.getSnapshot();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getSnapshot();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe('Status selectors', () => {
  it('getSnapshot returns an independent deep clone', () => {
    const service = createStatusService();

    // Ingest some data to populate
    service.ingest({
      connections: [{ connectionId: 'c1', lifecycle: 'connected', label: 'C1' }],
    });

    const first = service.getSnapshot();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getSnapshot();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getHealthSummary returns an independent deep clone', () => {
    const service = createStatusService();

    service.ingest({
      connections: [{ connectionId: 'c1', lifecycle: 'connected', label: 'C1' }],
    });

    const first = service.getHealthSummary();
    mutateObject(first as unknown as Record<string, unknown>);

    const second = service.getHealthSummary();
    expect((second as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
  });

  it('getIndicatorProjections returns independent clones', () => {
    const service = createStatusService();

    service.ingest({
      receiveFields: [
        {
          frameId: 'f1',
          fieldId: 'field-1',
          value: 42,
          receivedAt: new Date().toISOString(),
        },
      ],
    });

    const first = service.getIndicatorProjections();
    mutateArray(first as unknown as unknown[]);
    if (first.length > 0) {
      mutateObject(first[0] as unknown as Record<string, unknown>);
    }

    const second = service.getIndicatorProjections();
    // Length should not include the pushed sentinel
    expect(second).toHaveLength(Math.max(0, first.length - 1));
    if (second.length > 0) {
      expect((second[0] as unknown as Record<string, unknown>).__mutated__).toBeUndefined();
    }
  });
});
