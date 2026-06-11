import { describe, it, expect, vi } from 'vitest';
import { fanOutToDisplay } from '../receive-display-bridge';
import type { DisplayService, DisplayOperationResult } from '@/features/display';
import type { ReceiveBatchOutcome } from '@/features/receive';

function createMockDisplayService(groups: DisplayService['getPreferences'] extends () => infer R ? R : never): DisplayService {
  return {
    getPreferences: () => groups,
    getSnapshot: vi.fn(),
    getTable1Rows: vi.fn(),
    getTable2Rows: vi.fn(),
    getChartInstances: vi.fn(),
    getChartSeries: vi.fn(),
    getScatterProjection: vi.fn(),
    getAvailability: vi.fn(),
    updatePreferences: vi.fn(),
    updateChartConfig: vi.fn(),
    updateChartCount: vi.fn(),
    ingestSourceMaterial: vi.fn((): DisplayOperationResult => ({
      ok: true,
      issues: [],
      snapshot: {} as DisplayService['getSnapshot'] extends () => infer R ? R : never,
    })),
    clearProjection: vi.fn(),
    reset: vi.fn(),
  } as unknown as DisplayService;
}

function matchedOutcome(
  frameId: string,
  fields: ReadonlyArray<{ fieldId: string; fieldName: string; value: number | string }>,
): ReceiveBatchOutcome {
  return {
    id: 'outcome-1',
    kind: 'matched',
    processedAt: '2026-01-01T00:00:00Z',
    fields: fields.map((f, i) => ({
      frameId,
      frameName: `Frame ${frameId}`,
      fieldId: f.fieldId,
      fieldName: f.fieldName,
      dataType: 'uint8' as const,
      offset: i,
      length: 1,
      rawHex: '00',
      value: f.value,
      displayValue: String(f.value),
    })),
    issues: [],
    statsDelta: {
      batchCount: 1, byteCount: 4, matchedCount: 1, unmatchedCount: 0,
      configErrorCount: 0, parseErrorCount: 0, inputErrorCount: 0, staleInputCount: 0,
      frameHits: [], sourceHits: [],
    },
  };
}

describe('fanOutToDisplay', () => {
  it('no groups: all fields pass through with groupId=frameId', () => {
    const service = createMockDisplayService({ groups: [] } as never);
    const outcomes = [matchedOutcome('f1', [
      { fieldId: 'voltage', fieldName: 'Voltage', value: 3.3 },
      { fieldId: 'current', fieldName: 'Current', value: 1.5 },
    ])];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(2);

    const ingestCall = (service.ingestSourceMaterial as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const fields = ingestCall.fields;
    expect(fields[0].groupId).toBe('f1');
    expect(fields[0].dataItemId).toBe('f1:voltage');
    expect(fields[1].groupId).toBe('f1');
    expect(fields[1].dataItemId).toBe('f1:current');
  });

  it('mapped frame with visible fields: only visible pass, groupId remapped', () => {
    const service = createMockDisplayService({
      groups: [{ id: 'g1', label: 'Power', frames: [{ frameId: 'f1', visibleFieldIds: ['voltage'] }] }],
    } as never);
    const outcomes = [matchedOutcome('f1', [
      { fieldId: 'voltage', fieldName: 'Voltage', value: 3.3 },
      { fieldId: 'current', fieldName: 'Current', value: 1.5 },
    ])];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(1);

    const fields = (service.ingestSourceMaterial as ReturnType<typeof vi.fn>).mock.calls[0][0].fields;
    expect(fields[0].groupId).toBe('g1');
    expect(fields[0].dataItemId).toBe('f1:voltage');
  });

  it('mapped frame with empty visibleFieldIds: all fields pass (show all)', () => {
    const service = createMockDisplayService({
      groups: [{ id: 'g1', label: 'Power', frames: [{ frameId: 'f1', visibleFieldIds: [] }] }],
    } as never);
    const outcomes = [matchedOutcome('f1', [
      { fieldId: 'voltage', fieldName: 'Voltage', value: 3.3 },
      { fieldId: 'current', fieldName: 'Current', value: 1.5 },
    ])];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(2);

    const fields = (service.ingestSourceMaterial as ReturnType<typeof vi.fn>).mock.calls[0][0].fields;
    expect(fields[0].groupId).toBe('g1');
    expect(fields[1].groupId).toBe('g1');
  });

  it('mapped frame with no matching visible fields: all filtered', () => {
    const service = createMockDisplayService({
      groups: [{ id: 'g1', label: 'Power', frames: [{ frameId: 'f1', visibleFieldIds: ['nonexistent'] }] }],
    } as never);
    const outcomes = [matchedOutcome('f1', [
      { fieldId: 'voltage', fieldName: 'Voltage', value: 3.3 },
    ])];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(0);
  });

  it('unmapped frame: passes with groupId=frameId', () => {
    const service = createMockDisplayService({
      groups: [{ id: 'g1', label: 'Power', frames: [{ frameId: 'f1', visibleFieldIds: ['voltage'] }] }],
    } as never);
    const outcomes = [matchedOutcome('f2', [
      { fieldId: 'temp', fieldName: 'Temperature', value: 25 },
    ])];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(1);

    const fields = (service.ingestSourceMaterial as ReturnType<typeof vi.fn>).mock.calls[0][0].fields;
    expect(fields[0].groupId).toBe('f2');
    expect(fields[0].dataItemId).toBe('f2:temp');
  });

  it('multiple frames in same group: dataItemId distinguishes fields', () => {
    const service = createMockDisplayService({
      groups: [{
        id: 'g1',
        label: 'Power',
        frames: [
          { frameId: 'f1', visibleFieldIds: ['voltage'] },
          { frameId: 'f2', visibleFieldIds: ['voltage'] },
        ],
      }],
    } as never);
    const outcomes = [
      matchedOutcome('f1', [{ fieldId: 'voltage', fieldName: 'Voltage', value: 3.3 }]),
      matchedOutcome('f2', [{ fieldId: 'voltage', fieldName: 'Voltage', value: 5.0 }]),
    ];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(2);

    const fields = (service.ingestSourceMaterial as ReturnType<typeof vi.fn>).mock.calls[0][0].fields;
    expect(fields[0].groupId).toBe('g1');
    expect(fields[0].dataItemId).toBe('f1:voltage');
    expect(fields[1].groupId).toBe('g1');
    expect(fields[1].dataItemId).toBe('f2:voltage');
  });

  it('skips unmatched outcomes', () => {
    const service = createMockDisplayService({ groups: [] } as never);
    const outcomes: ReceiveBatchOutcome[] = [{
      id: 'unmatched-1',
      kind: 'unmatched',
      processedAt: '2026-01-01T00:00:00Z',
      fields: [],
      issues: [],
      statsDelta: {
        batchCount: 1, byteCount: 4, matchedCount: 0, unmatchedCount: 1,
        configErrorCount: 0, parseErrorCount: 0, inputErrorCount: 0, staleInputCount: 0,
        frameHits: [], sourceHits: [],
      },
    }];

    const count = fanOutToDisplay(service, outcomes);
    expect(count).toBe(0);
    expect(service.ingestSourceMaterial).not.toHaveBeenCalled();
  });
});
