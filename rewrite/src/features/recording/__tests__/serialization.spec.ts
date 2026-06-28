import { describe, it, expect } from 'vitest';
import {
  RECORDING_FILE_MAGIC,
  encodeFileHeader,
  encodeFrameRecord,
  decodeFrameRecords,
  encodeFrameDefinitions,
  decodeFrameDefinitions,
  encodeFrameDefinitionBlock,
  type FrameDefinitionEntry,
} from '../core/serialization';

describe('recording serialization', () => {
  it('encodes and decodes file header + single frame round-trip', () => {
    const header = encodeFileHeader();
    expect(header.length).toBe(4);
    expect(Array.from(header)).toEqual([0x52, 0x43, 0x44, 0x31]); // 'R','C','D','1'
    expect(RECORDING_FILE_MAGIC).toBe('RCD1');

    const capturedAt = 1_718_000_000;
    const frameId = 'frame-001';
    const bytes = [0x1a, 0x2b, 0x3c];
    const record = encodeFrameRecord({ capturedAt, frameId, bytes });

    const full = Buffer.concat([header, record]);
    const decoded = decodeFrameRecords(full.subarray(4)); // skip magic
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toEqual({ capturedAt, frameId, bytes });
  });

  it('handles empty frameId and empty bytes', () => {
    const record = encodeFrameRecord({ capturedAt: 100, frameId: '', bytes: [] });
    const decoded = decodeFrameRecords(record);
    expect(decoded).toEqual([{ capturedAt: 100, frameId: '', bytes: [] }]);
  });

  it('decodes multiple frames in sequence', () => {
    const r1 = encodeFrameRecord({ capturedAt: 1, frameId: 'a', bytes: [1] });
    const r2 = encodeFrameRecord({ capturedAt: 2, frameId: 'b', bytes: [2, 3] });
    const decoded = decodeFrameRecords(Buffer.concat([r1, r2]));
    expect(decoded).toHaveLength(2);
    expect(decoded[1].bytes).toEqual([2, 3]);
  });

  it('discards truncated tail (incomplete record)', () => {
    const full = encodeFrameRecord({ capturedAt: 1, frameId: 'a', bytes: [1, 2] });
    const truncated = full.subarray(0, full.length - 1); // 砍掉最后 1 字节
    const decoded = decodeFrameRecords(truncated);
    expect(decoded).toEqual([]); // 整帧不完整,丢弃
  });

  it('rejects frameId exceeding uint16 max', () => {
    expect(() =>
      encodeFrameRecord({ capturedAt: 1, frameId: 'x'.repeat(0x10000), bytes: [] }),
    ).toThrow(/frameId too long/);
  });

  it('round-trips a large frame (bytes near uint16 max)', () => {
    const big = Array.from({ length: 0xffff }, (_, i) => i & 0xff);
    const record = encodeFrameRecord({ capturedAt: 42, frameId: 'big', bytes: big });
    const decoded = decodeFrameRecords(record);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].bytes).toHaveLength(0xffff);
    expect(decoded[0].capturedAt).toBe(42);
  });
});

describe('recording frame-definition block', () => {
  // 帧定义块(spec §三.1):session 开始时一次性写,内嵌当时帧定义防漂移。
  // 布局: [uint16 count][count × (uint16 frameIdLen + frameId + uint32 jsonLen + json)]
  // 外层由 encodeFrameDefinitionBlock 包 uint32 frameDefBlockLen(总长,不含本字段)。

  it('encodes and decodes frame definitions round-trip', () => {
    const defs: FrameDefinitionEntry[] = [
      {
        frameId: 'frame-001',
        frameAssetJson: '{"id":"frame-001","name":"Status","direction":"receive","fields":[]}',
      },
      {
        frameId: 'wt-status',
        frameAssetJson: '{"id":"wt-status","name":"WT","direction":"receive","fields":[{"id":"f1","dataType":"uint8"}]}',
      },
    ];
    const encoded = encodeFrameDefinitions(defs);
    const decoded = decodeFrameDefinitions(encoded);
    expect(decoded).toEqual(defs);
  });

  it('handles empty frame-definition set (count=0, 2 bytes)', () => {
    const encoded = encodeFrameDefinitions([]);
    expect(encoded.length).toBe(2);
    expect(decodeFrameDefinitions(encoded)).toEqual([]);
  });

  it('handles frameId with multi-byte utf8 and large json', () => {
    const largeJson = '{"id":"x","fields":[' + '"a",'.repeat(500) + '"end"]}';
    const defs: FrameDefinitionEntry[] = [
      { frameId: '帧-测试', frameAssetJson: largeJson },
    ];
    const encoded = encodeFrameDefinitions(defs);
    const decoded = decodeFrameDefinitions(encoded);
    expect(decoded[0].frameId).toBe('帧-测试');
    expect(decoded[0].frameAssetJson).toBe(largeJson);
  });

  it('encodeFrameDefinitionBlock prefixes uint32 total length', () => {
    const defs: FrameDefinitionEntry[] = [
      { frameId: 'f', frameAssetJson: '{}' },
    ];
    const block = encodeFrameDefinitionBlock(defs);
    // 前 4 字节 = uint32 total length = 内层长度(count 2 + frameIdLen 2 + "f" 1 + jsonLen 4 + "{}" 2 = 11)
    const innerLen = block.readUInt32LE(0);
    expect(innerLen).toBe(11);
    expect(block.length).toBe(4 + innerLen);
    // 内层能被 decodeFrameDefinitions 解开
    const inner = block.subarray(4);
    expect(inner.length).toBe(innerLen);
    expect(decodeFrameDefinitions(inner)).toEqual(defs);
  });

  it('rejects frameId exceeding uint16 max length', () => {
    const defs: FrameDefinitionEntry[] = [
      { frameId: 'x'.repeat(0x10000), frameAssetJson: '{}' },
    ];
    expect(() => encodeFrameDefinitions(defs)).toThrow(/frameId too long/);
  });

  it('decodeFrameDefinitions throws on truncated block (missing count)', () => {
    expect(() => decodeFrameDefinitions(Buffer.from([0x00]))).toThrow(/truncated/);
  });

  it('decodeFrameDefinitions throws on truncated entry (json shorter than declared)', () => {
    // count=1, frameIdLen=1, frameId='f', jsonLen=100 但无 json 字节
    const bad = Buffer.concat([
      Buffer.from([0x01, 0x00]), // count = 1
      Buffer.from([0x01, 0x00]), // frameIdLen = 1
      Buffer.from('f', 'utf8'),
      Buffer.from([0x64, 0x00, 0x00, 0x00]), // jsonLen = 100
    ]);
    expect(() => decodeFrameDefinitions(bad)).toThrow(/truncated/);
  });
});
