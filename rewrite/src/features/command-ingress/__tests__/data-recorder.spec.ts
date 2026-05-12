import { describe, it, expect } from 'vitest';
import { createDataRecorder } from '../services/data-recorder';

describe('DataRecorder', () => {
  it('starts empty', () => {
    const recorder = createDataRecorder();
    expect(recorder.getRecords()).toHaveLength(0);
  });

  it('records data entries', () => {
    const recorder = createDataRecorder();
    recorder.record({ type: 'test', value: 42 });
    recorder.record({ type: 'test', value: 43 });

    const records = recorder.getRecords();
    expect(records).toHaveLength(2);
    expect(records[0].data).toEqual({ type: 'test', value: 42 });
    expect(records[1].data).toEqual({ type: 'test', value: 43 });
  });

  it('records timestamps', () => {
    const recorder = createDataRecorder();
    const before = Date.now();
    recorder.record('hello');
    const after = Date.now();

    const records = recorder.getRecords();
    expect(records[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(records[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('clear removes all records', () => {
    const recorder = createDataRecorder();
    recorder.record('a');
    recorder.record('b');
    expect(recorder.getRecords()).toHaveLength(2);

    recorder.clear();
    expect(recorder.getRecords()).toHaveLength(0);
  });

  it('getRecords returns a copy', () => {
    const recorder = createDataRecorder();
    recorder.record('x');

    const first = recorder.getRecords();
    const second = recorder.getRecords();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
