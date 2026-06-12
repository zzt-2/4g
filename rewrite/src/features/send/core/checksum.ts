import type { SendBuildIssue, SendFieldEncodingDef, SendOptions } from './types';

export function checksumSum8(bytes: readonly number[]): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return sum & 0xff;
}

export function checksumXor8(bytes: readonly number[]): number {
  let result = 0;
  for (const b of bytes) result ^= b;
  return result & 0xff;
}

const CRC16_MODBUS_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    table.push(crc);
  }
  return table;
})();

export function checksumCrc16Modbus(bytes: readonly number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[(crc ^ b) & 0xff]!;
  }
  return crc & 0xffff;
}

const CRC32_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table.push(crc >>> 0);
  }
  return table;
})();

export function checksumCrc32(bytes: readonly number[]): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ b) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function checksumSum32(
  bytes: readonly number[],
  bigEndian: boolean = false,
): number {
  let sum = 0;
  const buf = Uint8Array.from(bytes);
  for (let i = 0; i + 4 <= buf.length; i += 4) {
    const view = new DataView(buf.buffer, buf.byteOffset + i, 4);
    sum += view.getUint32(0, !bigEndian);
  }
  return sum >>> 0;
}

export function checksumSum16(
  bytes: readonly number[],
  bigEndian: boolean = false,
): number {
  let sum = 0;
  const buf = Uint8Array.from(bytes);
  for (let i = 0; i + 2 <= buf.length; i += 2) {
    const view = new DataView(buf.buffer, buf.byteOffset + i, 2);
    sum += view.getUint16(0, !bigEndian);
  }
  return sum & 0xffff;
}

export interface ChecksumOptions {
  readonly startIdx?: number;
  readonly endIdx?: number;
  readonly bigEndian?: boolean;
}

export function calculateChecksum(
  bytes: readonly number[],
  kind: string,
  options?: ChecksumOptions,
): number {
  let slice = bytes;
  if (options?.startIdx !== undefined || options?.endIdx !== undefined) {
    slice = bytes.slice(options?.startIdx ?? 0, options?.endIdx);
  }
  const be = options?.bigEndian ?? false;
  switch (kind) {
    case 'sum8':
      return checksumSum8(slice);
    case 'xor8':
      return checksumXor8(slice);
    case 'crc16':
    case 'crc16-modbus':
      return checksumCrc16Modbus(slice);
    case 'crc32':
      return checksumCrc32(slice);
    case 'sum32':
      return checksumSum32(slice, be);
    case 'sum16':
      return checksumSum16(slice, be);
    default:
      return 0;
  }
}

export interface BuildPatchResult {
  readonly buffer: Uint8Array;
  readonly issues: readonly SendBuildIssue[];
}

function makeIssue(
  severity: SendBuildIssue['severity'],
  code: string,
  message: string,
  fieldId?: string,
): SendBuildIssue {
  return { severity, code, fieldId, message };
}

export function applyBuildPostPatch(
  buffer: Uint8Array,
  fields: readonly SendFieldEncodingDef[],
  options?: SendOptions,
): BuildPatchResult {
  const result = new Uint8Array(buffer);
  const issues: SendBuildIssue[] = [];

  if (!options) {
    return { buffer: result, issues };
  }

  // Auto checksum
  if (options.autoChecksum) {
    for (const field of fields) {
      if (!field.validOption?.isChecksum) continue;

      const { startFieldIndex, endFieldIndex, checksumMethod } = field.validOption;

      // Validate range
      if (startFieldIndex >= fields.length || endFieldIndex >= fields.length) {
        issues.push(makeIssue('error', 'send.build.invalidChecksumRange',
          `Checksum field index range [${startFieldIndex}, ${endFieldIndex}] out of bounds.`, field.id));
        continue;
      }

      // Check supported field lengths for checksum
      if (field.length !== 1 && field.length !== 2 && field.length !== 4) {
        issues.push(makeIssue('error', 'send.build.unsupportedChecksumFieldLength',
          `Checksum field "${field.id}" has unsupported length ${field.length}.`, field.id));
        continue;
      }

      const method = checksumMethod ?? 'sum8';

      // Collect bytes from startFieldIndex to endFieldIndex (inclusive)
      const startByte = fields[startFieldIndex]!.offset;
      const endField = fields[endFieldIndex]!;
      const endByte = endField.offset + endField.length;

      // Range alignment validation (sum32 requires multiple of 4B, sum16 of 2B)
      const rangeLength = endByte - startByte;
      const expectedMultiple = method === 'sum32' ? 4 : method === 'sum16' ? 2 : 0;
      if (expectedMultiple > 0 && rangeLength % expectedMultiple !== 0) {
        issues.push(makeIssue(
          'error',
          'send.build.checksumRangeUnaligned',
          `${method} requires range length to be a multiple of ${expectedMultiple} bytes (got ${rangeLength}).`,
          field.id,
        ));
        continue;
      }

      const checksumBytes = Array.from(result.slice(startByte, endByte));

      const checksumValue = calculateChecksum(checksumBytes, method, {
        bigEndian: field.bigEndian,
      });

      // Check overflow
      const maxForLength = field.length === 1 ? 0xff : field.length === 2 ? 0xffff : 0xffffffff;
      if (checksumValue > maxForLength) {
        issues.push(makeIssue('error', 'send.build.checksumOverflow',
          `Checksum value 0x${checksumValue.toString(16)} exceeds field capacity (${field.length} bytes).`, field.id));
        continue;
      }

      // Write checksum
      const be = field.bigEndian;
      const view = new DataView(result.buffer, result.byteOffset + field.offset, field.length);
      if (field.length === 1) {
        result[field.offset] = checksumValue & 0xff;
      } else if (field.length === 2) {
        view.setUint16(0, checksumValue, !be);
      } else if (field.length === 4) {
        view.setUint32(0, checksumValue, !be);
      }
    }
  }

  // Auto length field
  if (options.includeLengthField) {
    if (!options.lengthFieldId) {
      issues.push(makeIssue('warning', 'send.build.lengthFieldIdMissing',
        'includeLengthField is set but lengthFieldId is not specified.'));
    } else {
      const lengthField = fields.find((f) => f.id === options.lengthFieldId);
      if (!lengthField) {
        issues.push(makeIssue('warning', 'send.build.lengthFieldNotFound',
          `Length field "${options.lengthFieldId}" not found in frame fields.`));
      } else {
        const totalLength = result.length;
        const be = lengthField.bigEndian;
        const view = new DataView(result.buffer, result.byteOffset + lengthField.offset, lengthField.length);
        if (lengthField.length === 1) {
          result[lengthField.offset] = totalLength & 0xff;
        } else if (lengthField.length === 2) {
          view.setUint16(0, totalLength, !be);
        } else if (lengthField.length === 4) {
          view.setUint32(0, totalLength, !be);
        }
      }
    }
  }

  return { buffer: result, issues };
}
