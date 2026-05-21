/**
 * Node `net` based TransportFacade for TCP integration tests.
 *
 * Provides a real `TransportFacade` that wraps Node's `net` module so that
 * `createRealNetworkAdapter` can operate over actual TCP connections in Vitest.
 */
import * as net from 'net';
import type {
  TransportBridgeEvent,
  TransportCommandResult,
  TransportConnectConfig,
} from '@/shared/platform-bridge';
import type { TransportFacade } from '@/platform';

function isoNow(): string {
  return new Date().toISOString();
}

function makeTarget(
  connectionId: string,
  kind: string,
  label: string,
  routeLabel: string,
): TransportBridgeEvent['target'] {
  return {
    targetId: `transport:${connectionId}`,
    connectionId,
    kind,
    role: `${kind}-peer`,
    label,
    routeLabel,
  };
}

/**
 * Create a `TransportFacade` backed by Node `net`.
 *
 * Supports `tcp-client` and `tcp-server` configs.
 */
export function createNodeNetTransportFacade(): TransportFacade {
  const eventQueue: TransportBridgeEvent[] = [];
  const sockets = new Map<string, net.Socket>();
  const servers = new Map<string, net.Server>();
  const eventListeners: Array<(event: TransportBridgeEvent) => void> = [];

  function enqueue(event: TransportBridgeEvent): void {
    eventQueue.push(event);
    for (const cb of eventListeners) cb(event);
  }

  return {
    async enumerateSerialPorts() {
      return [];
    },

    async connect(config: TransportConnectConfig): Promise<TransportCommandResult> {
      if (config.kind === 'tcp-client') {
        return new Promise<TransportCommandResult>((resolve) => {
          const socket = net.createConnection(
            { host: config.host, port: config.port },
            () => {
              const connectedEvt: TransportBridgeEvent = {
                kind: 'connected',
                connectionId: config.id,
                occurredAt: isoNow(),
                target: makeTarget(config.id, 'tcp-client', 'TCP client', `${config.host}:${config.port}`),
              };
              enqueue(connectedEvt);
              resolve({ ok: true, events: [connectedEvt] });
            },
          );

          socket.on('data', (data: Buffer) => {
            enqueue({
              kind: 'data',
              connectionId: config.id,
              occurredAt: isoNow(),
              bytes: [...data],
              byteLength: data.length,
            });
          });

          socket.on('close', () => {
            enqueue({
              kind: 'disconnected',
              connectionId: config.id,
              occurredAt: isoNow(),
            });
            sockets.delete(config.id);
          });

          socket.on('error', (err) => {
            enqueue({
              kind: 'error',
              connectionId: config.id,
              occurredAt: isoNow(),
              error: { kind: 'connect-failed', message: err.message, recoverable: true },
            });
          });

          sockets.set(config.id, socket);
        });
      }

      if (config.kind === 'tcp-server') {
        return new Promise<TransportCommandResult>((resolve) => {
          const server = net.createServer((socket) => {
            const clientId = `${config.id}-client-${Date.now()}`;
            sockets.set(clientId, socket);

            enqueue({
              kind: 'connected',
              connectionId: clientId,
              occurredAt: isoNow(),
              target: makeTarget(clientId, 'tcp-server', 'TCP server client', `${socket.remoteAddress}:${socket.remotePort}`),
            });

            socket.on('data', (data: Buffer) => {
              enqueue({
                kind: 'data',
                connectionId: clientId,
                occurredAt: isoNow(),
                bytes: [...data],
                byteLength: data.length,
              });
            });

            socket.on('close', () => {
              enqueue({
                kind: 'disconnected',
                connectionId: clientId,
                occurredAt: isoNow(),
              });
              sockets.delete(clientId);
            });
          });

          server.listen(config.port, config.host, () => {
            const evt: TransportBridgeEvent = {
              kind: 'connected',
              connectionId: config.id,
              occurredAt: isoNow(),
              target: makeTarget(config.id, 'tcp-server', 'TCP server', `${config.host}:${config.port}`),
            };
            enqueue(evt);
            servers.set(config.id, server);
            resolve({ ok: true, events: [evt] });
          });

          server.on('error', (err) => {
            resolve({
              ok: false,
              events: [],
              error: { kind: 'listen-failed', message: err.message, recoverable: false },
            });
          });
        });
      }

      return {
        ok: false,
        events: [],
        error: { kind: 'invalid-config', message: `Unsupported config kind`, recoverable: false },
      };
    },

    async disconnect(connectionId: string): Promise<TransportCommandResult> {
      const socket = sockets.get(connectionId);
      if (socket) {
        socket.destroy();
        sockets.delete(connectionId);
      }

      const server = servers.get(connectionId);
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        servers.delete(connectionId);
      }

      const evt: TransportBridgeEvent = {
        kind: 'disconnected',
        connectionId,
        occurredAt: isoNow(),
      };
      enqueue(evt);
      return { ok: true, events: [evt] };
    },

    async write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult> {
      const socket = sockets.get(connectionId);
      if (!socket) {
        return {
          ok: false,
          events: [],
          error: { kind: 'write-failed', message: `No socket for connection ${connectionId}`, recoverable: false },
        };
      }

      const buf = Buffer.from(bytes);
      socket.write(buf);

      const evt: TransportBridgeEvent = {
        kind: 'data',
        connectionId,
        occurredAt: isoNow(),
        bytes: [...bytes],
        byteLength: bytes.length,
      };
      enqueue(evt);
      return { ok: true, events: [evt] };
    },

    async cleanup(): Promise<TransportCommandResult> {
      for (const socket of sockets.values()) socket.destroy();
      sockets.clear();

      for (const server of servers.values()) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      servers.clear();

      return { ok: true, events: [] };
    },

    drainEvents(): readonly TransportBridgeEvent[] {
      const events = [...eventQueue];
      eventQueue.length = 0;
      return events;
    },

    onEvent(callback: (event: TransportBridgeEvent) => void): () => void {
      eventListeners.push(callback);
      return () => {
        const idx = eventListeners.indexOf(callback);
        if (idx >= 0) eventListeners.splice(idx, 1);
      };
    },
  };
}

/**
 * Start a TCP echo server on a random port.
 * Returns the server and the port it's listening on.
 */
export function startEchoServer(): Promise<{ server: net.Server; port: number; host: string }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.pipe(socket);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port, host: addr.address });
    });
  });
}

/**
 * Start a TCP server that calls `onData` for each connection's data.
 * Returns the server and the port.
 */
export function startTestServer(
  onData: (socket: net.Socket, data: Buffer) => void,
): Promise<{ server: net.Server; port: number; host: string }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('data', (data: Buffer) => onData(socket, data));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port, host: addr.address });
    });
  });
}
