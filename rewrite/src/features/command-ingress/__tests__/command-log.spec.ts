import { describe, it, expect } from 'vitest';
import { createCommandLogRecorder } from '../core/command-log';

describe('CommandLogRecorder', () => {
  it('records entries with auto-generated id', () => {
    const recorder = createCommandLogRecorder();
    const entry = recorder.record({
      timestamp: '2026-05-13T00:00:00.000Z',
      commandCode: 1,
      result: 'pending',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.commandCode).toBe(1);
    expect(entry.result).toBe('pending');
  });

  it('completes entries by id', () => {
    const recorder = createCommandLogRecorder();
    const entry = recorder.record({
      timestamp: '2026-05-13T00:00:00.000Z',
      commandCode: 1,
      result: 'pending',
    });

    recorder.complete(entry.id, { result: 'success', durationMs: 42 });

    const all = recorder.getAll();
    expect(all[0]?.result).toBe('success');
    expect(all[0]?.durationMs).toBe(42);
  });

  it('returns all entries', () => {
    const recorder = createCommandLogRecorder();
    recorder.record({ timestamp: 't1', commandCode: 1, result: 'pending' });
    recorder.record({ timestamp: 't2', commandCode: 2, result: 'pending' });

    expect(recorder.getAll()).toHaveLength(2);
  });

  it('clears all entries', () => {
    const recorder = createCommandLogRecorder();
    recorder.record({ timestamp: 't1', commandCode: 1, result: 'pending' });
    recorder.clear();
    expect(recorder.getAll()).toHaveLength(0);
  });

  it('discards oldest entries beyond maxEntries', () => {
    const recorder = createCommandLogRecorder(3);
    recorder.record({ timestamp: 't1', commandCode: 1, result: 'pending' });
    recorder.record({ timestamp: 't2', commandCode: 2, result: 'pending' });
    recorder.record({ timestamp: 't3', commandCode: 3, result: 'pending' });
    recorder.record({ timestamp: 't4', commandCode: 4, result: 'pending' });

    const all = recorder.getAll();
    expect(all).toHaveLength(3);
    expect(all[0]?.commandCode).toBe(2);
    expect(all[2]?.commandCode).toBe(4);
  });

  it('complete ignores unknown id', () => {
    const recorder = createCommandLogRecorder();
    recorder.record({ timestamp: 't1', commandCode: 1, result: 'pending' });
    recorder.complete('nonexistent', { result: 'success' });
    expect(recorder.getAll()[0]?.result).toBe('pending');
  });
});
