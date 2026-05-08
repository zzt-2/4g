import { describe, expect, it, vi } from 'vitest';
import { createRewriteRuntime } from '../index';
import type { FrameAssetReader } from '@/features/frame';
import type {
  SettingsOperationResult,
  SettingsResetScope,
  SettingsService,
} from '@/features/settings';
import type { StorageLocalReader } from '@/features/storage-local-baseline';
import { createFakeConnectionTransportAdapter } from '@/features/connection';

function createSettingsResult(scope: SettingsResetScope): SettingsOperationResult {
  return {
    ok: true,
    validation: {
      valid: true,
      issues:
        scope === 'recording'
          ? [
              {
                severity: 'warning',
                code: 'settings.recordingReset',
                path: 'recording',
                message: 'recording reset',
              },
            ]
          : [],
    },
    snapshot: {
      schemaVersion: 1,
      recording: {
        autoStartRecording: false,
        csvDefaultOutputPath: '',
        csvSaveIntervalMinutes: 1,
      },
    },
  };
}

function createFrameReader(): Pick<FrameAssetReader, 'getSelectedFrame' | 'listFrames'> {
  return {
    getSelectedFrame: () => ({
      id: 'frame-a',
      name: '帧 A',
      direction: 'send',
      fields: [
        {
          id: 'field-a',
          name: '字段 A',
          dataType: 'uint8',
          length: 1,
          inputType: 'input',
          configurable: false,
          options: [],
          dataParticipationType: 'direct',
        },
      ],
    }),
    listFrames: () => [
      {
        id: 'frame-a',
        name: '帧 A',
        direction: 'send',
        fieldCount: 1,
        isFavorite: false,
      },
      {
        id: 'frame-b',
        name: '帧 B',
        direction: 'receive',
        fieldCount: 2,
        isFavorite: true,
      },
    ],
  };
}

function createSettingsService(): Pick<SettingsService, 'getRecordingSettings' | 'reset'> {
  return {
    getRecordingSettings: () => ({
      autoStartRecording: true,
      csvDefaultOutputPath: 'D:/dongfanghong/csv',
      csvSaveIntervalMinutes: 5,
    }),
    reset: (scope = 'all') => createSettingsResult(scope),
  };
}

function createStorageReader(): Pick<
  StorageLocalReader,
  | 'getLastIssue'
  | 'listCsvMaterials'
  | 'listHistoryHours'
  | 'listLegacyMaterials'
  | 'listLocalRecords'
> {
  return {
    getLastIssue: () => ({ code: 'adapter.missing', message: 'missing material' }),
    listCsvMaterials: () => [
      {
        id: 'csv-a',
        name: 'CSV A',
        generatedAt: '2026-05-04T00:00:00.000Z',
        recordCount: 2,
        columnCount: 3,
      },
    ],
    listHistoryHours: () => [
      {
        hourKey: '2026-05-04T00',
        recordCount: 2,
        firstCapturedAt: '2026-05-04T00:00:00.000Z',
        lastCapturedAt: '2026-05-04T00:10:00.000Z',
      },
    ],
    listLegacyMaterials: () => [
      {
        key: 'legacy-a',
        itemCount: 3,
        acceptedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
    listLocalRecords: () => [
      {
        id: 'record-a',
        capturedAt: '2026-05-04T00:00:00.000Z',
        source: 'local',
        channel: 'telemetry-a',
        fields: [{ key: 'temperature', value: 20.5 }],
      },
      {
        id: 'record-b',
        capturedAt: '2026-05-04T00:10:00.000Z',
        source: 'manual',
        channel: 'telemetry-a',
        fields: [{ key: 'voltage', value: 3.3 }],
      },
    ],
  };
}

describe('rewrite runtime composition helper', () => {
  it('composes read-only overview snapshots from feature root public ports', () => {
    const runtime = createRewriteRuntime({
      frameReader: createFrameReader(),
      settingsService: createSettingsService(),
      storageReader: createStorageReader(),
    });

    expect(runtime.getOverviewSnapshot()).toEqual({
      frame: {
        totalFrames: 2,
        totalFields: 3,
        selectedFrameName: '帧 A',
      },
      settings: {
        autoStartRecording: true,
        csvDefaultOutputPath: 'D:/dongfanghong/csv',
        csvSaveIntervalMinutes: 5,
      },
      storage: {
        localRecordCount: 2,
        historyHourCount: 1,
        csvMaterialCount: 1,
        legacyMaterialCount: 1,
        lastIssue: {
          code: 'adapter.missing',
          message: 'missing material',
        },
      },
    });
  });

  it('routes settings reset through the settings public service result', () => {
    const runtime = createRewriteRuntime({
      settingsService: createSettingsService(),
    });

    expect(runtime.resetSettings('recording')).toEqual({
      ok: true,
      issues: [
        {
          severity: 'warning',
          code: 'settings.recordingReset',
          message: 'recording reset',
        },
      ],
    });
  });

  it('creates default readers without platform, feature internals, or stored runtime truth', () => {
    const runtime = createRewriteRuntime();

    expect(runtime.getOverviewSnapshot()).toEqual({
      frame: {
        totalFrames: 0,
        totalFields: 0,
        selectedFrameName: null,
      },
      settings: {
        autoStartRecording: true,
        csvDefaultOutputPath: '',
        csvSaveIntervalMinutes: 5,
      },
      storage: {
        localRecordCount: 0,
        historyHourCount: 0,
        csvMaterialCount: 0,
        legacyMaterialCount: 0,
        lastIssue: null,
      },
    });
  });

  it('calls connectionService.cleanup and bridge.clear on destroy', async () => {
    const adapter = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: adapter });

    const cleanupSpy = vi.spyOn(runtime.features.connectionService, 'cleanup');
    const clearSpy = vi.spyOn(runtime.features.receiveEventSourceBridge, 'clear');

    runtime.destroy();

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    // Idempotent: second call is a no-op
    runtime.destroy();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('exposes wired features and routingTick method', () => {
    const adapter = createFakeConnectionTransportAdapter();
    const runtime = createRewriteRuntime({ connectionAdapter: adapter });

    expect(runtime.features).toBeDefined();
    expect(runtime.features.frameReader).toBeDefined();
    expect(runtime.features.connectionService).toBeDefined();
    expect(runtime.features.receiveService).toBeDefined();
    expect(runtime.features.sendService).toBeDefined();
    expect(runtime.features.taskService).toBeDefined();
    expect(runtime.features.receiveEventSourceBridge).toBeDefined();
    expect(typeof runtime.routingTick).toBe('function');
  });
});
