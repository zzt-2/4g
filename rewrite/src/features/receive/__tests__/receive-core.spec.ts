import { describe, expect, it } from 'vitest';
import {
  processReceiveBatch,
  type ReceiveFrameReferenceSnapshot,
  type ReceiveInputBatch,
} from '../core';
import {
  invalidReceiveBatchFixture,
  matchedReceiveBatchFixture,
  outboundLikeFrameFixture,
  receiveFrameWithoutRulesFixture,
  receiveTelemetryFrameFixture,
  truncatedReceiveBatchFixture,
  unmatchedReceiveBatchFixture,
} from '../fixtures/receive-fixtures';

function reference(
  frames: ReceiveFrameReferenceSnapshot['frames'] = [receiveTelemetryFrameFixture],
): ReceiveFrameReferenceSnapshot {
  return {
    frames,
    referenceVersion: 1,
    refreshedAt: '2026-05-04T00:00:00.000Z',
  };
}

function process(batch: ReceiveInputBatch, frames = reference().frames) {
  return processReceiveBatch({
    batch,
    reference: reference(frames),
    processedAt: '2026-05-04T00:00:03.000Z',
  });
}

describe('receive core matching and parsing', () => {
  it('matches receive-direction frame references and parses direct fields only', () => {
    const outcome = process(matchedReceiveBatchFixture, [
      outboundLikeFrameFixture,
      receiveTelemetryFrameFixture,
    ]);

    expect(outcome.kind).toBe('matched');
    expect(outcome.matchedFrame).toMatchObject({
      frameId: receiveTelemetryFrameFixture.id,
      frameName: receiveTelemetryFrameFixture.name,
      byteLength: 5,
    });
    expect(outcome.fields.map((field) => field.fieldId)).toEqual([
      'field-header',
      'field-mode',
      'field-temperature',
    ]);
    expect(outcome.fields.find((field) => field.fieldId === 'field-mode')).toMatchObject({
      value: 1,
      displayValue: '正常',
      label: '正常',
    });
    expect(outcome.fields.find((field) => field.fieldId === 'field-temperature')).toMatchObject({
      value: 10,
      displayValue: '10',
      rawHex: '00 64',
    });
    expect(outcome.statsDelta).toMatchObject({
      batchCount: 1,
      byteCount: 5,
      matchedCount: 1,
      unmatchedCount: 0,
      parseErrorCount: 0,
    });
  });

  it('keeps legacy identifier rules as an AND match', () => {
    const modeMismatchBatch: ReceiveInputBatch = {
      ...matchedReceiveBatchFixture,
      id: 'receive-batch-mode-mismatch',
      bytes: [0xaa, 0x02, 0x00, 0x64, 0xff],
    };

    const outcome = process(modeMismatchBatch);

    expect(outcome.kind).toBe('unmatched');
    expect(outcome.issues.map((issue) => issue.code)).toEqual(['receive.frame.unmatched']);
    expect(outcome.statsDelta.unmatchedCount).toBe(1);
  });

  it('separates unavailable references and missing rules from unmatched input', () => {
    const noFrameOutcome = process(matchedReceiveBatchFixture, []);
    const missingRuleOutcome = process(matchedReceiveBatchFixture, [
      receiveFrameWithoutRulesFixture,
    ]);

    expect(noFrameOutcome.kind).toBe('config-error');
    expect(noFrameOutcome.issues[0]?.code).toBe('receive.frame.none');
    expect(missingRuleOutcome.kind).toBe('config-error');
    expect(missingRuleOutcome.issues[0]?.code).toBe('receive.frame.ruleMissing');
  });

  it('classifies invalid, unmatched, and truncated input separately', () => {
    const invalidOutcome = process(invalidReceiveBatchFixture);
    const unmatchedOutcome = process(unmatchedReceiveBatchFixture);
    const truncatedOutcome = process(truncatedReceiveBatchFixture);

    expect(invalidOutcome.kind).toBe('input-error');
    expect(invalidOutcome.issues[0]?.code).toBe('receive.input.byteInvalid');
    expect(unmatchedOutcome.kind).toBe('unmatched');
    expect(truncatedOutcome.kind).toBe('parse-error');
    expect(truncatedOutcome.issues.map((issue) => issue.code)).toContain(
      'receive.field.truncated',
    );
    expect(truncatedOutcome.fields.map((field) => field.fieldId)).toEqual([
      'field-header',
      'field-mode',
    ]);
  });
});
