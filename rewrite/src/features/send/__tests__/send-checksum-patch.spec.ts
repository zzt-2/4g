import { describe, it, expect } from 'vitest';
import {
  checksumCrc32,
  checksumSum32,
  checksumSum16,
  calculateChecksum,
  applyBuildPostPatch,
} from '../core/checksum';
import type { SendFieldEncodingDef } from '../core/types';

// --- Fixture helpers ---

function makeField(
  overrides: Partial<SendFieldEncodingDef> & { id: string },
): SendFieldEncodingDef {
  return {
    dataType: 'uint8',
    length: 1,
    bigEndian: false,
    isASCII: false,
    offset: 0,
    factor: 1,
    configurable: false,
    ...overrides,
  };
}

// --- CRC32 ---

describe('checksumCrc32', () => {
  it('computes CRC32 for known input', () => {
    // CRC32("123456789") = 0xCBF43926
    const bytes = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
    expect(checksumCrc32(bytes)).toBe(0xcbf43926);
  });

  it('returns 0x00000000 for empty array', () => {
    expect(checksumCrc32([])).toBe(0x00000000);
  });

  it('computes CRC32 for single byte', () => {
    // CRC32(0x00) = 0xD202EF8D
    expect(checksumCrc32([0x00])).toBe(0xd202ef8d);
  });
});

// --- checksumSum32 ---

describe('checksumSum32', () => {
  it('sums 4B words big-endian', () => {
    // Two words: 0x00000001 + 0x00000002 = 3
    expect(checksumSum32([0, 0, 0, 1, 0, 0, 0, 2], true)).toBe(3);
  });

  it('sums 4B words little-endian', () => {
    // Two words: 0x00000001 + 0x00000002 = 3
    expect(checksumSum32([1, 0, 0, 0, 2, 0, 0, 0], false)).toBe(3);
  });

  it('big-endian and little-endian produce different results for same bytes', () => {
    const bytes = [0x01, 0x02, 0x03, 0x04];
    const be = checksumSum32(bytes, true);
    const le = checksumSum32(bytes, false);
    // BE: 0x01020304 = 16909060
    expect(be).toBe(0x01020304);
    // LE: 0x04030201 = 67305985
    expect(le).toBe(0x04030201);
    expect(be).not.toBe(le);
  });

  it('masks overflow to unsigned 32-bit via >>> 0', () => {
    // Two words of 0xFFFFFFFF = 0x1FFFFFFFE → >>> 0 = 0xFFFFFFFE
    const bytes = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    const result = checksumSum32(bytes, true);
    expect(result).toBe(0xfffffffe);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });

  it('returns 0 for empty array', () => {
    expect(checksumSum32([], true)).toBe(0);
    expect(checksumSum32([], false)).toBe(0);
  });

  it('defaults to little-endian when bigEndian omitted', () => {
    expect(checksumSum32([1, 0, 0, 0])).toBe(1);
    // BE would be 0x01000000 = 16777216
    expect(checksumSum32([1, 0, 0, 0])).not.toBe(0x01000000);
  });
});

// --- checksumSum16 ---

describe('checksumSum16', () => {
  it('sums 2B words big-endian', () => {
    // Two words: 0x0001 + 0x0002 = 3
    expect(checksumSum16([0, 1, 0, 2], true)).toBe(3);
  });

  it('sums 2B words little-endian', () => {
    // Two words: 0x0001 + 0x0002 = 3
    expect(checksumSum16([1, 0, 2, 0], false)).toBe(3);
  });

  it('big-endian and little-endian produce different results for same bytes', () => {
    const bytes = [0x12, 0x34];
    const be = checksumSum16(bytes, true);
    const le = checksumSum16(bytes, false);
    expect(be).toBe(0x1234);
    expect(le).toBe(0x3412);
    expect(be).not.toBe(le);
  });

  it('masks overflow to unsigned 16-bit via & 0xffff', () => {
    // Three words of 0xFFFF = 0x2FFFD → & 0xffff = 0xFFFD
    const bytes = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    const result = checksumSum16(bytes, true);
    expect(result).toBe(0xfffd);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
  });

  it('returns 0 for empty array', () => {
    expect(checksumSum16([], true)).toBe(0);
    expect(checksumSum16([], false)).toBe(0);
  });

  it('defaults to little-endian when bigEndian omitted', () => {
    expect(checksumSum16([1, 0])).toBe(1);
    // BE would be 0x0100 = 256
    expect(checksumSum16([1, 0])).not.toBe(0x0100);
  });
});

// --- calculateChecksum with range and new kinds ---

describe('calculateChecksum', () => {
  it('supports crc16 kind (alias for crc16-modbus)', () => {
    const bytes = [0x01, 0x02, 0x03];
    expect(calculateChecksum(bytes, 'crc16')).toBe(
      calculateChecksum(bytes, 'crc16-modbus'),
    );
  });

  it('supports crc32 kind', () => {
    const bytes = [0x01, 0x02, 0x03];
    expect(calculateChecksum(bytes, 'crc32')).toBe(checksumCrc32(bytes));
  });

  it('slices bytes when options provided', () => {
    const bytes = [0x01, 0x02, 0x03, 0x04, 0x05];
    const expected = calculateChecksum([0x02, 0x03, 0x04], 'sum8');
    expect(calculateChecksum(bytes, 'sum8', { startIdx: 1, endIdx: 4 })).toBe(
      expected,
    );
  });

  it('preserves existing behavior without options', () => {
    const bytes = [0x01, 0x02, 0x03];
    expect(calculateChecksum(bytes, 'sum8')).toBe(0x06);
    expect(calculateChecksum(bytes, 'xor8')).toBe(0x00);
    expect(calculateChecksum(bytes, 'crc16-modbus')).toBe(
      calculateChecksum(bytes, 'crc16-modbus'),
    );
  });

  it('returns 0 for unknown kind', () => {
    expect(calculateChecksum([0x01], 'unknown')).toBe(0);
  });

  it('dispatches sum32 with bigEndian option', () => {
    const bytes = [0, 0, 0, 1, 0, 0, 0, 2];
    expect(calculateChecksum(bytes, 'sum32', { bigEndian: true })).toBe(
      checksumSum32(bytes, true),
    );
    expect(calculateChecksum(bytes, 'sum32', { bigEndian: true })).toBe(3);
  });

  it('dispatches sum16 with bigEndian option', () => {
    const bytes = [0, 1, 0, 2];
    expect(calculateChecksum(bytes, 'sum16', { bigEndian: true })).toBe(
      checksumSum16(bytes, true),
    );
    expect(calculateChecksum(bytes, 'sum16', { bigEndian: true })).toBe(3);
  });

  it('sum32/sum16 default to little-endian without options', () => {
    const bytes = [1, 0, 0, 0];
    expect(calculateChecksum(bytes, 'sum32')).toBe(checksumSum32(bytes, false));
    expect(calculateChecksum(bytes, 'sum32')).toBe(1);
  });

  it('preserves sum32/sum16 slicing', () => {
    const bytes = [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 1, 0, 0, 0, 2];
    const sliced = bytes.slice(4);
    expect(calculateChecksum(bytes, 'sum32', { startIdx: 4, bigEndian: true })).toBe(
      checksumSum32(sliced, true),
    );
  });
});

// --- applyBuildPostPatch ---

describe('applyBuildPostPatch', () => {
  it('SC9: auto checksum with isChecksum field', () => {
    // 3 fields: header(1 byte), checksum(1 byte), data(1 byte)
    // checksum covers header + data (fields index 0..2)
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'header', offset: 0, length: 1 }),
      makeField({
        id: 'checksum',
        offset: 1,
        length: 1,
        dataType: 'uint8',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 2,
          checksumMethod: 'sum8',
        },
      }),
      makeField({ id: 'data', offset: 2, length: 1 }),
    ];

    const buffer = new Uint8Array([0x0a, 0x00, 0x14]);
    const result = applyBuildPostPatch(buffer, fields, {
      autoChecksum: true,
    });

    // sum8 of [0x0a, 0x14] = 0x1e, checksum is at offset 1
    expect(result.buffer[1]).toBe(0x1e);
    expect(result.issues).toHaveLength(0);
    // Original buffer not mutated
    expect(buffer[1]).toBe(0x00);
  });

  it('SC10: auto length with includeLengthField', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'length', offset: 0, length: 2, dataType: 'uint16', bigEndian: false }),
      makeField({ id: 'data', offset: 2, length: 3 }),
    ];

    const buffer = new Uint8Array(5); // total 5 bytes
    const result = applyBuildPostPatch(buffer, fields, {
      includeLengthField: true,
      lengthFieldId: 'length',
    });

    // Length should be 5, written as little-endian uint16 at offset 0
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset, 2);
    expect(view.getUint16(0, true)).toBe(5);
    expect(result.issues).toHaveLength(0);
  });

  it('SC15: CRC32 checksum method', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 4 }),
      makeField({
        id: 'crc',
        offset: 4,
        length: 4,
        dataType: 'uint32',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'crc32',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    const expectedCrc = checksumCrc32([0x01, 0x02, 0x03, 0x04]);
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 4, 4);
    expect(view.getUint32(0, true)).toBe(expectedCrc);
    expect(result.issues).toHaveLength(0);
  });

  it('SC16: checksum overflow returns build-error', () => {
    // Checksum field is uint8 (1 byte), but CRC16 result exceeds 0xFF
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 2 }),
      makeField({
        id: 'chk',
        offset: 2,
        length: 1,
        dataType: 'uint8',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'crc16',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x02, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.checksumOverflow');
    expect(result.issues[0]!.severity).toBe('error');
    // Buffer not modified for overflow case
    expect(result.buffer[2]).toBe(0x00);
  });

  it('SC17: includeLengthField=true but lengthFieldId missing returns warning', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 4 }),
    ];
    const buffer = new Uint8Array(4);

    const result = applyBuildPostPatch(buffer, fields, {
      includeLengthField: true,
      // lengthFieldId not set
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.lengthFieldIdMissing');
    expect(result.issues[0]!.severity).toBe('warning');
  });

  it('no autoChecksum does not perform checksum backfill', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 1 }),
      makeField({
        id: 'chk',
        offset: 1,
        length: 1,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum8',
        },
      }),
    ];

    const buffer = new Uint8Array([0x0a, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, {});

    expect(result.buffer[1]).toBe(0x00);
    expect(result.issues).toHaveLength(0);
  });

  it('no frameOptions does nothing', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 2 }),
    ];
    const buffer = new Uint8Array([0x01, 0x02]);

    const result = applyBuildPostPatch(buffer, fields);

    expect(result.buffer[0]).toBe(0x01);
    expect(result.buffer[1]).toBe(0x02);
    expect(result.issues).toHaveLength(0);
  });

  it('endFieldIndex boundary is correct (inclusive)', () => {
    // fields: [f0(offset=0,len=1), f1(offset=1,len=1), f2(offset=2,len=2)]
    // checksum field is f2, covers f0..f1 (startFieldIndex=0, endFieldIndex=1)
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'f0', offset: 0, length: 1 }),
      makeField({ id: 'f1', offset: 1, length: 1 }),
      makeField({
        id: 'chk',
        offset: 2,
        length: 1,
        dataType: 'uint8',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum8',
        },
      }),
    ];

    const buffer = new Uint8Array([0x10, 0x20, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    // sum8 of bytes at f0..f1 inclusive = 0x10 + 0x20 = 0x30
    expect(result.buffer[2]).toBe(0x30);
    expect(result.issues).toHaveLength(0);
  });

  it('length field not found returns warning', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 4 }),
    ];
    const buffer = new Uint8Array(4);

    const result = applyBuildPostPatch(buffer, fields, {
      includeLengthField: true,
      lengthFieldId: 'nonexistent',
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.lengthFieldNotFound');
    expect(result.issues[0]!.severity).toBe('warning');
  });

  it('checksum with bigEndian writes correctly', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 1 }),
      makeField({
        id: 'chk',
        offset: 1,
        length: 2,
        dataType: 'uint16',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'crc16',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    const crc = calculateChecksum([0x01], 'crc16-modbus');
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 1, 2);
    expect(view.getUint16(0, false)).toBe(crc); // bigEndian
    expect(result.issues).toHaveLength(0);
  });

  it('unsupported checksum field length returns error', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 1 }),
      makeField({
        id: 'chk',
        offset: 1,
        length: 3,
        dataType: 'bytes',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum8',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.unsupportedChecksumFieldLength');
    expect(result.issues[0]!.severity).toBe('error');
  });

  it('invalid checksum field index range returns error', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 1 }),
      makeField({
        id: 'chk',
        offset: 1,
        length: 1,
        validOption: {
          isChecksum: true,
          startFieldIndex: 5, // out of range
          endFieldIndex: 10,
          checksumMethod: 'sum8',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.invalidChecksumRange');
    expect(result.issues[0]!.severity).toBe('error');
  });

  // --- Range alignment validation (sum32 / sum16) ---

  it('sum32 range not multiple of 4 returns alignment error', () => {
    // data: offset=0, len=2 → rangeLength=2, not multiple of 4
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 2 }),
      makeField({
        id: 'chk',
        offset: 2,
        length: 4,
        dataType: 'uint32',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum32',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x02, 0x00, 0x00, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.checksumRangeUnaligned');
    expect(result.issues[0]!.severity).toBe('error');
    expect(result.issues[0]!.fieldId).toBe('chk');
    // Buffer not rewritten on alignment error
    expect(result.buffer[2]).toBe(0x00);
    expect(result.buffer[3]).toBe(0x00);
    expect(result.buffer[4]).toBe(0x00);
    expect(result.buffer[5]).toBe(0x00);
  });

  it('sum16 range not multiple of 2 returns alignment error', () => {
    // data: offset=0, len=3 → rangeLength=3, not multiple of 2
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 3 }),
      makeField({
        id: 'chk',
        offset: 3,
        length: 2,
        dataType: 'uint16',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum16',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.build.checksumRangeUnaligned');
    expect(result.issues[0]!.severity).toBe('error');
    expect(result.buffer[3]).toBe(0x00);
    expect(result.buffer[4]).toBe(0x00);
  });

  it('sum32 range exactly multiple of 4 computes without alignment issue', () => {
    // Two data fields, total 4 bytes
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'h1', offset: 0, length: 2 }),
      makeField({ id: 'h2', offset: 2, length: 2 }),
      makeField({
        id: 'chk',
        offset: 4,
        length: 4,
        dataType: 'uint32',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum32',
        },
      }),
    ];

    const buffer = new Uint8Array([0, 0, 0, 1, 0x00, 0x00, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    // word BE: 0x00000001 → sum=1
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 4, 4);
    expect(view.getUint32(0, false)).toBe(1);
  });

  it('sum16 range exactly multiple of 2 computes without alignment issue', () => {
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'h1', offset: 0, length: 2 }),
      makeField({
        id: 'chk',
        offset: 2,
        length: 2,
        dataType: 'uint16',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum16',
        },
      }),
    ];

    const buffer = new Uint8Array([0x00, 0x05, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 2, 2);
    expect(view.getUint16(0, false)).toBe(5);
  });

  it('sum8 / crc32 methods are not subject to alignment check', () => {
    // sum8 with odd-length range → no alignment issue (expectedMultiple=0)
    const fieldsSum8: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 3 }),
      makeField({
        id: 'chk',
        offset: 3,
        length: 1,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum8',
        },
      }),
    ];

    const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x00]);
    const result = applyBuildPostPatch(buffer, fieldsSum8, { autoChecksum: true });
    expect(result.issues).toHaveLength(0);
    expect(result.buffer[3]).toBe(0x06);

    // crc32 with non-4B range → no alignment issue
    const fieldsCrc32: SendFieldEncodingDef[] = [
      makeField({ id: 'data', offset: 0, length: 3 }),
      makeField({
        id: 'crc',
        offset: 3,
        length: 4,
        dataType: 'uint32',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'crc32',
        },
      }),
    ];

    const buffer2 = new Uint8Array([0x01, 0x02, 0x03, 0x00, 0x00, 0x00, 0x00]);
    const result2 = applyBuildPostPatch(buffer2, fieldsCrc32, { autoChecksum: true });
    expect(result2.issues).toHaveLength(0);
  });

  // --- Endian pass-through (D1) ---

  it('sum32 endian follows field.bigEndian', () => {
    // Same bytes, BE field vs LE field → different checksum bytes
    const makeFrame = (bigEndian: boolean): SendFieldEncodingDef[] => [
      makeField({ id: 'data', offset: 0, length: 4 }),
      makeField({
        id: 'chk',
        offset: 4,
        length: 4,
        dataType: 'uint32',
        bigEndian,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum32',
        },
      }),
    ];

    const data = [0x01, 0x02, 0x03, 0x04];

    const beBuffer = new Uint8Array([...data, 0x00, 0x00, 0x00, 0x00]);
    const beResult = applyBuildPostPatch(beBuffer, makeFrame(true), { autoChecksum: true });
    const beView = new DataView(beResult.buffer.buffer, beResult.buffer.byteOffset + 4, 4);
    const beChk = beView.getUint32(0, false);

    const leBuffer = new Uint8Array([...data, 0x00, 0x00, 0x00, 0x00]);
    const leResult = applyBuildPostPatch(leBuffer, makeFrame(false), { autoChecksum: true });
    const leView = new DataView(leResult.buffer.buffer, leResult.buffer.byteOffset + 4, 4);
    const leChk = leView.getUint32(0, true);

    // BE word = 0x01020304, LE word = 0x04030201 → different sums
    expect(beChk).toBe(0x01020304);
    expect(leChk).toBe(0x04030201);
    expect(beChk).not.toBe(leChk);
  });

  it('sum16 endian follows field.bigEndian', () => {
    const makeFrame = (bigEndian: boolean): SendFieldEncodingDef[] => [
      makeField({ id: 'data', offset: 0, length: 2 }),
      makeField({
        id: 'chk',
        offset: 2,
        length: 2,
        dataType: 'uint16',
        bigEndian,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum16',
        },
      }),
    ];

    const data = [0x12, 0x34];

    const beBuffer = new Uint8Array([...data, 0x00, 0x00]);
    const beResult = applyBuildPostPatch(beBuffer, makeFrame(true), { autoChecksum: true });
    const beView = new DataView(beResult.buffer.buffer, beResult.buffer.byteOffset + 2, 2);
    expect(beView.getUint16(0, false)).toBe(0x1234);

    const leBuffer = new Uint8Array([...data, 0x00, 0x00]);
    const leResult = applyBuildPostPatch(leBuffer, makeFrame(false), { autoChecksum: true });
    const leView = new DataView(leResult.buffer.buffer, leResult.buffer.byteOffset + 2, 2);
    expect(leView.getUint16(0, true)).toBe(0x3412);
  });

  // --- Multi-checksum independence ---

  it('multiple checksum fields compute independently', () => {
    // Frame: [data1(2B), sum16-chk(2B), data2(4B), sum32-chk(4B)]
    const fields: SendFieldEncodingDef[] = [
      makeField({ id: 'd1', offset: 0, length: 2 }),
      makeField({
        id: 'chk16',
        offset: 2,
        length: 2,
        dataType: 'uint16',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum16',
        },
      }),
      makeField({ id: 'd2', offset: 4, length: 4 }),
      makeField({
        id: 'chk32',
        offset: 8,
        length: 4,
        dataType: 'uint32',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 2,
          endFieldIndex: 2,
          checksumMethod: 'sum32',
        },
      }),
    ];

    const buffer = new Uint8Array([
      0x00, 0x05,           // d1
      0x00, 0x00,           // chk16 (to be filled)
      0x00, 0x00, 0x00, 0x09, // d2
      0x00, 0x00, 0x00, 0x00, // chk32 (to be filled)
    ]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    // chk16 = sum16 of d1 = 0x0005
    const v16 = new DataView(result.buffer.buffer, result.buffer.byteOffset + 2, 2);
    expect(v16.getUint16(0, false)).toBe(0x0005);
    // chk32 = sum32 of d2 = 0x00000009
    const v32 = new DataView(result.buffer.buffer, result.buffer.byteOffset + 8, 4);
    expect(v32.getUint32(0, false)).toBe(0x00000009);
  });
});
