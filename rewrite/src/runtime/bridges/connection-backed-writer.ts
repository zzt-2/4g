import type { ConnectionService } from '@/features/connection';
import type {
  SendTransportWriter,
  SendTransportWriteOutcome,
} from '@/features/send';

export class ConnectionBackedSendWriter implements SendTransportWriter {
  constructor(private readonly connectionService: ConnectionService) {}

  async writeBytes(
    connectionId: string,
    bytes: readonly number[],
  ): Promise<SendTransportWriteOutcome> {
    const outcome = await this.connectionService.write({
      connectionId,
      bytes,
    });

    if (!outcome.ok) {
      return {
        ok: false,
        bytesWritten: 0,
        error: {
          kind: outcome.error?.kind ?? 'write-failed',
          message: outcome.error?.message ?? 'Unknown write error',
        },
      };
    }

    const writeAccepted = outcome.events.find(
      (event) => event.kind === 'write-accepted',
    );

    return {
      ok: true,
      bytesWritten: writeAccepted?.byteLength ?? 0,
    };
  }
}
