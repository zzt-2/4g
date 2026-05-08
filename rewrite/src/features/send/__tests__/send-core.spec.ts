import { describe, expect, it } from 'vitest';
import {
  buildFrame,
  calculateChecksum,
  checksumSum8,
  checksumXor8,
  checksumCrc16Modbus,
  validateSendRequest,
} from '../core';
import {
  minimalFieldDefs,
  minimalFieldValues,
  multiTypeFieldDefs,
  multiTypeFieldValues,
  littleEndianFieldDefs,
  littleEndianFieldValues,
  asciiFieldDefs,
  asciiFieldValues,
  checksumTestBytes,
  missingFrameIdRequest,
  missingTargetIdRequest,
  validSendRequest,
} from '../fixtures/send-fixtures';

describe('send core: encoding', () => {
  it('encodes minimal frame with hex string values', () => {
    const output = buildFrame({
      fields: minimalFieldDefs,
      totalByteLength: 2,
      fieldValues: minimalFieldValues,
    });
    expect(output.bytes).toEqual(new Uint8Array([0xff, 0x01]));
    expect(output.issues).toHaveLength(0);
    expect(output.resolvedFields['header']?.encodedBytes).toEqual([0xff]);
    expect(output.resolvedFields['command']?.encodedBytes).toEqual([0x01]);
  });

  it('encodes frame with missing field value as warning', () => {
    const output = buildFrame({
      fields: minimalFieldDefs,
      totalByteLength: 2,
      fieldValues: {},
    });
    expect(output.bytes).toEqual(new Uint8Array([0, 0]));
    expect(output.issues).toHaveLength(2);
    expect(output.issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('encodes uint16 big-endian', () => {
    const output = buildFrame({
      fields: [{ id: 'val', dataType: 'uint16', length: 2, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 2,
      fieldValues: { val: 0x1234 },
    });
    expect(output.bytes).toEqual(new Uint8Array([0x12, 0x34]));
  });

  it('encodes uint16 little-endian', () => {
    const output = buildFrame({
      fields: littleEndianFieldDefs,
      totalByteLength: 2,
      fieldValues: littleEndianFieldValues,
    });
    expect(output.bytes).toEqual(new Uint8Array([0x34, 0x12]));
  });

  it('encodes int8 negative value', () => {
    const output = buildFrame({
      fields: [{ id: 'val', dataType: 'int8', length: 1, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 1,
      fieldValues: { val: -1 },
    });
    expect(output.bytes).toEqual(new Uint8Array([0xff]));
  });

  it('encodes uint32 big-endian', () => {
    const output = buildFrame({
      fields: [{ id: 'val', dataType: 'uint32', length: 4, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 4,
      fieldValues: { val: 0x12345678 },
    });
    expect(output.bytes).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
  });

  it('encodes float big-endian', () => {
    const output = buildFrame({
      fields: [{ id: 'val', dataType: 'float', length: 4, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 4,
      fieldValues: { val: 1.5 },
    });
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, 1.5, false);
    expect(output.bytes).toEqual(new Uint8Array(buf));
  });

  it('encodes double big-endian', () => {
    const output = buildFrame({
      fields: [{ id: 'val', dataType: 'double', length: 8, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 8,
      fieldValues: { val: 3.14 },
    });
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, 3.14, false);
    expect(output.bytes).toEqual(new Uint8Array(buf));
  });

  it('encodes ASCII string into fixed-length field', () => {
    const output = buildFrame({
      fields: asciiFieldDefs,
      totalByteLength: 5,
      fieldValues: asciiFieldValues,
    });
    expect(output.bytes).toEqual(new Uint8Array([0x48, 0x45, 0x4c, 0x4c, 0x4f]));
  });

  it('pads ASCII string shorter than field length', () => {
    const output = buildFrame({
      fields: [{ id: 'text', dataType: 'uint8', length: 5, bigEndian: true, isASCII: true, offset: 0 }],
      totalByteLength: 5,
      fieldValues: { text: 'AB' },
    });
    expect(output.bytes).toEqual(new Uint8Array([0x41, 0x42, 0, 0, 0]));
  });

  it('encodes bytes field from hex string', () => {
    const output = buildFrame({
      fields: [{ id: 'raw', dataType: 'bytes', length: 4, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 4,
      fieldValues: { raw: '0xDEADBEEF' },
    });
    expect(output.bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('encodes multi-type frame correctly', () => {
    const output = buildFrame({
      fields: multiTypeFieldDefs,
      totalByteLength: 7,
      fieldValues: multiTypeFieldValues,
    });
    expect(output.issues).toHaveLength(0);
    expect(output.bytes.length).toBe(7);
    expect(output.bytes[0]).toBe(0x12);
    expect(output.bytes[1]).toBe(0x34);
    expect(output.bytes[2]).toBe(0xff);
  });

  it('encodes boolean true as 1', () => {
    const output = buildFrame({
      fields: [{ id: 'flag', dataType: 'uint8', length: 1, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 1,
      fieldValues: { flag: true },
    });
    expect(output.bytes).toEqual(new Uint8Array([1]));
  });

  it('encodes numeric string value', () => {
    const output = buildFrame({
      fields: [{ id: 'val', dataType: 'uint8', length: 1, bigEndian: true, isASCII: false, offset: 0 }],
      totalByteLength: 1,
      fieldValues: { val: '42' },
    });
    expect(output.bytes).toEqual(new Uint8Array([42]));
  });

  it('resolves field offsets from field order', () => {
    const output = buildFrame({
      fields: [
        { id: 'a', dataType: 'uint8', length: 1, bigEndian: true, isASCII: false, offset: 0 },
        { id: 'b', dataType: 'uint16', length: 2, bigEndian: true, isASCII: false, offset: 1 },
        { id: 'c', dataType: 'uint8', length: 1, bigEndian: true, isASCII: false, offset: 3 },
      ],
      totalByteLength: 4,
      fieldValues: { a: 1, b: 2, c: 3 },
    });
    expect(output.resolvedFields['a']?.offset).toBe(0);
    expect(output.resolvedFields['b']?.offset).toBe(1);
    expect(output.resolvedFields['c']?.offset).toBe(3);
  });
});

describe('send core: checksum', () => {
  it('calculates sum8', () => {
    expect(checksumSum8(checksumTestBytes)).toBe(0x0a);
    expect(calculateChecksum(checksumTestBytes, 'sum8')).toBe(0x0a);
  });

  it('calculates xor8', () => {
    expect(checksumXor8(checksumTestBytes)).toBe(0x04);
    expect(calculateChecksum(checksumTestBytes, 'xor8')).toBe(0x04);
  });

  it('calculates crc16-modbus', () => {
    const result = checksumCrc16Modbus(checksumTestBytes);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
    expect(calculateChecksum(checksumTestBytes, 'crc16-modbus')).toBe(result);
  });

  it('returns 0 for unknown checksum kind', () => {
    expect(calculateChecksum(checksumTestBytes, 'unknown')).toBe(0);
  });

  it('sum8 handles empty bytes', () => {
    expect(checksumSum8([])).toBe(0);
  });

  it('xor8 handles empty bytes', () => {
    expect(checksumXor8([])).toBe(0);
  });

  it('crc16-modbus handles empty bytes', () => {
    expect(checksumCrc16Modbus([])).toBe(0xffff);
  });

  it('sum8 handles single byte', () => {
    expect(checksumSum8([0xff])).toBe(0xff);
  });

  it('xor8 handles single byte', () => {
    expect(checksumXor8([0xaa])).toBe(0xaa);
  });

  it('sum8 wraps at 256', () => {
    expect(checksumSum8([0xff, 0x02])).toBe(0x01);
  });
});

describe('send core: validation', () => {
  it('passes valid request', () => {
    const issues = validateSendRequest(validSendRequest);
    expect(issues).toHaveLength(0);
  });

  it('reports missing frameId', () => {
    const issues = validateSendRequest(missingFrameIdRequest);
    expect(issues.some((i) => i.code === 'send.request.missingFrameId')).toBe(true);
  });

  it('reports missing targetId', () => {
    const issues = validateSendRequest(missingTargetIdRequest);
    expect(issues.some((i) => i.code === 'send.request.missingTargetId')).toBe(true);
  });

  it('reports missing context source', () => {
    const issues = validateSendRequest({
      frameId: 'f1',
      fieldValues: {},
      targetId: 't1',
      options: {},
      context: { source: undefined as unknown as 'user' },
    });
    expect(issues.some((i) => i.code === 'send.request.missingSource')).toBe(true);
  });
});
