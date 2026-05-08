import type {
  ConnectionService,
  TransportTargetSnapshot,
} from '@/features/connection';
import type { SendTargetResolver } from '@/features/send';

export class ConnectionBackedTargetResolver implements SendTargetResolver {
  constructor(private readonly connectionService: ConnectionService) {}

  resolveTarget(targetId: string): TransportTargetSnapshot | undefined {
    return this.connectionService
      .listTransportTargets()
      .find((target) => target.targetId === targetId);
  }
}
