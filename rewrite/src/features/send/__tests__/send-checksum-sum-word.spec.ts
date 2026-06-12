import { describe, it, expect } from 'vitest';
import {
  applyBuildPostPatch,
  calculateChecksum,
  checksumSum32,
  checksumSum16,
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

// Build a contiguous byte layout from field lengths; returns fields with
// offsets filled in based on declaration order.
function layoutFields(
  defs: Array<Pick<SendFieldEncodingDef, 'id'> & Partial<SendFieldEncodingDef>>,
): SendFieldEncodingDef[] {
  let offset = 0;
  return defs.map((d) => {
    const length = d.length ?? 1;
    const field = makeField({
      ...d,
      offset,
      length,
    });
    offset += length;
    return field;
  });
}

// --- SUM32 round-trip ---

describe('SUM32 round-trip integration', () => {
  it('computes sum32 checksum for a frame with BE data words', () => {
    // Frame layout: [header(4B)] [payload(8B)] [checksum(4B, sum32 over header+payload)]
    const fields = layoutFields([
      { id: 'header', length: 4, dataType: 'uint32', bigEndian: true },
      { id: 'payload', length: 8, dataType: 'bytes' },
      {
        id: 'checksum',
        length: 4,
        dataType: 'uint32',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum32',
        },
      },
    ]);

    // header (BE) = 0x00000001, payload = 2 words BE: 0x00000002, 0x00000003
    const buffer = new Uint8Array([
      0x00, 0x00, 0x00, 0x01,           // header
      0x00, 0x00, 0x00, 0x02,           // payload word 1
      0x00, 0x00, 0x00, 0x03,           // payload word 2
      0x00, 0x00, 0x00, 0x00,           // checksum placeholder
    ]);

    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);

    // Independent computation: sum32 of bytes [0..12) BE = 1+2+3 = 6
    const rangeBytes = Array.from(buffer.slice(0, 12));
    const expected = checksumSum32(rangeBytes, true);
    expect(expected).toBe(6);

    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 12, 4);
    expect(view.getUint32(0, false)).toBe(expected); // BE read
  });

  it('computes sum32 checksum for a frame with LE data words', () => {
    const fields = layoutFields([
      { id: 'a', length: 4, dataType: 'uint32', bigEndian: false },
      { id: 'b', length: 4, dataType: 'uint32', bigEndian: false },
      {
        id: 'checksum',
        length: 4,
        dataType: 'uint32',
        bigEndian: false,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum32',
        },
      },
    ]);

    // a (LE) = 0x01020304, b (LE) = 0x05060708
    const buffer = new Uint8Array([
      0x04, 0x03, 0x02, 0x01,
      0x08, 0x07, 0x06, 0x05,
      0x00, 0x00, 0x00, 0x00,
    ]);

    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    const expected = checksumSum32(
      [0x04, 0x03, 0x02, 0x01, 0x08, 0x07, 0x06, 0x05],
      false,
    );
    expect(expected).toBe(0x01020304 + 0x05060708);

    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 8, 4);
    expect(view.getUint32(0, true)).toBe(expected); // LE read
  });

  it('compute pipeline equals direct calculateChecksum call', () => {
    // Sanity: applyBuildPostPatch and calculateChecksum must agree on the same bytes.
    const fields = layoutFields([
      { id: 'data', length: 8, dataType: 'bytes', bigEndian: true },
      {
        id: 'checksum',
        length: 4,
        dataType: 'uint32',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'sum32',
        },
      },
    ]);

    const buffer = new Uint8Array([
      0x10, 0x20, 0x30, 0x40,
      0x50, 0x60, 0x70, 0x80,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    const direct = calculateChecksum(
      [0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80],
      'sum32',
      { bigEndian: true },
    );
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 8, 4);
    expect(view.getUint32(0, false)).toBe(direct);
  });
});

// --- SUM16 round-trip ---

describe('SUM16 round-trip integration', () => {
  it('computes sum16 checksum for a frame with BE data words', () => {
    const fields = layoutFields([
      { id: 'a', length: 2, dataType: 'uint16', bigEndian: true },
      { id: 'b', length: 2, dataType: 'uint16', bigEndian: true },
      {
        id: 'checksum',
        length: 2,
        dataType: 'uint16',
        bigEndian: true,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum16',
        },
      },
    ]);

    const buffer = new Uint8Array([
      0x00, 0x10,        // a (BE) = 0x0010
      0x00, 0x20,        // b (BE) = 0x0020
      0x00, 0x00,        // checksum placeholder
    ]);

    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    const expected = checksumSum16([0x00, 0x10, 0x00, 0x20], true);
    expect(expected).toBe(0x30);

    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 4, 2);
    expect(view.getUint16(0, false)).toBe(expected);
  });

  it('computes sum16 checksum for a frame with LE data words', () => {
    const fields = layoutFields([
      { id: 'a', length: 2, dataType: 'uint16', bigEndian: false },
      { id: 'b', length: 2, dataType: 'uint16', bigEndian: false },
      {
        id: 'checksum',
        length: 2,
        dataType: 'uint16',
        bigEndian: false,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum16',
        },
      },
    ]);

    const buffer = new Uint8Array([
      0x10, 0x00,        // a (LE) = 0x0010
      0x20, 0x00,        // b (LE) = 0x0020
      0x00, 0x00,        // checksum placeholder
    ]);

    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 4, 2);
    expect(view.getUint16(0, true)).toBe(0x30);
  });
});

// --- Legacy compatibility ---

describe('Legacy frame compatibility', () => {
  it('frame without sum32/sum16 configured behaves identically (sum8 path)', () => {
    // Simulate an old frame definition: only sum8 method, no sum32/sum16 anywhere.
    const fields = layoutFields([
      { id: 'header', length: 1, dataType: 'uint8' },
      { id: 'data', length: 1, dataType: 'uint8' },
      {
        id: 'checksum',
        length: 1,
        dataType: 'uint8',
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 1,
          checksumMethod: 'sum8',
        },
      },
    ]);

    const buffer = new Uint8Array([0x10, 0x20, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    expect(result.buffer[2]).toBe(0x30); // sum8 of [0x10, 0x20]
  });

  it('frame with crc32 still works unchanged', () => {
    const fields = layoutFields([
      { id: 'data', length: 4, dataType: 'bytes' },
      {
        id: 'crc',
        length: 4,
        dataType: 'uint32',
        bigEndian: false,
        validOption: {
          isChecksum: true,
          startFieldIndex: 0,
          endFieldIndex: 0,
          checksumMethod: 'crc32',
        },
      },
    ]);

    const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = applyBuildPostPatch(buffer, fields, { autoChecksum: true });

    expect(result.issues).toHaveLength(0);
    const expected = calculateChecksum([0x01, 0x02, 0x03, 0x04], 'crc32');
    const view = new DataView(result.buffer.buffer, result.buffer.byteOffset + 4, 4);
    expect(view.getUint32(0, true)).toBe(expected);
  });
});
