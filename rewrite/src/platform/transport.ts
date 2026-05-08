import type {
  TransportBridge,
  TransportBridgeEvent,
  TransportCommandResult,
  SerialPortCandidate,
  TransportConnectConfig,
} from '@/shared/platform-bridge';

export type {
  TransportBridge,
  TransportBridgeEvent,
  TransportCommandResult,
  SerialPortCandidate,
  TransportConnectConfig,
};

export interface TransportFacade {
  enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]>;
  connect(config: TransportConnectConfig): Promise<TransportCommandResult>;
  disconnect(connectionId: string): Promise<TransportCommandResult>;
  write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult>;
  cleanup(): Promise<TransportCommandResult>;
  drainEvents(): readonly TransportBridgeEvent[];
  onEvent(callback: (event: TransportBridgeEvent) => void): () => void;
}

export function createTransportFacade(bridge: TransportBridge): TransportFacade {
  return {
    enumerateSerialPorts: () => bridge.enumerateSerialPorts(),
    connect: (config) => bridge.connect(config),
    disconnect: (connectionId) => bridge.disconnect(connectionId),
    write: (connectionId, bytes) => bridge.write(connectionId, bytes),
    cleanup: () => bridge.cleanup(),
    drainEvents: () => bridge.drainEvents(),
    onEvent: (callback) => bridge.onEvent(callback),
  };
}
