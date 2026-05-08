import type { TransportEventSnapshot } from '@/features/connection';
import type { ReceiveInputSource, ReceiveInputEvent } from '@/features/receive';

export class ConnectionToReceiveInputSource implements ReceiveInputSource {
  constructor(
    private readonly dataEvents: readonly TransportEventSnapshot[],
  ) {}

  async drainEvents(): Promise<readonly ReceiveInputEvent[]> {
    if (this.dataEvents.length === 0) return [];

    return this.dataEvents
      .filter((event) => event.bytes !== undefined)
      .map(
        (event): ReceiveInputEvent => ({
          kind: 'batch',
          batch: {
            id: event.id,
            bytes: event.bytes!,
            receivedAt: event.occurredAt,
            source: {
              sourceId: event.connectionId,
              connectionId: event.connectionId,
              kind: event.target?.kind ?? 'serial',
              label: event.target?.label ?? event.connectionId,
              ...(event.target ? { targetId: event.target.targetId } : {}),
            },
          },
        }),
      );
  }
}
