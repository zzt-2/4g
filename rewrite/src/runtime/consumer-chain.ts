import type { TransportEventSnapshot } from '@/features/connection';

export interface TransportEventConsumer {
  readonly id: string;
  consume(events: readonly TransportEventSnapshot[]): Promise<ConsumerResult>;
}

export interface ConsumerResult {
  readonly consumed: readonly TransportEventSnapshot[];
  readonly remaining: readonly TransportEventSnapshot[];
}
