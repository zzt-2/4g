import type {
  SendBuildInput,
  SendFieldEncodingDef,
  SendFieldValue,
  ResolvedFieldValue,
  FrameBuildOutput,
  SendBuildIssue,
} from './types';

const INTEGER_TYPES = new Set([
  'uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64',
]);

const FLOAT_TYPES = new Set(['float', 'double']);

function parseNumericValue(value: SendFieldValue): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const str = String(value).trim();
  if (/^0x[0-9a-f]+$/i.test(str)) return parseInt(str, 16);
  return Number(str);
}

function encodeInteger(value: number, dataType: string, bigEndian: boolean): number[] {
  const le = !bigEndian;
  switch (dataType) {
    case 'uint8': {
      const buf = new ArrayBuffer(1);
      new DataView(buf).setUint8(0, value & 0xff);
      return [new Uint8Array(buf)[0]!];
    }
    case 'int8': {
      const buf = new ArrayBuffer(1);
      new DataView(buf).setInt8(0, value);
      return [new Uint8Array(buf)[0]!];
    }
    case 'uint16': {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setUint16(0, value & 0xffff, le);
      return [...new Uint8Array(buf)];
    }
    case 'int16': {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setInt16(0, value, le);
      return [...new Uint8Array(buf)];
    }
    case 'uint32': {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, value >>> 0, le);
      return [...new Uint8Array(buf)];
    }
    case 'int32': {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, value, le);
      return [...new Uint8Array(buf)];
    }
    case 'uint64':
    case 'int64': {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setBigInt64(0, BigInt(Math.trunc(value)), le);
      return [...new Uint8Array(buf)];
    }
    default:
      return [];
  }
}

function encodeFloat(value: number, dataType: string, bigEndian: boolean): number[] {
  const le = !bigEndian;
  if (dataType === 'float') {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, le);
    return [...new Uint8Array(buf)];
  }
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, le);
  return [...new Uint8Array(buf)];
}

function encodeBytes(value: SendFieldValue, length: number): number[] {
  const str = typeof value === 'string' ? value : String(value);
  const hex = str.replace(/^0x/i, '').replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < hex.length && bytes.length < length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (!isNaN(byte)) bytes.push(byte);
  }
  while (bytes.length < length) bytes.push(0);
  return bytes.slice(0, length);
}

function encodeASCII(value: SendFieldValue, length: number): number[] {
  const str = String(value);
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    bytes.push(i < str.length ? str.charCodeAt(i) & 0xff : 0);
  }
  return bytes;
}

function encodeFieldValue(
  value: SendFieldValue,
  field: SendFieldEncodingDef,
): number[] {
  if (field.isASCII) return encodeASCII(value, field.length);
  if (field.dataType === 'bytes') return encodeBytes(value, field.length);
  if (INTEGER_TYPES.has(field.dataType)) {
    return encodeInteger(parseNumericValue(value), field.dataType, field.bigEndian);
  }
  if (FLOAT_TYPES.has(field.dataType)) {
    return encodeFloat(parseNumericValue(value), field.dataType, field.bigEndian);
  }
  return [];
}

export function buildFrame(input: SendBuildInput): FrameBuildOutput {
  const { fields, totalByteLength, fieldValues } = input;
  const buffer = new Uint8Array(totalByteLength);
  const resolvedFields: Record<string, ResolvedFieldValue> = {};
  const issues: SendBuildIssue[] = [];

  for (const field of fields) {
    const value = fieldValues[field.id];
    if (value === undefined || value === null || value === '') {
      issues.push({
        severity: 'warning',
        code: 'send.field.missingValue',
        fieldId: field.id,
        message: `Field "${field.id}" has no value, using zeros.`,
      });
      resolvedFields[field.id] = {
        fieldId: field.id,
        rawValue: 0,
        encodedBytes: Array(field.length).fill(0),
        offset: field.offset,
        length: field.length,
      };
      continue;
    }

    const encoded = encodeFieldValue(value, field);
    for (let i = 0; i < Math.min(encoded.length, field.length); i++) {
      buffer[field.offset + i] = encoded[i]!;
    }

    resolvedFields[field.id] = {
      fieldId: field.id,
      rawValue: value,
      encodedBytes: encoded.slice(0, field.length),
      offset: field.offset,
      length: field.length,
    };
  }

  return { bytes: buffer, resolvedFields, issues };
}
