import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimerRegistry } from './timer-registry';

describe('TimerRegistry', () => {
  let registry: TimerRegistry;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers and fires a timer', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    expect(registry.getActiveCount()).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('clears a timer and it stops firing', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    registry.clear('t1');
    expect(registry.getActiveCount()).toBe(0);

    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('clears a group of timers', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    registry.register('t1', cb1, 1000, 'groupA');
    registry.register('t2', cb2, 1000, 'groupA');
    registry.register('t3', cb3, 1000, 'groupB');

    registry.clearGroup('groupA');
    expect(registry.getActiveCount()).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  it('pauseAll stops all timers', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    registry.pauseAll();

    expect(registry.getActiveCount()).toBe(0);

    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('resumeAll restarts timers after pause', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    registry.pauseAll();

    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();

    registry.resumeAll();
    expect(registry.getActiveCount()).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire cleared timer', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    registry.clear('t1');

    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not fire during pause', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    vi.advanceTimersByTime(500);
    registry.pauseAll();

    vi.advanceTimersByTime(10000);
    expect(cb).toHaveBeenCalledTimes(0);

    registry.resumeAll();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('registering with same id replaces previous timer', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    registry.register('t1', cb1, 1000);
    registry.register('t1', cb2, 500);

    vi.advanceTimersByTime(500);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('clearing non-existent id is a no-op', () => {
    registry = new TimerRegistry();
    expect(() => registry.clear('nonexistent')).not.toThrow();
  });

  it('double pauseAll is idempotent', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.register('t1', cb, 1000);
    registry.pauseAll();
    registry.pauseAll();

    registry.resumeAll();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('new register while paused does not start timer', () => {
    vi.useFakeTimers();
    registry = new TimerRegistry();
    const cb = vi.fn();

    registry.pauseAll();
    registry.register('t1', cb, 1000);

    expect(registry.getActiveCount()).toBe(0);

    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();

    registry.resumeAll();
    expect(registry.getActiveCount()).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
