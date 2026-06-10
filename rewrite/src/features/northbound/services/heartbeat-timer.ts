import { TimerRegistry } from '@/shared/timer/timer-registry';
import type { HeartbeatOutbound } from '../core/types';

export interface HeartbeatTimer {
  start(subSysId: string, intervalSeconds?: number, onSend?: (body: HeartbeatOutbound) => Promise<void>): void;
  stop(): void;
  isRunning(): boolean;
}

const GROUP_ID = 'northbound-heartbeat';
const DEFAULT_INTERVAL_S = 15;

export function createHeartbeatTimer(): HeartbeatTimer {
  const registry = new TimerRegistry();
  let running = false;
  let currentSubSysId: string | undefined;
  let currentInterval = DEFAULT_INTERVAL_S;
  let currentOnSend: ((body: HeartbeatOutbound) => Promise<void>) | undefined;

  function start(
    subSysId: string,
    intervalSeconds = DEFAULT_INTERVAL_S,
    onSend?: (body: HeartbeatOutbound) => Promise<void>,
  ): void {
    stop();
    currentSubSysId = subSysId;
    currentInterval = intervalSeconds;
    currentOnSend = onSend;
    running = true;

    registry.register('heartbeat', () => {
      if (!currentSubSysId) return;
      const body: HeartbeatOutbound = {
        method: 'heartbeat',
        requestId: Math.floor(Math.random() * 2147483648),
        subSysType: '',
        subSysId: currentSubSysId,
        sessionId: 0,
        timer: currentInterval,
        time: new Date().toISOString().slice(0, 19),
      };
      currentOnSend?.(body).catch(() => {});
    }, intervalSeconds * 1000, GROUP_ID);
  }

  function stop(): void {
    if (running) {
      registry.clearGroup(GROUP_ID);
      running = false;
    }
  }

  function isRunning(): boolean {
    return running;
  }

  return { start, stop, isRunning };
}
