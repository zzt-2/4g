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

const BIGINT_TYPES = new Set(['uint64', 'int64']);

const FLOAT_TYPES = new Set(['float', 'double']);

const INTEGER_RANGES: Record<string, readonly [number, number]> = {
  uint8: [0, 255],
  int8: [-128, 127],
  uint16: [0, 65535],
  int16: [-32768, 32767],
  uint32: [0, 4294967295],
  int32: [-2147483648, 2147483647],
};

const BIGINT_RANGES: Record<string, readonly [bigint, bigint]> = {
  uint64: [0n, 18_446_744_073_709_551_615n],
  int64: [-9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n],
};

function parseNumericValue(value: SendFieldValue): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const str = String(value).trim();
  if (/^0x[0-9a-f]+$/i.test(str)) return parseInt(str, 16);
  return Number(str);
}

function parseBigIntValue(value: SendFieldValue): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`bigint field cannot accept non-integer number: ${value}`);
    }
    return BigInt(value);
  }
  const str = String(value).trim();
  if (/^-?0x[0-9a-f]+$/i.test(str)) {
    const negative = str.startsWith('-');
    const body = negative ? str.slice(1) : str;
    const bi = BigInt(body);
    return negative ? -bi : bi;
  }
  if (/^-?\d+$/.test(str)) {
    return BigInt(str);
  }
  throw new Error(`cannot parse bigint from: ${JSON.stringify(value)}`);
}

function encodeInteger(value: number | bigint, dataType: string, bigEndian: boolean): number[] {
  const le = !bigEndian;
  switch (dataType) {
    case 'uint8': {
      const buf = new ArrayBuffer(1);
      new DataView(buf).setUint8(0, (value as number) & 0xff);
      return [new Uint8Array(buf)[0]!];
    }
    case 'int8': {
      const buf = new ArrayBuffer(1);
      new DataView(buf).setInt8(0, value as number);
      return [new Uint8Array(buf)[0]!];
    }
    case 'uint16': {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setUint16(0, (value as number) & 0xffff, le);
      return [...new Uint8Array(buf)];
    }
    case 'int16': {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setInt16(0, value as number, le);
      return [...new Uint8Array(buf)];
    }
    case 'uint32': {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, (value as number) >>> 0, le);
      return [...new Uint8Array(buf)];
    }
    case 'int32': {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, value as number, le);
      return [...new Uint8Array(buf)];
    }
    case 'uint64': {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setBigUint64(0, value as bigint, le);
      return [...new Uint8Array(buf)];
    }
    case 'int64': {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setBigInt64(0, value as bigint, le);
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
  if (BIGINT_TYPES.has(field.dataType)) {
    return encodeInteger(parseBigIntValue(value), field.dataType, field.bigEndian);
  }
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

    // 对 BIGINT 字段先做解析+范围校验，失败则跳过 encode 并记录 issue
    let bigintValue: bigint | null = null;
    let bigintFailed = false;
    if (BIGINT_TYPES.has(field.dataType)) {
      try {
        bigintValue = parseBigIntValue(value);
        const range = BIGINT_RANGES[field.dataType];
        if (range && (bigintValue < range[0] || bigintValue > range[1])) {
          issues.push({
            severity: 'warning',
            code: 'send.encode.valueOutOfRange',
            fieldId: field.id,
            message: `Value ${bigintValue.toString()} exceeds ${field.dataType} range [${range[0].toString()}, ${range[1].toString()}], will be truncated`,
          });
        }
      } catch (e) {
        bigintFailed = true;
        issues.push({
          severity: 'warning',
          code: 'send.encode.valueUnparseable',
          fieldId: field.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (INTEGER_TYPES.has(field.dataType)) {
      const numValue = parseNumericValue(value);
      const range = INTEGER_RANGES[field.dataType];
      if (range && (numValue < range[0] || numValue > range[1])) {
        issues.push({
          severity: 'warning',
          code: 'send.encode.valueOutOfRange',
          fieldId: field.id,
          message: `Value ${numValue} exceeds ${field.dataType} range [${range[0]}, ${range[1]}], will be truncated`,
        });
      }
    }

    const encoded = bigintFailed
      ? Array(field.length).fill(0)
      : encodeFieldValue(value, field);

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
