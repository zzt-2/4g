import type { TransportEventConsumer } from '@/runtime/consumer-chain';
import type { ScoeCommandConfig, ScoeCommandFunction } from './types';

export interface ProtocolAdapter extends TransportEventConsumer {
  readonly protocolId: string;
}

export interface ParsedCommand {
  readonly commandId: string;
  readonly commandCode: string;
  readonly commandFunction: ScoeCommandFunction;
  readonly rawBytes: readonly number[];
  readonly resolvedParams: Readonly<Record<string, string>>;
  readonly commandConfig: ScoeCommandConfig;
  readonly connectionId: string;
  readonly occurredAt: string;
}
