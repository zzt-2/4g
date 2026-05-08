import type { FrameFieldDefinition } from '@/features/frame';
import {
  bytesToHex,
  bytesToReadableHex,
  bytesToUnsignedInteger,
  normalizeExpectedHex,
  receiveIssue,
  signedIntegerFromUnsigned,
} from './bytes';
import type {
  ReceiveFrameParseInput,
  ReceiveIssue,
  ReceiveParsedFieldPrimitive,
  ReceiveParsedFieldValue,
} from './types';

export interface ReceiveFrameParseOutcome {
  readonly fields: readonly ReceiveParsedFieldValue[];
  readonly issues: readonly ReceiveIssue[];
}

interface FieldRuntimeExtension {
  readonly factor?: unknown;
}

function getFieldLength(field: FrameFieldDefinition): number {
  return Number.isInteger(field.length) && field.length > 0 ? field.length : 0;
}

function getFieldFactor(field: FrameFieldDefinition): number | undefined {
  const factor = (field as FieldRuntimeExtension).factor;
  return typeof factor === 'number' && Number.isFinite(factor) ? factor : undefined;
}

function shouldApplyFactor(factor: number | undefined): boolean {
  return factor !== undefined && factor !== 1;
}

function applyFactor(value: number, factor: number | undefined): number {
  if (!shouldApplyFactor(factor)) {
    return value;
  }

  return Number.parseFloat((value * factor).toFixed(5));
}

function fieldUsesBigEndian(field: FrameFieldDefinition, frameDefault: boolean): boolean {
  return field.bigEndian ?? frameDefault;
}

function readInteger(
  bytes: readonly number[],
  signed: boolean,
  bigEndian: boolean,
): number {
  const orderedBytes = bigEndian ? bytes : [...bytes].reverse();
  const unsigned = bytesToUnsignedInteger(orderedBytes);
  return signed ? signedIntegerFromUnsigned(unsigned, bytes.length) : unsigned;
}

function readBigInteger(
  bytes: readonly number[],
  signed: boolean,
  bigEndian: boolean,
): string {
  const orderedBytes = bigEndian ? bytes : [...bytes].reverse();
  const unsigned = orderedBytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  if (!signed) {
    return unsigned.toString();
  }

  const bitLength = BigInt(bytes.length * 8);
  const signLimit = 1n << (bitLength - 1n);
  const fullRange = 1n << bitLength;
  return (unsigned >= signLimit ? unsigned - fullRange : unsigned).toString();
}

function readFloat(bytes: readonly number[], double: boolean, bigEndian: boolean): number {
  const buffer = new ArrayBuffer(double ? 8 : 4);
  const view = new DataView(buffer);
  bytes.forEach((byte, index) => view.setUint8(index, byte));
  return double ? view.getFloat64(0, !bigEndian) : view.getFloat32(0, !bigEndian);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : Number.parseFloat(value.toFixed(5)).toString();
}

function parsePrimitive(
  field: FrameFieldDefinition,
  fieldBytes: readonly number[],
  frameDefaultBigEndian: boolean,
): ReceiveParsedFieldPrimitive {
  const bigEndian = fieldUsesBigEndian(field, frameDefaultBigEndian);
  const factor = getFieldFactor(field);

  switch (field.dataType) {
    case 'uint8':
    case 'uint16':
    case 'uint32':
      return applyFactor(readInteger(fieldBytes, false, bigEndian), factor);
    case 'int8':
    case 'int16':
    case 'int32':
      return applyFactor(readInteger(fieldBytes, true, bigEndian), factor);
    case 'uint64':
      return shouldApplyFactor(factor)
        ? formatNumber(applyFactor(Number(readBigInteger(fieldBytes, false, bigEndian)), factor))
        : readBigInteger(fieldBytes, false, bigEndian);
    case 'int64':
      return shouldApplyFactor(factor)
        ? formatNumber(applyFactor(Number(readBigInteger(fieldBytes, true, bigEndian)), factor))
        : readBigInteger(fieldBytes, true, bigEndian);
    case 'float':
      return applyFactor(readFloat(fieldBytes, false, bigEndian), factor);
    case 'double':
      return applyFactor(readFloat(fieldBytes, true, bigEndian), factor);
    case 'bytes':
      return field.isASCII
        ? fieldBytes
            .filter((byte) => byte !== 0)
            .map((byte) => String.fromCharCode(byte))
            .join('')
        : bytesToHex(fieldBytes);
  }
}

function displayValueFor(field: FrameFieldDefinition, value: ReceiveParsedFieldPrimitive): string {
  if (value === null) {
    return '';
  }

  if (field.dataType === 'float') {
    return typeof value === 'number' ? value.toFixed(2) : String(value);
  }

  if (field.dataType === 'double') {
    return typeof value === 'number' ? value.toFixed(4) : String(value);
  }

  if (field.dataType === 'bytes' && !field.isASCII) {
    return String(value).match(/.{1,2}/g)?.join(' ') ?? '';
  }

  return String(value);
}

function labelFor(field: FrameFieldDefinition, fieldBytes: readonly number[]): string | undefined {
  const rawHex = bytesToHex(fieldBytes);
  const option = field.options.find((item) => {
    const expectedHex = normalizeExpectedHex(item.value, fieldBytes.length);
    return expectedHex === rawHex;
  });

  return option?.label;
}

export function parseReceiveFrameFields(input: ReceiveFrameParseInput): ReceiveFrameParseOutcome {
  const fields: ReceiveParsedFieldValue[] = [];
  const issues: ReceiveIssue[] = [];
  const frameDefaultBigEndian = input.frame.options?.bigEndian ?? true;
  let offset = 0;

  for (const field of input.frame.fields) {
    const length = getFieldLength(field);
    if (length === 0) {
      issues.push(
        receiveIssue(
          'receive.field.lengthInvalid',
          `frame.${input.frame.id}.field.${field.id}.length`,
          `Field ${field.name} has invalid length.`,
        ),
      );
      continue;
    }

    const startOffset = offset;
    const endOffset = startOffset + length;
    offset = endOffset;

    if (field.dataParticipationType !== 'direct') {
      continue;
    }

    if (endOffset > input.bytes.length) {
      issues.push(
        receiveIssue(
          'receive.field.truncated',
          `frame.${input.frame.id}.field.${field.id}`,
          `Input bytes are shorter than field ${field.name}.`,
        ),
      );
      continue;
    }

    const fieldBytes = input.bytes.slice(startOffset, endOffset);
    const value = parsePrimitive(field, fieldBytes, frameDefaultBigEndian);
    const label = labelFor(field, fieldBytes);

    fields.push({
      frameId: input.frame.id,
      frameName: input.frame.name,
      fieldId: field.id,
      fieldName: field.name,
      dataType: field.dataType,
      offset: startOffset,
      length,
      rawHex: bytesToReadableHex(fieldBytes),
      value,
      displayValue: label ?? displayValueFor(field, value),
      ...(label ? { label } : {}),
    });
  }

  return {
    fields,
    issues,
  };
}
