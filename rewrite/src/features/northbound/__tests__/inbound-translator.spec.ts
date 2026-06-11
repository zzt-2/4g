import { describe, it, expect } from 'vitest';
import {
  translateTestCaseToMockTaskDefinition,
  translateTestCaseToTaskDefinition,
} from '../core/inbound-translator';
import type { TestCaseInfo, InputPar } from '../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInputPar(overrides?: Partial<InputPar>): InputPar {
  return {
    parId: overrides?.parId ?? 'x',
    value: overrides?.value ?? '1',
  };
}

function makeTestCase(overrides?: Partial<TestCaseInfo>): TestCaseInfo {
  return {
    testCaseId: overrides?.testCaseId ?? 'V3_Test_Ping_UL',
    deviceIds: overrides?.deviceIds ?? ['JG_UE_001'],
    masterTest: overrides?.masterTest ?? true,
    testMode: overrides?.testMode ?? 1,
    ephMode: overrides?.ephMode ?? 1,
    orbitInfo: overrides?.orbitInfo ?? null,
    inputPars: overrides?.inputPars ?? [makeInputPar()],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('translateTestCaseToMockTaskDefinition', () => {
  it('produces a TaskDefinition with a single 1.5s delay step', () => {
    const tc = makeTestCase();

    const def = translateTestCaseToMockTaskDefinition(tc);

    expect(def.steps).toHaveLength(1);
    expect(def.steps[0]!.kind).toBe('delay');
    const delayStep = def.steps[0] as { kind: 'delay'; config: { durationMs: number } };
    expect(delayStep.config.durationMs).toBe(1500);
  });

  it('uses testCaseId as the task name', () => {
    const tc = makeTestCase({ testCaseId: 'V3_Test_Ping_UL' });

    const def = translateTestCaseToMockTaskDefinition(tc);

    expect(def.name).toBe('V3_Test_Ping_UL');
  });

  it('generates an id prefixed with nb- and containing the testCaseId', () => {
    const tc = makeTestCase({ testCaseId: 'V3_Test_Ping_UL' });

    const def = translateTestCaseToMockTaskDefinition(tc);

    expect(def.id).toContain('nb-');
    expect(def.id).toContain('V3_Test_Ping_UL');
  });

  it('defaults schedule to immediate and errorPolicy.onFailure to stop', () => {
    const tc = makeTestCase();

    const def = translateTestCaseToMockTaskDefinition(tc);

    expect(def.schedule.kind).toBe('immediate');
    expect(def.errorPolicy.onFailure).toBe('stop');
  });

  it('ignores inputPars content in MVP (still single delay step)', () => {
    const tc = makeTestCase({
      inputPars: [
        makeInputPar({ parId: 'p1', value: '42' }),
        makeInputPar({ parId: 'p2', value: 'hello' }),
        makeInputPar({ parId: 'p3', value: 'true' }),
      ],
    });

    const def = translateTestCaseToMockTaskDefinition(tc);

    expect(def.steps).toHaveLength(1);
    expect(def.steps[0]!.kind).toBe('delay');
  });

  it('handles empty deviceIds and empty inputPars without crashing', () => {
    const tc = makeTestCase({ deviceIds: [], inputPars: [] });

    const def = translateTestCaseToMockTaskDefinition(tc);

    expect(def.steps).toHaveLength(1);
    expect(def.name).toBe('V3_Test_Ping_UL');
  });
});

describe('translateTestCaseToTaskDefinition (real translation placeholder)', () => {
  it('currently falls back to mock translation (single delay step)', () => {
    const tc = makeTestCase();

    const def = translateTestCaseToTaskDefinition(tc);

    // Until frame/condition feature wiring lands, real translation == mock
    expect(def.steps).toHaveLength(1);
    expect(def.steps[0]!.kind).toBe('delay');
    const delayStep = def.steps[0] as { kind: 'delay'; config: { durationMs: number } };
    expect(delayStep.config.durationMs).toBe(1500);
  });
});
