import type { ReceiveIssue } from './types';

export interface NormalizedBytes {
  readonly bytes: readonly number[];
  readonly issues: readonly ReceiveIssue[];
}

export function receiveIssue(
  code: string,
  path: string,
  message: string,
  severity: ReceiveIssue['severity'] = 'error',
): ReceiveIssue {
  return {
    code,
    path,
    message,
    severity,
  };
}

export function normalizeByteArray(input: readonly number[], path = 'bytes'): NormalizedBytes {
  const issues: ReceiveIssue[] = [];
  const bytes: number[] = [];

  input.forEach((byte, index) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      issues.push(
        receiveIssue(
          'receive.input.byteInvalid',
          `${path}.${index}`,
          `Invalid byte at index ${index}: ${String(byte)}.`,
        ),
      );
      return;
    }

    bytes.push(byte);
  });

  return { bytes, issues };
}

export function bytesToHex(bytes: readonly number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
}

export function bytesToReadableHex(bytes: readonly number[]): string {
  return bytesToHex(bytes).match(/.{1,2}/g)?.join(' ') ?? '';
}

export function bytesToUnsignedInteger(bytes: readonly number[]): number {
  return bytes.reduce((value, byte) => value * 256 + byte, 0);
}

export function signedIntegerFromUnsigned(value: number, byteLength: number): number {
  const bitLength = byteLength * 8;
  const signLimit = 2 ** (bitLength - 1);
  const fullRange = 2 ** bitLength;
  return value >= signLimit ? value - fullRange : value;
}

function normalizeHexString(value: string): string | undefined {
  const compact = value.trim().replace(/\s+/g, '').replace(/_/g, '');
  if (!compact) {
    return undefined;
  }

  const withoutPrefixes = compact.replace(/0x/gi, '');
  if (/^[0-9a-fA-F]+$/.test(withoutPrefixes)) {
    return withoutPrefixes.length % 2 === 0
      ? withoutPrefixes.toUpperCase()
      : `0${withoutPrefixes.toUpperCase()}`;
  }

  return undefined;
}

function decimalToHex(value: number, byteLength: number): string | undefined {
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }

  const maxValue = 256 ** byteLength;
  if (value >= maxValue) {
    return undefined;
  }

  return Math.trunc(value).toString(16).padStart(byteLength * 2, '0').toUpperCase();
}

export function normalizeExpectedHex(value: unknown, byteLength: number): string | undefined {
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    const normalized = normalizeByteArray(value);
    return normalized.issues.length === 0 && normalized.bytes.length === byteLength
      ? bytesToHex(normalized.bytes)
      : undefined;
  }

  if (typeof value === 'number') {
    return decimalToHex(value, byteLength);
  }

  if (typeof value === 'string') {
    const hex = normalizeHexString(value);
    if (hex) {
      return hex.padStart(byteLength * 2, '0').slice(-byteLength * 2);
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? decimalToHex(numericValue, byteLength) : undefined;
  }

  return undefined;
}
