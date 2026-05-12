import { describe, it, expect } from 'vitest';
import {
  checksumCrc32,
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
});
