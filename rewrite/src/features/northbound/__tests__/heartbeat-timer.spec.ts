import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHeartbeatTimer } from '../services/heartbeat-timer';

describe('createHeartbeatTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not running initially', () => {
    const timer = createHeartbeatTimer();
    expect(timer.isRunning()).toBe(false);
  });

  it('is running after start', () => {
    const timer = createHeartbeatTimer();
    timer.start('ADS_001');
    expect(timer.isRunning()).toBe(true);
  });

  it('is not running after stop', () => {
    const timer = createHeartbeatTimer();
    timer.start('ADS_001');
    timer.stop();
    expect(timer.isRunning()).toBe(false);
  });

  it('calls onSend with HeartbeatOutbound at interval', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const timer = createHeartbeatTimer();

    timer.start('ADS_001', 1, onSend);

    // Advance by 1 second
    vi.advanceTimersByTime(1000);

    expect(onSend).toHaveBeenCalledOnce();
    const body = onSend.mock.calls[0][0];
    expect(body.method).toBe('heartbeat');
    expect(body.subSysId).toBe('ADS_001');
    expect(body.timer).toBe(1);
  });

  it('uses default 15 second interval', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const timer = createHeartbeatTimer();

    timer.start('ADS_001', undefined, onSend);

    // Advance by 14 seconds — should NOT fire
    vi.advanceTimersByTime(14000);
    expect(onSend).not.toHaveBeenCalled();

    // Advance by 1 more second — should fire
    vi.advanceTimersByTime(1000);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('stops calling onSend after stop', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const timer = createHeartbeatTimer();

    timer.start('ADS_001', 1, onSend);
    vi.advanceTimersByTime(1000);
    expect(onSend).toHaveBeenCalledOnce();

    timer.stop();
    vi.advanceTimersByTime(5000);
    expect(onSend).toHaveBeenCalledOnce(); // no additional calls
  });

  it('restart replaces previous timer', () => {
    const onSend1 = vi.fn().mockResolvedValue(undefined);
    const onSend2 = vi.fn().mockResolvedValue(undefined);
    const timer = createHeartbeatTimer();

    timer.start('ADS_001', 1, onSend1);
    vi.advanceTimersByTime(1000);
    expect(onSend1).toHaveBeenCalledOnce();

    timer.start('ADS_002', 2, onSend2);
    vi.advanceTimersByTime(2000);
    expect(onSend1).toHaveBeenCalledOnce(); // no more calls
    expect(onSend2).toHaveBeenCalledOnce();
    const body = onSend2.mock.calls[0][0];
    expect(body.subSysId).toBe('ADS_002');
  });

  it('onSend error does not crash timer', () => {
    const onSend = vi.fn().mockRejectedValue(new Error('network'));
    const timer = createHeartbeatTimer();

    timer.start('ADS_001', 1, onSend);

    // Should not throw
    vi.advanceTimersByTime(1000);
    expect(onSend).toHaveBeenCalledOnce();

    // Timer should still fire again
    vi.advanceTimersByTime(1000);
    expect(onSend).toHaveBeenCalledTimes(2);
  });
});
