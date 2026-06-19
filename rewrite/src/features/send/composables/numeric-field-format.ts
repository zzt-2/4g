import type { FrameFieldDefinition } from '@/features/frame';
import type { SendFieldValue } from '../core';

// Reuse the integer type set and ranges conceptually aligned with the encode layer
// to avoid divergence. The values mirror encode.ts INTEGER_TYPES / ranges.
const INTEGER_TYPES = new Set([
  'uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64',
]);
const BIGINT_TYPES = new Set(['uint64', 'int64']);

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

export interface ParsedInput {
  readonly ok: true;
  readonly value: SendFieldValue;
}
export interface ParsedError {
  readonly ok: false;
  readonly error: string;
}
export type ParseResult = ParsedInput | ParsedError;

/** A field can use hex display/input only if it is an integer numeric input field. */
export function isHexCapableField(f: FrameFieldDefinition): boolean {
  return INTEGER_TYPES.has(f.dataType);
}

function isEmpty(v: SendFieldValue | undefined): v is undefined | '' {
  return v === undefined || v === null || v === '';
}

function toBigintSafe(v: SendFieldValue): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? 1n : 0n;
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v) : null;
  const str = String(v).trim();
  if (str === '') return null;
  if (/^-?0x[0-9a-f]+$/i.test(str)) {
    const negative = str.startsWith('-');
    try {
      const bi = BigInt(negative ? str.slice(1) : str);
      return negative ? -bi : bi;
    } catch { return null; }
  }
  if (/^-?\d+$/.test(str)) {
    try { return BigInt(str); } catch { return null; }
  }
  return null;
}

function toNumberOrNan(v: SendFieldValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const str = String(v).trim();
  if (/^0x[0-9a-f]+$/i.test(str)) return parseInt(str, 16);
  return Number(str);
}

/** Render a stored value to the input-box display string for the given mode. */
export function valueToDisplayString(
  v: SendFieldValue | undefined,
  f: FrameFieldDefinition,
  hexMode: boolean,
): string {
  if (isEmpty(v)) return '';
  if (BIGINT_TYPES.has(f.dataType)) {
    const bi = toBigintSafe(v);
    if (bi === null) return String(v);
    if (hexMode) {
      const neg = bi < 0n;
      const mag = neg ? -bi : bi;
      return (neg ? '-0x' : '0x') + mag.toString(16).toUpperCase();
    }
    return bi.toString(10);
  }
  if (!isHexCapableField(f)) return String(v);
  const num = toNumberOrNan(v);
  if (Number.isNaN(num)) return String(v);
  if (hexMode) {
    const neg = num < 0;
    const mag = Math.abs(num);
    // Round to guard against float tail artifacts before hex conversion.
    return (neg ? '-0x' : '0x') + Math.round(mag).toString(16).toUpperCase();
  }
  // Dec branch: never use scientific notation. Integer types fall within safe
  // integer range (uint8-32 / int8-32), but guard anyway: safe int -> toString,
  // beyond -> BigInt fallback to force a plain decimal digit string.
  if (Number.isSafeInteger(num)) return num.toString();
  try {
    return BigInt(Math.trunc(num)).toString(10);
  } catch {
    return num.toString();
  }
}

/** Render the "other side" hint, e.g. Dec value -> "Hex=0xFF". Empty if not numeric. */
export function formatCounterpart(
  v: SendFieldValue | undefined,
  f: FrameFieldDefinition,
  hexMode: boolean,
): string {
  if (isEmpty(v)) return '';
  if (!isHexCapableField(f)) return '';
  if (BIGINT_TYPES.has(f.dataType)) {
    const bi = toBigintSafe(v);
    if (bi === null) return '';
    const neg = bi < 0n;
    const mag = neg ? -bi : bi;
    if (hexMode) return `Dec=${bi.toString(10)}`;
    return `Hex=${(neg ? '-0x' : '0x') + mag.toString(16).toUpperCase()}`;
  }
  const num = toNumberOrNan(v);
  if (Number.isNaN(num)) return '';
  if (hexMode) return `Dec=${num}`;
  const neg = num < 0;
  const mag = Math.abs(num);
  return `Hex=${(neg ? '-0x' : '0x') + mag.toString(16).toUpperCase()}`;
}

/** Parse a raw input string per mode + data type into a stored SendFieldValue. */
export function parseFieldInput(
  raw: string,
  hexMode: boolean,
  f: FrameFieldDefinition,
): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: '' };

  const hasHexPrefix = /^-?0x[0-9a-f]+$/i.test(trimmed);
  const useHex = hexMode || hasHexPrefix;

  if (BIGINT_TYPES.has(f.dataType)) {
    let bi: bigint | null = null;
    try {
      if (hasHexPrefix) {
        const negative = trimmed.startsWith('-');
        bi = BigInt(negative ? trimmed.slice(1) : trimmed);
        bi = negative ? -bi : bi;
      } else if (useHex && /^-?[0-9a-f]+$/i.test(trimmed)) {
        const negative = trimmed.startsWith('-');
        const body = negative ? trimmed.slice(1) : trimmed;
        bi = BigInt('0x' + body);
        bi = negative ? -bi : bi;
      } else if (/^-?\d+$/.test(trimmed)) {
        bi = BigInt(trimmed);
      }
    } catch { bi = null; }
    if (bi === null) return { ok: false, error: '无法解析为数值' };
    const range = BIGINT_RANGES[f.dataType];
    if (range && (bi < range[0] || bi > range[1])) {
      return { ok: false, error: `数值超出 ${f.dataType} 范围` };
    }
    // Store as string when beyond Number.MAX_SAFE_INTEGER, else number (matches existing uint64 storage).
    return { ok: true, value: Number.isSafeInteger(Number(bi)) ? Number(bi) : bi.toString(10) };
  }

  if (!isHexCapableField(f)) {
    // non-integer numeric (float/double) or unknown: store raw as number when possible, else string
    const num = Number(trimmed);
    return { ok: true, value: Number.isNaN(num) ? trimmed : num };
  }

  let num: number;
  if (hasHexPrefix) {
    num = parseInt(trimmed, 16);
  } else if (useHex) {
    if (!/^[0-9a-f]+$/i.test(trimmed)) return { ok: false, error: '无法解析为数值' };
    num = parseInt(trimmed, 16);
  } else {
    num = Number(trimmed);
    if (Number.isNaN(num)) return { ok: false, error: '无法解析为数值' };
  }
  const range = INTEGER_RANGES[f.dataType];
  if (range && (num < range[0] || num > range[1])) {
    return { ok: false, error: `数值超出 ${f.dataType} 范围` };
  }
  return { ok: true, value: num };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构造表达式字段的公式显示文本(翻译后人话)。
 * 把命中分支 expression 串里的变量 identifier 替换为来源字段名;
 * 映射不到则保留原 identifier。使用全词边界避免 var1 破坏 var10。
 * @param matchedIndex 命中分支索引(-1 = fallback/未知)
 * @returns 公式文本,如 "源字段 + 1";无 expressionConfig 返回 ''
 */
export function fieldExpressionLabel(
  field: FrameFieldDefinition,
  allFields: readonly FrameFieldDefinition[],
  matchedIndex: number,
): string {
  const cfg = field.expressionConfig;
  if (!cfg || cfg.expressions.length === 0) return '';

  const branches = cfg.expressions;
  const idx = matchedIndex >= 0 && matchedIndex < branches.length ? matchedIndex : 0;
  const branch = branches[idx]!;
  let expr = branch.expression;

  for (const v of cfg.variables) {
    if (!v.identifier) continue;
    const srcField = allFields.find((f) => f.id === v.fieldId);
    const replacement = srcField?.name ?? v.identifier;
    expr = expr.replace(new RegExp(`\\b${escapeRegExp(v.identifier)}\\b`, 'g'), replacement);
  }

  if (matchedIndex < 0 && branches.length > 1) {
    return `${expr} (可能多分支)`;
  }
  return expr;
}
