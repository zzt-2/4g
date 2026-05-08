import { contextBridge, ipcRenderer } from 'electron';
import {
  createRewriteBridgeInfo,
  REWRITE_PLATFORM_BRIDGE_KEY,
  type TransportBridge,
  type TransportBridgeEvent,
  type TransportCommandResult,
  type SerialPortCandidate,
  type TransportConnectConfig,
} from '../../src/shared/platform-bridge';

const IPC_ENUMERATE = 'transport:enumerate-serial-ports';
const IPC_CONNECT = 'transport:serial-connect';
const IPC_DISCONNECT = 'transport:serial-disconnect';
const IPC_WRITE = 'transport:serial-write';
const IPC_CLEANUP = 'transport:cleanup';
const IPC_EVENT_CHANNEL = 'transport:event';

const IPC_NETWORK_CONNECT = 'transport:network-connect';
const IPC_NETWORK_DISCONNECT = 'transport:network-disconnect';
const IPC_NETWORK_WRITE = 'transport:network-write';
const IPC_NETWORK_CLEANUP = 'transport:network-cleanup';

const eventBuffer: TransportBridgeEvent[] = [];
const eventCallbacks: ((event: TransportBridgeEvent) => void)[] = [];
const connectionTypes = new Map<string, 'serial' | 'network'>();

ipcRenderer.on(IPC_EVENT_CHANNEL, (_e, event: TransportBridgeEvent) => {
  if (event.kind === 'connected' && event.target?.role === 'tcp-server-client') {
    connectionTypes.set(event.connectionId, 'network');
  }
  if (event.kind === 'disconnected') {
    connectionTypes.delete(event.connectionId);
  }

  eventBuffer.push(event);
  for (const cb of eventCallbacks) {
    try {
      cb(event);
    } catch {
      // ignore callback errors
    }
  }
});

const transportBridge: TransportBridge = {
  async enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]> {
    return ipcRenderer.invoke(IPC_ENUMERATE);
  },

  async connect(config: TransportConnectConfig): Promise<TransportCommandResult> {
    if (config.kind === 'serial') {
      const result = await ipcRenderer.invoke(IPC_CONNECT, config);
      if (result.ok) connectionTypes.set(config.id, 'serial');
      return result;
    }
    const result = await ipcRenderer.invoke(IPC_NETWORK_CONNECT, config);
    if (result.ok) connectionTypes.set(config.id, 'network');
    return result;
  },

  async disconnect(connectionId: string): Promise<TransportCommandResult> {
    const type = connectionTypes.get(connectionId);
    connectionTypes.delete(connectionId);
    if (type === 'serial') {
      return ipcRenderer.invoke(IPC_DISCONNECT, connectionId);
    }
    return ipcRenderer.invoke(IPC_NETWORK_DISCONNECT, connectionId);
  },

  async write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult> {
    const type = connectionTypes.get(connectionId);
    if (type === 'serial') {
      return ipcRenderer.invoke(IPC_WRITE, connectionId, bytes);
    }
    return ipcRenderer.invoke(IPC_NETWORK_WRITE, connectionId, bytes);
  },

  async cleanup(): Promise<TransportCommandResult> {
    connectionTypes.clear();
    const [serialResult, networkResult] = await Promise.all([
      ipcRenderer.invoke(IPC_CLEANUP),
      ipcRenderer.invoke(IPC_NETWORK_CLEANUP),
    ]);
    connectionTypes.clear();
    return {
      ok: serialResult.ok && networkResult.ok,
      events: [...serialResult.events, ...networkResult.events],
    };
  },

  drainEvents(): readonly TransportBridgeEvent[] {
    return eventBuffer.splice(0, eventBuffer.length);
  },

  onEvent(callback: (event: TransportBridgeEvent) => void): () => void {
    eventCallbacks.push(callback);
    return () => {
      const idx = eventCallbacks.indexOf(callback);
      if (idx >= 0) eventCallbacks.splice(idx, 1);
    };
  },
};

const rewriteBridge = Object.freeze({
  getBridgeInfo: () => createRewriteBridgeInfo('0.0.0'),
  transport: transportBridge,
});

contextBridge.exposeInMainWorld(REWRITE_PLATFORM_BRIDGE_KEY, rewriteBridge);
