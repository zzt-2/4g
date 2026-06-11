import { ipcMain, type BrowserWindow } from 'electron';
import net from 'node:net';
import dgram from 'node:dgram';
import type {
  TransportBridgeEvent,
  TransportBridgeEventError,
  TransportCommandResult,
  TcpClientConnectConfig,
  TcpServerConnectConfig,
  UdpConnectConfig,
  TransportConnectConfig,
} from '../../src/shared/platform-bridge';
import { storageFilter } from './storage-filter';

const IPC_NETWORK_CONNECT = 'transport:network-connect';
const IPC_NETWORK_DISCONNECT = 'transport:network-disconnect';
const IPC_NETWORK_WRITE = 'transport:network-write';
const IPC_NETWORK_CLEANUP = 'transport:network-cleanup';
const IPC_EVENT_CHANNEL = 'transport:event';

// --- Managed connection types ---

interface ManagedTcpClient {
  type: 'tcp-client';
  socket: net.Socket;
  id: string;
  config: TcpClientConnectConfig;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedTcpServer {
  type: 'tcp-server';
  server: net.Server;
  id: string;
  config: TcpServerConnectConfig;
  clients: Map<string, ManagedTcpServerClient>;
}

interface ManagedTcpServerClient {
  type: 'tcp-server-client';
  socket: net.Socket;
  id: string;
  listenerId: string;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagedUdp {
  type: 'udp';
  socket: dgram.Socket;
  id: string;
  config: UdpConnectConfig;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

type ManagedConnection =
  | ManagedTcpClient
  | ManagedTcpServer
  | ManagedTcpServerClient
  | ManagedUdp;

// --- Batch infrastructure ---

interface BatchConfig {
  readonly maxBatchBytes: number;
  readonly maxBatchWindowMs: number;
  readonly maxQueueDepth: number;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchBytes: 4096,
  maxBatchWindowMs: 50,
  maxQueueDepth: 100,
};

let connections = new Map<string, ManagedConnection>();
let eventQueue: TransportBridgeEvent[] = [];
const batchConfig: BatchConfig = DEFAULT_BATCH_CONFIG;
const intentionalDisconnect = new Set<string>();

function now(): string {
  return new Date().toISOString();
}

function emitToRenderer(win: BrowserWindow, event: TransportBridgeEvent): void {
  if (eventQueue.length >= batchConfig.maxQueueDepth) {
    eventQueue.shift();
  }
  eventQueue.push(event);
  try {
    win.webContents.send(IPC_EVENT_CHANNEL, event);
  } catch {
    // webContents may be destroyed during shutdown
  }
}

interface Batchable {
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

function flushBatch(batchable: Batchable, connectionId: string, win: BrowserWindow): void {
  if (batchable.batchBuffer.length === 0) return;
  const bytes = batchable.batchBuffer;
  batchable.batchBuffer = [];

  if (batchable.batchTimer !== null) {
    clearTimeout(batchable.batchTimer);
    batchable.batchTimer = null;
  }

  emitToRenderer(win, {
    kind: 'data',
    connectionId,
    occurredAt: now(),
    bytes,
    byteLength: bytes.length,
  });
}

function scheduleBatchFlush(batchable: Batchable, connectionId: string, win: BrowserWindow): void {
  if (batchable.batchBuffer.length >= batchConfig.maxBatchBytes) {
    flushBatch(batchable, connectionId, win);
    return;
  }
  if (batchable.batchTimer !== null) return;
  batchable.batchTimer = setTimeout(() => {
    batchable.batchTimer = null;
    flushBatch(batchable, connectionId, win);
  }, batchConfig.maxBatchWindowMs);
}

function cleanupBatchable(batchable: Batchable): void {
  if (batchable.batchBuffer.length > 0) {
    batchable.batchBuffer = [];
  }
  if (batchable.batchTimer !== null) {
    clearTimeout(batchable.batchTimer);
    batchable.batchTimer = null;
  }
}

function toError(err: unknown): TransportBridgeEventError {
  if (err instanceof Error) {
    return { kind: 'open-failed', message: err.message, recoverable: true };
  }
  return { kind: 'open-failed', message: String(err), recoverable: true };
}

// --- TCP Client ---

async function handleTcpClientConnect(
  config: TcpClientConnectConfig,
  win: BrowserWindow,
): Promise<TransportCommandResult> {
  if (connections.has(config.id)) {
    return {
      ok: false,
      events: [],
      error: {
        kind: 'invalid-config',
        message: `Connection already open: ${config.id}`,
        recoverable: true,
      },
    };
  }

  return new Promise<TransportCommandResult>((resolve) => {
    let settled = false;
    const socket = new net.Socket();
    const conn: ManagedTcpClient = {
      type: 'tcp-client',
      socket,
      id: config.id,
      config,
      batchBuffer: [],
      batchTimer: null,
    };

    socket.setNoDelay(true);
    socket.setTimeout(5000);

    socket.on('connect', () => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      connections.set(config.id, conn);

      const connectedEvent: TransportBridgeEvent = {
        kind: 'connected',
        connectionId: config.id,
        occurredAt: now(),
        target: {
          targetId: `tcp-client:${config.host}:${config.port}`,
          label: `${config.host}:${config.port}`,
          role: 'tcp-client-peer',
          kind: 'tcp-client',
          routeLabel: `TCP→${config.host}:${config.port}`,
        },
      };
      resolve({ ok: true, events: [connectedEvent] });
    });

    socket.on('data', (chunk: Buffer) => {
      if (storageFilter.shouldStore(config.id, chunk)) {
        storageFilter.storeData(chunk);
        return;
      }
      for (let i = 0; i < chunk.length; i++) {
        conn.batchBuffer.push(chunk[i] as number);
      }
      scheduleBatchFlush(conn, config.id, win);
    });

    socket.on('close', () => {
      cleanupBatchable(conn);
      connections.delete(config.id);
      if (!intentionalDisconnect.has(config.id)) {
        emitToRenderer(win, {
          kind: 'disconnected',
          connectionId: config.id,
          occurredAt: now(),
        });
      }
      intentionalDisconnect.delete(config.id);
    });

    socket.on('error', (err: Error) => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, events: [], error: toError(err) });
        return;
      }
      emitToRenderer(win, {
        kind: 'error',
        connectionId: config.id,
        occurredAt: now(),
        error: { kind: 'resource-unavailable', message: err.message, recoverable: true },
      });
    });

    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({
          ok: false,
          events: [],
          error: {
            kind: 'open-failed',
            message: `Connection timeout: ${config.host}:${config.port}`,
            recoverable: true,
          },
        });
      }
    });

    socket.connect(config.port, config.host);
  });
}

// --- TCP Server ---

async function handleTcpServerConnect(
  config: TcpServerConnectConfig,
  win: BrowserWindow,
): Promise<TransportCommandResult> {
  if (connections.has(config.id)) {
    return {
      ok: false,
      events: [],
      error: {
        kind: 'invalid-config',
        message: `Connection already open: ${config.id}`,
        recoverable: true,
      },
    };
  }

  return new Promise<TransportCommandResult>((resolve) => {
    const server = net.createServer();
    const conn: ManagedTcpServer = {
      type: 'tcp-server',
      server,
      id: config.id,
      config,
      clients: new Map(),
    };

    server.on('connection', (socket: net.Socket) => {
      const remoteAddress = socket.remoteAddress ?? 'unknown';
      const remotePort = socket.remotePort ?? 0;
      const clientId = `${config.id}::client:${remoteAddress}:${remotePort}`;

      const existing = conn.clients.get(clientId);
      if (existing) {
        cleanupBatchable(existing);
        existing.socket.destroy();
        emitToRenderer(win, { kind: 'disconnected', connectionId: clientId, occurredAt: now() });
      }

      const clientConn: ManagedTcpServerClient = {
        type: 'tcp-server-client',
        socket,
        id: clientId,
        listenerId: config.id,
        batchBuffer: [],
        batchTimer: null,
      };

      conn.clients.set(clientId, clientConn);
      connections.set(clientId, clientConn);

      const connectedEvent: TransportBridgeEvent = {
        kind: 'connected',
        connectionId: clientId,
        occurredAt: now(),
        target: {
          targetId: `tcp-server-client:${remoteAddress}:${remotePort}`,
          label: `${remoteAddress}:${remotePort}`,
          role: 'tcp-server-client',
          kind: 'tcp-server',
          routeLabel: `TCP Server client←${remoteAddress}:${remotePort}`,
        },
      };
      emitToRenderer(win, connectedEvent);

      socket.on('data', (chunk: Buffer) => {
        if (storageFilter.shouldStore(clientId, chunk)) {
          storageFilter.storeData(chunk);
          return;
        }
        for (let i = 0; i < chunk.length; i++) {
          clientConn.batchBuffer.push(chunk[i] as number);
        }
        scheduleBatchFlush(clientConn, clientId, win);
      });

      socket.on('close', () => {
        cleanupBatchable(clientConn);
        conn.clients.delete(clientId);
        connections.delete(clientId);
        if (!intentionalDisconnect.has(clientId)) {
          emitToRenderer(win, {
            kind: 'disconnected',
            connectionId: clientId,
            occurredAt: now(),
          });
        }
        intentionalDisconnect.delete(clientId);
      });

      socket.on('error', (err: Error) => {
        emitToRenderer(win, {
          kind: 'error',
          connectionId: clientId,
          occurredAt: now(),
          error: { kind: 'resource-unavailable', message: err.message, recoverable: true },
        });
      });
    });

    server.on('error', (err: Error) => {
      resolve({ ok: false, events: [], error: toError(err) });
    });

    server.listen(config.port, config.host, () => {
      connections.set(config.id, conn);

      const connectedEvent: TransportBridgeEvent = {
        kind: 'connected',
        connectionId: config.id,
        occurredAt: now(),
        target: {
          targetId: `tcp-server:${config.host}:${config.port}`,
          label: `${config.host}:${config.port}`,
          role: 'tcp-server-listener',
          kind: 'tcp-server',
          routeLabel: `TCP Server ${config.host}:${config.port}`,
        },
      };
      resolve({ ok: true, events: [connectedEvent] });
    });
  });
}

// --- UDP ---

async function handleUdpConnect(
  config: UdpConnectConfig,
  win: BrowserWindow,
): Promise<TransportCommandResult> {
  if (connections.has(config.id)) {
    return {
      ok: false,
      events: [],
      error: {
        kind: 'invalid-config',
        message: `Connection already open: ${config.id}`,
        recoverable: true,
      },
    };
  }

  return new Promise<TransportCommandResult>((resolve) => {
    const socket = dgram.createSocket('udp4');
    const conn: ManagedUdp = {
      type: 'udp',
      socket,
      id: config.id,
      config,
      batchBuffer: [],
      batchTimer: null,
    };

    socket.on('message', (msg: Buffer) => {
      if (storageFilter.shouldStore(config.id, msg)) {
        storageFilter.storeData(msg);
        return;
      }
      for (let i = 0; i < msg.length; i++) {
        conn.batchBuffer.push(msg[i] as number);
      }
      scheduleBatchFlush(conn, config.id, win);
    });

    socket.on('error', (err: Error) => {
      emitToRenderer(win, {
        kind: 'error',
        connectionId: config.id,
        occurredAt: now(),
        error: { kind: 'resource-unavailable', message: err.message, recoverable: true },
      });
    });

    socket.on('close', () => {
      cleanupBatchable(conn);
      connections.delete(config.id);
      if (!intentionalDisconnect.has(config.id)) {
        emitToRenderer(win, {
          kind: 'disconnected',
          connectionId: config.id,
          occurredAt: now(),
        });
      }
      intentionalDisconnect.delete(config.id);
    });

    socket.bind(config.localPort, config.localHost, () => {
      connections.set(config.id, conn);

      const connectedEvent: TransportBridgeEvent = {
        kind: 'connected',
        connectionId: config.id,
        occurredAt: now(),
        target: {
          targetId: `udp:${config.localHost}:${config.localPort}`,
          label: `${config.localHost}:${config.localPort}`,
          role: 'udp-remote',
          kind: 'udp',
          routeLabel: `UDP ${config.localHost}:${config.localPort}`,
        },
      };
      resolve({ ok: true, events: [connectedEvent] });
    });
  });
}

// --- Connect dispatcher ---

async function handleNetworkConnect(
  config: TransportConnectConfig,
  win: BrowserWindow,
): Promise<TransportCommandResult> {
  switch (config.kind) {
    case 'serial':
      return {
        ok: false,
        events: [],
        error: {
          kind: 'invalid-config',
          message: 'Serial connections must use serial IPC channel',
          recoverable: false,
        },
      };
    case 'tcp-client':
      return handleTcpClientConnect(config, win);
    case 'tcp-server':
      return handleTcpServerConnect(config, win);
    case 'udp':
      return handleUdpConnect(config, win);
  }
}

// --- Disconnect ---

async function handleNetworkDisconnect(connectionId: string): Promise<TransportCommandResult> {
  const conn = connections.get(connectionId);

  if (!conn) {
    return {
      ok: true,
      events: [{ kind: 'disconnected', connectionId, occurredAt: now() }],
    };
  }

  if (conn.type === 'tcp-server') {
    const events: TransportBridgeEvent[] = [];
    for (const [clientId, client] of conn.clients) {
      intentionalDisconnect.add(clientId);
      cleanupBatchable(client);
      client.socket.destroy();
      connections.delete(clientId);
      events.push({ kind: 'disconnected', connectionId: clientId, occurredAt: now() });
    }
    conn.clients.clear();

    intentionalDisconnect.add(connectionId);
    conn.server.close();
    connections.delete(connectionId);
    events.push({ kind: 'disconnected', connectionId, occurredAt: now() });
    return { ok: true, events };
  }

  if (conn.type === 'tcp-server-client') {
    const server = connections.get(conn.listenerId);
    if (server && server.type === 'tcp-server') {
      server.clients.delete(connectionId);
    }
    intentionalDisconnect.add(connectionId);
    cleanupBatchable(conn);
    conn.socket.destroy();
    connections.delete(connectionId);
    return { ok: true, events: [{ kind: 'disconnected', connectionId, occurredAt: now() }] };
  }

  intentionalDisconnect.add(connectionId);
  cleanupBatchable(conn);
  if (conn.type === 'tcp-client') {
    conn.socket.destroy();
  } else if (conn.type === 'udp') {
    conn.socket.close();
  }
  connections.delete(connectionId);
  return { ok: true, events: [{ kind: 'disconnected', connectionId, occurredAt: now() }] };
}

// --- Write ---

async function handleNetworkWrite(
  connectionId: string,
  bytes: number[],
): Promise<TransportCommandResult> {
  const conn = connections.get(connectionId);

  if (!conn) {
    return {
      ok: false,
      events: [],
      error: {
        kind: 'resource-unavailable',
        message: `Connection is not open: ${connectionId}`,
        recoverable: true,
      },
    };
  }

  if (conn.type === 'tcp-server') {
    return {
      ok: false,
      events: [],
      error: {
        kind: 'invalid-config',
        message: `Cannot write to TCP server listener: ${connectionId}`,
        recoverable: false,
      },
    };
  }

  if (conn.type === 'udp') {
    if (!conn.config.remoteHost || !conn.config.remotePort) {
      return {
        ok: false,
        events: [],
        error: {
          kind: 'invalid-config',
          message: `UDP connection has no remote target configured: ${connectionId}`,
          recoverable: false,
        },
      };
    }
    return new Promise<TransportCommandResult>((resolve) => {
      const buf = Buffer.from(bytes);
      conn.socket.send(buf, conn.config.remotePort, conn.config.remoteHost, (sendErr) => {
        if (sendErr) {
          resolve({
            ok: false,
            events: [],
            error: { kind: 'write-failed', message: sendErr.message, recoverable: true },
          });
          return;
        }
        resolve({ ok: true, events: [] });
      });
    });
  }

  // tcp-client or tcp-server-client
  return new Promise<TransportCommandResult>((resolve) => {
    const buf = Buffer.from(bytes);
    conn.socket.write(buf, (writeErr) => {
      if (writeErr) {
        resolve({
          ok: false,
          events: [],
          error: { kind: 'write-failed', message: writeErr.message, recoverable: true },
        });
        return;
      }
      resolve({ ok: true, events: [] });
    });
  });
}

// --- Cleanup ---

async function handleCleanup(): Promise<TransportCommandResult> {
  const events: TransportBridgeEvent[] = [];
  const ids = Array.from(connections.keys());

  for (const id of ids) {
    const conn = connections.get(id)!;

    if (conn.type === 'tcp-server') {
      for (const [clientId, client] of conn.clients) {
        intentionalDisconnect.add(clientId);
        cleanupBatchable(client);
        try { client.socket.destroy(); } catch { /* ignore */ }
        connections.delete(clientId);
        events.push({ kind: 'disconnected', connectionId: clientId, occurredAt: now() });
      }
      conn.clients.clear();
      intentionalDisconnect.add(id);
      try { conn.server.close(); } catch { /* ignore */ }
    } else if (conn.type === 'tcp-client' || conn.type === 'tcp-server-client') {
      intentionalDisconnect.add(id);
      cleanupBatchable(conn);
      try { conn.socket.destroy(); } catch { /* ignore */ }
    } else if (conn.type === 'udp') {
      intentionalDisconnect.add(id);
      cleanupBatchable(conn);
      try { conn.socket.close(); } catch { /* ignore */ }
    }

    connections.delete(id);
    events.push({ kind: 'disconnected', connectionId: id, occurredAt: now() });
  }

  eventQueue = [];
  return { ok: true, events };
}

// --- Registration ---

export function registerNetworkHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_NETWORK_CONNECT, (_e, config: TransportConnectConfig) =>
    handleNetworkConnect(config, mainWindow),
  );
  ipcMain.handle(IPC_NETWORK_DISCONNECT, (_e, connectionId: string) =>
    handleNetworkDisconnect(connectionId),
  );
  ipcMain.handle(IPC_NETWORK_WRITE, (_e, connectionId: string, bytes: number[]) =>
    handleNetworkWrite(connectionId, bytes),
  );
  ipcMain.handle(IPC_NETWORK_CLEANUP, () => handleCleanup());
}

export function cleanupNetworkHandlers(): void {
  for (const conn of connections.values()) {
    if (conn.type === 'tcp-server') {
      for (const client of conn.clients.values()) {
        cleanupBatchable(client);
        try { client.socket.destroy(); } catch { /* ignore */ }
      }
      try { conn.server.close(); } catch { /* ignore */ }
    } else if (conn.type === 'tcp-client' || conn.type === 'tcp-server-client') {
      cleanupBatchable(conn);
      try { conn.socket.destroy(); } catch { /* ignore */ }
    } else if (conn.type === 'udp') {
      cleanupBatchable(conn);
      try { conn.socket.close(); } catch { /* ignore */ }
    }
  }
  connections = new Map();
  eventQueue = [];
  intentionalDisconnect.clear();
}
