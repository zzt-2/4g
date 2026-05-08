import type { FrameAsset, ReadonlyFrameAsset } from '@/features/frame';
import {
  bytesToHex,
  bytesToUnsignedInteger,
  normalizeExpectedHex,
  receiveIssue,
} from './bytes';
import { cloneFrameReferences } from './clone';
import type {
  ReceiveIdentifierRule,
  ReceiveIssue,
} from './types';

export interface ReceiveFrameMatchOutcome {
  readonly matchedFrame?: FrameAsset;
  readonly issues: readonly ReceiveIssue[];
}

interface LegacyIdentifierRuleInput {
  readonly startIndex?: unknown;
  readonly endIndex?: unknown;
  readonly operator?: unknown;
  readonly value?: unknown;
}

function normalizeIndex(value: unknown): number | undefined {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numericValue) ? numericValue : undefined;
}

export function normalizeIdentifierRule(value: unknown): ReceiveIdentifierRule | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const rule = value as LegacyIdentifierRuleInput;
  const startIndex = normalizeIndex(rule.startIndex);
  const endIndex = normalizeIndex(rule.endIndex);
  const operator = typeof rule.operator === 'string' ? rule.operator : undefined;

  if (
    startIndex === undefined ||
    endIndex === undefined ||
    operator === undefined ||
    !Object.hasOwn(rule, 'value')
  ) {
    return undefined;
  }

  return {
    startIndex,
    endIndex,
    operator,
    value: rule.value,
  };
}

function normalizeFrameRules(frame: ReadonlyFrameAsset): ReceiveIdentifierRule[] {
  return (frame.identifierRules ?? [])
    .map(normalizeIdentifierRule)
    .filter((rule): rule is ReceiveIdentifierRule => rule !== undefined);
}

function compareRuleSegment(
  actualHex: string,
  expectedHex: string,
  operator: string,
): boolean {
  const normalizedOperator = operator.trim().toLowerCase();
  const actualNumber = bytesToUnsignedInteger(actualHex.match(/.{1,2}/g)?.map((item) => parseInt(item, 16)) ?? []);
  const expectedNumber = bytesToUnsignedInteger(
    expectedHex.match(/.{1,2}/g)?.map((item) => parseInt(item, 16)) ?? [],
  );

  switch (normalizedOperator) {
    case 'eq':
    case '==':
    case '=':
      return actualHex === expectedHex;
    case 'neq':
    case '!=':
      return actualHex !== expectedHex;
    case 'gt':
    case '>':
      return actualNumber > expectedNumber;
    case 'gte':
    case '>=':
      return actualNumber >= expectedNumber;
    case 'lt':
    case '<':
      return actualNumber < expectedNumber;
    case 'lte':
    case '<=':
      return actualNumber <= expectedNumber;
    case 'contains':
      return actualHex.includes(expectedHex);
    case 'not_contains':
      return !actualHex.includes(expectedHex);
    default:
      return false;
  }
}

function isRuleMatched(bytes: readonly number[], rule: ReceiveIdentifierRule): boolean {
  if (rule.startIndex < 0 || rule.endIndex < rule.startIndex || rule.endIndex >= bytes.length) {
    return false;
  }

  const segment = bytes.slice(rule.startIndex, rule.endIndex + 1);
  const expectedHex = normalizeExpectedHex(rule.value, segment.length);
  if (!expectedHex) {
    return false;
  }

  return compareRuleSegment(bytesToHex(segment), expectedHex, rule.operator);
}

function isFrameMatched(bytes: readonly number[], frame: ReadonlyFrameAsset): boolean {
  const rules = normalizeFrameRules(frame);
  if (rules.length === 0) {
    return false;
  }

  return rules.every((rule) => isRuleMatched(bytes, rule));
}

export function matchReceiveFrame(
  bytes: readonly number[],
  frames: readonly ReadonlyFrameAsset[],
): ReceiveFrameMatchOutcome {
  const receiveFrames = frames.filter((frame) => frame.direction === 'receive');

  if (receiveFrames.length === 0) {
    return {
      issues: [
        receiveIssue(
          'receive.frame.none',
          'reference.frames',
          'No receive frame reference is available.',
        ),
      ],
    };
  }

  const framesWithRules = receiveFrames.filter((frame) => normalizeFrameRules(frame).length > 0);
  if (framesWithRules.length === 0) {
    return {
      issues: [
        receiveIssue(
          'receive.frame.ruleMissing',
          'reference.frames',
          'No receive frame has identifier rules.',
        ),
      ],
    };
  }

  const matched = framesWithRules.find((frame) => isFrameMatched(bytes, frame));
  if (!matched) {
    return {
      issues: [
        receiveIssue(
          'receive.frame.unmatched',
          'batch.bytes',
          'Input bytes do not match any receive frame reference.',
          'warning',
        ),
      ],
    };
  }

  return {
    matchedFrame: cloneFrameReferences([matched])[0],
    issues: [],
  };
}
