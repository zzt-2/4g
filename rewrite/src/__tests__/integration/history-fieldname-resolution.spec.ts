/**
 * v2 acceptance scenario 10 (design 5.6): history fieldName resolution.
 *
 * H015:数据源切到录制 .bin 后,fieldName 来自录制时内嵌的帧定义(recording-reader
 * 解析时就带 fieldName/frameName),不再需要外部 frameReader lookup(R19 静态元数据
 * 不从运行时数据流解析,不泄漏 raw frameId/UUID)。旧 StorageLocalRecord 数据源废弃。
 *
 * 本测试验证新模型下:useHistoryData 从录制 .bin 加载,fieldName 用内嵌帧定义的 name,
 * charts 按 ChartSelectedItem(frameId/fieldId)反查 loadedSeries。
 */
import { describe, it, expect } from 'vitest';
import { useHistoryData } from '@/pages/history/useHistoryData';
import type { DisplayService } from '@/features/display';
import type { RecordingService } from '@/features/recording';
import type { RecordingFileMeta, RecordingReadResult } from '@/shared/platform-bridge';
import {
  encodeFileHeader,
  encodeFrameDefinitionBlock,
  encodeFrameRecord,
  type FrameDefinitionEntry,
} from '@/features/recording/core/serialization';
import type { FrameAsset } from '@/features/frame';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** 造一个含单字段帧的 .bin 字节(带内嵌帧定义)。 */
function buildBinWithFrame(
  frame: FrameAsset,
  records: ReadonlyArray<{ capturedAt: number; bytes: number[] }>,
): Uint8Array {
  const defEntries: FrameDefinitionEntry[] = [
    { frameId: frame.id, frameAssetJson: JSON.stringify(frame) },
  ];
  return Buffer.concat([
    encodeFileHeader(),
    encodeFrameDefinitionBlock(defEntries),
    ...records.map((r) => encodeFrameRecord({ capturedAt: r.capturedAt, frameId: frame.id, bytes: r.bytes })),
  ]);
}

interface FakeRecordingInput {
  files?: ReadonlyArray<{ meta: RecordingFileMeta; bytes: Uint8Array }>;
}

function createFakeRecordingService(input: FakeRecordingInput = {}): RecordingService {
  const files = input.files ?? [];
  return {
    getSnapshot: () => ({ isRecording: false, recordCount: 0, stats: null }) as never,
    getSelectedFrameIds: () => new Set<string>(),
    isRecording: () => false,
    setConfig: () => {},
    getConfig: () => ({ selectedFrameIds: [], maxFileSizeMb: 50, enableRotation: true, rotationCount: 3 }) as never,
    start: async () => {},
    stop: async () => {},
    appendFrames: async () => {},
    refreshStats: async () => {},
    listRecordingFiles: async () => files.map((f) => f.meta),
    readRecordingFile: async (filePath: string): Promise<RecordingReadResult> => {
      const found = files.find((f) => f.meta.filePath === filePath);
      if (!found) return { bytes: [], ok: false, error: 'not found' };
      return { bytes: Array.from(found.bytes), ok: true };
    },
  } as unknown as RecordingService;
}

function createFakeDisplay(selectedItems: readonly { groupId: string; frameId: string; fieldId: string }[]): DisplayService {
  const base = {
    getPreferences: () => ({
      charts: [{ id: 'chart-1', title: 'Chart 1', selectedItems, yAxis: { autoScale: true }, performance: { maxPoints: 100, refreshIntervalMs: 200 } }],
    }),
  };
  return base as unknown as DisplayService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('v2 acceptance scenario 10: history fieldName resolution (H015 recording .bin)', () => {
  // mtimeMs 用当前时间(useHistoryData 默认 timeRange 是"现在往前 1 小时")
  const NOW_MS = Date.now();

  it('resolves fieldName from embedded frame def (R19: no raw fieldId leak)', async () => {
    // 帧定义内嵌:field id='voltage', name='Voltage'(R19:用 name 不泄漏 raw id)
    const frame: FrameAsset = {
      id: 'f1',
      name: 'Power Frame',
      direction: 'receive',
      fields: [
        { id: 'voltage', name: 'Voltage', dataType: 'uint8', length: 1, inputType: 'manual', configurable: false, options: [], dataParticipationType: 'direct' },
      ],
    };
    const bytes = buildBinWithFrame(frame, [{ capturedAt: 1000, bytes: [0x2a] }]); // 0x2a = 42
    const recordingService = createFakeRecordingService({
      files: [{ meta: { fileName: 'rec_1.bin', filePath: '/r/rec_1.bin', byteLength: bytes.length, mtimeMs: NOW_MS }, bytes }],
    });
    const display = createFakeDisplay([
      { groupId: 'g1', frameId: 'f1', fieldId: 'voltage' },
    ]);

    const history = useHistoryData(recordingService, display);
    await history.loadData();

    const series = history.enrichedCharts.value[0].series;
    expect(series).toHaveLength(1);
    // R19:fieldName 是内嵌帧定义的 name('Voltage'),不是 raw fieldId('voltage')
    expect(series[0].fieldName).toBe('Voltage');
    expect(series[0].points).toHaveLength(1);
    expect(series[0].points[0].value).toBe(42);
  });

  it('hierarchy label uses embedded frame name (R19: no raw frameId/UUID leak)', async () => {
    const frame: FrameAsset = {
      id: 'f1',
      name: 'Telemetry',
      direction: 'receive',
      fields: [
        { id: 'v', name: 'Value', dataType: 'uint8', length: 1, inputType: 'manual', configurable: false, options: [], dataParticipationType: 'direct' },
      ],
    };
    const bytes = buildBinWithFrame(frame, [{ capturedAt: 1, bytes: [0x01] }]);
    const recordingService = createFakeRecordingService({
      files: [{ meta: { fileName: 'rec_1.bin', filePath: '/r/rec_1.bin', byteLength: bytes.length, mtimeMs: NOW_MS }, bytes }],
    });
    const display = createFakeDisplay([]);

    const history = useHistoryData(recordingService, display);
    await history.loadData();

    expect(history.itemHierarchy.value).toHaveLength(1);
    // R19:hierarchy group label 用帧名,不是 raw frameId
    expect(history.itemHierarchy.value[0].label).toBe('Telemetry');
    expect(history.itemHierarchy.value[0].groupId).toBe('f1');
  });

  it('chart with selectedItems not in loaded data renders no series (no crash)', async () => {
    const frame: FrameAsset = {
      id: 'f1',
      name: 'F',
      direction: 'receive',
      fields: [
        { id: 'v', name: 'V', dataType: 'uint8', length: 1, inputType: 'manual', configurable: false, options: [], dataParticipationType: 'direct' },
      ],
    };
    const bytes = buildBinWithFrame(frame, [{ capturedAt: 1, bytes: [0x01] }]);
    const recordingService = createFakeRecordingService({
      files: [{ meta: { fileName: 'rec_1.bin', filePath: '/r/rec_1.bin', byteLength: bytes.length, mtimeMs: NOW_MS }, bytes }],
    });
    // 选了一个加载的数据里没有的 frame/field → 不崩,series 为空
    const display = createFakeDisplay([
      { groupId: 'g', frameId: 'ghost', fieldId: 'nope' },
    ]);

    const history = useHistoryData(recordingService, display);
    await history.loadData();

    expect(history.enrichedCharts.value[0].series).toEqual([]);
  });
});
