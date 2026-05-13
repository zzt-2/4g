import type { SendRequest, SendResult } from '@/features/send';
import type { ConditionMatchInput } from '../core';

export interface SendServiceProvider {
  execute(request: SendRequest): Promise<SendResult>;
}

export interface ReceiveEventSource {
  subscribe(handler: (input: ConditionMatchInput) => void): () => void;
}

export interface TimerService {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, intervalMs: number): number;
  clearInterval(id: number): void;
}
