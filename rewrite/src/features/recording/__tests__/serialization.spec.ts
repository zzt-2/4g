import { describe, it, expect } from 'vitest';
import {
  RECORDING_FILE_MAGIC,
  encodeFileHeader,
  encodeFrameRecord,
  decodeFrameRecords,
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
