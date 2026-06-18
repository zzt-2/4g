import { describe, it, expect } from 'vitest';
import { createReportDataCollector } from '../services/report-data-collector';
import type { TaskStepResult } from '@/features/task/core';

describe('report-data-collector', () => {
  it('accumulates processSteps from send results', () => {
    const c = createReportDataCollector();
    const result: TaskStepResult = {
      stepIndex: 0,
      iteration: 0,
      kind: 'send',
      sendResult: { frameId: 'rc-laser-on', targetId: 'UE:1', resolvedFieldValues: { power: 50 } } as any,
    };
    c.onStepResult('inst-1', result);
    const data = c.collect('inst-1');
    expect(data.processSteps.length).toBeGreaterThanOrEqual(1);
    expect(data.processSteps[0].stepName).toContain('step-0');
  });

  it('accumulates checkPoints from wait results', () => {
    const c = createReportDataCollector();
    const result: TaskStepResult = {
      stepIndex: 1,
      iteration: 0,
      kind: 'wait-condition',
      matched: true,
      matchedValue: 85,
      timedOut: false,
    };
    c.onStepResult('inst-1', result);
    const data = c.collect('inst-1');
    expect(data.checkPoints.length).toBeGreaterThanOrEqual(1);
    expect(data.checkPoints[0].result).toBe('通过');
  });

  it('marks unmatched wait as 未通过', () => {
    const c = createReportDataCollector();
    const result: TaskStepResult = {
      stepIndex: 1,
      iteration: 0,
      kind: 'wait-condition',
      matched: false,
      timedOut: true,
    };
    c.onStepResult('inst-1', result);
    const data = c.collect('inst-1');
    expect(data.checkPoints[0].result).toBe('未通过');
  });

  it('clears data after collect', () => {
    const c = createReportDataCollector();
    c.onStepResult('inst-1', { stepIndex: 0, iteration: 0, kind: 'delay', completed: true });
    c.collect('inst-1');
    expect(c.collect('inst-1').processSteps).toHaveLength(0);
  });

  it('isolates data per instanceId', () => {
    const c = createReportDataCollector();
    c.onStepResult('inst-a', { stepIndex: 0, iteration: 0, kind: 'delay', completed: true });
    c.onStepResult('inst-b', { stepIndex: 0, iteration: 0, kind: 'delay', completed: true });
    expect(c.collect('inst-a').processSteps).toHaveLength(1);
    expect(c.collect('inst-b').processSteps).toHaveLength(1);
  });
});
