import type {
  ConnectionOperationOutcome,
  ConnectionStateSnapshot,
  ConnectionService,
  TransportEventSnapshot,
} from '@/features/connection';
import type {
  ReceiveBatchOutcome,
  ReceiveService,
  ReceiveServiceOutcome,
  ReceiveStateSnapshot,
} from '@/features/receive';
import type { RewriteWiredFeatures } from '../feature-wiring';
import type { DisplayService } from '@/features/display';
import type { StorageLocalService } from '@/features/storage-local-baseline';
import { ReceiveEventSourceBridge } from '../bridges/receive-event-source-bridge';

// --- Shared snapshots ---

export const emptyConnSnapshot: ConnectionStateSnapshot = {
  schemaVersion: 1 as const,
  configs: [],
  runtimeFacts: [],
  events: [],
};

export const emptyReceiveSnapshot = {
  schemaVersion: 1,
  counters: { batchCount: 0, byteCount: 0, matchedCount: 0, unmatchedCount: 0, configErrorCount: 0, parseErrorCount: 0, inputErrorCount: 0, staleInputCount: 0 },
  sources: [],
  frameStats: [],
  recentInputs: [],
  events: [],
  lastError: null,
} as unknown as ReceiveStateSnapshot;

// --- Outcome builders ---

export function okOutcome(
  events: readonly TransportEventSnapshot[] = [],
): ConnectionOperationOutcome {
  return {
    ok: true,
    validation: { valid: true, issues: [] },
    snapshot: emptyConnSnapshot,
    events,
  };
}

export function failOutcome(
  message: string,
  overrides: Partial<ConnectionOperationOutcome['error']> = {},
): ConnectionOperationOutcome {
  return {
    ok: false,
    validation: { valid: true, issues: [] },
    snapshot: emptyConnSnapshot,
    events: [],
    error: {
      kind: 'timeout' as const,
      message,
      occurredAt: '2026-01-01T00:00:00.000Z',
      connectionId: 'conn-1',
      recoverable: false,
      ...overrides,
    },
  };
}

export function okReceiveOutcome(
  outcomes: readonly ReceiveBatchOutcome[] = [],
): ReceiveServiceOutcome {
  return {
    ok: true,
    outcomes,
    snapshot: emptyReceiveSnapshot,
    issues: [],
  };
}

// --- Event builders ---

export function dataEvent(
  connectionId: string,
  bytes: readonly number[],
): TransportEventSnapshot {
  return {
    id: `${connectionId}:data:now`,
    kind: 'data',
    connectionId,
    occurredAt: '2026-01-01T00:00:00.000Z',
    bytes,
    byteLength: bytes.length,
  };
}

export function matchedOutcome(
  frameId: string,
  fields: ReadonlyArray<{
    fieldId: string;
    value: number | string | null;
  }>,
  sourceId?: string,
): ReceiveBatchOutcome {
  return {
    id: 'outcome-1',
    kind: 'matched',
    processedAt: '2026-01-01T00:00:00.000Z',
    matchedFrame: {
      frameId,
      frameName: `Frame ${frameId}`,
      byteLength: 4,
      fieldCount: fields.length,
    },
    fields: fields.map((f, i) => ({
      frameId,
      frameName: `Frame ${frameId}`,
      fieldId: f.fieldId,
      fieldName: `Field ${f.fieldId}`,
      dataType: 'uint8',
      offset: i,
      length: 1,
      rawHex: '00',
      value: f.value,
      displayValue: String(f.value),
    })),
    issues: [],
    statsDelta: {
      batchCount: 1,
      byteCount: 4,
      matchedCount: 1,
      unmatchedCount: 0,
      configErrorCount: 0,
      parseErrorCount: 0,
      inputErrorCount: 0,
      staleInputCount: 0,
      frameHits: [],
      sourceHits: [],
    },
    ...(sourceId
      ? {
          input: {
            id: 'input-1',
            bytes: [0x01, 0x02, 0x03, 0x04],
            receivedAt: '2026-01-01T00:00:00.000Z',
            source: {
              sourceId,
              connectionId: 'conn-1',
              kind: 'serial' as const,
              label: sourceId,
            },
          },
        }
      : {}),
  };
}

// --- Service mock builders ---

export function createMockConnectionService(
  overrides: Partial<ConnectionService> = {},
): ConnectionService {
  return {
    getSnapshot: () => emptyConnSnapshot,
    listTransportConfigs: () => [],
    listConnectionFacts: () => [],
    getConnectionFact: () => undefined,
    listConnectionSummaries: () => [],
    listTransportTargets: () => [],
    getLastTransportError: () => undefined,
    listTransportEvents: () => [],
    getReconnectStatus: () => undefined,
    connect: async () => okOutcome(),
    disconnect: async () => okOutcome(),
    write: async () => okOutcome(),
    drainAdapterEvents: async () => okOutcome(),
    cleanup: async () => okOutcome(),
    discoverResources: async () => [],
    ...overrides,
  };
}

export function createMockReceiveService(
  overrides: Partial<ReceiveService> = {},
): ReceiveService {
  return {
    getSnapshot: () => emptyReceiveSnapshot,
    getUiSnapshot: () => ({} as ReceiveService['getUiSnapshot'] extends () => infer R ? R : never),
    getCounters: () => ({} as ReceiveService['getCounters'] extends () => infer R ? R : never),
    listFrameStats: () => [],
    listSourceStats: () => [],
    listFieldValues: () => [],
    listRecentInputs: () => [],
    listEvents: () => [],
    refreshFrameReferences: () => okReceiveOutcome(),
    ingestBatch: () => okReceiveOutcome(),
    recordInputError: () => okReceiveOutcome(),
    drainInputSource: async () => okReceiveOutcome(),
    reset: () => okReceiveOutcome(),
    ...overrides,
  };
}

export function createMockWiredFeatures(
  overrides: {
    connectionService?: Partial<ConnectionService>;
    receiveService?: Partial<ReceiveService>;
    bridge?: ReceiveEventSourceBridge;
  } = {},
): RewriteWiredFeatures {
  const bridge = overrides.bridge ?? new ReceiveEventSourceBridge();
  return {
    frameReader: {},
    settingsService: {},
    storageReader: {},
    storageService: {
      getSnapshot: () => ({} as StorageLocalService['getSnapshot'] extends () => infer R ? R : never),
      getMaterialIds: () => [],
      getLocalRecords: () => [],
      loadLocalRecords: async () => ({ ok: true, issues: [], snapshot: {} }),
      appendLocalRecords: async () => ({ ok: true, issues: [], snapshot: {} }),
      loadHistoryMaterials: async () => ({ ok: true, issues: [], snapshot: {} }),
      createCsvFromLocalRecords: async () => ({ ok: true, issues: [], snapshot: {} }),
      clearLocalRecords: async () => ({ ok: true, issues: [], snapshot: {} }),
      reset: async () => ({ ok: true, issues: [], snapshot: {} }),
    } as StorageLocalService,
    connectionService: createMockConnectionService(overrides.connectionService),
    receiveService: createMockReceiveService(overrides.receiveService),
    displayService: {
      getSnapshot: () => ({} as DisplayService['getSnapshot'] extends () => infer R ? R : never),
      getPreferences: () => ({ groups: [] } as DisplayService['getPreferences'] extends () => infer R ? R : never),
      getTable1Rows: () => [],
      getTable2Rows: () => [],
      getChartSeries: () => [],
      getScatterProjection: () => ({ points: [], sampleCount: 0 }),
      getAvailability: () => ({ available: false }),
      updatePreferences: () => ({ ok: true, issues: [], snapshot: {} as DisplayService['getSnapshot'] extends () => infer R ? R : never }),
      ingestSourceMaterial: () => ({ ok: true, issues: [], snapshot: {} as DisplayService['getSnapshot'] extends () => infer R ? R : never }),
      clearProjection: () => ({ ok: true, issues: [], snapshot: {} as DisplayService['getSnapshot'] extends () => infer R ? R : never }),
      reset: () => ({ ok: true, issues: [], snapshot: {} as DisplayService['getSnapshot'] extends () => infer R ? R : never }),
    } as DisplayService,
    sendService: {},
    taskService: {},
    commandIngressService: {
      adapter: { protocolId: 'mock', consume: async () => {} },
      loadSatellite: async () => ({ success: true }),
      unloadSatellite: async () => ({ success: true }),
      getScoeStatistics: () => ({
        commandReceiveCount: 0,
        commandSuccessCount: 0,
        commandErrorCount: 0,
        runtimeSeconds: 0,
        satelliteIdRuntimeSeconds: 0,
        lastErrorReason: '',
      }),
      getScoeRuntimeStatus: () => ({
        loadedSatelliteId: '',
        scoeFramesLoaded: false,
        healthStatus: 'unknown',
        linkTestResult: 'unknown',
        lastCommandCode: '',
        receiveCommandSuccess: false,
      }),
      getLoadedSatelliteId: () => '',
      isScoeFramesLoaded: () => false,
      getCommandLog: () => [],
      clearCommandLog: () => {},
      getTestDataRecorder: () => ({ record: () => {}, getRecords: () => [], clear: () => {} }),
      sendTestData: async () => {},
      dispose: () => {},
    },
    receiveEventSourceBridge: bridge,
  } as RewriteWiredFeatures;
}
