import { describe, it, expect } from 'vitest';
import {
  parseRecordingFileBytes,
  parseRecordingToFieldSeries,
} from '../services/recording-reader';
import {
  encodeFileHeader,
  encodeFrameDefinitionBlock,
  encodeFrameRecord,
  type FrameDefinitionEntry,
} from '../core/serialization';
import type { FrameAsset } from '@/features/frame';

// 最小可解析的接收帧:uint8 字段 f1,offset 0 length 1。
const TEST_FRAME: FrameAsset = {
  id: 'tf',
  name: 'Test',
  direction: 'receive',
  fields: [
    {
      id: 'f1',
      name: 'Value',
      dataType: 'uint8',
      length: 1,
      inputType: 'manual',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
    },
  ],
};

function buildBinFile(records: { capturedAt: number; bytes: number[] }[]): Uint8Array {
  const defEntries: FrameDefinitionEntry[] = [
    { frameId: 'tf', frameAssetJson: JSON.stringify(TEST_FRAME) },
  ];
  const parts = [
    encodeFileHeader(),
    encodeFrameDefinitionBlock(defEntries),
    ...records.map((r) => encodeFrameRecord({ capturedAt: r.capturedAt, frameId: 'tf', bytes: r.bytes })),
  ];
  return Buffer.concat(parts);
}

describe('recording-reader parseRecordingFileBytes', () => {
  it('parses magic + frame-def block + records', () => {
    const bytes = buildBinFile([
      { capturedAt: 1000, bytes: [0x2a] },
      { capturedAt: 2000, bytes: [0x3b] },
    ]);
    const content = parseRecordingFileBytes(bytes);
    expect(content.frameDefs.has('tf')).toBe(true);
    expect(content.records).toHaveLength(2);
    expect(content.records[0]).toEqual({ capturedAt: 1000, frameId: 'tf', bytes: [0x2a] });
  });

  it('embedded frame def does not depend on external frameReader (anti-drift)', () => {
    // 帧定义内嵌在文件里,parseRecordingFileBytes 不读任何外部 frameReader
    const bytes = buildBinFile([{ capturedAt: 1, bytes: [0x01] }]);
    const content = parseRecordingFileBytes(bytes);
    const def = content.frameDefs.get('tf');
    expect(def).toBeDefined();
    expect(def?.name).toBe('Test');
    expect(def?.fields[0].id).toBe('f1');
  });

  it('throws on bad magic', () => {
    expect(() => parseRecordingFileBytes(Buffer.from('XXXX', 'ascii'))).toThrow(/not a recording|bad magic/i);
  });

  it('throws on old-format file (no frame-def block)', () => {
    // 老 RCD1:只 magic + 帧记录,无帧定义块
    const oldBytes = Buffer.concat([
      encodeFileHeader(),
      encodeFrameRecord({ capturedAt: 1, frameId: 'tf', bytes: [0x01] }),
    ]);
    expect(() => parseRecordingFileBytes(oldBytes)).toThrow(/frame-def|old format/i);
  });

  it('skips a single corrupt frame-def json without failing whole file', () => {
    // 构造一个含坏 JSON 条目的帧定义块:count=1,但 json 是非法 JSON
    const badJsonEntry: FrameDefinitionEntry[] = [
      { frameId: 'bad', frameAssetJson: '{not valid json' },
    ];
    const bytes = Buffer.concat([
      encodeFileHeader(),
      encodeFrameDefinitionBlock(badJsonEntry),
    ]);
    const content = parseRecordingFileBytes(bytes);
    // 坏条目被跳过,frameDefs 为空但不抛错
    expect(content.frameDefs.size).toBe(0);
    expect(content.records).toEqual([]);
  });
});

describe('recording-reader parseRecordingToFieldSeries', () => {
  it('parses frame records into field time-series using embedded def', () => {
    const bytes = buildBinFile([
      { capturedAt: 1000, bytes: [0x2a] },
      { capturedAt: 2000, bytes: [0x3b] },
    ]);
    const content = parseRecordingFileBytes(bytes);
    const series = parseRecordingToFieldSeries(content, ['tf']);
    expect(series).toHaveLength(1); // 1 帧
    expect(series[0].frameId).toBe('tf');
    expect(series[0].fields).toHaveLength(1); // f1
    const f1 = series[0].fields[0];
    expect(f1.fieldId).toBe('f1');
    expect(f1.fieldName).toBe('Value');
    expect(f1.points).toEqual([
      { capturedAt: 1000, value: 0x2a },
      { capturedAt: 2000, value: 0x3b },
    ]);
  });

  it('returns empty when selected frameId not in file', () => {
    const bytes = buildBinFile([{ capturedAt: 1, bytes: [0x01] }]);
    const content = parseRecordingFileBytes(bytes);
    const series = parseRecordingToFieldSeries(content, ['other-frame']);
    expect(series).toEqual([]);
  });

  it('skips records whose frameId has no embedded def', () => {
    // 文件里有 tf 帧记录,但帧定义块里没有 tf(漂移场景的兜底)
    const defEntries: FrameDefinitionEntry[] = [
      { frameId: 'other', frameAssetJson: JSON.stringify({ ...TEST_FRAME, id: 'other' }) },
    ];
    const bytes = Buffer.concat([
      encodeFileHeader(),
      encodeFrameDefinitionBlock(defEntries),
      encodeFrameRecord({ capturedAt: 1, frameId: 'tf', bytes: [0x01] }),
    ]);
    const content = parseRecordingFileBytes(bytes);
    // 选 tf,但 tf 没有内嵌定义 → 跳过,返回空
    const series = parseRecordingToFieldSeries(content, ['tf']);
    expect(series).toEqual([]);
  });

  it('sorts points by capturedAt ascending', () => {
    const bytes = buildBinFile([
      { capturedAt: 3000, bytes: [0x03] },
      { capturedAt: 1000, bytes: [0x01] },
      { capturedAt: 2000, bytes: [0x02] },
    ]);
    const content = parseRecordingFileBytes(bytes);
    const series = parseRecordingToFieldSeries(content, ['tf']);
    expect(series[0].fields[0].points.map((p) => p.capturedAt)).toEqual([1000, 2000, 3000]);
  });

  it('parses multiple frames into separate series', () => {
    const frameA: FrameAsset = { ...TEST_FRAME, id: 'a', name: 'A' };
    const frameB: FrameAsset = { ...TEST_FRAME, id: 'b', name: 'B' };
    const defEntries: FrameDefinitionEntry[] = [
      { frameId: 'a', frameAssetJson: JSON.stringify(frameA) },
      { frameId: 'b', frameAssetJson: JSON.stringify(frameB) },
    ];
    const bytes = Buffer.concat([
      encodeFileHeader(),
      encodeFrameDefinitionBlock(defEntries),
      encodeFrameRecord({ capturedAt: 1, frameId: 'a', bytes: [0x0a] }),
      encodeFrameRecord({ capturedAt: 2, frameId: 'b', bytes: [0x0b] }),
      encodeFrameRecord({ capturedAt: 3, frameId: 'a', bytes: [0x0c] }),
    ]);
    const content = parseRecordingFileBytes(bytes);
    const series = parseRecordingToFieldSeries(content, ['a', 'b']);
    expect(series).toHaveLength(2);
    const frameIds = series.map((s) => s.frameId).sort();
    expect(frameIds).toEqual(['a', 'b']);
  });
});
