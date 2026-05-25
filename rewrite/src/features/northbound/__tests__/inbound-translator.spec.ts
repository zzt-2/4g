import { describe, it, expect } from 'vitest';
import { translateTestCaseToTaskDefinition } from '../core/inbound-translator';
import type { TestCaseInfo, TestCaseStep } from '../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSendStep(overrides?: Partial<{ frameId: string; targetId: string; fieldValues?: Record<string, unknown> }>): TestCaseStep {
  return {
    kind: 'send',
    frameId: overrides?.frameId ?? 'frame-001',
    targetId: overrides?.targetId ?? 'target-serial-1',
    ...(overrides?.fieldValues !== undefined ? { fieldValues: overrides.fieldValues } : {}),
  };
}

function makeWaitConditionStep(overrides?: Partial<{ timeoutMs: number }>): TestCaseStep {
  return {
    kind: 'wait-condition',
    conditions: [
      { fieldId: 'voltage', operator: 'gte', value: 12.5 },
      { fieldId: 'current', operator: 'lt', value: 100 },
    ],
    ...(overrides?.timeoutMs !== undefined ? { timeoutMs: overrides.timeoutMs } : {}),
  };
}

function makeTestCase(overrides?: Partial<TestCaseInfo>): TestCaseInfo {
  return {
    testCaseId: 'tc-001',
    testCaseName: 'Voltage check',
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('translateTestCaseToTaskDefinition', () => {
  // 1. Single send step
  it('translates a single send step into a TaskDefinition with 1 send step', () => {
    const tc = makeTestCase({
      steps: [makeSendStep({ frameId: 'frame-A', targetId: 'target-B' })],
    });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.steps).toHaveLength(1);
    expect(def.steps[0]!.kind).toBe('send');
    const sendStep = def.steps[0] as { kind: 'send'; config: { frameId: string; targetId: string } };
    expect(sendStep.config.frameId).toBe('frame-A');
    expect(sendStep.config.targetId).toBe('target-B');
  });

  // 2. Single wait-condition step
  it('translates a single wait-condition step with conditions mapped', () => {
    const tc = makeTestCase({
      steps: [makeWaitConditionStep()],
    });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.steps).toHaveLength(1);
    expect(def.steps[0]!.kind).toBe('wait-condition');
    const wcStep = def.steps[0] as {
      kind: 'wait-condition';
      config: { conditions: { fieldId: string; operator: string; threshold: string | number }[]; timeoutMs: number };
    };
    expect(wcStep.config.conditions).toHaveLength(2);
    expect(wcStep.config.conditions[0]!.fieldId).toBe('voltage');
    expect(wcStep.config.conditions[0]!.operator).toBe('gte');
    expect(wcStep.config.conditions[0]!.threshold).toBe(12.5);
    expect(wcStep.config.conditions[1]!.fieldId).toBe('current');
    expect(wcStep.config.conditions[1]!.operator).toBe('lt');
    expect(wcStep.config.conditions[1]!.threshold).toBe(100);
  });

  // 3. Mixed send + wait-condition steps
  it('translates mixed send and wait-condition steps preserving order', () => {
    const tc = makeTestCase({
      steps: [
        makeSendStep({ frameId: 'frame-X', targetId: 'target-Y' }),
        makeWaitConditionStep(),
        makeSendStep({ frameId: 'frame-Z', targetId: 'target-W' }),
      ],
    });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.steps).toHaveLength(3);
    expect(def.steps[0]!.kind).toBe('send');
    expect(def.steps[1]!.kind).toBe('wait-condition');
    expect(def.steps[2]!.kind).toBe('send');

    // Verify the send steps kept their frame/target info
    const step0 = def.steps[0] as { kind: 'send'; config: { frameId: string; targetId: string } };
    expect(step0.config.frameId).toBe('frame-X');
    const step2 = def.steps[2] as { kind: 'send'; config: { frameId: string; targetId: string } };
    expect(step2.config.frameId).toBe('frame-Z');
  });

  // 4. Empty steps array
  it('produces a TaskDefinition with empty steps when input has no steps', () => {
    const tc = makeTestCase({ steps: [] });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.steps).toHaveLength(0);
  });

  // 5. Schedule and errorPolicy defaults
  it('sets schedule.kind to immediate and errorPolicy.onFailure to stop', () => {
    const tc = makeTestCase({ steps: [makeSendStep()] });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.schedule.kind).toBe('immediate');
    expect(def.errorPolicy.onFailure).toBe('stop');
  });

  // 6. Name matches testCaseName
  it('sets the TaskDefinition name to testCaseName', () => {
    const tc = makeTestCase({ testCaseName: 'Custom TC Name' });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.name).toBe('Custom TC Name');
  });

  // Additional: wait-condition step uses default timeoutMs when not provided
  it('uses default 5000ms timeout for wait-condition step when timeoutMs is omitted', () => {
    const tc = makeTestCase({
      steps: [makeWaitConditionStep()],
    });

    const def = translateTestCaseToTaskDefinition(tc);

    const wcStep = def.steps[0] as {
      kind: 'wait-condition';
      config: { timeoutMs: number };
    };
    expect(wcStep.config.timeoutMs).toBe(5000);
  });

  // Additional: wait-condition step uses explicit timeoutMs when provided
  it('uses explicit timeoutMs for wait-condition step when provided', () => {
    const tc = makeTestCase({
      steps: [makeWaitConditionStep({ timeoutMs: 10000 })],
    });

    const def = translateTestCaseToTaskDefinition(tc);

    const wcStep = def.steps[0] as {
      kind: 'wait-condition';
      config: { timeoutMs: number };
    };
    expect(wcStep.config.timeoutMs).toBe(10000);
  });

  // Additional: generated id contains the testCaseId
  it('generates a TaskDefinition id that includes the testCaseId', () => {
    const tc = makeTestCase({ testCaseId: 'tc-special-42' });

    const def = translateTestCaseToTaskDefinition(tc);

    expect(def.id).toContain('tc-special-42');
    expect(def.id).toContain('nb-');
  });

  // Additional: send step with fieldValues
  it('passes fieldValues through to the send step config', () => {
    const tc = makeTestCase({
      steps: [makeSendStep({ fieldValues: { temp: 42.5, mode: 'auto' } })],
    });

    const def = translateTestCaseToTaskDefinition(tc);

    const sendStep = def.steps[0] as {
      kind: 'send';
      config: { userFieldValues?: Record<string, unknown> };
    };
    expect(sendStep.config.userFieldValues).toEqual({ temp: 42.5, mode: 'auto' });
  });
});
