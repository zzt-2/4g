import type { ConditionMatchInput } from '../core';
import type { ReceiveEventSource } from './ports';

export interface FakeReceiveEventSourceOptions {
  readonly autoEmit?: readonly ConditionMatchInput[];
  readonly autoEmitIntervalMs?: number;
}

export function createFakeReceiveEventSource(): ReceiveEventSource & {
  emit(input: ConditionMatchInput): void;
  readonly emitted: readonly ConditionMatchInput[];
} {
  const emitted: ConditionMatchInput[] = [];
  const handlers = new Set<(input: ConditionMatchInput) => void>();

  return {
    get emitted() {
      return emitted;
    },

    emit(input: ConditionMatchInput): void {
      emitted.push(input);
      for (const handler of handlers) {
        handler(input);
      }
    },

    subscribe(handler: (input: ConditionMatchInput) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
