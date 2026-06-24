import { describe, it, expect } from 'vitest';
import { formatProgressPct, formatProgressLabel } from '../task-progress-format';
import type { TaskProgress } from '@/features/task';

describe('task-progress-format', () => {
  const baseProgress = (over: Partial<TaskProgress>): TaskProgress =>
    ({ stepsTotal: 3, stepsCompleted: 1, sendsTotal: null, sendsCompleted: 0, ...over } as TaskProgress);

  it('prefers sends dimension when sendsTotal is non-null', () => {
    const p = baseProgress({ sendsTotal: 15, sendsCompleted: 7 });
    expect(formatProgressLabel(p)).toBe('7/15');
    expect(formatProgressPct(p)).toBe(47);
  });

  it('falls back to steps dimension when sendsTotal is null', () => {
    const p = baseProgress({ sendsTotal: null, stepsTotal: 3, stepsCompleted: 2 });
    expect(formatProgressLabel(p)).toBe('2/3');
    expect(formatProgressPct(p)).toBe(67);
  });

  it('returns 0 pct and empty label when progress is null', () => {
    expect(formatProgressPct(null)).toBe(0);
    expect(formatProgressLabel(null)).toBe('');
  });

  it('handles sendsTotal=0 without divide-by-zero (falls back to steps)', () => {
    const p = baseProgress({ sendsTotal: 0, sendsCompleted: 0, stepsTotal: 2, stepsCompleted: 1 });
    expect(formatProgressLabel(p)).toBe('1/2');
    expect(formatProgressPct(p)).toBe(50);
  });
});
