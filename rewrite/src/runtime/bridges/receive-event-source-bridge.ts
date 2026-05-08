import type { ConditionMatchInput, ReceiveEventSource } from '@/features/task';

export class ReceiveEventSourceBridge implements ReceiveEventSource {
  private readonly handlers = new Set<
    (input: ConditionMatchInput) => void
  >();

  subscribe(handler: (input: ConditionMatchInput) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(inputs: readonly ConditionMatchInput[]): void {
    for (const input of inputs) {
      for (const handler of this.handlers) {
        handler(input);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
